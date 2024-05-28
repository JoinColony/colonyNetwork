/* globals hre */

const path = require("path");
const BN = require("bn.js");
const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");

const { TruffleLoader } = require("../../packages/package-utils");
const { UINT256_MAX, DEFAULT_STAKE, INITIAL_FUNDING } = require("../../helpers/constants");
const {
  advanceMiningCycleNoContest,
  getActiveRepCycle,
  finishReputationMiningCycle,
  removeSubdomainLimit,
  getChainId,
} = require("../../helpers/test-helper");
const ReputationMinerTestWrapper = require("../../packages/reputation-miner/test/ReputationMinerTestWrapper");

const {
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  giveUserCLNYTokensAndStake,
  fundColonyWithTokens,
} = require("../../helpers/test-data-generator");

const useJsTree = true;

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const loader = new TruffleLoader({
  contractRoot: path.resolve(__dirname, "..", "..", "artifacts", "contracts"),
});

let colonyNetwork;
let metaColony;
let clnyToken;
let goodClient;
const domainSkills = {};
const realProviderPort = 8545;

const setupNewNetworkInstance = async (MINER1, MINER2) => {
  colonyNetwork = await setupColonyNetwork();
  ({ metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

  await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);
  await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

  const chainId = await getChainId();
  await metaColony.initialiseReputationMining(chainId, ethers.constants.HashZero, 0);
  // await colonyNetwork.startNextCycle();

  await removeSubdomainLimit(colonyNetwork); // Temporary for tests until we allow subdomain depth > 1

  // Initialise local skill: 3. Set up local skills tree 1 -> 4 -> 5
  //                                                       \-> 2
  await metaColony.addLocalSkill();
  await metaColony.addDomain(1, UINT256_MAX, 1);
  await metaColony.addDomain(1, 1, 2);
  // 1 -> M
  //   -> 2 -> 3

  for (let i = 1; i <= 3; i += 1) {
    const d = await metaColony.getDomain(i);
    domainSkills[i] = d.skillId;
  }
  goodClient = new ReputationMinerTestWrapper({ loader, realProviderPort, useJsTree, minerAddress: MINER1 });
};

hre.__SOLIDITY_COVERAGE_RUNNING
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

        await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(4));
      });

      afterEach(async () => {
        const reputationMiningGotClean = await finishReputationMiningCycle(colonyNetwork, this);
        if (!reputationMiningGotClean) await setupNewNetworkInstance(MINER1, MINER2);
      });

      describe("core functionality", () => {
        it("should correctly calculate increments and decrements in parent reputations", async () => {
          await metaColony.emitDomainReputationReward(3, OTHER, 100);
          // Skills in 1 / 5 / 6
          // OTHER: (100 / 100 / 100)

          await metaColony.emitDomainReputationReward(3, WORKER, 100);
          // WORKER: (100 / 100 / 100)
          // OTHER: (100 / 100 / 100)

          await metaColony.emitDomainReputationReward(2, OTHER, 900);
          // WORKER: (100 / 100 / 100)
          // OTHER: (1000 / 1000 / 100)

          await metaColony.emitDomainReputationReward(1, OTHER, 1000);
          // WORKER: (100 / 100 / 100)
          // OTHER: (2000 / 1000 / 100)

          await metaColony.emitDomainReputationPenalty(1, 2, 3, OTHER, -100);
          // WORKER: (100 / 100 / 100)
          // OTHER: (1900 / 900 / 0)

          await goodClient.resetDB();
          await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
          await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });

          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[3], WORKER)].slice(2, 66), 16),
          ).to.eq.BN(100);
          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[2], WORKER)].slice(2, 66), 16),
          ).to.eq.BN(100);
          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[2], WORKER)].slice(2, 66), 16),
          ).to.eq.BN(100);

          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[3], OTHER)].slice(2, 66), 16),
          ).to.eq.BN(0);
          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[2], OTHER)].slice(2, 66), 16),
          ).to.eq.BN(900);
          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[1], OTHER)].slice(2, 66), 16),
          ).to.eq.BN(1900);

          expect(
            new BN(
              goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[3], ethers.constants.AddressZero)].slice(
                2,
                66,
              ),
              16,
            ),
          ).to.eq.BN(100);
          expect(
            new BN(
              goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[2], ethers.constants.AddressZero)].slice(
                2,
                66,
              ),
              16,
            ),
          ).to.eq.BN(1000);
          expect(
            new BN(
              goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[1], ethers.constants.AddressZero)].slice(
                2,
                66,
              ),
              16,
            ),
          ).to.eq.BN(2000);
        });

        it("should correctly calculate decrements in child reputations", async () => {
          await metaColony.emitDomainReputationReward(3, OTHER, 100);
          // Skills in 1 / 5 / 6
          // OTHER: (100 / 100 / 100)

          await metaColony.emitDomainReputationReward(3, WORKER, 100);
          // WORKER: (100 / 100 / 100)
          // OTHER: (100 / 100 / 100)

          await metaColony.emitDomainReputationReward(2, OTHER, 900);
          // WORKER: (100 / 100 / 100)
          // OTHER: (1000 / 1000 / 100)

          await metaColony.emitDomainReputationPenalty(1, 1, 2, OTHER, -200);
          // WORKER: (100 / 100 / 100)
          // OTHER: (800 / 800 / 80)

          await goodClient.resetDB();
          await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
          await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });

          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[3], WORKER)].slice(2, 66), 16),
          ).to.eq.BN(100);
          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[2], WORKER)].slice(2, 66), 16),
          ).to.eq.BN(100);
          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[1], WORKER)].slice(2, 66), 16),
          ).to.eq.BN(100);

          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[3], OTHER)].slice(2, 66), 16),
          ).to.eq.BN(80);
          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[2], OTHER)].slice(2, 66), 16),
          ).to.eq.BN(800);
          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[1], OTHER)].slice(2, 66), 16),
          ).to.eq.BN(800);

          expect(
            new BN(
              goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[3], ethers.constants.AddressZero)].slice(
                2,
                66,
              ),
              16,
            ),
          ).to.eq.BN(180);
          expect(
            new BN(
              goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[2], ethers.constants.AddressZero)].slice(
                2,
                66,
              ),
              16,
            ),
          ).to.eq.BN(900);
          expect(
            new BN(
              goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[1], ethers.constants.AddressZero)].slice(
                2,
                66,
              ),
              16,
            ),
          ).to.eq.BN(900);
        });

        it("should correctly calculate decrements in child reputations if the user loses all reputation", async () => {
          await metaColony.emitDomainReputationReward(3, OTHER, 100);
          // Skills in 1 / 5 / 6
          // OTHER: (100 / 100 / 100)

          await metaColony.emitDomainReputationReward(3, WORKER, 100);
          // WORKER: (100 / 100 / 100)
          // OTHER: (100 / 100 / 100)

          await metaColony.emitDomainReputationReward(2, OTHER, 900);
          // WORKER: (100 / 100 / 100)
          // OTHER: (1000 / 1000 / 100)

          await metaColony.emitDomainReputationReward(1, OTHER, 500);
          // WORKER: (100 / 100 / 100)
          // OTHER: (1500 / 1000 / 100)

          await metaColony.emitDomainReputationPenalty(1, 1, 2, OTHER, -100000000);
          // WORKER: (100 / 100 / 100)
          // OTHER: (500 / 0 / 0)

          await goodClient.resetDB();
          await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
          await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });

          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[3], WORKER)].slice(2, 66), 16),
          ).to.eq.BN(100);
          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[2], WORKER)].slice(2, 66), 16),
          ).to.eq.BN(100);
          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[1], WORKER)].slice(2, 66), 16),
          ).to.eq.BN(100);

          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[3], OTHER)].slice(2, 66), 16),
          ).to.eq.BN(0);
          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[2], OTHER)].slice(2, 66), 16),
          ).to.eq.BN(0);
          expect(
            new BN(goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[1], OTHER)].slice(2, 66), 16),
          ).to.eq.BN(500);

          expect(
            new BN(
              goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[3], ethers.constants.AddressZero)].slice(
                2,
                66,
              ),
              16,
            ),
          ).to.eq.BN(100);
          expect(
            new BN(
              goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[2], ethers.constants.AddressZero)].slice(
                2,
                66,
              ),
              16,
            ),
          ).to.eq.BN(100);
          expect(
            new BN(
              goodClient.reputations[ReputationMinerTestWrapper.getKey(metaColony.address, domainSkills[1], ethers.constants.AddressZero)].slice(
                2,
                66,
              ),
              16,
            ),
          ).to.eq.BN(600);
        });
      });
    });
