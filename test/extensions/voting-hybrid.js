/* globals artifacts */

import BN from "bn.js";
import chai from "chai";
import bnChai from "bn-chai";
import shortid from "shortid";
import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";

import { UINT256_MAX, WAD, MINING_CYCLE_DURATION, SECONDS_PER_DAY, DEFAULT_STAKE, SUBMITTER_ONLY_WINDOW } from "../../helpers/constants";

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

import {
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  setupRandomColony,
  giveUserCLNYTokensAndStake,
} from "../../helpers/test-data-generator";

import { setupEtherRouter } from "../../helpers/upgradable-contracts";

import PatriciaTree from "../../packages/reputation-miner/patricia";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const TokenLocking = artifacts.require("TokenLocking");
const VotingHybrid = artifacts.require("VotingHybrid");
const Resolver = artifacts.require("Resolver");

const VOTING_HYBRID = soliditySha3("VotingHybrid");

contract("Voting Hybrid", (accounts) => {
  let colony;
  let token;
  let domain1;
  let metaColony;
  let colonyNetwork;
  let tokenLocking;

  let voting;

  let reputationTree;

  let requiredStake;

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
  // const EXECUTABLE = 5;
  // const EXECUTED = 6;
  // const FAILED = 7;

  const ADDRESS_ZERO = ethers.constants.AddressZero;
  const WAD32 = bn2bytes32(WAD);
  const HALF = WAD.divn(2);
  const YEAR = SECONDS_PER_DAY * 365;

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

    await giveUserCLNYTokensAndStake(colonyNetwork, MINER, DEFAULT_STAKE);
    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();

    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await TokenLocking.at(tokenLockingAddress);

    const votingImplementation = await VotingHybrid.new();
    const resolver = await Resolver.new();
    await setupEtherRouter("VotingHybrid", { VotingHybrid: votingImplementation.address }, resolver);
    await metaColony.addExtensionToNetwork(VOTING_HYBRID, resolver.address);
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    domain1 = await colony.getDomain(1);

    await colony.installExtension(VOTING_HYBRID, 1);
    const votingAddress = await colonyNetwork.getExtensionInstallation(VOTING_HYBRID, colony.address);
    voting = await VotingHybrid.at(votingAddress);

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

    const user0Influence = WAD;
    const user1Influence = WAD.muln(2);
    const user2Influence = WAD.divn(10000);
    const totalInfluence = user0Influence.add(user1Influence).add(user2Influence);

    // Setup reputation values

    reputationTree = new PatriciaTree();
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId), // Colony total
      makeReputationValue(totalInfluence, 1)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId, USER0), // User0
      makeReputationValue(user0Influence, 2)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId, USER1), // User1
      makeReputationValue(user1Influence, 3)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId, USER2), // User2
      makeReputationValue(user2Influence, 4)
    );

    domain1Key = makeReputationKey(colony.address, domain1.skillId);
    domain1Value = makeReputationValue(totalInfluence, 1);
    [domain1Mask, domain1Siblings] = await reputationTree.getProof(domain1Key);

    user0Key = makeReputationKey(colony.address, domain1.skillId, USER0);
    user0Value = makeReputationValue(user0Influence, 2);
    [user0Mask, user0Siblings] = await reputationTree.getProof(user0Key);

    user1Key = makeReputationKey(colony.address, domain1.skillId, USER1);
    user1Value = makeReputationValue(user1Influence, 3);
    [user1Mask, user1Siblings] = await reputationTree.getProof(user1Key);

    const rootHash = await reputationTree.getRootHash();
    const repCycle = await getActiveRepCycle(colonyNetwork);
    await forwardTime(MINING_CYCLE_DURATION, this);
    await repCycle.submitRootHash(rootHash, 0, "0x00", 10, { from: MINER });
    await forwardTime(SUBMITTER_ONLY_WINDOW + 1, this);
    await repCycle.confirmNewHash(0);

    // Setup token values

    await token.mint(USER0, user0Influence);
    await token.mint(USER1, user1Influence);
    await token.mint(USER2, user2Influence);
    await token.approve(tokenLocking.address, user0Influence, { from: USER0 });
    await token.approve(tokenLocking.address, user1Influence, { from: USER1 });
    await token.approve(tokenLocking.address, user2Influence, { from: USER2 });
    await tokenLocking.methods["deposit(address,uint256,bool)"](token.address, user0Influence, true, { from: USER0 });
    await tokenLocking.methods["deposit(address,uint256,bool)"](token.address, user1Influence, true, { from: USER1 });
    await tokenLocking.methods["deposit(address,uint256,bool)"](token.address, user2Influence, true, { from: USER2 });
    await colony.approveStake(voting.address, 1, user0Influence, { from: USER0 });
    await colony.approveStake(voting.address, 1, user1Influence, { from: USER1 });
    await colony.approveStake(voting.address, 1, user2Influence, { from: USER2 });

    // Add both reputation and token influence
    requiredStake = totalInfluence.muln(2).divn(1000);
  });

  function hashExpenditureSlot(action) {
    const preamble = 2 + 8 + 64 * 2;
    return soliditySha3(`0x${action.slice(preamble, preamble + 64 * 4)}${"0".repeat(64)}${action.slice(preamble + 64 * 5, action.length)}`);
  }

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      voting = await VotingHybrid.new();
      await voting.install(colony.address);

      await checkErrorRevert(voting.install(colony.address), "extension-already-installed");

      const identifier = await voting.identifier();
      const version = await voting.version();
      expect(identifier).to.equal(VOTING_HYBRID);
      expect(version).to.eq.BN(1);

      await voting.finishUpgrade();
      await voting.deprecate(true);
      await voting.uninstall();

      const code = await web3GetCode(voting.address);
      expect(code).to.equal("0x");
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(VOTING_HYBRID, 1, { from: USER0 });

      await checkErrorRevert(colony.installExtension(VOTING_HYBRID, 1, { from: USER0 }), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(VOTING_HYBRID, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(VOTING_HYBRID, { from: USER0 });
    });

    it("can deprecate the extension if root", async () => {
      let deprecated = await voting.getDeprecated();
      expect(deprecated).to.equal(false);

      await checkErrorRevert(colony.deprecateExtension(VOTING_HYBRID, true, { from: USER2 }), "ds-auth-unauthorized");
      await colony.deprecateExtension(VOTING_HYBRID, true);

      // Cant make new motions!
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await checkErrorRevert(
        voting.createMotion(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings),
        "colony-extension-deprecated"
      );

      deprecated = await voting.getDeprecated();
      expect(deprecated).to.equal(true);
    });

    it("cannot make a motion before initialised", async () => {
      voting = await VotingHybrid.new();
      await voting.install(colony.address);

      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await checkErrorRevert(
        voting.createMotion(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings),
        "voting-base-not-active"
      );
    });

    it("cannot initialise twice or more if not root", async () => {
      await checkErrorRevert(voting.initialise(HALF, HALF, WAD, WAD, YEAR, YEAR, YEAR, YEAR), "voting-base-already-initialised");
      await checkErrorRevert(voting.initialise(HALF, HALF, WAD, WAD, YEAR, YEAR, YEAR, YEAR, { from: USER2 }), "voting-base-caller-not-root");
    });

    it("cannot initialise with invalid values", async () => {
      voting = await VotingHybrid.new();
      await voting.install(colony.address);

      await checkErrorRevert(voting.initialise(HALF.addn(1), HALF, WAD, WAD, YEAR, YEAR, YEAR, YEAR), "voting-base-greater-than-half-wad");
      await checkErrorRevert(voting.initialise(HALF, HALF.addn(1), WAD, WAD, YEAR, YEAR, YEAR, YEAR), "voting-base-greater-than-half-wad");
      await checkErrorRevert(voting.initialise(HALF, HALF, WAD.addn(1), WAD, YEAR, YEAR, YEAR, YEAR), "voting-base-greater-than-wad");
      await checkErrorRevert(voting.initialise(HALF, HALF, WAD, WAD.addn(1), YEAR, YEAR, YEAR, YEAR), "voting-base-greater-than-wad");
      await checkErrorRevert(voting.initialise(HALF, HALF, WAD, WAD, YEAR + 1, YEAR, YEAR, YEAR), "voting-base-period-too-long");
      await checkErrorRevert(voting.initialise(HALF, HALF, WAD, WAD, YEAR, YEAR + 1, YEAR, YEAR), "voting-base-period-too-long");
      await checkErrorRevert(voting.initialise(HALF, HALF, WAD, WAD, YEAR, YEAR, YEAR + 1, YEAR), "voting-base-period-too-long");
      await checkErrorRevert(voting.initialise(HALF, HALF, WAD, WAD, YEAR, YEAR, YEAR, YEAR + 1), "voting-base-period-too-long");
    });

    it("can initialised with valid values and emit expected event", async () => {
      voting = await VotingHybrid.new();
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
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createMotion(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);

      const motionId = await voting.getMotionCount();
      const motion = await voting.getMotion(motionId);
      expect(motion.skillId).to.eq.BN(domain1.skillId);
    });

    it("does not lock the token when a motion is created", async () => {
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createMotion(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId = await voting.getMotionCount();

      const lockId = await voting.getLockId(motionId);
      expect(lockId).to.be.zero;
    });

    it("can create a motion with an alternative target", async () => {
      const action = await encodeTxData(colony, "makeTask", [1, 0, FAKE, 2, 0, 0]);
      await voting.createMotion(voting.address, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
    });

    it("cannot create a motion with the colony as the alternative target", async () => {
      const action = await encodeTxData(colony, "makeTask", [1, 0, FAKE, 2, 0, 0]);
      await checkErrorRevert(
        voting.createMotion(colony.address, action, domain1Key, domain1Value, domain1Mask, domain1Siblings),
        "voting-base-alt-target-cannot-be-base-colony"
      );
    });
  });

  describe("staking on motions", async () => {
    let motionId;

    beforeEach(async () => {
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createMotion(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();
    });

    it("can stake on a motion", async () => {
      const requiredStakeOnChain = await voting.getRequiredStake(motionId);
      expect(requiredStake).to.eq.BN(requiredStakeOnChain);

      const half = requiredStake.divn(2);

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, half, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, half, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      const motion = await voting.getMotion(motionId);
      expect(motion.stakes[0]).to.be.zero;
      expect(motion.stakes[1]).to.eq.BN(requiredStake);

      const stake0 = await voting.getStake(motionId, USER0, YAY);
      const stake1 = await voting.getStake(motionId, USER1, YAY);
      expect(stake0).to.eq.BN(half);
      expect(stake1).to.eq.BN(half);
    });

    it("can update the motion states correctly", async () => {
      let motionState = await voting.getMotionState(motionId);
      expect(motionState).to.eq.BN(STAKING);

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      motionState = await voting.getMotionState(motionId);
      expect(motionState).to.eq.BN(STAKING);

      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, requiredStake, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      motionState = await voting.getMotionState(motionId);
      expect(motionState).to.eq.BN(SUBMIT);
    });

    it("can stake even with a locked token", async () => {
      await token.mint(colony.address, WAD);
      await colony.setRewardInverse(100);
      await colony.claimColonyFunds(token.address);
      await colony.startNextRewardPayout(token.address, domain1Key, domain1Value, domain1Mask, domain1Siblings);

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, requiredStake, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      const lock = await tokenLocking.getUserLock(token.address, voting.address);
      expect(lock.balance).to.eq.BN(requiredStake.muln(2));
    });

    it("cannot stake 0", async () => {
      await checkErrorRevert(
        voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, 0, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-base-bad-amount"
      );
    });

    it("cannot stake a nonexistent side", async () => {
      await checkErrorRevert(
        voting.stakeMotion(motionId, 1, UINT256_MAX, 2, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-base-bad-vote"
      );
    });

    it("cannot stake less than the minStake, unless there is less than minStake to go", async () => {
      const minStake = requiredStake.divn(10);

      await checkErrorRevert(
        voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, minStake.subn(1), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-base-insufficient-stake"
      );

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, minStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      // Unless there's less than the minStake to go!

      const stake = requiredStake.sub(minStake.muln(2)).addn(1);
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, stake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, minStake.subn(1), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
    });

    it("can update the expenditure globalClaimDelay if voting on expenditure state", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1);
      const expenditureId = await colony.getExpenditureCount();
      await colony.finalizeExpenditure(expenditureId);

      // Set finalizedTimestamp to WAD
      const action = await encodeTxData(colony, "setExpenditureState", [1, UINT256_MAX, expenditureId, 25, [true], [bn2bytes32(new BN(3))], WAD32]);

      await voting.createMotion(ethers.constants.AddressZero, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      let expenditureMotionCount;
      expenditureMotionCount = await voting.getExpenditureMotionCount(soliditySha3(expenditureId));
      expect(expenditureMotionCount).to.be.zero;

      let expenditure;
      expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.globalClaimDelay).to.be.zero;

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

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

      await voting.createMotion(otherColony.address, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

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

      await voting.createMotion(ethers.constants.AddressZero, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      let expenditureMotionCount;
      expenditureMotionCount = await voting.getExpenditureMotionCount(soliditySha3(expenditureId, 0));
      expect(expenditureMotionCount).to.be.zero;

      let expenditureSlot;
      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.be.zero;

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

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

      await voting.createMotion(ethers.constants.AddressZero, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      let expenditureMotionCount;
      expenditureMotionCount = await voting.getExpenditureMotionCount(soliditySha3(expenditureId, 0));
      expect(expenditureMotionCount).to.be.zero;

      let expenditureSlot;
      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.be.zero;

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

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

      await voting.createMotion(ethers.constants.AddressZero, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

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

      await voting.createMotion(ethers.constants.AddressZero, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

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

      await voting.createMotion(ethers.constants.AddressZero, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      const expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.globalClaimDelay).to.eq.BN(UINT256_MAX.divn(3));

      const expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.eq.BN(UINT256_MAX.divn(3));

      await checkErrorRevert(colony.claimExpenditurePayout(expenditureId, 0, token.address), "colony-expenditure-cannot-claim");
    });

    it("cannot update the expenditure slot claimDelay if given an invalid action", async () => {
      // Create a poorly-formed action (no keys)
      const action = await encodeTxData(colony, "setExpenditureState", [1, UINT256_MAX, 1, 0, [], [], ethers.constants.HashZero]);

      await voting.createMotion(ethers.constants.AddressZero, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await checkErrorRevert(
        voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-base-expenditure-lock-failed"
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

      await voting.createMotion(ethers.constants.AddressZero, action1, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId1 = await voting.getMotionCount();

      await voting.createMotion(ethers.constants.AddressZero, action2, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId2 = await voting.getMotionCount();

      let expenditureMotionCount;
      expenditureMotionCount = await voting.getExpenditureMotionCount(expenditureHash);
      expect(expenditureMotionCount).to.be.zero;

      let expenditureSlot;
      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.be.zero;

      await voting.stakeMotion(motionId1, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId2, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

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
        voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER1 }),
        "voting-base-invalid-user-address"
      );
    });

    it("cannot stake with insufficient reputation", async () => {
      const user2Key = makeReputationKey(colony.address, domain1.skillId, USER2);
      const user2Value = makeReputationValue(WAD.divn(10000), 4);
      const [user2Mask, user2Siblings] = await reputationTree.getProof(user2Key);

      await checkErrorRevert(
        voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user2Key, user2Value, user2Mask, user2Siblings, { from: USER2 }),
        "voting-base-insufficient-influence"
      );
    });

    it("cannot stake once time runs out", async () => {
      await forwardTime(STAKE_PERIOD, this);

      await checkErrorRevert(
        voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-base-motion-not-staking"
      );

      await checkErrorRevert(
        voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, requiredStake, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 }),
        "voting-base-motion-not-staking"
      );
    });
  });

  describe("voting on motions", async () => {
    let motionId;

    beforeEach(async () => {
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createMotion(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, requiredStake, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
    });

    it("can rate and reveal for a motion", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      await voting.revealVote(motionId, SALT, NAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
    });

    it("locks the token when the first reveal is made", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      let lockId = await voting.getLockId(motionId);
      expect(lockId).to.be.zero;

      await voting.revealVote(motionId, SALT, NAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      lockId = await voting.getLockId(motionId);
      expect(lockId).to.not.be.zero;
    });

    it("can unlock the token once revealed", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      await voting.revealVote(motionId, SALT, NAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      const lockId = await voting.getLockId(motionId);
      const { lockCount } = await tokenLocking.getUserLock(token.address, USER0);
      expect(lockCount).to.eq.BN(lockId);
    });

    it("can tally votes from two users", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(SUBMIT_PERIOD, this);

      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.revealVote(motionId, SALT, YAY, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      // See final counts
      const { votes } = await voting.getMotion(motionId);
      expect(votes[0][0]).to.be.zero;
      expect(votes[0][1]).to.eq.BN(WAD.muln(3));
    });

    it("can update votes, but just the last one counts", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      // Revealing first vote fails
      await checkErrorRevert(
        voting.revealVote(motionId, SALT, NAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-base-secret-no-match"
      );

      // Revealing second succeeds
      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
    });

    it("can update votes, but the total reputation does not change", async () => {
      let motion = await voting.getMotion(motionId);
      expect(motion.totalVotes[0]).to.be.zero;

      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      motion = await voting.getMotion(motionId);
      expect(motion.totalVotes[0]).to.eq.BN(WAD);

      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      motion = await voting.getMotion(motionId);
      expect(motion.totalVotes[0]).to.eq.BN(WAD);
    });

    it("cannot reveal an invalid vote", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, 2), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      await checkErrorRevert(
        voting.revealVote(motionId, SALT, 2, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-base-bad-vote"
      );
    });

    it("cannot reveal a vote twice, and so cannot vote twice", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(SUBMIT_PERIOD, this);

      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await checkErrorRevert(
        voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-base-secret-no-match"
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
      await forwardTime(SUBMITTER_ONLY_WINDOW + 1, this);
      await repCycle.confirmNewHash(0);

      // Create new motion with new reputation state
      await voting.createMotion(ADDRESS_ZERO, FAKE, domain1Key, domain1Value, domain1Mask2, domain1Siblings2);
      const motionId2 = await voting.getMotionCount();
      await voting.stakeMotion(motionId2, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value2, user0Mask2, user0Siblings2, { from: USER0 });
      await voting.stakeMotion(motionId2, 1, UINT256_MAX, NAY, requiredStake, user1Key, user1Value, user1Mask2, user1Siblings2, { from: USER1 });

      await voting.submitVote(motionId2, soliditySha3(SALT, NAY), user0Key, user0Value2, user0Mask2, user0Siblings2, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      await voting.revealVote(motionId, SALT, NAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.revealVote(motionId2, SALT, NAY, user0Key, user0Value2, user0Mask2, user0Siblings2, { from: USER0 });
    });

    it("cannot submit a null vote", async () => {
      await checkErrorRevert(
        voting.submitVote(motionId, "0x0", user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-base-invalid-secret"
      );
    });

    it("cannot submit a vote if voting is closed", async () => {
      await forwardTime(SUBMIT_PERIOD, this);

      await checkErrorRevert(
        voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-base-motion-not-open"
      );
    });

    it("cannot reveal a vote on a non-existent motion", async () => {
      await forwardTime(SUBMIT_PERIOD, this);

      await checkErrorRevert(
        voting.revealVote(0, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-base-invalid-root-hash"
      );
    });

    it("cannot reveal a vote during the submit period", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await checkErrorRevert(
        voting.revealVote(motionId, SALT, NAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-base-motion-not-reveal"
      );
    });

    it("cannot reveal a vote after the reveal period ends", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);
      await forwardTime(REVEAL_PERIOD, this);

      await checkErrorRevert(
        voting.revealVote(motionId, SALT, NAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-base-motion-not-reveal"
      );
    });

    it("cannot reveal a vote with a bad secret", async () => {
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      await checkErrorRevert(
        voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-base-secret-no-match"
      );
    });
  });

  describe("executing motions", async () => {
    let motionId;

    beforeEach(async () => {
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createMotion(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();
    });

    it("cannot execute a non-existent motion", async () => {
      await checkErrorRevert(voting.finalizeMotion(0), "voting-base-motion-not-finalizable");
    });

    it("motion has no effect if extension does not have permissions", async () => {
      await colony.setAdministrationRole(1, UINT256_MAX, voting.address, 1, false);
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);
      const tasksBefore = await colony.getTaskCount();

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.false;

      const tasksAfter = await colony.getTaskCount();
      expect(tasksAfter).to.eq.BN(tasksBefore);
      await colony.setAdministrationRole(1, UINT256_MAX, voting.address, 1, true);
    });

    it("cannot take an action if there is insufficient support", async () => {
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake.subn(1), user0Key, user0Value, user0Mask, user0Siblings, {
        from: USER0,
      });

      await forwardTime(STAKE_PERIOD, this);

      await checkErrorRevert(voting.finalizeMotion(motionId), "voting-base-motion-not-finalizable");
    });

    it("can take an action if there is insufficient opposition", async () => {
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, requiredStake.subn(1), user1Key, user1Value, user1Mask, user1Siblings, {
        from: USER1,
      });

      await forwardTime(STAKE_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.true;
    });

    it("can take an action with a return value", async () => {
      // Returns a uint256
      const action = await encodeTxData(colony, "version", []);
      await voting.createMotion(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.true;
    });

    it("can take an action with an arbitrary target", async () => {
      const { colony: otherColony, token: otherToken } = await setupRandomColony(colonyNetwork);
      await otherToken.mint(otherColony.address, WAD, { from: USER0 });

      const action = await encodeTxData(colony, "claimColonyFunds", [otherToken.address]);
      await voting.createMotion(otherColony.address, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);

      const balanceBefore = await otherColony.getFundingPotBalance(1, otherToken.address);
      expect(balanceBefore).to.be.zero;

      await voting.finalizeMotion(motionId);

      const balanceAfter = await otherColony.getFundingPotBalance(1, otherToken.address);
      expect(balanceAfter).to.eq.BN(WAD);
    });

    it("can take a nonexistent action", async () => {
      const action = soliditySha3("foo");
      await voting.createMotion(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.false;
    });

    it("cannot take an action during staking or voting", async () => {
      let motionState;
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      motionState = await voting.getMotionState(motionId);
      expect(motionState).to.eq.BN(STAKING);
      await checkErrorRevert(voting.finalizeMotion(motionId), "voting-base-motion-not-finalizable");

      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, requiredStake, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      motionState = await voting.getMotionState(motionId);
      expect(motionState).to.eq.BN(SUBMIT);
      await checkErrorRevert(voting.finalizeMotion(motionId), "voting-base-motion-not-finalizable");
    });

    it("cannot take an action twice", async () => {
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.true;

      await checkErrorRevert(voting.finalizeMotion(motionId), "voting-base-motion-not-finalizable");
    });

    it("can take an action if the motion passes", async () => {
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, requiredStake, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      // Don't need to wait for the reveal period, since 100% of the secret is revealed

      await forwardTime(STAKE_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.true;
    });

    it("cannot take an action if the motion fails", async () => {
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, requiredStake, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

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

      await voting.createMotion(ethers.constants.AddressZero, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId1 = await voting.getMotionCount();

      await voting.stakeMotion(motionId1, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId1, 1, UINT256_MAX, NAY, requiredStake, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(motionId1, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      await voting.revealVote(motionId1, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(REVEAL_PERIOD, this);
      await forwardTime(STAKE_PERIOD, this);

      let logs;
      ({ logs } = await voting.finalizeMotion(motionId1));
      expect(logs[0].args.executed).to.be.true;

      // Create another motion for the same variable
      await voting.createMotion(ethers.constants.AddressZero, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId2 = await voting.getMotionCount();

      await voting.stakeMotion(motionId2, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId2, 1, UINT256_MAX, NAY, requiredStake, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

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

      await voting.createMotion(ethers.constants.AddressZero, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, requiredStake, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(REVEAL_PERIOD, this);
      await forwardTime(ESCALATION_PERIOD, this);

      await voting.finalizeMotion(motionId);
      const slotHash = hashExpenditureSlot(action);
      const pastVote = await voting.getExpenditurePastVote(slotHash);
      expect(pastVote).to.eq.BN(WAD.muln(2)); // USER0 had 1 WAD each of reputation and tokens
    });

    it("can use vote power correctly for different values of the same variable", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1);
      const expenditureId = await colony.getExpenditureCount();

      // Set finalizedTimestamp
      const action1 = await encodeTxData(colony, "setExpenditureState", [1, UINT256_MAX, expenditureId, 25, [true], [bn2bytes32(new BN(3))], WAD32]);
      const action2 = await encodeTxData(colony, "setExpenditureState", [1, UINT256_MAX, expenditureId, 25, [true], [bn2bytes32(new BN(3))], "0x0"]);

      await voting.createMotion(ADDRESS_ZERO, action1, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId1 = await voting.getMotionCount();

      await voting.createMotion(ADDRESS_ZERO, action2, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId2 = await voting.getMotionCount();

      await voting.stakeMotion(motionId1, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId2, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

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

      await voting.createMotion(ethers.constants.AddressZero, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);

      await voting.finalizeMotion(motionId);
      const slotHash = hashExpenditureSlot(action);
      const pastVote = await voting.getExpenditurePastVote(slotHash);
      expect(pastVote).to.eq.BN(requiredStake);
    });
  });

  describe("claiming rewards", async () => {
    let motionId;

    beforeEach(async () => {
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createMotion(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      motionId = await voting.getMotionCount();
    });

    it("cannot claim rewards from a non-existent motion", async () => {
      await checkErrorRevert(voting.claimReward(0, 1, UINT256_MAX, USER0, YAY), "voting-base-motion-not-claimable");
    });

    it("can let stakers claim rewards, based on the stake outcome", async () => {
      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      const numEntriesPrev = await repCycle.getReputationUpdateLogLength();

      const nayStake = requiredStake.divn(2);
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
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
      const expectedReward0 = requiredStake.add(requiredStake.divn(20)); // 110% of stake
      const expectedReward1 = requiredStake.divn(20).muln(9); // 90% of stake

      expect(new BN(user0LockPost.balance).sub(new BN(user0LockPre.balance))).to.eq.BN(expectedReward0);
      expect(new BN(user1LockPost.balance).sub(new BN(user1LockPre.balance))).to.eq.BN(expectedReward1);

      // Now check that user0 has no penalty, while user1 has a 10% penalty
      const numEntriesPost = await repCycle.getReputationUpdateLogLength();
      expect(numEntriesPost.sub(numEntriesPrev)).to.eq.BN(1);

      const repUpdate = await repCycle.getReputationUpdateLogEntry(numEntriesPost.subn(1));
      expect(repUpdate.user).to.equal(USER1);
      expect(repUpdate.amount).to.eq.BN(requiredStake.divn(20).neg());
    });

    it("can let stakers claim rewards, based on the vote outcome", async () => {
      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      const numEntriesPrev = await repCycle.getReputationUpdateLogLength();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, requiredStake, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(SUBMIT_PERIOD, this);

      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.revealVote(motionId, SALT, NAY, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(REVEAL_PERIOD, this);

      await voting.finalizeMotion(motionId);

      const user0LockPre = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPre = await tokenLocking.getUserLock(token.address, USER1);

      await voting.claimReward(motionId, 1, UINT256_MAX, USER0, YAY);
      await voting.claimReward(motionId, 1, UINT256_MAX, USER1, NAY);

      const user0LockPost = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPost = await tokenLocking.getUserLock(token.address, USER1);

      const motion = await voting.getMotion(motionId);
      const loserStake = requiredStake.sub(new BN(motion.paidVoterComp));
      const expectedReward0 = loserStake.divn(3).muln(2).addn(1); // (stake * .8) * (winPct = 1/3 * 2) + dust
      const expectedReward1 = requiredStake.add(loserStake.divn(3)); // stake + ((stake * .8) * (1 - (winPct = 2/3 * 2))

      expect(new BN(user0LockPost.balance).sub(new BN(user0LockPre.balance))).to.eq.BN(expectedReward0);
      expect(new BN(user1LockPost.balance).sub(new BN(user1LockPre.balance))).to.eq.BN(expectedReward1);

      // Now check that user1 has no penalty, while user0 has a 1/3 penalty
      const numEntriesPost = await repCycle.getReputationUpdateLogLength();
      expect(numEntriesPost.sub(numEntriesPrev)).to.eq.BN(1);

      const repUpdate = await repCycle.getReputationUpdateLogEntry(numEntriesPost.subn(1));
      expect(repUpdate.user).to.equal(USER0);
      expect(repUpdate.amount).to.eq.BN(requiredStake.sub(expectedReward0).neg());
    });

    it("can let stakers claim their original stake if neither side fully staked", async () => {
      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      const numEntriesPrev = await repCycle.getReputationUpdateLogLength();

      const half = requiredStake.divn(2);
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
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, requiredStake, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(REVEAL_PERIOD, this);
      await forwardTime(ESCALATION_PERIOD, this);

      await voting.finalizeMotion(motionId);

      await voting.claimReward(motionId, 1, UINT256_MAX, USER0, YAY);

      await checkErrorRevert(voting.claimReward(motionId, 1, UINT256_MAX, USER0, YAY), "voting-base-nothing-to-claim");
    });

    it("cannot claim rewards before a motion is finalized", async () => {
      await checkErrorRevert(voting.claimReward(motionId, 1, UINT256_MAX, USER0, YAY), "voting-base-motion-not-claimable");
    });

    it("can unlock the token after claiming", async () => {
      const user2Key = makeReputationKey(colony.address, domain1.skillId, USER2);
      const user2Value = makeReputationValue(WAD.divn(10000), 4);
      const [user2Mask, user2Siblings] = await reputationTree.getProof(user2Key);

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, requiredStake, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user2Key, user2Value, user2Mask, user2Siblings, { from: USER2 });

      await forwardTime(SUBMIT_PERIOD, this);

      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.revealVote(motionId, SALT, NAY, user2Key, user2Value, user2Mask, user2Siblings, { from: USER2 });

      await forwardTime(REVEAL_PERIOD, this);
      await forwardTime(ESCALATION_PERIOD, this);

      await voting.finalizeMotion(motionId);

      let lockCount;
      const lockId = await voting.getLockId(motionId);

      ({ lockCount } = await tokenLocking.getUserLock(token.address, USER1));
      expect(lockCount).to.be.zero;

      await voting.claimReward(motionId, 1, UINT256_MAX, USER1, NAY);

      ({ lockCount } = await tokenLocking.getUserLock(token.address, USER1));
      expect(lockCount).to.eq.BN(lockId);
    });
  });
});
