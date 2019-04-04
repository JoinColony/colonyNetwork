/* globals artifacts */

import path from "path";
import BN from "bn.js";
import { toBN } from "web3-utils";
import chai from "chai";
import bnChai from "bn-chai";
import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";

import {
  forwardTime,
  checkErrorRevert,
  checkErrorRevertEthers,
  submitAndForwardTimeToDispute,
  runBinarySearch,
  getActiveRepCycle,
  advanceMiningCycleNoContest,
  accommodateChallengeAndInvalidateHash,
  finishReputationMiningCycleAndWithdrawAllMinerStakes,
  takeSnapshot,
  revertToSnapshot
} from "../../helpers/test-helper";

import {
  giveUserCLNYTokensAndStake,
  setupFinalizedTask,
  fundColonyWithTokens,
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken
} from "../../helpers/test-data-generator";

import { INT128_MAX, DEFAULT_STAKE, INITIAL_FUNDING, MINING_CYCLE_DURATION } from "../../helpers/constants";

import ReputationMinerTestWrapper from "../../packages/reputation-miner/test/ReputationMinerTestWrapper";
import MaliciousReputationMinerExtraRep from "../../packages/reputation-miner/test/MaliciousReputationMinerExtraRep";
import MaliciousReputationMinerWrongUID from "../../packages/reputation-miner/test/MaliciousReputationMinerWrongUID";
import MaliciousReputationMinerReuseUID from "../../packages/reputation-miner/test/MaliciousReputationMinerReuseUID";
import MaliciousReputationMinerWrongNewestReputation from "../../packages/reputation-miner/test/MaliciousReputationMinerWrongNewestReputation";
import MaliciousReputationMinerClaimNew from "../../packages/reputation-miner/test/MaliciousReputationMinerClaimNew";
import MaliciousReputationMinerUnsure from "../../packages/reputation-miner/test/MaliciousReputationMinerUnsure";
import MaliciousReputationMinerWrongJRH from "../../packages/reputation-miner/test/MaliciousReputationMinerWrongJRH";
import MaliciousReputationMinerWrongNNodes from "../../packages/reputation-miner/test/MaliciousReputationMinerWrongNNodes";
import MaliciousReputationMinerWrongNNodes2 from "../../packages/reputation-miner/test/MaliciousReputationMinerWrongNNodes2";
import MaliciousReputationMinerAddNewReputation from "../../packages/reputation-miner/test/MaliciousReputationMinerAddNewReputation";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ITokenLocking = artifacts.require("ITokenLocking");

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "..", "build", "contracts")
});

const useJsTree = true;

contract("Reputation Mining - types of disagreement", accounts => {
  const MINER1 = accounts[5];
  const MINER2 = accounts[6];

  let metaColony;
  let colonyNetwork;
  let tokenLocking;
  let clnyToken;
  let goodClient;
  let latestSnapShotId;
  const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

  before(async () => {
    // Setup a new network instance as we'll be modifying the global skills tree
    colonyNetwork = await setupColonyNetwork();
    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await ITokenLocking.at(tokenLockingAddress);
    ({ metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

    await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);
    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();

    goodClient = new ReputationMinerTestWrapper({ loader, realProviderPort, useJsTree, minerAddress: MINER1 });
  });

  beforeEach(async () => {
    await goodClient.resetDB();
    await goodClient.initialise(colonyNetwork.address);

    // Kick off reputation mining.
    const lock = await tokenLocking.getUserLock(clnyToken.address, MINER1);
    expect(lock.balance).to.eq.BN(DEFAULT_STAKE);

    // Advance two cycles to clear active and inactive state.
    await advanceMiningCycleNoContest({ colonyNetwork, test: this });
    await advanceMiningCycleNoContest({ colonyNetwork, test: this });

    // The inactive reputation log now has the reward for this miner, and the accepted state is empty.
    // This is the same starting point for all tests.
    const repCycle = await getActiveRepCycle(colonyNetwork);
    const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
    expect(nInactiveLogEntries).to.eq.BN(1);

    // Burn MINER1S accumulated mining rewards.
    const userBalance = await clnyToken.balanceOf(MINER1);
    await clnyToken.burn(userBalance, { from: MINER1 });
    latestSnapShotId = await takeSnapshot();
  });

  afterEach(async () => {
    const isStateGotReset = await finishReputationMiningCycleAndWithdrawAllMinerStakes(colonyNetwork, this);
    if (!isStateGotReset) await revertToSnapshot(latestSnapShotId);
  });

  describe("when there is a dispute over reputation root hash", () => {
    it("should cope when a new reputation is correctly added and an extra reputation is added elsewhere at the same time", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);
      await fundColonyWithTokens(metaColony, clnyToken);
      const badClient = new MaliciousReputationMinerAddNewReputation({ loader, minerAddress: MINER2, realProviderPort, useJsTree }, 3);
      await badClient.initialise(colonyNetwork.address);

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-adjacent-disagree-state-disagreement" }
      });
      await repCycle.confirmNewHash(1);
    });

    it("should allow a user to confirm a submitted JRH with proofs for a submission", async () => {
      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 1, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 5 updates: 1 for the previous mining cycle and 4 for the task.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nInactiveLogEntries).to.eq.BN(5);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const nSubmittedHashes = await repCycle.getNSubmittedHashes();
      expect(nSubmittedHashes).to.eq.BN(2);

      const submission = await repCycle.getDisputeRounds(0, 0);

      expect(submission.jrhNNodes).to.be.zero;
      await forwardTime(10, this); // This is just to ensure that the timestamps checked below will be different if JRH was submitted.

      await goodClient.confirmJustificationRootHash();

      // Check that we can't re-submit a JRH
      await checkErrorRevertEthers(goodClient.confirmJustificationRootHash(), "colony-reputation-jrh-hash-already-verified");

      const submissionAfterJRHConfirmed = await repCycle.getDisputeRounds(0, 0);
      const jrh = await goodClient.justificationTree.getRootHash();
      expect(submissionAfterJRHConfirmed.jrh).to.eq.BN(jrh);

      // Check 'last response' was updated.
      expect(submission.lastResponseTimestamp).to.not.eq.BN(submissionAfterJRHConfirmed.lastResponseTimestamp);

      // Cleanup
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
      });
      await repCycle.confirmNewHash(1);
    });

    it("should cope if the wrong reputation transition is the first transition", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);
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
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" }
      });
      await repCycle.confirmNewHash(1);
    });

    it("should allow a binary search between opponents to take place to find their first disagreement", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

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

      const nSubmittedHashes = await repCycle.getNSubmittedHashes();
      expect(nSubmittedHashes).to.eq.BN(2);

      await goodClient.confirmJustificationRootHash();
      const submissionAfterJRHConfirmed = await repCycle.getDisputeRounds(0, 0);
      const jrh = await goodClient.justificationTree.getRootHash();
      expect(submissionAfterJRHConfirmed.jrh).to.eq.BN(jrh);

      await badClient.confirmJustificationRootHash();
      const badSubmissionAfterJRHConfirmed = await repCycle.getDisputeRounds(0, 1);
      const badJrh = await badClient.justificationTree.getRootHash();
      expect(badSubmissionAfterJRHConfirmed.jrh).to.eq.BN(badJrh);

      let goodSubmission = await repCycle.getDisputeRounds(0, 0);
      let badSubmission = await repCycle.getDisputeRounds(0, 1);
      expect(goodSubmission.challengeStepCompleted).to.eq.BN(1); // Challenge steps completed
      expect(goodSubmission.lowerBound).to.be.zero; // Lower bound for binary search
      expect(goodSubmission.upperBound).to.eq.BN(28); // Upper bound for binary search
      expect(badSubmission.challengeStepCompleted).to.eq.BN(1);
      expect(badSubmission.lowerBound).to.be.zero;
      expect(badSubmission.upperBound).to.eq.BN(28);

      await goodClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.getDisputeRounds(0, 0);
      badSubmission = await repCycle.getDisputeRounds(0, 1);
      expect(goodSubmission.challengeStepCompleted).to.eq.BN(2);
      expect(goodSubmission.lowerBound).to.be.zero;
      expect(goodSubmission.upperBound).to.eq.BN(28);
      expect(badSubmission.challengeStepCompleted).to.eq.BN(1);
      expect(badSubmission.lowerBound).to.be.zero;
      expect(badSubmission.upperBound).to.eq.BN(28);

      await badClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.getDisputeRounds(0, 0);
      badSubmission = await repCycle.getDisputeRounds(0, 1);
      expect(goodSubmission.lowerBound).to.be.zero;
      expect(goodSubmission.upperBound).to.eq.BN(15);
      expect(badSubmission.lowerBound).to.be.zero;
      expect(badSubmission.upperBound).to.eq.BN(15);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.getDisputeRounds(0, 0);
      badSubmission = await repCycle.getDisputeRounds(0, 1);
      expect(goodSubmission.lowerBound).to.eq.BN(8);
      expect(goodSubmission.upperBound).to.eq.BN(15);
      expect(badSubmission.lowerBound).to.eq.BN(8);
      expect(badSubmission.upperBound).to.eq.BN(15);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.getDisputeRounds(0, 0);
      badSubmission = await repCycle.getDisputeRounds(0, 1);

      expect(goodSubmission.lowerBound).to.eq.BN(12);
      expect(goodSubmission.upperBound).to.eq.BN(15);
      expect(badSubmission.lowerBound).to.eq.BN(12);
      expect(badSubmission.upperBound).to.eq.BN(15);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.getDisputeRounds(0, 0);
      badSubmission = await repCycle.getDisputeRounds(0, 1);
      expect(goodSubmission.lowerBound).to.eq.BN(12);
      expect(goodSubmission.upperBound).to.eq.BN(13);
      expect(badSubmission.lowerBound).to.eq.BN(12);
      expect(badSubmission.upperBound).to.eq.BN(13);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.getDisputeRounds(0, 0);
      badSubmission = await repCycle.getDisputeRounds(0, 1);
      expect(goodSubmission.lowerBound).to.eq.BN(13);
      expect(goodSubmission.upperBound).to.eq.BN(13);
      expect(badSubmission.lowerBound).to.eq.BN(13);
      expect(badSubmission.upperBound).to.eq.BN(13);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      // TODO: Split off in to  another test here, but can't be bothered to refactor right now.
      await goodClient.respondToChallenge();
      await checkErrorRevertEthers(badClient.respondToChallenge(), "colony-reputation-mining-increased-reputation-value-incorrect");

      // Check
      const goodSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 0);
      const badSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 1);
      const delta = goodSubmissionAfterResponseToChallenge.challengeStepCompleted - badSubmissionAfterResponseToChallenge.challengeStepCompleted;
      expect(delta).to.eq.BN(1);
      // checks that challengeStepCompleted is one more for the good submission than the bad one.

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1);
    });

    it("if respondToChallenge is attempted to be called multiple times, it should fail", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

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

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await goodClient.respondToChallenge();
      await checkErrorRevertEthers(goodClient.respondToChallenge(), "colony-reputation-mining-challenge-already-responded");
      await checkErrorRevertEthers(badClient.respondToChallenge(), "colony-reputation-mining-increased-reputation-value-incorrect");

      await checkErrorRevert(repCycle.invalidateHash(0, 0), "colony-reputation-mining-less-challenge-rounds-completed");

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);

      const rightHash = await goodClient.getRootHash();
      const confirmedHash = await colonyNetwork.getReputationRootHash();
      expect(confirmedHash).to.equal(rightHash);
    });

    it("if someone tries to insert a second copy of an existing reputation as a new one, it should fail", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

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
        client2: { respondToChallenge: "colony-reputation-mining-adjacent-branchmask-incorrect" }
      });

      // Cleanup
      await repCycle.confirmNewHash(1);
    });
  });

  describe("should correctly resolve dispute over nNodes", () => {
    it("where the submitted nNodes is lied about", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 5 updates: 1 for the previous mining cycle and 1x4 for the task.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nInactiveLogEntries).to.eq.BN(5);

      const badClient = new MaliciousReputationMinerWrongNNodes({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 8);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { confirmJustificationRootHash: "colony-reputation-mining-invalid-jrh-proof-2" }
      });

      // Cleanup
      await repCycle.confirmNewHash(1);
    });

    it("where the number of nodes has been incremented incorrectly when adding a new reputation", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const badClient = new MaliciousReputationMinerWrongNNodes2({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 3, 1);
      await badClient.initialise(colonyNetwork.address);

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-network-mining-more-than-one-node-added" }
      });
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await repCycle.confirmNewHash(1);
    });

    it("where the number of nodes has been incremented during an update of an existing reputation", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 5 updates: 1 for the previous mining cycle and 1x4 for the task.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nInactiveLogEntries).to.eq.BN(5);

      const badClient = new MaliciousReputationMinerWrongNNodes2({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 8, 1);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-adjacent-agree-state-disagreement" }
      });

      await repCycle.confirmNewHash(1);
    });
  });

  describe("should correctly resolve dispute over JRH", () => {
    it("because a leaf in the JT is wrong", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

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
        client2: { respondToBinarySearchForChallenge: [undefined, "colony-reputation-mining-invalid-binary-search-proof-length"] }
      });

      // Cleanup
      await repCycle.confirmNewHash(1);
    });

    it("with an extra leaf causing proof 1 to be too long", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

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
      await goodClient.confirmJustificationRootHash();
      await checkErrorRevertEthers(badClient.confirmJustificationRootHash(), "colony-reputation-mining-invalid-jrh-proof-1-length");

      // Cleanup
      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("with an extra leaf causing proof 2 to be too long", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

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
        client2: { confirmJustificationRootHash: "colony-reputation-mining-invalid-jrh-proof-2-length" }
      });
    });
  });

  describe("should correctly resolve dispute over reputation UID", () => {
    it("if an existing reputation's uniqueID is changed", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

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

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await goodClient.respondToChallenge();
      await checkErrorRevertEthers(badClient.respondToChallenge(), "colony-reputation-mining-uid-changed-for-existing-reputation");

      // Check
      const goodSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 0);
      const badSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 1);
      const delta = goodSubmissionAfterResponseToChallenge.challengeStepCompleted - badSubmissionAfterResponseToChallenge.challengeStepCompleted;
      expect(delta).to.eq.BN(1);

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it.skip("if a new reputation's uniqueID is wrong", async () => {
      // I think this test is now obsoleted. If a new reputation's UID is wrong:
      // 1. It could be too small. But then either
      //    a) If we provide the right previousNewRepuationID for the new UID we're claiming, it will be too small
      //       compared to nNodes in the lastAgree state in the JRHs, and respondToChallenge will fail with
      //       colony-reputation-mining-proved-uid-inconsistent
      //    b) If we supply the right previousNewReputationID when compared to lastAgreeState, then respondToChallenge will
      //       fail with colony-reputation-mining-new-uid-incorrect
      // 2. It could be too large. We can't provide the right previousNewRepuationID for the new UID we're claiming, so only
      //    the equivalent of b) above is possible
      // This doesn't quite hold if the two submissions are both malicious, and agreed on an invliad state for the lastAgreeState.
      // However, only one will still be able to be 'right', and so the dispute resoultion will continue as intended with at least
      // one of those submissions being eliminated.
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

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

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await goodClient.respondToChallenge();
      await badClient.respondToChallenge();

      // Check
      const goodSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 0);
      const badSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 1);
      const delta = goodSubmissionAfterResponseToChallenge.challengeStepCompleted - badSubmissionAfterResponseToChallenge.challengeStepCompleted;
      expect(delta).to.be.zero;
      // Both sides have completed the same amount of challenges, but one has proved that a large number already exists
      // than the other, so when we call invalidate hash, only one will be eliminated.

      // Check that we can't invalidate the one that proved a higher reputation already existed
      await checkErrorRevert(repCycle.invalidateHash(0, 0), "colony-reputation-mining-less-reputation-uids-proven");

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);

      const rightHash = await goodClient.getRootHash();
      const confirmedHash = await colonyNetwork.getReputationRootHash();
      expect(confirmedHash).to.equal(rightHash);
    });

    it("if a new reputation's uniqueID is not proved right because a too-old previous ID is proved", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony, worker: accounts[3] });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 27, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      // This client gets the same root hash as goodClient, but will submit the wrong newest reputation hash when
      // it calls respondToChallenge.
      const badClient2 = new MaliciousReputationMinerWrongNewestReputation(
        { loader, realProviderPort, useJsTree, minerAddress: MINER2 },
        27,
        0xfffffffff
      );
      await badClient2.initialise(colonyNetwork.address);
      await badClient2.addLogContentsToReputationTree();

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await checkErrorRevertEthers(badClient2.respondToChallenge(), "colony-reputation-mining-new-uid-incorrect");

      // Cleanup
      await forwardTime(MINING_CYCLE_DURATION, this);
      await goodClient.respondToChallenge();
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });
  });

  describe("should correctly resolve dispute over reputation value", () => {
    it.skip("if a too high previous reputation larger than nNodes is provided", async () => {
      // I think this test is impossible to write, now.
      // This test requires (essentially) that intermediateReputationNNodes - previousNewReputationUID is > 1, and get to saveProvedReputation
      // without tripping another require.
      // intermediateReputationNNodes is the same as DisagreeStateNNodes (so we could get rid of one, but that's for another PR...), so we need
      // disagreeStateNNodes - previousNewReputationUID > 1. We now enforce that DisagreeStateNNodes - AgreeStateNNodes is either 1 or 0, based on
      // whether the submitter claims a new node was added or not. Making the most optimistic substitution, we require that
      // 1 + AgreeStateNNodes - previousNewREputationUID > 1, or AgreeStateNNodes > previousNewReputationUID
      // Unfortunately, agreeStateNNodes is either equal to or one less than previousNewReputationUID, depending on whether a new node
      // is added or not.
      // So skipping this test, and leaving in the require for now in case I am wrong. This seems like a _very_ good candidate for an experimentation
      // with formal proofs, though....
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the tasks.
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nInactiveLogEntries).to.eq.BN(13);

      const badClient = new MaliciousReputationMinerUnsure({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 20, 0xffff);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await goodClient.respondToChallenge();
      await checkErrorRevertEthers(badClient.respondToChallenge(), "colony-reputation-mining-proved-uid-inconsistent");

      // Check badClient respondToChallenge failed
      const goodSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 0);
      const badSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 1);
      const delta = goodSubmissionAfterResponseToChallenge.challengeStepCompleted - badSubmissionAfterResponseToChallenge.challengeStepCompleted;
      expect(delta).to.eq.BN(2);

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);

      const rightHash = await goodClient.getRootHash();
      const confirmedHash = await colonyNetwork.getReputationRootHash();
      expect(confirmedHash).to.equal(rightHash);
    });

    it("if a reputation decay calculation is wrong", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      let repCycle = await getActiveRepCycle(colonyNetwork);

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 1, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
      });
      await repCycle.confirmNewHash(1);

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
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" }
      });
      repCycle = await getActiveRepCycle(colonyNetwork);
      await repCycle.confirmNewHash(1);
    });

    it("if an update makes reputation amount go over the max, in a dispute, it should be limited to the max value", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

      const fundsRequired = INT128_MAX.add(new BN(1000000000000).muln(2)).add(new BN(1000000000).muln(2));
      await fundColonyWithTokens(metaColony, clnyToken, fundsRequired);

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 1,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 1000000000000,
        managerRating: 2,
        workerRating: 2,
        worker: accounts[4]
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const workerPayout = INT128_MAX.sub(new BN(1000000000000));
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 1,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout,
        managerRating: 2,
        workerRating: 2,
        worker: accounts[4]
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
        client2: { respondToChallenge: "colony-reputation-mining-reputation-not-max-int128" }
      });
      await repCycle.confirmNewHash(1);
    });
  });
});
