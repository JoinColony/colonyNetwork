/* globals artifacts */

import path from "path";
import BN from "bn.js";
import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";
import request from "async-request";

import {
  forwardTime,
  checkErrorRevert,
  checkErrorRevertEthers,
  makeReputationKey,
  makeReputationValue,
  currentBlock,
  getValidEntryNumber,
  submitAndForwardTimeToDispute,
  runBinarySearch,
  getActiveRepCycle,
  advanceMiningCycleNoContest,
  accommodateChallengeAndInvalidateHash
} from "../helpers/test-helper";

import { giveUserCLNYTokens, giveUserCLNYTokensAndStake, setupFinalizedTask, fundColonyWithTokens } from "../helpers/test-data-generator";

import {
  UINT256_MAX,
  WAD,
  MIN_STAKE,
  DEFAULT_STAKE,
  INITIAL_FUNDING,
  MANAGER_PAYOUT,
  EVALUATOR_PAYOUT,
  WORKER_PAYOUT,
  MINING_CYCLE_DURATION,
  DECAY_RATE,
  ZERO_ADDRESS
} from "../helpers/constants";

import ReputationMiner from "../packages/reputation-miner/ReputationMiner";
import MaliciousReputationMinerExtraRep from "../packages/reputation-miner/test/MaliciousReputationMinerExtraRep";
import MaliciousReputationMinerWrongUID from "../packages/reputation-miner/test/MaliciousReputationMinerWrongUID";
import MaliciousReputationMinerReuseUID from "../packages/reputation-miner/test/MaliciousReputationMinerReuseUID";
import MaliciousReputationMinerWrongProofLogEntry from "../packages/reputation-miner/test/MaliciousReputationMinerWrongProofLogEntry";
import MaliciousReputationMinerWrongNewestReputation from "../packages/reputation-miner/test/MaliciousReputationMinerWrongNewestReputation";
import MaliciousReputationMinerClaimNew from "../packages/reputation-miner/test/MaliciousReputationMinerClaimNew";
import MaliciousReputationMinerUnsure from "../packages/reputation-miner/test/MaliciousReputationMinerUnsure";
import MaliciousReputationMinerWrongJRH from "../packages/reputation-miner/test/MaliciousReputationMinerWrongJRH";
import MaliciousReputationMinerWrongNNodes from "../packages/reputation-miner/test/MaliciousReputationMinerWrongNNodes";
import MaliciousReputationMinerWrongNNodes2 from "../packages/reputation-miner/test/MaliciousReputationMinerWrongNNodes2";

import ReputationMinerClient from "../packages/reputation-miner/ReputationMinerClient";

const EtherRouter = artifacts.require("EtherRouter");
const IMetaColony = artifacts.require("IMetaColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ITokenLocking = artifacts.require("ITokenLocking");
const Token = artifacts.require("Token");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");

const contractLoader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "build", "contracts")
});

const useJsTree = true;

const REWARD = WAD.muln(0); // No reward currently

contract("ColonyNetworkMining", accounts => {
  const MANAGER = accounts[0];
  const EVALUATOR = accounts[1];
  const WORKER = accounts[2];

  const MAIN_ACCOUNT = accounts[5];
  const OTHER_ACCOUNT = accounts[6];
  const OTHER_ACCOUNT2 = accounts[7];

  let metaColony;
  let colonyNetwork;
  let tokenLocking;
  let clny;
  let goodClient;
  let badClient;
  let badClient2;
  const REAL_PROVIDER_PORT = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await ITokenLocking.at(tokenLockingAddress);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);
    const clnyAddress = await metaColony.getToken();
    clny = await Token.at(clnyAddress);
    goodClient = new ReputationMiner({ loader: contractLoader, minerAddress: MAIN_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree });
    await goodClient.resetDB();
  });

  beforeEach(async () => {
    goodClient = new ReputationMiner({ loader: contractLoader, minerAddress: MAIN_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree });
    // Mess up the second calculation. There will always be one if giveUserCLNYTokens has been called.
    badClient = new MaliciousReputationMinerExtraRep(
      { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
      1,
      0xfffffffff
    );
    // Mess up the second calculation in a different way
    badClient2 = new MaliciousReputationMinerExtraRep(
      { loader: contractLoader, minerAddress: OTHER_ACCOUNT2, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
      1,
      0xeeeeeeeee
    );
    await goodClient.initialise(colonyNetwork.address);
    await badClient.initialise(colonyNetwork.address);
    await badClient2.initialise(colonyNetwork.address);

    // Kick off reputation mining.
    // TODO: Tests for the first reputation cycle (when log empty) should be done in another file
    const lock = await tokenLocking.getUserLock(clny.address, MAIN_ACCOUNT);
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
    const userBalance = await clny.balanceOf(MAIN_ACCOUNT);
    await clny.burn(userBalance, { from: MAIN_ACCOUNT });
  });

  afterEach(async () => {
    // Finish the current cycle. Can only do this at the start of a new cycle, if anyone has submitted a hash in this current cycle.
    await forwardTime(MINING_CYCLE_DURATION, this);
    const repCycle = await getActiveRepCycle(colonyNetwork);
    const nSubmittedHashes = await repCycle.getNSubmittedHashes();
    if (nSubmittedHashes.gtn(0)) {
      const nInvalidatedHashes = await repCycle.getNInvalidatedHashes();
      if (nSubmittedHashes.sub(nInvalidatedHashes).eqn(1)) {
        await repCycle.confirmNewHash(nSubmittedHashes.eqn(1) ? 0 : 1); // Not a general solution - only works for one or two submissions.
        // But for now, that's okay.
      } else {
        // We shouldn't get here. If this fires during a test, you haven't finished writing the test.
        console.log("We're mid dispute process, and can't untangle from here"); // eslint-disable-line no-console
        // process.exit(1);
        return;
      }
    }

    // Actually do the withdrawal.
    await Promise.all(
      accounts.map(async user => {
        const info = await tokenLocking.getUserLock(clny.address, user);
        const stakedBalance = new BN(info.balance);

        if (stakedBalance.gt(new BN(0))) {
          if (user === MAIN_ACCOUNT) {
            assert.isTrue(stakedBalance.gte(DEFAULT_STAKE), "Insufficient stake for MAIN_ACCOUNT");
            if (stakedBalance.gt(DEFAULT_STAKE)) {
              await tokenLocking.withdraw(clny.address, stakedBalance.sub(DEFAULT_STAKE), { from: user });
            }
          } else {
            await tokenLocking.withdraw(clny.address, stakedBalance, { from: user });
          }
        }

        const userBalance = await clny.balanceOf(user);
        if (userBalance.gt(new BN(0))) {
          await clny.burn(userBalance, { from: user });
        }
      })
    );
  });

  describe("Basic Functionality - no client used", () => {
    it("should allow miners to stake CLNY", async () => {
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, 9000);
      await clny.approve(tokenLocking.address, 5000, { from: OTHER_ACCOUNT });
      await tokenLocking.deposit(clny.address, 5000, { from: OTHER_ACCOUNT });

      const userBalance = await clny.balanceOf(OTHER_ACCOUNT);
      assert.equal(userBalance.toNumber(), 4000);

      const info = await tokenLocking.getUserLock(clny.address, OTHER_ACCOUNT);
      const stakedBalance = new BN(info.balance);
      assert.equal(stakedBalance.toNumber(), 5000);
    });

    it("should allow miners to withdraw staked CLNY", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, 5000);
      await tokenLocking.withdraw(clny.address, 5000, { from: OTHER_ACCOUNT });

      const info = await tokenLocking.getUserLock(clny.address, OTHER_ACCOUNT);
      const stakedBalance = new BN(info.balance);
      assert.equal(stakedBalance.toNumber(), 0);
    });

    it("should not allow miners to deposit more CLNY than they have", async () => {
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, 9000);
      await clny.approve(tokenLocking.address, 10000, { from: OTHER_ACCOUNT });

      await checkErrorRevert(tokenLocking.deposit(clny.address, 10000, { from: OTHER_ACCOUNT }));

      const userBalance = await clny.balanceOf(OTHER_ACCOUNT);
      assert.equal(userBalance.toNumber(), 9000);

      const info = await tokenLocking.getUserLock(clny.address, OTHER_ACCOUNT);
      const stakedBalance = new BN(info.balance);
      assert.equal(stakedBalance.toNumber(), 0);
    });

    it("should not allow miners to withdraw more CLNY than they staked, even if enough has been staked total", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, 9000);

      await checkErrorRevert(tokenLocking.withdraw(clny.address, 10000, { from: OTHER_ACCOUNT }), "ds-math-sub-underflow");

      const info = await tokenLocking.getUserLock(clny.address, OTHER_ACCOUNT);
      const stakedBalance = new BN(info.balance);
      assert.equal(stakedBalance.toNumber(), 9000);

      const userBalance = await clny.balanceOf(OTHER_ACCOUNT);
      assert.equal(userBalance.toNumber(), 0);
    });

    it("should allow a new reputation hash to be submitted", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x12345678", 10, "0x00", 10, { from: MAIN_ACCOUNT });

      const submitterAddress = await repCycle.getSubmittedHashes("0x12345678", 10, "0x00", 0);
      assert.equal(submitterAddress, MAIN_ACCOUNT);
    });

    it("should only allow the first submission after the window closes to be accepted", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION + 400, this); // Well after the window has closed
      await repCycle.submitRootHash("0x12345678", 10, "0x00", 10, { from: MAIN_ACCOUNT });

      await checkErrorRevert(
        repCycle.submitRootHash("0x12345678", 10, "0x00", 10, { from: OTHER_ACCOUNT }),
        "colony-reputation-mining-cycle-submissions-closed"
      );

      const submitterAddress = await repCycle.getSubmittedHashes("0x12345678", 10, "0x00", 0);
      assert.equal(submitterAddress, MAIN_ACCOUNT);
    });

    it("should not allow someone to submit a new reputation hash if they are not staking", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);

      await checkErrorRevert(repCycle.submitRootHash("0x12345678", 10, "0x00", 0), "colony-reputation-mining-zero-entry-index-passed");

      const nSubmittedHashes = await repCycle.getNSubmittedHashes();
      assert.isTrue(nSubmittedHashes.isZero());
    });

    it("should not allow someone to submit a new reputation hash if they stake after the cycle begins", async () => {
      await forwardTime(1, this); // The condition is `windowOpen >= stakeTimestamp` so we make sure they aren't equal.
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await forwardTime(MINING_CYCLE_DURATION, this);

      let repCycle = await getActiveRepCycle(colonyNetwork);
      await checkErrorRevert(
        repCycle.submitRootHash("0x12345678", 10, "0x00", 10, { from: OTHER_ACCOUNT }),
        "colony-reputation-mining-stake-too-recent"
      );

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });
      await forwardTime(MINING_CYCLE_DURATION, this);
      repCycle = await getActiveRepCycle(colonyNetwork);
      await repCycle.submitRootHash("0x12345678", 10, "0x00", 10, { from: OTHER_ACCOUNT });
    });

    it("should not allow someone to withdraw their stake if they have submitted a hash this round", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x12345678", 10, "0x00", 10, { from: MAIN_ACCOUNT });

      const userLock = await tokenLocking.getUserLock(clny.address, MAIN_ACCOUNT);
      await checkErrorRevert(tokenLocking.withdraw(clny.address, userLock.balance, { from: MAIN_ACCOUNT }), "colony-token-locking-hash-submitted");
    });

    it("should allow a new reputation hash to be set if only one was submitted", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this }); // Defaults to (0x00, 0)

      const newRepCycle = await getActiveRepCycle(colonyNetwork);
      assert.notEqual(newRepCycle.address, ZERO_ADDRESS);
      assert.notEqual(repCycle.address, ZERO_ADDRESS);
      assert.notEqual(newRepCycle.address, repCycle.address);

      const rootHash = await colonyNetwork.getReputationRootHash();
      assert.equal(rootHash, "0x0000000000000000000000000000000000000000000000000000000000000000");

      const rootHashNNodes = await colonyNetwork.getReputationRootHashNNodes();
      assert.equal(rootHashNNodes.toNumber(), 0);
    });

    it("should not allow someone who is not ColonyNetwork to appendReputationUpdateLog", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await checkErrorRevert(
        repCycle.appendReputationUpdateLog(MAIN_ACCOUNT, 100, 0, metaColony.address, 0, 1),
        "colony-reputation-mining-sender-not-network"
      );
    });

    it("should not allow someone who is not ColonyNetwork to reset the ReputationMiningCycle window", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await checkErrorRevert(repCycle.resetWindow(), "colony-reputation-mining-sender-not-network");
    });

    it("should correctly calculate the miner weight", async () => {
      const UINT32_MAX = UINT256_MAX.shrn(256 - 32);
      const T = 7776000;
      let weight;

      // Large weight (staked for UINT256_MAX, first submission)
      weight = await colonyNetwork.calculateMinerWeight(UINT256_MAX, 0);
      assert.equal("999999964585636861", weight.toString());

      // Large weight (staked for UINT32_MAX, first submission)
      weight = await colonyNetwork.calculateMinerWeight(UINT32_MAX, 0);
      assert.equal("999999964585636861", weight.toString());

      // Middle weight (staked for UINT32_MAX, last submission)
      weight = await colonyNetwork.calculateMinerWeight(UINT32_MAX, 11);
      assert.equal("541666647483886633", weight.toString());

      // Middle weight I (staked for T, first submission)
      weight = await colonyNetwork.calculateMinerWeight(T, 0);
      assert.equal("625000000000000000", weight.toString());

      // Middle weight II (staked for T, last submission)
      weight = await colonyNetwork.calculateMinerWeight(T, 11);
      assert.equal("338541666666666667", weight.toString());

      // Smallest weight (staked for 0, last submission)
      weight = await colonyNetwork.calculateMinerWeight(0, 11);
      assert.equal("0", weight.toString());
    });
  });

  describe("Elimination of submissions", () => {
    it("should allow a new reputation hash to be set if all but one submitted have been eliminated", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await repCycle.confirmNewHash(1);

      const newRepCycle = await getActiveRepCycle(colonyNetwork);
      assert.notEqual(newRepCycle.address, ZERO_ADDRESS);
      assert.notEqual(repCycle.address, ZERO_ADDRESS);
      assert.notEqual(newRepCycle.address, repCycle.address);

      const rootHash = await colonyNetwork.getReputationRootHash();
      const clientRootHash = await goodClient.getRootHash();
      assert.equal(rootHash, clientRootHash);

      const rootHashNNodes = await colonyNetwork.getReputationRootHashNNodes();
      assert.equal(rootHashNNodes.toString(), goodClient.nReputations.toString());
    });

    it("should allow a new reputation hash to be moved to the next stage of competition even if it does not have a partner", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT2, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient, badClient2], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, badClient2); // Invalidate the 'null' that partners the third hash submitted.
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient2, {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await repCycle.confirmNewHash(2);

      const newRepCycle = await getActiveRepCycle(colonyNetwork);
      assert.notEqual(newRepCycle.address, ZERO_ADDRESS);
      assert.notEqual(repCycle.address, ZERO_ADDRESS);
      assert.notEqual(newRepCycle.address, repCycle.address);

      const rootHash = await colonyNetwork.getReputationRootHash();
      const clientRootHash = await goodClient.getRootHash();
      assert.equal(rootHash, clientRootHash);

      const rootHashNNodes = await colonyNetwork.getReputationRootHashNNodes();
      assert.equal(rootHashNNodes.toString(), goodClient.nReputations.toString());
    });

    it("should not allow a new reputation hash to be set if more than one was submitted and they have not been elimintated", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await checkErrorRevert(repCycle.confirmNewHash(0), "colony-reputation-mining-final-round-not-completed");

      const newRepCycle = await getActiveRepCycle(colonyNetwork);
      assert.notEqual(newRepCycle.address, ZERO_ADDRESS);
      assert.notEqual(repCycle.address, ZERO_ADDRESS);
      assert.equal(newRepCycle.address, repCycle.address);

      // Eliminate one so that the afterAll works.
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
    });

    it("should not allow the last reputation hash to be eliminated", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });

      // TODO: this should just call invalidateHash, right?
      await checkErrorRevert(
        accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient),
        "colony-reputation-mining-cannot-invalidate-final-hash"
      );
    });

    it("should fail if one tries to invalidate a hash that does not exist", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT2, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient, badClient2], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, badClient2);

      await checkErrorRevert(repCycle.invalidateHash(1, 2), "colony-reputation-mining-dispute-id-not-in-range");

      // Cleanup after test
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient2, {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await repCycle.confirmNewHash(2);
    });

    it("should fail if one tries to invalidate a hash that has completed more challenge rounds than its opponent", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
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
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });

      await checkErrorRevert(repCycle.invalidateHash(0, 1), "colony-reputation-mining-proposed-hash-empty");
    });

    it("should not allow a hash to be invalidated and then moved on to the next stage by invalidating its now non-existent opponent", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });

      await checkErrorRevert(repCycle.invalidateHash(0, 0), "colony-reputation-mining-hash-already-progressed");
    });

    it("should invalidate a hash and its partner if both have timed out", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT2, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([badClient, badClient2, goodClient], this);
      await repCycle.invalidateHash(0, 1);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient);
      await repCycle.confirmNewHash(1);
    });

    it("should prevent invalidation of hashes before they have timed out on a challenge", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await goodClient.addLogContentsToReputationTree();
      await badClient.addLogContentsToReputationTree();

      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await goodClient.submitRootHash();
      await badClient.submitRootHash();

      await checkErrorRevert(repCycle.invalidateHash(0, 1), "colony-reputation-mining-not-timed-out");

      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      await checkErrorRevert(repCycle.confirmNewHash(1), "colony-reputation-mining-final-round-not-completed");

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await repCycle.confirmNewHash(1);
    });
  });

  describe("Submission eligibility", () => {
    it("should not allow someone to submit a new reputation hash if they are ineligible", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);

      await checkErrorRevert(
        repCycle.submitRootHash("0x12345678", 10, "0x00", 10, { from: MAIN_ACCOUNT }),
        "colony-reputation-mining-cycle-submission-not-within-target"
      );
    });

    it("should not allow someone to submit a new reputation hash to the next ReputationMiningCycle", async () => {
      // Inactive mining cycle
      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);

      await checkErrorRevert(
        repCycle.submitRootHash("0x12345678", 10, "0x00", 10, { from: MAIN_ACCOUNT }),
        "colony-reputation-mining-cycle-not-open"
      );
    });

    it("should allow someone to submit a new reputation hash if they are eligible inside the window", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      // Find an entry that will be eligible in the second half of the window
      const entryNumber = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x12345678");
      await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MAIN_ACCOUNT });
    });

    it("should not allow a user to back more than one hash in a single cycle", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      const entryNumber = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x12345678");
      await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MAIN_ACCOUNT });

      const entryNumber2 = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x87654321");
      await checkErrorRevert(
        repCycle.submitRootHash("0x87654321", 10, "0x00", entryNumber2, { from: MAIN_ACCOUNT }),
        "colony-reputation-mining-submitting-different-hash"
      );
    });

    it("should not allow a user to back the same hash with different number of nodes in a single cycle", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      const entryNumber = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x12345678");
      await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MAIN_ACCOUNT });

      await checkErrorRevert(
        repCycle.submitRootHash("0x12345678", 11, "0x00", entryNumber, { from: MAIN_ACCOUNT }),
        "colony-reputation-mining-submitting-different-nnodes"
      );
    });

    it("should not allow a user to back the same hash with same number of nodes but different JRH in a single cycle", async () => {
      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      const entryNumber = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x12345678");
      await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MAIN_ACCOUNT });

      await checkErrorRevert(
        repCycle.submitRootHash("0x12345678", 10, "0x01", entryNumber, { from: MAIN_ACCOUNT }),
        "colony-reputation-mining-submitting-different-jrh"
      );
      const nSubmittedHashes = await repCycle.getNSubmittedHashes();
      assert(nSubmittedHashes.eq(new BN(1)));
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
    });

    it("should not allow a user to submit the same entry for the same hash twice in a single cycle", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      const entryNumber = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x12345678");
      await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MAIN_ACCOUNT });

      await checkErrorRevert(
        repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MAIN_ACCOUNT }),
        "colony-reputation-mining-submitting-same-entry-index"
      );
    });

    it("should allow a user to back the same hash more than once in a same cycle with different entries, and be rewarded", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      const entryNumber = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x12345678");
      const entryNumber2 = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x12345678", entryNumber + 1);

      await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MAIN_ACCOUNT });
      await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber2, { from: MAIN_ACCOUNT });

      const nSubmittedHashes = await repCycle.getNSubmittedHashes();
      assert.isTrue(nSubmittedHashes.eq(new BN(1)));

      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await repCycle.confirmNewHash(0);

      // Check that they received the reward
      const balance1Updated = await clny.balanceOf(MAIN_ACCOUNT);
      assert.equal(balance1Updated.toString(), REWARD.toString(), "Account was not rewarded properly");

      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const inactiveRepCycle = await IReputationMiningCycle.at(addr);

      // Check that they will be getting the reputation owed to them.
      let repLogEntryMiner = await inactiveRepCycle.getReputationUpdateLogEntry(0);
      assert.strictEqual(repLogEntryMiner.user, MAIN_ACCOUNT);
      assert.strictEqual(repLogEntryMiner.amount, "0"); // Reward is 0 for now
      assert.strictEqual(repLogEntryMiner.skillId, "3");
      assert.strictEqual(repLogEntryMiner.colony, metaColony.address);
      assert.strictEqual(repLogEntryMiner.nUpdates, "4");
      assert.strictEqual(repLogEntryMiner.nPreviousUpdates, "0");

      repLogEntryMiner = await inactiveRepCycle.getReputationUpdateLogEntry(1);
      assert.strictEqual(repLogEntryMiner.user, MAIN_ACCOUNT);
      assert.strictEqual(repLogEntryMiner.amount, "0"); // Reward is 0 for now
      assert.strictEqual(repLogEntryMiner.skillId, "3");
      assert.strictEqual(repLogEntryMiner.colony, metaColony.address);
      assert.strictEqual(repLogEntryMiner.nUpdates, "4");
      assert.strictEqual(repLogEntryMiner.nPreviousUpdates, "4");

      const reputationUpdateLogLength = await inactiveRepCycle.getReputationUpdateLogLength();
      assert.equal(reputationUpdateLogLength.toString(), 2);
    });

    it("should only allow 12 entries to back a single hash in each cycle", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION - 600, this);

      let entryNumber = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x12345678", 1);
      for (let i = 1; i <= 12; i += 1) {
        await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MAIN_ACCOUNT }); // eslint-disable-line no-await-in-loop
        entryNumber = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x12345678", entryNumber + 1); // eslint-disable-line no-await-in-loop
      }

      await checkErrorRevert(
        repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MAIN_ACCOUNT }),
        "colony-reputation-mining-max-number-miners-reached"
      );
    });

    it("should prevent submission of hashes with an invalid entry for the balance of a user", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);

      await checkErrorRevert(
        repCycle.submitRootHash("0x12345678", 10, "0x00", 1000000000000, { from: MAIN_ACCOUNT }),
        "colony-reputation-mining-stake-minimum-not-met-for-index"
      );

      await repCycle.submitRootHash("0x87654321", 10, "0x00", 10, { from: MAIN_ACCOUNT });
    });

    it("should prevent submission of hashes with a valid entry, but invalid hash for the current time", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);

      await checkErrorRevert(
        repCycle.submitRootHash("0x12345678", 10, "0x00", 10, { from: MAIN_ACCOUNT }),
        "colony-reputation-mining-cycle-submission-not-within-target"
      );
    });
  });

  describe("Rewards and punishments of good and bad submissions", () => {
    it("should punish all stakers if they misbehave (and report a bad hash)", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT2, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      let userLock0 = await tokenLocking.getUserLock(clny.address, MAIN_ACCOUNT);
      assert.equal(userLock0.balance, DEFAULT_STAKE.toString());

      let userLock1 = await tokenLocking.getUserLock(clny.address, OTHER_ACCOUNT);
      assert.equal(userLock1.balance, DEFAULT_STAKE.toString());

      let userLock2 = await tokenLocking.getUserLock(clny.address, OTHER_ACCOUNT2);
      assert.equal(userLock2.balance, DEFAULT_STAKE.toString());

      // We want badClient2 to submit the same hash as badClient for this test.
      badClient2 = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT2, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        1,
        "0xfffffffff"
      );
      badClient2.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient, badClient2], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });

      userLock0 = await tokenLocking.getUserLock(clny.address, MAIN_ACCOUNT);
      assert.equal(userLock0.balance, DEFAULT_STAKE.add(MIN_STAKE.muln(2)).toString(), "Account was not rewarded properly");

      userLock1 = await tokenLocking.getUserLock(clny.address, OTHER_ACCOUNT);
      assert.equal(userLock1.balance, DEFAULT_STAKE.sub(MIN_STAKE).toString(), "Account was not punished properly");

      userLock2 = await tokenLocking.getUserLock(clny.address, OTHER_ACCOUNT2);
      assert.equal(userLock2.balance, DEFAULT_STAKE.sub(MIN_STAKE).toString(), "Account was not punished properly");
    });

    it("should reward all stakers if they submitted the agreed new hash", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });
      await clny.burn(REWARD, { from: MAIN_ACCOUNT });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      const entryNumber = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x12345678");
      const entryNumber2 = await getValidEntryNumber(colonyNetwork, OTHER_ACCOUNT, "0x12345678");

      await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MAIN_ACCOUNT });
      await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber2, { from: OTHER_ACCOUNT });

      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await repCycle.confirmNewHash(0);

      // Check that they have had their balance increase
      const balance1Updated = await clny.balanceOf(MAIN_ACCOUNT);
      const balance2Updated = await clny.balanceOf(OTHER_ACCOUNT);
      // More than half of the reward
      assert.strictEqual(balance1Updated.toString(), "0"); // Reward is 0 for now
      // Less than half of the reward
      assert.strictEqual(balance2Updated.toString(), "0"); // Reward is 0 for now
      // Sum is total reward within `stakers.length` wei of precision error
      assert.strictEqual(balance1Updated.add(balance2Updated).toString(), "0"); // Reward is 0 for now

      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const inactiveRepCycle = await IReputationMiningCycle.at(addr);

      // Check that they will be getting the reputation owed to them.
      let repLogEntryMiner = await inactiveRepCycle.getReputationUpdateLogEntry(0);
      assert.strictEqual(repLogEntryMiner.user, MAIN_ACCOUNT);
      assert.strictEqual(repLogEntryMiner.amount, balance1Updated.toString());
      assert.strictEqual(repLogEntryMiner.skillId, "3");
      assert.strictEqual(repLogEntryMiner.colony, metaColony.address);
      assert.strictEqual(repLogEntryMiner.nUpdates, "4");
      assert.strictEqual(repLogEntryMiner.nPreviousUpdates, "0");

      repLogEntryMiner = await inactiveRepCycle.getReputationUpdateLogEntry(1);
      assert.strictEqual(repLogEntryMiner.user, OTHER_ACCOUNT);
      assert.strictEqual(repLogEntryMiner.amount, balance2Updated.toString());
      assert.strictEqual(repLogEntryMiner.skillId, "3");
      assert.strictEqual(repLogEntryMiner.colony, metaColony.address);
      assert.strictEqual(repLogEntryMiner.nUpdates, "4");
      assert.strictEqual(repLogEntryMiner.nPreviousUpdates, "4");

      const reputationUpdateLogLength = await inactiveRepCycle.getReputationUpdateLogLength();
      assert.equal(reputationUpdateLogLength.toString(), 2);
    });
  });

  describe("Function permissions", () => {
    it('should not allow "setReputationRootHash" to be called from an account that is not a ReputationMiningCycle', async () => {
      await checkErrorRevert(
        colonyNetwork.setReputationRootHash("0x000001", 10, [accounts[0], accounts[1]], 0),
        "colony-reputation-mining-sender-not-active-reputation-cycle"
      );
    });

    it('should not allow "startNextCycle" to be called if a cycle is in progress', async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);

      assert.isTrue(parseInt(repCycle.address, 16) !== 0);

      await checkErrorRevert(colonyNetwork.startNextCycle(), "colony-reputation-mining-still-active");
    });

    it('should not allow "rewardStakersWithReputation" to be called by someone not the colonyNetwork', async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);

      await checkErrorRevert(
        repCycle.rewardStakersWithReputation([MAIN_ACCOUNT], [1], ZERO_ADDRESS, 10000, 3),
        "colony-reputation-mining-sender-not-network"
      );
    });

    it('should not allow "initialise" to be called on either the active or inactive ReputationMiningCycle', async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await checkErrorRevert(repCycle.initialise(MAIN_ACCOUNT, OTHER_ACCOUNT), "colony-reputation-mining-cycle-already-initialised");

      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const inactiveRepCycle = await IReputationMiningCycle.at(addr);

      await checkErrorRevert(inactiveRepCycle.initialise(MAIN_ACCOUNT, OTHER_ACCOUNT), "colony-reputation-mining-cycle-already-initialised");
    });
  });

  describe("Types of disagreement", () => {
    it("in the event of a disagreement, allows a user to confirm a submitted JRH with proofs for a submission", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clny);
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
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await repCycle.confirmNewHash(1);
    });

    it(`in the event of a disagreement just over nNodes, where the submitted nNodes is lied about,
      dispute should be resolved correctly`, async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 5 updates: 1 for the previous mining cycle and 1x4 for the task.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 5);

      badClient = new MaliciousReputationMinerWrongNNodes(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        8
      );

      await badClient.initialise(colonyNetwork.address);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { confirmJustificationRootHash: "colony-reputation-mining-invalid-jrh-proof-2" }
      });

      // Cleanup
      await repCycle.confirmNewHash(1);
    });

    it(`in the event of a disagreement just over nNodes, where the number of nodes has been incremented
      incorrectly when adding a new reputation, dispute should be resolved correctly`, async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      badClient = new MaliciousReputationMinerWrongNNodes2(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        3,
        1
      );
      await badClient.initialise(colonyNetwork.address);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);

      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x00", 0, "0x00", 10, { from: MAIN_ACCOUNT });
      await repCycle.confirmNewHash(0);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await goodClient.respondToChallenge();
      await checkErrorRevertEthers(badClient.respondToChallenge(), "colony-reputation-mining-nnodes-changed-by-not-1");

      // Cleanup
      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      repCycle = await getActiveRepCycle(colonyNetwork);
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it(`in the event of a disagreement just over nNodes, where the number of nodes has been incremented
      during an update of an existing reputation, dispute should be resolved correctly`, async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 5 updates: 1 for the previous mining cycle and 1x4 for the task.
      let repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 5);

      badClient = new MaliciousReputationMinerWrongNNodes2(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        8,
        1
      );

      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await goodClient.respondToChallenge();
      await checkErrorRevertEthers(badClient.respondToChallenge(), "colony-reputation-mining-nnodes-changed");

      // Cleanup
      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      repCycle = await getActiveRepCycle(colonyNetwork);

      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("in the event of a disagreement just over JRH, because a leaf in the JT is wrong, dispute should be resolved correctly", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 5 updates: 1 for the previous mining cycle and 1x4 for the tasks.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 5);

      badClient = new MaliciousReputationMinerWrongJRH(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        8
      );

      await badClient.initialise(colonyNetwork.address);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToBinarySearchForChallenge: [undefined, "colony-reputation-mining-invalid-binary-search-proof-length"] }
      });

      // Cleanup
      await repCycle.confirmNewHash(1);
    });

    it("in the event of a disagreement over JRH with an extra leaf causing proof 1 to be too long, dispute should resolve correctly", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 5 updates: 1 for the previous mining cycle and 1x4 for the tasks.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 5);

      badClient = new MaliciousReputationMinerWrongJRH(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        500000
      );

      await badClient.initialise(colonyNetwork.address);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await checkErrorRevertEthers(badClient.confirmJustificationRootHash(), "colony-reputation-mining-invalid-jrh-proof-1-length");

      // Cleanup
      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("in the event of a disagreement over JRH with an extra leaf causing proof 2 to be too long, dispute should resolve correctly", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(3));
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

      badClient = new MaliciousReputationMinerWrongJRH(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        30
      );

      await badClient.initialise(colonyNetwork.address);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { confirmJustificationRootHash: "colony-reputation-mining-invalid-jrh-proof-2-length" }
      });
    });

    it("should cope if the wrong reputation transition is the first transition", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      let repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);

      await goodClient.addLogContentsToReputationTree();
      await goodClient.submitRootHash();
      await repCycle.confirmNewHash(0);

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        0,
        "0xfffffffff"
      );
      await badClient.initialise(colonyNetwork.address);

      await goodClient.saveCurrentState();
      const savedHash = await goodClient.reputationTree.getRootHash();

      await badClient.loadState(savedHash);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const righthash = await goodClient.getRootHash();
      const wronghash = await badClient.getRootHash();
      assert.notEqual(righthash, wronghash, "Hashes from clients are equal, surprisingly");

      repCycle = await getActiveRepCycle(colonyNetwork);
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

        let repCycle = await getActiveRepCycle(colonyNetwork);
        await forwardTime(MINING_CYCLE_DURATION, this);
        await goodClient.addLogContentsToReputationTree();
        await goodClient.submitRootHash();
        await repCycle.confirmNewHash(0);

        badClient = new MaliciousReputationMinerExtraRep(
          { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
          badIndex,
          "0xfffffffff"
        );
        await badClient.initialise(colonyNetwork.address);

        await goodClient.saveCurrentState();
        const savedHash = await goodClient.reputationTree.getRootHash();
        await badClient.loadState(savedHash);

        await submitAndForwardTimeToDispute([goodClient, badClient], this);

        const righthash = await goodClient.getRootHash();
        const wronghash = await badClient.getRootHash();
        assert.notEqual(righthash, wronghash, "Hashes from clients are equal, surprisingly");

        repCycle = await getActiveRepCycle(colonyNetwork);

        let error;
        if (badIndex < 4) {
          error = "colony-reputation-mining-decay-incorrect";
        } else {
          error = "colony-reputation-mining-invalid-newest-reputation-proof";
        }
        await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
          client2: { respondToChallenge: error }
        });
        await repCycle.confirmNewHash(1);
      });
    });

    it("in the event of a disagreement, allows a binary search between opponents to take place to find their first disagreement", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the task.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 13);

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        12,
        "0xfffffffff"
      );
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
      await checkErrorRevertEthers(badClient.respondToChallenge(), "colony-reputation-mining-invalid-newest-reputation-proof");

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

    it("if an existing reputation's uniqueID is changed, that disagreement should be handled correctly", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the tasks.
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 13);

      badClient = new MaliciousReputationMinerWrongUID(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        12,
        "0xfffffffff"
      );
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
    });

    it.skip("if a new reputation's uniqueID is wrong, that disagreement should be handled correctly", async () => {
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

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the tasks.
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 13);

      badClient = new MaliciousReputationMinerReuseUID(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        3,
        1
      );
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

    it("If respondToChallenge is attempted to be called multiple times, it should fail", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the tasks.
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 13);

      badClient = new MaliciousReputationMinerClaimNew(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        20
      );
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

    it.skip("if a too high previous reputation larger than nnodes is provided, that disagreement should be handled correctly", async () => {
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

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the tasks.
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 13);

      badClient = new MaliciousReputationMinerUnsure(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        20,
        0xffff
      );
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

    it("if a new reputation's UID is not proved right because a too-old previous ID is proved, it should be handled correctly", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony, worker: accounts[3] });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        27,
        0xfffffffff
      );
      await badClient.initialise(colonyNetwork.address);

      // This client gets the same root hash as goodClient, but will submit the wrong newest reputation hash when
      // it calls respondToChallenge.
      badClient2 = new MaliciousReputationMinerWrongNewestReputation(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
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

    it(`if a reputation decay calculation is wrong, it should be handled correctly`, async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      let repCycle = await getActiveRepCycle(colonyNetwork);

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        1,
        "0xfffffffff"
      );
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      let righthash = await goodClient.getRootHash();
      let wronghash = await badClient.getRootHash();
      assert.notEqual(righthash, wronghash, "Hashes from clients are equal, surprisingly");

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await repCycle.confirmNewHash(1);

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        1,
        "0xfffffffff"
      );
      await badClient.initialise(colonyNetwork.address);

      const keys = Object.keys(goodClient.reputations);
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        const value = goodClient.reputations[key];
        const score = new BN(value.slice(2, 66), 16);
        await badClient.insert(key, score, 0); // eslint-disable-line no-await-in-loop
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
  });

  describe("Misbehaviour during dispute resolution", () => {
    it("should prevent a user from jumping ahead during dispute resolution", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x00", 0, "0x00", 10, { from: MAIN_ACCOUNT });
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

      // Check we can't respond to challenge before we've confirmed the binary search result
      await checkErrorRevertEthers(goodClient.respondToChallenge(), "colony-reputation-mining-binary-search-result-not-confirmed");

      // Cleanup
      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await goodClient.respondToChallenge();
      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("should prevent a user from confirming a JRH they can't prove is correct", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const nLogEntries = await repCycle.getReputationUpdateLogLength();
      const lastLogEntry = await repCycle.getReputationUpdateLogEntry(nLogEntries.subn(1));
      const totalnUpdates = new BN(lastLogEntry.nUpdates).add(new BN(lastLogEntry.nPreviousUpdates));

      const [branchMask1, siblings1] = await goodClient.justificationTree.getProof(`0x${new BN("0").toString(16, 64)}`);
      const [branchMask2, siblings2] = await goodClient.justificationTree.getProof(`0x${totalnUpdates.toString(16, 64)}`);
      const [round, index] = await goodClient.getMySubmissionRoundAndIndex();

      await checkErrorRevert(
        repCycle.confirmJustificationRootHash(round, index, "123456", siblings1, branchMask2, siblings2),
        "colony-reputation-mining-invalid-jrh-proof-1"
      );

      await checkErrorRevert(
        repCycle.confirmJustificationRootHash(round, index, branchMask1, siblings1, "123456", siblings2),
        "colony-reputation-mining-invalid-jrh-proof-2"
      );

      // Cleanup
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await checkErrorRevert(repCycle.confirmNewHash(0), "colony-reputation-mining-final-round-not-completed");
      await repCycle.confirmNewHash(1);
    });

    it("should correctly check the proof of the previously newest reputation, if necessary", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        27,
        0xfffffffff
      );
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      // Now get all the information needed to fire off a respondToChallenge call
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const [round, index] = await goodClient.getMySubmissionRoundAndIndex();
      const submission = await repCycle.getDisputeRounds(round, index);
      const firstDisagreeIdx = new BN(submission.lowerBound);
      const lastAgreeIdx = firstDisagreeIdx.subn(1);
      const reputationKey = await goodClient.getKeyForUpdateNumber(lastAgreeIdx.toString());
      const [agreeStateBranchMask, agreeStateSiblings] = await goodClient.justificationTree.getProof(`0x${lastAgreeIdx.toString(16, 64)}`);
      const [disagreeStateBranchMask, disagreeStateSiblings] = await goodClient.justificationTree.getProof(`0x${firstDisagreeIdx.toString(16, 64)}`);
      const logEntryNumber = await goodClient.getLogEntryNumberForLogUpdateNumber(lastAgreeIdx.toString());

      await checkErrorRevert(
        repCycle.respondToChallenge(
          [
            round,
            index,
            goodClient.justificationHashes[`0x${firstDisagreeIdx.toString(16, 64)}`].justUpdatedProof.branchMask,
            goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].nextUpdateProof.nNodes,
            agreeStateBranchMask,
            goodClient.justificationHashes[`0x${firstDisagreeIdx.toString(16, 64)}`].justUpdatedProof.nNodes,
            disagreeStateBranchMask,
            // This is the wrong line
            123456,
            // This is the correct line, for future reference
            // this.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].newestReputationProof.branchMask,
            0,
            logEntryNumber,
            0
          ],
          reputationKey,
          goodClient.justificationHashes[`0x${firstDisagreeIdx.toString(16, 64)}`].justUpdatedProof.siblings,
          goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].nextUpdateProof.value,
          agreeStateSiblings,
          goodClient.justificationHashes[`0x${firstDisagreeIdx.toString(16, 64)}`].justUpdatedProof.value,
          disagreeStateSiblings,
          goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].newestReputationProof.key,
          goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].newestReputationProof.value,
          goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].newestReputationProof.siblings
        ),
        "colony-reputation-mining-last-state-disagreement"
      );

      // Cleanup
      await forwardTime(MINING_CYCLE_DURATION, this);
      await goodClient.respondToChallenge();
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("should correctly check the UID of the reputation if the reputation update being disputed is a decay", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clny);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await badClient.initialise(colonyNetwork.address);
      await badClient.addLogContentsToReputationTree();

      await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      // Now get all the information needed to fire off a respondToChallenge call
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const [round, index] = await goodClient.getMySubmissionRoundAndIndex();
      const submission = await repCycle.getDisputeRounds(round, index);
      const firstDisagreeIdx = new BN(submission.lowerBound);
      const lastAgreeIdx = firstDisagreeIdx.subn(1);
      const reputationKey = await goodClient.getKeyForUpdateNumber(lastAgreeIdx.toString());
      const [agreeStateBranchMask, agreeStateSiblings] = await goodClient.justificationTree.getProof(`0x${lastAgreeIdx.toString(16, 64)}`);
      const [disagreeStateBranchMask, disagreeStateSiblings] = await goodClient.justificationTree.getProof(`0x${firstDisagreeIdx.toString(16, 64)}`);
      const logEntryNumber = await goodClient.getLogEntryNumberForLogUpdateNumber(lastAgreeIdx.toString());

      const jhash = goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`];
      const agreeStateReputationValueFake = new BN(jhash.nextUpdateProof.value.slice(2), 16).addn(1).toString(16, 128);

      await checkErrorRevert(
        repCycle.respondToChallenge(
          [
            round,
            index,
            goodClient.justificationHashes[`0x${firstDisagreeIdx.toString(16, 64)}`].justUpdatedProof.branchMask,
            goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].nextUpdateProof.nNodes,
            agreeStateBranchMask,
            goodClient.justificationHashes[`0x${firstDisagreeIdx.toString(16, 64)}`].justUpdatedProof.nNodes,
            disagreeStateBranchMask,
            goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].newestReputationProof.branchMask,
            0,
            logEntryNumber,
            0
          ],
          reputationKey,
          goodClient.justificationHashes[`0x${firstDisagreeIdx.toString(16, 64)}`].justUpdatedProof.siblings,
          `0x${agreeStateReputationValueFake}`,
          // This is the right line
          // goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].nextUpdateProof.value,
          agreeStateSiblings,
          goodClient.justificationHashes[`0x${firstDisagreeIdx.toString(16, 64)}`].justUpdatedProof.value,
          disagreeStateSiblings,
          goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].newestReputationProof.key,
          goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].newestReputationProof.value,
          goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].newestReputationProof.siblings
        ),
        "colony-reputation-mining-uid-not-decay"
      );

      // Cleanup
      await forwardTime(MINING_CYCLE_DURATION, this);
      await goodClient.respondToChallenge();
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("should correctly require the proof of the reputation under dispute before and after the change in question", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        24,
        0xfffffffff
      );
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      // Now get all the information needed to fire off a respondToChallenge call
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const [round, index] = await goodClient.getMySubmissionRoundAndIndex();
      const submission = await repCycle.getDisputeRounds(round, index);
      const firstDisagreeIdx = new BN(submission.lowerBound);
      const lastAgreeIdx = firstDisagreeIdx.subn(1);
      const reputationKey = await goodClient.getKeyForUpdateNumber(lastAgreeIdx.toString());
      const [agreeStateBranchMask, agreeStateSiblings] = await goodClient.justificationTree.getProof(`0x${lastAgreeIdx.toString(16, 64)}`);
      const [disagreeStateBranchMask, disagreeStateSiblings] = await goodClient.justificationTree.getProof(`0x${firstDisagreeIdx.toString(16, 64)}`);
      const logEntryNumber = await goodClient.getLogEntryNumberForLogUpdateNumber(lastAgreeIdx.toString());

      await checkErrorRevert(
        repCycle.respondToChallenge(
          [
            round,
            index,
            goodClient.justificationHashes[`0x${firstDisagreeIdx.toString(16, 64)}`].justUpdatedProof.branchMask,
            goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].nextUpdateProof.nNodes,
            // This is the right line
            // agreeStateBranchMask,
            // This is the wrong line
            123456,
            goodClient.justificationHashes[`0x${firstDisagreeIdx.toString(16, 64)}`].justUpdatedProof.nNodes,
            disagreeStateBranchMask,
            // This is the correct line, for future reference
            goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].newestReputationProof.branchMask,
            0,
            logEntryNumber,
            0
          ],
          reputationKey,
          goodClient.justificationHashes[`0x${firstDisagreeIdx.toString(16, 64)}`].justUpdatedProof.siblings,
          goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].nextUpdateProof.value,
          agreeStateSiblings,
          goodClient.justificationHashes[`0x${firstDisagreeIdx.toString(16, 64)}`].justUpdatedProof.value,
          disagreeStateSiblings,
          goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].newestReputationProof.key,
          goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].newestReputationProof.value,
          goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].newestReputationProof.siblings
        ),
        "colony-reputation-mining-invalid-before-reputation-proof"
      );

      await checkErrorRevert(
        repCycle.respondToChallenge(
          [
            round,
            index,
            goodClient.justificationHashes[`0x${firstDisagreeIdx.toString(16, 64)}`].justUpdatedProof.branchMask,
            goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].nextUpdateProof.nNodes,
            agreeStateBranchMask,
            goodClient.justificationHashes[`0x${firstDisagreeIdx.toString(16, 64)}`].justUpdatedProof.nNodes,
            // This is the wrong line
            123456,
            // This is the right line
            // disagreeStateBranchMask,
            // This is the correct line, for future reference
            goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].newestReputationProof.branchMask,
            0,
            logEntryNumber,
            0
          ],
          reputationKey,
          goodClient.justificationHashes[`0x${firstDisagreeIdx.toString(16, 64)}`].justUpdatedProof.siblings,
          goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].nextUpdateProof.value,
          agreeStateSiblings,
          goodClient.justificationHashes[`0x${firstDisagreeIdx.toString(16, 64)}`].justUpdatedProof.value,
          disagreeStateSiblings,
          goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].newestReputationProof.key,
          goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].newestReputationProof.value,
          goodClient.justificationHashes[`0x${lastAgreeIdx.toString(16, 64)}`].newestReputationProof.siblings
        ),
        "colony-reputation-mining-invalid-after-reputation-proof"
      );

      // Cleanup
      await forwardTime(MINING_CYCLE_DURATION, this);
      await goodClient.respondToChallenge();
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("should prevent a hash from advancing if it might still get an opponent", async function advancingTest() {
      this.timeout(10000000);

      assert.isTrue(accounts.length >= 11, "Not enough accounts for test to run");
      const accountsForTest = accounts.slice(3, 11);

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(8));
      for (let i = 0; i < 8; i += 1) {
        await giveUserCLNYTokensAndStake(colonyNetwork, accountsForTest[i], DEFAULT_STAKE); // eslint-disable-line no-await-in-loop
        await setupFinalizedTask({ colonyNetwork, colony: metaColony, worker: accountsForTest[i] }); // eslint-disable-line no-await-in-loop
        // These have to be done sequentially because this function uses the total number of tasks as a proxy for getting the
        // right taskId, so if they're all created at once it messes up.
      }

      // We need to complete the current reputation cycle so that all the required log entries are present
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const clients = await Promise.all(
        accountsForTest.map(async (addr, index) => {
          const client = new MaliciousReputationMinerExtraRep(
            { loader: contractLoader, minerAddress: addr, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
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
        await clients[i].addLogContentsToReputationTree(); // eslint-disable-line no-await-in-loop
        await clients[i].submitRootHash(); // eslint-disable-line no-await-in-loop
        await clients[i].confirmJustificationRootHash(); // eslint-disable-line no-await-in-loop
      }

      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[0], clients[1], {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[2], clients[3], {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[4], clients[5], {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });

      // This is the first pairing in round 2
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[0], clients[2], {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await checkErrorRevert(
        accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[4]),
        "colony-reputation-mining-previous-dispute-round-not-complete"
      );

      // Now clean up
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[6], clients[7], {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[4], clients[6], {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[0], clients[4], {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await repCycle.confirmNewHash(3);
    });

    it("should only allow the last hash standing to be confirmed", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await checkErrorRevert(repCycle.confirmNewHash(0), "colony-reputation-mining-final-round-not-completed");
      await repCycle.confirmNewHash(1);
    });

    it("incorrectly confirming a binary search result should fail", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        3,
        0xffffffffffff
      );
      await badClient.initialise(colonyNetwork.address);

      const repCycle = await getActiveRepCycle(colonyNetwork);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);

      const [round, index] = await goodClient.getMySubmissionRoundAndIndex();
      const submission = await repCycle.getDisputeRounds(round, index);
      const targetNode = submission.lowerBound;
      const targetNodeKey = ReputationMiner.getHexString(targetNode, 64);
      const [branchMask, siblings] = await goodClient.justificationTree.getProof(targetNodeKey);

      await checkErrorRevert(
        repCycle.confirmBinarySearchResult(round, index, "0x00", branchMask, siblings),
        "colony-reputation-mining-invalid-binary-search-confirmation"
      );

      // Cleanup
      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await goodClient.confirmBinarySearchResult();
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("should not allow stages to be skipped even if the number of updates is a power of 2", async () => {
      // Note that our jrhNNodes can never be a power of two, because we always have an even number of updates (because every reputation change
      // has a user-specific an a colony-specific effect, and we always have one extra state in the Justification Tree because we include the last
      // accepted hash as the first node. jrhNNodes is always odd, therefore, and can never be a power of two.
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        5,
        0xfffffffff
      );
      await badClient.initialise(colonyNetwork.address);

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING);
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        token: clny,
        manager: MAIN_ACCOUNT,
        worker: OTHER_ACCOUNT,
        workerRating: 1,
        managerPayout: 1,
        evaluatorPayout: 1,
        workerPayout: 1
      });

      await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });
      await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });

      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const inactiveRepCycle = await IReputationMiningCycle.at(addr);

      let powerTwoEntries = false;
      while (!powerTwoEntries) {
        await setupFinalizedTask( // eslint-disable-line
          {
            colonyNetwork,
            colony: metaColony,
            token: clny,
            manager: MAIN_ACCOUNT,
            worker: OTHER_ACCOUNT,
            workerRating: 1,
            managerPayout: 1,
            evaluatorPayout: 1,
            workerPayout: 1
          }
        );

        const nLogEntries = await inactiveRepCycle.getReputationUpdateLogLength(); // eslint-disable-line no-await-in-loop
        const lastLogEntry = await inactiveRepCycle.getReputationUpdateLogEntry(nLogEntries - 1); // eslint-disable-line no-await-in-loop
        const currentHashNNodes = await colonyNetwork.getReputationRootHashNNodes(); // eslint-disable-line no-await-in-loop
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

    it("should fail to respondToBinarySearchForChallenge if not consistent with JRH", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await checkErrorRevert(
        repCycle.respondToBinarySearchForChallenge(0, 0, "0x00", 0x07, ["0x00", "0x00", "0x00"]),
        "colony-reputation-mining-invalid-binary-search-response"
      );

      // Cleanup
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await repCycle.confirmNewHash(1);
    });

    it("should fail to respondToChallenge if any part of the key is wrong", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        3,
        0xffffffffffff
      );
      await badClient.initialise(colonyNetwork.address);

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      const logEntry = await repCycle.getReputationUpdateLogEntry(0);

      const colonyAddress = logEntry.colony.slice(2);
      const userAddress = logEntry.user.slice(2);
      const skillId = new BN(logEntry.skillId);

      // Linter fail
      const wrongColonyKey = `0x${new BN(0, 16).toString(16, 40)}${new BN(skillId.toString()).toString(16, 64)}${new BN(userAddress, 16).toString(
        16,
        40
      )}`;
      const wrongReputationKey = `0x${new BN(colonyAddress, 16).toString(16, 40)}${new BN(0).toString(16, 64)}${new BN(userAddress, 16).toString(
        16,
        40
      )}`;
      const wrongUserKey = `0x${new BN(colonyAddress, 16).toString(16, 40)}${new BN(skillId.toString()).toString(16, 64)}${new BN(0, 16).toString(
        16,
        40
      )}`;

      await checkErrorRevert(
        repCycle.respondToChallenge([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], wrongColonyKey, [], "0x00", [], "0x00", [], "0x00", "0x00", []),
        "colony-reputation-mining-colony-address-mismatch"
      );

      await checkErrorRevert(
        repCycle.respondToChallenge([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], wrongReputationKey, [], "0x00", [], "0x00", [], "0x00", "0x00", []),
        "colony-reputation-mining-skill-id-mismatch"
      );

      await checkErrorRevert(
        repCycle.respondToChallenge([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], wrongUserKey, [], "0x00", [], "0x00", [], "0x00", "0x00", []),
        "colony-reputation-mining-user-address-mismatch"
      );

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await goodClient.respondToChallenge();
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("should fail to respondToChallenge if binary search for challenge is not complete yet", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();

      await checkErrorRevert(
        repCycle.respondToChallenge([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "0x00", [], "0x00", [], "0x00", [], "0x00", "0x00", []),
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

    it("should refuse to confirmNewHash while the minimum submission window has not elapsed", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);

      await goodClient.addLogContentsToReputationTree();
      await badClient.addLogContentsToReputationTree();

      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await goodClient.submitRootHash();

      await checkErrorRevert(repCycle.confirmNewHash(0), "colony-reputation-mining-submission-window-still-open");

      // Cleanup
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await repCycle.confirmNewHash(0);
    });

    [{ word: "high", badClient1Argument: 1, badClient2Argument: 1 }, { word: "low", badClient1Argument: 9, badClient2Argument: -1 }].forEach(
      async args => {
        it(`should fail to respondToChallenge if supplied log entry does not correspond to the entry under disagreement and supplied log entry
          is too ${args.word}`, async () => {
          await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
          await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT2, DEFAULT_STAKE);

          await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(2));
          await setupFinalizedTask({ colonyNetwork, colony: metaColony });
          await setupFinalizedTask({ colonyNetwork, colony: metaColony });

          await advanceMiningCycleNoContest({ colonyNetwork, test: this });
          const repCycle = await getActiveRepCycle(colonyNetwork);

          badClient = new MaliciousReputationMinerExtraRep(
            { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
            args.badClient1Argument,
            10
          );

          badClient2 = new MaliciousReputationMinerWrongProofLogEntry(
            { loader: contractLoader, minerAddress: OTHER_ACCOUNT2, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
            args.badClient2Argument
          );

          await goodClient.initialise(colonyNetwork.address);
          await goodClient.addLogContentsToReputationTree();

          await badClient.initialise(colonyNetwork.address);
          await badClient2.initialise(colonyNetwork.address);

          await submitAndForwardTimeToDispute([badClient, badClient2], this);

          const wronghash = await badClient.getRootHash();
          const wronghash2 = await badClient2.getRootHash();
          assert.notEqual(wronghash, wronghash2, "Hashes from clients are equal, surprisingly");

          await badClient.confirmJustificationRootHash();
          await badClient2.confirmJustificationRootHash();

          await runBinarySearch(badClient, badClient2);

          await goodClient.confirmBinarySearchResult();
          await badClient.confirmBinarySearchResult();

          if (args.word === "high") {
            await checkErrorRevertEthers(
              badClient2.respondToChallenge(),
              "colony-reputation-mining-update-number-part-of-previous-log-entry-updates"
            );
          } else {
            await checkErrorRevertEthers(
              badClient2.respondToChallenge(),
              "colony-reputation-mining-update-number-part-of-following-log-entry-updates"
            );
          }

          // Cleanup
          await forwardTime(MINING_CYCLE_DURATION / 6, this);
          await goodClient.respondToChallenge();
          await repCycle.invalidateHash(0, 0);
          await repCycle.confirmNewHash(1);
        });
      }
    );
  });

  describe("Intended ('happy path') behaviours", () => {
    it("should cope with many hashes being submitted and eliminated before a winner is assigned", async function manySubmissionTest() {
      this.timeout(100000000);

      // TODO: This test probably needs to be written more carefully to make sure all possible edge cases are dealt with
      for (let i = 3; i < 11; i += 1) {
        await giveUserCLNYTokensAndStake(colonyNetwork, accounts[i], DEFAULT_STAKE); // eslint-disable-line no-await-in-loop
        // These have to be done sequentially because this function uses the total number of tasks as a proxy for getting the
        // right taskId, so if they're all created at once it messes up.
      }
      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(30));

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const clients = await Promise.all(
        accounts.slice(3, 11).map(async (addr, index) => {
          const entryToFalsify = 7 - index;
          const amountToFalsify = index; // NB The first client is 'bad', but told to get the calculation wrong by 0, so is actually good.
          const client = new MaliciousReputationMinerExtraRep(
            { loader: contractLoader, minerAddress: addr, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
            entryToFalsify,
            amountToFalsify
          );
          // Each client will get a different reputation update entry wrong by a different amount, apart from the first one which
          // will submit a correct hash.
          await client.initialise(colonyNetwork.address);
          return client;
        })
      );

      // We need to complete the current reputation cycle so that all the required log entries are present
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: clients[0] });

      await clients[0].saveCurrentState();
      const savedHash = await clients[0].reputationTree.getRootHash();
      await Promise.all(
        clients.map(async client => {
          client.loadState(savedHash);
        })
      );

      await submitAndForwardTimeToDispute(clients, this);

      // Round 1
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[0], clients[1], {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[2], clients[3], {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[4], clients[5], {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" }
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[6], clients[7], {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" }
      });

      // Round 2
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[0], clients[2], {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[4], clients[6], {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" }
      });

      // Round 3
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[0], clients[4], {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" }
      });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await repCycle.confirmNewHash(3);
    });

    it("should be able to process a large reputation update log", async () => {
      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(30));
      // TODO It would be so much better if we could do these in parallel, but until colonyNetwork#192 is fixed, we can't.
      for (let i = 0; i < 30; i += 1) {
        await setupFinalizedTask({ colonyNetwork, colony: metaColony }); // eslint-disable-line no-await-in-loop
      }

      // Complete two reputation cycles to process the log
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });
    });

    it("should allow submitted hashes to go through multiple responses to a challenge", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await goodClient.respondToChallenge();
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("should cope if someone's existing reputation would go negative, setting it to zero instead", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      // Create reputation
      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony, worker: MAIN_ACCOUNT });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony, worker: OTHER_ACCOUNT });

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        31,
        0xffffffffffff
      );
      await badClient.initialise(colonyNetwork.address);

      // Send rep to 0
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000000,
        workerPayout: 1000000000000,
        managerRating: 1,
        workerRating: 1
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-reputation-value-non-zero" }
      });
      await repCycle.confirmNewHash(1);
    });

    it("should cope if someone's new reputation would be negative, setting it to zero instead", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony, worker: MAIN_ACCOUNT });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony, worker: OTHER_ACCOUNT });

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        31,
        0xffffffffffff
      );
      await badClient.initialise(colonyNetwork.address);

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        worker: accounts[4],
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000000,
        workerPayout: 1000000000000,
        managerRating: 1,
        workerRating: 1
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-reputation-value-non-zero" }
      });
      await repCycle.confirmNewHash(1);
    });

    it("should cope if someone's reputation would be overflow, setting it to the maximum value instead", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(2));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony, worker: MAIN_ACCOUNT });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony, worker: OTHER_ACCOUNT });

      const bigPayout = new BN("10").pow(new BN("75"));

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        29,
        bigPayout.muln(2).neg()
      );
      await badClient.initialise(colonyNetwork.address);

      let repCycle = await getActiveRepCycle(colonyNetwork);
      const rootGlobalSkill = await colonyNetwork.getRootGlobalSkillId();
      const globalKey = await ReputationMiner.getKey(metaColony.address, rootGlobalSkill, ZERO_ADDRESS);
      const userKey = await ReputationMiner.getKey(metaColony.address, rootGlobalSkill, MAIN_ACCOUNT);

      await goodClient.insert(globalKey, UINT256_MAX.subn(1), 0);
      await goodClient.insert(userKey, UINT256_MAX.subn(1), 0);
      await badClient.insert(globalKey, UINT256_MAX.subn(1), 0);
      await badClient.insert(userKey, UINT256_MAX.subn(1), 0);

      const rootHash = await goodClient.getRootHash();
      await fundColonyWithTokens(metaColony, clny, bigPayout.muln(4));
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        worker: MAIN_ACCOUNT,
        managerPayout: bigPayout,
        evaluatorPayout: bigPayout,
        workerPayout: bigPayout,
        managerRating: 3,
        workerRating: 3
      });

      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash(rootHash, 2, "0x00", 10, { from: MAIN_ACCOUNT });
      await repCycle.confirmNewHash(0);

      repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-reputation-not-max-uint" }
      });
      await repCycle.confirmNewHash(1);
    });

    it("should calculate reputation decays differently if they are large", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        1,
        new BN("10")
      );
      await badClient.initialise(colonyNetwork.address);

      let repCycle = await getActiveRepCycle(colonyNetwork);
      const rootGlobalSkill = await colonyNetwork.getRootGlobalSkillId();
      const globalKey = await ReputationMiner.getKey(metaColony.address, rootGlobalSkill, ZERO_ADDRESS);
      const userKey = await ReputationMiner.getKey(metaColony.address, rootGlobalSkill, MAIN_ACCOUNT);

      await goodClient.insert(globalKey, UINT256_MAX.subn(1), 0);
      await goodClient.insert(userKey, UINT256_MAX.subn(1), 0);
      await badClient.insert(globalKey, UINT256_MAX.subn(1), 0);
      await badClient.insert(userKey, UINT256_MAX.subn(1), 0);

      const rootHash = await goodClient.getRootHash();

      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash(rootHash, 2, "0x00", 10, { from: MAIN_ACCOUNT });
      await repCycle.confirmNewHash(0);

      repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" }
      });
      await repCycle.confirmNewHash(1);

      const largeCalculationResult = UINT256_MAX.subn(1)
        .div(DECAY_RATE.DENOMINATOR)
        .mul(DECAY_RATE.NUMERATOR);

      const smallCalculationResult = UINT256_MAX.subn(1)
        .mul(DECAY_RATE.NUMERATOR)
        .div(DECAY_RATE.DENOMINATOR);

      const decayKey = await ReputationMiner.getKey(metaColony.address, rootGlobalSkill, MAIN_ACCOUNT);
      assert.notEqual(smallCalculationResult.toString(16, 64), goodClient.reputations[decayKey].slice(2, 66));
      assert.equal(largeCalculationResult.toString(16, 64), goodClient.reputations[decayKey].slice(2, 66));
    });

    it("should keep reputation updates that occur during one update window for the next window", async () => {
      // Creates an entry in the reputation log for the worker and manager
      await fundColonyWithTokens(metaColony, clny);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      let addr = await colonyNetwork.getReputationMiningCycle(false);
      let inactiveReputationMiningCycle = await IReputationMiningCycle.at(addr);
      const initialRepLogLength = await inactiveReputationMiningCycle.getReputationUpdateLogLength();

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // This confirmation should freeze the reputation log that we added the above task entries to and move it to the inactive rep log
      const repCycle = await getActiveRepCycle(colonyNetwork);
      assert.equal(inactiveReputationMiningCycle.address, repCycle.address);

      const finalRepLogLength = await repCycle.getReputationUpdateLogLength();
      assert.equal(finalRepLogLength.toNumber(), initialRepLogLength.toNumber());

      // Check the active log now has one entry in it (which will be the rewards for the miner who submitted
      // the accepted hash.
      addr = await colonyNetwork.getReputationMiningCycle(false);
      inactiveReputationMiningCycle = await IReputationMiningCycle.at(addr);

      const activeRepLogLength = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      assert.equal(activeRepLogLength.toNumber(), 1);
    });

    it("The reputation mining client should insert reputation updates from the log", async () => {
      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the tasks.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 13);

      await goodClient.addLogContentsToReputationTree();
      // Check the client's tree has seven entries. In order these were added (and therefore in order of reputation UID),
      // these are:
      // 1. Colony-wide total reputation for metaColony's root skill
      // 2. Colony-wide total reputation for mining skill
      // 3. Miner's reputation for metaColony's root skill
      // 4. Miner's reputation for mining skill
      // x. Colony-wide total reputation for metacolony's root skill (same as 1)
      // 5. Manager reputation for metaColony's root skill
      // x. Colony-wide total reputation for metacolony's root skill (same as 1)
      // x. Evaluator reputation for metaColony's root skill (same as 5, by virtue of evaluator and manager being MANAGER)
      // x. Colony-wide total reputation for metacolony's root skill (same as 1)
      // 6. Worker reputation for metacolony's root skill
      // 7. Colony-wide total reputation for global skill task was in
      // 8. Worker reputation for global skill task was in

      const GLOBAL_SKILL = new BN(1);
      const META_ROOT_SKILL = new BN(2);
      const MINING_SKILL = new BN(3);

      assert.equal(Object.keys(goodClient.reputations).length, 8);
      let key;
      let value;

      // These should be:
      // 1. Colony-wide total reputation for metacolony's root skill
      key = makeReputationKey(metaColony.address, META_ROOT_SKILL);
      value = makeReputationValue(REWARD.add(MANAGER_PAYOUT.add(EVALUATOR_PAYOUT).add(WORKER_PAYOUT).muln(3)), 1); // eslint-disable-line prettier/prettier
      assert.equal(goodClient.reputations[key], value);

      // 2. Colony-wide total reputation for mining skill
      key = makeReputationKey(metaColony.address, MINING_SKILL);
      value = makeReputationValue(REWARD, 2);
      assert.equal(goodClient.reputations[key], value);

      // 3. Reputation reward for MAIN_ACCOUNT for metacolony's root skill
      key = makeReputationKey(metaColony.address, META_ROOT_SKILL, MAIN_ACCOUNT);
      value = makeReputationValue(REWARD, 3);
      assert.equal(goodClient.reputations[key], value);

      // 4. Reputation reward for MAIN_ACCOUNT for mining skill
      key = makeReputationKey(metaColony.address, MINING_SKILL, MAIN_ACCOUNT);
      value = makeReputationValue(REWARD, 4);
      assert.equal(goodClient.reputations[key], value);

      // 5. Reputation reward for MANAGER for being the manager & evaluator for the tasks
      key = makeReputationKey(metaColony.address, META_ROOT_SKILL, MANAGER);
      value = makeReputationValue(MANAGER_PAYOUT.add(EVALUATOR_PAYOUT).muln(3), 5);
      assert.equal(goodClient.reputations[key], value);

      // 6. Reputation reward for WORKER for being the worker for the tasks
      key = makeReputationKey(metaColony.address, META_ROOT_SKILL, WORKER);
      value = makeReputationValue(WORKER_PAYOUT.muln(3), 6);
      assert.equal(goodClient.reputations[key], value);

      // 7. Colony-wide total reputation for global skill task was in
      key = makeReputationKey(metaColony.address, GLOBAL_SKILL);
      value = makeReputationValue(WORKER_PAYOUT.muln(3), 7);
      assert.equal(goodClient.reputations[key], value);

      // 8. Worker reputation for global skill task was in
      key = makeReputationKey(metaColony.address, GLOBAL_SKILL, WORKER);
      value = makeReputationValue(WORKER_PAYOUT.muln(3), 8);
      assert.equal(goodClient.reputations[key], value);
    });

    it("The reputation mining client should correctly update parent reputations", async () => {
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(4);
      await metaColony.addGlobalSkill(5);
      await metaColony.addGlobalSkill(6);
      await metaColony.addGlobalSkill(7);
      await metaColony.addGlobalSkill(8);
      await metaColony.addGlobalSkill(9);

      // 1 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10

      await fundColonyWithTokens(metaColony, clny);

      // Do the task
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 10,
        manager: MANAGER,
        evaluator: EVALUATOR,
        worker: WORKER
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 5 updates: 1 for the previous mining cycle and 4 for the task.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 5);

      await goodClient.addLogContentsToReputationTree();

      const META_ROOT_SKILL = 2;
      const MINING_SKILL = 3;

      const reputationProps = [
        { id: 1, skillId: META_ROOT_SKILL, account: undefined, value: REWARD.add(MANAGER_PAYOUT).add(EVALUATOR_PAYOUT).add(WORKER_PAYOUT) }, // eslint-disable-line prettier/prettier
        { id: 2, skillId: MINING_SKILL, account: undefined, value: REWARD },
        { id: 3, skillId: META_ROOT_SKILL, account: MAIN_ACCOUNT, value: REWARD },
        { id: 4, skillId: MINING_SKILL, account: MAIN_ACCOUNT, value: REWARD },

        { id: 5, skillId: META_ROOT_SKILL, account: MANAGER, value: MANAGER_PAYOUT },
        { id: 6, skillId: META_ROOT_SKILL, account: EVALUATOR, value: EVALUATOR_PAYOUT },
        { id: 7, skillId: META_ROOT_SKILL, account: WORKER, value: WORKER_PAYOUT },

        { id: 8, skillId: 9, account: undefined, value: WORKER_PAYOUT },
        { id: 9, skillId: 8, account: undefined, value: WORKER_PAYOUT },
        { id: 10, skillId: 7, account: undefined, value: WORKER_PAYOUT },
        { id: 11, skillId: 6, account: undefined, value: WORKER_PAYOUT },
        { id: 12, skillId: 5, account: undefined, value: WORKER_PAYOUT },
        { id: 13, skillId: 4, account: undefined, value: WORKER_PAYOUT },
        { id: 14, skillId: 1, account: undefined, value: WORKER_PAYOUT },
        { id: 15, skillId: 10, account: undefined, value: WORKER_PAYOUT },

        { id: 16, skillId: 9, account: WORKER, value: WORKER_PAYOUT },
        { id: 17, skillId: 8, account: WORKER, value: WORKER_PAYOUT },
        { id: 18, skillId: 7, account: WORKER, value: WORKER_PAYOUT },
        { id: 19, skillId: 6, account: WORKER, value: WORKER_PAYOUT },
        { id: 20, skillId: 5, account: WORKER, value: WORKER_PAYOUT },
        { id: 21, skillId: 4, account: WORKER, value: WORKER_PAYOUT },
        { id: 22, skillId: 1, account: WORKER, value: WORKER_PAYOUT },
        { id: 23, skillId: 10, account: WORKER, value: WORKER_PAYOUT }
      ];

      assert.equal(Object.keys(goodClient.reputations).length, reputationProps.length);

      reputationProps.forEach(reputationProp => {
        const key = makeReputationKey(metaColony.address, new BN(reputationProp.skillId), reputationProp.account);
        const value = makeReputationValue(reputationProp.value, reputationProp.id);
        assert.equal(goodClient.reputations[key], value, `Value incorrect for id ${reputationProp.id}`);
      });
    });

    it("Should cope if the wrong reputation transition is a distant parent", async () => {
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(4);
      await metaColony.addGlobalSkill(5);
      await metaColony.addGlobalSkill(6);
      await metaColony.addGlobalSkill(7);
      await metaColony.addGlobalSkill(8);
      await metaColony.addGlobalSkill(9);

      // 1 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10

      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony, skillId: 10 });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the tasks.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 13);

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        40, // Skill 4
        "0xfffffffff"
      );
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const righthash = await goodClient.getRootHash();
      const wronghash = await badClient.getRootHash();
      assert.notEqual(righthash, wronghash, "Hashes from clients are equal, surprisingly");

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-invalid-newest-reputation-proof" }
      });
      await repCycle.confirmNewHash(1);
    });

    it("Should allow a user to prove their reputation", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await goodClient.addLogContentsToReputationTree();
      const newRootHash = await goodClient.getRootHash();

      await forwardTime(MINING_CYCLE_DURATION, this);
      const repCycle = await getActiveRepCycle(colonyNetwork);

      await repCycle.submitRootHash(newRootHash, 10, "0x00", 10, { from: MAIN_ACCOUNT });
      await repCycle.confirmNewHash(0);

      const key = makeReputationKey(metaColony.address, new BN("2"), MAIN_ACCOUNT);
      const value = goodClient.reputations[key];
      const [branchMask, siblings] = await goodClient.getProof(key);
      const isValid = await metaColony.verifyReputationProof(key, value, branchMask, siblings, { from: MAIN_ACCOUNT });
      assert.isTrue(isValid);
    });

    it("Should correctly decay a reputation to zero, and then 'decay' to zero in subsequent cycles", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        1,
        new BN("10")
      );
      await badClient.initialise(colonyNetwork.address);

      const rootGlobalSkill = await colonyNetwork.getRootGlobalSkillId();
      const globalKey = await ReputationMiner.getKey(metaColony.address, rootGlobalSkill, ZERO_ADDRESS);
      const userKey = await ReputationMiner.getKey(metaColony.address, rootGlobalSkill, MAIN_ACCOUNT);

      await goodClient.insert(globalKey, new BN("1"), 0);
      await goodClient.insert(userKey, new BN("1"), 0);
      await badClient.insert(globalKey, new BN("1"), 0);
      await badClient.insert(userKey, new BN("1"), 0);

      const rootHash = await goodClient.getRootHash();

      await forwardTime(MINING_CYCLE_DURATION, this);
      let repCycle = await getActiveRepCycle(colonyNetwork);
      await repCycle.submitRootHash(rootHash, 2, "0x00", 10, { from: MAIN_ACCOUNT });
      await repCycle.confirmNewHash(0);

      const decayKey = await ReputationMiner.getKey(metaColony.address, rootGlobalSkill, MAIN_ACCOUNT);

      // Check we have exactly one reputation.
      assert.equal(
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        goodClient.reputations[decayKey]
      );

      repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" }
      });
      await repCycle.confirmNewHash(1);

      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      // Check it decayed from 1 to 0.
      assert.equal(
        "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002",
        goodClient.reputations[decayKey]
      );

      // If we use the existing badClient we get `Error: invalid BigNumber value`, not sure why.
      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        1,
        new BN("10")
      );
      await badClient.initialise(colonyNetwork.address);

      const keys = Object.keys(goodClient.reputations);
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        const value = goodClient.reputations[key];
        const score = new BN(value.slice(2, 66), 16);
        await badClient.insert(key, score, 0); // eslint-disable-line no-await-in-loop
      }

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" }
      });

      repCycle = await getActiveRepCycle(colonyNetwork);
      await repCycle.confirmNewHash(1);

      // Check it 'decayed' from 0 to 0
      assert.equal(
        "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002",
        goodClient.reputations[decayKey]
      );
    });

    it.skip("should abort if a deposit did not complete correctly");
  });

  describe("Miner syncing functionality", () => {
    let startingBlockNumber;
    let goodClient2;

    beforeEach(async () => {
      const startingBlock = await currentBlock();
      startingBlockNumber = startingBlock.number;

      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      // Make multiple reputation cycles, with different numbers tasks and blocks in them.
      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(5));
      for (let i = 0; i < 5; i += 1) {
        await setupFinalizedTask({ colonyNetwork, colony: metaColony }); // eslint-disable-line no-await-in-loop
      }

      await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });

      // Advance four blocks
      await forwardTime(1, this);
      await forwardTime(1, this);
      await forwardTime(1, this);
      await forwardTime(1, this);

      await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(5));
      for (let i = 0; i < 5; i += 1) {
        await setupFinalizedTask({ colonyNetwork, colony: metaColony }); // eslint-disable-line no-await-in-loop
      }

      await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });
      await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });
      await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });

      goodClient2 = new ReputationMiner({
        loader: contractLoader,
        minerAddress: OTHER_ACCOUNT,
        realProviderPort: REAL_PROVIDER_PORT,
        useJsTree
      });
      await goodClient2.initialise(colonyNetwork.address);
    });

    // Because these tests rely on a custom, teeny-tiny-hacked version of ganache-cli, they don't work with solidity-coverage.
    // But that's okay, because these tests don't test anything meaningful in the contracts.
    process.env.SOLIDITY_COVERAGE
      ? it.skip
      : it("The client should be able to correctly sync to the current state from scratch just from on-chain interactions", async () => {
          // Now sync goodClient2
          await goodClient2.sync(startingBlockNumber);

          // Require goodClient2 and goodClient have the same hashes.
          const client1Hash = await goodClient.reputationTree.getRootHash();
          const client2Hash = await goodClient2.reputationTree.getRootHash();
          assert.equal(client1Hash, client2Hash);
        });

    process.env.SOLIDITY_COVERAGE
      ? it.skip
      : it("The client should be able to correctly sync to the current state from an old, correct state", async () => {
          // Bring client up to date
          await goodClient2.sync(startingBlockNumber);

          // Do some additional updates.
          await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });

          fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(5));
          for (let i = 0; i < 5; i += 1) {
            await setupFinalizedTask({ colonyNetwork, colony: metaColony }); // eslint-disable-line no-await-in-loop
          }

          await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });

          // Advance four blocks
          await forwardTime(1, this);
          await forwardTime(1, this);
          await forwardTime(1, this);
          await forwardTime(1, this);

          await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });

          // Update it again - note that we're passing in the old startingBlockNumber still. If it applied
          // all of the updates from that block number, it would fail, because it would be replaying some
          // updates that it already knew about.
          await goodClient2.sync(startingBlockNumber);

          const client1Hash = await goodClient.reputationTree.getRootHash();
          const client2Hash = await goodClient2.reputationTree.getRootHash();
          assert.equal(client1Hash, client2Hash);
        });

    process.env.SOLIDITY_COVERAGE
      ? it.skip
      : it("The client should be able to correctly sync to the current state from an old, correct state loaded from the database", async () => {
          // Save to the database
          await goodClient.saveCurrentState();
          const savedHash = await goodClient.reputationTree.getRootHash();

          // Do some additional updates.
          await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });
          await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });
          await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });
          await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });

          // Tell goodClient2 to load from the database
          await goodClient2.loadState(savedHash);

          // Update it again - note that we're passing in the old startingBlockNumber still. If it applied
          // all of the updates from that block number, it would fail, because it would be replaying some
          // updates that it already knew about.
          await goodClient2.sync(startingBlockNumber);

          const client1Hash = await goodClient.reputationTree.getRootHash();
          const client2Hash = await goodClient2.reputationTree.getRootHash();
          assert.equal(client1Hash, client2Hash);
        });

    it("should be able to successfully save the current state to the database and then load it", async () => {
      await goodClient.saveCurrentState();

      const client1Hash = await goodClient.reputationTree.getRootHash();
      await goodClient2.loadState(client1Hash);

      const client2Hash = await goodClient2.reputationTree.getRootHash();
      assert.equal(client1Hash, client2Hash);
    });

    it("should be able to correctly get the proof for a reputation in a historical state without affecting the current miner state", async () => {
      await goodClient.saveCurrentState();

      const clientHash1 = await goodClient.reputationTree.getRootHash();
      const key = Object.keys(goodClient.reputations)[0];
      const value = goodClient.reputations[key];
      const [branchMask, siblings] = await goodClient.getProof(key);

      await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });

      // So now we have a different state
      await goodClient.saveCurrentState();
      const clientHash2 = await goodClient.reputationTree.getRootHash();
      assert.notEqual(clientHash1, clientHash2);

      const [retrievedBranchMask, retrievedSiblings, retrievedValue] = await goodClient.getHistoricalProofAndValue(clientHash1, key);

      // Check they're right
      assert.equal(value, retrievedValue);
      assert.equal(branchMask, retrievedBranchMask);
      assert.equal(siblings.length, retrievedSiblings.length);

      for (let i = 0; i < retrievedSiblings.length; i += 1) {
        assert.equal(siblings[i], retrievedSiblings[i]);
        assert.equal(siblings[i], retrievedSiblings[i]);
      }

      const clientHash3 = await goodClient.reputationTree.getRootHash();
      assert.equal(clientHash2, clientHash3);
    });
  });

  describe("Reputation Mining Client", () => {
    let client;

    beforeEach(async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });
      await goodClient.saveCurrentState();

      client = new ReputationMinerClient({
        loader: contractLoader,
        realProviderPort: REAL_PROVIDER_PORT,
        minerAddress: MAIN_ACCOUNT,
        useJsTree: true,
        auto: false
      });
      await client.initialise(colonyNetwork.address);
    });

    afterEach(async () => {
      client.close();
    });

    it("should correctly respond to a request for a reputation state in the current state", async () => {
      const rootHash = await goodClient.getRootHash();
      const url = `http://127.0.0.1:3000/${rootHash}/${metaColony.address}/2/${MAIN_ACCOUNT}`;
      const res = await request(url);
      assert.equal(res.statusCode, 200);

      const oracleProofObject = JSON.parse(res.body);
      const key = makeReputationKey(metaColony.address, new BN(2), MAIN_ACCOUNT);

      const [branchMask, siblings] = await goodClient.getProof(key);
      const value = goodClient.reputations[key];

      assert.equal(branchMask, oracleProofObject.branchMask);
      assert.equal(siblings.length, oracleProofObject.siblings.length);

      for (let i = 0; i < oracleProofObject.siblings.length; i += 1) {
        assert.equal(siblings[i], oracleProofObject.siblings[i]);
        assert.equal(siblings[i], oracleProofObject.siblings[i]);
      }

      assert.equal(key, oracleProofObject.key);
      assert.equal(value, oracleProofObject.value);
    });

    it("should correctly respond to a request for a reputation state in a previous state", async () => {
      const rootHash = await goodClient.getRootHash();
      const key = makeReputationKey(metaColony.address, new BN(2), MAIN_ACCOUNT);
      const [branchMask, siblings] = await goodClient.getProof(key);
      const value = goodClient.reputations[key];

      await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });

      const url = `http://127.0.0.1:3000/${rootHash}/${metaColony.address}/2/${MAIN_ACCOUNT}`;
      const res = await request(url);
      assert.equal(res.statusCode, 200);

      const oracleProofObject = JSON.parse(res.body);
      assert.equal(branchMask, oracleProofObject.branchMask);
      assert.equal(siblings.length, oracleProofObject.siblings.length);

      for (let i = 0; i < oracleProofObject.siblings.length; i += 1) {
        assert.equal(siblings[i], oracleProofObject.siblings[i]);
        assert.equal(siblings[i], oracleProofObject.siblings[i]);
      }

      assert.equal(key, oracleProofObject.key);
      assert.equal(value, oracleProofObject.value);
    });

    process.env.SOLIDITY_COVERAGE
      ? it.skip
      : it("should correctly respond to a request for an invalid key in a valid past reputation state", async () => {
          const rootHash = await goodClient.getRootHash();
          const startingBlock = await currentBlock();
          const startingBlockNumber = startingBlock.number;

          await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });
          await client._miner.sync(startingBlockNumber); // eslint-disable-line no-underscore-dangle

          const url = `http://127.0.0.1:3000/${rootHash}/${metaColony.address}/2/${accounts[4]}`;
          const res = await request(url);
          assert.equal(res.statusCode, 400);
          assert.equal(JSON.parse(res.body).message, "Requested reputation does not exist or invalid request");
        });

    it("should correctly respond to a request for a valid key in an invalid reputation state", async () => {
      const rootHash = await goodClient.getRootHash();
      const url = `http://127.0.0.1:3000/${rootHash.slice(4)}0000/${metaColony.address}/2/${MAIN_ACCOUNT}`;
      const res = await request(url);
      assert.equal(res.statusCode, 400);
      assert.equal(JSON.parse(res.body).message, "Requested reputation does not exist or invalid request");
    });
  });
});
