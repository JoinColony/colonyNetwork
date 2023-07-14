const path = require("path");
const chai = require("chai");
const bnChai = require("bn-chai");

const { TruffleLoader } = require("../../packages/package-utils");
const {
  forwardTime,
  checkErrorRevertEthers,
  submitAndForwardTimeToDispute,
  runBinarySearch,
  getActiveRepCycle,
  advanceMiningCycleNoContest,
  accommodateChallengeAndInvalidateHash,
  finishReputationMiningCycle,
  removeSubdomainLimit,
} = require("../../helpers/test-helper");

const {
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  giveUserCLNYTokensAndStake,
  setupFinalizedTask,
  fundColonyWithTokens,
} = require("../../helpers/test-data-generator");

const { UINT256_MAX, DEFAULT_STAKE, INITIAL_FUNDING, MINING_CYCLE_DURATION, CHALLENGE_RESPONSE_WINDOW_DURATION } = require("../../helpers/constants");

const ReputationMinerTestWrapper = require("../../packages/reputation-miner/test/ReputationMinerTestWrapper");
const MaliciousReputationMinerExtraRep = require("../../packages/reputation-miner/test/MaliciousReputationMinerExtraRep");
const MaliciousReputationMinerClaimNoOriginReputation = require("../../packages/reputation-miner/test/MaliciousReputationMinerClaimNoOriginReputation"); // eslint-disable-line max-len
const MaliciousReputationMinerClaimNoUserChildReputation = require("../../packages/reputation-miner/test/MaliciousReputationMinerClaimNoUserChildReputation"); // eslint-disable-line max-len
const MaliciousReputationMinerClaimWrongOriginReputation = require("../../packages/reputation-miner/test/MaliciousReputationMinerClaimWrongOriginReputation"); // eslint-disable-line max-len
const MaliciousReputationMinerClaimWrongChildReputation = require("../../packages/reputation-miner/test/MaliciousReputationMinerClaimWrongChildReputation"); // eslint-disable-line max-len
const MaliciousReputationMinerGlobalOriginNotChildOrigin = require("../../packages/reputation-miner/test/MaliciousReputationMinerGlobalOriginNotChildOrigin"); // eslint-disable-line max-len
const MaliciousReputationMinerWrongResponse = require("../../packages/reputation-miner/test/MaliciousReputationMinerWrongResponse");

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

  await removeSubdomainLimit(colonyNetwork); // Temporary for tests until we allow subdomain depth > 1

  // Initialise global skills tree: 3, domain skills tree 1 -> 4 -> 5
  //                                                      \-> 2
  await metaColony.addDomain(1, UINT256_MAX, 1);
  await metaColony.addDomain(1, 1, 2);

  await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);
  await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);
  await colonyNetwork.initialiseReputationMining();
  await colonyNetwork.startNextCycle();

  goodClient = new ReputationMinerTestWrapper({ loader, realProviderPort, useJsTree, minerAddress: MINER1 });
};

contract("Reputation Mining - disputes over child reputation", (accounts) => {
  const MINER1 = accounts[5];
  const MINER2 = accounts[6];
  const MINER3 = accounts[7];
  const MINER4 = accounts[8];

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

    // Burn MAIN_ACCOUNTS accumulated mining rewards.
    const userBalance = await clnyToken.balanceOf(MINER1);
    await clnyToken.burn(userBalance, { from: MINER1 });

    await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(4));
  });

  afterEach(async () => {
    const reputationMiningGotClean = await finishReputationMiningCycle(colonyNetwork, this);
    if (!reputationMiningGotClean) await setupNewNetworkInstance(MINER1, MINER2);
  });

  describe("should correctly resolve a dispute over origin skill", () => {
    it("if one person claims an origin skill doesn't exist but the other does (and proves such)", async () => {
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // We make two tasks, which guarantees that the origin reputation actually exists if we disagree about
      // any update caused by the second task
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 3,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER2,
      });

      // Task two payouts are less so that the reputation should be nonzero afterwards
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 2,
        managerPayout: 100000000000,
        evaluatorPayout: 100000000,
        workerPayout: 500000000000,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2,
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation updates for two task completions (manager, worker, evaluator);
      // That's nine in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nLogEntries).to.eq.BN(9);

      const badClient = new MaliciousReputationMinerClaimNoOriginReputation(
        { loader, realProviderPort, useJsTree, minerAddress: MINER2 },
        42, // Passing in update number for colony wide skillId: 5, user: 0
        1
      );

      // Moving the state to the bad client
      await badClient.initialise(colonyNetwork.address);
      const currentGoodClientState = await goodClient.getRootHash();
      await badClient.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-adjacent-origin-not-adjacent-or-already-exists" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
      const acceptedHash = await colonyNetwork.getReputationRootHash();

      const righthash = await goodClient.getRootHash();
      expect(righthash, "The correct hash was not accepted").to.equal(acceptedHash);
    });

    it("if one person claims a user's child skill doesn't exist but the other does (and proves such)", async () => {
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // We make two tasks, which guarantees that the origin reputation actually exists if we disagree about
      // any update caused by the second task
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 3,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER2,
      });

      // Task two payouts are less so that the reputation should bee nonzero afterwards
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 2,
        managerPayout: 100000000000,
        evaluatorPayout: 100000000,
        workerPayout: 500000000000,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2,
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation updates for two task completions (manager, worker, evaluator);
      // That's nine in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nLogEntries.toNumber(), 9);

      const badClient = new MaliciousReputationMinerClaimNoUserChildReputation(
        { loader, realProviderPort, useJsTree, minerAddress: MINER2 },
        42, // Passing in update number for colony wide skillId: 5, user: 0
        1
      );

      // Moving the state to the bad client
      await badClient.initialise(colonyNetwork.address);
      const currentGoodClientState = await goodClient.getRootHash();
      await badClient.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-adjacent-child-not-adjacent-or-already-exists" },
      });

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
      const acceptedHash = await colonyNetwork.getReputationRootHash();
      const righthash = await goodClient.getRootHash();

      assert.equal(righthash, acceptedHash, "The correct hash was not accepted");
    });

    it("if the dispute involves a child skill that doesn't exist, should resolve correctly", async () => {
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // We make two tasks, which guarantees that the origin reputation actually exists if we disagree about
      // any update caused by the second task
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 2,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER2,
      });

      // Task two payouts are less so that the reputation should be nonzero afterwards
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 2,
        managerPayout: 100000000000,
        evaluatorPayout: 100000000,
        workerPayout: 500000000000,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2,
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation updates for two task completions (manager, worker, evaluator);
      // That's nine in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nLogEntries.toNumber(), 9);

      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, realProviderPort, useJsTree, minerAddress: MINER2 },
        36, // Passing in update number for colony wide skillId: 5, user: 0
        "0xfffffffffffffffffffffff"
      );

      // Moving the state to the bad client
      await badClient.initialise(colonyNetwork.address);
      const currentGoodClientState = await goodClient.getRootHash();
      await badClient.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decreased-reputation-value-incorrect" },
      });

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
      const acceptedHash = await colonyNetwork.getReputationRootHash();
      const righthash = await goodClient.getRootHash();

      assert.equal(righthash, acceptedHash, "The correct hash was not accepted");
    });

    it("should not accept an invalid proof that an origin skill doesn't exist", async () => {
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 3,
        managerPayout: 100000000000,
        evaluatorPayout: 100000000,
        workerPayout: 500000000000,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2,
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation updates for one task completion (manager, worker, evaluator);
      // That's five in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nLogEntries.toNumber(), 5);

      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, realProviderPort, useJsTree, minerAddress: MINER2 },
        26, // Passing in update number for colony wide skillId: 5, user: 0
        "0xfffffffffffffffffffffff"
      );

      const badClient2 = new MaliciousReputationMinerWrongResponse({ loader, minerAddress: MINER1, realProviderPort, useJsTree }, 15, 123456);
      await badClient2.initialise(colonyNetwork.address);

      // Moving the state to the bad client
      await badClient.initialise(colonyNetwork.address);
      const currentGoodClientState = await goodClient.getRootHash();
      await badClient.loadState(currentGoodClientState);
      await badClient2.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await badClient2.addLogContentsToReputationTree();

      // Run through the dispute until we can call respondToChallenge
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();
      await runBinarySearch(goodClient, badClient);
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await checkErrorRevertEthers(badClient2.respondToChallenge(), "colony-reputation-mining-origin-adjacent-proof-invalid");

      // Cleanup
      await goodClient.respondToChallenge();
      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1, { from: MINER1 });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
      const acceptedHash = await colonyNetwork.getReputationRootHash();
      const righthash = await goodClient.getRootHash();

      assert.equal(righthash, acceptedHash, "The correct hash was not accepted");
    });

    it("should not accept an invalid proof that a child skill doesn't exist", async () => {
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // We make two tasks, which guarantees that the origin reputation actually exists if we disagree about
      // any update caused by the second task
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 2,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER2,
      });

      // Task two payouts are less so that the reputation should bee nonzero afterwards
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 2,
        managerPayout: 100000000000,
        evaluatorPayout: 100000000,
        workerPayout: 500000000000,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2,
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation updates for two task completions (manager, worker, evaluator);
      // That's nine in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nLogEntries.toNumber(), 9);

      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, realProviderPort, useJsTree, minerAddress: MINER2 },
        36, // Passing in update number for colony wide skillId: 5, user: 0
        "0xfffffffffffffffffffffff"
      );

      const badClient2 = new MaliciousReputationMinerWrongResponse({ loader, minerAddress: MINER1, realProviderPort, useJsTree }, 18, 123456);
      await badClient2.initialise(colonyNetwork.address);

      // Moving the state to the bad client
      await badClient.initialise(colonyNetwork.address);
      const currentGoodClientState = await goodClient.getRootHash();
      await badClient.loadState(currentGoodClientState);
      await badClient2.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await badClient2.addLogContentsToReputationTree();

      // Run through the dispute until we can call respondToChallenge
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();
      await runBinarySearch(goodClient, badClient);
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await checkErrorRevertEthers(badClient2.respondToChallenge(), "colony-reputation-mining-child-adjacent-proof-invalid");

      // Cleanup
      await goodClient.respondToChallenge();
      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1, { from: MINER1 });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
      const acceptedHash = await colonyNetwork.getReputationRootHash();
      const righthash = await goodClient.getRootHash();

      assert.equal(righthash, acceptedHash, "The correct hash was not accepted");
    });

    it.skip("if one person lies about what the origin skill is when there is an origin skill for a user update", async () => {
      // We deduce the origin reputation key from the logEntry on chain now so the client cannot lie about it
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER3, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER4, DEFAULT_STAKE);

      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // We make two tasks, which guarantees that the origin reputation actually exists if we disagree about
      // any update caused by the second task
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 5,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER2,
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });

      // Task two payouts are less so that the reputation should bee nonzero afterwards
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 4,
        managerPayout: 100000000000,
        evaluatorPayout: 100000000,
        workerPayout: 500000000000,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2,
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation updates for one task completion (manager, worker (domain and skill), evaluator);
      // That's five in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nLogEntries).to.eq.BN(5);

      const badClientWrongSkill = new MaliciousReputationMinerClaimWrongOriginReputation(
        { loader, realProviderPort, useJsTree, minerAddress: MINER2 },
        31, // Passing in update number for skillId: 5, user: 9f485401a3c22529ab6ea15e2ebd5a8ca54a5430
        30,
        "skillId"
      );

      const badClientWrongColony = new MaliciousReputationMinerClaimWrongOriginReputation(
        { loader, realProviderPort, useJsTree, minerAddress: MINER3 },
        31, // Passing in update number for skillId: 5, user: 9f485401a3c22529ab6ea15e2ebd5a8ca54a5430
        30,
        "colonyAddress"
      );

      const badClientWrongUser = new MaliciousReputationMinerClaimWrongOriginReputation(
        { loader, realProviderPort, useJsTree, minerAddress: MINER4 },
        31, // Passing in update number for skillId: 5, user: 9f485401a3c22529ab6ea15e2ebd5a8ca54a5430
        30,
        "userAddress"
      );

      await badClientWrongUser.initialise(colonyNetwork.address);
      await badClientWrongColony.initialise(colonyNetwork.address);
      await badClientWrongSkill.initialise(colonyNetwork.address);

      // Moving the state to the bad clients
      const currentGoodClientState = await goodClient.getRootHash();
      await badClientWrongUser.loadState(currentGoodClientState);
      await badClientWrongColony.loadState(currentGoodClientState);
      await badClientWrongSkill.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClientWrongUser, badClientWrongColony, badClientWrongSkill], this);

      // Run through the dispute until we can call respondToChallenge
      await goodClient.confirmJustificationRootHash();
      await badClientWrongUser.confirmJustificationRootHash();
      await runBinarySearch(goodClient, badClientWrongUser);
      await goodClient.confirmBinarySearchResult();
      await badClientWrongUser.confirmBinarySearchResult();

      await checkErrorRevertEthers(badClientWrongUser.respondToChallenge(), "colony-reputation-mining-origin-user-incorrect");
      await checkErrorRevertEthers(badClientWrongColony.respondToChallenge(), "colony-reputation-mining-origin-colony-incorrect");
      await checkErrorRevertEthers(badClientWrongSkill.respondToChallenge(), "colony-reputation-mining-origin-skill-incorrect");

      // Cleanup
      await goodClient.respondToChallenge();
      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1, { from: MINER1 });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("if origin skill reputation calculation underflows and is wrong", async () => {
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 3,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER2,
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 2,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2,
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation update for one task completion (manager, worker, evaluator);
      // That's five in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nLogEntries).to.eq.BN(5);

      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, minerAddress: MINER2, realProviderPort, useJsTree },
        32, // Passing in colony wide update number for skillId: 4, user: 0
        "0xfffffffffffffffffffffff"
      );
      // Moving the state to the bad client
      await badClient.initialise(colonyNetwork.address);
      const currentGoodClientState = await goodClient.getRootHash();
      await badClient.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decreased-reputation-value-incorrect" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });
  });

  describe("should correctly resolve a dispute over child skill", () => {
    it.skip("if the global origin skill is provided instead of the child origin skill", async () => {
      // We deduce the origin reputation key from the logEntry on chain now so the client cannot lie about it
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 5,
        managerPayout: 5000000000000,
        evaluatorPayout: 5000000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER2,
      });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 5,
        managerPayout: 5000000000000,
        evaluatorPayout: 5000000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER1,
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 4,
        managerPayout: 1000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 1000000000,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2,
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation update for one task completion (manager, worker, evaluator);
      // That's five in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nLogEntries).to.eq.BN(5);

      const badClient = new MaliciousReputationMinerGlobalOriginNotChildOrigin(
        { loader, minerAddress: MINER2, realProviderPort, useJsTree },
        29 // Passing in update number for skillId: 5, user: 0000000000000000000000000000000000000000
      );

      // Moving the state to the bad client
      await badClient.initialise(colonyNetwork.address);
      const currentGoodClientState = await goodClient.getRootHash();
      await badClient.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-origin-user-incorrect" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("if child skill reputation calculation is wrong", async () => {
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 3,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER2,
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 2,
        managerPayout: 1000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 1000000000,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2,
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation update for one task completion (manager, worker, evaluator);
      // That's five in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nLogEntries).to.eq.BN(5);

      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, minerAddress: MINER2, realProviderPort, useJsTree },
        31, // Passing in update number for skillId: 5, user: 9f485401a3c22529ab6ea15e2ebd5a8ca54a5430
        "0xf"
      );

      // Moving the state to the bad client
      await badClient.initialise(colonyNetwork.address);
      const currentGoodClientState = await goodClient.getRootHash();
      await badClient.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decreased-reputation-value-incorrect" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("if a child skill reputation calculation (in a negative update) is wrong", async () => {
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 3,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER2,
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 2,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2,
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation update for one task completion (manager, worker, evaluator);
      // That's five in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nLogEntries).to.eq.BN(5);

      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, minerAddress: MINER2, realProviderPort, useJsTree },
        31, // Passing in update number for skillId: 5, user: 9f485401a3c22529ab6ea15e2ebd5a8ca54a5430
        "4800000000000"
      );
      // Moving the state to the bad client
      await badClient.initialise(colonyNetwork.address);
      const currentGoodClientState = await goodClient.getRootHash();
      await badClient.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decreased-reputation-value-incorrect" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("if a child skill reputation calculation is wrong and that user has never had that reputation before", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 2,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2,
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      const repCycle = await getActiveRepCycle(colonyNetwork);

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation update for one task completion (manager, worker, evaluator);
      // That's five in total.
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nLogEntries).to.eq.BN(5);
      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, minerAddress: MINER2, realProviderPort, useJsTree },
        21, // Passing in update number for skillId: 5, user: 9f485401a3c22529ab6ea15e2ebd5a8ca54a5430
        "0xffffffffffffffff"
      );
      // Moving the state to the bad client
      await badClient.initialise(colonyNetwork.address);
      const currentGoodClientState = await goodClient.getRootHash();
      await badClient.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decreased-reputation-value-incorrect" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });
  });

  describe("should correctly resolve a dispute over colony wide reputation", () => {
    it("if a colony-wide calculation (for a parent skill) is wrong", async () => {
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 3,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 2,
        workerRating: 2,
        worker: MINER2,
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 2,
        managerPayout: 1000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 1000000000,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2,
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation update for one task completion (manager, worker, evaluator);
      // That's five in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nLogEntries).to.eq.BN(5);

      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, minerAddress: MINER2, realProviderPort, useJsTree },
        30, // Passing in colony wide update number for skillId: 4, user: 0
        "0xffff"
      );
      // Moving the state to the bad client
      await badClient.initialise(colonyNetwork.address);
      const currentGoodClientState = await goodClient.getRootHash();
      await badClient.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decreased-reputation-value-incorrect" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("if a colony-wide calculation (for a child skill) is wrong", async () => {
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 3,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER2,
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 2,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 1,
        workerRating: 1,
        worker: accounts[5],
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      const repCycle = await getActiveRepCycle(colonyNetwork);

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation update for one task completion (manager, worker, evaluator);
      // That's five in total.
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nLogEntries).to.eq.BN(5);

      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, minerAddress: MINER2, realProviderPort, useJsTree },
        28, // Passing in update number for skillId: 5, user: 0
        "0xfffffffffff"
      );
      // Moving the state to the bad client
      await badClient.initialise(colonyNetwork.address);
      const currentGoodClientState = await goodClient.getRootHash();
      await badClient.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decreased-reputation-value-incorrect" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("if a colony-wide child skill is wrong, and the log .amount is larger than the colony total, but the correct change is not", async () => {
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 3,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 1000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER2,
      });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 3,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 1000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER1,
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 2,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 1000000000000000,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2,
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      const repCycle = await getActiveRepCycle(colonyNetwork);

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation update for one task completion (manager, worker, evaluator);
      // That's five in total.
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nLogEntries.toNumber(), 5);

      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, minerAddress: MINER2, realProviderPort, useJsTree },
        31, // Passing in update number for skillId: 5, user: 0
        "0xfffffffffffffffffffffff"
      );
      // Moving the state to the bad client
      await badClient.initialise(colonyNetwork.address);
      const currentGoodClientState = await goodClient.getRootHash();
      await badClient.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      const righthash = await goodClient.getRootHash();
      const wronghash = await badClient.getRootHash();
      assert(righthash !== wronghash, "Hashes from clients are equal, surprisingly");

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decreased-reputation-value-incorrect" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it.skip("if one person lies about what the child skill is", async () => {
      // We deduce the child reputation key from the logEntry on chain now so the client cannot lie about it
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(4));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // We make two tasks, which guarantees that the origin reputation actually exists if we disagree about
      // any update caused by the second task
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 5,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER2,
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });

      // Task two payouts are less so that the reputation should bee nonzero afterwards
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 4,
        managerPayout: 100000000000,
        evaluatorPayout: 100000000,
        workerPayout: 500000000000,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2,
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 28, 0xfffffffff);

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation updates for one task completion (manager, worker (domain and skill), evaluator);
      // That's five in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nLogEntries).to.eq.BN(5);

      const badClientWrongSkill = new MaliciousReputationMinerClaimWrongChildReputation(
        { loader, realProviderPort, useJsTree, minerAddress: MINER1 },
        "skillId"
      );

      const badClientWrongColony = new MaliciousReputationMinerClaimWrongChildReputation(
        { loader, realProviderPort, useJsTree, minerAddress: MINER1 },
        "colonyAddress"
      );

      const badClientWrongUser = new MaliciousReputationMinerClaimWrongChildReputation(
        { loader, realProviderPort, useJsTree, minerAddress: MINER1 },
        "userAddress"
      );

      // Moving the state to the bad clients
      await badClient.initialise(colonyNetwork.address);
      await badClientWrongUser.initialise(colonyNetwork.address);
      await badClientWrongColony.initialise(colonyNetwork.address);
      await badClientWrongSkill.initialise(colonyNetwork.address);

      const currentGoodClientState = await goodClient.getRootHash();
      await badClientWrongUser.loadState(currentGoodClientState);
      await badClientWrongColony.loadState(currentGoodClientState);
      await badClientWrongSkill.loadState(currentGoodClientState);
      await badClient.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClient, badClientWrongUser, badClientWrongColony, badClientWrongSkill], this);

      // Run through the dispute until we can call respondToChallenge
      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();
      await runBinarySearch(goodClient, badClient);
      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await checkErrorRevertEthers(badClientWrongUser.respondToChallenge(), "colony-reputation-mining-child-user-incorrect");
      await checkErrorRevertEthers(badClientWrongColony.respondToChallenge(), "colony-reputation-mining-child-colony-incorrect");
      await checkErrorRevertEthers(badClientWrongSkill.respondToChallenge(), "colony-reputation-mining-child-skill-incorrect");

      // Cleanup
      await goodClient.respondToChallenge();
      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1, { from: MINER1 });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("if a colony-wide child skill reputation amount calculation underflows and is wrong", async () => {
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 3,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 1000000000000,
        managerRating: 2,
        workerRating: 2,
        worker: MINER2,
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 2,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 1000000000001,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2,
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation update for one task completion (manager, worker, evaluator);
      // That's five in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nLogEntries).to.eq.BN(5);

      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, minerAddress: MINER2, realProviderPort, useJsTree },
        28, // Passing in colony wide update number for skillId: 5, user: 0
        "0xfffffffff"
      );
      // Moving the state to the bad client
      await badClient.initialise(colonyNetwork.address);
      const currentGoodClientState = await goodClient.getRootHash();
      await badClient.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decreased-reputation-value-incorrect" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });
  });

  describe("should correctly resolve a dispute over changed global skills state", () => {
    it("if reputation calculation is wrong, contracts should cope if child skills added during the mining cycle or dispute process", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER3, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(4));

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domaindId: 3,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER2,
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domaindId: 2,
        managerPayout: 1000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 1000000000,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2,
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation update for one task completion (manager, worker, evaluator);
      // That's five in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nLogEntries).to.eq.BN(5);

      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, realProviderPort, useJsTree, minerAddress: MINER2 },
        25, // Passing in update number for skillId: 1, user: 0
        "0xfffffffff"
      );

      const badClient2 = new MaliciousReputationMinerExtraRep(
        { loader, realProviderPort, useJsTree, minerAddress: MINER3 },
        28, // Passing in update number for skillId: 5, user: 9f485401a3c22529ab6ea15e2ebd5a8ca54a5430
        "0xfffffffff"
      );

      await metaColony.addDomain(1, 2, 3);

      // Moving the state to the bad client
      await badClient.initialise(colonyNetwork.address);
      await badClient2.initialise(colonyNetwork.address);
      const currentGoodClientState = await goodClient.getRootHash();
      await badClient.loadState(currentGoodClientState);
      await badClient2.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClient, badClient2], this);
      await metaColony.addDomain(1, 3, 4);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decreased-reputation-value-incorrect" },
      });
      await repCycle.invalidateHash(0, 3, { from: MINER1 });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient2, {
        client2: { respondToChallenge: "colony-reputation-mining-decreased-reputation-value-incorrect" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(2, { from: MINER1 });
    });
  });
});
