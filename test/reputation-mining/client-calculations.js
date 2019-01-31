/* globals artifacts */
import path from "path";
import BN from "bn.js";

import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";

import { DEFAULT_STAKE, INITIAL_FUNDING, ZERO_ADDRESS } from "../../helpers/constants";
import { advanceMiningCycleNoContest, getActiveRepCycle, finishReputationMiningCycleAndWithdrawAllMinerStakes } from "../../helpers/test-helper";
import ReputationMinerTestWrapper from "../../packages/reputation-miner/test/ReputationMinerTestWrapper";

import {
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  giveUserCLNYTokensAndStake,
  setupFinalizedTask,
  fundColonyWithTokens
} from "../../helpers/test-data-generator";

const useJsTree = true;

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ITokenLocking = artifacts.require("ITokenLocking");

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "..", "build", "contracts")
});

const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

contract("Reputation mining - client reputation calculations", accounts => {
  const MINER1 = accounts[5];
  const MINER2 = accounts[6];

  let colonyNetwork;
  let tokenLocking;
  let metaColony;
  let clnyToken;
  let goodClient;

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

  describe("core functionality", () => {
    it("should correctly calculate increments and decrements in parent reputations", async () => {
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 5,
        workerPayout: 100,
        worker: MINER2
      });
      // Skills in 1 / 4 / 5
      // Miner 2: (100 / 100 / 100)

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 5,
        workerPayout: 100,
        worker: MINER1
      });
      // Miner 1: (100 / 100 / 100)
      // Miner 2: (100 / 100 / 100)

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 4,
        workerPayout: 900,
        worker: MINER2
      });
      // Miner 1: (100 / 100 / 100)
      // Miner 2: (1000 / 1000 / 100)

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 1,
        workerPayout: 1000,
        worker: MINER2
      });
      // Miner 1: (100 / 100 / 100)
      // Miner 2: (2000 / 1000 / 100)

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 5,
        workerPayout: 200,
        workerRating: 1,
        worker: MINER2
      });
      // Miner 1: (100 / 100 / 100)
      // Miner 2: (1900 / 900 / 0)

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });

      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 5, MINER1)].slice(2, 66), 16), 100);
      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 4, MINER1)].slice(2, 66), 16), 100);
      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 1, MINER1)].slice(2, 66), 16), 100);

      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 5, MINER2)].slice(2, 66), 16), 0);
      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 4, MINER2)].slice(2, 66), 16), 900);
      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 1, MINER2)].slice(2, 66), 16), 1900);

      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 5, ZERO_ADDRESS)].slice(2, 66), 16), 100);
      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 4, ZERO_ADDRESS)].slice(2, 66), 16), 1000);
      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 1, ZERO_ADDRESS)].slice(2, 66), 16), 2000);
    });

    it("should correctly calculate decrements in child reputations", async () => {
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 5,
        workerPayout: 100,
        worker: MINER2
      });
      // Skills in 1 / 4 / 5
      // Miner 2: (100 / 100 / 100)

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 5,
        workerPayout: 100,
        worker: MINER1
      });
      // Miner 1: (100 / 100 / 100)
      // Miner 2: (100 / 100 / 100)

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 4,
        workerPayout: 900,
        worker: MINER2
      });
      // Miner 1: (100 / 100 / 100)
      // Miner 2: (1000 / 1000 / 100)

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 4,
        workerPayout: 200,
        workerRating: 1,
        worker: MINER2
      });
      // Miner 1: (100 / 100 / 100)
      // Miner 2: (800 / 800 / 80)

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });

      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 5, MINER1)].slice(2, 66), 16), 100);
      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 4, MINER1)].slice(2, 66), 16), 100);
      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 1, MINER1)].slice(2, 66), 16), 100);

      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 5, MINER2)].slice(2, 66), 16), 80);
      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 4, MINER2)].slice(2, 66), 16), 800);
      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 1, MINER2)].slice(2, 66), 16), 800);

      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 5, ZERO_ADDRESS)].slice(2, 66), 16), 180);
      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 4, ZERO_ADDRESS)].slice(2, 66), 16), 900);
      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 1, ZERO_ADDRESS)].slice(2, 66), 16), 900);
    });

    it("should correctly calculate decrements in child reputations if the user loses all reputation", async () => {
      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 5,
        workerPayout: 100,
        worker: MINER2
      });
      // Skills in 1 / 4 / 5
      // Miner 2: (100 / 100 / 100)

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 5,
        workerPayout: 100,
        worker: MINER1
      });
      // Miner 1: (100 / 100 / 100)
      // Miner 2: (100 / 100 / 100)

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 4,
        workerPayout: 900,
        worker: MINER2
      });
      // Miner 1: (100 / 100 / 100)
      // Miner 2: (1000 / 1000 / 100)

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 1,
        workerPayout: 500,
        worker: MINER2
      });
      // Miner 1: (100 / 100 / 100)
      // Miner 2: (1500 / 1000 / 100)

      await setupFinalizedTask({
        colonyNetwork,
        colony: metaColony,
        skillId: 4,
        workerPayout: 100000000,
        workerRating: 1,
        worker: MINER2
      });
      // Miner 1: (100 / 100 / 100)
      // Miner 2: (500 / 0 / 0)

      await goodClient.resetDB();
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });

      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 5, MINER1)].slice(2, 66), 16), 100);
      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 4, MINER1)].slice(2, 66), 16), 100);
      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 1, MINER1)].slice(2, 66), 16), 100);

      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 5, MINER2)].slice(2, 66), 16), 0);
      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 4, MINER2)].slice(2, 66), 16), 0);
      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 1, MINER2)].slice(2, 66), 16), 500);

      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 5, ZERO_ADDRESS)].slice(2, 66), 16), 100);
      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 4, ZERO_ADDRESS)].slice(2, 66), 16), 100);
      assert.equal(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 1, ZERO_ADDRESS)].slice(2, 66), 16), 600);
    });
  });
});
