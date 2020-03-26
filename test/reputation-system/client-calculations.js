import path from "path";
import BN from "bn.js";
import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";

import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";

import { DEFAULT_STAKE, INITIAL_FUNDING, GLOBAL_SKILL_ID } from "../../helpers/constants";
import { advanceMiningCycleNoContest, getActiveRepCycle, finishReputationMiningCycle, removeSubdomainLimit } from "../../helpers/test-helper";
import ReputationMinerTestWrapper from "../../packages/reputation-miner/test/ReputationMinerTestWrapper";

import {
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  giveUserCLNYTokensAndStake,
  setupFinalizedTask,
  fundColonyWithTokens,
} from "../../helpers/test-data-generator";

const useJsTree = true;

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "../..", "build", "contracts"),
});

let colonyNetwork;
let metaColony;
let clnyToken;
let goodClient;
const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

const setupNewNetworkInstance = async (MINER1, MINER2) => {
  colonyNetwork = await setupColonyNetwork();
  ({ metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

  await removeSubdomainLimit(colonyNetwork); // Temporary for tests until we allow subdomain depth > 1

  // Initialise global skill: 3. Set up local skills tree 1 -> 4 -> 5
  //                                                       \-> 2
  await metaColony.addDomain(1, 0, 1);
  await metaColony.addDomain(1, 1, 2);

  await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);
  await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);
  await colonyNetwork.initialiseReputationMining();
  await colonyNetwork.startNextCycle();

  goodClient = new ReputationMinerTestWrapper({ loader, realProviderPort, useJsTree, minerAddress: MINER1 });
};

async function customSetupFinalizedTask(args) {
  const newArgs = Object.assign(args, {
    skillId: GLOBAL_SKILL_ID,
    evaluatorPayout: 0,
    managerPayout: 0,
  });
  return setupFinalizedTask(newArgs);
}

process.env.SOLIDITY_COVERAGE
  ? contract.skip
  : contract("Reputation mining - client reputation calculations", (accounts) => {
      const MINER1 = accounts[5];
      const MINER2 = accounts[6];
      const WORKER = accounts[2];
      const OTHER = accounts[3];

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

      describe("core functionality", () => {
        it("should correctly calculate increments and decrements in parent reputations", async () => {
          await customSetupFinalizedTask({
            colonyNetwork,
            colony: metaColony,
            workerPayout: 100,
            worker: OTHER,
            domainId: 3,
          });
          // Skills in 1 / 4 / 5
          // OTHER: (100 / 100 / 100)

          await customSetupFinalizedTask({
            colonyNetwork,
            colony: metaColony,
            workerPayout: 100,
            worker: WORKER,
            domainId: 3,
          });
          // WORKER: (100 / 100 / 100)
          // OTHER: (100 / 100 / 100)

          await customSetupFinalizedTask({
            colonyNetwork,
            colony: metaColony,
            workerPayout: 900,
            worker: OTHER,
            domainId: 2,
          });
          // WORKER: (100 / 100 / 100)
          // OTHER: (1000 / 1000 / 100)

          await customSetupFinalizedTask({
            colonyNetwork,
            colony: metaColony,
            workerPayout: 1000,
            worker: OTHER,
            domainId: 1,
          });
          // WORKER: (100 / 100 / 100)
          // OTHER: (2000 / 1000 / 100)

          await customSetupFinalizedTask({
            colonyNetwork,
            colony: metaColony,
            workerPayout: 200,
            workerRating: 1,
            worker: OTHER,
            domainId: 3,
          });
          // WORKER: (100 / 100 / 100)
          // OTHER: (1900 / 900 / 0)

          await goodClient.resetDB();
          await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
          await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });

          expect(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 5, WORKER)].slice(2, 66), 16)).to.eq.BN(100);
          expect(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 4, WORKER)].slice(2, 66), 16)).to.eq.BN(100);
          expect(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 1, WORKER)].slice(2, 66), 16)).to.eq.BN(100);

          expect(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 5, OTHER)].slice(2, 66), 16)).to.eq.BN(0);
          expect(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 4, OTHER)].slice(2, 66), 16)).to.eq.BN(900);
          expect(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 1, OTHER)].slice(2, 66), 16)).to.eq.BN(1900);

          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 5, ethers.constants.AddressZero)].slice(2, 66), 16)
          ).to.eq.BN(100);
          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 4, ethers.constants.AddressZero)].slice(2, 66), 16)
          ).to.eq.BN(1000);
          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 1, ethers.constants.AddressZero)].slice(2, 66), 16)
          ).to.eq.BN(2000);
        });

        it("should correctly calculate decrements in child reputations", async () => {
          await customSetupFinalizedTask({
            colonyNetwork,
            colony: metaColony,
            workerPayout: 100,
            worker: OTHER,
            domainId: 3,
          });
          // Skills in 1 / 4 / 5
          // OTHER: (100 / 100 / 100)

          await customSetupFinalizedTask({
            colonyNetwork,
            colony: metaColony,
            workerPayout: 100,
            worker: WORKER,
            domainId: 3,
          });
          // WORKER: (100 / 100 / 100)
          // OTHER: (100 / 100 / 100)

          await customSetupFinalizedTask({
            colonyNetwork,
            colony: metaColony,
            workerPayout: 900,
            worker: OTHER,
            domainId: 2,
          });
          // WORKER: (100 / 100 / 100)
          // THER: (1000 / 1000 / 100)

          await customSetupFinalizedTask({
            colonyNetwork,
            colony: metaColony,
            workerPayout: 200,
            workerRating: 1,
            worker: OTHER,
            domainId: 2,
          });
          // WORKER: (100 / 100 / 100)
          // OTHER: (800 / 800 / 80)

          await goodClient.resetDB();
          await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
          await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });

          expect(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 5, WORKER)].slice(2, 66), 16)).to.eq.BN(100);
          expect(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 4, WORKER)].slice(2, 66), 16)).to.eq.BN(100);
          expect(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 1, WORKER)].slice(2, 66), 16)).to.eq.BN(100);

          expect(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 5, OTHER)].slice(2, 66), 16)).to.eq.BN(80);
          expect(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 4, OTHER)].slice(2, 66), 16)).to.eq.BN(800);
          expect(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 1, OTHER)].slice(2, 66), 16)).to.eq.BN(800);

          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 5, ethers.constants.AddressZero)].slice(2, 66), 16)
          ).to.eq.BN(180);
          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 4, ethers.constants.AddressZero)].slice(2, 66), 16)
          ).to.eq.BN(900);
          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 1, ethers.constants.AddressZero)].slice(2, 66), 16)
          ).to.eq.BN(900);
        });

        it("should correctly calculate decrements in child reputations if the user loses all reputation", async () => {
          await customSetupFinalizedTask({
            colonyNetwork,
            colony: metaColony,
            workerPayout: 100,
            worker: OTHER,
            domainId: 3,
          });
          // Skills in 1 / 4 / 5
          // OTHER: (100 / 100 / 100)

          await customSetupFinalizedTask({
            colonyNetwork,
            colony: metaColony,
            workerPayout: 100,
            worker: WORKER,
            domainId: 3,
          });
          // WORKER: (100 / 100 / 100)
          // OTHER: (100 / 100 / 100)

          await customSetupFinalizedTask({
            colonyNetwork,
            colony: metaColony,
            workerPayout: 900,
            worker: OTHER,
            domainId: 2,
          });
          // WORKER: (100 / 100 / 100)
          // OTHER: (1000 / 1000 / 100)

          await customSetupFinalizedTask({
            colonyNetwork,
            colony: metaColony,
            workerPayout: 500,
            worker: OTHER,
            domainId: 1,
          });
          // WORKER: (100 / 100 / 100)
          // OTHER: (1500 / 1000 / 100)

          await customSetupFinalizedTask({
            colonyNetwork,
            colony: metaColony,
            workerPayout: 100000000,
            workerRating: 1,
            worker: OTHER,
            domainId: 2,
          });
          // WORKER: (100 / 100 / 100)
          // OTHER: (500 / 0 / 0)

          await goodClient.resetDB();
          await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
          await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });

          expect(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 5, WORKER)].slice(2, 66), 16)).to.eq.BN(100);
          expect(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 4, WORKER)].slice(2, 66), 16)).to.eq.BN(100);
          expect(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 1, WORKER)].slice(2, 66), 16)).to.eq.BN(100);

          expect(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 5, OTHER)].slice(2, 66), 16)).to.eq.BN(0);
          expect(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 4, OTHER)].slice(2, 66), 16)).to.eq.BN(0);
          expect(new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 1, OTHER)].slice(2, 66), 16)).to.eq.BN(500);

          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 5, ethers.constants.AddressZero)].slice(2, 66), 16)
          ).to.eq.BN(100);
          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 4, ethers.constants.AddressZero)].slice(2, 66), 16)
          ).to.eq.BN(100);
          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, 1, ethers.constants.AddressZero)].slice(2, 66), 16)
          ).to.eq.BN(600);
        });
      });
    });
