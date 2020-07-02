/* globals artifacts */
import BN from "bn.js";
import { ethers } from "ethers";
import path from "path";
import chai from "chai";
import bnChai from "bn-chai";

import TruffleLoader from "../../packages/reputation-miner/TruffleLoader";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, giveUserCLNYTokensAndStake } from "../../helpers/test-data-generator";

import { MINING_CYCLE_DURATION, MINING_CYCLE_TIMEOUT, DEFAULT_STAKE, REWARD, UINT256_MAX, MIN_STAKE, WAD } from "../../helpers/constants";

import {
  forwardTime,
  checkErrorRevert,
  getActiveRepCycle,
  advanceMiningCycleNoContest,
  submitAndForwardTimeToDispute,
  accommodateChallengeAndInvalidateHash,
  getValidEntryNumber,
  finishReputationMiningCycle,
  runBinarySearch,
  checkErrorRevertEthers,
  currentBlock,
  makeReputationKey,
} from "../../helpers/test-helper";

import ReputationMinerTestWrapper from "../../packages/reputation-miner/test/ReputationMinerTestWrapper";
import MaliciousReputationMinerExtraRep from "../../packages/reputation-miner/test/MaliciousReputationMinerExtraRep";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ITokenLocking = artifacts.require("ITokenLocking");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "../..", "build", "contracts"),
});

const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;
const useJsTree = true;

let colonyNetwork;
let tokenLocking;
let metaColony;
let clnyToken;
let goodClient;
let badClient;
let badClient2;

const setupNewNetworkInstance = async (MINER1, MINER2, MINER3) => {
  colonyNetwork = await setupColonyNetwork();
  const tokenLockingAddress = await colonyNetwork.getTokenLocking();
  tokenLocking = await ITokenLocking.at(tokenLockingAddress);
  ({ metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

  await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);
  await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);
  await giveUserCLNYTokensAndStake(colonyNetwork, MINER3, DEFAULT_STAKE);
  await colonyNetwork.initialiseReputationMining();
  await colonyNetwork.startNextCycle();

  goodClient = new ReputationMinerTestWrapper({ loader, minerAddress: MINER1, realProviderPort, useJsTree });
  // Mess up the second calculation. There will always be one if giveUserCLNYTokens has been called.
  badClient = new MaliciousReputationMinerExtraRep({ loader, minerAddress: MINER2, realProviderPort, useJsTree }, 1, 0xfffffffff);
  // Mess up the second calculation in a different way
  badClient2 = new MaliciousReputationMinerExtraRep({ loader, minerAddress: MINER3, realProviderPort, useJsTree }, 1, 0xeeeeeeeee);
};

contract("Reputation mining - root hash submissions", (accounts) => {
  const MINER1 = accounts[5];
  const MINER2 = accounts[6];
  const MINER3 = accounts[7];
  const MINER4 = accounts[8];

  before(async () => {
    // Setup a new network instance as we'll be modifying the global skills tree
    await setupNewNetworkInstance(MINER1, MINER2, MINER3);
  });

  beforeEach(async () => {
    await goodClient.resetDB();
    await badClient.resetDB();
    await badClient2.resetDB();

    await goodClient.initialise(colonyNetwork.address);
    await badClient.initialise(colonyNetwork.address);
    await badClient2.initialise(colonyNetwork.address);

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
    if (!reputationMiningGotClean) await setupNewNetworkInstance(MINER1, MINER2, MINER3);
  });

  describe("when determining submission eligibility", () => {
    it("should allow a new reputation hash to be submitted", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x12345678", 10, "0x00", 10, { from: MINER1 });

      const submitterAddress = await repCycle.getSubmissionUser("0x12345678", 10, "0x00", 0);
      expect(submitterAddress).to.equal(MINER1);
    });

    it("should not allow someone to submit a new reputation hash if they are ineligible", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);

      await checkErrorRevert(
        repCycle.submitRootHash("0x12345678", 10, "0x00", 10, { from: MINER1 }),
        "colony-reputation-mining-cycle-submission-not-within-target"
      );
    });

    it("should not allow someone to submit a new reputation hash to the next ReputationMiningCycle", async () => {
      // Inactive mining cycle
      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);

      await checkErrorRevert(repCycle.submitRootHash("0x12345678", 10, "0x00", 10, { from: MINER1 }), "colony-reputation-mining-cycle-not-open");
    });

    it("should allow someone to submit a new reputation hash if they are eligible inside the window", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      // Find an entry that will be eligible in the second half of the window
      const entryNumber = await getValidEntryNumber(colonyNetwork, MINER1, "0x12345678");
      await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MINER1 });
    });

    it("should not allow a user to back more than one hash in a single cycle", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      const entryNumber = await getValidEntryNumber(colonyNetwork, MINER1, "0x12345678");
      await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MINER1 });

      const entryNumber2 = await getValidEntryNumber(colonyNetwork, MINER1, "0x87654321");
      await checkErrorRevert(
        repCycle.submitRootHash("0x87654321", 10, "0x00", entryNumber2, { from: MINER1 }),
        "colony-reputation-mining-submitting-different-hash"
      );
    });

    it("should not allow a user to back the same hash with different number of leaves in a single cycle", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      const entryNumber = await getValidEntryNumber(colonyNetwork, MINER1, "0x12345678");
      await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MINER1 });

      await checkErrorRevert(
        repCycle.submitRootHash("0x12345678", 11, "0x00", entryNumber, { from: MINER1 }),
        "colony-reputation-mining-submitting-different-nleaves"
      );
    });

    it("should not allow a user to back the same hash with same number of leaves but different JRH in a single cycle", async () => {
      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      const entryNumber = await getValidEntryNumber(colonyNetwork, MINER1, "0x12345678");
      await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MINER1 });

      await checkErrorRevert(
        repCycle.submitRootHash("0x12345678", 10, "0x01", entryNumber, { from: MINER1 }),
        "colony-reputation-mining-submitting-different-jrh"
      );
      const nUniqueSubmittedHashes = await repCycle.getNUniqueSubmittedHashes();
      expect(nUniqueSubmittedHashes).to.eq.BN(1);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
    });

    it("should not allow a user to submit the same entry for the same hash twice in a single cycle", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      const entryNumber = await getValidEntryNumber(colonyNetwork, MINER1, "0x12345678");
      await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MINER1 });

      await checkErrorRevert(
        repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MINER1 }),
        "colony-reputation-mining-submitting-same-entry-index"
      );
    });

    it("should allow a user to back the same hash more than once in a same cycle with different entries, and be rewarded", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      const entryNumber = await getValidEntryNumber(colonyNetwork, MINER1, "0x12345678");
      const entryNumber2 = await getValidEntryNumber(colonyNetwork, MINER1, "0x12345678", entryNumber + 1);

      await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MINER1 });
      await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber2, { from: MINER1 });

      const nUniqueSubmittedHashes = await repCycle.getNUniqueSubmittedHashes();
      expect(nUniqueSubmittedHashes).to.eq.BN(1);

      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await repCycle.confirmNewHash(0);

      // Check that they received the reward
      const balance1Updated = await clnyToken.balanceOf(MINER1);
      expect(balance1Updated, "Account was not rewarded properly").to.be.zero; // Reward is 0 for now

      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const inactiveRepCycle = await IReputationMiningCycle.at(addr);

      // Check that they will be getting the reputation owed to them.
      let repLogEntryMiner = await inactiveRepCycle.getReputationUpdateLogEntry(0);
      expect(repLogEntryMiner.user).to.equal(MINER1);
      expect(repLogEntryMiner.amount).to.be.zero; // Reward is 0 for now
      expect(repLogEntryMiner.skillId).to.eq.BN(2);
      expect(repLogEntryMiner.colony).to.equal(metaColony.address);
      expect(repLogEntryMiner.nUpdates).to.eq.BN(4);
      expect(repLogEntryMiner.nPreviousUpdates).to.be.zero;

      repLogEntryMiner = await inactiveRepCycle.getReputationUpdateLogEntry(1);
      expect(repLogEntryMiner.user).to.equal(MINER1);
      expect(repLogEntryMiner.amount).to.be.zero; // Reward is 0 for now
      expect(repLogEntryMiner.skillId).to.eq.BN(2);
      expect(repLogEntryMiner.colony).to.equal(metaColony.address);
      expect(repLogEntryMiner.nUpdates).to.eq.BN(4);
      expect(repLogEntryMiner.nPreviousUpdates).to.eq.BN(4);

      const reputationUpdateLogLength = await inactiveRepCycle.getReputationUpdateLogLength();
      expect(reputationUpdateLogLength).to.eq.BN(2);
    });

    it("should only allow 12 entries to back a single hash in each cycle", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION - 600, this);

      let entryNumber = await getValidEntryNumber(colonyNetwork, MINER1, "0x12345678", 1);
      for (let i = 1; i <= 12; i += 1) {
        await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MINER1 });
        entryNumber = await getValidEntryNumber(colonyNetwork, MINER1, "0x12345678", entryNumber + 1);
      }

      await checkErrorRevert(
        repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MINER1 }),
        "colony-reputation-mining-max-number-miners-reached"
      );
    });

    it("should prevent submission of hashes with an invalid entry for the balance of a user", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);

      await checkErrorRevert(
        repCycle.submitRootHash("0x12345678", 10, "0x00", 1000000000000, { from: MINER1 }),
        "colony-reputation-mining-stake-minimum-not-met-for-index"
      );

      await repCycle.submitRootHash("0x87654321", 10, "0x00", 10, { from: MINER1 });
    });

    it("should prevent submission of hashes with a valid entry, but invalid hash for the current time", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);

      await checkErrorRevert(
        repCycle.submitRootHash("0x12345678", 10, "0x00", 10, { from: MINER1 }),
        "colony-reputation-mining-cycle-submission-not-within-target"
      );
    });

    it("should only allow the first submission after the window closes to be accepted", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION + 400, this); // Well after the window has closed
      await repCycle.submitRootHash("0x12345678", 10, "0x00", 10, { from: MINER1 });

      await checkErrorRevert(
        repCycle.submitRootHash("0x12345678", 10, "0x00", 10, { from: MINER2 }),
        "colony-reputation-mining-cycle-submissions-closed"
      );

      const submitterAddress = await repCycle.getSubmissionUser("0x12345678", 10, "0x00", 0);
      expect(submitterAddress).to.equal(MINER1);
    });

    it("should not allow someone to submit a new reputation hash if they stake after the cycle begins", async () => {
      await forwardTime(1, this); // The condition is `windowOpen >= stakeTimestamp` so we make sure they aren't equal.
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER4, DEFAULT_STAKE); // Just stake an extra token to reset the time to now
      await forwardTime(MINING_CYCLE_DURATION, this);

      let repCycle = await getActiveRepCycle(colonyNetwork);
      await checkErrorRevert(repCycle.submitRootHash("0x12345678", 10, "0x00", 10, { from: MINER4 }), "colony-reputation-mining-stake-too-recent");

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });
      await forwardTime(MINING_CYCLE_DURATION, this);
      repCycle = await getActiveRepCycle(colonyNetwork);
      await repCycle.submitRootHash("0x12345678", 10, "0x00", 10, { from: MINER4 });
    });

    it("should not allow someone to withdraw their stake if they have submitted a hash this round", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x12345678", 10, "0x00", 10, { from: MINER1 });

      const obligation = await tokenLocking.getObligation(MINER1, clnyToken.address, colonyNetwork.address);

      await checkErrorRevert(colonyNetwork.unstakeForMining(obligation, { from: MINER1 }), "colony-network-hash-submitted");
    });

    it("should allow a new reputation hash to be set if only one was submitted", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this }); // Defaults to (0x00, 0)

      const newRepCycle = await getActiveRepCycle(colonyNetwork);
      expect(newRepCycle.address).to.not.equal(ethers.constants.AddressZero);
      expect(repCycle.address).to.not.equal(ethers.constants.AddressZero);
      expect(newRepCycle.address).to.not.equal(repCycle.address);

      const rootHash = await colonyNetwork.getReputationRootHash();
      expect(rootHash).to.equal(ethers.constants.HashZero);

      const rootHashNLeaves = await colonyNetwork.getReputationRootHashNLeaves();
      expect(rootHashNLeaves).to.be.zero;
    });

    it("should error if a non existent root hash submission is gotten", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x12345678", 10, "0x00", 10, { from: MINER1 });
      await checkErrorRevertEthers(
        repCycle.getSubmissionUser("0x12345678", 10, "0x00", 10),
        "colony-reputation-mining-submission-index-out-of-range"
      );
    });
  });

  describe("when eliminating submissions", () => {
    it("should allow a new reputation hash to be set if all but one submitted have been eliminated", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" },
      });

      await repCycle.confirmNewHash(1);
      const newRepCycle = await getActiveRepCycle(colonyNetwork);
      expect(newRepCycle.address).to.not.equal(ethers.constants.AddressZero);
      expect(repCycle.address).to.not.equal(ethers.constants.AddressZero);
      expect(newRepCycle.address).to.not.equal(repCycle.address);

      const rootHash = await colonyNetwork.getReputationRootHash();
      const clientRootHash = await goodClient.getRootHash();
      expect(rootHash).to.eq.BN(clientRootHash);

      const rootHashNLeaves = await colonyNetwork.getReputationRootHashNLeaves();
      expect(rootHashNLeaves).to.eq.BN(goodClient.nReputations.toString()); // It's a BigNumber :sob:

      // Check that the deprecated getReputationRootHashNNodes still works
      const rootHashNNodes = await colonyNetwork.getReputationRootHashNNodes();
      expect(rootHashNNodes).to.eq.BN(goodClient.nReputations.toString()); // It's a BigNumber :sob:
    });

    it("should allow a new reputation hash to be moved to the next stage of competition even if it does not have a partner", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient, badClient2], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" },
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, badClient2); // Invalidate the 'null' that partners the third hash submitted.
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient2, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" },
      });
      await repCycle.confirmNewHash(2);

      const newRepCycle = await getActiveRepCycle(colonyNetwork);
      expect(newRepCycle.address).to.not.equal(ethers.constants.AddressZero);
      expect(repCycle.address).to.not.equal(ethers.constants.AddressZero);
      expect(newRepCycle.address).to.not.equal(repCycle.address);

      const rootHash = await colonyNetwork.getReputationRootHash();
      const clientRootHash = await goodClient.getRootHash();
      expect(rootHash).to.eq.BN(clientRootHash);

      const rootHashNLeaves = await colonyNetwork.getReputationRootHashNLeaves();
      expect(rootHashNLeaves).to.eq.BN(goodClient.nReputations.toString()); // It's a BigNumber :sob:
    });

    it("should not allow a new reputation hash to be set if more than one was submitted and they have not been elimintated", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await checkErrorRevert(repCycle.confirmNewHash(0), "colony-reputation-mining-final-round-not-complete");
      const newAddr = await colonyNetwork.getReputationMiningCycle(true);
      expect(newAddr).to.not.equal(ethers.constants.AddressZero);
      expect(repCycle.address).to.not.equal(ethers.constants.AddressZero);
      expect(newAddr).to.equal(repCycle.address);

      // Eliminate one so that the afterAll works.
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" },
      });
    });

    it("should not allow the last reputation hash to be eliminated", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" },
      });

      // TODO: this should just call invalidateHash, right?
      await checkErrorRevert(
        accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient),
        "colony-reputation-mining-cannot-invalidate-final-hash"
      );
    });

    it("should fail if one tries to invalidate a hash that does not exist", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient, badClient2], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" },
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, badClient2);

      await checkErrorRevert(repCycle.invalidateHash(1, 2), "colony-reputation-mining-dispute-id-not-in-range");

      // Cleanup after test
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient2, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" },
      });
      await repCycle.confirmNewHash(2);
    });

    it("should fail if one tries to invalidate a hash that has completed more challenge rounds than its opponent", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await forwardTime(MINING_CYCLE_DURATION / 6, this);

      await checkErrorRevert(repCycle.invalidateHash(0, 0), "colony-reputation-mining-less-challenge-rounds-completed");

      // Cleanup after test
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("should not allow a hash to be invalidated multiple times, which would move extra copies of its opponent to the next stage", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" },
      });

      await checkErrorRevert(repCycle.invalidateHash(0, 1), "colony-reputation-mining-proposed-hash-empty");
    });

    it("should not allow a hash to be invalidated and then moved on to the next stage by invalidating its now non-existent opponent", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" },
      });

      await checkErrorRevert(repCycle.invalidateHash(0, 0), "colony-reputation-mining-hash-already-progressed");
    });

    it("should invalidate a hash and its partner if both have timed out", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([badClient, badClient2, goodClient], this);
      await forwardTime(MINING_CYCLE_TIMEOUT, this);
      await repCycle.invalidateHash(0, 1);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient);
      await repCycle.confirmNewHash(1);
    });

    it("should prevent invalidation of hashes before they have timed out on a challenge", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await goodClient.addLogContentsToReputationTree();
      await badClient.addLogContentsToReputationTree();

      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await goodClient.submitRootHash();
      await badClient.submitRootHash();

      await checkErrorRevert(repCycle.invalidateHash(0, 1), "colony-reputation-mining-not-timed-out");
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await checkErrorRevert(repCycle.confirmNewHash(1), "colony-reputation-mining-final-round-not-complete");

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" },
      });

      await repCycle.confirmNewHash(1);
    });

    it("should allow submitted hashes with multiple backers to go through multiple responses to a challenge", async () => {
      await badClient.initialise(colonyNetwork.address);

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });
      const goodClient2 = new ReputationMinerTestWrapper({ loader, realProviderPort, useJsTree, minerAddress: MINER3 });
      await goodClient2.initialise(colonyNetwork.address);

      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      await goodClient.addLogContentsToReputationTree();
      await goodClient.submitRootHash();
      await goodClient2.addLogContentsToReputationTree();
      await goodClient2.submitRootHash();
      await badClient.addLogContentsToReputationTree();
      await badClient.submitRootHash();

      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      await goodClient2.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient2, badClient);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await goodClient2.respondToChallenge();
      const repCycle = await getActiveRepCycle(colonyNetwork);

      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });
  });

  describe("when rewarding and punishing good and bad submissions", () => {
    it("should punish stakers who submit a bad hash and reward those who defend a hash", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Clean out any pending rewards from previous tests. We are interested in exact balances.
      await colonyNetwork.claimMiningReward(MINER1);
      await colonyNetwork.claimMiningReward(MINER2);
      await colonyNetwork.claimMiningReward(MINER3);

      const userLockMiner1Before = await tokenLocking.getUserLock(clnyToken.address, MINER1);
      const userLockMiner2Before = await tokenLocking.getUserLock(clnyToken.address, MINER2);
      const userLockMiner3Before = await tokenLocking.getUserLock(clnyToken.address, MINER3);

      // We want badClient2 to submit the same hash as badClient for this test.
      badClient2 = new MaliciousReputationMinerExtraRep({ loader, minerAddress: MINER3, realProviderPort, useJsTree }, 1, "0xfffffffff");
      badClient2.initialise(colonyNetwork.address);

      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await goodClient.addLogContentsToReputationTree();
      await badClient.addLogContentsToReputationTree();
      await badClient2.addLogContentsToReputationTree();

      await goodClient.submitRootHash();
      await badClient.submitRootHash();
      await badClient2.submitRootHash();
      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      const repCycle = await getActiveRepCycle(colonyNetwork);
      const rewardIncrement = await repCycle.getDisputeRewardSize();

      const blockBeforeChallenge = await currentBlock();
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" },
      });

      const miner1NonceBefore = await web3.eth.getTransactionCount(MINER1, blockBeforeChallenge.number);
      const miner1NonceAfter = await web3.eth.getTransactionCount(MINER1);

      const miner2NonceBefore = await web3.eth.getTransactionCount(MINER2, blockBeforeChallenge.number);
      const miner2NonceAfter = await web3.eth.getTransactionCount(MINER2);
      const miner1SuccessfulDefences = miner1NonceAfter - miner1NonceBefore;
      // The bad miner has one of these transactions that fails
      const miner2SuccessfulDefences = miner2NonceAfter - miner2NonceBefore - 1;

      // Good responder will get rewardIncrement * number of times they defended a submission
      const miner1Gain = rewardIncrement.muln(miner1SuccessfulDefences);

      // Bad submitters will lose MIN_STAKE but gain rewardIncrement * number of times they defended their submission
      const miner2Loss = MIN_STAKE.sub(rewardIncrement.muln(miner2SuccessfulDefences));
      const miner3Loss = MIN_STAKE;

      // Claim the rewards for everyone. For them to be available to claim, we have to finish the mining cycle.
      await repCycle.confirmNewHash(1);

      // Now actually claim them
      await colonyNetwork.claimMiningReward(MINER1);
      await colonyNetwork.claimMiningReward(MINER2);
      await colonyNetwork.claimMiningReward(MINER3);

      const userLockMiner1 = await tokenLocking.getUserLock(clnyToken.address, MINER1);
      expect(userLockMiner1.balance, "Account was not rewarded properly").to.eq.BN(new BN(userLockMiner1Before.balance).add(miner1Gain));

      const userLockMiner2 = await tokenLocking.getUserLock(clnyToken.address, MINER2);
      expect(userLockMiner2.balance, "Account was not punished properly").to.eq.BN(new BN(userLockMiner2Before.balance).sub(miner2Loss));

      const userLockMiner3 = await tokenLocking.getUserLock(clnyToken.address, MINER3);
      expect(userLockMiner3.balance, "Account was not punished properly").to.eq.BN(new BN(userLockMiner3Before.balance).sub(miner3Loss));
    });

    it("should reward all stakers if they submitted the agreed new hash", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });
      await clnyToken.burn(REWARD, { from: MINER1 });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      const entryNumber = await getValidEntryNumber(colonyNetwork, MINER1, "0x12345678");
      const entryNumber2 = await getValidEntryNumber(colonyNetwork, MINER2, "0x12345678");

      await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MINER1 });
      await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber2, { from: MINER2 });

      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await repCycle.confirmNewHash(0);

      // Check that they have had their balance increase
      const balance1Updated = await clnyToken.balanceOf(MINER1);
      const balance2Updated = await clnyToken.balanceOf(MINER2);
      // More than half of the reward
      expect(balance1Updated).to.be.zero; // Reward is 0 for now
      // Less than half of the reward
      expect(balance2Updated).to.be.zero; // Reward is 0 for now
      // Sum is total reward within `stakers.length` wei of precision error
      expect(balance1Updated.add(balance2Updated)).to.be.zero; // Reward is 0 for now

      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const inactiveRepCycle = await IReputationMiningCycle.at(addr);

      // Check that they will be getting the reputation owed to them.
      let repLogEntryMiner = await inactiveRepCycle.getReputationUpdateLogEntry(0);
      expect(repLogEntryMiner.user).to.equal(MINER1);
      expect(repLogEntryMiner.amount).to.eq.BN(balance1Updated);
      expect(repLogEntryMiner.skillId).to.eq.BN(2);
      expect(repLogEntryMiner.colony).to.equal(metaColony.address);
      expect(repLogEntryMiner.nUpdates).to.eq.BN(4);
      expect(repLogEntryMiner.nPreviousUpdates).to.be.zero;

      repLogEntryMiner = await inactiveRepCycle.getReputationUpdateLogEntry(1);
      expect(repLogEntryMiner.user).to.equal(MINER2);
      expect(repLogEntryMiner.amount).to.eq.BN(balance2Updated);
      expect(repLogEntryMiner.skillId).to.eq.BN(2);
      expect(repLogEntryMiner.colony).to.equal(metaColony.address);
      expect(repLogEntryMiner.nUpdates).to.eq.BN(4);
      expect(repLogEntryMiner.nPreviousUpdates).to.eq.BN(4);

      const reputationUpdateLogLength = await inactiveRepCycle.getReputationUpdateLogLength();
      expect(reputationUpdateLogLength).to.eq.BN(2);
    });

    it("should be able to complete a cycle and claim rewards even if CLNY has been locked", async () => {
      await metaColony.mintTokens(WAD);
      await metaColony.claimColonyFunds(clnyToken.address);
      await metaColony.bootstrapColony([MINER1], [WAD]);

      await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });
      await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });
      await clnyToken.burn(REWARD, { from: MINER1 });

      const repCycle = await getActiveRepCycle(colonyNetwork);

      // Lock CLNY via a reward payout in the metacolony
      await metaColony.mintTokens(WAD);
      await metaColony.claimColonyFunds(clnyToken.address);
      // Move all of them in to the reward pot
      const amount = await metaColony.getFundingPotBalance(1, clnyToken.address);
      await metaColony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, amount, clnyToken.address);

      const result = await metaColony.getDomain(1);
      const rootDomainSkill = result.skillId;

      // Get the proof for the colony-wide reputation in the root domain. Used to start reward payouts.
      const colonyWideReputationKey = makeReputationKey(metaColony.address, rootDomainSkill);
      const { key, value, branchMask, siblings } = await goodClient.getReputationProofObject(colonyWideReputationKey);
      const colonyWideReputationProof = [key, value, branchMask, siblings];

      await metaColony.startNextRewardPayout(clnyToken.address, ...colonyWideReputationProof);

      await goodClient.saveCurrentState();

      const goodClientHash = await goodClient.reputationTree.getRootHash();
      await badClient.loadState(goodClientHash);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" },
      });

      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await repCycle.confirmNewHash(1);
      await colonyNetwork.claimMiningReward(MINER1);
    });

    it("should correctly calculate the miner weight", async () => {
      const UINT32_MAX = UINT256_MAX.shrn(256 - 32);
      const T = 7776000;
      let weight;

      // Large weight (staked for UINT256_MAX, first submission)
      weight = await colonyNetwork.calculateMinerWeight(UINT256_MAX, 0);
      expect(weight).to.eq.BN("999999964585636861");

      // Large weight (staked for UINT32_MAX, first submission)
      weight = await colonyNetwork.calculateMinerWeight(UINT32_MAX, 0);
      expect(weight).to.eq.BN("999999964585636861");

      // Middle weight (staked for UINT32_MAX, last submission)
      weight = await colonyNetwork.calculateMinerWeight(UINT32_MAX, 11);
      expect(weight).to.eq.BN("541666647483886633");

      // Middle weight I (staked for T, first submission)
      weight = await colonyNetwork.calculateMinerWeight(T, 0);
      expect(weight).to.eq.BN("625000000000000000");

      // Middle weight II (staked for T, last submission)
      weight = await colonyNetwork.calculateMinerWeight(T, 11);
      expect(weight).to.eq.BN("338541666666666667");

      // Smallest weight (staked for 0, last submission)
      weight = await colonyNetwork.calculateMinerWeight(0, 11);
      expect(weight).to.be.zero;

      // Use submissionIndex higher than the max allowed number of miners
      weight = await colonyNetwork.calculateMinerWeight(0, 100);
      expect(weight).to.be.zero;
    });
  });
});
