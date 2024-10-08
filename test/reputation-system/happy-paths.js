/* globals artifacts */

const path = require("path");
const BN = require("bn.js");
const { ethers } = require("ethers");
const chai = require("chai");
const bnChai = require("bn-chai");

const { TruffleLoader } = require("../../packages/package-utils");
const {
  forwardTime,
  submitAndForwardTimeToDispute,
  runBinarySearch,
  getActiveRepCycle,
  advanceMiningCycleNoContest,
  accommodateChallengeAndInvalidateHash,
  finishReputationMiningCycle,
  makeReputationKey,
  makeReputationValue,
  removeSubdomainLimit,
  checkErrorRevert,
  getChainId,
  getMultichainSkillId,
} = require("../../helpers/test-helper");

const {
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  giveUserCLNYTokensAndStake,
  setupClaimedExpenditure,
  fundColonyWithTokens,
} = require("../../helpers/test-data-generator");

const {
  UINT256_MAX,
  DEFAULT_STAKE,
  INITIAL_FUNDING,
  MINING_CYCLE_DURATION,
  REWARD,
  INT128_MAX,
  DECAY_RATE,
  MANAGER_PAYOUT,
  EVALUATOR_PAYOUT,
  WORKER_PAYOUT,
  CHALLENGE_RESPONSE_WINDOW_DURATION,
  ADDRESS_ZERO,
  XDAI_CHAINID,
  FORKED_XDAI_CHAINID,
} = require("../../helpers/constants");

const ReputationMinerTestWrapper = require("../../packages/reputation-miner/test/ReputationMinerTestWrapper");
const MaliciousReputationMinerExtraRep = require("../../packages/reputation-miner/test/MaliciousReputationMinerExtraRep");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");

const loader = new TruffleLoader({
  contractRoot: path.resolve(__dirname, "..", "..", "artifacts", "contracts"),
});

const useJsTree = true;

let colonyNetwork;
let metaColony;
let clnyToken;
let localSkillId;
let miningSkillId;
let metaRootSkillId;
let chainId;
let goodClient;
const realProviderPort = 8545;

const setupNewNetworkInstance = async (MINER1, MINER2) => {
  colonyNetwork = await setupColonyNetwork();
  ({ metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

  await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);
  await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);
  chainId = await getChainId();
  await metaColony.initialiseReputationMining(chainId, ethers.constants.HashZero, 0);

  await metaColony.addLocalSkill();
  localSkillId = await colonyNetwork.getSkillCount();
  const miningChainId = parseInt(process.env.MINING_CHAIN_ID, 10) || chainId;

  if (chainId !== miningChainId) {
    throw Error("Test suite doesn't support this configuration yet");
  }
  if (chainId === XDAI_CHAINID || chainId === FORKED_XDAI_CHAINID) {
    expect(localSkillId).to.eq.BN(4);
  } else {
    expect(localSkillId.shln(128).mod(UINT256_MAX).shrn(128)).to.eq.BN(4);
  }

  // Temporary for tests until we allow subdomain depth > 1
  await removeSubdomainLimit(colonyNetwork);

  // Initialise 8-level domain skills tree: 1 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11
  await metaColony.addDomain(1, UINT256_MAX, 1);
  await metaColony.addDomain(1, 1, 2);
  await metaColony.addDomain(1, 2, 3);
  await metaColony.addDomain(1, 3, 4);
  await metaColony.addDomain(1, 4, 5);
  await metaColony.addDomain(1, 5, 6);
  await metaColony.addDomain(1, 6, 7);

  const domainCount = await metaColony.getDomainCount();
  const latestDomain = await metaColony.getDomain(domainCount);
  expect(latestDomain.skillId).to.eq.BN(getMultichainSkillId(chainId, 11).toString());

  miningSkillId = await colonyNetwork.getReputationMiningSkillId();
  const metaDomain1 = await metaColony.getDomain(1);
  metaRootSkillId = metaDomain1.skillId;

  goodClient = new ReputationMinerTestWrapper({ loader, realProviderPort, useJsTree, minerAddress: MINER1 });
};

contract("Reputation Mining - happy paths", (accounts) => {
  const MANAGER = accounts[0];
  const EVALUATOR = accounts[1];
  const WORKER = accounts[2];

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

    // Burn MAIN_ACCOUNTS accumulated mining rewards.
    const userBalance = await clnyToken.balanceOf(MINER1);
    await clnyToken.burn(userBalance, { from: MINER1 });

    await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(4));
  });

  afterEach(async () => {
    const reputationMiningGotClean = await finishReputationMiningCycle(colonyNetwork, this);
    if (!reputationMiningGotClean) await setupNewNetworkInstance(MINER1, MINER2);
  });

  describe("when executing intended behaviours", () => {
    it("should be able to get the number of submissions per hash", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nSubmissions = await repCycle.getNSubmissionsForHash("0x0", 0, "0x0");
      expect(nSubmissions).to.be.zero;
    });

    it("should cope with many hashes being submitted and eliminated before a winner is assigned", async function manySubmissionTest() {
      // TODO: This test probably needs to be written more carefully to make sure all possible edge cases are dealt with
      for (let i = 3; i < 11; i += 1) {
        await giveUserCLNYTokensAndStake(colonyNetwork, accounts[i], DEFAULT_STAKE);
        // These have to be done sequentially because this function uses the total number of tasks as a proxy for getting the
        // right taskId, so if they're all created at once it messes up.
      }
      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(30));

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const clients = await Promise.all(
        accounts.slice(3, 11).map(async (addr, index) => {
          const entryToFalsify = 7 - index;
          const amountToFalsify = index; // NB The first client is 'bad', but told to get the calculation wrong by 0, so is actually good.
          const client = new MaliciousReputationMinerExtraRep(
            { loader, realProviderPort, useJsTree, minerAddress: addr },
            entryToFalsify,
            amountToFalsify,
          );
          // Each client will get a different reputation update entry wrong by a different amount, apart from the first one which
          // will submit a correct hash.
          await client.initialise(colonyNetwork.address);
          return client;
        }),
      );

      // We need to complete the current reputation cycle so that all the required log entries are present
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: clients[0] });

      await clients[0].saveCurrentState();
      const savedHash = await clients[0].reputationTree.getRootHash();
      await Promise.all(clients.map(async (client) => client.loadState(savedHash)));
      await submitAndForwardTimeToDispute(clients, this);

      // Round 1
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[0], clients[1], {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" },
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[2], clients[3], {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" },
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[4], clients[5], {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" },
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[6], clients[7], {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" },
      });

      // Round 2
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[0], clients[2], {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" },
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[4], clients[6], {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" },
      });

      // Round 3
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, clients[0], clients[4], {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" },
      });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(3, { from: MINER1 });
    });

    it("should be able to process a large reputation update log", async function largeReputationLogTest() {
      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(30));
      // TODO It would be so much better if we could do these in parallel, but until colonyNetwork#192 is fixed, we can't.
      for (let i = 0; i < 30; i += 1) {
        // Manager, evaluator, worker
        await metaColony.emitDomainReputationReward(1, MANAGER, 1);
        await metaColony.emitDomainReputationReward(1, MANAGER, 1);
        await metaColony.emitDomainReputationReward(1, WORKER, 1);
        await metaColony.emitSkillReputationReward(localSkillId, WORKER, 1);
      }

      console.log("Finished setting up tasks for test");

      // Complete two reputation cycles to process the log
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });
      await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, test: this });
    });

    // eslint-disable-next-line max-len
    it("should be able to process a large reputation update log even if it's using the solidity patricia tree", async function largeReputationLogTestSolidity() {
      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(30));
      // TODO It would be so much better if we could do these in parallel, but until colonyNetwork#192 is fixed, we can't.
      for (let i = 0; i < 30; i += 1) {
        // Manager, evaluator, worker
        await metaColony.emitDomainReputationReward(1, MANAGER, 1);
        await metaColony.emitDomainReputationReward(1, MANAGER, 1);
        await metaColony.emitDomainReputationReward(1, WORKER, 1);
        await metaColony.emitSkillReputationReward(localSkillId, WORKER, 1);
      }

      console.log("Finished setting up tasks for test");

      // Complete two reputation cycles to process the log
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });
      const goodClientSolidityTree = new ReputationMinerTestWrapper({ loader, realProviderPort, useJsTree: false, minerAddress: MINER1 });
      await goodClientSolidityTree.initialise(colonyNetwork.address);
      await goodClientSolidityTree.resetDB();

      await advanceMiningCycleNoContest({ colonyNetwork, client: goodClientSolidityTree, test: this });
    });

    it("should allow submitted hashes to go through multiple responses to a challenge", async () => {
      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 1, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await runBinarySearch(goodClient, badClient);

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await forwardTime(MINING_CYCLE_DURATION / 6, this);
      await goodClient.respondToChallenge();
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.invalidateHash(0, 1, { from: MINER1 });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("should cope if someone's existing reputation would go negative, setting it to zero instead", async function noNegativeRep() {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

      // Create reputation
      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(3));
      await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, skillId: localSkillId, worker: MINER1 });
      await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, skillId: localSkillId, worker: MINER2 });

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 29, 0xffffffffffff);
      await badClient.initialise(colonyNetwork.address);

      // Send rep to 0
      // Manager, evaluator, worker
      await metaColony.emitDomainReputationPenalty(1, UINT256_MAX, 1, MANAGER, -1000000000000);
      await metaColony.emitDomainReputationReward(1, MANAGER, 1000000000);
      await metaColony.emitDomainReputationPenalty(1, UINT256_MAX, 1, WORKER, -1000000000000);
      await metaColony.emitSkillReputationPenalty(localSkillId, WORKER, -1000000000000);

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decreased-reputation-value-incorrect" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("should cope if someone's new reputation would be negative, setting it to zero instead", async function newRepToZeroTest() {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(3));
      await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, skillId: localSkillId, worker: MINER1 });
      await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, skillId: localSkillId, worker: MINER2 });

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 31, 0xffffffffffff);
      await badClient.initialise(colonyNetwork.address);

      // Manager, evaluator, worker
      await metaColony.emitDomainReputationPenalty(1, UINT256_MAX, 1, MANAGER, -1000000000000);
      await metaColony.emitDomainReputationReward(1, MANAGER, 1000000000);
      await metaColony.emitDomainReputationPenalty(1, UINT256_MAX, 1, accounts[4], -1000000000000);
      await metaColony.emitSkillReputationPenalty(localSkillId, accounts[4], -1000000000000);

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decreased-reputation-value-incorrect" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("should cope if someone's reputation would overflow, setting it to the maximum value instead", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(2));
      await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, skillId: localSkillId, worker: MINER1 });
      await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, skillId: localSkillId, worker: MINER2 });

      const bigPayout = new BN("10").pow(new BN("38"));

      const badClient = new MaliciousReputationMinerExtraRep(
        { loader, realProviderPort, useJsTree, minerAddress: MINER2 },
        29,
        bigPayout.muln(2).neg(),
      );
      await badClient.initialise(colonyNetwork.address);

      let repCycle = await getActiveRepCycle(colonyNetwork);
      const skillId = localSkillId;
      const globalKey = ReputationMinerTestWrapper.getKey(metaColony.address, skillId, ethers.constants.AddressZero);
      const userKey = ReputationMinerTestWrapper.getKey(metaColony.address, skillId, MINER1);

      await goodClient.insert(globalKey, INT128_MAX.subn(1), 0);
      await goodClient.insert(userKey, INT128_MAX.subn(1), 0);
      await badClient.insert(globalKey, INT128_MAX.subn(1), 0);
      await badClient.insert(userKey, INT128_MAX.subn(1), 0);

      const rootHash = await goodClient.getRootHash();
      await fundColonyWithTokens(metaColony, clnyToken, bigPayout.muln(4));

      // Manager, evaluator, worker
      await metaColony.emitDomainReputationReward(1, MANAGER, bigPayout.divn(2).muln(3));
      await metaColony.emitDomainReputationReward(1, MANAGER, bigPayout);
      await metaColony.emitDomainReputationReward(1, MINER1, bigPayout.divn(2).muln(3));
      await metaColony.emitSkillReputationReward(localSkillId, MINER1, bigPayout.divn(2).muln(3));

      await forwardTime(MINING_CYCLE_DURATION + CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.submitRootHash(rootHash, 2, "0x00", 10, { from: MINER1 });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(0, { from: MINER1 });

      repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-reputation-not-max-int128" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("should calculate reputation decays correctly if they are large", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 1, new BN("10"));
      await badClient.initialise(colonyNetwork.address);

      const skillId = localSkillId;
      const globalKey = ReputationMinerTestWrapper.getKey(metaColony.address, skillId, ethers.constants.AddressZero);
      const userKey = ReputationMinerTestWrapper.getKey(metaColony.address, skillId, MINER1);

      await goodClient.insert(globalKey, INT128_MAX.subn(1), 0);
      await goodClient.insert(userKey, INT128_MAX.subn(1), 0);
      await badClient.insert(globalKey, INT128_MAX.subn(1), 0);
      await badClient.insert(userKey, INT128_MAX.subn(1), 0);

      const rootHash = await goodClient.getRootHash();
      let repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION + CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.submitRootHash(rootHash, 2, "0x00", 10, { from: MINER1 });
      await repCycle.confirmNewHash(0, { from: MINER1 });

      repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });

      const largeCalculationResult = INT128_MAX.subn(1).mul(DECAY_RATE.NUMERATOR).div(DECAY_RATE.DENOMINATOR);
      const decayKey = ReputationMinerTestWrapper.getKey(metaColony.address, skillId, MINER1);
      const decimalValueDecay = new BN(goodClient.reputations[decayKey].slice(2, 66), 16);

      expect(largeCalculationResult.toString(16, 64), `Incorrect decay. Actual value is ${decimalValueDecay}`).to.equal(
        goodClient.reputations[decayKey].slice(2, 66),
      );
    });

    it("should keep reputation updates that occur during one update window for the next window", async () => {
      // Creates an entry in the reputation log for the worker and manager
      await fundColonyWithTokens(metaColony, clnyToken);
      await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, skillId: localSkillId });

      let addr = await colonyNetwork.getReputationMiningCycle(false);
      let inactiveReputationMiningCycle = await IReputationMiningCycle.at(addr);
      const initialRepLogLength = await inactiveReputationMiningCycle.getReputationUpdateLogLength();

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // This confirmation should freeze the reputation log that we added the above task entries to and move it to the inactive rep log
      const repCycle = await getActiveRepCycle(colonyNetwork);
      expect(inactiveReputationMiningCycle.address).to.equal(repCycle.address);

      const finalRepLogLength = await repCycle.getReputationUpdateLogLength();
      expect(finalRepLogLength).to.eq.BN(initialRepLogLength);

      // Check the active log now has one entry in it (which will be the rewards for the miner who submitted
      // the accepted hash.
      addr = await colonyNetwork.getReputationMiningCycle(false);
      inactiveReputationMiningCycle = await IReputationMiningCycle.at(addr);

      const activeRepLogLength = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      expect(activeRepLogLength).to.eq.BN(1);
    });

    it("should insert reputation updates from the log", async () => {
      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(3));
      await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, skillId: localSkillId }); // 4 entries each
      await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, skillId: localSkillId });
      await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, skillId: localSkillId });

      // Manager, evaluator, worker
      await metaColony.emitDomainReputationPenalty(1, 1, 2, MANAGER, -1000000000000);
      await metaColony.emitDomainReputationReward(2, EVALUATOR, 1000000000);
      await metaColony.emitDomainReputationPenalty(1, 1, 2, accounts[3], -5000000000000);
      await metaColony.emitSkillReputationPenalty(localSkillId, accounts[3], -5000000000000);

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 17 updates: 1 for the previous mining cycle and 4x4 for the expenditures.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const activeLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(activeLogEntries).to.eq.BN(17);

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      expect(Object.keys(goodClient.reputations).length).to.equal(36);

      const rootLocalSkillId = await metaColony.getRootLocalSkill();

      const META_ROOT_SKILL_TOTAL = REWARD // eslint-disable-line prettier/prettier
        .add(MANAGER_PAYOUT.add(EVALUATOR_PAYOUT).add(WORKER_PAYOUT).muln(3)) // eslint-disable-line prettier/prettier
        .add(new BN(1000000000));
      // .sub(new BN(1000000000000)); // Manager cannot lose skill they never had
      // .sub(new BN(5000000000000)); // Worker cannot lose skill they never had

      const reputationProps = [
        // Reputation for the miner
        { id: 1, skill: metaRootSkillId, account: undefined, value: META_ROOT_SKILL_TOTAL },
        { id: 2, skill: miningSkillId, account: undefined, value: REWARD },
        { id: 3, skill: metaRootSkillId, account: MINER1, value: REWARD },
        { id: 4, skill: miningSkillId, account: MINER1, value: REWARD },

        // Completing 3 claimed expenditures
        { id: 5, skill: metaRootSkillId, account: MANAGER, value: MANAGER_PAYOUT.add(EVALUATOR_PAYOUT).muln(3) },
        { id: 6, skill: metaRootSkillId, account: WORKER, value: WORKER_PAYOUT.muln(3) },
        { id: 7, skill: rootLocalSkillId, account: undefined, value: WORKER_PAYOUT.muln(3) },
        { id: 8, skill: localSkillId, account: undefined, value: WORKER_PAYOUT.muln(3) },
        { id: 9, skill: rootLocalSkillId, account: WORKER, value: WORKER_PAYOUT.muln(3) },
        { id: 10, skill: localSkillId, account: WORKER, value: WORKER_PAYOUT.muln(3) },

        // Manual reputation updates, rewards flow up and penalties flow down
        { id: 11, skill: getMultichainSkillId(chainId, 6), account: undefined, value: new BN(0) },
        { id: 12, skill: getMultichainSkillId(chainId, 7), account: undefined, value: new BN(0) },
        { id: 13, skill: getMultichainSkillId(chainId, 8), account: undefined, value: new BN(0) },
        { id: 14, skill: getMultichainSkillId(chainId, 9), account: undefined, value: new BN(0) },
        { id: 15, skill: getMultichainSkillId(chainId, 10), account: undefined, value: new BN(0) },
        { id: 16, skill: getMultichainSkillId(chainId, 11), account: undefined, value: new BN(0) },
        { id: 17, skill: getMultichainSkillId(chainId, 5), account: undefined, value: new BN(1000000000) },
        { id: 18, skill: getMultichainSkillId(chainId, 6), account: MANAGER, value: new BN(0) },
        { id: 19, skill: getMultichainSkillId(chainId, 7), account: MANAGER, value: new BN(0) },
        { id: 20, skill: getMultichainSkillId(chainId, 8), account: MANAGER, value: new BN(0) },
        { id: 21, skill: getMultichainSkillId(chainId, 9), account: MANAGER, value: new BN(0) },
        { id: 22, skill: getMultichainSkillId(chainId, 10), account: MANAGER, value: new BN(0) },
        { id: 23, skill: getMultichainSkillId(chainId, 11), account: MANAGER, value: new BN(0) },
        { id: 24, skill: getMultichainSkillId(chainId, 5), account: MANAGER, value: new BN(0) },
        { id: 25, skill: metaRootSkillId, account: EVALUATOR, value: new BN(1000000000) },
        { id: 26, skill: getMultichainSkillId(chainId, 5), account: EVALUATOR, value: new BN(1000000000) },
        { id: 27, skill: getMultichainSkillId(chainId, 6), account: accounts[3], value: new BN(0) },
        { id: 28, skill: getMultichainSkillId(chainId, 7), account: accounts[3], value: new BN(0) },
        { id: 29, skill: getMultichainSkillId(chainId, 8), account: accounts[3], value: new BN(0) },
        { id: 30, skill: getMultichainSkillId(chainId, 9), account: accounts[3], value: new BN(0) },
        { id: 31, skill: getMultichainSkillId(chainId, 10), account: accounts[3], value: new BN(0) },
        { id: 32, skill: getMultichainSkillId(chainId, 11), account: accounts[3], value: new BN(0) },
        { id: 33, skill: metaRootSkillId, account: accounts[3], value: new BN(0) },
        { id: 34, skill: getMultichainSkillId(chainId, 5), account: accounts[3], value: new BN(0) },
        { id: 35, skill: rootLocalSkillId, account: accounts[3], value: new BN(0) },
        { id: 36, skill: localSkillId, account: accounts[3], value: new BN(0) },
      ];

      expect(Object.keys(goodClient.reputations).length).to.equal(reputationProps.length);

      reputationProps.forEach((reputationProp) => {
        const key = makeReputationKey(metaColony.address, reputationProp.skill, reputationProp.account);
        const value = makeReputationValue(reputationProp.value, reputationProp.id);
        const decimalValue = new BN(goodClient.reputations[key].slice(2, 66), 16);
        expect(
          goodClient.reputations[key],
          `${reputationProp.id} failed. Actual value is ${decimalValue}, and expected ${reputationProp.value}`,
        ).to.eq.BN(value);
      });
    });

    it("should correctly update child reputations", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING);
      await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, skillId: localSkillId });

      // Earn some reputation for manager and worker in first task, then do badly in second task and lose some of it

      // Manager, evaluator, worker
      await metaColony.emitDomainReputationReward(8, MANAGER, 1500000000000);
      await metaColony.emitDomainReputationReward(8, EVALUATOR, 1000000000);
      await metaColony.emitDomainReputationReward(8, WORKER, 7500000000000);
      await metaColony.emitSkillReputationReward(localSkillId, WORKER, 7500000000000);

      // Manager, evaluator, worker
      await metaColony.emitDomainReputationReward(6, MANAGER, 1000000000000);
      await metaColony.emitDomainReputationReward(6, EVALUATOR, 1000000000);
      await metaColony.emitDomainReputationPenalty(1, 5, 6, WORKER, -4200000000000);
      await metaColony.emitSkillReputationPenalty(localSkillId, WORKER, -4200000000000);

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the tasks.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nInactiveLogEntries).to.eq.BN(13);

      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      expect(Object.keys(goodClient.reputations).length).to.equal(39);

      // = 1550000005802000000000
      const META_ROOT_SKILL_TOTAL = REWARD.add(MANAGER_PAYOUT)
        .add(EVALUATOR_PAYOUT)
        .add(WORKER_PAYOUT)
        .add(new BN(2500000000000)) // for last 2 tasks manager payouts = 1000000000000*1.5 + 1000000000000
        .add(new BN(2000000000)) // for last 2 tasks evaluator payouts = 1000000000 + 1000000000
        .add(new BN(3300000000000)); // for task worker payout = 5000000000000*1.5
      // deduct the worker payout from the poorly performed task -4200000000000
      // = 3300000000000

      const rootLocalSkillId = await metaColony.getRootLocalSkill();

      const reputationProps = [
        // Reputation for the miner
        { id: 1, skill: metaRootSkillId, account: undefined, value: META_ROOT_SKILL_TOTAL },
        { id: 2, skill: miningSkillId, account: undefined, value: REWARD },
        { id: 3, skill: metaRootSkillId, account: MINER1, value: REWARD },
        { id: 4, skill: miningSkillId, account: MINER1, value: REWARD },

        { id: 5, skill: metaRootSkillId, account: MANAGER, value: MANAGER_PAYOUT.add(EVALUATOR_PAYOUT).add(new BN(2500000000000)) },
        { id: 6, skill: metaRootSkillId, account: WORKER, value: WORKER_PAYOUT.add(new BN(3300000000000)) },
        { id: 7, skill: rootLocalSkillId, account: undefined, value: WORKER_PAYOUT.add(new BN(3300000000000)) },
        { id: 8, skill: localSkillId, account: undefined, value: WORKER_PAYOUT.add(new BN(3300000000000)) },
        { id: 9, skill: rootLocalSkillId, account: WORKER, value: WORKER_PAYOUT.add(new BN(3300000000000)) },
        { id: 10, skill: localSkillId, account: WORKER, value: WORKER_PAYOUT.add(new BN(3300000000000)) },
        {
          id: 11,
          skill: getMultichainSkillId(chainId, 10),
          account: undefined,
          value: new BN(1500000000000).add(new BN(7500000000000)).add(new BN(1000000000)).sub(new BN(4200000000000)),
        },
        {
          id: 12,
          skill: getMultichainSkillId(chainId, 9),
          account: undefined,
          value: new BN(1500000000000)
            .add(new BN(7500000000000))
            .add(new BN(1000000000))
            .sub(new BN(4200000000000))
            .add(new BN(1000000000000))
            .add(new BN(1000000000)),
        },
        {
          id: 13,
          skill: getMultichainSkillId(chainId, 8),
          account: undefined,
          value: new BN(1500000000000)
            .add(new BN(7500000000000))
            .add(new BN(1000000000))
            .sub(new BN(4200000000000))
            .add(new BN(1000000000000))
            .add(new BN(1000000000)),
        },
        {
          id: 14,
          skill: getMultichainSkillId(chainId, 7),
          account: undefined,
          value: new BN(1500000000000)
            .add(new BN(7500000000000))
            .add(new BN(1000000000))
            .sub(new BN(4200000000000))
            .add(new BN(1000000000000))
            .add(new BN(1000000000)),
        },
        {
          id: 15,
          skill: getMultichainSkillId(chainId, 6),
          account: undefined,
          value: new BN(1500000000000)
            .add(new BN(7500000000000))
            .add(new BN(1000000000))
            .sub(new BN(4200000000000))
            .add(new BN(1000000000000))
            .add(new BN(1000000000)),
        },
        {
          id: 16,
          skill: getMultichainSkillId(chainId, 5),
          account: undefined,
          value: new BN(1500000000000)
            .add(new BN(7500000000000))
            .add(new BN(1000000000))
            .sub(new BN(4200000000000))
            .add(new BN(1000000000000))
            .add(new BN(1000000000)),
        },
        {
          id: 17,
          skill: getMultichainSkillId(chainId, 11),
          account: undefined,
          value: new BN(1500000000000).add(new BN(7500000000000)).add(new BN(1000000000)).sub(new BN(4200000000000)),
        },
        { id: 18, skill: getMultichainSkillId(chainId, 10), account: MANAGER, value: new BN(1500000000000) },
        { id: 19, skill: getMultichainSkillId(chainId, 9), account: MANAGER, value: new BN(2500000000000) },
        { id: 20, skill: getMultichainSkillId(chainId, 8), account: MANAGER, value: new BN(2500000000000) },
        { id: 21, skill: getMultichainSkillId(chainId, 7), account: MANAGER, value: new BN(2500000000000) },
        { id: 22, skill: getMultichainSkillId(chainId, 6), account: MANAGER, value: new BN(2500000000000) },
        { id: 23, skill: getMultichainSkillId(chainId, 5), account: MANAGER, value: new BN(2500000000000) },
        { id: 24, skill: getMultichainSkillId(chainId, 11), account: MANAGER, value: new BN(1500000000000) },
        { id: 25, skill: getMultichainSkillId(chainId, 10), account: EVALUATOR, value: new BN(1000000000) },
        { id: 26, skill: getMultichainSkillId(chainId, 9), account: EVALUATOR, value: new BN(2000000000) },
        { id: 27, skill: getMultichainSkillId(chainId, 8), account: EVALUATOR, value: new BN(2000000000) },
        { id: 28, skill: getMultichainSkillId(chainId, 7), account: EVALUATOR, value: new BN(2000000000) },
        { id: 29, skill: getMultichainSkillId(chainId, 6), account: EVALUATOR, value: new BN(2000000000) },
        { id: 30, skill: getMultichainSkillId(chainId, 5), account: EVALUATOR, value: new BN(2000000000) },
        { id: 31, skill: metaRootSkillId, account: EVALUATOR, value: new BN(2000000000) },
        { id: 32, skill: getMultichainSkillId(chainId, 11), account: EVALUATOR, value: new BN(1000000000) },
        { id: 33, skill: getMultichainSkillId(chainId, 10), account: WORKER, value: new BN(3300000000000) },
        { id: 34, skill: getMultichainSkillId(chainId, 9), account: WORKER, value: new BN(3300000000000) },
        { id: 35, skill: getMultichainSkillId(chainId, 8), account: WORKER, value: new BN(3300000000000) },
        { id: 36, skill: getMultichainSkillId(chainId, 7), account: WORKER, value: new BN(3300000000000) },
        { id: 37, skill: getMultichainSkillId(chainId, 6), account: WORKER, value: new BN(3300000000000) },
        { id: 38, skill: getMultichainSkillId(chainId, 5), account: WORKER, value: new BN(3300000000000) },
        { id: 39, skill: getMultichainSkillId(chainId, 11), account: WORKER, value: new BN(3300000000000) },
      ];

      expect(Object.keys(goodClient.reputations).length).to.equal(reputationProps.length);

      reputationProps.forEach((reputationProp) => {
        const key = makeReputationKey(metaColony.address, reputationProp.skill, reputationProp.account);
        const value = makeReputationValue(reputationProp.value, reputationProp.id);
        const decimalValue = new BN(goodClient.reputations[key].slice(2, 66), 16);
        expect(goodClient.reputations[key], `${reputationProp.id} failed. Actual value is ${decimalValue}`).to.eq.BN(value);
      });
    });

    it("should correctly update parent reputations", async () => {
      // Make sure there's funding for the task
      await fundColonyWithTokens(metaColony, clnyToken);

      // Do the task
      await setupClaimedExpenditure({
        colonyNetwork,
        colony: metaColony,
        domainId: 8,
        skillId: localSkillId,
        manager: MANAGER,
        evaluator: EVALUATOR,
        worker: WORKER,
      });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 5 updates: 1 for the previous mining cycle and 4 for the task.
      // The update log should contain the person being rewarded for the previous update cycle,
      // and 2x4 reputation updates for the task completions (manager, worker (domain and skill), evaluator);
      // That's 9 in total.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const activeLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(activeLogEntries).to.eq.BN(5);

      await goodClient.addLogContentsToReputationTree();

      const rootLocalSkillId = await metaColony.getRootLocalSkill();

      const reputationProps = [
        { id: 1, skillId: metaRootSkillId, account: undefined, value: REWARD.add(MANAGER_PAYOUT).add(EVALUATOR_PAYOUT).add(WORKER_PAYOUT) }, // eslint-disable-line prettier/prettier
        { id: 2, skillId: miningSkillId, account: undefined, value: REWARD },
        { id: 3, skillId: metaRootSkillId, account: MINER1, value: REWARD },
        { id: 4, skillId: miningSkillId, account: MINER1, value: REWARD },
        { id: 5, skillId: getMultichainSkillId(chainId, 10), account: undefined, value: WORKER_PAYOUT.add(MANAGER_PAYOUT).add(EVALUATOR_PAYOUT) },
        { id: 6, skillId: getMultichainSkillId(chainId, 9), account: undefined, value: WORKER_PAYOUT.add(MANAGER_PAYOUT).add(EVALUATOR_PAYOUT) },
        { id: 7, skillId: getMultichainSkillId(chainId, 8), account: undefined, value: WORKER_PAYOUT.add(MANAGER_PAYOUT).add(EVALUATOR_PAYOUT) },
        { id: 8, skillId: getMultichainSkillId(chainId, 7), account: undefined, value: WORKER_PAYOUT.add(MANAGER_PAYOUT).add(EVALUATOR_PAYOUT) },
        { id: 9, skillId: getMultichainSkillId(chainId, 6), account: undefined, value: WORKER_PAYOUT.add(MANAGER_PAYOUT).add(EVALUATOR_PAYOUT) },
        { id: 10, skillId: getMultichainSkillId(chainId, 5), account: undefined, value: WORKER_PAYOUT.add(MANAGER_PAYOUT).add(EVALUATOR_PAYOUT) },
        { id: 11, skillId: getMultichainSkillId(chainId, 11), account: undefined, value: WORKER_PAYOUT.add(MANAGER_PAYOUT).add(EVALUATOR_PAYOUT) },
        { id: 12, skillId: getMultichainSkillId(chainId, 10), account: MANAGER, value: MANAGER_PAYOUT },
        { id: 13, skillId: getMultichainSkillId(chainId, 9), account: MANAGER, value: MANAGER_PAYOUT },
        { id: 14, skillId: getMultichainSkillId(chainId, 8), account: MANAGER, value: MANAGER_PAYOUT },
        { id: 15, skillId: getMultichainSkillId(chainId, 7), account: MANAGER, value: MANAGER_PAYOUT },
        { id: 16, skillId: getMultichainSkillId(chainId, 6), account: MANAGER, value: MANAGER_PAYOUT },
        { id: 17, skillId: getMultichainSkillId(chainId, 5), account: MANAGER, value: MANAGER_PAYOUT },
        { id: 18, skillId: metaRootSkillId, account: MANAGER, value: MANAGER_PAYOUT },
        { id: 19, skillId: getMultichainSkillId(chainId, 11), account: MANAGER, value: MANAGER_PAYOUT },
        { id: 20, skillId: getMultichainSkillId(chainId, 10), account: EVALUATOR, value: EVALUATOR_PAYOUT },
        { id: 21, skillId: getMultichainSkillId(chainId, 9), account: EVALUATOR, value: EVALUATOR_PAYOUT },
        { id: 22, skillId: getMultichainSkillId(chainId, 8), account: EVALUATOR, value: EVALUATOR_PAYOUT },
        { id: 23, skillId: getMultichainSkillId(chainId, 7), account: EVALUATOR, value: EVALUATOR_PAYOUT },
        { id: 24, skillId: getMultichainSkillId(chainId, 6), account: EVALUATOR, value: EVALUATOR_PAYOUT },
        { id: 25, skillId: getMultichainSkillId(chainId, 5), account: EVALUATOR, value: EVALUATOR_PAYOUT },
        { id: 26, skillId: metaRootSkillId, account: EVALUATOR, value: EVALUATOR_PAYOUT },
        { id: 27, skillId: getMultichainSkillId(chainId, 11), account: EVALUATOR, value: EVALUATOR_PAYOUT },
        { id: 28, skillId: getMultichainSkillId(chainId, 10), account: WORKER, value: WORKER_PAYOUT },
        { id: 29, skillId: getMultichainSkillId(chainId, 9), account: WORKER, value: WORKER_PAYOUT },
        { id: 30, skillId: getMultichainSkillId(chainId, 8), account: WORKER, value: WORKER_PAYOUT },
        { id: 31, skillId: getMultichainSkillId(chainId, 7), account: WORKER, value: WORKER_PAYOUT },
        { id: 32, skillId: getMultichainSkillId(chainId, 6), account: WORKER, value: WORKER_PAYOUT },
        { id: 33, skillId: getMultichainSkillId(chainId, 5), account: WORKER, value: WORKER_PAYOUT },
        { id: 34, skillId: metaRootSkillId, account: WORKER, value: WORKER_PAYOUT },
        { id: 35, skillId: getMultichainSkillId(chainId, 11), account: WORKER, value: WORKER_PAYOUT },
        { id: 36, skillId: rootLocalSkillId, account: undefined, value: WORKER_PAYOUT },
        { id: 37, skillId: localSkillId, account: undefined, value: WORKER_PAYOUT },
        { id: 38, skillId: rootLocalSkillId, account: WORKER, value: WORKER_PAYOUT },
        { id: 39, skillId: localSkillId, account: WORKER, value: WORKER_PAYOUT },
      ];

      expect(Object.keys(goodClient.reputations).length).to.equal(reputationProps.length);

      reputationProps.forEach((reputationProp) => {
        const key = makeReputationKey(metaColony.address, new BN(reputationProp.skillId.toString()), reputationProp.account);
        const value = makeReputationValue(reputationProp.value, reputationProp.id);
        const decimalValue = new BN(goodClient.reputations[key].slice(2, 66), 16);
        expect(goodClient.reputations[key], `${reputationProp.id} failed. Actual value is ${decimalValue}`).to.eq.BN(value);
      });
    });

    it("should cope if the wrong reputation transition is a distant parent", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(3));
      await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, skillId: localSkillId });
      await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, skillId: localSkillId });
      await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, skillId: localSkillId, domainId: 8 });

      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      // Should be 13 updates: 1 for the previous mining cycle and 3x4 for the tasks.
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(nInactiveLogEntries).to.eq.BN(13);

      // Skill 4
      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 40, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);

      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("should allow a user to prove their reputation", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await goodClient.addLogContentsToReputationTree();
      const newRootHash = await goodClient.getRootHash();

      await forwardTime(MINING_CYCLE_DURATION + CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      const repCycle = await getActiveRepCycle(colonyNetwork);

      await repCycle.submitRootHash(newRootHash, 10, "0x00", 10, { from: MINER1 });
      await repCycle.confirmNewHash(0, { from: MINER1 });

      const key = makeReputationKey(metaColony.address, miningSkillId, MINER1);
      const value = goodClient.reputations[key];
      const [branchMask, siblings] = await goodClient.getProof(key);
      // Checking all good parameters confirms a good proof
      let isValid = await metaColony.verifyReputationProof(key, value, branchMask, siblings, { from: MINER1 });
      expect(isValid).to.be.true;

      // Check using a bad key confirms an invalid proof
      const badKey = makeReputationKey("0xdeadbeef", miningSkillId, MINER1);
      isValid = await metaColony.verifyReputationProof(badKey, value, branchMask, siblings, { from: MINER1 });
      expect(isValid).to.be.false;

      // Check using a bad value confirms an invalid proof
      const badValue = makeReputationValue(new BN("12345678"), "123");
      isValid = await metaColony.verifyReputationProof(key, badValue, branchMask, siblings, { from: MINER1 });
      expect(isValid).to.be.false;

      // Check using a bad user confirms an invalid proof
      isValid = await metaColony.verifyReputationProof(key, value, branchMask, siblings, { from: MINER2 });
      expect(isValid).to.be.false;

      // Check using a bad branchmask confirms an invalid proof
      isValid = await metaColony.verifyReputationProof(key, value, 123, siblings, { from: MINER1 });
      expect(isValid).to.be.false;

      // Check using bad siblings confirms an invalid proof
      isValid = await metaColony.verifyReputationProof(
        key,
        value,
        branchMask,
        ["0xbfb84f69f3b58ba43019d6e253d476669af78901fe05eaedfc98ed345dbd8221"],
        { from: MINER1 },
      );
      expect(isValid).to.be.false;
    });

    it("should correctly decay a reputation to zero, and then 'decay' to zero in subsequent cycles", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 1, new BN("10"));
      await badClient.initialise(colonyNetwork.address);

      const skillId = new BN(1);
      const globalKey = ReputationMinerTestWrapper.getKey(metaColony.address, skillId, ethers.constants.AddressZero);
      const userKey = ReputationMinerTestWrapper.getKey(metaColony.address, skillId, MINER1);

      await goodClient.insert(globalKey, new BN("1"), 0);
      await goodClient.insert(userKey, new BN("1"), 0);
      await badClient.insert(globalKey, new BN("1"), 0);
      await badClient.insert(userKey, new BN("1"), 0);

      const rootHash = await goodClient.getRootHash();

      await forwardTime(MINING_CYCLE_DURATION + CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      let repCycle = await getActiveRepCycle(colonyNetwork);
      await repCycle.submitRootHash(rootHash, 2, "0x00", 10, { from: MINER1 });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(0, { from: MINER1 });

      // Check we have exactly one reputation.
      expect(
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
      ).to.equal(goodClient.reputations[userKey]);

      repCycle = await getActiveRepCycle(colonyNetwork);
      await submitAndForwardTimeToDispute([goodClient, badClient], this);
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      await goodClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-decay-incorrect" },
      });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });

      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

      // Check it decayed from 1 to 0.
      expect(
        "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002",
      ).to.equal(goodClient.reputations[userKey]);

      // If we use the existing badClient we get `Error: invalid BigNumber value`, not sure why.
      await badClient.initialise(colonyNetwork.address);
      await badClient.resetDB();

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

      // Check it 'decayed' from 0 to 0
      expect(
        "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002",
      ).to.equal(goodClient.reputations[userKey]);
    });

    it("a miner using delegated mining should be able to go through the whole process", async () => {
      const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, 1, 0xfffffffff);
      await badClient.initialise(colonyNetwork.address);
      const delegatedClient = new ReputationMinerTestWrapper({ loader, realProviderPort, useJsTree, minerAddress: WORKER });
      await colonyNetwork.setMiningDelegate(WORKER, true, { from: MINER1 });
      await delegatedClient.initialise(colonyNetwork.address);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const addr = await colonyNetwork.getReputationMiningCycle(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(MINING_CYCLE_DURATION + CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.submitRootHash("0x00", 0, "0x00", 10, { from: WORKER });
      await repCycle.confirmNewHash(0, { from: MINER1 });

      repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await delegatedClient.addLogContentsToReputationTree();
      await delegatedClient.submitRootHash();
      await badClient.addLogContentsToReputationTree();
      await badClient.submitRootHash();

      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      await delegatedClient.confirmJustificationRootHash();
      await badClient.confirmJustificationRootHash();

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

      await delegatedClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();

      await runBinarySearch(delegatedClient, badClient);

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await delegatedClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      // Cleanup
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await delegatedClient.respondToChallenge();
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.invalidateHash(0, 1, { from: MINER1 });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(1, { from: MINER1 });
    });

    it("a miner can set a delegate", async () => {
      await colonyNetwork.setMiningDelegate(WORKER, true, { from: MINER1 });
      const delegator = await colonyNetwork.getMiningDelegator(WORKER);
      expect(delegator).to.equal(MINER1);
    });

    it("a mining delegate cannot be stolen", async () => {
      await colonyNetwork.setMiningDelegate(WORKER, true, { from: MINER1 });
      await checkErrorRevert(colonyNetwork.setMiningDelegate(WORKER, true, { from: MINER2 }), "colony-reputation-mining-not-your-delegate");
    });

    it("a mining delegate can be removed", async () => {
      await colonyNetwork.setMiningDelegate(WORKER, true, { from: MINER1 });
      await colonyNetwork.setMiningDelegate(WORKER, false, { from: MINER1 });
      const delegator = await colonyNetwork.getMiningDelegator(WORKER);
      expect(delegator).to.equal(ADDRESS_ZERO);
    });
  });
});
