const path = require("path");
const BN = require("bn.js");
const { toBN } = require("web3-utils");
const chai = require("chai");
const bnChai = require("bn-chai");

const { TruffleLoader } = require("../../packages/package-utils");
const {
  forwardTime,
  checkErrorRevert,
  checkErrorRevertEthers,
  submitAndForwardTimeToDispute,
  runBinarySearch,
  getActiveRepCycle,
  advanceMiningCycleNoContest,
  accommodateChallengeAndInvalidateHash,
  finishReputationMiningCycle,
} = require("../../helpers/test-helper");

const {
  giveUserCLNYTokensAndStake,
  setupFinalizedTask,
  fundColonyWithTokens,
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
} = require("../../helpers/test-data-generator");

const {
  INT128_MAX,
  DEFAULT_STAKE,
  INITIAL_FUNDING,
  MINING_CYCLE_DURATION,
  CHALLENGE_RESPONSE_WINDOW_DURATION,
  GLOBAL_SKILL_ID,
} = require("../../helpers/constants");

const ReputationMinerTestWrapper = require("../../packages/reputation-miner/test/ReputationMinerTestWrapper");
const MaliciousReputationMinerExtraRep = require("../../packages/reputation-miner/test/MaliciousReputationMinerExtraRep");
const MaliciousReputationMinerWrongUID = require("../../packages/reputation-miner/test/MaliciousReputationMinerWrongUID");
const MaliciousReputationMinerReuseUID = require("../../packages/reputation-miner/test/MaliciousReputationMinerReuseUID");
const MaliciousReputationMinerClaimNew = require("../../packages/reputation-miner/test/MaliciousReputationMinerClaimNew");
const MaliciousReputationMinerWrongJRH = require("../../packages/reputation-miner/test/MaliciousReputationMinerWrongJRH");
const MaliciousReputationMinerWrongJRHRightNLeaves = require("../../packages/reputation-miner/test/MaliciousReputationMinerWrongJRHRightNLeaves");
const MaliciousReputationMinerWrongNLeaves = require("../../packages/reputation-miner/test/MaliciousReputationMinerWrongNLeaves");
const MaliciousReputationMinerWrongNLeaves2 = require("../../packages/reputation-miner/test/MaliciousReputationMinerWrongNLeaves2");
const MaliciousReputationMinerAddNewReputation = require("../../packages/reputation-miner/test/MaliciousReputationMinerAddNewReputation");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "../..", "build", "contracts"),
});

const useJsTree = true;

let metaColony;
let colonyNetwork;
let clnyToken;
let goodClient;
const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

const setupNewNetworkInstance = async (MINER1, MINER2) => {
  colonyNetwork = await setupColonyNetwork();
  ({ metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

  await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);
  await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);
  await colonyNetwork.initialiseReputationMining();
  await colonyNetwork.startNextCycle();

  goodClient = new ReputationMinerTestWrapper({ loader, realProviderPort, useJsTree, minerAddress: MINER1 });
};

contract("Reputation Mining - types of disagreement", (accounts) => {
  const MINER1 = accounts[5];
  const MINER2 = accounts[6];

  before(async () => {
    // Setup a new network instance as we'll be modifying the global skills tree
    await setupNewNetworkInstance(MINER1, MINER2);
  });

  beforeEach(async () => {
    await goodClient.initialise(colonyNetwork.address);
    await goodClient.resetDB();

    // Advance two cycles to clear active and inactive state.
    await advanceMiningCycleNoContest({ colonyNetwork, test: this });
    await advanceMiningCycleNoContest({ colonyNetwork, test: this });

    // The inactive reputation log now has the reward for this miner, and the accepted state is empty.
    // This is the same starting point for all tests.
    const repCycle = await getActiveRepCycle(colonyNetwork);
    const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
    expect(nInactiveLogEntries).to.eq.BN(1);
  });

  afterEach(async () => {
    const reputationMiningGotClean = await finishReputationMiningCycle(colonyNetwork, this);
    if (!reputationMiningGotClean) await setupNewNetworkInstance(MINER1, MINER2);
  });

  describe("when there is a dispute over reputation root hash", () => {
    it("should cope when a new reputation is correctly added and an extra reputation is added elsewhere at the same time", async () => {
      await fundColonyWithTokens(metaColony, clnyToken);
      const badClient = new MaliciousReputationMinerAddNewReputation({ loader, minerAddress: MINER2, realProviderPort, useJsTree }, 3);
      await badClient.initialise(colonyNetwork.address);

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-adjacent-disagree-state-disagreement" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("should allow a user to confirm a submitted JRH with proofs for a submission", async () => {
      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 1, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await fundColonyWithTokens(metaColony, clnyToken);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 5 updates: 1 for the previous mining cycle and 4 for the task.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nInactiveLogEntries).to.eq.BN(5);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const nUniqueSubmittedHashes = await repCycle.getNUniqueSubmittedHashes();
      expect(nUniqueSubmittedHashes).to.eq.BN(2);

      const [round1, index1] = await goodClient.getMySubmissionRoundAndIndex();
      const disputedRound = await repCycle.getDisputeRound(round1);
      const disputedEntry = disputedRound[index1];
      const submission = await repCycle.getReputationHashSubmission(goodClient.minerAddress);

      expect(submission.jrhNNLeaves).to.be.zero;
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      await goodClient.confirmJustificationRootHash();

      // Check that we can't re-submit a JRH
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await checkErrorRevertEthers(goodClient.confirmJustificationRootHash(), "colony-reputation-jrh-hash-already-verified");

      const submissionAfterJRHConfirmed = await repCycle.getReputationHashSubmission(goodClient.minerAddress);
      const jrh = await goodClient.justificationTree.getRootHash();
      expect(submissionAfterJRHConfirmed.jrh).to.eq.BN(jrh);

      // Check 'last response' was updated.
      const [round2, index2] = await goodClient.getMySubmissionRoundAndIndex();
      const disputeRoundAfter = await repCycle.getDisputeRound(round2);
      const disputedEntryAfter = await disputeRoundAfter[index2];
      expect(disputedEntry.lastResponseTimestamp).to.not.eq.BN(disputedEntryAfter.lastResponseTimestamp);

      // Cleanup
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("should cope if the wrong reputation transition is the first transition", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 0, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await goodClient.saveCurrentState();
      const savedHash = await goodClient.reputationTree.getRootHash();

      await badClient.loadState(savedHash);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("should allow a binary search between opponents to take place to find their first disagreement", async () => {
      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the task.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nInactiveLogEntries).to.eq.BN(13);

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 12, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      const nUniqueSubmittedHashes = await repCycle.getNUniqueSubmittedHashes();
      expect(nUniqueSubmittedHashes).to.eq.BN(2);

      await goodClient.confirmJustificationRootHash();
      const submissionAfterJRHConfirmed = await repCycle.getReputationHashSubmission(goodClient.minerAddress);
      const jrh = await goodClient.justificationTree.getRootHash();
      expect(submissionAfterJRHConfirmed.jrh).to.eq.BN(jrh);

      await badClient.confirmJustificationRootHash();
      const badSubmissionAfterJRHConfirmed = await repCycle.getReputationHashSubmission(badClient.minerAddress);
      const badJrh = await badClient.justificationTree.getRootHash();
      expect(badSubmissionAfterJRHConfirmed.jrh).to.eq.BN(badJrh);

      let round0 = await repCycle.getDisputeRound(0);
      let goodDisputedEntry = round0[0];
      let badDisputedEntry = round0[1];
      expect(goodDisputedEntry.challengeStepCompleted).to.eq.BN(1); // Challenge steps completed
      expect(goodDisputedEntry.lowerBound).to.be.zero; // Lower bound for binary search
      expect(goodDisputedEntry.upperBound).to.eq.BN(28); // Upper bound for binary search
      expect(badDisputedEntry.challengeStepCompleted).to.eq.BN(1);
      expect(badDisputedEntry.lowerBound).to.be.zero;
      expect(badDisputedEntry.upperBound).to.eq.BN(28);

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      await goodClient.respondToBinarySearchForChallenge();
      round0 = await repCycle.getDisputeRound(0);
      [goodDisputedEntry, badDisputedEntry] = round0;
      expect(goodDisputedEntry.challengeStepCompleted).to.eq.BN(2);
      expect(goodDisputedEntry.lowerBound).to.be.zero;
      expect(goodDisputedEntry.upperBound).to.eq.BN(28);
      expect(badDisputedEntry.challengeStepCompleted).to.eq.BN(1);
      expect(badDisputedEntry.lowerBound).to.be.zero;
      expect(badDisputedEntry.upperBound).to.eq.BN(28);

      await badClient.respondToBinarySearchForChallenge();
      round0 = await repCycle.getDisputeRound(0);
      [goodDisputedEntry, badDisputedEntry] = round0;
      expect(goodDisputedEntry.lowerBound).to.be.zero;
      expect(goodDisputedEntry.upperBound).to.eq.BN(15);
      expect(badDisputedEntry.lowerBound).to.be.zero;
      expect(badDisputedEntry.upperBound).to.eq.BN(15);

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      round0 = await repCycle.getDisputeRound(0);
      [goodDisputedEntry, badDisputedEntry] = round0;
      expect(goodDisputedEntry.lowerBound).to.eq.BN(8);
      expect(goodDisputedEntry.upperBound).to.eq.BN(15);
      expect(badDisputedEntry.lowerBound).to.eq.BN(8);
      expect(badDisputedEntry.upperBound).to.eq.BN(15);

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      round0 = await repCycle.getDisputeRound(0);
      [goodDisputedEntry, badDisputedEntry] = round0;
      expect(goodDisputedEntry.lowerBound).to.eq.BN(12);
      expect(goodDisputedEntry.upperBound).to.eq.BN(15);
      expect(badDisputedEntry.lowerBound).to.eq.BN(12);
      expect(badDisputedEntry.upperBound).to.eq.BN(15);

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      round0 = await repCycle.getDisputeRound(0);
      [goodDisputedEntry, badDisputedEntry] = round0;
      expect(goodDisputedEntry.lowerBound).to.eq.BN(12);
      expect(goodDisputedEntry.upperBound).to.eq.BN(13);
      expect(badDisputedEntry.lowerBound).to.eq.BN(12);
      expect(badDisputedEntry.upperBound).to.eq.BN(13);

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      round0 = await repCycle.getDisputeRound(0);
      [goodDisputedEntry, badDisputedEntry] = round0;
      expect(goodDisputedEntry.lowerBound).to.eq.BN(13);
      expect(goodDisputedEntry.upperBound).to.eq.BN(13);
      expect(badDisputedEntry.lowerBound).to.eq.BN(13);
      expect(badDisputedEntry.upperBound).to.eq.BN(13);

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      // TODO: Split off in to  another test here, but can't be bothered to refactor right now.
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      await goodClient.respondToChallenge();
      await checkErrorRevertEthers(badClient.respondToChallenge(), "colony-reputation-mining-increased-reputation-value-incorrect");

      // Check
      round0 = await repCycle.getDisputeRound(0);
      const [goodDisputedEntryAfterResponseToChallenge, badDisputedEntryAfterResponseToChallenge] = round0;
      const delta =
        goodDisputedEntryAfterResponseToChallenge.challengeStepCompleted - badDisputedEntryAfterResponseToChallenge.challengeStepCompleted;
      expect(delta).to.eq.BN(1);
      // checks that challengeStepCompleted is one more for the good submission than the bad one.

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.invalidateHash(0, 1, { from: MINER1 });
    });

    it("if respondToChallenge is attempted to be called multiple times, it should fail", async () => {
      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the tasks.
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nInactiveLogEntries).to.eq.BN(13);

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 27, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      await goodClient.respondToChallenge();
      await checkErrorRevertEthers(goodClient.respondToChallenge(), "colony-reputation-mining-challenge-already-responded");
      await checkErrorRevertEthers(badClient.respondToChallenge(), "colony-reputation-mining-increased-reputation-value-incorrect");

      await checkErrorRevert(repCycle.invalidateHash(0, 0, { from: MINER1 }), "colony-reputation-mining-less-challenge-rounds-completed");

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1, { from: MINER1 });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      await repCycle.confirmNewHash(1, { from: MINER1 });

      const rightHash = await goodClient.getRootHash();
      const confirmedHash = await colonyNetwork.getReputationRootHash();
      expect(confirmedHash).to.equal(rightHash);
    });

    it("if someone tries to insert a second copy of an existing reputation as a new one, it should fail", async () => {
      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });
      const repCycle = await getActiveRepCycle(colonyNetwork);

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the tasks.
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nInactiveLogEntries).to.eq.BN(13);

      const badClient = new MaliciousReputationMinerClaimNew({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 20);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-adjacent-branchmask-incorrect" },
      });

      // Cleanup
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });
  });

  describe("should correctly resolve dispute over nLeaves", () => {
    it("where the submitted nLeaves is lied about", async () => {
      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 5 updates: 1 for the previous mining cycle and 1x4 for the task.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nInactiveLogEntries).to.eq.BN(5);

      const badClient = new MaliciousReputationMinerWrongNLeaves({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 8);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { confirmJustificationRootHash: "colony-reputation-mining-invalid-jrh-proof-2" },
      });

      // Cleanup
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("where the number of leaves has been incremented incorrectly when adding a new reputation", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const badClient = new MaliciousReputationMinerWrongNLeaves2({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 3, 1);
      await badClient.initialise(colonyNetwork.address);

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-network-mining-more-than-one-leaf-added" },
      });
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("where the number of leaves has been incremented during an update of an existing reputation", async () => {
      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 5 updates: 1 for the previous mining cycle and 1x4 for the task.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nInactiveLogEntries).to.eq.BN(5);

      const badClient = new MaliciousReputationMinerWrongNLeaves2({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 8, 1);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-adjacent-agree-state-disagreement" },
      });

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });
  });

  describe("should correctly resolve dispute over JRH", () => {
    it("because a leaf in the JT is wrong", async () => {
      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 5 updates: 1 for the previous mining cycle and 1x4 for the tasks.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nInactiveLogEntries).to.eq.BN(5);

      const badClient = new MaliciousReputationMinerWrongJRH({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 8);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToBinarySearchForChallenge: [undefined, "colony-reputation-mining-invalid-binary-search-proof-length"] },
      });

      // Cleanup
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("with an extra leaf causing proof 1 to be too long", async () => {
      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 5 updates: 1 for the previous mining cycle and 1x4 for the tasks.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nInactiveLogEntries).to.eq.BN(5);

      const badClient = new MaliciousReputationMinerWrongJRH({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 500000);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      await goodClient.confirmJustificationRootHash();
      await checkErrorRevertEthers(badClient.confirmJustificationRootHash(), "colony-reputation-mining-invalid-jrh-proof-1-length");

      // Cleanup
      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1, { from: MINER1 });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("with an extra leaf inserted and a leaf removed causing proof lengths to be right, but JT wrong", async () => {
      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 5 updates: 1 for the previous mining cycle and 1x4 for the tasks.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nInactiveLogEntries).to.eq.BN(5);

      const badClient = new MaliciousReputationMinerWrongJRHRightNLeaves(
        { loader, realProviderPort, useJsTree, minerAddress: MINER2 },
        [500000],
        [1, 11, 10, 9, 8]
      );
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      await goodClient.confirmJustificationRootHash();
      await checkErrorRevertEthers(badClient.confirmJustificationRootHash(), "colony-reputation-mining-invalid-jrh-proof-1");

      // Cleanup
      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1, { from: MINER1 });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("with an extra leaf causing proof 2 to be too long", async () => {
      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation updates for 3 task completions (manager, worker, evaluator);
      // That's 13 in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nInactiveLogEntries).to.eq.BN(13);

      const badClient = new MaliciousReputationMinerWrongJRH({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 30);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { confirmJustificationRootHash: "colony-reputation-mining-invalid-jrh-proof-2-length" },
      });
    });
  });

  describe("should correctly resolve dispute over reputation UID", () => {
    it("if an existing reputation's uniqueID is changed", async () => {
      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the tasks.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nInactiveLogEntries).to.eq.BN(13);

      const badClient = new MaliciousReputationMinerWrongUID({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 12, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await goodClient.respondToChallenge();
      await checkErrorRevertEthers(badClient.respondToChallenge(), "colony-reputation-mining-uid-changed-for-existing-reputation");

      // Check
      const disputeRound = await repCycle.getDisputeRound(0);
      const goodDisputedEntryAfterResponseToChallenge = disputeRound[0];
      const badDisputedEntryAfterResponseToChallenge = disputeRound[1];
      const delta =
        goodDisputedEntryAfterResponseToChallenge.challengeStepCompleted - badDisputedEntryAfterResponseToChallenge.challengeStepCompleted;
      expect(delta).to.eq.BN(1);

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1, { from: MINER1 });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("if a new reputation's uniqueID is wrong", async () => {
      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the tasks.
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nInactiveLogEntries).to.eq.BN(13);

      const badClient = new MaliciousReputationMinerReuseUID({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 3, 1);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-new-uid-incorrect" },
      });
    });
  });

  describe("should correctly resolve dispute over reputation value", () => {
    it("if a reputation decay calculation is wrong", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      let repCycle = await getActiveRepCycle(colonyNetwork);

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 1, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });

      await badClient.resetDB();
      await badClient.initialise(colonyNetwork.address);

      const keys = Object.keys(goodClient.reputations);
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        const value = goodClient.reputations[key];
        const score = new BN(value.slice(2, 66), 16);
        await badClient.insert(key, score, 0);
      }

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" },
      });
      repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("if an update makes reputation amount go over the max, in a dispute, it should be limited to the max value", async () => {
      const fundsRequired = INT128_MAX.add(new BN(1000000000000).muln(2)).add(new BN(1000000000).muln(2));
      await fundColonyWithTokens(metaColony, clnyToken, fundsRequired);

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: GLOBAL_SKILL_ID,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 1000000000000,
        managerRating: 2,
        workerRating: 2,
        worker: accounts[4],
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const workerPayout = INT128_MAX.sub(new BN(1000000000000));
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: GLOBAL_SKILL_ID,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout,
        managerRating: 2,
        workerRating: 2,
        worker: accounts[4],
      });

      await goodClient.resetDB();
      await goodClient.addLogContentsToReputationTree();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation updates for one task completion (manager, worker (skill and domain), evaluator);
      // That's five in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nLogEntries).to.eq.BN(5);

      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, realProviderPort, useJsTree, minerAddress: MINER2 },
        17,
        toBN("170141183460469231731687302715884105727").mul(toBN(-1))
      );
      await badClient.initialise(colonyNetwork.address);

      // Moving the state to the bad client
      const currentGoodClientState = await goodClient.getRootHash();
      await badClient.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-reputation-not-max-int128" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });
  });
});
