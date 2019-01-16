/* globals artifacts */

import path from "path";
import BN from "bn.js";
import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";

import {
  forwardTime,
  checkErrorRevertEthers,
  submitAndForwardTimeToDispute,
  runBinarySearch,
  getActiveRepCycle,
  advanceMiningCycleNoContest,
  accommodateChallengeAndInvalidateHash,
  finishReputationMiningCycleAndWithdrawAllMinerStakes
} from "../../helpers/test-helper";

import {
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  giveUserCLNYTokensAndStake,
  setupFinalizedTask,
  fundColonyWithTokens
} from "../../helpers/test-data-generator";

import { DEFAULT_STAKE, INITIAL_FUNDING, MINING_CYCLE_DURATION } from "../../helpers/constants";

import ReputationMinerTestWrapper from "../../packages/reputation-miner/test/ReputationMinerTestWrapper";
import MaliciousReputationMinerExtraRep from "../../packages/reputation-miner/test/MaliciousReputationMinerExtraRep";
import MaliciousReputationMinerClaimNew from "../../packages/reputation-miner/test/MaliciousReputationMinerClaimNew";
import MaliciousReputationMinerClaimNoOriginReputation from "../../packages/reputation-miner/test/MaliciousReputationMinerClaimNoOriginReputation";
import MaliciousReputationMinerClaimWrongOriginReputation from "../../packages/reputation-miner/test/MaliciousReputationMinerClaimWrongOriginReputation"; // eslint-disable-line max-len
import MaliciousReputationMinerClaimWrongChildReputation from "../../packages/reputation-miner/test/MaliciousReputationMinerClaimWrongChildReputation"; // eslint-disable-line max-len

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ITokenLocking = artifacts.require("ITokenLocking");

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "..", "build", "contracts")
});

const useJsTree = true;

contract("Reputation Mining - disputes over child reputation", accounts => {
  const MINER1 = accounts[5];
  const MINER2 = accounts[6];
  const MINER3 = accounts[7];
  const MINER4 = accounts[8];

  let metaColony;
  let colonyNetwork;
  let tokenLocking;
  let clnyToken;
  let goodClient;
  const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

  before(async () => {
    // Get the address of the token locking contract from the existing colony Network
    const etherRouter = await EtherRouter.deployed();
    const colonyNetworkDeployed = await IColonyNetwork.at(etherRouter.address);
    const tokenLockingAddress = await colonyNetworkDeployed.getTokenLocking();
    tokenLocking = await ITokenLocking.at(tokenLockingAddress);

    // Setup a new network instance as we'll be modifying the global skills tree
    colonyNetwork = await setupColonyNetwork();
    await colonyNetwork.setTokenLocking(tokenLockingAddress);
    await tokenLocking.setColonyNetwork(colonyNetwork.address);
    ({ metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

    // Initialise global skills tree: 1 -> 4 -> 5, local skills tree 2 -> 3
    await metaColony.addGlobalSkill(1);
    await metaColony.addGlobalSkill(4);

    await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);
    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();

    goodClient = new ReputationMinerTestWrapper({ loader, realProviderPort, useJsTree, minerAddress: MINER1 });
  });

  beforeEach(async () => {
    await goodClient.resetDB();
    await goodClient.initialise(colonyNetwork.address);

    // Advance two cycles to clear active and inactive state.
    await advanceMiningCycleNoContest({ colonyNetwork, test: this });
    await advanceMiningCycleNoContest({ colonyNetwork, test: this });

    // The inactive reputation log now has the reward for this miner, and the accepted state is empty.
    // This is the same starting point for all tests.
    const repCycle = await getActiveRepCycle(colonyNetwork);
    const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
    assert.equal(nInactiveLogEntries.toNumber(), 1);

    // Burn MAIN_ACCOUNTS accumulated mining rewards.
    const userBalance = await clnyToken.balanceOf(MINER1);
    await clnyToken.burn(userBalance, { from: MINER1 });

    await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);
    await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);
    await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(4));
  });

  afterEach(async () => {
    await finishReputationMiningCycleAndWithdrawAllMinerStakes(colonyNetwork, this);
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
        skillId: 5,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER2
      });

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
        worker: MINER2
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

      const badClient = new MaliciousReputationMinerClaimNoOriginReputation(
        { loader, realProviderPort, useJsTree, minerAddress: MINER2 },
        34, // Passing in update number for colony wide skillId: 5, user: 0
        1
      );

      // Moving the state to the bad client
      await badClient.initialise(colonyNetwork.address);
      const currentGoodClientState = await goodClient.getRootHash();
      await badClient.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const righthash = await goodClient.getRootHash();
      const wronghash = await badClient.getRootHash();
      assert(righthash !== wronghash, "Hashes from clients are equal, surprisingly");

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient);
      await repCycle.confirmNewHash(1);
      const acceptedHash = await colonyNetwork.getReputationRootHash();
      assert.equal(righthash, acceptedHash, "The correct hash was not accepted");
    });

    it("if one person lies about what the origin skill is when there is an origin skill for a user update", async () => {
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
        worker: MINER2
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
        worker: MINER2
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation updates for one task completion (manager, worker (domain and skill), evaluator);
      // That's five in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nLogEntries.toNumber(), 5);

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
      const righthash = await goodClient.getRootHash();
      const wronghash = await badClientWrongUser.getRootHash();
      assert(righthash !== wronghash, "Hashes from clients are equal, surprisingly");

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
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("if origin skill reputation calculation underflows and is wrong", async () => {
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 5,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER2
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 4,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation update for one task completion (manager, worker, evaluator);
      // That's five in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nLogEntries.toNumber(), 5);

      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, minerAddress: MINER2, realProviderPort, useJsTree },
        30, // Passing in colony wide update number for skillId: 4, user: 0
        "0xfffffffff"
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
        client2: { respondToChallenge: "colony-reputation-mining-decreased-reputation-value-incorrect" }
      });
      await repCycle.confirmNewHash(1);
    });
  });

  describe("should correctly resolve a dispute over child skill", () => {
    it("if child skill reputation calculation is wrong", async () => {
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 5,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER2
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
        worker: MINER2
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation update for one task completion (manager, worker, evaluator);
      // That's five in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nLogEntries.toNumber(), 5);

      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, minerAddress: MINER2, realProviderPort, useJsTree },
        29, // Passing in update number for skillId: 5, user: 9f485401a3c22529ab6ea15e2ebd5a8ca54a5430
        "0xf"
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
        client2: { respondToChallenge: "colony-reputation-mining-child-reputation-value-incorrect" }
      });
      await repCycle.confirmNewHash(1);
    });

    it("if a child skill reputation calculation (in a negative update) is wrong", async () => {
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 5,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER2
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 4,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation update for one task completion (manager, worker, evaluator);
      // That's five in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nLogEntries.toNumber(), 5);

      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, minerAddress: MINER2, realProviderPort, useJsTree },
        29, // Passing in update number for skillId: 5, user: 9f485401a3c22529ab6ea15e2ebd5a8ca54a5430
        "4800000000000"
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
        client2: { respondToChallenge: "colony-reputation-mining-child-reputation-value-incorrect" }
      });
      await repCycle.confirmNewHash(1);
    });

    it("if a child skill reputation calculation is wrong and that user has never had that reputation before", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 4,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2
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
        21, // Passing in update number for skillId: 5, user: 9f485401a3c22529ab6ea15e2ebd5a8ca54a5430
        "0xffffffffffffffff"
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
        client2: { respondToChallenge: "colony-reputation-mining-child-reputation-value-non-zero" }
      });
      await repCycle.confirmNewHash(1);
    });
  });

  describe("should correctly resolve a dispute over colony wide reputation", () => {
    it("if a colony-wide calculation (for a parent skill) is wrong", async () => {
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 5,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 2,
        workerRating: 2,
        worker: MINER2
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
        worker: MINER2
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation update for one task completion (manager, worker, evaluator);
      // That's five in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nLogEntries.toNumber(), 5);

      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, minerAddress: MINER2, realProviderPort, useJsTree },
        28, // Passing in colony wide update number for skillId: 4, user: 0
        "0xffff"
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
        client2: { respondToChallenge: "colony-reputation-mining-decreased-reputation-value-incorrect" }
      });
      await repCycle.confirmNewHash(1);
    });

    it("if a colony-wide calculation (for a child skill) is wrong", async () => {
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 5,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER2
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 4,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 1,
        workerRating: 1,
        worker: accounts[5]
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
        26, // Passing in update number for skillId: 5, user: 0
        "0xfffffffffff"
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
        client2: { respondToChallenge: "colony-reputation-mining-child-reputation-value-incorrect" }
      });
      await repCycle.confirmNewHash(1);
    });

    it("if one person lies about what the child skill is", async () => {
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
        worker: MINER2
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
        worker: MINER2
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
      assert.equal(nLogEntries.toNumber(), 5);

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
      const righthash = await goodClient.getRootHash();
      const wronghash = await badClient.getRootHash();
      assert(righthash !== wronghash, "Hashes from clients are equal, surprisingly");

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
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("if a colony-wide child skill reputation amount calculation underflows and is wrong", async () => {
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 5,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 1000000000000,
        managerRating: 2,
        workerRating: 2,
        worker: MINER2
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 4,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 1000000000001,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation update for one task completion (manager, worker, evaluator);
      // That's five in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nLogEntries.toNumber(), 5);

      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, minerAddress: MINER2, realProviderPort, useJsTree },
        26, // Passing in colony wide update number for skillId: 5, user: 0
        "0xfffffffff"
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
        client2: { respondToChallenge: "colony-reputation-mining-child-reputation-value-non-zero" }
      });
      await repCycle.confirmNewHash(1);
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
        skillId: 5,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER2
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
        worker: MINER2
      });

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation update for one task completion (manager, worker, evaluator);
      // That's five in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nLogEntries.toNumber(), 5);

      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, realProviderPort, useJsTree, minerAddress: MINER2 },
        27, // Passing in update number for skillId: 1, user: 0
        "0xfffffffff"
      );

      const badClient2 = new MaliciousReputationMinerExtraRep(
        { loader, realProviderPort, useJsTree, minerAddress: MINER3 },
        29, // Passing in update number for skillId: 5, user: 9f485401a3c22529ab6ea15e2ebd5a8ca54a5430
        "0xfffffffff"
      );

      await metaColony.addGlobalSkill(5);

      // Moving the state to the bad client
      await badClient.initialise(colonyNetwork.address);
      await badClient2.initialise(colonyNetwork.address);
      const currentGoodClientState = await goodClient.getRootHash();
      await badClient.loadState(currentGoodClientState);
      await badClient2.loadState(currentGoodClientState);

      await submitAndForwardTimeToDispute([goodClient, badClient, badClient2], this);
      await metaColony.addGlobalSkill(6);

      const righthash = await goodClient.getRootHash();
      const wronghash = await badClient.getRootHash();
      assert(righthash !== wronghash, "Hashes from clients are equal, surprisingly");

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decreased-reputation-value-incorrect" }
      });
      await repCycle.invalidateHash(0, 3);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient2, {
        client2: { respondToChallenge: "colony-reputation-mining-child-reputation-value-incorrect" }
      });
      await repCycle.confirmNewHash(2);
    });
  });

  it.skip("dispute should resolve if a bad actor responds on behalf of the good submission omitting some proofs that exist", async () => {
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
      worker: MINER2
    });

    await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });

    // Task two payouts are more so that the reputation should be zero afterwards
    await setupFinalizedTask({
      colonyNetwork,
      colony: metaColony,
      skill: 4,
      managerPayout: 10000000000000,
      evaluatorPayout: 10000000000,
      workerPayout: 50000000000000,
      managerRating: 1,
      workerRating: 1,
      worker: MINER2
    });

    await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });

    await goodClient.resetDB();
    await goodClient.saveCurrentState();

    // The update log should contain the person being rewarded for the previous
    // update cycle, and reputation updates for one task completion (manager, worker (domain and skill), evaluator);
    // That's five in total.
    const repCycle = await getActiveRepCycle(colonyNetwork);
    const nLogEntries = await repCycle.getReputationUpdateLogLength();
    assert.equal(nLogEntries.toNumber(), 5);

    const badClient = new MaliciousReputationMinerClaimNew(
      { loader, minerAddress: MINER2, realProviderPort, useJsTree },
      30 // Passing in update number for skillId: 1, user: 9f485401a3c22529ab6ea15e2ebd5a8ca54a5430
    );
    await badClient.initialise(colonyNetwork.address);

    // Moving the state to the bad client
    await badClient.initialise(colonyNetwork.address);
    const currentGoodClientState = await goodClient.getRootHash();
    await badClient.loadState(currentGoodClientState);

    await forwardTime(MINING_CYCLE_DURATION / 2, this);
    await goodClient.addLogContentsToReputationTree();
    await goodClient.submitRootHash();
    await badClient.addLogContentsToReputationTree();
    await badClient.submitRootHash();
    await forwardTime(MINING_CYCLE_DURATION / 2, this);

    await goodClient.submitJustificationRootHash();
    await badClient.submitJustificationRootHash();

    await goodClient.respondToBinarySearchForChallenge();
    await badClient.respondToBinarySearchForChallenge();
    await goodClient.respondToBinarySearchForChallenge();
    await badClient.respondToBinarySearchForChallenge();
    await goodClient.respondToBinarySearchForChallenge();
    await badClient.respondToBinarySearchForChallenge();
    await goodClient.respondToBinarySearchForChallenge();
    await badClient.respondToBinarySearchForChallenge();
    await goodClient.respondToBinarySearchForChallenge();
    await badClient.respondToBinarySearchForChallenge();
    await goodClient.respondToBinarySearchForChallenge();
    await badClient.respondToBinarySearchForChallenge();

    await goodClient.confirmBinarySearchResult();
    await badClient.confirmBinarySearchResult();

    // Now get all the information needed to fire off a respondToChallenge call
    const [round, index] = await goodClient.getMySubmissionRoundAndIndex();
    const submission = await repCycle.getDisputeRounds(round.toString(), index.toString());
    const firstDisagreeIdx = new BN(submission[8].toString());
    const lastAgreeIdx = firstDisagreeIdx.subn(1);
    const reputationKey = await goodClient.getKeyForUpdateNumber(lastAgreeIdx.toString());
    const [agreeStateBranchMask, agreeStateSiblings] = await goodClient.justificationTree.getProof(`0x${lastAgreeIdx.toString(16, 64)}`);
    const [disagreeStateBranchMask, disagreeStateSiblings] = await goodClient.justificationTree.getProof(`0x${firstDisagreeIdx.toString(16, 64)}`);
    const logEntryNumber = await goodClient.getLogEntryNumberForLogUpdateNumber(lastAgreeIdx.toString());

    // This is an incorrect response coming from a bad actor, but claiming to be responding on behalf of the good client
    repCycle.respondToChallenge(
      [
        round.toString(),
        index.toString(),
        goodClient.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.branchMask.toString(),
        goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.nNodes.toString(),
        agreeStateBranchMask.toString(),
        goodClient.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.nNodes.toString(),
        disagreeStateBranchMask.toString(),
        goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.branchMask,
        logEntryNumber.toString(),
        0,
        goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].originReputationProof.branchMask,
        goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.reputation,
        goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.uid,
        goodClient.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.reputation,
        goodClient.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.uid,
        goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.reputation,
        goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.uid,
        0,
        // This is the right line.
        // goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].originReputationProof.reputation,
        goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].originReputationProof.uid
      ],
      reputationKey,
      goodClient.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.siblings,
      agreeStateSiblings,
      disagreeStateSiblings,
      goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.key,
      goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.siblings,
      goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].originReputationProof.key,
      goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].originReputationProof.siblings,
      { gasLimit: 4000000 }
    );

    // Now respond with the bad client
    await badClient.respondToChallenge();

    // Try and respond as a good actor
    await goodClient.respondToChallenge();

    // Try and complete this mining cycle.
    await forwardTime(MINING_CYCLE_DURATION / 6, this);
    await repCycle.invalidateHash(0, 1);
    await repCycle.confirmNewHash(1);
    const acceptedHash = await colonyNetwork.getReputationRootHash();
    const goodHash = await goodClient.getRootHash();
    assert.equal(acceptedHash, goodHash);
  });
});
