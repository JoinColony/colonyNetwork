/* globals artifacts */

import { toBN } from "web3-utils";
import { BN } from "bn.js";
import chai from "chai";
import bnChai from "bn-chai";

import { MANAGER_RATING, WORKER_RATING, RATING_1_SALT, RATING_2_SALT, RATING_1_SECRET, RATING_2_SECRET } from "../helpers/constants";
import {
  getTokenArgs,
  web3GetBalance,
  checkErrorRevert,
  expectAllEvents,
  getFunctionSignature,
  forwardTime,
  currentBlockTime
} from "../helpers/test-helper";
import { makeTask } from "../helpers/test-data-generator";

import { setupColonyVersionResolver } from "../helpers/upgradable-contracts";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const Colony = artifacts.require("Colony");
const Resolver = artifacts.require("Resolver");
const EtherRouter = artifacts.require("EtherRouter");
const IColony = artifacts.require("IColony");
const IMetaColony = artifacts.require("IMetaColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const Token = artifacts.require("Token");
const ColonyAuthority = artifacts.require("ColonyAuthority");
const ColonyFunding = artifacts.require("ColonyFunding");
const ColonyTask = artifacts.require("ColonyTask");
const ContractRecovery = artifacts.require("ContractRecovery");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");

contract("Colony", accounts => {
  const OTHER = accounts[3];

  let colony;
  let token;
  let authority;
  let colonyNetwork;
  let metaColony;

  before(async () => {
    const resolverColonyNetworkDeployed = await Resolver.deployed();
    const colonyTemplate = await Colony.new();
    const colonyFunding = await ColonyFunding.new();
    const colonyTask = await ColonyTask.new();
    const resolver = await Resolver.new();
    const contractRecovery = await ContractRecovery.new();
    const etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolverColonyNetworkDeployed.address);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    await setupColonyVersionResolver(colonyTemplate, colonyTask, colonyFunding, contractRecovery, resolver);
    await colonyNetwork.initialise(resolver.address);

    const clnyToken = await Token.new("Colony Network Token", "CLNY", 18);
    await colonyNetwork.createMetaColony(clnyToken.address);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);
    await metaColony.setNetworkFeeInverse(100);

    // Jumping through these hoops to avoid the need to rewire ReputationMiningCycleResolver.
    const deployedColonyNetwork = await IColonyNetwork.at(EtherRouter.address);
    const reputationMiningCycleResolverAddress = await deployedColonyNetwork.getMiningResolver();
    await colonyNetwork.setMiningResolver(reputationMiningCycleResolverAddress);

    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
  });

  beforeEach(async () => {
    const tokenArgs = getTokenArgs();
    token = await Token.new(...tokenArgs);
    const { logs } = await colonyNetwork.createColony(token.address);
    const { colonyAddress } = logs[0].args;
    await token.setOwner(colonyAddress);
    colony = await IColony.at(colonyAddress);
    await colony.setTokenSupplyCeiling(
      toBN(2)
        .pow(toBN(256))
        .subn(1)
        .toString()
    );
    const authorityAddress = await colony.authority.call();
    authority = await ColonyAuthority.at(authorityAddress);
  });

  describe("when initialised", () => {
    it("should accept ether", async () => {
      await colony.send(1);
      const colonyBalance = await web3GetBalance(colony.address);
      assert.equal(colonyBalance, 1);
    });

    it("should not have owner", async () => {
      const owner = await colony.owner();
      assert.equal(owner, "0x0000000000000000000000000000000000000000");
    });

    it("should return zero task count", async () => {
      const taskCount = await colony.getTaskCount();
      assert.equal(taskCount, 0);
    });

    it("should return zero for taskChangeNonce", async () => {
      const taskChangeNonce = await colony.getTaskChangeNonce(1);
      assert.equal(taskChangeNonce, 0);
    });

    it("should emit correct Transfer and Mint events when minting tokens", async () => {
      const tokenArgs = getTokenArgs();
      const otherToken = await Token.new(...tokenArgs);
      await expectAllEvents(otherToken.mint(100), ["Mint", "Transfer"]);
    });

    it("should fail if a non-admin tries to mint tokens", async () => {
      await checkErrorRevert(colony.mintTokens(100, { from: OTHER }));
    });

    it("should not allow reinitialisation", async () => {
      await checkErrorRevert(colony.initialiseColony(0x0), "colony-initialise-bad-address");
    });

    it("should correctly generate a rating secret", async () => {
      const ratingSecret1 = await colony.generateSecret(RATING_1_SALT, MANAGER_RATING);
      assert.equal(ratingSecret1, RATING_1_SECRET);
      const ratingSecret2 = await colony.generateSecret(RATING_2_SALT, WORKER_RATING);
      assert.equal(ratingSecret2, RATING_2_SECRET);
    });

    it("should initialise the root domain", async () => {
      // There should be one domain (the root domain)
      const domainCount = await colony.getDomainCount();
      assert.equal(domainCount, 1);

      const domain = await colony.getDomain(domainCount);

      // The first pot should have been created and assigned to the domain
      assert.equal(domain[1], 1);

      // A root skill should have been created for the Colony
      const rootLocalSkillId = await colonyNetwork.getSkillCount();
      assert.equal(domain[0].toNumber(), rootLocalSkillId.toNumber());
    });
  });

  describe("when working with token supply ceiling", async () => {
    let newColony;
    let newToken;
    beforeEach(async () => {
      const tokenArgs = getTokenArgs();
      newToken = await Token.new(...tokenArgs);
      const { logs } = await colonyNetwork.createColony(newToken.address);
      const { colonyAddress } = logs[0].args;
      await newToken.setOwner(colonyAddress);
      newColony = await IColony.at(colonyAddress);
    });

    it("should set token supply ceiling correctly", async () => {
      await newColony.setTokenSupplyCeiling(100);

      const tokenSupplyCeiling = await newColony.getTokenSupplyCeiling();
      assert.equal(tokenSupplyCeiling.toNumber(), 100);
    });

    it("should not be able to mint any tokens if token supply ceiling is not set", async () => {
      await checkErrorRevert(newColony.mintTokens(1), "token-issuance-amount-exceeds-supply-ceiling");

      const balance = await newToken.balanceOf(newColony.address);
      assert.equal(balance.toNumber(), 0);
    });

    it("should not be able to set supply ceiling less that the current token supply", async () => {
      await newColony.setTokenSupplyCeiling(100);

      await newColony.mintTokens(100);

      await checkErrorRevert(newColony.setTokenSupplyCeiling(50), "token-supply-ceiling-bad-input");
    });

    it("should be able to mint tokens equal to the supply ceiling", async () => {
      await newColony.setTokenSupplyCeiling(100);

      await newColony.mintTokens(100);

      const balance = await newToken.balanceOf(newColony.address);
      assert.equal(balance.toNumber(), 100);
    });

    it("should not be able to mint more tokens than supply ceiling", async () => {
      await newColony.setTokenSupplyCeiling(100);

      await checkErrorRevert(newColony.mintTokens(101), "token-issuance-amount-exceeds-supply-ceiling");

      const balance = await newToken.balanceOf(newColony.address);
      assert.equal(balance.toNumber(), 0);
    });

    it("should not be able to mint more tokens than supply ceiling, when minting by rate", async () => {
      await makeTask({ colony: newColony });
      await newColony.setTokenSupplyCeiling(100);
      await newColony.setTokenIssuanceRate(10);

      await forwardTime(60 * 60 * 24 * 30 * 10, this);

      await newColony.mintTokens(100);

      await forwardTime(60 * 60 * 24 * 3, this);

      await checkErrorRevert(newColony.mintTokens(1), "token-issuance-amount-exceeds-supply-ceiling");

      const balance = await newToken.balanceOf(newColony.address);
      assert.equal(balance.toNumber(), 100);
    });
  });

  describe("when changing issuance rate", async () => {
    it("should not be able to pass 0 value", async () => {
      await checkErrorRevert(colony.setTokenIssuanceRate(0), "token-issuance-rate-bad-inputs");
    });

    it("should not be able to change issuance rate before 4 weeks has passed", async () => {
      const initialRateAmount = 10;
      await colony.setTokenIssuanceRate(initialRateAmount);
      const newRateAmount = 11;
      await checkErrorRevert(colony.setTokenIssuanceRate(newRateAmount), "token-issuance-rate-change-not-allowed");
    });

    it("should be able to initially set any issuance rate", async () => {
      const blockTimestamp = await currentBlockTime();
      const initialRateAmount = 1000;
      await colony.setTokenIssuanceRate(initialRateAmount);

      const { amount, timestamp, totalAmountIssuedUnderRate } = await colony.getTokenIssuanceRate();
      assert.equal(amount.toNumber(), initialRateAmount);
      assert.closeTo(timestamp.toNumber(), blockTimestamp, 10);
      assert.closeTo(totalAmountIssuedUnderRate.toNumber(), blockTimestamp, 10);
    });

    it("should mint remaining available amount when changing rate", async () => {
      await makeTask({ colony });
      const initialRateAmount = 10;
      await colony.setTokenIssuanceRate(initialRateAmount);

      // forward 4 weeks
      await forwardTime(60 * 60 * 24 * 30, this);

      const newRateAmount = 11;
      await colony.setTokenIssuanceRate(newRateAmount);

      await checkErrorRevert(colony.mintTokens(1), "token-issuance-rate-exceeded");
    });

    it("should be able to increase issuance rate by 10 percent", async () => {
      const initialRateAmount = 10;
      await colony.setTokenIssuanceRate(initialRateAmount);

      // forward 4 weeks
      await forwardTime(60 * 60 * 24 * 28, this);

      const newRateAmount = 11;
      await colony.setTokenIssuanceRate(newRateAmount);

      const blockTimestamp = await currentBlockTime();

      const { amount, timestamp, totalAmountIssuedUnderRate } = await colony.getTokenIssuanceRate();
      assert.equal(amount.toNumber(), newRateAmount);
      assert.closeTo(timestamp.toNumber(), blockTimestamp, 10);
      assert.closeTo(totalAmountIssuedUnderRate.toNumber(), blockTimestamp, 10);
    });

    it("should not be able to increase issuance rate by more than 10 percent", async () => {
      const blockTimestamp = await currentBlockTime();
      const initialRateAmount = 10;
      await colony.setTokenIssuanceRate(initialRateAmount);

      // forward 4 weeks
      await forwardTime(60 * 60 * 24 * 28, this);

      // 20 percent more than initial rate
      const newRateAmount = 12;
      await checkErrorRevert(colony.setTokenIssuanceRate(newRateAmount), "token-issuance-rate-change-too-big");

      const { amount, timestamp, totalAmountIssuedUnderRate } = await colony.getTokenIssuanceRate();
      assert.equal(amount.toNumber(), initialRateAmount);
      assert.closeTo(timestamp.toNumber(), blockTimestamp, 10);
      assert.closeTo(totalAmountIssuedUnderRate.toNumber(), blockTimestamp, 10);
    });

    it("should not be able to decrease issuance rate by more than 10 percent", async () => {
      const blockTimestamp = await currentBlockTime();
      const initialRateAmount = 20;
      await colony.setTokenIssuanceRate(initialRateAmount);

      // forward 4 weeks
      await forwardTime(60 * 60 * 24 * 28, this);

      // 20 percent less than initial rate
      const newRateAmount = 16;
      await checkErrorRevert(colony.setTokenIssuanceRate(newRateAmount), "token-issuance-rate-change-too-big");

      const { amount, timestamp, totalAmountIssuedUnderRate } = await colony.getTokenIssuanceRate();
      assert.equal(amount.toNumber(), initialRateAmount);
      assert.closeTo(timestamp.toNumber(), blockTimestamp, 10);
      assert.closeTo(totalAmountIssuedUnderRate.toNumber(), blockTimestamp, 10);
    });

    it("should be able to decrease issuance rate by 10 percent", async () => {
      const initialRateAmount = 20;
      await colony.setTokenIssuanceRate(initialRateAmount);

      // forward 4 weeks
      await forwardTime(60 * 60 * 24 * 28, this);

      const newRateAmount = 18;
      await colony.setTokenIssuanceRate(newRateAmount);

      const blockTimestamp = await currentBlockTime();

      const { amount, timestamp, totalAmountIssuedUnderRate } = await colony.getTokenIssuanceRate();
      assert.equal(amount.toNumber(), newRateAmount);
      assert.closeTo(timestamp.toNumber(), blockTimestamp, 10);
      assert.closeTo(totalAmountIssuedUnderRate.toNumber(), blockTimestamp, 10);
    });

    it("should be able to change extremly high rates", async () => {
      const initialRateAmount = toBN(10)
        .pow(toBN(37))
        .toString();
      await colony.setTokenIssuanceRate(initialRateAmount);

      // forward 4 weeks
      await forwardTime(60 * 60 * 24 * 28, this);

      const newRateAmount = toBN(10)
        .pow(toBN(36))
        .muln(9)
        .toString();
      await colony.setTokenIssuanceRate(newRateAmount);

      const blockTimestamp = await currentBlockTime();

      const { amount, timestamp, totalAmountIssuedUnderRate } = await colony.getTokenIssuanceRate();
      assert.equal(toBN(amount).toString(), newRateAmount);
      assert.closeTo(timestamp.toNumber(), blockTimestamp, 10);
      assert.closeTo(totalAmountIssuedUnderRate.toNumber(), blockTimestamp, 10);
    });
  });

  describe("when minting tokens", async () => {
    beforeEach(async () => {
      await makeTask({ colony });
    });

    it("should return correct amount available for issuance", async () => {
      const initialRateAmount = 10;
      await colony.setTokenIssuanceRate(initialRateAmount);

      // 30 days
      const oneMonth = 60 * 60 * 24 * 30;
      await forwardTime(oneMonth, this);

      const { amount, secondsSinceLastIssuance } = await colony.getAvailableIssuanceAmountAndSeconds();
      assert.equal(amount.toNumber(), 10);
      assert.closeTo(secondsSinceLastIssuance.toNumber(), oneMonth, 10);
    });

    it("should return correct amount issued in seconds", async () => {
      const blockTimestamp = await currentBlockTime();

      const initialRateAmount = 10;
      await colony.setTokenIssuanceRate(initialRateAmount);

      // 15 days
      const halfMonth = 60 * 60 * 24 * 15;
      await forwardTime(halfMonth, this);

      await colony.mintTokens(5);

      const { totalAmountIssuedUnderRate } = await colony.getTokenIssuanceRate();
      assert.closeTo(totalAmountIssuedUnderRate.toNumber(), blockTimestamp + halfMonth, 10);
    });

    it("should be able to mint tokens by rate", async () => {
      const initialRateAmount = 10;
      await colony.setTokenIssuanceRate(initialRateAmount);

      // 3 days
      await forwardTime(60 * 60 * 24 * 3, this);

      await colony.mintTokens(1);
      await checkErrorRevert(colony.mintTokens(1), "token-issuance-rate-exceeded");

      await forwardTime(60 * 60 * 24 * 3, this);

      await colony.mintTokens(1);
      await checkErrorRevert(colony.mintTokens(1), "token-issuance-rate-exceeded");

      await forwardTime(60 * 60 * 24 * 24, this);

      await colony.mintTokens(8);
      await checkErrorRevert(colony.mintTokens(1), "token-issuance-rate-exceeded");

      const balance = await token.balanceOf(colony.address);
      assert.equal(balance.toNumber(), 10);
    });

    it("should be able to mint tokens if rates increase", async () => {
      const initialRateAmount = 10;
      await colony.setTokenIssuanceRate(initialRateAmount);

      // forward 30 days
      await forwardTime(60 * 60 * 24 * 30, this);

      await colony.mintTokens(10);
      await checkErrorRevert(colony.mintTokens(1), "token-issuance-rate-exceeded");

      const newRateAmount = 11;
      await colony.setTokenIssuanceRate(newRateAmount);

      await forwardTime(60 * 60 * 24 * 30, this);

      await colony.mintTokens(newRateAmount);
      await checkErrorRevert(colony.mintTokens(1), "token-issuance-rate-exceeded");

      const balance = await token.balanceOf(colony.address);
      assert.equal(balance.toNumber(), newRateAmount + initialRateAmount);
    });

    it("should be able to mint tokens if rates decrease", async () => {
      const initialRateAmount = 10;
      await colony.setTokenIssuanceRate(initialRateAmount);

      // forward 30 days
      await forwardTime(60 * 60 * 24 * 30, this);

      await colony.mintTokens(10);
      await checkErrorRevert(colony.mintTokens(1), "token-issuance-rate-exceeded");

      const newRateAmount = 11;
      await colony.setTokenIssuanceRate(newRateAmount);

      await forwardTime(60 * 60 * 24 * 30, this);

      await colony.mintTokens(newRateAmount);
      await checkErrorRevert(colony.mintTokens(1), "token-issuance-rate-exceeded");

      const balance = await token.balanceOf(colony.address);
      assert.equal(balance.toNumber(), newRateAmount + initialRateAmount);
    });

    it("should be able to issue tokens with extremly high rates", async () => {
      const initialRateAmount = toBN(2)
        .pow(toBN(128))
        .subn(1);
      await colony.setTokenIssuanceRate(initialRateAmount.toString());

      await forwardTime(60 * 60 * 24 * 30, this);

      await colony.mintTokens(initialRateAmount.toString());
      await checkErrorRevert(colony.mintTokens(initialRateAmount.toString()), "token-issuance-rate-exceeded");

      await forwardTime(60 * 60 * 24 * 30, this);

      await colony.mintTokens(initialRateAmount.toString());
      const balance = await token.balanceOf(colony.address);
      assert.equal(toBN(balance).toString(), initialRateAmount.muln(2).toString());
    });
  });

  describe("when working with permissions", () => {
    it("should allow current owner role to transfer role to another address", async () => {
      const ownerRole = 0;
      const currentOwner = accounts[0];
      const futureOwner = accounts[2];

      let hasRole = await authority.hasUserRole(currentOwner, ownerRole);
      assert(hasRole, `${currentOwner} does not have owner role`);

      await colony.setOwnerRole(futureOwner);

      hasRole = await authority.hasUserRole(futureOwner, ownerRole);
      assert(hasRole, `Ownership not transfered to ${futureOwner}`);
    });

    it("should allow admin to assign colony admin role", async () => {
      const adminRole = 1;

      const user1 = accounts[1];
      const user5 = accounts[5];

      await colony.setAdminRole(user1);

      const functionSig = getFunctionSignature("setAdminRole(address)");
      const canCall = await authority.canCall(user1, colony.address, functionSig);
      assert(canCall, `Address ${user1} can't call 'setAdminRole' function`);

      await colony.setAdminRole(user5, {
        from: user1
      });

      const hasRole = await authority.hasUserRole(user5, adminRole);
      assert(hasRole, `Admin role not assigned to ${user5}`);
    });

    it("should allow owner to remove colony admin role", async () => {
      const adminRole = 1;

      const user1 = accounts[1];

      await colony.setAdminRole(user1);

      let hasRole = await authority.hasUserRole(user1, adminRole);
      assert(hasRole, `Admin role not assigned to ${user1}`);

      await colony.removeAdminRole(user1);

      hasRole = await authority.hasUserRole(user1, adminRole);
      assert(!hasRole, `Admin role not removed from ${user1}`);
    });

    it("should not allow admin to remove admin role", async () => {
      const adminRole = 1;

      const user1 = accounts[1];
      const user2 = accounts[2];

      await colony.setAdminRole(user1);
      await colony.setAdminRole(user2);

      let hasRole = await authority.hasUserRole(user1, adminRole);
      assert(hasRole, `Admin role not assigned to ${user1}`);
      hasRole = await authority.hasUserRole(user2, adminRole);
      assert(hasRole, `Admin role not assigned to ${user2}`);

      await checkErrorRevert(
        colony.removeAdminRole(user1, {
          from: user2
        })
      );

      hasRole = await authority.hasUserRole(user1, adminRole);
      assert(hasRole, `${user1} is removed from admin role from another admin`);
    });

    it("should allow admin to call predetermined functions", async () => {
      const user3 = accounts[3];

      await colony.setAdminRole(user3);

      let functionSig = getFunctionSignature("moveFundsBetweenPots(uint256,uint256,uint256,address)");
      let canCall = await authority.canCall(user3, colony.address, functionSig);
      assert.equal(canCall, true);

      functionSig = getFunctionSignature("addDomain(uint256)");
      canCall = await authority.canCall(user3, colony.address, functionSig);
      assert.equal(canCall, true);

      functionSig = getFunctionSignature("makeTask(bytes32,uint256,uint256,uint256)");
      canCall = await authority.canCall(user3, colony.address, functionSig);
      assert.equal(canCall, true);

      functionSig = getFunctionSignature("startNextRewardPayout(address,bytes,bytes,uint256,bytes32[])");
      canCall = await authority.canCall(user3, colony.address, functionSig);
      assert.equal(canCall, true);

      functionSig = getFunctionSignature("bootstrapColony(address[],uint256[])");
      canCall = await authority.canCall(user3, colony.address, functionSig);
      assert.equal(canCall, false);

      functionSig = getFunctionSignature("mintTokens(uint256)");
      canCall = await authority.canCall(user3, colony.address, functionSig);
      assert.equal(canCall, false);
    });
  });

  describe("when adding domains", () => {
    it("should log DomainAdded and PotAdded events", async () => {
      await expectAllEvents(colony.addDomain(1), ["DomainAdded", "PotAdded"]);
    });
  });

  describe("when bootstrapping the colony", () => {
    const INITIAL_REPUTATIONS = [toBN(5 * 1e18).toString(), toBN(4 * 1e18).toString(), toBN(3 * 1e18).toString(), toBN(2 * 1e18).toString()];
    const INITIAL_ADDRESSES = accounts.slice(0, 4);

    it("should assign reputation correctly when bootstrapping the colony", async () => {
      const skillCount = await colonyNetwork.getSkillCount();

      await colony.mintTokens(toBN(14 * 1e18).toString());
      await colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS);
      const inactiveReputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
      const inactiveReputationMiningCycle = await IReputationMiningCycle.at(inactiveReputationMiningCycleAddress);
      const numberOfReputationLogs = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      assert.equal(numberOfReputationLogs.toNumber(), INITIAL_ADDRESSES.length);
      const updateLog = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(0);
      assert.equal(updateLog[0], INITIAL_ADDRESSES[0]);
      assert.equal(updateLog[1].toString(), INITIAL_REPUTATIONS[0]);
      assert.equal(updateLog[2].toString(), skillCount.toNumber());
    });

    it("should assign tokens correctly when bootstrapping the colony", async () => {
      await colony.mintTokens(toBN(14 * 1e18).toString());
      await colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS);

      const balance = await token.balanceOf(INITIAL_ADDRESSES[0]);
      assert.equal(balance.toString(), INITIAL_REPUTATIONS[0]);
    });

    it("should be able to bootstrap colony more than once", async () => {
      const amount = toBN(10 * 1e18).toString();
      await colony.mintTokens(amount);
      await colony.bootstrapColony([INITIAL_ADDRESSES[0]], [INITIAL_REPUTATIONS[0]]);
      await colony.bootstrapColony([INITIAL_ADDRESSES[0]], [INITIAL_REPUTATIONS[0]]);

      const balance = await token.balanceOf(INITIAL_ADDRESSES[0]);
      assert.equal(balance.toString(), amount);
    });

    it("should throw if length of inputs is not equal", async () => {
      await colony.mintTokens(toBN(14 * 1e18).toString());
      await checkErrorRevert(colony.bootstrapColony([INITIAL_ADDRESSES[0]], INITIAL_REPUTATIONS), "colony-bootstrap-bad-inputs");
      await checkErrorRevert(colony.bootstrapColony(INITIAL_ADDRESSES, [INITIAL_REPUTATIONS[0]]), "colony-bootstrap-bad-inputs");
    });

    it("should not allow negative number", async () => {
      await colony.mintTokens(toBN(14 * 1e18).toString());
      await checkErrorRevert(
        colony.bootstrapColony(
          [INITIAL_ADDRESSES[0]],
          [
            toBN(5 * 1e18)
              .neg()
              .toString()
          ]
        ),
        "colony-bootstrap-bad-amount-input"
      );
    });

    it("should throw if there is not enough funds to send", async () => {
      await colony.mintTokens(toBN(10 * 1e18).toString());
      await checkErrorRevert(colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS));

      const balance = await token.balanceOf(INITIAL_ADDRESSES[0]);
      assert.equal(balance.toString(), "0");
    });

    it("should not allow non-creator to bootstrap reputation", async () => {
      await colony.mintTokens(toBN(14 * 1e18).toString());
      await checkErrorRevert(
        colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS, {
          from: accounts[1]
        })
      );
    });

    it("should not allow bootstrapping if colony is not in bootstrap state", async () => {
      await colony.mintTokens(toBN(14 * 1e18).toString());
      await makeTask({ colony });
      await checkErrorRevert(colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS), "colony-not-in-bootstrap-mode");
    });
  });

  describe("when setting the reward inverse", () => {
    it("should have a default reward inverse set to max uint", async () => {
      const defaultRewardInverse = await colony.getRewardInverse();
      const maxUIntNumber = new BN(2).pow(new BN(256)).sub(new BN(1));
      expect(defaultRewardInverse).to.eq.BN(maxUIntNumber);
    });

    it("should allow the colony owner to set it", async () => {
      await colony.setRewardInverse(234);
      const defaultRewardInverse = await colony.getRewardInverse();
      expect(defaultRewardInverse).to.eq.BN(234);
    });

    it("should not allow anyone else but the colony owner to set it", async () => {
      await colony.setRewardInverse(100);
      await checkErrorRevert(colony.setRewardInverse(234, { from: accounts[1] }));
      const defaultRewardInverse = await colony.getRewardInverse();
      expect(defaultRewardInverse).to.eq.BN(100);
    });

    it("should not allow the amount to be set to zero", async () => {
      await checkErrorRevert(colony.setRewardInverse(0), "colony-reward-inverse-cannot-be-zero");
    });
  });
});
