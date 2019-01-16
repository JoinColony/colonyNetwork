/* globals artifacts */

import path from "path";
import BN from "bn.js";
import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";

import {
  forwardTime,
  makeReputationKey,
  makeReputationValue,
  submitAndForwardTimeToDispute,
  runBinarySearch,
  getActiveRepCycle,
  advanceMiningCycleNoContest,
  accommodateChallengeAndInvalidateHash,
  finishReputationMiningCycleAndWithdrawAllMinerStakes
} from "../helpers/test-helper";

import { giveUserCLNYTokensAndStake, setupFinalizedTask, fundColonyWithTokens } from "../helpers/test-data-generator";

import {
  INT128_MAX,
  DEFAULT_STAKE,
  REWARD,
  INITIAL_FUNDING,
  MANAGER_PAYOUT,
  EVALUATOR_PAYOUT,
  WORKER_PAYOUT,
  MINING_CYCLE_DURATION,
  DECAY_RATE,
  ZERO_ADDRESS
} from "../helpers/constants";

import ReputationMinerTestWrapper from "../packages/reputation-miner/test/ReputationMinerTestWrapper";
import MaliciousReputationMinerExtraRep from "../packages/reputation-miner/test/MaliciousReputationMinerExtraRep";

const EtherRouter = artifacts.require("EtherRouter");
const IMetaColony = artifacts.require("IMetaColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ITokenLocking = artifacts.require("ITokenLocking");
const Token = artifacts.require("Token");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "build", "contracts")
});

const useJsTree = true;

contract("ColonyNetworkMining", accounts => {
  const MANAGER = accounts[0];
  const EVALUATOR = accounts[1];
  const WORKER = accounts[2];

  const MAIN_ACCOUNT = accounts[5];
  const OTHER_ACCOUNT = accounts[6];

  let metaColony;
  let colonyNetwork;
  let tokenLocking;
  let clny;
  let goodClient;
  let badClient;
  const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await ITokenLocking.at(tokenLockingAddress);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);
    const clnyAddress = await metaColony.getToken();
    clny = await Token.at(clnyAddress);

    goodClient = new ReputationMinerTestWrapper({ loader, realProviderPort, useJsTree, minerAddress: MAIN_ACCOUNT });
    await goodClient.resetDB();
  });

  beforeEach(async () => {
    goodClient = new ReputationMinerTestWrapper({ loader, realProviderPort, useJsTree, minerAddress: MAIN_ACCOUNT });
    await goodClient.initialise(colonyNetwork.address);

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
    await finishReputationMiningCycleAndWithdrawAllMinerStakes(colonyNetwork, this);
  });

  describe("Intended ('happy path') behaviours", () => {
    before(async () => {
      // We're not resetting the global skills tree as the Network is not reset
      // Initialise global skills tree: 1 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10

      await metaColony.addGlobalSkill(7);
      await metaColony.addGlobalSkill(8);
      await metaColony.addGlobalSkill(9);
    });

    it("should cope with many hashes being submitted and eliminated before a winner is assigned", async function manySubmissionTest() {
      this.timeout(100000000);

      // TODO: This test probably needs to be written more carefully to make sure all possible edge cases are dealt with
      for (let i = 3; i < 11; i += 1) {
        await giveUserCLNYTokensAndStake(colonyNetwork, accounts[i], DEFAULT_STAKE);
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
            { loader, realProviderPort, useJsTree, minerAddress: addr },
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
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[2], clients[3], {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[4], clients[5], {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" }
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[6], clients[7], {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" }
      });

      // Round 2
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[0], clients[2], {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
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
        await setupFinalizedTask( // eslint-disable-line
          {
            colonyNetwork,
            colony: metaColony,
            token: clny,
            workerRating: 2,
            managerPayout: 1,
            evaluatorPayout: 1,
            workerPayout: 1
          }
        );
      }

      // Complete two reputation cycles to process the log
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });
    });

    it("should allow submitted hashes to go through multiple responses to a challenge", async () => {
      badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 1, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

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

      badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 29, 0xffffffffffff);
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

      badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 31, 0xffffffffffff);
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
        client2: { respondToChallenge: "colony-reputation-mining-child-reputation-value-non-zero" }
      });
      await repCycle.confirmNewHash(1);
    });

    it("should cope if someone's reputation would overflow, setting it to the maximum value instead", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(2));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony, worker: MAIN_ACCOUNT });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony, worker: OTHER_ACCOUNT });

      const bigPayout = new BN("10").pow(new BN("38"));

      badClient = new MaliciousReputationMinerExtraRep(
        { loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT },
        29,
        bigPayout.muln(2).neg()
      );
      await badClient.initialise(colonyNetwork.address);

      let repCycle = await getActiveRepCycle(colonyNetwork);
      const rootGlobalSkill = await colonyNetwork.getRootGlobalSkillId();
      const globalKey = await ReputationMinerTestWrapper.getKey(metaColony.address, rootGlobalSkill, ZERO_ADDRESS);
      const userKey = await ReputationMinerTestWrapper.getKey(metaColony.address, rootGlobalSkill, MAIN_ACCOUNT);

      await goodClient.insert(globalKey, INT128_MAX.subn(1), 0);
      await goodClient.insert(userKey, INT128_MAX.subn(1), 0);
      await badClient.insert(globalKey, INT128_MAX.subn(1), 0);
      await badClient.insert(userKey, INT128_MAX.subn(1), 0);

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
        client2: { respondToChallenge: "colony-reputation-mining-reputation-not-max-int128" }
      });
      await repCycle.confirmNewHash(1);
    });

    it("should calculate reputation decays correctly if they are large", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 1, new BN("10"));
      await badClient.initialise(colonyNetwork.address);

      const rootGlobalSkill = await colonyNetwork.getRootGlobalSkillId();
      const globalKey = await ReputationMinerTestWrapper.getKey(metaColony.address, rootGlobalSkill, ZERO_ADDRESS);
      const userKey = await ReputationMinerTestWrapper.getKey(metaColony.address, rootGlobalSkill, MAIN_ACCOUNT);

      await goodClient.insert(globalKey, INT128_MAX.subn(1), 0);
      await goodClient.insert(userKey, INT128_MAX.subn(1), 0);
      await badClient.insert(globalKey, INT128_MAX.subn(1), 0);
      await badClient.insert(userKey, INT128_MAX.subn(1), 0);

      const rootHash = await goodClient.getRootHash();
      let repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash(rootHash, 2, "0x00", 10, { from: MAIN_ACCOUNT });
      await repCycle.confirmNewHash(0);

      repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" }
      });
      await repCycle.confirmNewHash(1);

      const largeCalculationResult = INT128_MAX.subn(1)
        .mul(DECAY_RATE.NUMERATOR)
        .div(DECAY_RATE.DENOMINATOR);
      const decayKey = await ReputationMinerTestWrapper.getKey(metaColony.address, rootGlobalSkill, MAIN_ACCOUNT);
      const decimalValueDecay = new BN(goodClient.reputations[decayKey].slice(2, 66), 16);

      assert.equal(
        largeCalculationResult.toString(16, 64),
        goodClient.reputations[decayKey].slice(2, 66),
        `Incorrect decay. Actual value is ${decimalValueDecay}`
      );
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

    it("should insert reputation updates from the log", async () => {
      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING.muln(3));
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 4,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 1,
        workerRating: 1,
        evaluator: EVALUATOR,
        worker: accounts[3]
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 17 updates: 1 for the previous mining cycle and 4x4 for the tasks.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const activeLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(activeLogEntries.toNumber(), 17);

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      assert.equal(Object.keys(goodClient.reputations).length, 27);

      const GLOBAL_SKILL = new BN(1);
      const META_ROOT_SKILL = new BN(2);
      const MINING_SKILL = new BN(3);

      const META_ROOT_SKILL_TOTAL = REWARD.add(
        MANAGER_PAYOUT.add(EVALUATOR_PAYOUT)
          .add(WORKER_PAYOUT)
          .muln(3)
      )
        .add(new BN(1000000000))
        .sub(new BN(1000000000000))
        .sub(new BN(5000000000000));

      const reputationProps = [
        { id: 1, skill: META_ROOT_SKILL, account: undefined, value: META_ROOT_SKILL_TOTAL },
        { id: 2, skill: MINING_SKILL, account: undefined, value: REWARD },
        { id: 3, skill: META_ROOT_SKILL, account: MAIN_ACCOUNT, value: REWARD },
        { id: 4, skill: MINING_SKILL, account: MAIN_ACCOUNT, value: REWARD },
        // Completing 3 standard tasks
        {
          id: 5,
          skill: META_ROOT_SKILL,
          account: MANAGER,
          value: MANAGER_PAYOUT.add(EVALUATOR_PAYOUT)
            .muln(3)
            .sub(new BN(1000000000000))
        },
        { id: 6, skill: META_ROOT_SKILL, account: WORKER, value: WORKER_PAYOUT.muln(3) },
        // TODO: This next check needs to be updated once colony wide reputation is fixed for child updates
        // It needs to NOT deduct anything from the global skill rep as the user had 0 rep in the child skill
        { id: 7, skill: GLOBAL_SKILL, account: undefined, value: WORKER_PAYOUT.muln(3).sub(new BN(5000000000000)) },
        { id: 8, skill: GLOBAL_SKILL, account: WORKER, value: WORKER_PAYOUT.muln(3) },
        // Completing a task in skill 4
        { id: 9, skill: MINING_SKILL, account: MANAGER, value: new BN(0) },
        { id: 10, skill: META_ROOT_SKILL, account: EVALUATOR, value: new BN(1000000000) },
        { id: 11, skill: MINING_SKILL, account: accounts[3], value: new BN(0) },
        { id: 12, skill: META_ROOT_SKILL, account: accounts[3], value: new BN(0) },
        { id: 13, skill: new BN(5), account: undefined, value: new BN(0) },
        { id: 14, skill: new BN(6), account: undefined, value: new BN(0) },
        { id: 15, skill: new BN(7), account: undefined, value: new BN(0) },
        { id: 16, skill: new BN(8), account: undefined, value: new BN(0) },
        { id: 17, skill: new BN(9), account: undefined, value: new BN(0) },
        { id: 18, skill: new BN(10), account: undefined, value: new BN(0) },
        { id: 19, skill: new BN(4), account: undefined, value: new BN(0) },
        { id: 20, skill: new BN(5), account: accounts[3], value: new BN(0) },
        { id: 21, skill: new BN(6), account: accounts[3], value: new BN(0) },
        { id: 22, skill: new BN(7), account: accounts[3], value: new BN(0) },
        { id: 23, skill: new BN(8), account: accounts[3], value: new BN(0) },
        { id: 24, skill: new BN(9), account: accounts[3], value: new BN(0) },
        { id: 25, skill: new BN(10), account: accounts[3], value: new BN(0) },
        { id: 26, skill: GLOBAL_SKILL, account: accounts[3], value: new BN(0) },
        { id: 27, skill: new BN(4), account: accounts[3], value: new BN(0) }
      ];

      reputationProps.forEach(reputationProp => {
        const key = makeReputationKey(metaColony.address, reputationProp.skill, reputationProp.account);
        const value = makeReputationValue(reputationProp.value, reputationProp.id);
        const decimalValue = new BN(goodClient.reputations[key].slice(2, 66), 16);
        assert.equal(goodClient.reputations[key], value.toString(), `${reputationProp.id} failed. Actual value is ${decimalValue}`);
      });
    });

    it("should correctly update child reputations", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MAIN_ACCOUNT, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clny, INITIAL_FUNDING);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      // Earn some reputation for manager and worker in first task, then do badly in second task and lose some of it
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 10,
        evaluator: EVALUATOR,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 5000000000000,
        managerRating: 3,
        workerRating: 3
      });

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 8,
        evaluator: EVALUATOR,
        managerPayout: 1000000000000,
        evaluatorPayout: 1000000000,
        workerPayout: 4200000000000,
        managerRating: 2,
        workerRating: 1
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the tasks.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(nInactiveLogEntries.toNumber(), 13);

      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      assert.equal(Object.keys(goodClient.reputations).length, 24);

      const GLOBAL_SKILL = new BN(1);
      const META_ROOT_SKILL = new BN(2);
      const MINING_SKILL = new BN(3);

      // = 1550000005802000000000
      const META_ROOT_SKILL_TOTAL = REWARD.add(MANAGER_PAYOUT)
        .add(EVALUATOR_PAYOUT)
        .add(WORKER_PAYOUT)
        .add(new BN(2500000000000)) // for last 2 tasks manager payouts = 1000000000000*1.5 + 1000000000000
        .add(new BN(2000000000)) // for last 2 tasks evaluator payouts = 1000000000 + 1000000000
        .add(new BN(3300000000000)); // for task worker payout = 5000000000000*1.5
      // deduct the worker payout from the poorly performed task -4200000000000
      // = 3300000000000

      const reputationProps = [
        { id: 1, skill: META_ROOT_SKILL, account: undefined, value: META_ROOT_SKILL_TOTAL },
        { id: 2, skill: MINING_SKILL, account: undefined, value: REWARD },
        { id: 3, skill: META_ROOT_SKILL, account: MAIN_ACCOUNT, value: REWARD },
        { id: 4, skill: MINING_SKILL, account: MAIN_ACCOUNT, value: REWARD },
        { id: 5, skill: META_ROOT_SKILL, account: MANAGER, value: MANAGER_PAYOUT.add(EVALUATOR_PAYOUT).add(new BN(2500000000000)) },
        { id: 6, skill: META_ROOT_SKILL, account: WORKER, value: WORKER_PAYOUT.add(new BN(3300000000000)) },
        { id: 7, skill: GLOBAL_SKILL, account: undefined, value: WORKER_PAYOUT.add(new BN(3300000000000)) },
        { id: 8, skill: GLOBAL_SKILL, account: WORKER, value: WORKER_PAYOUT.add(new BN(3300000000000)) },
        { id: 9, skill: META_ROOT_SKILL, account: EVALUATOR, value: new BN(2000000000) },
        { id: 10, skill: new BN(9), account: undefined, value: new BN(3300000000000) },
        { id: 11, skill: new BN(8), account: undefined, value: new BN(3300000000000) },
        { id: 12, skill: new BN(7), account: undefined, value: new BN(3300000000000) },
        { id: 13, skill: new BN(6), account: undefined, value: new BN(3300000000000) },
        { id: 14, skill: new BN(5), account: undefined, value: new BN(3300000000000) },
        { id: 15, skill: new BN(4), account: undefined, value: new BN(3300000000000) },
        { id: 16, skill: new BN(10), account: undefined, value: new BN(3300000000000) },
        { id: 17, skill: new BN(9), account: WORKER, value: new BN(3300000000000) },
        { id: 18, skill: new BN(8), account: WORKER, value: new BN(3300000000000) }, // 44% decrease
        { id: 19, skill: new BN(7), account: WORKER, value: new BN(3300000000000) },
        { id: 20, skill: new BN(6), account: WORKER, value: new BN(3300000000000) },
        { id: 21, skill: new BN(5), account: WORKER, value: new BN(3300000000000) },
        { id: 22, skill: new BN(4), account: WORKER, value: new BN(3300000000000) },
        { id: 23, skill: new BN(10), account: WORKER, value: new BN(3300000000000) },
        { id: 24, skill: MINING_SKILL, account: WORKER, value: 0 }
      ];

      reputationProps.forEach(reputationProp => {
        const key = makeReputationKey(metaColony.address, reputationProp.skill, reputationProp.account);
        const value = makeReputationValue(reputationProp.value, reputationProp.id);
        const decimalValue = new BN(goodClient.reputations[key].slice(2, 66), 16);
        assert.equal(goodClient.reputations[key], value.toString(), `${reputationProp.id} failed. Actual value is ${decimalValue}`);
      });
    });

    it("should correctly update parent reputations", async () => {
      // Make sure there's funding for the task
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
      // The update log should contain the person being rewarded for the previous update cycle,
      // and 2x4 reputation updates for the task completions (manager, worker (domain and skill), evaluator);
      // That's 9 in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const activeLogEntries = await repCycle.getReputationUpdateLogLength();
      assert.equal(activeLogEntries.toNumber(), 5);

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
        const decimalValue = new BN(goodClient.reputations[key].slice(2, 66), 16);
        assert.equal(goodClient.reputations[key], value, `${reputationProp.id} failed. Actual value is ${decimalValue}`);
      });
    });

    it("should cope if the wrong reputation transition is a distant parent", async () => {
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

      // Skill 4
      badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 40, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      const righthash = await goodClient.getRootHash();
      const wronghash = await badClient.getRootHash();
      assert.notEqual(righthash, wronghash, "Hashes from clients are equal, surprisingly");

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
      });
      await repCycle.confirmNewHash(1);
    });

    it("should allow a user to prove their reputation", async () => {
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

    it("should correctly decay a reputation to zero, and then 'decay' to zero in subsequent cycles", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, OTHER_ACCOUNT, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 1, new BN("10"));
      await badClient.initialise(colonyNetwork.address);

      const rootGlobalSkill = await colonyNetwork.getRootGlobalSkillId();
      const globalKey = await ReputationMinerTestWrapper.getKey(metaColony.address, rootGlobalSkill, ZERO_ADDRESS);
      const userKey = await ReputationMinerTestWrapper.getKey(metaColony.address, rootGlobalSkill, MAIN_ACCOUNT);

      await goodClient.insert(globalKey, new BN("1"), 0);
      await goodClient.insert(userKey, new BN("1"), 0);
      await badClient.insert(globalKey, new BN("1"), 0);
      await badClient.insert(userKey, new BN("1"), 0);

      const rootHash = await goodClient.getRootHash();

      await forwardTime(MINING_CYCLE_DURATION, this);
      let repCycle = await getActiveRepCycle(colonyNetwork);
      await repCycle.submitRootHash(rootHash, 2, "0x00", 10, { from: MAIN_ACCOUNT });
      await repCycle.confirmNewHash(0);

      const decayKey = await ReputationMinerTestWrapper.getKey(metaColony.address, rootGlobalSkill, MAIN_ACCOUNT);

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
      badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: OTHER_ACCOUNT }, 1, new BN("10"));
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

      // Check it 'decayed' from 0 to 0
      assert.equal(
        "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002",
        goodClient.reputations[decayKey]
      );
    });

    it.skip("should abort if a deposit did not complete correctly");
  });
});
