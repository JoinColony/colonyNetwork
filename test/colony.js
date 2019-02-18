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
import { makePayment, setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, setupRandomColony } from "../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const DSToken = artifacts.require("DSToken");
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
    it("should have the network and token set", async () => {
      const network = await colony.getColonyNetwork();
      expect(network).to.equal(colonyNetwork.address);

      const colonyToken = await colony.getToken();
      expect(colonyToken).to.equal(token.address);
    });

    it("should accept ether", async () => {
      await colony.send(1);
      const colonyBalance = await web3GetBalance(colony.address);
      expect(colonyBalance).to.eq.BN(1);
    });

    it("should not have owner", async () => {
      const owner = await colony.owner();
      expect(owner).to.be.equal(ZERO_ADDRESS);
    });

    it("should return zero task count", async () => {
      const taskCount = await colony.getTaskCount();
      expect(taskCount).to.be.zero;
    });

    it("should return zero for taskChangeNonce", async () => {
      const taskChangeNonce = await colony.getTaskChangeNonce(1);
      expect(taskChangeNonce).to.be.zero;
    });

    it("should emit correct Mint event when minting tokens", async () => {
      const tokenArgs = getTokenArgs();
      const otherToken = await DSToken.new(tokenArgs[1]);
      await expectAllEvents(otherToken.mint(100), ["Mint"]);
    });

    it("should fail if a non-admin tries to mint tokens", async () => {
      await checkErrorRevert(colony.mintTokens(100, { from: accounts[3] }), "ds-auth-unauthorized");
    });

    it("should not allow reinitialisation", async () => {
      await checkErrorRevert(colony.initialiseColony(ZERO_ADDRESS, ZERO_ADDRESS), "colony-already-initialised-network");
    });

    it("should correctly generate a rating secret", async () => {
      const ratingSecret1 = await colony.generateSecret(RATING_1_SALT, MANAGER_RATING);
      const ratingSecret2 = await colony.generateSecret(RATING_2_SALT, WORKER_RATING);
      expect(ratingSecret1).to.eq.BN(RATING_1_SECRET);
      expect(ratingSecret2).to.eq.BN(RATING_2_SECRET);
    });

    it("should initialise the root domain", async () => {
      // There should be one domain (the root domain)
      const domainCount = await colony.getDomainCount();
      expect(domainCount).to.eq.BN(1);

      const domain = await colony.getDomain(domainCount);

      // The first pot should have been created and assigned to the domain
      expect(domain.fundingPotId).to.eq.BN(1);

      // A root skill should have been created for the Colony
      const rootLocalSkillId = await colonyNetwork.getSkillCount();
      expect(domain.skillId).to.eq.BN(rootLocalSkillId);
    });

    it("should let funding pot information be read", async () => {
      const paymentId = await makePayment({ colony });
      const paymentInfo = await colony.getTask(paymentId);
      let potInfo = await colony.getFundingPot(paymentInfo.fundingPotId);
      expect(potInfo.associatedType).to.eq.BN(2);
      expect(potInfo.associatedTypeId).to.eq.BN(paymentId);

      // Read pot info about a pot in a domain
      const domainInfo = await colony.getDomain(1);
      potInfo = await colony.getFundingPot(domainInfo.fundingPotId);
      expect(potInfo.associatedType).to.eq.BN(1);
      expect(potInfo.associatedTypeId).to.eq.BN(1);
    });
  });

  describe("when working with permissions", () => {
    it("should allow current founder to transfer role to another address", async () => {
      const founderRole = 0;
      const currentFounder = accounts[0];
      const newFounder = accounts[2];

      let hasRole = await colony.hasUserRole(currentFounder, founderRole);
      expect(hasRole, `${currentFounder} does not have founder role`).to.be.true;

      await colony.setFounderRole(newFounder);

      hasRole = await colony.hasUserRole(newFounder, founderRole);
      expect(hasRole, `Founder role not transfered to ${newFounder}`).to.be.true;
    });

    it("should allow admin to assign colony admin role", async () => {
      const adminRole = 1;

      const user1 = accounts[1];
      const user5 = accounts[5];

      await colony.setAdminRole(user1);

      const functionSig = getFunctionSignature("setAdminRole(address)");
      const canCall = await authority.canCall(user1, colony.address, functionSig);
      expect(canCall, `Address ${user1} can't call 'setAdminRole' function`).to.be.true;

      await colony.setAdminRole(user5, { from: user1 });

      const hasRole = await colony.hasUserRole(user5, adminRole);
      expect(hasRole, `Admin role not assigned to ${user5}`).to.be.true;
    });

    it("should allow founder to remove colony admin role", async () => {
      const adminRole = 1;

      const user1 = accounts[1];

      await colony.setAdminRole(user1);

      let hasRole = await colony.hasUserRole(user1, adminRole);
      expect(hasRole, `Admin role not assigned to ${user1}`).to.be.true;

      await colony.removeAdminRole(user1);

      hasRole = await colony.hasUserRole(user1, adminRole);
      expect(!hasRole, `Admin role not removed from ${user1}`).to.be.true;
    });

    it("should not allow admin to remove admin role", async () => {
      const adminRole = 1;

      const user1 = accounts[1];
      const user2 = accounts[2];

      await colony.setAdminRole(user1);
      await colony.setAdminRole(user2);

      let hasRole = await colony.hasUserRole(user1, adminRole);
      expect(hasRole, `Admin role not assigned to ${user1}`).to.be.true;
      hasRole = await colony.hasUserRole(user2, adminRole);
      expect(hasRole, `Admin role not assigned to ${user2}`).to.be.true;

      await checkErrorRevert(colony.removeAdminRole(user1, { from: user2 }), "ds-auth-unauthorized");

      hasRole = await colony.hasUserRole(user1, adminRole);
      expect(hasRole, `${user1} is removed from admin role from another admin`).to.be.true;
    });

    it("should allow admin to call predetermined functions", async () => {
      const founder = accounts[0];
      const user3 = accounts[3];

      await colony.setAdminRole(user3);

      let functionSig = getFunctionSignature("moveFundsBetweenPots(uint256,uint256,uint256,address)");
      let canCall = await authority.canCall(user3, colony.address, functionSig);
      expect(canCall).to.be.true;

      functionSig = getFunctionSignature("addDomain(uint256)");
      canCall = await authority.canCall(user3, colony.address, functionSig);
      expect(canCall).to.be.true;

      functionSig = getFunctionSignature("makeTask(bytes32,uint256,uint256,uint256)");
      canCall = await authority.canCall(user3, colony.address, functionSig);
      expect(canCall).to.be.true;

      functionSig = getFunctionSignature("startNextRewardPayout(address,bytes,bytes,uint256,bytes32[])");
      canCall = await authority.canCall(user3, colony.address, functionSig);
      expect(canCall).to.be.true;

      functionSig = getFunctionSignature("bootstrapColony(address[],int256[])");
      canCall = await authority.canCall(founder, colony.address, functionSig);
      expect(canCall).to.be.true;
      canCall = await authority.canCall(user3, colony.address, functionSig);
      expect(canCall).to.be.false;

      functionSig = getFunctionSignature("mintTokens(uint256)");
      canCall = await authority.canCall(founder, colony.address, functionSig);
      expect(canCall).to.be.true;
      canCall = await authority.canCall(user3, colony.address, functionSig);
      expect(canCall).to.be.false;
    });
  });

  describe("when adding domains", () => {
    it("should log DomainAdded and FundingPotAdded events", async () => {
      await expectAllEvents(colony.addDomain(1), ["DomainAdded", "FundingPotAdded"]);
    });
  });

  describe("when bootstrapping the colony", () => {
    const INITIAL_REPUTATIONS = [WAD.muln(5), WAD.muln(4), WAD.muln(3), WAD.muln(2)];
    const INITIAL_ADDRESSES = accounts.slice(0, 4);

    it("should assign reputation correctly when bootstrapping the colony", async () => {
      const skillCount = await colonyNetwork.getSkillCount();

      await colony.mintTokens(WAD.muln(14));
      await colony.claimColonyFunds(token.address);
      await colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS);
      const inactiveReputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
      const inactiveReputationMiningCycle = await IReputationMiningCycle.at(inactiveReputationMiningCycleAddress);
      const numberOfReputationLogs = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      expect(numberOfReputationLogs).to.eq.BN(INITIAL_ADDRESSES.length);
      const updateLog = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(0);
      expect(updateLog.user).to.eq.BN(INITIAL_ADDRESSES[0]);
      expect(updateLog.amount).to.eq.BN(INITIAL_REPUTATIONS[0]);
      expect(updateLog.skillId).to.eq.BN(skillCount);
    });

    it("should assign tokens correctly when bootstrapping the colony", async () => {
      await colony.mintTokens(WAD.muln(14));
      await checkErrorRevert(colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS), "colony-bootstrap-not-enough-tokens");

      await colony.claimColonyFunds(token.address);
      const potBalanceBefore = await colony.getFundingPotBalance(1, token.address);
      expect(potBalanceBefore).to.eq.BN(WAD.muln(14));

      await colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS);
      const balance = await token.balanceOf(INITIAL_ADDRESSES[0]);
      expect(balance).to.eq.BN(INITIAL_REPUTATIONS[0]);

      const potBalanceAfter = await colony.getFundingPotBalance(1, token.address);
      expect(potBalanceAfter).to.be.zero;
    });

    it("should be able to bootstrap colony more than once", async () => {
      await colony.mintTokens(WAD.muln(10));
      await colony.claimColonyFunds(token.address);

      await colony.bootstrapColony([INITIAL_ADDRESSES[0]], [INITIAL_REPUTATIONS[0]]);
      await colony.bootstrapColony([INITIAL_ADDRESSES[0]], [INITIAL_REPUTATIONS[0]]);

      const balance = await token.balanceOf(INITIAL_ADDRESSES[0]);
      expect(balance).to.eq.BN(WAD.muln(10));
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
      await checkErrorRevert(colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS), "colony-bootstrap-not-enough-tokens");

      const balance = await token.balanceOf(INITIAL_ADDRESSES[0]);
      expect(balance).to.be.zero;
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
      await makePayment({ colony });
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
