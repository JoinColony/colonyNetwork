/* globals artifacts */

import path from "path";
import BN from "bn.js";
import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";
import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";

import {
  forwardTime,
  checkErrorRevert,
  checkErrorRevertEthers,
  submitAndForwardTimeToDispute,
  runBinarySearch,
  getActiveRepCycle,
  advanceMiningCycleNoContest,
  accommodateChallengeAndInvalidateHash,
  finishReputationMiningCycle,
  removeSubdomainLimit
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
import MaliciousReputationMinerWrongResponse from "../../packages/reputation-miner/test/MaliciousReputationMinerWrongResponse";
import MaliciousReputationMinerWrongProofLogEntry from "../../packages/reputation-miner/test/MaliciousReputationMinerWrongProofLogEntry";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "../..", "build", "contracts")
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

  // Initialise global skills tree: 3, local skills tree 1 -> 4 -> 5
  //                                                      \-> 2
  await metaColony.addDomain(1, 0, 1);
  await metaColony.addDomain(1, 1, 2);

  await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);
  await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);
  await colonyNetwork.initialiseReputationMining();
  await colonyNetwork.startNextCycle();

  goodClient = new ReputationMinerTestWrapper({ loader, realProviderPort, useJsTree, minerAddress: MINER1 });
};

contract("Reputation Mining - disputes resolution misbehaviour", accounts => {
  const MINER1 = accounts[5];
  const MINER2 = accounts[6];
  const MINER3 = accounts[7];

  before(async () => {
    // Setup a new network instance as we'll be modifying the global skills tree
    await setupNewNetworkInstance(MINER1, MINER2);
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
    expect(nInactiveLogEntries).to.eq.BN(1);

    await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(4));
  });

  afterEach(async () => {
    const reputationMiningGotClean = await finishReputationMiningCycle(colonyNetwork, this);
    if (!reputationMiningGotClean) await setupNewNetworkInstance(MINER1, MINER2);
  });

  // The dispute resolution flow is as follows:
  // submitRootHash()
  // confirmJustificationRootHash()
  // respondToBinarySearchForChallenge()
  // confirmBinarySearchResult()
  // respondToChallenge()
  // invalidateHash => confirmNewHash
  describe("when dispute flow order is not kept", () => {
    it("should prevent a user from jumping ahead during dispute resolution", async () => {
      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 1, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x00", 0, "0x00", 10, { from: MINER1 });
      await repCycle.confirmNewHash(0);

      repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      // Check we can't start binary search before we've confirmed JRH
      await checkErrorRevertEthers(goodClient.respondToBinarySearchForChallenge(), "colony-reputation-mining-challenge-not-active");

      // Check we can't confirm binary search before we've confirmed JRH
      await checkErrorRevertEthers(goodClient.confirmBinarySearchResult(), "colony-reputation-jrh-hash-not-verified");

      // Check we can't respond to challenge before we've confirmed JRH
      await checkErrorRevertEthers(goodClient.respondToChallenge(), "colony-reputation-mining-binary-search-result-not-confirmed");
      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      // Check we can't confirm binary search before we've started it
      await checkErrorRevertEthers(goodClient.confirmBinarySearchResult(), "colony-reputation-binary-search-incomplete");

      // Check we can't respond to challenge before we've started binary search
      await checkErrorRevertEthers(goodClient.respondToChallenge(), "colony-reputation-binary-search-incomplete");

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();

      // Check we can't confirm binary search before we've finished it
      // Check we can't respond to challenge before we've finished it
      await runBinarySearch(goodClient, badClient);

      // Check we can't respond to challenge before we've confirmed the binary search result
      await checkErrorRevertEthers(goodClient.respondToChallenge(), "colony-reputation-mining-binary-search-result-not-confirmed");

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      // Check we can't confirm binary search once it's already finished
      await checkErrorRevertEthers(goodClient.confirmBinarySearchResult(), "colony-reputation-binary-search-result-already-confirmed");

      // Cleanup
      await goodClient.respondToChallenge();
      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("should prevent a user from attempting to defend a DisputedEntry beyond the size of a round.", async () => {
      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 1, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x00", 0, "0x00", 10, { from: MINER1 });
      await repCycle.confirmNewHash(0);

      repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await checkErrorRevert(
        repCycle.confirmJustificationRootHash(0, 10000, ["0x00"], ["0x00"]),
        "colony-reputation-mining-index-beyond-round-length"
      );
      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await checkErrorRevert(
        repCycle.respondToBinarySearchForChallenge(0, 10000, "0x00", ["0x00"]),
        "colony-reputation-mining-index-beyond-round-length"
      );

      await runBinarySearch(goodClient, badClient);

      await checkErrorRevert(repCycle.confirmBinarySearchResult(0, 10000, "0x00", ["0x00"]), "colony-reputation-mining-index-beyond-round-length");

      // // Check we can't respond to challenge before we've confirmed the binary search result
      // await checkErrorRevertEthers(goodClient.respondToChallenge(), "colony-reputation-mining-binary-search-result-not-confirmed");

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await checkErrorRevert(
        repCycle.respondToChallenge(
          [0, 10000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          ["0x00", "0x00", "0x00", "0x00", "0x00", "0x00", "0x00"],
          [],
          [],
          [],
          [],
          [],
          []
        ),
        "colony-reputation-mining-index-beyond-round-length"
      );

      // Cleanup
      await goodClient.respondToChallenge();
      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("should prevent a hash from claiming a bye if it might still get an opponent in round 1", async function advancingTest() {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER3, DEFAULT_STAKE);

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x00", 0, "0x00", 10, { from: MINER1 });
      await repCycle.confirmNewHash(0);

      await goodClient.saveCurrentState();
      const savedHash = await goodClient.reputationTree.getRootHash();

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 1, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);
      const badClient2 = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER3 }, 1, 0xffffffffff);
      await badClient2.initialise(colonyNetwork.address);

      await badClient.loadState(savedHash);
      await badClient2.loadState(savedHash);

      repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await goodClient.addLogContentsToReputationTree();
      await goodClient.submitRootHash();
      await badClient.addLogContentsToReputationTree();
      await badClient.submitRootHash();
      await badClient2.addLogContentsToReputationTree();
      await badClient2.submitRootHash();

      await checkErrorRevert(repCycle.invalidateHash(0, 3), "colony-reputation-mining-submission-window-still-open");
      // Cleanup
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
      });
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await repCycle.invalidateHash(0, 3);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient2, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
      });
      await repCycle.confirmNewHash(2);
    });

    it("should prevent a hash from advancing if it might still get an opponent", async function advancingTest() {
      this.timeout(10000000);

      expect(accounts.length, "Not enough accounts for test to run").to.be.at.least(11);
      const accountsForTest = accounts.slice(3, 11);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(8));
      for (let i = 0; i < 8; i += 1) {
        await giveUserCLNYTokensAndStake(colonyNetwork, accountsForTest[i], DEFAULT_STAKE);
        await setupFinalizedTask({ colonyNetwork, colony: metaColony, worker: accountsForTest[i] });
        // These have to be done sequentially because this function uses the total number of tasks as a proxy for getting the
        // right taskId, so if they're all created at once it messes up.
      }

      // We need to complete the current reputation cycle so that all the required log entries are present
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const clients = await Promise.all(
        accountsForTest.map(async (addr, index) => {
          const client = new MaliciousReputationMinerExtraRep(
            { loader, realProviderPort, useJsTree, minerAddress: addr },
            accountsForTest.length - index,
            index
          );
          // Each client will get a different reputation update entry wrong by a different amount, apart from the first one which
          // will submit a correct hash.
          await client.initialise(colonyNetwork.address);
          return client;
        })
      );

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      for (let i = 0; i < 8; i += 1) {
        // Doing these individually rather than in a big loop because with many instances of the EVM
        // churning away at once, I *think* it's slower.
        await clients[i].addLogContentsToReputationTree();
        await clients[i].submitRootHash();
        await clients[i].confirmJustificationRootHash();
      }

      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[0], clients[1], {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[2], clients[3], {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[4], clients[5], {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
      });

      // This is the first pairing in round 2
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[0], clients[2], {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
      });
      await checkErrorRevert(
        accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[4]),
        "colony-reputation-mining-previous-dispute-round-not-complete"
      );

      // Now clean up
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[6], clients[7], {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[4], clients[6], {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[0], clients[4], {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
      });
      await repCycle.confirmNewHash(3);
    });

    it("should not allow stages to be skipped even if the number of updates is a power of 2", async () => {
      // Note that our jrhNNodes can never be a power of two, because we always have an even number of updates (because every reputation change
      // has a user-specific an a colony-specific effect, and we always have one extra state in the Justification Tree because we include the last
      // accepted hash as the first node. jrhNNodes is always odd, therefore, and can never be a power of two.
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(4));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        token: clnyToken,
        manager: MINER1,
        worker: MINER2,
        workerRating: 1,
        managerPayout: 1,
        evaluatorPayout: 1,
        workerPayout: 1
      });

      await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });

      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const inactiveRepCycle = await IReputationMiningCycle.at(addr);

      let powerTwoEntries = false;
      while (!powerTwoEntries) {
        await setupFinalizedTask( // eslint-disable-line prettier/prettier
          {
            colonyNetwork,
            colony: metaColony,
            token: clnyToken,
            evaluator: MINER1,
            worker: MINER2,
            workerRating: 1,
            managerPayout: 1,
            evaluatorPayout: 1,
            workerPayout: 1
          }
        );

        const nLogEntries = await inactiveRepCycle.getReputationUpdateLogLength();
        const lastLogEntry = await inactiveRepCycle.getReputationUpdateLogEntry(nLogEntries - 1);

        const currentHashNNodes = await colonyNetwork.getReputationRootHashNNodes();
        const nUpdates = new BN(lastLogEntry.nUpdates).add(new BN(lastLogEntry.nPreviousUpdates)).add(currentHashNNodes);
        // The total number of updates we expect is the nPreviousUpdates in the last entry of the log plus the number
        // of updates that log entry implies by itself, plus the number of decays (the number of nodes in current state)
        if (parseInt(nUpdates.toString(2).slice(1), 10) === 0) {
          powerTwoEntries = true;
        }
      }

      await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });

      await goodClient.saveCurrentState();
      const savedHash = await goodClient.reputationTree.getRootHash();

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 5, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await badClient.loadState(savedHash);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      // Incomplete binary search
      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
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

      // We need one more response to binary search from each side. Check we can't confirm early
      await checkErrorRevertEthers(goodClient.confirmBinarySearchResult(), "colony-reputation-binary-search-incomplete");

      // Check we can't respond to challenge before we've completed the binary search
      await checkErrorRevertEthers(goodClient.respondToChallenge(), "colony-reputation-binary-search-incomplete");
      await goodClient.respondToBinarySearchForChallenge();
      // Check we can't confirm even if we're done, but our opponent isn't
      await checkErrorRevertEthers(goodClient.confirmBinarySearchResult(), "colony-reputation-binary-search-incomplete");
      await badClient.respondToBinarySearchForChallenge();

      // Check we can't respond to challenge before confirming result
      await checkErrorRevertEthers(goodClient.respondToChallenge(), "colony-reputation-mining-binary-search-result-not-confirmed");

      // Now we can confirm
      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      // Check we can't continue confirming
      await checkErrorRevertEthers(goodClient.respondToBinarySearchForChallenge(), "colony-reputation-mining-challenge-not-active");
      await goodClient.respondToChallenge();
      // Check we can't respond again
      await checkErrorRevertEthers(goodClient.respondToChallenge(), "colony-reputation-mining-challenge-already-responded");

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });
  });

  describe("when miner misbehaving during confirmJustificationRootHash stage", async () => {
    it("should prevent a user from confirming a JRH they can't prove is correct", async () => {
      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 1, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      const lastLogEntry = await repCycle.getReputationUpdateLogEntry(nLogEntries.subn(1));
      const totalnUpdates = new BN(lastLogEntry.nUpdates).add(new BN(lastLogEntry.nPreviousUpdates));

      const [, siblings1] = await goodClient.justificationTree.getProof(`0x${new BN("0").toString(16, 64)}`);
      const [, siblings2] = await goodClient.justificationTree.getProof(`0x${totalnUpdates.toString(16, 64)}`);
      const [round, index] = await goodClient.getMySubmissionRoundAndIndex();

      // Mess up proofs in the reverse of the order they're checked in.

      siblings2.pop();

      await checkErrorRevert(
        repCycle.confirmJustificationRootHash(round, index, siblings1, siblings2),
        "colony-reputation-mining-invalid-jrh-proof-2-length"
      );

      siblings1.pop();

      await checkErrorRevert(
        repCycle.confirmJustificationRootHash(round, index, siblings1, siblings2),
        "colony-reputation-mining-invalid-jrh-proof-1-length"
      );

      // Cleanup
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
      });
      await checkErrorRevert(repCycle.confirmNewHash(0), "colony-reputation-mining-not-final-round");
      await repCycle.confirmNewHash(1);
    });
  });

  describe("when miner misbehaving during respondToBinarySearchForChallenge stage", async () => {
    it("should fail to respondToBinarySearchForChallenge if not consistent with JRH", async () => {
      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 1, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await checkErrorRevert(
        repCycle.respondToBinarySearchForChallenge(0, 0, "0x00", ["0x00", "0x00", "0x00"]),
        "colony-reputation-mining-invalid-binary-search-response"
      );

      // Cleanup
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
      });
      await repCycle.confirmNewHash(1);
    });
  });

  describe("when miner misbehaving during confirmBinarySearchResult stage", async () => {
    it("incorrectly confirming a binary search result should fail", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 3, 0xffffffffffff);
      await badClient.initialise(colonyNetwork.address);

      const repCycle = await getActiveRepCycle(colonyNetwork);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);

      const [round, index] = await goodClient.getMySubmissionRoundAndIndex();
      const disputeRound = await repCycle.getDisputeRound(round);
      const disputedEntry = disputeRound[index];
      const targetNode = disputedEntry.lowerBound;
      const targetNodeKey = ReputationMinerTestWrapper.getHexString(targetNode, 64);
      const [, siblings] = await goodClient.justificationTree.getProof(targetNodeKey);

      await checkErrorRevert(
        repCycle.confirmBinarySearchResult(round, index, "0x00", siblings),
        "colony-reputation-mining-invalid-binary-search-confirmation"
      );

      // Cleanup
      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await goodClient.confirmBinarySearchResult();
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });
  });

  describe("when miner misbehaving during respondToChallenge stage", async () => {
    it("should correctly check the proof of the origin skill reputation, if necessary", async () => {
      await fundColonyWithTokens(
        metaColony,
        clnyToken,
        new BN("1000000000000")
          .muln(4)
          .add(new BN(5000000000000))
          .add(new BN(1000000000))
      );

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 2,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000000,
        workerPayout: 1000000000000,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation update for two task completions (manager, worker, evaluator);
      // That's 9 in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nLogEntries).to.eq.BN(5);

      const badClient = new MaliciousReputationMinerExtraRep({ loader, minerAddress: MINER2, realProviderPort, useJsTree }, 14, 0xffffffffffff);
      await badClient.initialise(colonyNetwork.address);

      const badClient2 = new MaliciousReputationMinerWrongResponse({ loader, minerAddress: MINER1, realProviderPort, useJsTree }, 14, 123456);
      await badClient2.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await badClient2.addLogContentsToReputationTree();

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);
      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await checkErrorRevertEthers(badClient2.respondToChallenge(), "colony-reputation-mining-origin-reputation-nonzero");

      // Cleanup
      await forwardTime(MINING_CYCLE_DURATION, this);
      await goodClient.respondToChallenge();
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("should correctly check the proof of the child skill reputation, if necessary", async () => {
      await fundColonyWithTokens(
        metaColony,
        clnyToken,
        new BN("1000000000000")
          .muln(4)
          .add(new BN(5000000000000))
          .add(new BN(1000000000))
      );

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 2,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: MINER2
      });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        domainId: 2,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000000,
        workerPayout: 1,
        managerRating: 1,
        workerRating: 1,
        worker: MINER2
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation update for two task completions (manager, worker, evaluator);
      // That's 9 in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nLogEntries).to.eq.BN(9);

      const badClient = new MaliciousReputationMinerExtraRep({ loader, minerAddress: MINER2, realProviderPort, useJsTree }, 28, 0xffffffffffff);
      await badClient.initialise(colonyNetwork.address);

      const badClient2 = new MaliciousReputationMinerWrongResponse({ loader, minerAddress: MINER1, realProviderPort, useJsTree }, 17, 123456);
      await badClient2.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await badClient2.addLogContentsToReputationTree();

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);
      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await checkErrorRevertEthers(badClient2.respondToChallenge(), "colony-reputation-mining-child-reputation-nonzero");

      // Cleanup
      await forwardTime(MINING_CYCLE_DURATION, this);
      await goodClient.respondToChallenge();
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("should correctly require the proof of the reputation under dispute before and after the change in question", async () => {
      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 24, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      const badClient2 = new MaliciousReputationMinerWrongResponse({ loader, minerAddress: MINER1, realProviderPort, useJsTree }, 4, 123456);
      await badClient2.initialise(colonyNetwork.address);

      const badClient3 = new MaliciousReputationMinerWrongResponse({ loader, minerAddress: MINER1, realProviderPort, useJsTree }, 6, 123456);
      await badClient3.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await badClient2.addLogContentsToReputationTree();
      await badClient3.addLogContentsToReputationTree();

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);
      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await checkErrorRevertEthers(badClient2.respondToChallenge(), "colony-reputation-mining-invalid-before-reputation-proof");
      await checkErrorRevertEthers(badClient3.respondToChallenge(), "colony-reputation-mining-invalid-after-reputation-proof");

      // Cleanup
      await forwardTime(MINING_CYCLE_DURATION, this);
      const repCycle = await getActiveRepCycle(colonyNetwork);

      await goodClient.respondToChallenge();
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("should fail to respondToChallenge if any part of the key or hashedKey is wrong", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 3, 0xffffffffffff);
      await badClient.initialise(colonyNetwork.address);

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      const logEntry = await repCycle.getReputationUpdateLogEntry(0);
      const colonyAddress = ethers.utils.hexZeroPad(logEntry.colony, 32);
      const userAddress = ethers.utils.hexZeroPad(logEntry.user, 32);
      const skillId = ethers.utils.hexZeroPad(ethers.utils.bigNumberify(logEntry.skillId).toHexString(), 32);

      await checkErrorRevert(
        repCycle.respondToChallenge(
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          ["0x00", skillId, userAddress, "0x00", "0x00", "0x00", "0x00"],
          [],
          [],
          [],
          [],
          [],
          []
        ),
        "colony-reputation-mining-colony-address-mismatch"
      );

      await checkErrorRevert(
        repCycle.respondToChallenge(
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [colonyAddress, "0x00", userAddress, "0x00", "0x00", "0x00", "0x00"],
          [],
          [],
          [],
          [],
          [],
          []
        ),
        "colony-reputation-mining-skill-id-mismatch"
      );

      await checkErrorRevert(
        repCycle.respondToChallenge(
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [colonyAddress, skillId, "0x00", "0x00", "0x00", "0x00", "0x00"],
          [],
          [],
          [],
          [],
          [],
          []
        ),
        "colony-reputation-mining-user-address-mismatch"
      );

      await checkErrorRevert(
        repCycle.respondToChallenge(
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [colonyAddress, skillId, userAddress, "0x00", "0x00", "0x00", "0x00"],
          [],
          [],
          [],
          [],
          [],
          []
        ),
        "colony-reputation-mining-reputation-key-and-hash-mismatch"
      );

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await goodClient.respondToChallenge();
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("should fail to respondToChallenge if binary search for challenge is not complete yet", async () => {
      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 1, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();

      await checkErrorRevert(
        repCycle.respondToChallenge(
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          ["0x00", "0x00", "0x00", "0x00", "0x00", "0x00", "0x00"],
          [],
          [],
          [],
          [],
          [],
          []
        ),
        "colony-reputation-binary-search-incomplete"
      );

      // Cleanup
      await badClient.respondToBinarySearchForChallenge();
      await goodClient.respondToBinarySearchForChallenge();

      await badClient.respondToBinarySearchForChallenge();
      await goodClient.respondToBinarySearchForChallenge();

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await goodClient.respondToChallenge();
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    [
      { word: "high", badClient1Argument: 1, badClient2Argument: 1 },
      { word: "low", badClient1Argument: 9, badClient2Argument: -1 }
    ].forEach(async args => {
      it(`should fail to respondToChallenge if supplied log entry does not correspond to the entry under disagreement and supplied log entry
        is too ${args.word}`, async () => {
        await giveUserCLNYTokensAndStake(colonyNetwork, MINER3, DEFAULT_STAKE);

        await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(2));
        await setupFinalizedTask({ colonyNetwork, colony: metaColony });
        await setupFinalizedTask({ colonyNetwork, colony: metaColony });

        await advanceMiningCycleNoContest({ colonyNetwork, test: this });
        const repCycle = await getActiveRepCycle(colonyNetwork);

        await goodClient.addLogContentsToReputationTree();

        const badClient = new MaliciousReputationMinerExtraRep(
          { loader, realProviderPort, useJsTree, minerAddress: MINER2 },
          args.badClient1Argument,
          10
        );
        await badClient.initialise(colonyNetwork.address);

        const badClient2 = new MaliciousReputationMinerWrongProofLogEntry(
          { loader, realProviderPort, useJsTree, minerAddress: MINER3 },
          args.badClient2Argument
        );
        await badClient2.initialise(colonyNetwork.address);

        await submitAndForwardTimeToDispute([badClient, badClient2], this);

        await badClient.confirmJustificationRootHash();
        await badClient2.confirmJustificationRootHash();

        await runBinarySearch(badClient, badClient2);

        await goodClient.confirmBinarySearchResult();
        await badClient.confirmBinarySearchResult();

        if (args.word === "high") {
          await checkErrorRevertEthers(badClient2.respondToChallenge(), "colony-reputation-mining-update-number-part-of-previous-log-entry-updates");
        } else {
          await checkErrorRevertEthers(badClient2.respondToChallenge(), "colony-reputation-mining-update-number-part-of-following-log-entry-updates");
        }

        // Cleanup
        await forwardTime(MINING_CYCLE_DURATION / 6, this);
        await goodClient.respondToChallenge();
        await repCycle.invalidateHash(0, 0);
        await repCycle.confirmNewHash(1);
      });
    });
  });

  describe("when miner misbehaving during confirmNewHash stage", async () => {
    it("should only allow the last hash standing to be confirmed", async () => {
      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 1, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
      });
      await checkErrorRevert(repCycle.confirmNewHash(0), "colony-reputation-mining-not-final-round");
      await repCycle.confirmNewHash(1);
    });

    it("should refuse to confirmNewHash while the minimum submission window has not elapsed", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 1, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);
      await goodClient.addLogContentsToReputationTree();
      await badClient.addLogContentsToReputationTree();

      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await goodClient.submitRootHash();

      await checkErrorRevert(repCycle.confirmNewHash(0), "colony-reputation-mining-submission-window-still-open");

      // Cleanup
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await repCycle.confirmNewHash(0);
    });
  });
});
