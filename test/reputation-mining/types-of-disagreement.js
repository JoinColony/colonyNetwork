/* globals artifacts */

import path from "path";
import BN from "bn.js";
import { toBN } from "web3-utils";
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
  finishReputationMiningCycleAndWithdrawAllMinerStakes
} from "../../helpers/test-helper";

import { giveUserCLNYTokensAndStake, setupFinalizedTask, fundColonyWithTokens } from "../../helpers/test-data-generator";

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

const EtherRouter = artifacts.require("EtherRouter");
const IMetaColony = artifacts.require("IMetaColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ITokenLocking = artifacts.require("ITokenLocking");
const Token = artifacts.require("Token");

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "..", "build", "contracts")
});

const useJsTree = true;

contract("Reputation Mining - types of disagreement", accounts => {
  const MAIN_ACCOUNT = accounts[5];
  const OTHER_ACCOUNT = accounts[6];

  let metaColony;
  let colonyNetwork;
  let tokenLocking;
  let clnyToken;
  let goodClient;
  const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await ITokenLocking.at(tokenLockingAddress);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);
    const clnyAddress = await metaColony.getToken();
    clnyToken = await Token.at(clnyAddress);

    goodClient = new ReputationMinerTestWrapper({ loader, realProviderPort, useJsTree, minerAddress: MAIN_ACCOUNT });
  });

  beforeEach(async () => {
    await goodClient.resetDB();
    await goodClient.initialise(colonyNetwork.address);

    // Kick off reputation mining.
    const lock = await tokenLocking.getUserLock(clnyToken.address, MAIN_ACCOUNT);
    assert.equal(lock.balance, DEFAULT_STAKE.toString());

    // Advance two cycles to clear active and inactive state.
    await advanceMiningCycleNoContest({ colonyNetwork, test: this });
    await advanceMiningCycleNoContest({ colonyNetwork, test: this });

    // The inactive reputation log now has the reward for this miner, and the accepted state is empty.
    // This is the same starting point for all tests.
    const repCycle = await getActiveRepCycle(colonyNetwork);
    const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
    assert.equal(nInactiveLogEntries.toNumber(), 1);

    // Burn MAIN_ACCOUNTS accumulated mining rewards.
    const userBalance = await clnyToken.balanceOf(MAIN_ACCOUNT);
    await clnyToken.burn(userBalance, { from: MAIN_ACCOUNT });
  });

  afterEach(async () => {
    await finishReputationMiningCycleAndWithdrawAllMinerStakes(colonyNetwork, this);
  });

  describe("when there is a dispute over reputation root hash", () => {
    it("should allow a user to confirm a submitted JRH with proofs for a submission", async () => {
      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 1, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 5 updates: 1 for the previous mining cycle and 4 for the task.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 5);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const righthash = await goodClient.getRootHash();
      const wronghash = await badClient.getRootHash();
      assert.notEqual(righthash, wronghash, "Hashes from clients are equal, surprisingly");

      const nSubmittedHashes = await repCycle.getNSubmittedHashes();
      assert.equal(nSubmittedHashes, 2);

      const submission = await repCycle.getDisputeRounds(0, 0);

      assert.equal(submission.jrhNNodes, "0");
      await forwardTime(10, this); // This is just to ensure that the timestamps checked below will be different if JRH was submitted.

      await goodClient.confirmJustificationRootHash();

      // Check that we can't re-submit a JRH
      await checkErrorRevertEthers(goodClient.confirmJustificationRootHash(), "colony-reputation-jrh-hash-already-verified");

      const submissionAfterJRHConfirmed = await repCycle.getDisputeRounds(0, 0);
      const jrh = await goodClient.justificationTree.getRootHash();
      assert.equal(submissionAfterJRHConfirmed.jrh, jrh);

      // Check 'last response' was updated.
      assert.notEqual(submission.lastResponseTimestamp, submissionAfterJRHConfirmed.lastResponseTimestamp);

      // Cleanup
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
      });
      await repCycle.confirmNewHash(1);
    });

    it("should cope if the wrong reputation transition is the first transition", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 0, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await goodClient.saveCurrentState();
      const savedHash = await goodClient.reputationTree.getRootHash();

      await badClient.loadState(savedHash);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const righthash = await goodClient.getRootHash();
      const wronghash = await badClient.getRootHash();
      assert.notEqual(righthash, wronghash, "Hashes from clients are equal, surprisingly");

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" }
      });
      await repCycle.confirmNewHash(1);
    });

    // These tests are useful for checking that every type of parent / child / user / colony-wide-sum skills are accounted for
    // correctly. Unsure if I should force them to be run every time.
    [0, 1, 2, 3, 4, 5, 6, 7].forEach(async badIndex => {
      it.skip(`should cope if wrong reputation transition is transition ${badIndex}`, async function advancingTest() {
        await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
        await advanceMiningCycleNoContest({ colonyNetwork, test: this });
        await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });

        const badClient = new MaliciousReputationMinerExtraRep(
          { loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT },
          badIndex,
          0xfffffffff
        );
        await badClient.initialise(colonyNetwork.address);

        await goodClient.saveCurrentState();
        const savedHash = await goodClient.reputationTree.getRootHash();
        await badClient.loadState(savedHash);

        await submitAndForwardTimeToDispute([goodClient, badClient], this);

        const righthash = await goodClient.getRootHash();
        const wronghash = await badClient.getRootHash();
        assert.notEqual(righthash, wronghash, "Hashes from clients are equal, surprisingly");

        const repCycle = await getActiveRepCycle(colonyNetwork);

        let error;
        if (badIndex < 4) {
          error = "colony-reputation-mining-decay-incorrect";
        } else {
          error = "colony-reputation-mining-increased-reputation-value-incorrect";
        }
        await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
          client2: { respondToChallenge: error }
        });
        await repCycle.confirmNewHash(1);
      });
    });

    it("should allow a binary search between opponents to take place to find their first disagreement", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the task.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 13);

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 12, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const righthash = await goodClient.getRootHash();
      const wronghash = await badClient.getRootHash();
      assert.notEqual(righthash, wronghash, "Hashes from clients are equal, surprisingly");

      const nSubmittedHashes = await repCycle.getNSubmittedHashes();
      assert.equal(nSubmittedHashes, 2);

      await goodClient.confirmJustificationRootHash();
      const submissionAfterJRHConfirmed = await repCycle.getDisputeRounds(0, 0);
      const jrh = await goodClient.justificationTree.getRootHash();
      assert.equal(submissionAfterJRHConfirmed.jrh, jrh);

      await badClient.confirmJustificationRootHash();
      const badSubmissionAfterJRHConfirmed = await repCycle.getDisputeRounds(0, 1);
      const badJrh = await badClient.justificationTree.getRootHash();
      assert.equal(badSubmissionAfterJRHConfirmed.jrh, badJrh);

      let goodSubmission = await repCycle.getDisputeRounds(0, 0);
      let badSubmission = await repCycle.getDisputeRounds(0, 1);
      assert.equal(goodSubmission.challengeStepCompleted, 1); // Challenge steps completed
      assert.equal(goodSubmission.lowerBound, 0); // Lower bound for binary search
      assert.equal(goodSubmission.upperBound, 28); // Upper bound for binary search
      assert.equal(badSubmission.challengeStepCompleted, 1);
      assert.equal(badSubmission.lowerBound, 0);
      assert.equal(badSubmission.upperBound, 28);

      await goodClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.getDisputeRounds(0, 0);
      badSubmission = await repCycle.getDisputeRounds(0, 1);
      assert.equal(goodSubmission.challengeStepCompleted, 2);
      assert.equal(goodSubmission.lowerBound, 0);
      assert.equal(goodSubmission.upperBound, 28);
      assert.equal(badSubmission.challengeStepCompleted, 1);
      assert.equal(badSubmission.lowerBound, 0);
      assert.equal(badSubmission.upperBound, 28);

      await badClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.getDisputeRounds(0, 0);
      badSubmission = await repCycle.getDisputeRounds(0, 1);
      assert.equal(goodSubmission.lowerBound, 0);
      assert.equal(goodSubmission.upperBound, 15);
      assert.equal(badSubmission.lowerBound, 0);
      assert.equal(badSubmission.upperBound, 15);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.getDisputeRounds(0, 0);
      badSubmission = await repCycle.getDisputeRounds(0, 1);
      assert.equal(goodSubmission.lowerBound, 8);
      assert.equal(goodSubmission.upperBound, 15);
      assert.equal(badSubmission.lowerBound, 8);
      assert.equal(badSubmission.upperBound, 15);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.getDisputeRounds(0, 0);
      badSubmission = await repCycle.getDisputeRounds(0, 1);

      assert.equal(goodSubmission.lowerBound, 12);
      assert.equal(goodSubmission.upperBound, 15);
      assert.equal(badSubmission.lowerBound, 12);
      assert.equal(badSubmission.upperBound, 15);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.getDisputeRounds(0, 0);
      badSubmission = await repCycle.getDisputeRounds(0, 1);
      assert.equal(goodSubmission.lowerBound, 12);
      assert.equal(goodSubmission.upperBound, 13);
      assert.equal(badSubmission.lowerBound, 12);
      assert.equal(badSubmission.upperBound, 13);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.getDisputeRounds(0, 0);
      badSubmission = await repCycle.getDisputeRounds(0, 1);
      assert.equal(goodSubmission.lowerBound, 13);
      assert.equal(goodSubmission.upperBound, 13);
      assert.equal(badSubmission.lowerBound, 13);
      assert.equal(badSubmission.upperBound, 13);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      // TODO: Split off in to  another test here, but can't be bothered to refactor right now.
      await goodClient.respondToChallenge();
      await checkErrorRevertEthers(badClient.respondToChallenge(), "colony-reputation-mining-increased-reputation-value-incorrect");

      // Check
      const goodSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 0);
      const badSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 1);
      assert.equal(goodSubmissionAfterResponseToChallenge.challengeStepCompleted - badSubmissionAfterResponseToChallenge.challengeStepCompleted, 2);
      // checks that challengeStepCompleted is two more for the good submission than the bad one.
      // it's two, because we proved the starting reputation was in the starting reputation state, rather than claiming
      // it was a new reputation not in the tree with value 0.

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1);
    });

    it("if respondToChallenge is attempted to be called multiple times, it should fail", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the tasks.
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 13);

      const badClient = new MaliciousReputationMinerClaimNew({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 20);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      const righthash = await goodClient.getRootHash();
      const wronghash = await badClient.getRootHash();
      assert.notEqual(righthash, wronghash, "Hashes from clients are equal, surprisingly");

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await goodClient.respondToChallenge();
      await badClient.respondToChallenge();

      await checkErrorRevertEthers(goodClient.respondToChallenge(), "colony-reputation-mining-challenge-already-responded");
      await checkErrorRevertEthers(badClient.respondToChallenge(), "colony-reputation-mining-challenge-already-responded");

      // Check
      const goodSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 0);
      const badSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 1);
      assert.equal(goodSubmissionAfterResponseToChallenge.challengeStepCompleted - badSubmissionAfterResponseToChallenge.challengeStepCompleted, 1);

      // Both sides have completed the same amount of challenges, but one has proved that the reputation existed previously,
      // whereas the other has not, and any respondToChallenges after the first didn't work.
      // Check that we can't invalidate the good client submission
      await checkErrorRevert(repCycle.invalidateHash(0, 0), "colony-reputation-mining-less-challenge-rounds-completed");

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);

      const confirmedHash = await colonyNetwork.getReputationRootHash();
      assert.equal(confirmedHash, righthash);
    });
  });

  describe("should correctly resolve dispute over nNodes", () => {
    it("where the submitted nNodes is lied about", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 5 updates: 1 for the previous mining cycle and 1x4 for the task.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 5);

      const badClient = new MaliciousReputationMinerWrongNNodes({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 8);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { confirmJustificationRootHash: "colony-reputation-mining-invalid-jrh-proof-2" }
      });

      // Cleanup
      await repCycle.confirmNewHash(1);
    });

    it("where the number of nodes has been incremented incorrectly when adding a new reputation", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const badClient = new MaliciousReputationMinerWrongNNodes2({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 3, 1);
      await badClient.initialise(colonyNetwork.address);

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-nnodes-changed-by-not-1" }
      });
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await repCycle.confirmNewHash(1);
    });

    it("where the number of nodes has been incremented during an update of an existing reputation", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 5 updates: 1 for the previous mining cycle and 1x4 for the task.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 5);

      const badClient = new MaliciousReputationMinerWrongNNodes2({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 8, 1);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-nnodes-changed" }
      });

      await repCycle.confirmNewHash(1);
    });
  });

  describe("should correctly resolve dispute over JRH", () => {
    it("because a leaf in the JT is wrong", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 5 updates: 1 for the previous mining cycle and 1x4 for the tasks.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 5);

      const badClient = new MaliciousReputationMinerWrongJRH({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 8);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToBinarySearchForChallenge: [undefined, "colony-reputation-mining-invalid-binary-search-proof-length"] }
      });

      // Cleanup
      await repCycle.confirmNewHash(1);
    });

    it("with an extra leaf causing proof 1 to be too long", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 5 updates: 1 for the previous mining cycle and 1x4 for the tasks.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 5);

      const badClient = new MaliciousReputationMinerWrongJRH({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 500000);
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
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

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
      assert.equal(nInactiveLogEntries.toNumber(), 13);

      const badClient = new MaliciousReputationMinerWrongJRH({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 30);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { confirmJustificationRootHash: "colony-reputation-mining-invalid-jrh-proof-2-length" }
      });
    });
  });

  describe("should correctly resolve dispute over reputation UID", () => {
    it("if an existing reputation's uniqueID is changed", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the tasks.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 13);

      const badClient = new MaliciousReputationMinerWrongUID({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 12, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const righthash = await goodClient.getRootHash();
      const wronghash = await badClient.getRootHash();
      assert.notEqual(righthash, wronghash, "Hashes from clients are equal, surprisingly");

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
      assert.equal(goodSubmissionAfterResponseToChallenge.challengeStepCompleted - badSubmissionAfterResponseToChallenge.challengeStepCompleted, 2);
      // checks that challengeStepCompleted is two more for the good submission than the bad one.
      // it's two, because we proved the starting reputation was in the starting reputation state, rather than claiming
      // it was a new reputation not in the tree with value 0.

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
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the tasks.
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 13);

      const badClient = new MaliciousReputationMinerReuseUID({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 3, 1);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const righthash = await goodClient.getRootHash();
      const wronghash = await badClient.getRootHash();
      assert.notEqual(righthash, wronghash, "Hashes from clients are equal, surprisingly");

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
      assert.equal(goodSubmissionAfterResponseToChallenge.challengeStepCompleted - badSubmissionAfterResponseToChallenge.challengeStepCompleted, 0);
      // Both sides have completed the same amount of challenges, but one has proved that a large number already exists
      // than the other, so when we call invalidate hash, only one will be eliminated.

      // Check that we can't invalidate the one that proved a higher reputation already existed
      await checkErrorRevert(repCycle.invalidateHash(0, 0), "colony-reputation-mining-less-reputation-uids-proven");

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
      const confirmedHash = await colonyNetwork.getReputationRootHash();
      assert.equal(confirmedHash, righthash);
    });

    it("if a new reputation's uniqueID is not proved right because a too-old previous ID is proved", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony, worker: accounts[3] });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 27, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      // This client gets the same root hash as goodClient, but will submit the wrong newest reputation hash when
      // it calls respondToChallenge.
      const badClient2 = new MaliciousReputationMinerWrongNewestReputation(
        { loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT },
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
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the tasks.
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 13);

      const badClient = new MaliciousReputationMinerUnsure({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 20, 0xffff);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const righthash = await goodClient.getRootHash();
      const wronghash = await badClient.getRootHash();
      assert.notEqual(righthash, wronghash, "Hashes from clients are equal, surprisingly");

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
      assert.equal(goodSubmissionAfterResponseToChallenge.challengeStepCompleted - badSubmissionAfterResponseToChallenge.challengeStepCompleted, 2);

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
      const confirmedHash = await colonyNetwork.getReputationRootHash();
      assert.equal(confirmedHash, righthash);
    });

    it("if a reputation decay calculation is wrong", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      let repCycle = await getActiveRepCycle(colonyNetwork);

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 1, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      let righthash = await goodClient.getRootHash();
      let wronghash = await badClient.getRootHash();
      assert.notEqual(righthash, wronghash, "Hashes from clients are equal, surprisingly");

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

      righthash = await goodClient.getRootHash();
      wronghash = await badClient.getRootHash();
      assert.isTrue(righthash === wronghash, "Hashes from clients are not equal - not starting from the same state");

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      righthash = await goodClient.getRootHash();
      wronghash = await badClient.getRootHash();
      assert.notEqual(righthash, wronghash, "Hashes from clients are equal, surprisingly");

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" }
      });
      repCycle = await getActiveRepCycle(colonyNetwork);
      await repCycle.confirmNewHash(1);
    });

    it("if an update makes reputation amount go over the max, in a dispute, it should be limited to the max value", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

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
      assert.equal(nLogEntries.toNumber(), 5);

      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT },
        17,
        toBN("170141183460469231731687302715884105727").mul(toBN(-1))
      );
      await badClient.initialise(colonyNetwork.address);

      // Moving the state to the bad client
      const currentGoodClientState = await goodClient.getRootHash();
      await badClient.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const righthash = await goodClient.getRootHash();
      const wronghash = await badClient.getRootHash();
      assert(righthash !== wronghash, "Hashes from clients are equal, surprisingly");

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-reputation-not-max-int128" }
      });
      await repCycle.confirmNewHash(1);
    });
  });
});
