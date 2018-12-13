/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";

import {
  UINT256_MAX,
  MANAGER_RATING,
  WORKER_RATING,
  RATING_1_SALT,
  RATING_2_SALT,
  RATING_1_SECRET,
  RATING_2_SECRET,
  ZERO_ADDRESS,
  WAD
} from "../helpers/constants";
import { getTokenArgs, web3GetBalance, checkErrorRevert, expectAllEvents, getFunctionSignature } from "../helpers/test-helper";
import { makeTask, setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, setupRandomColony } from "../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ERC20ExtendedToken = artifacts.require("ERC20ExtendedToken");
const ColonyAuthority = artifacts.require("ColonyAuthority");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");

contract("Colony", accounts => {
  let colony;
  let token;
  let authority;
  let colonyNetwork;

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    await setupMetaColonyWithLockedCLNYToken(colonyNetwork);
    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));

    const authorityAddress = await colony.authority();
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
      assert.equal(owner, ZERO_ADDRESS);
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
      const otherToken = await ERC20ExtendedToken.new(...tokenArgs);
      await expectAllEvents(otherToken.mint(100), ["Mint", "Transfer"]);
    });

    it("should fail if a non-admin tries to mint tokens", async () => {
      await checkErrorRevert(colony.mintTokens(100, { from: accounts[3] }), "ds-auth-unauthorized");
    });

    it("should not allow reinitialisation", async () => {
      await checkErrorRevert(colony.initialiseColony(ZERO_ADDRESS), "colony-initialise-bad-address");
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
      assert.equal(domain.potId, 1);

      // A root skill should have been created for the Colony
      const rootLocalSkillId = await colonyNetwork.getSkillCount();
      assert.equal(domain.skillId, rootLocalSkillId.toNumber());
    });
  });

  describe("when working with permissions", () => {
    it("should allow current founder to transfer role to another address", async () => {
      const founderRole = 0;
      const currentFounder = accounts[0];
      const newFounder = accounts[2];

      let hasRole = await colony.hasUserRole(currentFounder, founderRole);
      assert.isTrue(hasRole, `${currentFounder} does not have founder role`);

      await colony.setFounderRole(newFounder);

      hasRole = await colony.hasUserRole(newFounder, founderRole);
      assert.isTrue(hasRole, `Founder role not transfered to ${newFounder}`);
    });

    it("should allow admin to assign colony admin role", async () => {
      const adminRole = 1;

      const user1 = accounts[1];
      const user5 = accounts[5];

      await colony.setAdminRole(user1);

      const functionSig = getFunctionSignature("setAdminRole(address)");
      const canCall = await authority.canCall(user1, colony.address, functionSig);
      assert.isTrue(canCall, `Address ${user1} can't call 'setAdminRole' function`);

      await colony.setAdminRole(user5, { from: user1 });

      const hasRole = await colony.hasUserRole(user5, adminRole);
      assert.isTrue(hasRole, `Admin role not assigned to ${user5}`);
    });

    it("should allow founder to remove colony admin role", async () => {
      const adminRole = 1;

      const user1 = accounts[1];

      await colony.setAdminRole(user1);

      let hasRole = await colony.hasUserRole(user1, adminRole);
      assert.isTrue(hasRole, `Admin role not assigned to ${user1}`);

      await colony.removeAdminRole(user1);

      hasRole = await colony.hasUserRole(user1, adminRole);
      assert.isTrue(!hasRole, `Admin role not removed from ${user1}`);
    });

    it("should not allow admin to remove admin role", async () => {
      const adminRole = 1;

      const user1 = accounts[1];
      const user2 = accounts[2];

      await colony.setAdminRole(user1);
      await colony.setAdminRole(user2);

      let hasRole = await colony.hasUserRole(user1, adminRole);
      assert.isTrue(hasRole, `Admin role not assigned to ${user1}`);
      hasRole = await colony.hasUserRole(user2, adminRole);
      assert.isTrue(hasRole, `Admin role not assigned to ${user2}`);

      await checkErrorRevert(colony.removeAdminRole(user1, { from: user2 }), "ds-auth-unauthorized");

      hasRole = await colony.hasUserRole(user1, adminRole);
      assert.isTrue(hasRole, `${user1} is removed from admin role from another admin`);
    });

    it("should allow admin to call predetermined functions", async () => {
      const founder = accounts[0];
      const user3 = accounts[3];

      await colony.setAdminRole(user3);

      let functionSig = getFunctionSignature("moveFundsBetweenPots(uint256,uint256,uint256,address)");
      let canCall = await authority.canCall(user3, colony.address, functionSig);
      assert.isTrue(canCall);

      functionSig = getFunctionSignature("addDomain(uint256)");
      canCall = await authority.canCall(user3, colony.address, functionSig);
      assert.isTrue(canCall);

      functionSig = getFunctionSignature("makeTask(bytes32,uint256,uint256,uint256)");
      canCall = await authority.canCall(user3, colony.address, functionSig);
      assert.isTrue(canCall);

      functionSig = getFunctionSignature("startNextRewardPayout(address,bytes,bytes,uint256,bytes32[])");
      canCall = await authority.canCall(user3, colony.address, functionSig);
      assert.isTrue(canCall);

      functionSig = getFunctionSignature("bootstrapColony(address[],int256[])");
      canCall = await authority.canCall(founder, colony.address, functionSig);
      assert.isTrue(canCall);
      canCall = await authority.canCall(user3, colony.address, functionSig);
      assert.isFalse(canCall);

      functionSig = getFunctionSignature("mintTokens(uint256)");
      canCall = await authority.canCall(founder, colony.address, functionSig);
      assert.isTrue(canCall);
      canCall = await authority.canCall(user3, colony.address, functionSig);
      assert.isFalse(canCall);
    });
  });

  describe("when adding domains", () => {
    it("should log DomainAdded and PotAdded events", async () => {
      await expectAllEvents(colony.addDomain(1), ["DomainAdded", "PotAdded"]);
    });
  });

  describe("when bootstrapping the colony", () => {
    const INITIAL_REPUTATIONS = [WAD.muln(5), WAD.muln(4), WAD.muln(3), WAD.muln(2)];
    const INITIAL_ADDRESSES = accounts.slice(0, 4);

    it("should assign reputation correctly when bootstrapping the colony", async () => {
      const skillCount = await colonyNetwork.getSkillCount();

      await colony.mintTokens(WAD.muln(14));
      await colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS);
      const inactiveReputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
      const inactiveReputationMiningCycle = await IReputationMiningCycle.at(inactiveReputationMiningCycleAddress);
      const numberOfReputationLogs = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      assert.strictEqual(numberOfReputationLogs.toNumber(), INITIAL_ADDRESSES.length);
      const updateLog = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(0);
      assert.strictEqual(updateLog.user, INITIAL_ADDRESSES[0]);
      assert.strictEqual(updateLog.amount, INITIAL_REPUTATIONS[0].toString());
      assert.strictEqual(updateLog.skillId, skillCount.toString());
    });

    it("should assign tokens correctly when bootstrapping the colony", async () => {
      await colony.mintTokens(WAD.muln(14));
      await colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS);

      const balance = await token.balanceOf(INITIAL_ADDRESSES[0]);
      assert.equal(balance.toString(), INITIAL_REPUTATIONS[0]);
    });

    it("should be able to bootstrap colony more than once", async () => {
      await colony.mintTokens(WAD.muln(10));
      await colony.bootstrapColony([INITIAL_ADDRESSES[0]], [INITIAL_REPUTATIONS[0]]);
      await colony.bootstrapColony([INITIAL_ADDRESSES[0]], [INITIAL_REPUTATIONS[0]]);

      const balance = await token.balanceOf(INITIAL_ADDRESSES[0]);
      assert.equal(balance.toString(), WAD.muln(10).toString());
    });

    it("should throw if length of inputs is not equal", async () => {
      await colony.mintTokens(WAD.muln(14));
      await checkErrorRevert(colony.bootstrapColony([INITIAL_ADDRESSES[0]], INITIAL_REPUTATIONS), "colony-bootstrap-bad-inputs");
      await checkErrorRevert(colony.bootstrapColony(INITIAL_ADDRESSES, [INITIAL_REPUTATIONS[0]]), "colony-bootstrap-bad-inputs");
    });

    it("should not allow negative number", async () => {
      await colony.mintTokens(WAD.muln(14));
      await checkErrorRevert(colony.bootstrapColony([INITIAL_ADDRESSES[0]], [WAD.muln(5).neg()]), "colony-bootstrap-bad-amount-input");
    });

    it("should throw if there is not enough funds to send", async () => {
      await colony.mintTokens(WAD.muln(10));
      await checkErrorRevert(colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS), "ds-token-insufficient-balance");

      const balance = await token.balanceOf(INITIAL_ADDRESSES[0]);
      assert.equal(balance.toString(), "0");
    });

    it("should not allow non-creator to bootstrap reputation", async () => {
      await colony.mintTokens(WAD.muln(14));
      await checkErrorRevert(
        colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS, {
          from: accounts[1]
        }),
        "ds-auth-unauthorized"
      );
    });

    it("should not allow bootstrapping if colony is not in bootstrap state", async () => {
      await colony.mintTokens(WAD.muln(14));
      await makeTask({ colony });
      await checkErrorRevert(colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS), "colony-not-in-bootstrap-mode");
    });
  });

  describe("when setting the reward inverse", () => {
    it("should have a default reward inverse set to max uint", async () => {
      const defaultRewardInverse = await colony.getRewardInverse();
      expect(defaultRewardInverse).to.eq.BN(UINT256_MAX);
    });

    it("should allow the colony founder to set it", async () => {
      await colony.setRewardInverse(234);
      const defaultRewardInverse = await colony.getRewardInverse();
      expect(defaultRewardInverse).to.eq.BN(234);
    });

    it("should not allow anyone else but the colony founder to set it", async () => {
      await colony.setRewardInverse(100);
      await checkErrorRevert(colony.setRewardInverse(234, { from: accounts[1] }), "ds-auth-unauthorized");
      const defaultRewardInverse = await colony.getRewardInverse();
      expect(defaultRewardInverse).to.eq.BN(100);
    });

    it("should not allow the amount to be set to zero", async () => {
      await checkErrorRevert(colony.setRewardInverse(0), "colony-reward-inverse-cannot-be-zero");
    });
  });
});
