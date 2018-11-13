/* globals artifacts */

import path from "path";
import BN from "bn.js";
import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";
import request from "async-request";

import {
  forwardTime,
  checkErrorRevert,
  checkErrorRevertEthers,
  web3GetTransactionReceipt,
  makeReputationKey,
  makeReputationValue,
  currentBlock,
  getValidEntryNumber,
  submitAndForwardTimeToDispute
} from "../helpers/test-helper";
import { giveUserCLNYTokens, giveUserCLNYTokensAndStake, setupRatedTask, fundColonyWithTokens } from "../helpers/test-data-generator";
import { WAD, MIN_STAKE, DEFAULT_STAKE, MINING_CYCLE_DURATION, DECAY_RATE } from "../helpers/constants";

import ReputationMiner from "../packages/reputation-miner/ReputationMiner";
import MaliciousReputationMinerExtraRep from "../packages/reputation-miner/test/MaliciousReputationMinerExtraRep";
import MaliciousReputationMinerWrongUID from "../packages/reputation-miner/test/MaliciousReputationMinerWrongUID";
import MaliciousReputationMinerReuseUID from "../packages/reputation-miner/test/MaliciousReputationMinerReuseUID";
import MaliciousReputationMinerWrongProofLogEntry from "../packages/reputation-miner/test/MaliciousReputationMinerWrongProofLogEntry";
import MaliciousReputationMinerWrongNewestReputation from "../packages/reputation-miner/test/MaliciousReputationMinerWrongNewestReputation";
import MaliciousReputationMinerClaimNew from "../packages/reputation-miner/test/MaliciousReputationMinerClaimNew";
import MaliciousReputationMinerUnsure from "../packages/reputation-miner/test/MaliciousReputationMinerUnsure";

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

const REWARD = WAD.muln(1200); // 1200 CLNY

contract("ColonyNetworkMining", accounts => {
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];

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
      { loader: contractLoader, minerAddress: accounts[2], realProviderPort: REAL_PROVIDER_PORT, useJsTree },
      1,
      0xeeeeeeeee
    );
    await goodClient.initialise(colonyNetwork.address);
    await badClient.initialise(colonyNetwork.address);
    await badClient2.initialise(colonyNetwork.address);
    // Kick off reputation mining.
    // TODO: Tests for the first reputation cycle (when log empty) should be done in another file
    await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);

    // Advance one reputation cycle
    let addr = await colonyNetwork.getReputationMiningCycle(true);
    let repCycle = await IReputationMiningCycle.at(addr);

    await forwardTime(MINING_CYCLE_DURATION, this);
    await repCycle.submitRootHash("0x00", 0, 10);
    await repCycle.confirmNewHash(0);

    // Advance another reputation cycle
    addr = await colonyNetwork.getReputationMiningCycle(true);
    repCycle = await IReputationMiningCycle.at(addr);

    await forwardTime(MINING_CYCLE_DURATION, this);
    await repCycle.submitRootHash("0x00", 0, 10);
    await repCycle.confirmNewHash(0);

    // The inactive reputation log now has the reward for this miner, and the accepted state is empty.
    // This is the same starting point for all tests.
    addr = await colonyNetwork.getReputationMiningCycle(true);
    repCycle = await IReputationMiningCycle.at(addr);

    const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
    assert.equal(nInactiveLogEntries.toNumber(), 1);

    // Finally, we discard the staked tokens we used to get to this point so that `MAIN_ACCOUNT` has no
    // tokens staked, just like all other accounts, at the start of each test.
    const info = await tokenLocking.getUserLock(clny.address, MAIN_ACCOUNT);
    const stakedBalance = info[1];
    await tokenLocking.withdraw(clny.address, stakedBalance.toString());
    const userBalance = await clny.balanceOf(MAIN_ACCOUNT);
    await clny.transfer(0x0, userBalance, { from: MAIN_ACCOUNT });
  });

  async function accommodateChallengeAndInvalidateHash(test, client1, client2) {
    const reputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle(true);
    const repCycle = await IReputationMiningCycle.at(reputationMiningCycleAddress);
    let round2;
    let idx2;
    let toInvalidateIdx;
    const [round1, idx1] = await client1.getMySubmissionRoundAndIndex();
    const submission1before = await repCycle.getDisputeRounds(round1, idx1);
    if (client2 !== undefined) {
      // Submit JRH for submission 1 if needed
      // We only do this if client2 is defined so that we test JRH submission in rounds other than round 0.
      if (submission1before[4] === "0x0000000000000000000000000000000000000000000000000000000000000000") {
        await client1.submitJustificationRootHash();
      }

      [round2, idx2] = await client2.getMySubmissionRoundAndIndex();
      assert(round1.eq(round2), "Clients do not have submissions in the same round");
      const submission2before = await repCycle.getDisputeRounds(round2, idx2);
      assert(
        idx1
          .sub(idx2)
          .pow(2)
          .eq(1),
        "Clients are not facing each other in this round"
      );
      if (submission2before[4] === "0x0000000000000000000000000000000000000000000000000000000000000000") {
        await client2.submitJustificationRootHash();
      }
      // Loop while doing the binary search, checking we were successful at each point
      // Binary search will error when it is complete.
      let noError = true;
      while (noError) {
        let transactionObject;
        transactionObject = await client1.respondToBinarySearchForChallenge(); // eslint-disable-line no-await-in-loop
        let tx = await web3GetTransactionReceipt(transactionObject.hash); // eslint-disable-line no-await-in-loop
        if (!tx.status) {
          noError = false;
        }
        transactionObject = await client2.respondToBinarySearchForChallenge(); // eslint-disable-line no-await-in-loop
        tx = await web3GetTransactionReceipt(transactionObject.hash); // eslint-disable-line no-await-in-loop
        if (!tx.status) {
          noError = false;
        }
      }

      await client1.confirmBinarySearchResult();
      await client2.confirmBinarySearchResult();

      // Respond to the challenge - usually, only one of these should work.
      // If both work, then the starting reputation is 0 and one client is lying
      // about whether the key already exists.
      await client1.respondToChallenge();
      await client2.respondToChallenge();

      // Work out which submission is to be invalidated.
      const submission1 = await repCycle.getDisputeRounds(round1.toString(), idx1.toString());
      const challengeStepsCompleted1 = new BN(submission1[3].toString());
      const submission2 = await repCycle.getDisputeRounds(round2.toString(), idx2.toString());
      const challengeStepsCompleted2 = new BN(submission2[3].toString());
      if (challengeStepsCompleted1.gt(challengeStepsCompleted2)) {
        toInvalidateIdx = idx2;
      } else {
        // Note that if they're equal, they're both going to be invalidated, so we can call
        // either
        toInvalidateIdx = idx1;
      }
      // Forward time, so that whichever has failed to respond by now has timed out.
      await forwardTime(600, test);
    } else {
      // idx1.modn returns a javascript number, which is surprising!
      toInvalidateIdx = idx1.mod(2) === 1 ? idx1.sub(1) : idx1.add(1);
    }
    return repCycle.invalidateHash(round1.toString(), toInvalidateIdx.toString());
  }

  afterEach(async () => {
    // Finish the current cycle. Can only do this at the start of a new cycle, if anyone has submitted a hash in this current cycle.
    await forwardTime(MINING_CYCLE_DURATION, this);
    const addr = await colonyNetwork.getReputationMiningCycle(true);
    const repCycle = await IReputationMiningCycle.at(addr);
    let nSubmittedHashes = await repCycle.getNSubmittedHashes();
    nSubmittedHashes = nSubmittedHashes.toNumber();
    if (nSubmittedHashes > 0) {
      let nInvalidatedHashes = await repCycle.getNInvalidatedHashes();
      nInvalidatedHashes = nInvalidatedHashes.toNumber();
      if (nSubmittedHashes - nInvalidatedHashes === 1) {
        await repCycle.confirmNewHash(nSubmittedHashes === 1 ? 0 : 1); // Not a general solution - only works for one or two submissions.
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
      accounts.map(async address => {
        const info = await tokenLocking.getUserLock(clny.address, address);
        const stakedBalance = info[1];
        if (stakedBalance.gt(new BN(0))) {
          await tokenLocking.withdraw(clny.address, stakedBalance.toString(), { from: address });
        }
        const userBalance = await clny.balanceOf(address);
        return clny.transfer(0x0, userBalance, { from: address });
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
      const stakedBalance = info[1];
      assert.equal(stakedBalance.toNumber(), 5000);
    });

    it("should allow miners to withdraw staked CLNY", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, 5000);
      await tokenLocking.withdraw(clny.address, 5000, { from: OTHER_ACCOUNT });
      const info = await tokenLocking.getUserLock(clny.address, OTHER_ACCOUNT);
      const stakedBalance = info[1];
      assert.equal(stakedBalance.toNumber(), 0);
    });

    it("should not allow miners to deposit more CLNY than they have", async () => {
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, 9000);
      await clny.approve(tokenLocking.address, 10000, { from: OTHER_ACCOUNT });
      await checkErrorRevert(tokenLocking.deposit(clny.address, 10000, { from: OTHER_ACCOUNT }));
      const userBalance = await clny.balanceOf(OTHER_ACCOUNT);
      assert.equal(userBalance.toNumber(), 9000);
      const info = await tokenLocking.getUserLock(clny.address, OTHER_ACCOUNT);
      const stakedBalance = info[1];
      assert.equal(stakedBalance.toNumber(), 0);
    });

    it("should not allow miners to withdraw more CLNY than they staked, even if enough has been staked total", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, 9000);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, 9000);
      await checkErrorRevert(tokenLocking.withdraw(clny.address, 10000, { from: OTHER_ACCOUNT }));
      const info = await tokenLocking.getUserLock(clny.address, OTHER_ACCOUNT);
      const stakedBalance = info[1];
      assert.equal(stakedBalance.toNumber(), 9000);
      const userBalance = await clny.balanceOf(OTHER_ACCOUNT);
      assert.equal(userBalance.toNumber(), 0);
    });

    it("should allow a new reputation hash to be submitted", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      await forwardTime(MINING_CYCLE_DURATION);
      const repCycle = await IReputationMiningCycle.at(addr);
      await repCycle.submitRootHash("0x12345678", 10, 10);
      const submitterAddress = await repCycle.getSubmittedHashes("0x12345678", 10, 0);
      assert.equal(submitterAddress, MAIN_ACCOUNT);
    });

    it("should only allow the first submission after the window closes to be accepted", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      await forwardTime(MINING_CYCLE_DURATION + 400); // Well after the window has closed
      const repCycle = await IReputationMiningCycle.at(addr);
      await repCycle.submitRootHash("0x12345678", 10, 10);
      await checkErrorRevert(
        repCycle.submitRootHash("0x12345678", 10, 10, { from: OTHER_ACCOUNT }),
        "colony-reputation-mining-cycle-submissions-closed"
      );
      const submitterAddress = await repCycle.getSubmittedHashes("0x12345678", 10, 0);
      assert.equal(submitterAddress, MAIN_ACCOUNT);
    });

    it("should not allow someone to submit a new reputation hash if they are not staking", async () => {
      const addr = await colonyNetwork.getReputationMiningCycle(true);
      await forwardTime(MINING_CYCLE_DURATION);
      const repCycle = await IReputationMiningCycle.at(addr);
      await checkErrorRevert(repCycle.submitRootHash("0x12345678", 10, 0), "colony-reputation-mining-zero-entry-index-passed");
      const nSubmittedHashes = await repCycle.getNSubmittedHashes();
      assert(nSubmittedHashes.isZero());
    });

    it("should not allow someone to withdraw their stake if they have submitted a hash this round", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      const addr = await colonyNetwork.getReputationMiningCycle(true);
      await forwardTime(MINING_CYCLE_DURATION, this);
      const repCycle = await IReputationMiningCycle.at(addr);
      await repCycle.submitRootHash("0x12345678", 10, 10);
      let userLock = await tokenLocking.getUserLock(clny.address, MAIN_ACCOUNT);
      await checkErrorRevert(
        tokenLocking.withdraw(clny.address, userLock[1].toString(), { from: MAIN_ACCOUNT }),
        "colony-token-locking-hash-submitted"
      );
      userLock = await tokenLocking.getUserLock(clny.address, MAIN_ACCOUNT);
      assert(userLock[1].eq(DEFAULT_STAKE));
    });

    it("should allow a new reputation hash to be set if only one was submitted", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      await forwardTime(MINING_CYCLE_DURATION, this);
      const repCycle = await IReputationMiningCycle.at(addr);
      await repCycle.submitRootHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);
      const newAddr = await colonyNetwork.getReputationMiningCycle(true);
      assert(newAddr !== 0x0);
      assert(addr !== 0x0);
      assert(newAddr !== addr);
      const rootHash = await colonyNetwork.getReputationRootHash();
      assert.equal(rootHash, "0x1234567800000000000000000000000000000000000000000000000000000000");
      const rootHashNNodes = await colonyNetwork.getReputationRootHashNNodes();
      assert(rootHashNNodes.eq(new BN(10)));
    });

    it("should not allow someone who is not ColonyNetwork to appendReputationUpdateLog", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);

      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      const nLogEntriesBefore = await repCycle.getReputationUpdateLogLength();
      await checkErrorRevert(
        repCycle.appendReputationUpdateLog(MAIN_ACCOUNT, 100, 0, metaColony.address, 0, 1),
        "colony-reputation-mining-sender-not-network"
      );
      const nLogEntriesAfter = await repCycle.getReputationUpdateLogLength();
      assert.equal(nLogEntriesBefore.toString(), nLogEntriesAfter.toString());
    });

    it("should not allow someone who is not ColonyNetwork to reset the ReputationMiningCycle window", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);
      const windowOpenTimestampBefore = await repCycle.getReputationMiningWindowOpenTimestamp();
      await checkErrorRevert(repCycle.resetWindow(), "colony-reputation-mining-sender-not-network");
      const windowOpenTimestampAfter = await repCycle.getReputationMiningWindowOpenTimestamp();
      assert.equal(windowOpenTimestampBefore.toString(), windowOpenTimestampAfter.toString());
    });

    it("should correctly calculate the miner weight", async () => {
      const UINT256_MAX = new BN(0).notn(256);
      const UINT32_MAX = new BN(0).notn(32);
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
      weight = await colonyNetwork.calculateMinerWeight(7776000, 0);
      assert.equal("625000000000000000", weight.toString());

      // Middle weight II (staked for T, last submission)
      weight = await colonyNetwork.calculateMinerWeight(7776000, 11);
      assert.equal("338541666666666667", weight.toString());

      // Smallest weight (staked for 0, last submission)
      weight = await colonyNetwork.calculateMinerWeight(0, 11);
      assert.equal("0", weight.toString());
    });
  });

  describe("Elimination of submissions", () => {
    it("should allow a new reputation hash to be set if all but one submitted have been eliminated", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      const addr = await colonyNetwork.getReputationMiningCycle(true);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const repCycle = await IReputationMiningCycle.at(addr);
      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await repCycle.confirmNewHash(1);
      const newAddr = await colonyNetwork.getReputationMiningCycle(true);
      assert(newAddr !== 0x0);
      assert(addr !== 0x0);
      assert(newAddr !== addr);
      const rootHash = await colonyNetwork.getReputationRootHash();
      const clientRootHash = await goodClient.getRootHash();
      assert.equal(rootHash, clientRootHash);
      const rootHashNNodes = await colonyNetwork.getReputationRootHashNNodes();
      assert.equal(rootHashNNodes.toString(), goodClient.nReputations.toString());
    });

    it("should allow a new reputation hash to be moved to the next stage of competition even if it does not have a partner", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, accounts[2], DEFAULT_STAKE);

      await submitAndForwardTimeToDispute([goodClient, badClient, badClient2], this);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);
      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await accommodateChallengeAndInvalidateHash(this, badClient2); // Invalidate the 'null' that partners the third hash submitted.
      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient2);

      await repCycle.confirmNewHash(2);
      const newAddr = await colonyNetwork.getReputationMiningCycle(true);
      assert(newAddr !== 0x0);
      assert(addr !== 0x0);
      assert(newAddr !== addr);
      const rootHash = await colonyNetwork.getReputationRootHash();
      const clientRootHash = await goodClient.getRootHash();
      assert.equal(rootHash, clientRootHash);
      const rootHashNNodes = await colonyNetwork.getReputationRootHashNNodes();
      assert.equal(rootHashNNodes.toString(), goodClient.nReputations.toString());
    });

    it("should not allow a new reputation hash to be set if more than one was submitted and they have not been elimintated", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);
      await checkErrorRevert(repCycle.confirmNewHash(0), "colony-reputation-mining-final-round-not-completed");
      const newAddr = await colonyNetwork.getReputationMiningCycle(true);
      assert(newAddr !== 0x0);
      assert(addr !== 0x0);
      assert(newAddr === addr);
      // Eliminate one so that the afterAll works.
      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
    });

    it("should not allow the last reputation hash to be eliminated", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await checkErrorRevert(accommodateChallengeAndInvalidateHash(this, goodClient), "colony-reputation-mining-cannot-invalidate-final-hash");
    });

    it("should fail if one tries to invalidate a hash that does not exist", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, accounts[2], DEFAULT_STAKE);

      await submitAndForwardTimeToDispute([goodClient, badClient, badClient2], this);
      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await accommodateChallengeAndInvalidateHash(this, badClient2);
      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await checkErrorRevert(repCycle.invalidateHash(1, 2), "colony-reputation-mining-dispute-id-not-in-range");
      // Cleanup after test
      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient2);
      await repCycle.confirmNewHash(2);
    });

    it("should fail if one tries to invalidate a hash that has completed more challenge rounds than its opponent", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.submitJustificationRootHash();
      await forwardTime(MINING_CYCLE_DURATION / 6, this);

      await checkErrorRevert(repCycle.invalidateHash(0, 0), "colony-reputation-mining-less-challenge-rounds-completed");
      // Cleanup after test
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("should not allow a hash to be invalidated multiple times, which would move extra copies of its opponent to the next stage", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await checkErrorRevert(repCycle.invalidateHash(0, 1), "colony-reputation-mining-proposed-hash-empty");
    });

    it("should not allow a hash to be invalidated and then moved on to the next stage by invalidating its now non-existent opponent", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await checkErrorRevert(repCycle.invalidateHash(0, 0), "colony-reputation-mining-hash-already-progressed");
    });

    it("should invalidate a hash and its partner if both have timed out", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, accounts[2], DEFAULT_STAKE);

      await submitAndForwardTimeToDispute([badClient, badClient2, goodClient], this);
      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1);
      await accommodateChallengeAndInvalidateHash(this, goodClient);
      await repCycle.confirmNewHash(1);
    });

    it("should prevent invalidation of hashes before they have timed out on a challenge", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);

      await goodClient.addLogContentsToReputationTree();
      await badClient.addLogContentsToReputationTree();

      await goodClient.submitRootHash();
      await badClient.submitRootHash();

      await checkErrorRevert(repCycle.invalidateHash(0, 1), "colony-reputation-mining-failed-to-respond-in-time");
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await checkErrorRevert(repCycle.confirmNewHash(1), "colony-reputation-mining-final-round-not-completed");
      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await repCycle.confirmNewHash(1);
    });
  });

  describe("Submission eligibility", () => {
    it("should not allow someone to submit a new reputation hash if they are ineligible", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);
      await checkErrorRevert(repCycle.submitRootHash("0x12345678", 10, 10), "colony-reputation-mining-cycle-submission-not-within-target");
      const nSubmittedHashes = await repCycle.getNSubmittedHashes();
      assert(nSubmittedHashes.isZero());
    });

    it("should not allow someone to submit a new reputation hash to the next ReputationMiningCycle", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);

      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      await checkErrorRevert(repCycle.submitRootHash("0x12345678", 10, 10), "colony-reputation-mining-cycle-not-open");
      const nSubmittedHashes = await repCycle.getNSubmittedHashes();
      assert.equal(nSubmittedHashes.toString(), "0");
    });

    it("should allow someone to submit a new reputation hash if they are eligible inside the window", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);
      // Find an entry that will be eligible in the last 60 seconds of the window
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      const entryNumber = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x12345678");
      await repCycle.submitRootHash("0x12345678", 10, entryNumber);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
    });

    it("should not allow a user to back more than one hash in a single cycle", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      const entryNumber = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x12345678");
      await repCycle.submitRootHash("0x12345678", 10, entryNumber);
      const entryNumber2 = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x87654321");
      await checkErrorRevert(repCycle.submitRootHash("0x87654321", 10, entryNumber2), "colony-reputation-mining-submitting-different-hash");
      const nSubmittedHashes = await repCycle.getNSubmittedHashes();
      assert(nSubmittedHashes.eq(new BN(1)));
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
    });

    it("should not allow a user to back the same hash with different number of nodes in a single cycle", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      const entryNumber = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x12345678");
      await repCycle.submitRootHash("0x12345678", 10, entryNumber);

      await checkErrorRevert(repCycle.submitRootHash("0x12345678", 11, entryNumber), "colony-reputation-mining-submitting-different-nnodes");
      const nSubmittedHashes = await repCycle.getNSubmittedHashes();
      assert(nSubmittedHashes.eq(new BN(1)));
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
    });

    it("should not allow a user to submit the same entry for the same hash twice in a single cycle", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      const entryNumber = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x12345678");

      await repCycle.submitRootHash("0x12345678", 10, entryNumber);

      await checkErrorRevert(repCycle.submitRootHash("0x12345678", 10, entryNumber), "colony-reputation-mining-submitting-same-entry-index");
      const nSubmittedHashes = await repCycle.getNSubmittedHashes();
      assert(nSubmittedHashes.eq(new BN(1)));
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
    });

    it("should allow a user to back the same hash more than once in a same cycle with different entries, and be rewarded", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      const entryNumber = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x12345678");
      const entryNumber2 = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x12345678", entryNumber + 1);

      await repCycle.submitRootHash("0x12345678", 10, entryNumber);
      await repCycle.submitRootHash("0x12345678", 10, entryNumber2);
      const nSubmittedHashes = await repCycle.getNSubmittedHashes();
      assert(nSubmittedHashes.eq(new BN(1)));
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await repCycle.confirmNewHash(0);

      // Check that they received the reward
      const balance1Updated = await clny.balanceOf(MAIN_ACCOUNT);
      assert.equal(balance1Updated.toString(), REWARD.toString(), "Account was not rewarded properly");

      addr = await colonyNetwork.getReputationMiningCycle(false);
      repCycle = await IReputationMiningCycle.at(addr);

      // Check that they will be getting the reputation owed to them.
      let repLogEntryMiner = await repCycle.getReputationUpdateLogEntry(0);
      assert.equal(repLogEntryMiner[0], MAIN_ACCOUNT);
      assert.isTrue(repLogEntryMiner[1].sub(REWARD.divn(2)).gtn(0));
      assert.equal(repLogEntryMiner[2].toString(), "3");
      assert.equal(repLogEntryMiner[3], metaColony.address);
      assert.equal(repLogEntryMiner[4].toString(), "4");
      assert.equal(repLogEntryMiner[5].toString(), "0");

      repLogEntryMiner = await repCycle.getReputationUpdateLogEntry(1);
      assert.equal(repLogEntryMiner[0], MAIN_ACCOUNT);
      assert.isTrue(repLogEntryMiner[1].sub(REWARD.divn(2)).ltn(0));
      assert.equal(repLogEntryMiner[2].toString(), "3");
      assert.equal(repLogEntryMiner[3], metaColony.address);
      assert.equal(repLogEntryMiner[4].toString(), "4");
      assert.equal(repLogEntryMiner[5].toString(), "4");

      const reputationUpdateLogLength = await repCycle.getReputationUpdateLogLength();
      assert.equal(reputationUpdateLogLength.toString(), 2);
    });

    it("should only allow 12 entries to back a single hash in each cycle", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE.muln(2));

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      await forwardTime(MINING_CYCLE_DURATION - 600, this);
      const repCycle = await IReputationMiningCycle.at(addr);
      let entryNumber = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x12345678", 1);
      for (let i = 1; i <= 12; i += 1) {
        await repCycle.submitRootHash("0x12345678", 10, entryNumber); // eslint-disable-line no-await-in-loop
        entryNumber = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x12345678", entryNumber + 1); // eslint-disable-line no-await-in-loop
      }
      await checkErrorRevert(repCycle.submitRootHash("0x12345678", 10, entryNumber), "colony-reputation-mining-max-number-miners-reached");
    });

    it("should prevent submission of hashes with an invalid entry for the balance of a user", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      await forwardTime(MINING_CYCLE_DURATION, this);
      const repCycle = await IReputationMiningCycle.at(addr);
      await checkErrorRevert(repCycle.submitRootHash("0x12345678", 10, 1000000000000), "colony-reputation-mining-stake-minimum-not-met-for-index");
      const entryNumber = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x87654321");
      await repCycle.submitRootHash("0x87654321", 10, entryNumber, { from: OTHER_ACCOUNT });
    });

    it("should prevent submission of hashes with a valid entry, but invalid hash for the current time", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);
      await checkErrorRevert(repCycle.submitRootHash("0x12345678", 10, 1), "colony-reputation-mining-cycle-submission-not-within-target");
    });
  });

  describe("Rewards and punishments of good and bad submissions", () => {
    it("should punish all stakers if they misbehave (and report a bad hash)", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, accounts[2], DEFAULT_STAKE);

      let userLock0 = await tokenLocking.getUserLock(clny.address, MAIN_ACCOUNT);
      assert(userLock0[1].eq(DEFAULT_STAKE));

      let userLock1 = await tokenLocking.getUserLock(clny.address, OTHER_ACCOUNT);
      assert(userLock1[1].eq(DEFAULT_STAKE));

      let userLock2 = await tokenLocking.getUserLock(clny.address, accounts[2]);
      assert(userLock2[1].eq(DEFAULT_STAKE));

      // We want badclient2 to submit the same hash as badclient for this test.
      badClient2 = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: accounts[2], realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        1,
        "0xfffffffff"
      );
      badClient2.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient, badClient2], this);
      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);

      userLock0 = await tokenLocking.getUserLock(clny.address, MAIN_ACCOUNT);
      assert.equal(userLock0[1].toString(), DEFAULT_STAKE.add(MIN_STAKE.muln(2)).toString(), "Account was not rewarded properly");

      userLock1 = await tokenLocking.getUserLock(clny.address, OTHER_ACCOUNT);
      assert.equal(userLock1[1].toString(), DEFAULT_STAKE.sub(MIN_STAKE).toString(), "Account was not punished properly");

      userLock2 = await tokenLocking.getUserLock(clny.address, accounts[2]);
      assert.equal(userLock2[1].toString(), DEFAULT_STAKE.sub(MIN_STAKE).toString(), "Account was not punished properly");
    });

    it("should reward all stakers if they submitted the agreed new hash", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);

      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      const entryNumber = await getValidEntryNumber(colonyNetwork, MAIN_ACCOUNT, "0x12345678");
      const entryNumber2 = await getValidEntryNumber(colonyNetwork, OTHER_ACCOUNT, "0x12345678");

      await repCycle.submitRootHash("0x12345678", 10, entryNumber);
      await repCycle.submitRootHash("0x12345678", 10, entryNumber2, { from: OTHER_ACCOUNT });
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await repCycle.confirmNewHash(0);

      // Check that they have had their balance increase
      const balance1Updated = await clny.balanceOf(MAIN_ACCOUNT);
      const balance2Updated = await clny.balanceOf(OTHER_ACCOUNT);

      // More than half of the reward
      assert.isTrue(balance1Updated.sub(REWARD.divn(2)).gtn(0), "Account was not rewarded properly");
      // Less than half of the reward
      assert.isTrue(balance2Updated.sub(REWARD.divn(2)).ltn(0), "Account was not rewarded properly");
      // Sum is total reward within `stakers.length` wei of precision error
      assert.closeTo(balance1Updated.add(balance2Updated).sub(REWARD).toNumber(), 0, 2); // eslint-disable-line prettier/prettier

      addr = await colonyNetwork.getReputationMiningCycle(false);
      repCycle = await IReputationMiningCycle.at(addr);

      // Check that they will be getting the reputation owed to them.
      let repLogEntryMiner = await repCycle.getReputationUpdateLogEntry(0);
      assert.equal(repLogEntryMiner[0], MAIN_ACCOUNT);
      assert.equal(repLogEntryMiner[1].toString(), balance1Updated.toString());
      assert.equal(repLogEntryMiner[2].toString(), "3");
      assert.equal(repLogEntryMiner[3], metaColony.address);
      assert.equal(repLogEntryMiner[4].toString(), "4");
      assert.equal(repLogEntryMiner[5].toString(), "0");

      repLogEntryMiner = await repCycle.getReputationUpdateLogEntry(1);
      assert.equal(repLogEntryMiner[0], OTHER_ACCOUNT);
      assert.equal(repLogEntryMiner[1].toString(), balance2Updated.toString());
      assert.equal(repLogEntryMiner[2].toString(), "3");
      assert.equal(repLogEntryMiner[3], metaColony.address);
      assert.equal(repLogEntryMiner[4].toString(), "4");
      assert.equal(repLogEntryMiner[5].toString(), "4");

      const reputationUpdateLogLength = await repCycle.getReputationUpdateLogLength();
      assert.equal(reputationUpdateLogLength.toString(), 2);
    });
  });

  describe("Function permissions", () => {
    it('should not allow "setReputationRootHash" to be called from an account that is not not reputationMiningCycle', async () => {
      await checkErrorRevert(
        colonyNetwork.setReputationRootHash("0x000001", 10, [accounts[0], accounts[1]], 0),
        "colony-reputation-mining-sender-not-active-reputation-cycle"
      );
    });

    it('should not allow "startNextCycle" to be called if a cycle is in progress', async () => {
      const addr = await colonyNetwork.getReputationMiningCycle(true);
      await forwardTime(MINING_CYCLE_DURATION, this);
      assert(parseInt(addr, 16) !== 0);
      await checkErrorRevert(colonyNetwork.startNextCycle(), "colony-reputation-mining-still-active");
    });

    it('should not allow "rewardStakersWithReputation" to be called by someone not the colonyNetwork', async () => {
      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);
      await checkErrorRevert(repCycle.rewardStakersWithReputation([MAIN_ACCOUNT], [1], 0x0, 10000, 3), "colony-reputation-mining-sender-not-network");
    });

    it('should not allow "initialise" to be called on either the active or inactive ReputationMiningCycle', async () => {
      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await checkErrorRevert(repCycle.initialise(MAIN_ACCOUNT, OTHER_ACCOUNT), "colony-reputation-mining-cycle-already-initialised");

      addr = await colonyNetwork.getReputationMiningCycle(false);
      repCycle = await IReputationMiningCycle.at(addr);
      await checkErrorRevert(repCycle.initialise(MAIN_ACCOUNT, OTHER_ACCOUNT), "colony-reputation-mining-cycle-already-initialised");
    });
  });

  describe("Types of disagreement", () => {
    it("in the event of a disagreement, allows a user to submit a JRH with proofs for a submission", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);

      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokens(colonyNetwork, accounts[2], DEFAULT_STAKE);
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x00", 0, 10);
      await repCycle.confirmNewHash(0);
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation updates for three task completions (manager, worker, evaluator);
      // That's seven in total.
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 13);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const righthash = await goodClient.getRootHash();
      const wronghash = await badClient.getRootHash();
      assert(righthash !== wronghash, "Hashes from clients are equal, surprisingly");

      const nSubmittedHashes = await repCycle.getNSubmittedHashes();
      assert.equal(nSubmittedHashes, 2);
      const submission = await repCycle.getDisputeRounds(0, 0);
      assert.equal(submission[4], "0x0000000000000000000000000000000000000000000000000000000000000000");
      await forwardTime(10, this); // This is just to ensure that the timestamps checked below will be different if JRH was submitted.

      await goodClient.submitJustificationRootHash();

      // Check that we can't re-submit a JRH
      await checkErrorRevertEthers(goodClient.submitJustificationRootHash(), "colony-reputation-mining-hash-already-submitted");

      const submissionAfterJRHSubmitted = await repCycle.getDisputeRounds(0, 0);
      const jrh = await goodClient.justificationTree.getRootHash();
      assert.equal(submissionAfterJRHSubmitted[4], jrh);

      // Check 'last response' was updated.
      assert.notEqual(submission[2].toString(), submissionAfterJRHSubmitted[2].toString());

      // Cleanup
      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await repCycle.confirmNewHash(1);
    });

    it("should cope if the wrong reputation transition is the first transition", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await goodClient.addLogContentsToReputationTree();
      await goodClient.submitRootHash();

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        0,
        "0xfffffffff"
      );
      badClient.entryToFalsify = "-1";
      await badClient.initialise(colonyNetwork.address);
      await badClient.addLogContentsToReputationTree();
      badClient.entryToFalsify = "0";

      await repCycle.confirmNewHash(0);
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const righthash = await goodClient.getRootHash();
      const wronghash = await badClient.getRootHash();
      assert(righthash !== wronghash, "Hashes from clients are equal, surprisingly");

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await repCycle.confirmNewHash(1);
    });

    // These tests are useful for checking that every type of parent / child / user / colony-wide-sum skills are accounted for
    // correctly. Unsure if I should force them to be run every time.
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].forEach(async badIndex => {
      it.skip(`should cope if wrong reputation transition is transition ${badIndex}`, async function advancingTest() {
        await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
        await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

        // Advance to next cycle
        let addr = await colonyNetwork.getReputationMiningCycle(true);
        let repCycle = await IReputationMiningCycle.at(addr);
        await forwardTime(MINING_CYCLE_DURATION, this);
        await repCycle.submitRootHash("0x12345678", 10, 10);
        await repCycle.confirmNewHash(0);

        await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
        addr = await colonyNetwork.getReputationMiningCycle(true);
        repCycle = await IReputationMiningCycle.at(addr);
        await forwardTime(MINING_CYCLE_DURATION, this);

        await goodClient.addLogContentsToReputationTree();
        await goodClient.submitRootHash();

        badClient = new MaliciousReputationMinerExtraRep(
          { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
          badIndex,
          "0xfffffffff"
        );
        badClient.entryToFalsify = "-1";
        await badClient.initialise(colonyNetwork.address);
        await badClient.addLogContentsToReputationTree();
        badClient.entryToFalsify = badIndex.toString();

        await repCycle.confirmNewHash(0);

        await submitAndForwardTimeToDispute([goodClient, badClient], this);

        const righthash = await goodClient.getRootHash();
        const wronghash = await badClient.getRootHash();
        assert(righthash !== wronghash, "Hashes from clients are equal, surprisingly");

        await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
        addr = await colonyNetwork.getReputationMiningCycle(true);
        repCycle = await IReputationMiningCycle.at(addr);
        await repCycle.confirmNewHash(1);
      });
    });

    it("in the event of a disagreement, allows a binary search between opponents to take place to find their first disagreement", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);

      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokens(colonyNetwork, accounts[2], DEFAULT_STAKE);
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x00", 0, 10);
      await repCycle.confirmNewHash(0);
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation updates for three task completions (manager, worker (skill and domain), evaluator);
      // That's thirteen in total.
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
      assert(righthash !== wronghash, "Hashes from clients are equal, surprisingly");

      const nSubmittedHashes = await repCycle.getNSubmittedHashes();
      assert.equal(nSubmittedHashes, 2);
      const submission = await repCycle.getDisputeRounds(0, 0);
      assert.equal(submission[4], "0x0000000000000000000000000000000000000000000000000000000000000000");
      await goodClient.submitJustificationRootHash();
      const submissionAfterJRHSubmitted = await repCycle.getDisputeRounds(0, 0);
      const jrh = await goodClient.justificationTree.getRootHash();
      assert.equal(submissionAfterJRHSubmitted[4], jrh);
      await badClient.submitJustificationRootHash();
      const badSubmissionAfterJRHSubmitted = await repCycle.getDisputeRounds(0, 1);
      const badJrh = await badClient.justificationTree.getRootHash();
      assert.equal(badSubmissionAfterJRHSubmitted[4], badJrh);

      let goodSubmission = await repCycle.getDisputeRounds(0, 0);
      let badSubmission = await repCycle.getDisputeRounds(0, 1);
      assert.equal(goodSubmission[3].toNumber(), 1); // Challenge steps completed
      assert.equal(goodSubmission[8].toNumber(), 0); // Lower bound for binary search
      assert.equal(goodSubmission[9].toNumber(), 28); // Upper bound for binary search
      assert.equal(badSubmission[3].toNumber(), 1);
      assert.equal(badSubmission[8].toNumber(), 0);
      assert.equal(badSubmission[9].toNumber(), 28);
      await goodClient.respondToBinarySearchForChallenge();

      goodSubmission = await repCycle.getDisputeRounds(0, 0);
      badSubmission = await repCycle.getDisputeRounds(0, 1);
      assert.equal(goodSubmission[3].toNumber(), 2);
      assert.equal(goodSubmission[8].toNumber(), 0);
      assert.equal(goodSubmission[9].toNumber(), 28);
      assert.equal(badSubmission[3].toNumber(), 1);
      assert.equal(badSubmission[8].toNumber(), 0);
      assert.equal(badSubmission[9].toNumber(), 28);

      await badClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.getDisputeRounds(0, 0);
      badSubmission = await repCycle.getDisputeRounds(0, 1);
      assert.equal(goodSubmission[8].toNumber(), 0);
      assert.equal(goodSubmission[9].toNumber(), 14);
      assert.equal(badSubmission[8].toNumber(), 0);
      assert.equal(badSubmission[9].toNumber(), 14);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.getDisputeRounds(0, 0);
      badSubmission = await repCycle.getDisputeRounds(0, 1);
      assert.equal(goodSubmission[8].toNumber(), 8);
      assert.equal(goodSubmission[9].toNumber(), 14);
      assert.equal(badSubmission[8].toNumber(), 8);
      assert.equal(badSubmission[9].toNumber(), 14);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.getDisputeRounds(0, 0);
      badSubmission = await repCycle.getDisputeRounds(0, 1);
      assert.equal(goodSubmission[8].toNumber(), 12);
      assert.equal(goodSubmission[9].toNumber(), 14);
      assert.equal(badSubmission[8].toNumber(), 12);
      assert.equal(badSubmission[9].toNumber(), 14);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.getDisputeRounds(0, 0);
      badSubmission = await repCycle.getDisputeRounds(0, 1);
      assert.equal(goodSubmission[8].toNumber(), 12);
      assert.equal(goodSubmission[9].toNumber(), 13);
      assert.equal(badSubmission[8].toNumber(), 12);
      assert.equal(badSubmission[9].toNumber(), 13);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.getDisputeRounds(0, 0);
      badSubmission = await repCycle.getDisputeRounds(0, 1);
      assert.equal(goodSubmission[8].toNumber(), 13);
      assert.equal(goodSubmission[9].toNumber(), 13);
      assert.equal(badSubmission[8].toNumber(), 13);
      assert.equal(badSubmission[9].toNumber(), 13);

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      // TODO: Split off in to  another test here, but can't be bothered to refactor right now.
      await goodClient.respondToChallenge();
      await checkErrorRevertEthers(badClient.respondToChallenge(), "colony-reputation-mining-invalid-newest-reputation-proof");

      // Check
      const goodSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 0);
      const badSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 1);
      assert.equal(goodSubmissionAfterResponseToChallenge[3].sub(badSubmissionAfterResponseToChallenge[3]).toNumber(), 2);
      // checks that challengeStepCompleted is two more for the good submission than the bad one.
      // it's two, because we proved the starting reputation was in the starting reputation state, rather than claiming
      // it was a new reputation not in the tree with value 0.

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1);
    });

    it("if an existing reputation's uniqueID is changed, that disagreement should be handled correctly", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);

      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokens(colonyNetwork, accounts[2], DEFAULT_STAKE);
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x00", 0, 10);
      await repCycle.confirmNewHash(0);
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation updates for three task completions (manager, worker (skill and domain), evaluator);
      // That's thirteen in total.
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
      assert(righthash !== wronghash, "Hashes from clients are equal, surprisingly");

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

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await goodClient.respondToChallenge();
      await checkErrorRevertEthers(badClient.respondToChallenge(), "colony-reputation-mining-uid-changed-for-existing-reputation");

      // Check
      const goodSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 0);
      const badSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 1);
      assert.equal(goodSubmissionAfterResponseToChallenge[3].sub(badSubmissionAfterResponseToChallenge[3]).toNumber(), 2);
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
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);

      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokens(colonyNetwork, accounts[2], DEFAULT_STAKE);
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x00", 0, 10);
      await repCycle.confirmNewHash(0);
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation updates for three task completions (manager, worker (skill and domain), evaluator);
      // That's thirteen in total.
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
      assert(righthash !== wronghash, "Hashes from clients are equal, surprisingly");

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

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await goodClient.respondToChallenge();
      await badClient.respondToChallenge();

      // Check
      const goodSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 0);
      const badSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 1);
      assert.equal(goodSubmissionAfterResponseToChallenge[3].sub(badSubmissionAfterResponseToChallenge[3]).toNumber(), 0);
      // Both sides have completed the same amount of challenges, but one has proved that a large number already exists
      // than the other, so when we call invalidate hash, only one will be eliminated.

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      // Check that we can't invalidate the one that proved a higher reputation already existed
      await checkErrorRevert(repCycle.invalidateHash(0, 0), "colony-reputation-mining-less-reputation-uids-proven");

      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
      const confirmedHash = await colonyNetwork.getReputationRootHash();
      assert.equal(confirmedHash, righthash);
    });

    it("If respondToChallenge is attempted to be called multiple times, it should fail", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);

      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokens(colonyNetwork, accounts[2], DEFAULT_STAKE);
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x00", 0, 10);
      await repCycle.confirmNewHash(0);
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation updates for three task completions (manager, worker (skill and domain), evaluator);
      // That's thirteen in total.
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
      assert(righthash !== wronghash, "Hashes from clients are equal, surprisingly");

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

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await goodClient.respondToChallenge();
      await badClient.respondToChallenge();
      // These calls should throw
      await badClient.respondToChallenge();
      await badClient.respondToChallenge();

      // Check
      const goodSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 0);
      const badSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 1);

      assert.equal(goodSubmissionAfterResponseToChallenge[3].sub(badSubmissionAfterResponseToChallenge[3]).toNumber(), 1);
      // Both sides have completed the same amount of challenges, but one has proved that the reputation existed previously,
      // whereas the other has not, and any respondToChallenges after the first didn't work.

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      // Check that we can't invalidate the good client submission
      await checkErrorRevert(repCycle.invalidateHash(0, 0), "colony-reputation-mining-less-challenge-rounds-completed");

      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
      const confirmedHash = await colonyNetwork.getReputationRootHash();
      assert.equal(confirmedHash, righthash);
    });

    it("if a log entry is claimed to make a new update, but shouldn't, that disagreement should be handled correctly", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);

      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokens(colonyNetwork, accounts[2], DEFAULT_STAKE);
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x00", 0, 10);
      await repCycle.confirmNewHash(0);
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation updates for three task completions (manager, worker (skill and domain), evaluator);
      // That's thirteen in total.
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
      assert(righthash !== wronghash, "Hashes from clients are equal, surprisingly");

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

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await goodClient.respondToChallenge();
      await checkErrorRevertEthers(badClient.respondToChallenge(), "colony-reputation-mining-proved-uid-inconsistent");

      // Check badclient respondToChallenge failed
      const goodSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 0);
      const badSubmissionAfterResponseToChallenge = await repCycle.getDisputeRounds(0, 1);
      assert.equal(goodSubmissionAfterResponseToChallenge[3].sub(badSubmissionAfterResponseToChallenge[3]).toNumber(), 2);

      await forwardTime(MINING_CYCLE_DURATION / 6, this);

      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
      const confirmedHash = await colonyNetwork.getReputationRootHash();
      assert.equal(confirmedHash, righthash);
    });

    it("if a new reputation's UID is not proved right because a too-old previous ID is proved, it should be handled correctly", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      const taskId = await setupRatedTask({
        colonyNetwork,
        colony: metaColony,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000000,
        workerPayout: 1000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: accounts[3]
      });
      await metaColony.finalizeTask(taskId);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      await forwardTime(MINING_CYCLE_DURATION, this);
      let repCycle = await IReputationMiningCycle.at(addr);
      await repCycle.submitRootHash("0x00", 0, 10);
      await repCycle.confirmNewHash(0);

      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        27,
        0xfffffffff
      );
      await badClient.initialise(colonyNetwork.address);

      // This client gets the same root hash as goodCleint, but will submit the wrong newest reputation hash when
      // it calls respondToChallenge.
      badClient2 = new MaliciousReputationMinerWrongNewestReputation(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        27,
        0xfffffffff
      );
      await badClient2.initialise(colonyNetwork.address);
      await badClient2.addLogContentsToReputationTree();

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

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

      await checkErrorRevertEthers(badClient2.respondToChallenge(), "colony-reputation-mining-new-uid-incorrect");
      // Cleanup
      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await repCycle.confirmNewHash(1);
    });

    it(`if a reputation decay calculation is wrong, it should be handled correctly`, async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);

      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x00", 0, 10);
      await repCycle.confirmNewHash(0);

      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        1,
        "0xfffffffff"
      );
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      let righthash = await goodClient.getRootHash();
      let wronghash = await badClient.getRootHash();
      assert(righthash !== wronghash, "Hashes from clients are equal, surprisingly");

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);

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
      assert(righthash === wronghash, "Hashes from clients are not equal - not starting from the same state");

      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      righthash = await goodClient.getRootHash();
      wronghash = await badClient.getRootHash();
      assert(righthash !== wronghash, "Hashes from clients are equal, surprisingly");

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await repCycle.confirmNewHash(1);
    });
  });

  describe("Misbehaviour during dispute resolution", () => {
    it("should prevent a user from submitting a JRH they can't prove is correct", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const jrh = await goodClient.justificationTree.getRootHash();
      const [branchMask1, siblings1] = await goodClient.justificationTree.getProof(`0x${new BN("0").toString(16, 64)}`);
      let nLogEntries = await repCycle.getReputationUpdateLogLength();
      nLogEntries = new BN(nLogEntries.toString());
      const lastLogEntry = await repCycle.getReputationUpdateLogEntry(nLogEntries.subn(1).toString());
      const totalnUpdates = new BN(lastLogEntry[4].toString()).add(new BN(lastLogEntry[5].toString()));
      const [branchMask2, siblings2] = await goodClient.justificationTree.getProof(`0x${totalnUpdates.toString(16, 64)}`);
      const [round, index] = await goodClient.getMySubmissionRoundAndIndex();
      await checkErrorRevert(
        repCycle.submitJustificationRootHash(round.toString(), index.toString(), jrh, "0", siblings1, branchMask2.toString(), siblings2, {
          gasLimit: 6000000
        }),
        "colony-reputation-mining-invalid-jrh-proof-1"
      );

      await checkErrorRevert(
        repCycle.submitJustificationRootHash(round.toString(), index.toString(), jrh, branchMask1.toString(), siblings1, "0", siblings2, {
          gasLimit: 6000000
        }),
        "colony-reputation-mining-invalid-jrh-proof-2"
      );

      // Cleanup
      await goodClient.submitJustificationRootHash();
      await badClient.submitJustificationRootHash();

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await checkErrorRevert(repCycle.confirmNewHash(0), "colony-reputation-mining-final-round-not-completed");
      await repCycle.confirmNewHash(1);
    });

    it("should correctly check the proof of the previously newest reputation, if necessary", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      const taskId = await setupRatedTask({
        colonyNetwork,
        colony: metaColony,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000000,
        workerPayout: 1000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: accounts[3]
      });
      await metaColony.finalizeTask(taskId);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x00", 0, 10);
      await repCycle.confirmNewHash(0);

      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        27,
        0xfffffffff
      );
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

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
      await checkErrorRevert(
        repCycle.respondToChallenge(
          [
            round.toString(),
            index.toString(),
            goodClient.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.branchMask.toString(),
            goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.nNodes.toString(),
            agreeStateBranchMask.toString(),
            goodClient.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.nNodes.toString(),
            disagreeStateBranchMask.toString(),
            // This is the wrong line
            0,
            // This is the correct line, for future reference
            // this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.branchMask,
            0,
            logEntryNumber.toString(),
            0
          ],
          reputationKey,
          goodClient.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.siblings,
          goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.value,
          agreeStateSiblings,
          goodClient.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.value,
          disagreeStateSiblings,
          goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.key,
          goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.value,
          goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.siblings,
          { gasLimit: 4000000 }
        ),
        "colony-reputation-mining-last-state-disagreement"
      );

      // Cleanup
      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await repCycle.confirmNewHash(1);
    });

    it("should correctly check the UID of the reputation if the reputation update being disputed is a decay", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      const taskId = await setupRatedTask({
        colonyNetwork,
        colony: metaColony,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000000,
        workerPayout: 1000000000000,
        managerRating: 3,
        workerRating: 3,
        worker: accounts[3]
      });
      await metaColony.finalizeTask(taskId);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x00", 0, 10);
      await repCycle.confirmNewHash(0);

      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);
      await badClient.initialise(colonyNetwork.address);

      badClient.entryToFalsify = "-1";

      await goodClient.addLogContentsToReputationTree();
      await badClient.addLogContentsToReputationTree();

      await forwardTime(MINING_CYCLE_DURATION, this);
      await goodClient.submitRootHash();
      await repCycle.confirmNewHash(0);

      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);

      badClient.entryToFalsify = "1";

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

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

      const agreeStateReputationValueFake = new BN(
        goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.value.slice(2),
        16
      )
        .addn(1)
        .toString(16, 128);

      await checkErrorRevert(
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
            0,
            logEntryNumber.toString(),
            0
          ],
          reputationKey,
          goodClient.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.siblings,
          `0x${agreeStateReputationValueFake}`,
          // This is the right line
          // goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.value,
          agreeStateSiblings,
          goodClient.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.value,
          disagreeStateSiblings,
          goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.key,
          goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.value,
          goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.siblings,
          { gasLimit: 4000000 }
        ),
        "colony-reputation-mining-uid-not-decay"
      );
      // Cleanup
      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await repCycle.confirmNewHash(1);
    });

    it("should correctly require the proof of the reputation under dispute before and after the change in question", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      const taskId = await setupRatedTask({
        colonyNetwork,
        colony: metaColony,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000000,
        workerPayout: 1000000000000,
        managerRating: 3,
        workerRating: 3
      });
      await metaColony.finalizeTask(taskId);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x00", 0, 10);
      await repCycle.confirmNewHash(0);

      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        24,
        0xfffffffff
      );
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

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
      await checkErrorRevert(
        repCycle.respondToChallenge(
          [
            round.toString(),
            index.toString(),
            goodClient.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.branchMask.toString(),
            goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.nNodes.toString(),
            // This is the right line
            // agreeStateBranchMask.toString(),
            // This is the wrong line
            0,
            goodClient.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.nNodes.toString(),
            disagreeStateBranchMask.toString(),
            // This is the correct line, for future reference
            goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.branchMask,
            0,
            logEntryNumber.toString(),
            0
          ],
          reputationKey,
          goodClient.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.siblings,
          goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.value,
          agreeStateSiblings,
          goodClient.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.value,
          disagreeStateSiblings,
          goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.key,
          goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.value,
          goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.siblings,
          { gasLimit: 4000000 }
        ),
        "colony-reputation-mining-invalid-before-reputation-proof"
      );
      await checkErrorRevert(
        repCycle.respondToChallenge(
          [
            round.toString(),
            index.toString(),
            goodClient.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.branchMask.toString(),
            goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.nNodes.toString(),
            agreeStateBranchMask.toString(),
            goodClient.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.nNodes.toString(),
            // This is the wrong line
            0,
            // This is the right line
            // disagreeStateBranchMask.toString(),
            // This is the correct line, for future reference
            goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.branchMask,
            0,
            logEntryNumber.toString(),
            0
          ],
          reputationKey,
          goodClient.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.siblings,
          goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.value,
          agreeStateSiblings,
          goodClient.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.value,
          disagreeStateSiblings,
          goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.key,
          goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.value,
          goodClient.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.siblings,
          { gasLimit: 4000000 }
        ),
        "colony-reputation-mining-invalid-after-reputation-proof"
      );

      // Cleanup
      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await repCycle.confirmNewHash(1);
    });

    it("should prevent a hash from advancing if it might still get an opponent", async function advancingTest() {
      this.timeout(10000000);
      assert(accounts.length >= 8, "Not enough accounts for test to run");
      const accountsForTest = accounts.slice(0, 8);
      for (let i = 0; i < 8; i += 1) {
        await giveUserCLNYTokensAndStake(colonyNetwork, accountsForTest[i], DEFAULT_STAKE); // eslint-disable-line no-await-in-loop
        // These have to be done sequentially because this function uses the total number of tasks as a proxy for getting the
        // right taskId, so if they're all created at once it messes up.
      }

      // We need to complete the current reputation cycle so that all the required log entries are present
      let reputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(reputationMiningCycleAddress);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x00", 0, 10);
      await repCycle.confirmNewHash(0);

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

      reputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(reputationMiningCycleAddress);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      for (let i = 0; i < clients.length; i += 1) {
        // Doing these individually rather than in a big loop because with many instances of the EVM
        // churning away at once, I *think* it's slower.
        await clients[i].addLogContentsToReputationTree(); // eslint-disable-line no-await-in-loop
        await clients[i].submitRootHash(); // eslint-disable-line no-await-in-loop
        await clients[i].submitJustificationRootHash(); // eslint-disable-line no-await-in-loop
        console.log(`Client ${i} of ${clients.length - 1} submitted JRH`); // eslint-disable-line no-console
      }
      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      await accommodateChallengeAndInvalidateHash(this, clients[0], clients[1]);
      await accommodateChallengeAndInvalidateHash(this, clients[2], clients[3]);
      await accommodateChallengeAndInvalidateHash(this, clients[4], clients[5]);
      await accommodateChallengeAndInvalidateHash(this, clients[0], clients[2]); // This is the first pairing in round 2
      await checkErrorRevert(accommodateChallengeAndInvalidateHash(this, clients[4]), "colony-reputation-mining-previous-dispute-round-not-complete");
      // Now clean up
      await accommodateChallengeAndInvalidateHash(this, clients[6], clients[7]);
      await accommodateChallengeAndInvalidateHash(this, clients[4], clients[6]);
      await accommodateChallengeAndInvalidateHash(this, clients[0], clients[4]);
      await repCycle.confirmNewHash(3);
    });

    it("should only allow the last hash standing to be confirmed", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.submitJustificationRootHash();
      await badClient.submitJustificationRootHash();

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await checkErrorRevert(repCycle.confirmNewHash(0), "colony-reputation-mining-final-round-not-completed");
      await repCycle.confirmNewHash(1);
    });

    it("incorrectly confirming a binary search result should fail", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        3,
        0xffffffffffff
      );
      await badClient.initialise(colonyNetwork.address);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.submitJustificationRootHash();
      await badClient.submitJustificationRootHash();

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      await goodClient.respondToBinarySearchForChallenge();

      const [round, index] = await goodClient.getMySubmissionRoundAndIndex();
      const submission = await repCycle.getDisputeRounds(round, index);
      const targetNode = submission[8];
      const targetNodeKey = ReputationMiner.getHexString(targetNode, 64);

      const [branchMask, siblings] = await goodClient.justificationTree.getProof(targetNodeKey);
      await checkErrorRevert(
        repCycle.confirmBinarySearchResult(round, index, "0x00", branchMask, siblings, {
          gasLimit: 1000000
        }),
        "colony-reputation-mining-invalid-binary-search-confirmation"
      );

      // Cleanup
      await goodClient.confirmBinarySearchResult();
      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("should not allow stages to be skipped even if the number of updates is a power of 2", async () => {
      // Note that our jrhNNodes can never be a power of two, because we always have an even number of updates (because every reputation change
      // has a user-specific an a colony-specific effect, and we always have one extra state in the Justification Tree because we include the last
      // accepted hash as the first node. jrhNNodes is always odd, therefore, and can never be a power of two.
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        5,
        0xfffffffff
      );

      await badClient.initialise(colonyNetwork.address);

      const taskId = await setupRatedTask( // eslint-disable-line
        {
          colonyNetwork,
          colony: metaColony,
          colonyToken: clny,
          workerRating: 1,
          managerPayout: 1,
          evaluatorPayout: 1,
          workerPayout: 1
        }
      );
      await metaColony.finalizeTask(taskId);
      await advanceTimeSubmitAndConfirmHash(this);
      await advanceTimeSubmitAndConfirmHash(this);
      let addr = await colonyNetwork.getReputationMiningCycle(false);
      const inactiveRepCycle = await IReputationMiningCycle.at(addr);

      let powerTwoEntries = false;
      while (!powerTwoEntries) {
        const taskId = await setupRatedTask( // eslint-disable-line
          {
            colonyNetwork,
            colony: metaColony,
            colonyToken: clny,
            workerRating: 1,
            managerPayout: 1,
            evaluatorPayout: 1,
            workerPayout: 1
          }
        );
        await metaColony.finalizeTask(taskId); // eslint-disable-line no-await-in-loop
        const nLogEntries = await inactiveRepCycle.getReputationUpdateLogLength(); // eslint-disable-line no-await-in-loop
        const lastLogEntry = await inactiveRepCycle.getReputationUpdateLogEntry(nLogEntries - 1); // eslint-disable-line no-await-in-loop
        const currentHashNNodes = await colonyNetwork.getReputationRootHashNNodes(); // eslint-disable-line no-await-in-loop
        const nUpdates = lastLogEntry[4].add(lastLogEntry[5]).add(currentHashNNodes);
        // The total number of updates we expect is the nPreviousUpdates in the last entry of the log plus the number
        // of updates that log entry implies by itself, plus the number of decays (the number of nodes in current state)
        if (parseInt(nUpdates.toString(2).slice(1), 10) === 0) {
          powerTwoEntries = true;
        }
      }
      await advanceTimeSubmitAndConfirmHash(this);
      await goodClient.resetDB();
      await goodClient.saveCurrentState();
      const savedHash = await goodClient.reputationTree.getRootHash();

      await badClient.loadState(savedHash);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.submitJustificationRootHash();
      await badClient.submitJustificationRootHash();

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      await goodClient.respondToBinarySearchForChallenge();

      // We need one more response to binary search from each side. Check we can't confirm early
      await checkErrorRevertEthers(goodClient.confirmBinarySearchResult(), "colony-reputation-binary-search-incomplete");
      // Check we can't respond to challenge before we've completed the binary search
      await checkErrorRevertEthers(goodClient.respondToChallenge(), "colony-reputation-mining-challenge-closed");
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

      addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("should fail to respondToBinarySearchForChallenge if not consistent with JRH", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.submitJustificationRootHash();
      await badClient.submitJustificationRootHash();

      await checkErrorRevert(
        repCycle.respondToBinarySearchForChallenge(0, 0, "0x00", 0x0, []),
        "colony-reputation-mining-invalid-binary-search-response"
      );

      // Cleanup
      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await repCycle.confirmNewHash(1);
    });

    it("should fail to respondToChallenge if any part of the key is wrong", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        3,
        0xffffffffffff
      );
      await badClient.initialise(colonyNetwork.address);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.submitJustificationRootHash();
      await badClient.submitJustificationRootHash();

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      await goodClient.respondToBinarySearchForChallenge();

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      const logEntry = await repCycle.getReputationUpdateLogEntry(0);

      const colonyAddress = logEntry[3].slice(2);
      const userAddress = logEntry[0].slice(2);
      const skillId = logEntry[2];

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
      await goodClient.respondToChallenge();
      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("should fail to respondToChallenge if binary search for challenge is not complete yet", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.submitJustificationRootHash();
      await badClient.submitJustificationRootHash();

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();

      await checkErrorRevert(
        repCycle.respondToChallenge([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "0x00", [], "0x00", [], "0x00", [], "0x00", "0x00", []),
        "colony-reputation-mining-challenge-closed"
      );

      // Cleanup
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
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);

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
          await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
          await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

          let addr = await colonyNetwork.getReputationMiningCycle(true);
          let repCycle = await IReputationMiningCycle.at(addr);
          await forwardTime(MINING_CYCLE_DURATION, this);

          await repCycle.submitRootHash("0x00", 0, 10);
          await repCycle.confirmNewHash(0);

          addr = await colonyNetwork.getReputationMiningCycle(true);
          repCycle = await IReputationMiningCycle.at(addr);

          badClient = new MaliciousReputationMinerExtraRep(
            { loader: contractLoader, minerAddress: MAIN_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
            args.badClient1Argument,
            10
          );

          badClient2 = new MaliciousReputationMinerWrongProofLogEntry(
            { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
            args.badClient2Argument
          );

          await goodClient.initialise(colonyNetwork.address);
          await goodClient.addLogContentsToReputationTree();

          await badClient.initialise(colonyNetwork.address);
          await badClient2.initialise(colonyNetwork.address);

          await submitAndForwardTimeToDispute([badClient, badClient2], this);

          const righthash = await badClient.getRootHash();
          const wronghash = await badClient2.getRootHash();
          assert(righthash !== wronghash, "Hashes from clients are equal, surprisingly");

          await badClient2.submitJustificationRootHash();
          await badClient.submitJustificationRootHash();

          await badClient2.respondToBinarySearchForChallenge();
          await badClient.respondToBinarySearchForChallenge();

          await badClient2.respondToBinarySearchForChallenge();
          await badClient.respondToBinarySearchForChallenge();

          await badClient2.respondToBinarySearchForChallenge();
          await badClient.respondToBinarySearchForChallenge();

          await badClient2.respondToBinarySearchForChallenge();
          await badClient.respondToBinarySearchForChallenge();

          await badClient2.respondToBinarySearchForChallenge();
          await badClient.respondToBinarySearchForChallenge();

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
          await goodClient.respondToChallenge();
          await forwardTime(MINING_CYCLE_DURATION / 6, this);
          await repCycle.invalidateHash(0, 0);
          await repCycle.confirmNewHash(1);
        });
      }
    );
  });

  describe("Intended ('happy path') behaviours", () => {
    it("should cope with many hashes being submitted and eliminated before a winner is assigned", async function manySubmissionTest() {
      this.timeout(100000000);
      const nClients = Math.min(accounts.length, 7);
      // TODO: This test probably needs to be written more carefully to make sure all possible edge cases are dealt with
      for (let i = 0; i < nClients; i += 1) {
        await giveUserCLNYTokensAndStake(colonyNetwork, accounts[i], DEFAULT_STAKE); // eslint-disable-line no-await-in-loop
        // These have to be done sequentially because this function uses the total number of tasks as a proxy for getting the
        // right taskId, so if they're all created at once it messes up.
      }

      // We need to complete the current reputation cycle so that all the required log entries are present
      let reputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(reputationMiningCycleAddress);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x00", 0, 10);
      await repCycle.confirmNewHash(0);

      const clients = await Promise.all(
        accounts.slice(0, nClients).map(async (addr, index) => {
          const client = new MaliciousReputationMinerExtraRep(
            { loader: contractLoader, minerAddress: addr, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
            accounts.length - index,
            index
          );
          // Each client will get a different reputation update entry wrong by a different amount, apart from the first one which
          // will submit a correct hash.
          await client.initialise(colonyNetwork.address);
          return client;
        })
      );

      reputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(reputationMiningCycleAddress);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      for (let i = 0; i < clients.length; i += 1) {
        // Doing these individually rather than in a big loop because with many instances of the EVM
        // churning away at once, I *think* it's slower.
        await clients[i].addLogContentsToReputationTree(); // eslint-disable-line no-await-in-loop
        await clients[i].submitRootHash(); // eslint-disable-line no-await-in-loop
        console.log(`Client ${i} of ${clients.length - 1} submitted JRH`); // eslint-disable-line no-console
      }
      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      const nSubmittedHashes = await repCycle.getNSubmittedHashes();
      let nRemainingHashes = nSubmittedHashes.toNumber();
      let cycle = 0;
      while (nRemainingHashes > 1) {
        for (let i = 0; i < clients.length; i += 2 * 2 ** cycle) {
          let [client1round] = await clients[i].getMySubmissionRoundAndIndex(); // eslint-disable-line no-await-in-loop
          client1round = new BN(client1round.toString());
          let client2round = new BN("-1");
          let client2idx = i;
          while (!client1round.eq(client2round)) {
            client2idx += 2 ** cycle;
            if (!clients[client2idx]) {
              break;
            }
            [client2round] = await clients[client2idx].getMySubmissionRoundAndIndex(); // eslint-disable-line no-await-in-loop
            client2round = new BN(client2round.toString());
          }
          await accommodateChallengeAndInvalidateHash(this, clients[i], clients[client2idx]); // eslint-disable-line no-await-in-loop
          // These could all be done simultaneously, but the one-liner with Promise.all is very hard to read.
          // It involved spread syntax and everything. If someone can come up with an easy-to-read version, I'll
          // be all for it
        }
        cycle += 1;
        const nInvalidatedHashes = await repCycle.getNInvalidatedHashes(); // eslint-disable-line no-await-in-loop
        nRemainingHashes = nSubmittedHashes.sub(nInvalidatedHashes).toNumber();
      }
      await repCycle.confirmNewHash(cycle);
    });

    it("should be able to process a large reputation update log", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      // TODO It would be so much better if we could do these in parallel, but until colonyNetwork#192 is fixed, we can't.
      for (let i = 0; i < 30; i += 1) {
        const taskId = await setupRatedTask( // eslint-disable-line
          {
            colonyNetwork,
            colony: metaColony,
            colonyToken: clny,
            workerRating: 1,
            managerPayout: 1,
            evaluatorPayout: 1,
            workerPayout: 1
          }
        );
        await metaColony.finalizeTask(taskId); // eslint-disable-line no-await-in-loop
      }
      // Complete this reputation cycle

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);

      // Do it again
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);
    });

    it("should allow submitted hashes to go through multiple responses to a challenge", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.submitJustificationRootHash();
      await badClient.submitJustificationRootHash();

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      await goodClient.respondToBinarySearchForChallenge();
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

    it("should cope if someone's existing reputation would go negative, setting it to zero instead", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        31,
        0xffffffffffff
      );
      await badClient.initialise(colonyNetwork.address);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);

      const taskId = await setupRatedTask({
        colonyNetwork,
        colony: metaColony,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000000,
        workerPayout: 1000000000000,
        managerRating: 1,
        workerRating: 1
      });
      await metaColony.finalizeTask(taskId);

      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x00", 0, 10);
      await repCycle.confirmNewHash(0);

      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.submitJustificationRootHash();
      await badClient.submitJustificationRootHash();

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await repCycle.confirmNewHash(1);
    });

    it("should cope if someone's new reputation would be negative, setting it to zero instead", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        31,
        0xffffffffffff
      );
      await badClient.initialise(colonyNetwork.address);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);

      const taskId = await setupRatedTask({
        colonyNetwork,
        colony: metaColony,
        worker: accounts[4],
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000000,
        workerPayout: 1000000000000,
        managerRating: 1,
        workerRating: 1
      });
      await metaColony.finalizeTask(taskId);

      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x00", 0, 10);
      await repCycle.confirmNewHash(0);

      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.submitJustificationRootHash();
      await badClient.submitJustificationRootHash();

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await repCycle.confirmNewHash(1);
    });

    it("should cope if someone's reputation would be overflow, setting it to the maximum value instead", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        29,
        new BN("-10").pow(new BN("75")).muln(2)
      );
      await badClient.initialise(colonyNetwork.address);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      const rootGlobalSkill = await colonyNetwork.getRootGlobalSkillId();
      const globalKey = await ReputationMiner.getKey(metaColony.address, rootGlobalSkill, "0x0000000000000000000000000000000000000000");
      const userKey = await ReputationMiner.getKey(metaColony.address, rootGlobalSkill, MAIN_ACCOUNT);

      await goodClient.insert(globalKey, new BN("2").pow(new BN("256")).subn(2), 0);
      await goodClient.insert(userKey, new BN("2").pow(new BN("256")).subn(2), 0);
      await badClient.insert(globalKey, new BN("2").pow(new BN("256")).subn(2), 0);
      await badClient.insert(userKey, new BN("2").pow(new BN("256")).subn(2), 0);

      const rootHash = await goodClient.getRootHash();
      await fundColonyWithTokens(metaColony, clny, new BN("4").mul(new BN("10").pow(new BN("75"))).toString());
      const taskId = await setupRatedTask({
        colonyNetwork,
        colony: metaColony,
        worker: MAIN_ACCOUNT,
        managerPayout: new BN("10").pow(new BN("75")).toString(),
        evaluatorPayout: new BN("10").pow(new BN("75")).toString(),
        workerPayout: new BN("10").pow(new BN("75")).toString(),
        managerRating: 3,
        workerRating: 3
      });
      await metaColony.finalizeTask(taskId);

      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash(rootHash, 2, 10);
      await repCycle.confirmNewHash(0);

      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.submitJustificationRootHash();
      await badClient.submitJustificationRootHash();

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await repCycle.confirmNewHash(1);
    });

    it("should calculate reputation decays differently if they are large", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        -1,
        new BN("10")
      );
      await badClient.initialise(colonyNetwork.address);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      const rootGlobalSkill = await colonyNetwork.getRootGlobalSkillId();
      const globalKey = await ReputationMiner.getKey(metaColony.address, rootGlobalSkill, "0x0000000000000000000000000000000000000000");
      const userKey = await ReputationMiner.getKey(metaColony.address, rootGlobalSkill, MAIN_ACCOUNT);

      await goodClient.insert(globalKey, new BN("2").pow(new BN("256")).subn(2), 0);
      await goodClient.insert(userKey, new BN("2").pow(new BN("256")).subn(2), 0);
      await badClient.insert(globalKey, new BN("2").pow(new BN("256")).subn(2), 0);
      await badClient.insert(userKey, new BN("2").pow(new BN("256")).subn(2), 0);

      const rootHash = await goodClient.getRootHash();

      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash(rootHash, 2, 10);
      await repCycle.confirmNewHash(0);

      badClient.entryToFalsify = "1";

      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.submitJustificationRootHash();
      await badClient.submitJustificationRootHash();

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await repCycle.confirmNewHash(1);

      const largeCalculationResult = new BN("2")
        .pow(new BN("256"))
        .subn(2)
        .div(DECAY_RATE.DENOMINATOR)
        .mul(DECAY_RATE.NUMERATOR);

      const smallCalculationResult = new BN("2")
        .pow(new BN("256"))
        .subn(2)
        .mul(DECAY_RATE.NUMERATOR)
        .div(DECAY_RATE.DENOMINATOR);

      const decayKey = await ReputationMiner.getKey(metaColony.address, rootGlobalSkill, MAIN_ACCOUNT);
      assert.notEqual(smallCalculationResult.toString(16, 64), goodClient.reputations[decayKey].slice(2, 66));
      assert.equal(largeCalculationResult.toString(16, 64), goodClient.reputations[decayKey].slice(2, 66));
    });

    it("should keep reputation updates that occur during one update window for the next window", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      await forwardTime(MINING_CYCLE_DURATION, this);
      const repCycle = await IReputationMiningCycle.at(addr);
      await repCycle.submitRootHash("0x12345678", 10, 10);
      await fundColonyWithTokens(metaColony, clny, "350000000000000000000");
      const taskId1 = await setupRatedTask({ colonyNetwork, colony: metaColony });
      await metaColony.finalizeTask(taskId1); // Creates an entry in the reputation log for the worker and manager
      addr = await colonyNetwork.getReputationMiningCycle(false);
      let inactiveReputationMiningCycle = await IReputationMiningCycle.at(addr);

      const initialRepLogLength = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      await repCycle.confirmNewHash(0);
      // This confirmation should freeze the reputation log that we added the above task entries to
      // and move it to the inactive rep log
      const addr2 = await colonyNetwork.getReputationMiningCycle(true);
      assert.equal(addr, addr2);
      const reputationMiningCycle = await IReputationMiningCycle.at(addr2);
      const finalRepLogLength = await reputationMiningCycle.getReputationUpdateLogLength();
      assert.equal(finalRepLogLength.toNumber(), initialRepLogLength.toNumber());
      // Check the active log now has one entry in it (which will be the rewards for the miner who submitted
      // the accepted hash.
      addr = await colonyNetwork.getReputationMiningCycle(false);
      inactiveReputationMiningCycle = await IReputationMiningCycle.at(addr);
      const activeRepLogLength = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      assert.equal(activeRepLogLength.toNumber(), 1);
    });

    it("The reputation mining client should insert reputation updates from the log", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);

      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokens(colonyNetwork, accounts[2], DEFAULT_STAKE);
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);

      // The update log should contain the person being rewarded for the previous
      // update cycle, and 4x reputation updates for three task completions (manager, worker (domain and skill), evaluator);
      // That's thirteen in total.
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 13);

      const client = new ReputationMiner({ loader: contractLoader, minerAddress: MAIN_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree });
      await client.initialise(colonyNetwork.address);
      await client.addLogContentsToReputationTree();
      // Check the client's tree has seven entries. In order these were added (and therefore in order of reputation UID),
      // these are:
      // 1. Colony-wide total reputation for metaColony's root skill
      // 2. Colony-wide total reputation for mining skill
      // 3. Miner's reputation for metaColony's root skill
      // 4. Miner's reputation for mining skill
      // x. Colony-wide total reputation for metacolony's root skill (same as 1)
      // x. Manager reputation for metaColony's root skill (same as 3, by virtue of manager and miner being MAIN_ACCOUNT)
      // x. Colony-wide total reputation for metacolony's root skill (same as 1)
      // x. Evaluator reputation for metaColony's root skill (same as 3, by virtue of evaluator and manager being MAIN_ACCOUNT)
      // x. Colony-wide total reputation for metacolony's root skill (same as 1)
      // 5. Worker reputation for metacolony's root skill
      // 6. Colony-wide total reputation for global skill task was in
      // 7. Worker reputation for global skill task was in

      const GLOBAL_SKILL = 1;
      const META_ROOT_SKILL = 2;
      const MINING_SKILL = 3;

      assert.equal(Object.keys(client.reputations).length, 7);
      let key;
      let value;
      // These should be:
      // 1. Colony-wide total reputation for metacolony's root skill
      key = makeReputationKey(metaColony.address, META_ROOT_SKILL);
      value = makeReputationValue(DEFAULT_STAKE.muln(6).add(REWARD), 1);
      assert.equal(client.reputations[key], value);

      // 2. Colony-wide total reputation for mining skill
      key = makeReputationKey(metaColony.address, MINING_SKILL);
      value = makeReputationValue(REWARD, 2);
      assert.equal(client.reputations[key], value);

      // 3. Reputation reward for MAIN_ACCOUNT for being the manager for the tasks created by giveUserCLNYTokens
      key = makeReputationKey(metaColony.address, META_ROOT_SKILL, MAIN_ACCOUNT);
      value = makeReputationValue(DEFAULT_STAKE.muln(6).add(REWARD), 3);
      assert.equal(client.reputations[key], value);

      // 4. Reputation reward for MAIN_ACCOUNT for submitting the previous reputation hash
      key = makeReputationKey(metaColony.address, MINING_SKILL, MAIN_ACCOUNT);
      value = makeReputationValue(REWARD, 4);
      assert.equal(client.reputations[key], value);

      // 5. Reputation reward for accounts[2] for being the worker for the tasks created by giveUserCLNYTokens
      // NB at the moment, the reputation reward for the worker is 0.
      key = makeReputationKey(metaColony.address, META_ROOT_SKILL, accounts[2]);
      value = makeReputationValue(0, 5);
      assert.equal(client.reputations[key], value);

      // 6. Colony-wide total reputation for global skill task was in
      key = makeReputationKey(metaColony.address, GLOBAL_SKILL);
      value = makeReputationValue(0, 6);
      assert.equal(client.reputations[key], value);

      // 7. Worker reputation for global skill task was in
      key = makeReputationKey(metaColony.address, GLOBAL_SKILL, accounts[2]);
      value = makeReputationValue(0, 7);
      assert.equal(client.reputations[key], value);
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

      // Make sure there's funding for the task
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);

      // Do the task
      const taskId = await setupRatedTask({
        colonyNetwork,
        colony: metaColony,
        skill: 10,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000000,
        workerPayout: 1000000000000,
        workerRating: 2,
        manager: MAIN_ACCOUNT,
        worker: OTHER_ACCOUNT,
        evaluator: accounts[2]
      });
      await metaColony.finalizeTask(taskId);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x12345678", 0, 10);
      await repCycle.confirmNewHash(0);

      // The update log should contain the person being rewarded for the previous
      // update cycle, and 2x4 reputation updates for the task completions (manager, worker (domain and skill), evaluator);
      // That's 9 in total.
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 9);

      await goodClient.addLogContentsToReputationTree();

      const META_ROOT_SKILL = 2;
      const MINING_SKILL = 3;

      const reputationProps = [
        { id: 1, skill: META_ROOT_SKILL, account: undefined, value: DEFAULT_STAKE.muln(2).add(REWARD).add(new BN("3000000000000")) }, // eslint-disable-line prettier/prettier
        { id: 2, skill: MINING_SKILL, account: undefined, value: REWARD },
        { id: 3, skill: META_ROOT_SKILL, account: MAIN_ACCOUNT, value: DEFAULT_STAKE.muln(2).add(REWARD).add(new BN("1000000000000")) }, // eslint-disable-line prettier/prettier
        { id: 4, skill: MINING_SKILL, account: MAIN_ACCOUNT, value: REWARD },
        { id: 5, skill: META_ROOT_SKILL, account: accounts[2], value: 1000000000000 },
        { id: 6, skill: 1, account: undefined, value: 1000000000000 },
        { id: 7, skill: 1, account: accounts[2], value: 0 },
        { id: 8, skill: META_ROOT_SKILL, account: OTHER_ACCOUNT, value: 1000000000000 },

        { id: 9, skill: 9, account: undefined, value: 1000000000000 },
        { id: 10, skill: 8, account: undefined, value: 1000000000000 },
        { id: 11, skill: 7, account: undefined, value: 1000000000000 },
        { id: 12, skill: 6, account: undefined, value: 1000000000000 },
        { id: 13, skill: 5, account: undefined, value: 1000000000000 },
        { id: 14, skill: 4, account: undefined, value: 1000000000000 },
        { id: 15, skill: 10, account: undefined, value: 1000000000000 },

        { id: 16, skill: 9, account: OTHER_ACCOUNT, value: 1000000000000 },
        { id: 17, skill: 8, account: OTHER_ACCOUNT, value: 1000000000000 },
        { id: 18, skill: 7, account: OTHER_ACCOUNT, value: 1000000000000 },
        { id: 19, skill: 6, account: OTHER_ACCOUNT, value: 1000000000000 },
        { id: 20, skill: 5, account: OTHER_ACCOUNT, value: 1000000000000 },
        { id: 21, skill: 4, account: OTHER_ACCOUNT, value: 1000000000000 },
        { id: 22, skill: 1, account: OTHER_ACCOUNT, value: 1000000000000 },
        { id: 23, skill: 10, account: OTHER_ACCOUNT, value: 1000000000000 }
      ];

      assert.equal(Object.keys(goodClient.reputations).length, reputationProps.length);

      reputationProps.forEach(reputationProp => {
        const key = makeReputationKey(metaColony.address, reputationProp.skill, reputationProp.account);
        const value = makeReputationValue(reputationProp.value, reputationProp.id);
        assert.equal(goodClient.reputations[key], value);
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

      // Do some tasks
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      const taskId = await setupRatedTask({
        colonyNetwork,
        colony: metaColony,
        skill: 10,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000000,
        workerPayout: 1000000000000,
        workerRating: 2,
        manager: MAIN_ACCOUNT,
        worker: OTHER_ACCOUNT,
        evaluator: accounts[2]
      });
      await metaColony.finalizeTask(taskId);

      // Get current cycle & advance to next
      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x12345678", 0, 10);
      await repCycle.confirmNewHash(0);

      // Get current cycle
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);
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
      assert(righthash !== wronghash, "Hashes from clients are equal, surprisingly");

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await repCycle.confirmNewHash(1);
    });

    it("Should allow a user to prove their reputation", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await forwardTime(MINING_CYCLE_DURATION, this);
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);
      await repCycle.submitRootHash("0x00", 10, 10);
      await repCycle.confirmNewHash(0);

      const client = new ReputationMiner({ loader: contractLoader, minerAddress: MAIN_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree });
      await client.initialise(colonyNetwork.address);
      await client.addLogContentsToReputationTree();
      const newRootHash = await client.getRootHash();

      await forwardTime(MINING_CYCLE_DURATION, this);
      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);
      await repCycle.submitRootHash(newRootHash, 10, 10);
      await repCycle.confirmNewHash(0);
      let key = `0x${new BN(metaColony.address.slice(2), 16).toString(16, 40)}`; // Colony address as bytes
      key += `${new BN("2").toString(16, 64)}`; // SkillId as uint256
      key += `${new BN(MAIN_ACCOUNT.slice(2), 16).toString(16, 40)}`; // User address as bytes

      const value = client.reputations[key];
      const proof = await client.getProof(key);
      const [branchMask, siblings] = proof;
      const validProof = await metaColony.verifyReputationProof(`${key}`, `${value}`, branchMask, siblings);
      assert.equal(validProof, true);
    });

    it("Should correctly decay a reputation to zero, and then 'decay' to zero in subsequent cycles", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: OTHER_ACCOUNT, realProviderPort: REAL_PROVIDER_PORT, useJsTree },
        1,
        new BN("10")
      );
      await badClient.initialise(colonyNetwork.address);

      let addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      const rootGlobalSkill = await colonyNetwork.getRootGlobalSkillId();
      const globalKey = await ReputationMiner.getKey(metaColony.address, rootGlobalSkill, "0x0000000000000000000000000000000000000000");
      const userKey = await ReputationMiner.getKey(metaColony.address, rootGlobalSkill, MAIN_ACCOUNT);

      await goodClient.insert(globalKey, new BN("1"), 0);
      await goodClient.insert(userKey, new BN("1"), 0);
      await badClient.insert(globalKey, new BN("1"), 0);
      await badClient.insert(userKey, new BN("1"), 0);

      const rootHash = await goodClient.getRootHash();

      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash(rootHash, 2, 10);
      await repCycle.confirmNewHash(0);

      const decayKey = await ReputationMiner.getKey(metaColony.address, rootGlobalSkill, MAIN_ACCOUNT);

      // Check we have exactly one reputation.
      assert.equal(
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
        goodClient.reputations[decayKey]
      );

      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await goodClient.submitJustificationRootHash();
      await badClient.submitJustificationRootHash();

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await repCycle.confirmNewHash(1);

      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);

      // Check it decayed from 1 to 0.
      assert.equal(
        "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002",
        goodClient.reputations[decayKey]
      );

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

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);

      addr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(addr);
      await repCycle.confirmNewHash(1);

      // Check it 'decayed' from 0 to 0
      assert.equal(
        "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002",
        goodClient.reputations[decayKey]
      );
    });

    it.skip("should abort if a deposit did not complete correctly");
  });

  async function advanceTimeSubmitAndConfirmHash(test) {
    await forwardTime(MINING_CYCLE_DURATION, test);
    await goodClient.addLogContentsToReputationTree();
    await goodClient.submitRootHash();
    const addr = await colonyNetwork.getReputationMiningCycle(true);
    const repCycle = await IReputationMiningCycle.at(addr);
    await repCycle.confirmNewHash(0);
  }

  describe("Miner syncing functionality", () => {
    let startingBlockNumber;
    let goodClient2;

    beforeEach(async () => {
      const startingBlock = await currentBlock();
      startingBlockNumber = startingBlock.number;

      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      goodClient2 = new ReputationMiner({
        loader: contractLoader,
        minerAddress: OTHER_ACCOUNT,
        realProviderPort: REAL_PROVIDER_PORT,
        useJsTree
      });
      await goodClient2.initialise(colonyNetwork.address);
      // Make multiple reputation cycles, with different numbers tasks and blocks in them.
      for (let i = 0; i < 5; i += 1) {
        const taskId = await setupRatedTask( // eslint-disable-line
          {
            colonyNetwork,
            colony: metaColony,
            managerPayout: 1000000000000,
            evaluatorPayout: 1000000000000,
            workerPayout: 1000000000000,
            managerRating: 3,
            workerRating: 3
          }
        );
        await metaColony.finalizeTask(taskId); // eslint-disable-line no-await-in-loop
      }

      await advanceTimeSubmitAndConfirmHash(this);

      await forwardTime(1, this);
      await forwardTime(1, this);
      await forwardTime(1, this);
      await forwardTime(1, this);
      await advanceTimeSubmitAndConfirmHash(this);

      for (let i = 0; i < 5; i += 1) {
        const taskId = await setupRatedTask( // eslint-disable-line
          {
            colonyNetwork,
            colony: metaColony,
            managerPayout: 1000000000000,
            evaluatorPayout: 1000000000000,
            workerPayout: 1000000000000,
            managerRating: 3,
            workerRating: 3
          }
        );
        await metaColony.finalizeTask(taskId); // eslint-disable-line no-await-in-loop
      }

      await advanceTimeSubmitAndConfirmHash(this);
      await advanceTimeSubmitAndConfirmHash(this);
      await advanceTimeSubmitAndConfirmHash(this);
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
          await advanceTimeSubmitAndConfirmHash(this);

          for (let i = 0; i < 5; i += 1) {
            const taskId = await setupRatedTask( // eslint-disable-line
              {
                colonyNetwork,
                colony: metaColony,
                managerPayout: 1000000000000,
                evaluatorPayout: 1000000000000,
                workerPayout: 1000000000000,
                managerRating: 3,
                workerRating: 3
              }
            );
            await metaColony.finalizeTask(taskId); // eslint-disable-line no-await-in-loop
          }

          await advanceTimeSubmitAndConfirmHash(this);

          await forwardTime(1, this);
          await forwardTime(1, this);
          await forwardTime(1, this);
          await forwardTime(1, this);
          await forwardTime(MINING_CYCLE_DURATION, this);

          await advanceTimeSubmitAndConfirmHash(this);

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
          await goodClient.resetDB();
          await goodClient.saveCurrentState();
          const savedHash = await goodClient.reputationTree.getRootHash();

          // Do some additional updates.
          await advanceTimeSubmitAndConfirmHash(this);
          await advanceTimeSubmitAndConfirmHash(this);
          await advanceTimeSubmitAndConfirmHash(this);
          await advanceTimeSubmitAndConfirmHash(this);

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
      await goodClient.resetDB();
      await goodClient.saveCurrentState();
      const client1Hash = await goodClient.reputationTree.getRootHash();
      await goodClient2.loadState(client1Hash);
      const client2Hash = await goodClient2.reputationTree.getRootHash();
      assert.equal(client1Hash, client2Hash);
    });

    it("should be able to correctly get the proof for a reputation in a historical state without affecting the current miner state", async () => {
      await goodClient.resetDB();
      await goodClient.saveCurrentState();
      const clientHash1 = await goodClient.reputationTree.getRootHash();
      const key = Object.keys(goodClient.reputations)[0];
      const value = goodClient.reputations[key];
      const [branchMask, siblings] = await goodClient.getProof(key);

      await advanceTimeSubmitAndConfirmHash(this);
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
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);
      await advanceTimeSubmitAndConfirmHash();
      await goodClient.saveCurrentState();

      client = new ReputationMinerClient({
        loader: contractLoader,
        realProviderPort: REAL_PROVIDER_PORT,
        minerAddress: MAIN_ACCOUNT,
        useJSTree: true,
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
      const key = makeReputationKey(metaColony.address, 2, MAIN_ACCOUNT);

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
      const key = makeReputationKey(metaColony.address, 2, MAIN_ACCOUNT);
      const [branchMask, siblings] = await goodClient.getProof(key);
      const value = goodClient.reputations[key];

      await advanceTimeSubmitAndConfirmHash();

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
          await advanceTimeSubmitAndConfirmHash();
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
