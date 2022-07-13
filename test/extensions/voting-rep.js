/* globals artifacts */

import BN from "bn.js";
import chai from "chai";
import bnChai from "bn-chai";
import shortid from "shortid";
import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";
import path from "path";
import { TruffleLoader } from "../../packages/package-utils"; // eslint-disable-line import/no-unresolved
import MetatransactionBroadcaster from "../../packages/metatransaction-broadcaster/MetatransactionBroadcaster";

import { UINT256_MAX, WAD, MINING_CYCLE_DURATION, SECONDS_PER_DAY, CHALLENGE_RESPONSE_WINDOW_DURATION } from "../../helpers/constants";

import {
  checkErrorRevert,
  web3GetCode,
  makeReputationKey,
  makeReputationValue,
  getActiveRepCycle,
  forwardTime,
  encodeTxData,
  bn2bytes32,
  expectEvent,
} from "../../helpers/test-helper";

import { setupRandomColony, getMetaTransactionParameters } from "../../helpers/test-data-generator";

import PatriciaTree from "../../packages/reputation-miner/patricia";

const ganacheAccounts = require("../../ganache-accounts.json");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const IMetaColony = artifacts.require("IMetaColony");
const EtherRouter = artifacts.require("EtherRouter");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const TokenLocking = artifacts.require("TokenLocking");
const VotingReputation = artifacts.require("VotingReputation");
const OneTxPayment = artifacts.require("OneTxPayment");

const VOTING_REPUTATION = soliditySha3("VotingReputation");

contract("Voting Reputation", (accounts) => {
  let colony;
  let token;
  let domain1;
  let domain2;
  let domain3;
  let metaColony;
  let colonyNetwork;
  let tokenLocking;

  let voting;
  let version;

  let reputationTree;

  let domain1Key;
  let domain1Value;
  let domain1Mask;
  let domain1Siblings;

  let user0Key;
  let user0Value;
  let user0Mask;
  let user0Siblings;

  let user1Key;
  let user1Value;
  let user1Mask;
  let user1Siblings;

  const TOTAL_STAKE_FRACTION = WAD.divn(1000); // 0.1 %
  const USER_MIN_STAKE_FRACTION = WAD.divn(10); // 10 %

  const MAX_VOTE_FRACTION = WAD.divn(10).muln(8); // 80 %
  const VOTER_REWARD_FRACTION = WAD.divn(10); // 10 %

  const STAKE_PERIOD = SECONDS_PER_DAY * 3;
  const SUBMIT_PERIOD = SECONDS_PER_DAY * 2;
  const REVEAL_PERIOD = SECONDS_PER_DAY * 2;
  const ESCALATION_PERIOD = SECONDS_PER_DAY;
  const FAIL_EXECUTION_TIMEOUT_PERIOD = SECONDS_PER_DAY * 7;

  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const USER2 = accounts[2];
  const MINER = accounts[5];

  const SALT = soliditySha3({ type: "string", value: shortid.generate() });
  const FAKE = soliditySha3({ type: "string", value: shortid.generate() });

  const NAY = 0;
  const YAY = 1;

  // const NULL = 0;
  const STAKING = 1;
  const SUBMIT = 2;
  // const REVEAL = 3;
  // const CLOSED = 4;
  const EXECUTABLE = 5;
  // const EXECUTED = 6;
  const FAILED = 7;

  const ADDRESS_ZERO = ethers.constants.AddressZero;
  const REQUIRED_STAKE = WAD.muln(3).divn(1000);
  const REQUIRED_STAKE_DOMAIN_2 = WAD.divn(1000);
  const WAD32 = bn2bytes32(WAD);
  const HALF = WAD.divn(2);
  const YEAR = SECONDS_PER_DAY * 365;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);

    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await TokenLocking.at(tokenLockingAddress);

    const extension = await VotingReputation.new();
    version = await extension.version();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));

    // 1 => { 2, 3 }
    await colony.addDomain(1, UINT256_MAX, 1);
    await colony.addDomain(1, UINT256_MAX, 1);
    domain1 = await colony.getDomain(1);
    domain2 = await colony.getDomain(2);
    domain3 = await colony.getDomain(3);

    await colony.installExtension(VOTING_REPUTATION, version);
    const votingAddress = await colonyNetwork.getExtensionInstallation(VOTING_REPUTATION, colony.address);
    voting = await VotingReputation.at(votingAddress);

    await voting.initialise(
      TOTAL_STAKE_FRACTION,
      VOTER_REWARD_FRACTION,
      USER_MIN_STAKE_FRACTION,
      MAX_VOTE_FRACTION,
      STAKE_PERIOD,
      SUBMIT_PERIOD,
      REVEAL_PERIOD,
      ESCALATION_PERIOD
    );

    await colony.setRootRole(voting.address, true);
    await colony.setArbitrationRole(1, UINT256_MAX, voting.address, 1, true);
    await colony.setAdministrationRole(1, UINT256_MAX, voting.address, 1, true);

    await token.mint(USER0, WAD);
    await token.mint(USER1, WAD);
    await token.mint(USER2, WAD);
    await token.approve(tokenLocking.address, WAD, { from: USER0 });
    await token.approve(tokenLocking.address, WAD, { from: USER1 });
    await token.approve(tokenLocking.address, WAD, { from: USER2 });
    await tokenLocking.methods["deposit(address,uint256,bool)"](token.address, WAD, true, { from: USER0 });
    await tokenLocking.methods["deposit(address,uint256,bool)"](token.address, WAD, true, { from: USER1 });
    await tokenLocking.methods["deposit(address,uint256,bool)"](token.address, WAD, true, { from: USER2 });
    await colony.approveStake(voting.address, 1, WAD, { from: USER0 });
    await colony.approveStake(voting.address, 1, WAD, { from: USER1 });
    await colony.approveStake(voting.address, 1, WAD, { from: USER2 });

    reputationTree = new PatriciaTree();
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId), // Colony total
      makeReputationValue(WAD.muln(3), 1)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId, USER0), // User0
      makeReputationValue(WAD, 2)
    );
    await reputationTree.insert(
      makeReputationKey(metaColony.address, domain1.skillId, USER0), // Wrong colony
      makeReputationValue(WAD, 3)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, 1234, USER0), // Wrong skill
      makeReputationValue(WAD, 4)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId, USER1), // User1 (and 2x value)
      makeReputationValue(WAD.muln(2), 5)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain2.skillId), // Colony total, domain 2
      makeReputationValue(WAD, 6)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain3.skillId), // Colony total, domain 3
      makeReputationValue(WAD.muln(3), 7)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId, USER2), // User2, very little rep
      makeReputationValue(REQUIRED_STAKE.subn(1), 8)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain2.skillId, USER0), // User0, domain 2
      makeReputationValue(WAD.divn(3), 9)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain2.skillId, USER1), // User1, domain 2
      makeReputationValue(WAD.divn(3).muln(2), 10)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain3.skillId, USER0), // User0, domain 3
      makeReputationValue(WAD, 11)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain3.skillId, USER1), // User1, domain 3
      makeReputationValue(WAD.muln(2), 12)
    );

    domain1Key = makeReputationKey(colony.address, domain1.skillId);
    domain1Value = makeReputationValue(WAD.muln(3), 1);
    [domain1Mask, domain1Siblings] = await reputationTree.getProof(domain1Key);

    user0Key = makeReputationKey(colony.address, domain1.skillId, USER0);
    user0Value = makeReputationValue(WAD, 2);
    [user0Mask, user0Siblings] = await reputationTree.getProof(user0Key);

    user1Key = makeReputationKey(colony.address, domain1.skillId, USER1);
    user1Value = makeReputationValue(WAD.muln(2), 5);
    [user1Mask, user1Siblings] = await reputationTree.getProof(user1Key);

    const rootHash = await reputationTree.getRootHash();
    const repCycle = await getActiveRepCycle(colonyNetwork);
    await forwardTime(MINING_CYCLE_DURATION, this);
    await repCycle.submitRootHash(rootHash, 0, "0x00", 10, { from: MINER });
    await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
    await repCycle.confirmNewHash(0, { from: MINER });
  });

  function hashExpenditureSlot(action) {
    const preamble = 2 + 8 + 64 * 2;
    return soliditySha3(`0x${action.slice(preamble, preamble + 64 * 4)}${"0".repeat(64)}${action.slice(preamble + 64 * 5, action.length)}`);
  }

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      voting = await VotingReputation.new();
      await voting.install(colony.address);

      await checkErrorRevert(voting.install(colony.address), "extension-already-installed");

      const identifier = await voting.identifier();
      expect(identifier).to.equal(VOTING_REPUTATION);

      const capabilityRoles = await voting.getCapabilityRoles("0x0");
      expect(capabilityRoles).to.equal(ethers.constants.HashZero);

      await voting.finishUpgrade();
      await voting.deprecate(true);
      await voting.uninstall();

      const code = await web3GetCode(voting.address);
      expect(code).to.equal("0x");
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(VOTING_REPUTATION, version, { from: USER0 });

      await checkErrorRevert(colony.installExtension(VOTING_REPUTATION, version, { from: USER0 }), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(VOTING_REPUTATION, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(VOTING_REPUTATION, { from: USER0 });
    });

    it("can deprecate the extension if root", async () => {
      let deprecated = await voting.getDeprecated();
      expect(deprecated).to.equal(false);

      await checkErrorRevert(colony.deprecateExtension(VOTING_REPUTATION, true, { from: USER2 }), "ds-auth-unauthorized");
      await colony.deprecateExtension(VOTING_REPUTATION, true);

      // Can't make new motions!
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await checkErrorRevert(
        voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings),
        "colony-extension-deprecated"
      );

      deprecated = await voting.getDeprecated();
      expect(deprecated).to.equal(true);
    });

    it("cannot initialise twice or more if not root", async () => {
      await checkErrorRevert(voting.initialise(HALF, HALF, WAD, WAD, YEAR, YEAR, YEAR, YEAR), "voting-rep-already-initialised");
      await checkErrorRevert(voting.initialise(HALF, HALF, WAD, WAD, YEAR, YEAR, YEAR, YEAR, { from: USER2 }), "voting-rep-caller-not-root");
    });

    it("cannot initialise with invalid values", async () => {
      voting = await VotingReputation.new();
      await voting.install(colony.address);

      await checkErrorRevert(voting.initialise(HALF.addn(1), HALF, WAD, WAD, YEAR, YEAR, YEAR, YEAR), "voting-rep-greater-than-half-wad");
      await checkErrorRevert(voting.initialise(HALF, HALF.addn(1), WAD, WAD, YEAR, YEAR, YEAR, YEAR), "voting-rep-greater-than-half-wad");
      await checkErrorRevert(voting.initialise(HALF, HALF, WAD.addn(1), WAD, YEAR, YEAR, YEAR, YEAR), "voting-rep-greater-than-wad");
      await checkErrorRevert(voting.initialise(HALF, HALF, WAD, WAD.addn(1), YEAR, YEAR, YEAR, YEAR), "voting-rep-greater-than-wad");
      await checkErrorRevert(voting.initialise(HALF, HALF, WAD, WAD, YEAR + 1, YEAR, YEAR, YEAR), "voting-rep-period-too-long");
      await checkErrorRevert(voting.initialise(HALF, HALF, WAD, WAD, YEAR, YEAR + 1, YEAR, YEAR), "voting-rep-period-too-long");
      await checkErrorRevert(voting.initialise(HALF, HALF, WAD, WAD, YEAR, YEAR, YEAR + 1, YEAR), "voting-rep-period-too-long");
      await checkErrorRevert(voting.initialise(HALF, HALF, WAD, WAD, YEAR, YEAR, YEAR, YEAR + 1), "voting-rep-period-too-long");
    });

    it("can initialised with valid values and emit expected event", async () => {
      voting = await VotingReputation.new();
      await voting.install(colony.address);

      await expectEvent(voting.initialise(HALF, HALF, WAD, WAD, YEAR, YEAR, YEAR, YEAR), "ExtensionInitialised", []);
    });

    it("can query for initialisation values", async () => {
      const totalStakeFraction = await voting.getTotalStakeFraction();
      const voterRewardFraction = await voting.getVoterRewardFraction();
      const userMinStakeFraction = await voting.getUserMinStakeFraction();
      const maxVoteFraction = await voting.getMaxVoteFraction();
      const stakePeriod = await voting.getStakePeriod();
      const submitPeriod = await voting.getSubmitPeriod();
      const revealPeriod = await voting.getRevealPeriod();
      const escalationPeriod = await voting.getEscalationPeriod();

      expect(totalStakeFraction).to.eq.BN(TOTAL_STAKE_FRACTION);
      expect(voterRewardFraction).to.eq.BN(VOTER_REWARD_FRACTION);
      expect(userMinStakeFraction).to.eq.BN(USER_MIN_STAKE_FRACTION);
      expect(maxVoteFraction).to.eq.BN(MAX_VOTE_FRACTION);
      expect(stakePeriod).to.eq.BN(STAKE_PERIOD);
      expect(submitPeriod).to.eq.BN(SUBMIT_PERIOD);
      expect(revealPeriod).to.eq.BN(REVEAL_PERIOD);
      expect(escalationPeriod).to.eq.BN(ESCALATION_PERIOD);
    });
  });

  describe("creating motions", async () => {
    it("can create a root motion", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);

      const motionId = await voting.getMotionCount();
      const motion = await voting.getMotion(motionId);
      expect(motion.skillId).to.eq.BN(domain1.skillId);
    });

    it("can create a root motion via metatransaction", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      const txData = await voting.contract.methods
        .createMotion(1, UINT256_MAX.toString(), ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings)
        .encodeABI();

      const { r, s, v } = await getMetaTransactionParameters(txData, USER2, voting.address);

      await voting.executeMetaTransaction(USER2, txData, r, s, v, { from: USER1 });

      const motionId = await voting.getMotionCount();
      const motion = await voting.getMotion(motionId);
      expect(motion.skillId).to.eq.BN(domain1.skillId);
    });

    it("can create a domain motion in the root domain", async () => {
      // Create motion in domain of action (1)
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);

      const motionId = await voting.getMotionCount();
      const motion = await voting.getMotion(motionId);
      expect(motion.skillId).to.eq.BN(domain1.skillId);
    });

    it("cannot create a domain motion in the root domain with an invalid reputation proof", async () => {
      // Create motion in domain of action (1)
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await checkErrorRevert(
        voting.createMotion(1, 0, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings),
        "voting-rep-invalid-domain-id"
      );
    });

    it("can create a domain motion in a child domain", async () => {
      const key = makeReputationKey(colony.address, domain2.skillId);
      const value = makeReputationValue(WAD, 6);
      const [mask, siblings] = await reputationTree.getProof(key);

      // Create motion in domain of action (2)
      const action = await encodeTxData(colony, "makeTask", [1, 0, FAKE, 2, 0, 0]);
      await voting.createMotion(2, UINT256_MAX, ADDRESS_ZERO, action, key, value, mask, siblings);

      const motionId = await voting.getMotionCount();
      const motion = await voting.getMotion(motionId);
      expect(motion.skillId).to.eq.BN(domain2.skillId);
    });

    it("can externally escalate a domain motion", async () => {
      // Create motion in parent domain (1) of action (2)
      const action = await encodeTxData(colony, "makeTask", [1, 0, FAKE, 2, 0, 0]);
      await voting.createMotion(1, 0, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);

      const motionId = await voting.getMotionCount();
      const motion = await voting.getMotion(motionId);
      expect(motion.skillId).to.eq.BN(domain1.skillId);
    });

    it("can create a root motion with an alternative target", async () => {
      const { colony: otherColony } = await setupRandomColony(colonyNetwork);

      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await voting.createMotion(1, UINT256_MAX, otherColony.address, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
    });

    it("can create a domain motion with an alternative target", async () => {
      const oneTxPayment = await OneTxPayment.new();
      await oneTxPayment.install(colony.address);

      const action = await encodeTxData(oneTxPayment, "makePaymentFundedFromDomain", [1, 0, 1, 0, [USER0], [token.address], [10], 2, 0]);
      await voting.createMotion(1, 0, oneTxPayment.address, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);

      const motionId = await voting.getMotionCount();
      const motion = await voting.getMotion(motionId);
      expect(motion.skillId).to.eq.BN(domain1.skillId);
    });

    it("cannot create a motion with the colony as the alternative target", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);

      await checkErrorRevert(
        voting.createMotion(1, UINT256_MAX, colony.address, action, domain1Key, domain1Value, domain1Mask, domain1Siblings),
        "voting-rep-alt-target-cannot-be-base-colony"
      );
    });

    it("cannot create a domain motion with an action in a higher domain", async () => {
      const key = makeReputationKey(colony.address, domain2.skillId);
      const value = makeReputationValue(WAD, 6);
      const [mask, siblings] = await reputationTree.getProof(key);

      // Action in domain 1, motion in domain 2
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);

      await checkErrorRevert(voting.createMotion(2, UINT256_MAX, ADDRESS_ZERO, action, key, value, mask, siblings), "voting-rep-invalid-domain-id");
    });

    it("cannot create a domain motion with an alternative target with an action in a higher domain", async () => {
      const key = makeReputationKey(colony.address, domain2.skillId);
      const value = makeReputationValue(WAD, 6);
      const [mask, siblings] = await reputationTree.getProof(key);

      const oneTxPayment = await OneTxPayment.new();
      await oneTxPayment.install(colony.address);

      // Action in domain 1, motion in domain 2
      const args = [1, UINT256_MAX, 1, UINT256_MAX, [USER0], [token.address], [10], 1, 0];
      const action = await encodeTxData(oneTxPayment, "makePaymentFundedFromDomain", args);

      await checkErrorRevert(
        voting.createMotion(2, UINT256_MAX, oneTxPayment.address, action, key, value, mask, siblings),
        "voting-rep-invalid-domain-id"
      );
    });

    it("cannot externally escalate a domain motion with an invalid domain proof", async () => {
      const key = makeReputationKey(colony.address, domain3.skillId);
      const value = makeReputationValue(WAD.muln(3), 7);
      const [mask, siblings] = await reputationTree.getProof(key);

      // Provide proof for (3) instead of (2)
      const action = await encodeTxData(colony, "makeTask", [1, 0, FAKE, 2, 0, 0]);
      await checkErrorRevert(voting.createMotion(1, 1, ADDRESS_ZERO, action, key, value, mask, siblings), "voting-rep-invalid-domain-id");
    });

    it("can create a motion using the deprecated interfaces", async () => {
      const rootAction = await encodeTxData(colony, "mintTokens", [WAD]);
      const domainAction = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);

      await voting.createRootMotion(ADDRESS_ZERO, rootAction, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      await voting.createDomainMotion(1, UINT256_MAX, domainAction, domain1Key, domain1Value, domain1Mask, domain1Siblings);
    });

    it("when creating a motion for moveFundsBetweenPots, permissions are correctly respected", async () => {
      // Move funds between domain 2 and domain 3 pots using the old deprecated function
      // This should not be allowed - it doesn't conform to the standard permission proofs, and so can't
      // be checked
      let action = await encodeTxData(colony, "moveFundsBetweenPots", [1, 0, 1, domain2.fundingPotId, domain3.fundingPotId, WAD, token.address]);
      const key = makeReputationKey(colony.address, domain2.skillId);
      const value = makeReputationValue(WAD, 6);
      const [mask, siblings] = await reputationTree.getProof(key);
      checkErrorRevert(voting.createMotion(2, UINT256_MAX, ADDRESS_ZERO, action, key, value, mask, siblings), "voting-rep-disallowed-function");

      // Now we make an action with the new moveFundsBetweenPots
      action = await encodeTxData(colony, "moveFundsBetweenPots", [
        1,
        UINT256_MAX,
        1,
        0,
        1,
        domain2.fundingPotId,
        domain3.fundingPotId,
        WAD,
        token.address,
      ]);

      // This is not allowed to be created in domain 2
      await checkErrorRevert(voting.createMotion(2, UINT256_MAX, ADDRESS_ZERO, action, key, value, mask, siblings), "voting-rep-invalid-domain-id");

      // But is in the root domain
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
    });
  });

  describe("staking on motions", async () => {
    let motionId;

    beforeEach(async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();
    });

    it("can stake on a motion", async () => {
      const half = REQUIRED_STAKE.divn(2);

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, half, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, half, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      const motion = await voting.getMotion(motionId);
      expect(motion.stakes[0]).to.be.zero;
      expect(motion.stakes[1]).to.eq.BN(REQUIRED_STAKE);

      const stake0 = await voting.getStake(motionId, USER0, YAY);
      const stake1 = await voting.getStake(motionId, USER1, YAY);
      expect(stake0).to.eq.BN(half);
      expect(stake1).to.eq.BN(half);
    });

    it("can update the motion states correctly", async () => {
      let motionState = await voting.getMotionState(motionId);
      expect(motionState).to.eq.BN(STAKING);

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      motionState = await voting.getMotionState(motionId);
      expect(motionState).to.eq.BN(STAKING);

      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      motionState = await voting.getMotionState(motionId);
      expect(motionState).to.eq.BN(SUBMIT);
    });

    it("can stake even with a locked token", async () => {
      await token.mint(colony.address, WAD);
      await colony.setRewardInverse(100);
      await colony.claimColonyFunds(token.address);
      await colony.startNextRewardPayout(token.address, domain1Key, domain1Value, domain1Mask, domain1Siblings);

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      const lock = await tokenLocking.getUserLock(token.address, voting.address);
      expect(lock.balance).to.eq.BN(REQUIRED_STAKE.muln(2));
    });

    it("cannot stake on a non-existent motion", async () => {
      await checkErrorRevert(
        voting.stakeMotion(0, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-motion-not-staking"
      );
    });

    it("cannot stake 0", async () => {
      await checkErrorRevert(
        voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, 0, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-bad-amount"
      );
    });

    it("cannot stake a nonexistent side", async () => {
      await checkErrorRevert(
        voting.stakeMotion(motionId, 1, UINT256_MAX, 2, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-bad-vote"
      );
    });

    it("cannot stake less than the minStake, unless there is less than minStake to go", async () => {
      const minStake = REQUIRED_STAKE.divn(10);

      await checkErrorRevert(
        voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, minStake.subn(1), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-insufficient-stake"
      );

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, minStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      // Unless there's less than the minStake to go!

      const stake = REQUIRED_STAKE.sub(minStake.muln(2)).addn(1);
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, stake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, minStake.subn(1), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
    });

    it("can update the expenditure globalClaimDelay if voting on expenditure state", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1);
      const expenditureId = await colony.getExpenditureCount();
      await colony.finalizeExpenditure(expenditureId);

      // Set finalizedTimestamp to WAD
      const action = await encodeTxData(colony, "setExpenditureState", [1, UINT256_MAX, expenditureId, 25, [true], [bn2bytes32(new BN(3))], WAD32]);

      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      let expenditureMotionCount;
      expenditureMotionCount = await voting.getExpenditureMotionCount(soliditySha3(expenditureId));
      expect(expenditureMotionCount).to.be.zero;

      let expenditure;
      expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.globalClaimDelay).to.be.zero;

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      expenditureMotionCount = await voting.getExpenditureMotionCount(soliditySha3(expenditureId));
      expect(expenditureMotionCount).to.eq.BN(1);

      expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.globalClaimDelay).to.eq.BN(UINT256_MAX.divn(3));

      await checkErrorRevert(colony.claimExpenditurePayout(expenditureId, 0, token.address), "colony-expenditure-cannot-claim");
    });

    it("does not update the expenditure globalClaimDelay if the target is another colony", async () => {
      const { colony: otherColony } = await setupRandomColony(colonyNetwork);
      await otherColony.makeExpenditure(1, UINT256_MAX, 1);
      const expenditureId = await otherColony.getExpenditureCount();
      await otherColony.finalizeExpenditure(expenditureId);

      // Set finalizedTimestamp to WAD
      const action = await encodeTxData(otherColony, "setExpenditureState", [
        1,
        UINT256_MAX,
        expenditureId,
        25,
        [true],
        [bn2bytes32(new BN(3))],
        WAD32,
      ]);

      await voting.createMotion(1, UINT256_MAX, otherColony.address, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      const expenditureMotionCount = await voting.getExpenditureMotionCount(soliditySha3(expenditureId));
      expect(expenditureMotionCount).to.be.zero;

      const expenditure = await otherColony.getExpenditure(expenditureId);
      expect(expenditure.globalClaimDelay).to.be.zero;
    });

    it("can update the expenditure slot claimDelay if voting on expenditure slot state", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1);
      const expenditureId = await colony.getExpenditureCount();
      await colony.finalizeExpenditure(expenditureId);

      // Set payoutModifier to 1 for expenditure slot 0
      const action = await encodeTxData(colony, "setExpenditureState", [
        1,
        UINT256_MAX,
        expenditureId,
        26,
        [false, true],
        ["0x0", bn2bytes32(new BN(2))],
        WAD32,
      ]);

      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      let expenditureMotionCount;
      expenditureMotionCount = await voting.getExpenditureMotionCount(soliditySha3(expenditureId, 0));
      expect(expenditureMotionCount).to.be.zero;

      let expenditureSlot;
      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.be.zero;

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      expenditureMotionCount = await voting.getExpenditureMotionCount(soliditySha3(expenditureId, 0));
      expect(expenditureMotionCount).to.eq.BN(1);

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.eq.BN(UINT256_MAX.divn(3));

      await checkErrorRevert(colony.claimExpenditurePayout(expenditureId, 0, token.address), "colony-expenditure-cannot-claim");
    });

    it("can update the expenditure slot claimDelay if voting on expenditure payout state", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1);
      const expenditureId = await colony.getExpenditureCount();
      await colony.finalizeExpenditure(expenditureId);

      // Set payout to WAD for expenditure slot 0, internal token
      const action = await encodeTxData(colony, "setExpenditureState", [
        1,
        UINT256_MAX,
        expenditureId,
        27,
        [false, false],
        ["0x0", bn2bytes32(new BN(token.address.slice(2), 16))],
        WAD32,
      ]);

      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      let expenditureMotionCount;
      expenditureMotionCount = await voting.getExpenditureMotionCount(soliditySha3(expenditureId, 0));
      expect(expenditureMotionCount).to.be.zero;

      let expenditureSlot;
      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.be.zero;

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      expenditureMotionCount = await voting.getExpenditureMotionCount(soliditySha3(expenditureId, 0));
      expect(expenditureMotionCount).to.eq.BN(1);

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.eq.BN(UINT256_MAX.divn(3));

      await checkErrorRevert(colony.claimExpenditurePayout(expenditureId, 0, token.address), "colony-expenditure-cannot-claim");
    });

    it("can update the expenditure slot claimDelay if voting on multiple expenditure states", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1);
      const expenditureId = await colony.getExpenditureCount();
      await colony.finalizeExpenditure(expenditureId);

      let action;

      // Motion 1
      // Set finalizedTimestamp to WAD
      action = await encodeTxData(colony, "setExpenditureState", [1, UINT256_MAX, expenditureId, 25, [true], [bn2bytes32(new BN(3))], WAD32]);

      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      // Motion 2
      // Set payoutModifier to 1 for expenditure slot 0
      action = await encodeTxData(colony, "setExpenditureState", [
        1,
        UINT256_MAX,
        expenditureId,
        26,
        [false, true],
        ["0x0", bn2bytes32(new BN(2))],
        WAD32,
      ]);

      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      // Motion 2
      // Set payout to WAD for expenditure slot 0, internal token
      action = await encodeTxData(colony, "setExpenditureState", [
        1,
        UINT256_MAX,
        expenditureId,
        27,
        [false, false],
        ["0x0", bn2bytes32(new BN(token.address.slice(2), 16))],
        WAD32,
      ]);

      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      const expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.globalClaimDelay).to.eq.BN(UINT256_MAX.divn(3));

      const expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.eq.BN(UINT256_MAX.divn(3));

      await checkErrorRevert(colony.claimExpenditurePayout(expenditureId, 0, token.address), "colony-expenditure-cannot-claim");
    });

    it("cannot update the expenditure slot claimDelay if given an invalid action", async () => {
      // Create a poorly-formed action (no keys)
      const action = await encodeTxData(colony, "setExpenditureState", [1, UINT256_MAX, 1, 0, [], [], ethers.constants.HashZero]);

      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await checkErrorRevert(
        voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-expenditure-lock-failed"
      );
    });

    it("can accurately track the number of motions for a single expenditure", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1);
      const expenditureId = await colony.getExpenditureCount();
      const expenditureHash = soliditySha3(expenditureId, 0);

      // Set payoutModifier to 1 for expenditure slot 0
      const action1 = await encodeTxData(colony, "setExpenditureState", [
        1,
        UINT256_MAX,
        expenditureId,
        26,
        [false, true],
        ["0x0", bn2bytes32(new BN(2))],
        WAD32,
      ]);

      // Set payout to WAD for expenditure slot 0, internal token
      const action2 = await encodeTxData(colony, "setExpenditureState", [
        1,
        UINT256_MAX,
        expenditureId,
        27,
        [false, false],
        ["0x0", bn2bytes32(new BN(token.address.slice(2), 16))],
        WAD32,
      ]);

      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action1, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId1 = await voting.getMotionCount();

      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action2, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId2 = await voting.getMotionCount();

      let expenditureMotionCount;
      expenditureMotionCount = await voting.getExpenditureMotionCount(expenditureHash);
      expect(expenditureMotionCount).to.be.zero;

      let expenditureSlot;
      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.be.zero;

      await voting.stakeMotion(motionId1, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId2, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      expenditureMotionCount = await voting.getExpenditureMotionCount(expenditureHash);
      expect(expenditureMotionCount).to.eq.BN(2);

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.eq.BN(UINT256_MAX.divn(3));

      await forwardTime(STAKE_PERIOD, this);
      await voting.finalizeMotion(motionId1);

      expenditureMotionCount = await voting.getExpenditureMotionCount(expenditureHash);
      expect(expenditureMotionCount).to.eq.BN(1);

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.eq.BN(UINT256_MAX.divn(3));

      await voting.finalizeMotion(motionId2);

      expenditureMotionCount = await voting.getExpenditureMotionCount(expenditureHash);
      expect(expenditureMotionCount).to.be.zero;

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.be.zero;
    });

    it("cannot stake with someone else's reputation", async () => {
      await checkErrorRevert(
        voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER1 }),
        "voting-rep-invalid-user-address"
      );
    });

    it("cannot stake with insufficient reputation", async () => {
      const user2Key = makeReputationKey(colony.address, domain1.skillId, USER2);
      const user2Value = makeReputationValue(REQUIRED_STAKE.subn(1), 8);
      const [user2Mask, user2Siblings] = await reputationTree.getProof(user2Key);

      await checkErrorRevert(
        voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user2Key, user2Value, user2Mask, user2Siblings, { from: USER2 }),
        "voting-rep-insufficient-rep"
      );
    });

    it("cannot stake once time runs out", async () => {
      await forwardTime(STAKE_PERIOD, this);

      await checkErrorRevert(
        voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-motion-not-staking"
      );

      await checkErrorRevert(
        voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 }),
        "voting-rep-motion-not-staking"
      );
    });
  });

  describe("voting on motions", async () => {
    let motionId;

    beforeEach(async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
    });

    it("can rate and reveal for a motion", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      const user0LockPre = await tokenLocking.getUserLock(token.address, USER0);

      await voting.revealVote(motionId, SALT, NAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      const user0LockPost = await tokenLocking.getUserLock(token.address, USER0);

      const expectedReward = REQUIRED_STAKE.muln(2).mul(VOTER_REWARD_FRACTION).div(WAD);

      expect(new BN(user0LockPost.balance).sub(new BN(user0LockPre.balance))).to.eq.BN(expectedReward);
    });

    it("can tally votes from two users", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.revealVote(motionId, SALT, YAY, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      // See final counts
      const { votes } = await voting.getMotion(motionId);
      expect(votes[0]).to.be.zero;
      expect(votes[1]).to.eq.BN(WAD.muln(3));
    });

    it("rewards users for voting appropriately", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      const user0LockPre = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPre = await tokenLocking.getUserLock(token.address, USER1);

      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.revealVote(motionId, SALT, YAY, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      // Two users voted, check reward split appropriately
      const user0LockPost = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPost = await tokenLocking.getUserLock(token.address, USER1);
      const expectedReward0 = WAD.divn(3).mul(REQUIRED_STAKE).muln(2).mul(VOTER_REWARD_FRACTION).div(WAD).div(WAD);
      const expectedReward1 = WAD.muln(2).divn(3).mul(REQUIRED_STAKE).muln(2).mul(VOTER_REWARD_FRACTION).div(WAD).div(WAD);

      expect(new BN(user0LockPost.balance).sub(new BN(user0LockPre.balance))).to.eq.BN(expectedReward0);
      expect(new BN(user1LockPost.balance).sub(new BN(user1LockPre.balance))).to.eq.BN(expectedReward1);
    });

    it("tells users what their potential reward range is", async () => {
      const USER0_REPUTATION = new BN(user0Value.slice(2, 66), 16);
      const USER1_REPUTATION = new BN(user1Value.slice(2, 66), 16);

      let { 0: rewardMin, 1: rewardMax } = await voting.getVoterRewardRange(motionId, USER0_REPUTATION, USER0);

      expect(rewardMin).to.eq.BN(WAD.divn(3).mul(REQUIRED_STAKE).muln(2).mul(VOTER_REWARD_FRACTION).div(WAD).div(WAD));
      expect(rewardMax).to.eq.BN(REQUIRED_STAKE.muln(2).mul(VOTER_REWARD_FRACTION).div(WAD));

      // They vote, expect no change
      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      ({ 0: rewardMin, 1: rewardMax } = await voting.getVoterRewardRange(motionId, USER0_REPUTATION, USER0));
      expect(rewardMin).to.eq.BN(WAD.divn(3).mul(REQUIRED_STAKE).muln(2).mul(VOTER_REWARD_FRACTION).div(WAD).div(WAD));
      expect(rewardMax).to.eq.BN(REQUIRED_STAKE.muln(2).mul(VOTER_REWARD_FRACTION).div(WAD));

      // User 1 has no range, as they are the last to vote
      ({ 0: rewardMin, 1: rewardMax } = await voting.getVoterRewardRange(motionId, USER1_REPUTATION, USER1));
      expect(rewardMin).to.eq.BN(WAD.muln(2).divn(3).mul(REQUIRED_STAKE).muln(2).mul(VOTER_REWARD_FRACTION).div(WAD).div(WAD));
      expect(rewardMax).to.eq.BN(WAD.muln(2).divn(3).mul(REQUIRED_STAKE).muln(2).mul(VOTER_REWARD_FRACTION).div(WAD).div(WAD));
    });

    it("can update votes, but just the last one counts", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      // Revealing first vote fails
      await checkErrorRevert(
        voting.revealVote(motionId, SALT, NAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-secret-no-match"
      );

      // Revealing second succeeds
      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
    });

    it("can update votes, but the total reputation does not change", async () => {
      let motion = await voting.getMotion(motionId);
      expect(motion.repSubmitted).to.be.zero;

      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      motion = await voting.getMotion(motionId);
      expect(motion.repSubmitted).to.eq.BN(WAD);

      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      motion = await voting.getMotion(motionId);
      expect(motion.repSubmitted).to.eq.BN(WAD);
    });

    it("cannot reveal an invalid vote", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, 2), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      await checkErrorRevert(
        voting.revealVote(motionId, SALT, 2, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-bad-vote"
      );
    });

    it("cannot reveal a vote twice, and so cannot vote twice", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await checkErrorRevert(
        voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-secret-no-match"
      );
    });

    it("can vote in two motions with two reputation states, with different proofs", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      const oldRootHash = await reputationTree.getRootHash();

      // Update reputation state
      const user0Value2 = makeReputationValue(WAD.muln(2), 2);
      await reputationTree.insert(user0Key, user0Value2);

      const [domain1Mask2, domain1Siblings2] = await reputationTree.getProof(domain1Key);
      const [user0Mask2, user0Siblings2] = await reputationTree.getProof(user0Key);
      const [user1Mask2, user1Siblings2] = await reputationTree.getProof(user1Key);

      // Set new rootHash
      const rootHash = await reputationTree.getRootHash();
      expect(oldRootHash).to.not.equal(rootHash);

      await forwardTime(MINING_CYCLE_DURATION, this);

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await repCycle.submitRootHash(rootHash, 0, "0x00", 10, { from: MINER });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(0, { from: MINER });

      // Create new motion with new reputation state
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask2, domain1Siblings2);
      const motionId2 = await voting.getMotionCount();
      await voting.stakeMotion(motionId2, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value2, user0Mask2, user0Siblings2, { from: USER0 });
      await voting.stakeMotion(motionId2, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask2, user1Siblings2, { from: USER1 });

      await voting.submitVote(motionId2, soliditySha3(SALT, NAY), user0Key, user0Value2, user0Mask2, user0Siblings2, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      await voting.revealVote(motionId, SALT, NAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.revealVote(motionId2, SALT, NAY, user0Key, user0Value2, user0Mask2, user0Siblings2, { from: USER0 });
    });

    it("cannot submit a vote on a non-existent motion", async () => {
      await checkErrorRevert(
        voting.submitVote(0, "0x0", user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-motion-not-open"
      );
    });

    it("cannot submit a null vote", async () => {
      await checkErrorRevert(
        voting.submitVote(motionId, "0x0", user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-invalid-secret"
      );
    });

    it("cannot submit a vote if voting is closed", async () => {
      await forwardTime(SUBMIT_PERIOD, this);

      await checkErrorRevert(
        voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-motion-not-open"
      );
    });

    it("cannot reveal a vote on a non-existent motion", async () => {
      await forwardTime(SUBMIT_PERIOD, this);

      await checkErrorRevert(
        voting.revealVote(0, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-motion-not-reveal"
      );
    });

    it("cannot reveal a vote during the submit period", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await checkErrorRevert(voting.revealVote(motionId, SALT, YAY, FAKE, FAKE, 0, [], { from: USER0 }), "voting-rep-motion-not-reveal");
    });

    it("cannot reveal a vote after the reveal period ends", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);
      await forwardTime(REVEAL_PERIOD, this);

      await checkErrorRevert(voting.revealVote(motionId, SALT, NAY, FAKE, FAKE, 0, [], { from: USER0 }), "voting-rep-motion-not-reveal");
    });

    it("cannot reveal a vote with a bad secret", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      await checkErrorRevert(
        voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-secret-no-match"
      );
    });

    it("cannot reveal a vote with a bad proof", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      // Invalid proof (wrong root hash)
      await checkErrorRevert(voting.revealVote(motionId, SALT, NAY, FAKE, FAKE, 0, [], { from: USER0 }), "voting-rep-invalid-root-hash");

      // Invalid colony address
      let key, value, mask, siblings; // eslint-disable-line one-var
      key = makeReputationKey(metaColony.address, domain1.skillId, USER0);
      value = makeReputationValue(WAD, 3);
      [mask, siblings] = await reputationTree.getProof(key);

      await checkErrorRevert(
        voting.revealVote(motionId, SALT, NAY, key, value, mask, siblings, { from: USER0 }),
        "voting-rep-invalid-colony-address"
      );

      // Invalid skill id
      key = makeReputationKey(colony.address, 1234, USER0);
      value = makeReputationValue(WAD, 4);
      [mask, siblings] = await reputationTree.getProof(key);
      await checkErrorRevert(voting.revealVote(motionId, SALT, NAY, key, value, mask, siblings, { from: USER0 }), "voting-rep-invalid-skill-id");

      // Invalid user address
      await checkErrorRevert(
        voting.revealVote(motionId, SALT, NAY, user1Key, user1Value, user1Mask, user1Siblings, { from: USER0 }),
        "voting-rep-invalid-user-address"
      );
    });
  });

  describe("executing motions", async () => {
    let motionId;

    beforeEach(async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();
    });

    it("cannot execute a non-existent motion", async () => {
      await checkErrorRevert(voting.finalizeMotion(0), "voting-rep-motion-not-finalizable");
    });

    it("motion has no effect if extension does not have permissions", async () => {
      await colony.setRootRole(voting.address, false);
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);
      const tasksBefore = await colony.getTaskCount();

      await forwardTime(FAIL_EXECUTION_TIMEOUT_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.false;

      const tasksAfter = await colony.getTaskCount();
      expect(tasksAfter).to.eq.BN(tasksBefore);
      await colony.setRootRole(voting.address, true);
    });

    it("cannot take an action if there is insufficient support", async () => {
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE.subn(1), user0Key, user0Value, user0Mask, user0Siblings, {
        from: USER0,
      });

      await forwardTime(STAKE_PERIOD, this);

      await checkErrorRevert(voting.finalizeMotion(motionId), "voting-rep-motion-not-finalizable");
    });

    it("can take an action if there is insufficient opposition", async () => {
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE.subn(1), user1Key, user1Value, user1Mask, user1Siblings, {
        from: USER1,
      });

      await forwardTime(STAKE_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.true;
    });

    it("can take an action with a return value", async () => {
      // Returns a uint256
      const action = await encodeTxData(colony, "version", []);
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.true;
    });

    it("can take an action to install an extension", async () => {
      const oneTxPayment = soliditySha3("OneTxPayment");
      const oneTxPaymentVersion = 3;

      let installation = await colonyNetwork.getExtensionInstallation(oneTxPayment, colony.address);
      expect(installation).to.be.equal(ADDRESS_ZERO);

      const action = await encodeTxData(colony, "installExtension", [oneTxPayment, oneTxPaymentVersion]);
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[1].args.executed).to.be.true;

      installation = await colonyNetwork.getExtensionInstallation(oneTxPayment, colony.address);
      expect(installation).to.not.be.equal(ADDRESS_ZERO);
    });

    it("can take an action with an arbitrary target", async () => {
      const { colony: otherColony } = await setupRandomColony(colonyNetwork);
      await token.mint(otherColony.address, WAD, { from: USER0 });

      const action = await encodeTxData(colony, "claimColonyFunds", [token.address]);
      await voting.createMotion(1, UINT256_MAX, otherColony.address, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);

      const balanceBefore = await otherColony.getFundingPotBalance(1, token.address);
      expect(balanceBefore).to.be.zero;

      await voting.finalizeMotion(motionId);

      const balanceAfter = await otherColony.getFundingPotBalance(1, token.address);
      expect(balanceAfter).to.eq.BN(WAD);
    });

    it("can take a nonexistent action", async () => {
      const action = soliditySha3("foo");
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);
      await forwardTime(FAIL_EXECUTION_TIMEOUT_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.false;
    });

    it("cannot take an action that will fail before a week has elapsed since staking if it didn't go to a vote", async () => {
      const action = soliditySha3("foo");
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);

      let failingExecutionAllowed = await voting.failingExecutionAllowed(motionId);
      expect(failingExecutionAllowed).to.be.false;

      await checkErrorRevert(voting.finalizeMotion(motionId), "voting-execution-failed-not-one-week");

      // But after a week we can
      await forwardTime(FAIL_EXECUTION_TIMEOUT_PERIOD, this);

      failingExecutionAllowed = await voting.failingExecutionAllowed(motionId);
      expect(failingExecutionAllowed).to.be.true;
      // But still failed
      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.false;
    });

    it("cannot take an action that will fail before a week has elapsed since reveal finished if it went to a vote", async () => {
      const action = soliditySha3("foo");
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);
      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await forwardTime(REVEAL_PERIOD, this);

      await checkErrorRevert(voting.finalizeMotion(motionId), "voting-execution-failed-not-one-week");

      // But after a week we can
      await forwardTime(FAIL_EXECUTION_TIMEOUT_PERIOD, this);

      // But still failed
      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.false;
    });

    it("cannot take an action during staking or voting", async () => {
      let motionState;
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      motionState = await voting.getMotionState(motionId);
      expect(motionState).to.eq.BN(STAKING);
      await checkErrorRevert(voting.finalizeMotion(motionId), "voting-rep-motion-not-finalizable");

      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      motionState = await voting.getMotionState(motionId);
      expect(motionState).to.eq.BN(SUBMIT);
      await checkErrorRevert(voting.finalizeMotion(motionId), "voting-rep-motion-not-finalizable");
    });

    it("cannot take an action twice", async () => {
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.true;

      await checkErrorRevert(voting.finalizeMotion(motionId), "voting-rep-motion-not-finalizable");
    });

    it("can take an action if the motion passes", async () => {
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      // Don't need to wait for the reveal period, since 100% of the secret is revealed

      await forwardTime(STAKE_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.true;
    });

    it("cannot take an action if the motion fails", async () => {
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      await voting.revealVote(motionId, SALT, NAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(REVEAL_PERIOD, this);
      await forwardTime(STAKE_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.false;
    });

    it("cannot take an action if there is insufficient voting power (state change actions)", async () => {
      // Set globalClaimDelay to WAD
      await colony.makeExpenditure(1, UINT256_MAX, 1);
      const expenditureId = await colony.getExpenditureCount();
      const action = await encodeTxData(colony, "setExpenditureState", [1, UINT256_MAX, expenditureId, 25, [true], [bn2bytes32(new BN(4))], WAD32]);

      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId1 = await voting.getMotionCount();

      await voting.stakeMotion(motionId1, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId1, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(motionId1, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      await voting.revealVote(motionId1, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(REVEAL_PERIOD, this);
      await forwardTime(STAKE_PERIOD, this);

      let logs;
      ({ logs } = await voting.finalizeMotion(motionId1));
      expect(logs[0].args.executed).to.be.true;

      // Create another motion for the same variable
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId2 = await voting.getMotionCount();

      await voting.stakeMotion(motionId2, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId2, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(motionId2, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      await voting.revealVote(motionId2, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(REVEAL_PERIOD, this);
      await forwardTime(STAKE_PERIOD, this);

      ({ logs } = await voting.finalizeMotion(motionId2));
      expect(logs[0].args.executed).to.be.false;
    });

    it("can set vote power correctly after a vote", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1);
      const expenditureId = await colony.getExpenditureCount();

      const action = await encodeTxData(colony, "setExpenditureState", [1, UINT256_MAX, expenditureId, 25, [true], ["0x0"], WAD32]);

      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(REVEAL_PERIOD, this);
      await forwardTime(ESCALATION_PERIOD, this);

      await voting.finalizeMotion(motionId);
      const slotHash = hashExpenditureSlot(action);
      const pastVote = await voting.getExpenditurePastVote(slotHash);
      expect(pastVote).to.eq.BN(WAD); // USER0 had 1 WAD of reputation
    });

    it("can use vote power correctly for different values of the same variable", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1);
      const expenditureId = await colony.getExpenditureCount();

      // Set finalizedTimestamp
      const action1 = await encodeTxData(colony, "setExpenditureState", [1, UINT256_MAX, expenditureId, 25, [true], [bn2bytes32(new BN(3))], WAD32]);
      const action2 = await encodeTxData(colony, "setExpenditureState", [1, UINT256_MAX, expenditureId, 25, [true], [bn2bytes32(new BN(3))], "0x0"]);

      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action1, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId1 = await voting.getMotionCount();

      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action2, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId2 = await voting.getMotionCount();

      await voting.stakeMotion(motionId1, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId2, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);

      // First motion goes through
      await voting.finalizeMotion(motionId1);
      let expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.finalizedTimestamp).to.eq.BN(WAD);

      // Second motion does not because of insufficient vote power
      expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.finalizedTimestamp).to.eq.BN(WAD);
    });

    it("can set vote power correctly if there is insufficient opposition", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1);
      const expenditureId = await colony.getExpenditureCount();

      const action = await encodeTxData(colony, "setExpenditureState", [1, UINT256_MAX, expenditureId, 25, [true], ["0x0"], WAD32]);

      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);

      await voting.finalizeMotion(motionId);
      const slotHash = hashExpenditureSlot(action);
      const pastVote = await voting.getExpenditurePastVote(slotHash);
      expect(pastVote).to.eq.BN(REQUIRED_STAKE);
    });

    it("transactions that try to execute an allowed method on Reputation Voting extension are accepted by the MTX broadcaster", async function () {
      await colony.makeExpenditure(1, UINT256_MAX, 1);
      const expenditureId = await colony.getExpenditureCount();

      const action = await encodeTxData(colony, "setExpenditureState", [1, UINT256_MAX, expenditureId, 25, [true], ["0x0"], WAD32]);

      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);

      const txData = await voting.contract.methods.finalizeMotion(1).encodeABI();

      const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;
      const provider = new ethers.providers.JsonRpcProvider(`http://127.0.0.1:${realProviderPort}`);

      const loader = new TruffleLoader({
        contractDir: path.resolve(__dirname, "..", "..", "build", "contracts"),
      });

      const broadcaster = new MetatransactionBroadcaster({
        privateKey: `0x${ganacheAccounts.private_keys[accounts[0].toLowerCase()]}`,
        loader,
        provider,
      });
      await broadcaster.initialise(colonyNetwork.address);

      const valid = await broadcaster.isColonyFamilyTransactionAllowed(voting.address, txData);
      expect(valid).to.be.equal(true);
      await broadcaster.close();
    });

    it("transactions that try to execute a forbidden method on Reputation Voting extension are rejected by the MTX broadcaster", async function () {
      const action = await encodeTxData(colony, "makeArbitraryTransaction", [colony.address, "0x00"]);

      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);

      const txData = await voting.contract.methods.finalizeMotion(motionId.toString()).encodeABI();

      const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;
      const provider = new ethers.providers.JsonRpcProvider(`http://127.0.0.1:${realProviderPort}`);

      const loader = new TruffleLoader({
        contractDir: path.resolve(__dirname, "..", "..", "build", "contracts"),
      });

      const broadcaster = new MetatransactionBroadcaster({
        privateKey: `0x${ganacheAccounts.private_keys[accounts[0].toLowerCase()]}`,
        loader,
        provider,
      });
      await broadcaster.initialise(colonyNetwork.address);

      const valid = await broadcaster.isColonyFamilyTransactionAllowed(voting.address, txData);
      expect(valid).to.be.equal(false);
      await broadcaster.close();
    });
  });

  describe("claiming rewards", async () => {
    let motionId;

    beforeEach(async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();
    });

    it("cannot claim rewards from a non-existent motion", async () => {
      await checkErrorRevert(voting.claimReward(0, 1, UINT256_MAX, USER0, YAY), "voting-rep-motion-not-claimable");
    });

    it("returns 0 for staker rewards if no-one staked on a side of a motion", async () => {
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      const yayStakerReward = await voting.getStakerReward(motionId, USER0, YAY);
      const nayStakerReward = await voting.getStakerReward(motionId, USER0, NAY);

      expect(yayStakerReward[0]).to.eq.BN(REQUIRED_STAKE);
      expect(nayStakerReward[0]).to.eq.BN(new BN(0));
    });

    it("can let stakers claim rewards, based on the stake outcome", async () => {
      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      const numEntriesPrev = await repCycle.getReputationUpdateLogLength();

      const nayStake = REQUIRED_STAKE.divn(2);
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, nayStake, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(STAKE_PERIOD, this);

      await voting.finalizeMotion(motionId);

      const user0LockPre = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPre = await tokenLocking.getUserLock(token.address, USER1);

      await voting.claimReward(motionId, 1, UINT256_MAX, USER0, YAY);
      await voting.claimReward(motionId, 1, UINT256_MAX, USER1, NAY);

      const user0LockPost = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPost = await tokenLocking.getUserLock(token.address, USER1);

      // Note that no voter rewards were paid out
      const expectedReward0 = REQUIRED_STAKE.add(REQUIRED_STAKE.divn(20)); // 110% of stake
      const expectedReward1 = REQUIRED_STAKE.divn(20).muln(9); // 90% of stake

      expect(new BN(user0LockPost.balance).sub(new BN(user0LockPre.balance))).to.eq.BN(expectedReward0);
      expect(new BN(user1LockPost.balance).sub(new BN(user1LockPre.balance))).to.eq.BN(expectedReward1);

      // Now check that user0 has no penalty, while user1 has a 10% penalty
      const numEntriesPost = await repCycle.getReputationUpdateLogLength();
      expect(numEntriesPost.sub(numEntriesPrev)).to.eq.BN(1);

      const repUpdate = await repCycle.getReputationUpdateLogEntry(numEntriesPost.subn(1));
      expect(repUpdate.user).to.equal(USER1);
      expect(repUpdate.amount).to.eq.BN(REQUIRED_STAKE.divn(20).neg());
    });

    it("can let stakers claim rewards, based on the vote outcome", async () => {
      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      const numEntriesPrev = await repCycle.getReputationUpdateLogLength();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.revealVote(motionId, SALT, NAY, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(ESCALATION_PERIOD, this);

      await voting.finalizeMotion(motionId);

      const user0LockPre = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPre = await tokenLocking.getUserLock(token.address, USER1);

      await voting.claimReward(motionId, 1, UINT256_MAX, USER0, YAY);
      await voting.claimReward(motionId, 1, UINT256_MAX, USER1, NAY);

      let votingPayout = await voting.getVoterReward(motionId, WAD);
      const voter1reward = await voting.getVoterReward(motionId, WAD.muln(2));
      votingPayout = votingPayout.add(voter1reward);

      const user0LockPost = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPost = await tokenLocking.getUserLock(token.address, USER1);

      const loserStake = REQUIRED_STAKE.sub(votingPayout); // Take out voter comp
      const expectedReward0 = loserStake.muln(2).divn(3); // (stake * .8) * (winPct = 1/3 * 2)
      const expectedReward1 = REQUIRED_STAKE.add(loserStake.divn(3)); // stake + ((stake * .8) * (1 - (winPct = 2/3 * 2))

      expect(new BN(user0LockPost.balance).sub(new BN(user0LockPre.balance))).to.eq.BN(expectedReward0);
      expect(new BN(user1LockPost.balance).sub(new BN(user1LockPre.balance))).to.eq.BN(expectedReward1);

      // Now check that user1 has no penalty, while user0 has a 1/3 penalty
      const numEntriesPost = await repCycle.getReputationUpdateLogLength();
      expect(numEntriesPost.sub(numEntriesPrev)).to.eq.BN(1);

      const repUpdate = await repCycle.getReputationUpdateLogEntry(numEntriesPost.subn(1));
      expect(repUpdate.user).to.equal(USER0);
      expect(repUpdate.amount).to.eq.BN(REQUIRED_STAKE.sub(expectedReward0).neg());
    });

    it("can let stakers claim rewards, based on the vote outcome, with multiple losing stakers", async () => {
      const user2Key = makeReputationKey(colony.address, domain1.skillId, USER2);
      const user2Value = makeReputationValue(REQUIRED_STAKE.subn(1), 8);
      const [user2Mask, user2Siblings] = await reputationTree.getProof(user2Key);

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE.divn(3).muln(2), user1Key, user1Value, user1Mask, user1Siblings, {
        from: USER1,
      });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE.divn(3), user2Key, user2Value, user2Mask, user2Siblings, {
        from: USER2,
      });

      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.revealVote(motionId, SALT, NAY, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(ESCALATION_PERIOD, this);

      await voting.finalizeMotion(motionId);

      const user0LockPre = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPre = await tokenLocking.getUserLock(token.address, USER1);
      const user2LockPre = await tokenLocking.getUserLock(token.address, USER2);

      await voting.claimReward(motionId, 1, UINT256_MAX, USER0, YAY);
      await voting.claimReward(motionId, 1, UINT256_MAX, USER1, NAY);
      await voting.claimReward(motionId, 1, UINT256_MAX, USER2, NAY);

      let votingPayout = await voting.getVoterReward(motionId, new BN(user0Value.slice(2, 66), 16));
      const voter1reward = await voting.getVoterReward(motionId, new BN(user1Value.slice(2, 66), 16));
      votingPayout = votingPayout.add(voter1reward);

      const user0LockPost = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPost = await tokenLocking.getUserLock(token.address, USER1);
      const user2LockPost = await tokenLocking.getUserLock(token.address, USER2);

      const loserStake = REQUIRED_STAKE.sub(votingPayout); // Take out voter comp
      const expectedReward0 = loserStake.muln(2).divn(3); // (stake * .8) * (winPct = 1/3 * 2)
      const expectedReward1 = REQUIRED_STAKE.add(loserStake.divn(3)).muln(2).divn(3); // stake + ((stake * .8) * (1 - (winPct = 2/3 * 2))
      const expectedReward2 = REQUIRED_STAKE.add(loserStake.divn(3)).divn(3); // stake + ((stake * .8) * (1 - (winPct = 2/3 * 2))

      expect(new BN(user0LockPost.balance).sub(new BN(user0LockPre.balance))).to.eq.BN(expectedReward0);
      expect(new BN(user1LockPost.balance).sub(new BN(user1LockPre.balance))).to.eq.BN(expectedReward1);
      expect(new BN(user2LockPost.balance).sub(new BN(user2LockPre.balance))).to.eq.BN(expectedReward2);
    });

    it("can let stakers claim rewards, based on the vote outcome, with multiple winning stakers", async () => {
      const user2Key = makeReputationKey(colony.address, domain1.skillId, USER2);
      const user2Value = makeReputationValue(REQUIRED_STAKE.subn(1), 8);
      const [user2Mask, user2Siblings] = await reputationTree.getProof(user2Key);

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE.divn(3).muln(2), user0Key, user0Value, user0Mask, user0Siblings, {
        from: USER0,
      });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE.divn(3), user2Key, user2Value, user2Mask, user2Siblings, {
        from: USER2,
      });

      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.revealVote(motionId, SALT, NAY, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(ESCALATION_PERIOD, this);

      await voting.finalizeMotion(motionId);

      const user0LockPre = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPre = await tokenLocking.getUserLock(token.address, USER1);
      const user2LockPre = await tokenLocking.getUserLock(token.address, USER2);

      await voting.claimReward(motionId, 1, UINT256_MAX, USER0, YAY);
      await voting.claimReward(motionId, 1, UINT256_MAX, USER1, NAY);
      await voting.claimReward(motionId, 1, UINT256_MAX, USER2, YAY);

      const user0LockPost = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPost = await tokenLocking.getUserLock(token.address, USER1);
      const user2LockPost = await tokenLocking.getUserLock(token.address, USER2);

      let votingPayout = await voting.getVoterReward(motionId, new BN(user0Value.slice(2, 66), 16));
      const voter1reward = await voting.getVoterReward(motionId, new BN(user1Value.slice(2, 66), 16));
      votingPayout = votingPayout.add(voter1reward);

      const loserStake = REQUIRED_STAKE.sub(votingPayout); // Take out voter comp
      // User 0 staked 2/3rds of the losing side. 1/3 of the total stake of that side has been
      // removed due to that side only receiving a third of the vote
      const expectedReward0 = loserStake.muln(2).divn(3).muln(2).divn(3);
      // User 1 staked all of the winning side, so gets that back plus a third of what is left
      // on the losing side as a reward (as the winning side got 2/3rds of the vote)
      const expectedReward1 = REQUIRED_STAKE.add(loserStake.muln(1).divn(3));
      // Same as user 0, but they only staked 1/3 of the losing side.
      const expectedReward2 = loserStake.muln(2).divn(3).divn(3);

      expect(new BN(user0LockPost.balance).sub(new BN(user0LockPre.balance))).to.eq.BN(expectedReward0);
      expect(new BN(user1LockPost.balance).sub(new BN(user1LockPre.balance))).to.eq.BN(expectedReward1);
      expect(new BN(user2LockPost.balance).sub(new BN(user2LockPre.balance))).to.eq.BN(expectedReward2);
    });

    it("can let all stakers claim rewards, based on the vote outcome, with multiple winning stakers", async () => {
      const user2Key = makeReputationKey(colony.address, domain1.skillId, USER2);
      const user2Value = makeReputationValue(REQUIRED_STAKE.subn(1), 8);
      const [user2Mask, user2Siblings] = await reputationTree.getProof(user2Key);

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE.divn(3).muln(2), user0Key, user0Value, user0Mask, user0Siblings, {
        from: USER0,
      });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE.divn(6), user1Key, user1Value, user1Mask, user1Siblings, {
        from: USER1,
      });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE.divn(6), user2Key, user2Value, user2Mask, user2Siblings, {
        from: USER2,
      });

      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.revealVote(motionId, SALT, NAY, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(ESCALATION_PERIOD, this);

      await voting.finalizeMotion(motionId);

      const user0LockPre = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPre = await tokenLocking.getUserLock(token.address, USER1);
      const user2LockPre = await tokenLocking.getUserLock(token.address, USER2);

      await voting.claimReward(motionId, 1, UINT256_MAX, USER0, YAY);
      await voting.claimReward(motionId, 1, UINT256_MAX, USER1, YAY);
      await voting.claimReward(motionId, 1, UINT256_MAX, USER2, YAY);
      await voting.claimReward(motionId, 1, UINT256_MAX, USER1, NAY);

      const user0LockPost = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPost = await tokenLocking.getUserLock(token.address, USER1);
      const user2LockPost = await tokenLocking.getUserLock(token.address, USER2);

      let votingPayout = await voting.getVoterReward(motionId, new BN(user0Value.slice(2, 66), 16));
      const voter1reward = await voting.getVoterReward(motionId, new BN(user1Value.slice(2, 66), 16));
      votingPayout = votingPayout.add(voter1reward);

      const loserStake = REQUIRED_STAKE.sub(votingPayout); // Take out voter comp
      const expectedReward0 = loserStake.muln(2).divn(3).muln(2).divn(3); // (stake * .8) * (winPct = 1/3 * 2)
      const expectedReward1 = loserStake.muln(2).divn(3).divn(6);
      const expectedReward2 = loserStake.divn(3).muln(2).divn(6);

      const expectedReward1B = REQUIRED_STAKE.add(loserStake.divn(3));

      expect(new BN(user0LockPost.balance).sub(new BN(user0LockPre.balance))).to.eq.BN(expectedReward0);
      expect(new BN(user1LockPost.balance).sub(new BN(user1LockPre.balance))).to.eq.BN(expectedReward1.add(expectedReward1B));
      expect(new BN(user2LockPost.balance).sub(new BN(user2LockPre.balance))).to.eq.BN(expectedReward2);
    });

    it("can let stakers claim their original stake if neither side fully staked", async () => {
      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      const numEntriesPrev = await repCycle.getReputationUpdateLogLength();

      const half = REQUIRED_STAKE.divn(2);
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, half, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, half, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(STAKE_PERIOD, this);

      const user0LockPre = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPre = await tokenLocking.getUserLock(token.address, USER1);

      await voting.claimReward(motionId, 1, UINT256_MAX, USER0, YAY);
      await voting.claimReward(motionId, 1, UINT256_MAX, USER1, NAY);

      const numEntriesPost = await repCycle.getReputationUpdateLogLength();

      const user0LockPost = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPost = await tokenLocking.getUserLock(token.address, USER1);

      expect(numEntriesPrev).to.eq.BN(numEntriesPost);
      expect(new BN(user0LockPost.balance).sub(new BN(user0LockPre.balance))).to.eq.BN(half);
      expect(new BN(user1LockPost.balance).sub(new BN(user1LockPre.balance))).to.eq.BN(half);
    });

    it("cannot claim rewards twice", async () => {
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(REVEAL_PERIOD, this);
      await forwardTime(ESCALATION_PERIOD, this);

      await voting.finalizeMotion(motionId);

      await voting.claimReward(motionId, 1, UINT256_MAX, USER0, YAY);
      await expectEvent(voting.claimReward(motionId, 1, UINT256_MAX, USER1, NAY), "MotionRewardClaimed", [motionId, USER1, NAY, 0]);

      await checkErrorRevert(voting.claimReward(motionId, 1, UINT256_MAX, USER0, YAY), "voting-rep-nothing-to-claim");
    });

    it("cannot claim rewards before a motion is finalized", async () => {
      await checkErrorRevert(voting.claimReward(motionId, 1, UINT256_MAX, USER0, YAY), "voting-rep-motion-not-claimable");
    });
  });

  describe("escalating motions", async () => {
    let motionId;
    let votingPayout;

    beforeEach(async () => {
      const domain2Key = makeReputationKey(colony.address, domain2.skillId);
      const domain2Value = makeReputationValue(WAD, 6);
      const [domain2Mask, domain2Siblings] = await reputationTree.getProof(domain2Key);

      const user0Key2 = makeReputationKey(colony.address, domain2.skillId, USER0);
      const user0Value2 = makeReputationValue(WAD.divn(3), 9);
      const [user0Mask2, user0Siblings2] = await reputationTree.getProof(user0Key2);

      const user1Key2 = makeReputationKey(colony.address, domain2.skillId, USER1);
      const user1Value2 = makeReputationValue(WAD.divn(3).muln(2), 10);
      const [user1Mask2, user1Siblings2] = await reputationTree.getProof(user1Key2);

      const action = await encodeTxData(colony, "makeTask", [1, 0, FAKE, 2, 0, 0]);
      await voting.createMotion(2, UINT256_MAX, ADDRESS_ZERO, action, domain2Key, domain2Value, domain2Mask, domain2Siblings);
      motionId = await voting.getMotionCount();

      await colony.approveStake(voting.address, 2, WAD, { from: USER0 });
      await colony.approveStake(voting.address, 2, WAD, { from: USER1 });

      await voting.stakeMotion(motionId, 1, 0, NAY, REQUIRED_STAKE_DOMAIN_2, user0Key2, user0Value2, user0Mask2, user0Siblings2, { from: USER0 });
      await voting.stakeMotion(motionId, 1, 0, YAY, REQUIRED_STAKE_DOMAIN_2, user1Key2, user1Value2, user1Mask2, user1Siblings2, { from: USER1 });

      // Note that this is a passing vote
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key2, user0Value2, user0Mask2, user0Siblings2, { from: USER0 });
      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user1Key2, user1Value2, user1Mask2, user1Siblings2, { from: USER1 });

      await voting.revealVote(motionId, SALT, NAY, user0Key2, user0Value2, user0Mask2, user0Siblings2, { from: USER0 });
      await voting.revealVote(motionId, SALT, YAY, user1Key2, user1Value2, user1Mask2, user1Siblings2, { from: USER1 });

      votingPayout = await voting.getVoterReward(motionId, new BN(user0Value2.slice(2, 66), 16));
      const voter1reward = await voting.getVoterReward(motionId, new BN(user1Value2.slice(2, 66), 16));
      votingPayout = votingPayout.add(voter1reward);
    });

    it("can internally escalate a domain motion after a vote", async () => {
      await voting.escalateMotion(motionId, 1, 0, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });
    });

    it("can internally escalate a domain motion after a vote", async () => {
      await voting.escalateMotion(motionId, 1, 0, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER1 });
    });

    it("cannot internally escalate a domain motion if not in a 'closed' state", async () => {
      await forwardTime(ESCALATION_PERIOD, this);

      await voting.finalizeMotion(motionId);

      await checkErrorRevert(
        voting.escalateMotion(motionId, 1, 0, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER2 }),
        "voting-rep-motion-not-closed"
      );
    });

    it("cannot internally escalate a domain motion with an invalid domain proof", async () => {
      await checkErrorRevert(
        voting.escalateMotion(motionId, 1, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 }),
        "voting-rep-invalid-domain-proof"
      );
    });

    it("cannot internally escalate a domain motion with an invalid reputation proof", async () => {
      await checkErrorRevert(voting.escalateMotion(motionId, 1, 0, "0x0", "0x0", "0x0", [], { from: USER0 }), "voting-rep-invalid-root-hash");
    });

    it("can stake after internally escalating a domain motion", async () => {
      await voting.escalateMotion(motionId, 1, 0, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });

      const yayStake = REQUIRED_STAKE.sub(REQUIRED_STAKE_DOMAIN_2);
      const nayStake = yayStake.add(REQUIRED_STAKE.divn(10));
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, yayStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, nayStake, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      const motionState = await voting.getMotionState(motionId);
      expect(motionState).to.eq.BN(SUBMIT);
    });

    it("can execute after internally escalating a domain motion, if there is insufficient opposition", async () => {
      await voting.escalateMotion(motionId, 1, 0, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });

      const yayStake = REQUIRED_STAKE.sub(REQUIRED_STAKE_DOMAIN_2);
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, yayStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.true;
    });

    it("cannot execute after internally escalating a domain motion, if there is insufficient support", async () => {
      await voting.escalateMotion(motionId, 1, 0, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });

      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(STAKE_PERIOD, this);

      const motionState = await voting.getMotionState(motionId);
      expect(motionState).to.eq.BN(FAILED);
    });

    it("can fall back on the previous vote if both sides fail to stake", async () => {
      await voting.escalateMotion(motionId, 1, 0, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);

      // Note that the previous vote succeeded
      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.true;
    });

    it("can use the result of a new stake after internally escalating a domain motion", async () => {
      await voting.escalateMotion(motionId, 1, 0, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });

      const yayStake = REQUIRED_STAKE.sub(REQUIRED_STAKE_DOMAIN_2);
      const nayStake = yayStake.add(votingPayout);
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, nayStake, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(STAKE_PERIOD, this);

      const motionState = await voting.getMotionState(motionId);
      expect(motionState).to.eq.BN(FAILED);

      // Now check that the rewards come out properly
      const user1LockPre = await tokenLocking.getUserLock(token.address, USER1);

      await checkErrorRevert(voting.claimReward(motionId, 1, UINT256_MAX, USER0, YAY), "voting-rep-nothing-to-claim");
      await voting.claimReward(motionId, 1, UINT256_MAX, USER1, NAY);

      const user1LockPost = await tokenLocking.getUserLock(token.address, USER1);

      // REQUIRED_STAKE.div(REQUIRED_STAKE.add(votingPayout)) is the fraction of this side they staked
      // REQUIRED_STAKE.add(REQUIRED_STAKE_DOMAIN_2).muln(2).divn(3) is what's being awarded to the whole of this side.
      // The product tells us their expected reward.

      const expectedReward1 = nayStake.mul(REQUIRED_STAKE.add(REQUIRED_STAKE_DOMAIN_2.divn(10))).div(REQUIRED_STAKE.add(votingPayout));
      expect(new BN(user1LockPost.balance).sub(new BN(user1LockPre.balance))).to.eq.BN(expectedReward1);
    });

    it("can use the result of a new vote after internally escalating a domain motion", async () => {
      await voting.escalateMotion(motionId, 1, 0, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });

      const yayStake = REQUIRED_STAKE.sub(REQUIRED_STAKE_DOMAIN_2);
      const nayStake = yayStake.add(votingPayout);
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, yayStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, nayStake, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      // Vote fails
      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.revealVote(motionId, SALT, NAY, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(ESCALATION_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.false;

      // Now check that the rewards come out properly
      // 1st voter reward paid by YAY (user0), 2nd paid by NAY (user1)
      const user0LockPre = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPre = await tokenLocking.getUserLock(token.address, USER1);

      await voting.claimReward(motionId, 1, UINT256_MAX, USER0, YAY);
      await voting.claimReward(motionId, 1, UINT256_MAX, USER1, NAY);

      const user0LockPost = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPost = await tokenLocking.getUserLock(token.address, USER1);

      let votingPayout2 = await voting.getVoterReward(motionId, new BN(user0Value.slice(2, 66), 16));
      const voter1reward2 = await voting.getVoterReward(motionId, new BN(user1Value.slice(2, 66), 16));
      votingPayout2 = votingPayout2.add(voter1reward2);

      const loserStake = REQUIRED_STAKE.sub(votingPayout2); // Take out voter comp

      const expectedReward0 = loserStake.muln(2).divn(3).mul(yayStake).div(REQUIRED_STAKE);
      const expectedReward1 = nayStake.mul(REQUIRED_STAKE.add(loserStake.divn(3))).div(REQUIRED_STAKE.add(votingPayout));

      expect(new BN(user0LockPost.balance).sub(new BN(user0LockPre.balance))).to.eq.BN(expectedReward0);
      expect(new BN(user1LockPost.balance).sub(new BN(user1LockPre.balance))).to.eq.BN(expectedReward1);
    });

    it("can still claim rewards after a motion has been escalated but failed to stake", async () => {
      await voting.escalateMotion(motionId, 1, 0, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.true;

      // Now check that the rewards come out properly
      // 1st voter reward paid by YAY (user0)
      const user0LockPre = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPre = await tokenLocking.getUserLock(token.address, USER1);

      await voting.claimReward(motionId, 1, UINT256_MAX, USER0, NAY);
      await voting.claimReward(motionId, 1, UINT256_MAX, USER1, YAY);

      const user0LockPost = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPost = await tokenLocking.getUserLock(token.address, USER1);

      const user0Domain2Rep = WAD.divn(3);
      const user1Domain2Rep = WAD.divn(3).muln(2);
      const loserStake = REQUIRED_STAKE_DOMAIN_2.sub(votingPayout); // Take out voter comp

      const winFraction = user0Domain2Rep.mul(WAD).div(user0Domain2Rep.add(user1Domain2Rep));

      const expectedReward0 = loserStake.muln(2).mul(winFraction).div(WAD);
      const expectedReward1 = REQUIRED_STAKE_DOMAIN_2.add(loserStake.mul(winFraction).div(WAD)); // stake + ((stake * .8) * (1 - (winPct = 2/3 * 2))

      expect(new BN(user0LockPost.balance).sub(new BN(user0LockPre.balance))).to.eq.BN(expectedReward0);
      expect(new BN(user1LockPost.balance).sub(new BN(user1LockPre.balance))).to.eq.BN(expectedReward1);
    });

    it("can still claim rewards after a motion has been escalated but not enough was staked", async () => {
      await voting.escalateMotion(motionId, 1, 0, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });

      const partialStake = REQUIRED_STAKE.sub(REQUIRED_STAKE_DOMAIN_2).divn(2);

      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, partialStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, partialStake.subn(1000), user1Key, user1Value, user1Mask, user1Siblings, {
        from: USER1,
      });

      await forwardTime(STAKE_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.true;

      // Now check that the rewards come out properly
      // 1st voter reward paid by YAY (user0)
      const user0LockPre = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPre = await tokenLocking.getUserLock(token.address, USER1);

      await voting.claimReward(motionId, 1, UINT256_MAX, USER0, NAY);
      await voting.claimReward(motionId, 1, UINT256_MAX, USER1, YAY);

      const user0LockPost = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPost = await tokenLocking.getUserLock(token.address, USER1);

      const loserStake = REQUIRED_STAKE_DOMAIN_2.divn(10).muln(8).add(partialStake);
      const expectedReward0 = loserStake.divn(3).muln(2);
      const expectedReward1 = REQUIRED_STAKE_DOMAIN_2.add(loserStake.divn(3)).add(partialStake.subn(1000));

      expect(new BN(user0LockPost.balance).sub(new BN(user0LockPre.balance))).to.eq.BN(expectedReward0);
      expect(new BN(user1LockPost.balance).sub(new BN(user1LockPre.balance))).to.eq.BN(expectedReward1);
    });

    it("cannot escalate a motion in the root domain", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.revealVote(motionId, SALT, NAY, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      const state = await voting.getMotionState(motionId);
      expect(state).to.eq.BN(EXECUTABLE);
    });

    it("can skip the staking phase if no new stake is required", async () => {
      voting = await VotingReputation.new();
      await voting.install(colony.address);
      await colony.setArbitrationRole(1, UINT256_MAX, voting.address, 1, true);

      await voting.initialise(
        TOTAL_STAKE_FRACTION,
        0, // No voter compensation
        USER_MIN_STAKE_FRACTION,
        MAX_VOTE_FRACTION,
        STAKE_PERIOD,
        SUBMIT_PERIOD,
        REVEAL_PERIOD,
        ESCALATION_PERIOD
      );

      // Run a vote in domain 3, same rep as domain 1
      const domain3Key = makeReputationKey(colony.address, domain3.skillId);
      const domain3Value = makeReputationValue(WAD.muln(3), 7);
      const [domain3Mask, domain3Siblings] = await reputationTree.getProof(domain3Key);

      const user0Key3 = makeReputationKey(colony.address, domain3.skillId, USER0);
      const user0Value3 = makeReputationValue(WAD, 11);
      const [user0Mask3, user0Siblings3] = await reputationTree.getProof(user0Key3);

      const user1Key3 = makeReputationKey(colony.address, domain3.skillId, USER1);
      const user1Value3 = makeReputationValue(WAD.muln(2), 12);
      const [user1Mask3, user1Siblings3] = await reputationTree.getProof(user1Key3);

      const action = await encodeTxData(colony, "makeTask", [1, 1, FAKE, 3, 0, 0]);
      await voting.createMotion(3, UINT256_MAX, ADDRESS_ZERO, action, domain3Key, domain3Value, domain3Mask, domain3Siblings);
      motionId = await voting.getMotionCount();

      await colony.approveStake(voting.address, 3, WAD, { from: USER0 });
      await colony.approveStake(voting.address, 3, WAD, { from: USER1 });

      await voting.stakeMotion(motionId, 1, 1, NAY, REQUIRED_STAKE, user0Key3, user0Value3, user0Mask3, user0Siblings3, { from: USER0 });
      await voting.stakeMotion(motionId, 1, 1, YAY, REQUIRED_STAKE, user1Key3, user1Value3, user1Mask3, user1Siblings3, { from: USER1 });

      // Note that this is a passing vote
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key3, user0Value3, user0Mask3, user0Siblings3, { from: USER0 });
      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user1Key3, user1Value3, user1Mask3, user1Siblings3, { from: USER1 });

      await voting.revealVote(motionId, SALT, NAY, user0Key3, user0Value3, user0Mask3, user0Siblings3, { from: USER0 });
      await voting.revealVote(motionId, SALT, YAY, user1Key3, user1Value3, user1Mask3, user1Siblings3, { from: USER1 });

      // Now escalate, should go directly into submit phase
      await voting.escalateMotion(motionId, 1, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });

      const state = await voting.getMotionState(motionId);
      expect(state).to.eq.BN(SUBMIT);
    });
  });
});
