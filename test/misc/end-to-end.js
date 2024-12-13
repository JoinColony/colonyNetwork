const path = require("path");
const BN = require("bn.js");
const chai = require("chai");
const bnChai = require("bn-chai");
const ethers = require("ethers");

const { artifacts } = require("hardhat");
const { TruffleLoader } = require("../../packages/package-utils");
const {
  submitAndForwardTimeToDispute,
  getActiveRepCycle,
  advanceMiningCycleNoContest,
  accommodateChallengeAndInvalidateHash,
  makeReputationKey,
  makeReputationValue,
  removeSubdomainLimit,
  getChainId,
  forwardTime,
  revert,
  snapshot,
} = require("../../helpers/test-helper");

const {
  giveUserCLNYTokensAndStake,
  setupRandomColony,
  fundColonyWithTokens,
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  setupClaimedExpenditure,
} = require("../../helpers/test-data-generator");

const { DEFAULT_STAKE, INITIAL_FUNDING, UINT256_MAX, CHALLENGE_RESPONSE_WINDOW_DURATION } = require("../../helpers/constants");

const ReputationMinerTestWrapper = require("../../packages/reputation-miner/test/ReputationMinerTestWrapper");
const MaliciousReputationMinerExtraRep = require("../../packages/reputation-miner/test/MaliciousReputationMinerExtraRep");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ITokenLocking = artifacts.require("ITokenLocking");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");

const loader = new TruffleLoader({
  contractRoot: path.resolve(__dirname, "..", "..", "artifacts", "contracts"),
});

const useJsTree = true;

contract("End to end Colony network and Reputation mining testing", function (accounts) {
  const MANAGER = accounts[1]; // 0x9df24e73f40b2a911eb254a8825103723e13209c
  const EVALUATOR = accounts[2]; // 0x27ff0c145e191c22c75cd123c679c3e1f58a4469
  const WORKER = accounts[3]; // 0x0021cb24d7d4e669120b139030095315dfa6699a
  const MINER1 = accounts[5]; // 0x3a965407ced5e62c5ad71de491ce7b23da5331a4
  const MINER2 = accounts[6]; // 0x9f485401a3c22529ab6ea15e2ebd5a8ca54a5430

  let metaColony;
  let colonyNetwork;
  let tokenLocking;
  let clnyToken;
  let goodClient;
  const realProviderPort = 8545;
  let colonies;

  before(async function () {
    // Setup a new network instance as we'll be modifying the global skills tree
    colonyNetwork = await setupColonyNetwork();
    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await ITokenLocking.at(tokenLockingAddress);
    ({ metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

    // Replace addDomain with the addDomain implementation with no restrictions on depth of subdomains
    await removeSubdomainLimit(colonyNetwork);

    await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);
    await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

    const chainId = await getChainId();
    await metaColony.initialiseReputationMining(chainId, ethers.constants.HashZero, 0);

    // await colonyNetwork.initialiseReputationMining(chainId, ethers.constants.HashZero, 0);

    goodClient = new ReputationMinerTestWrapper({ loader, realProviderPort, useJsTree, minerAddress: MINER1 });
    await goodClient.initialise(colonyNetwork.address);
    await goodClient.resetDB();

    // Kick off reputation mining.
    const lock = await tokenLocking.getUserLock(clnyToken.address, MINER1);
    expect(lock.balance).to.eq.BN(DEFAULT_STAKE);

    // Advance two cycles to clear active and inactive state.
    await advanceMiningCycleNoContest({ colonyNetwork, test: this });
    await advanceMiningCycleNoContest({ colonyNetwork, test: this });

    // The inactive reputation log now has the reward for this miner, and the accepted state is empty.
    // This is the same starting point for all tests.
    const repCycle = await getActiveRepCycle(colonyNetwork);
    const reputationCycleNLogEntries = await repCycle.getReputationUpdateLogLength();
    expect(reputationCycleNLogEntries).to.eq.BN(1);
  });

  describe("when working with larger volumes", function () {
    it("can create 100 colonies", async function () {
      // Setup 100 random colonies, reward set to default 0%
      const a = Array.from(Array(100).keys());
      const coloniesSetupPromise = a.map(() => setupRandomColony(colonyNetwork));

      colonies = await Promise.all(coloniesSetupPromise);
      const colonyCount = await colonyNetwork.getColonyCount();
      expect(colonyCount).to.eq.BN(101);
    });

    it("can create 5 domains in each of the 100 colonies", async function () {
      const b = Array.from(Array(4).keys());
      const domainsSetupPromise = b.map(() => Promise.all(colonies.map(({ colony }) => colony.addDomain(1, UINT256_MAX, 1))));
      await Promise.all(domainsSetupPromise);

      const domainsCheckPromise = colonies.map(async ({ colony }) => {
        const domainCount = await colony.getDomainCount();
        expect(domainCount).to.eq.BN(5);
      });
      await Promise.all(domainsCheckPromise);
    });

    it("can create a set of global skills", async function () {
      let skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(703); // Ensure we're starting from the intended skill

      // Build a better balanced skills tree hierarchy we're going to use in reputation
      // Current skills tree is:
      // 1                                       // Local colonyId 1 (meta colony) root domain skill
      // 2                                       // Root local skill for colony 1
      // 3                                       // Reputation mining skill
      // 4 -> [304, 404, 504, 604]               // Local colonyId 2 domain skills
      // 5                                       // Root local skill for colony 2
      // 6 -> [305, 405, 505, 605]               // Local colonyId 3 domain skills
      // 7                                       // Root local skill for colony 3
      // 8 -> [306, 406, 506, 606]               // Local colonyId 4 domain skills
      // 9                                       // Root local skill for colony 4
      // 10 -> [307, 407, 507, 607]              // Local colonyId 5 domain skills
      // [...]                                   // Remaining colonies local (domain) skills and root local skills
      // Below update adds the following local (domain) skills in 3 new colonies
      // 704 -> [707, 708, 709]
      //              708 -> 709 -> [711, 712]
      //         707 -> 713
      // 714 -> [717, 718, 719]
      //              718 -> 720 -> [721, 722]
      //         717 -> 723
      // 724 -> [727, 728, 729]
      //              728 -> 730 -> [731, 732]
      //         727 -> 733
      for (let i = 0; i < 3; i += 1) {
        const { colony, token } = await setupRandomColony(colonyNetwork);
        // This creates skill 704/714/724 as the root domain skill
        // and 705/715/725 as the root local skill
        // and 706/716/726 as a (usable) local skill

        colonies.push({ colony, token });
        await colony.addDomain(1, UINT256_MAX, 1); // Add skillId 707,717 and 727, domain 2
        await colony.addDomain(1, UINT256_MAX, 1); // Add skillId 708,718 and 728, domain 3
        await colony.addDomain(1, UINT256_MAX, 1); // Add skillId 709,719 and 729, domain 4

        await colony.addDomain(1, 1, 3); // Add skillId 710,720 and 730, domain 5

        await colony.addDomain(1, 3, 5); // Add skillId 711,721 and 731, domain 6
        await colony.addDomain(1, 3, 5); // Add skillId 712,722 and 732, domain 7

        await colony.addDomain(1, 0, 2); // Add skillId 713,723 and 733, domain 8
      }
      skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(733);

      // Add 500 more skills which won't be used in reputation
      const s = Array.from(Array(500).keys());
      const skillsSetupPromise = s.map(() => metaColony.addLocalSkill());
      await Promise.all(skillsSetupPromise);

      skillCount = await colonyNetwork.getSkillCount();
      // 500 for the domain in each new colony + global skill + metaColony's 2 domain skills + 24 new ones we created
      expect(skillCount).to.eq.BN(1233);
    });

    it("can fund all colonies with own tokens", async function () {
      const fundColoniesPromise = colonies.map(({ colony, token }) => fundColonyWithTokens(colony, token, INITIAL_FUNDING.muln(10)));
      await Promise.all(fundColoniesPromise);
    });

    it("can create a range of tasks across colonies", async function () {
      const colonyExpenditurePositiveReputation = [
        {
          // Index in the colonies[] array (note that this excludes the meta colony)
          colonyIdx: 100,
          domainId: 5,
          managerPayout: 200,
          evaluatorPayout: 100,
          workerPayout: 700,
        },
        {
          colonyIdx: 100,
          domainId: 3,
          managerPayout: 20,
          evaluatorPayout: 10,
          workerPayout: 70,
        },
        {
          colonyIdx: 100,
          domainId: 2,
          managerPayout: 40,
          evaluatorPayout: 5,
          workerPayout: 800,
        },
        {
          colonyIdx: 100,
          domainId: 6,
          managerPayout: 20,
          evaluatorPayout: 10,
          workerPayout: 70,
        },
        {
          colonyIdx: 101,
          domainId: 5,
          managerPayout: 200,
          evaluatorPayout: 100,
          workerPayout: 700,
        },
        {
          colonyIdx: 102,
          domainId: 7,
          managerPayout: 200,
          evaluatorPayout: 100,
          workerPayout: 700,
        },
        {
          colonyIdx: 102,
          domainId: 1,
          managerPayout: 200,
          evaluatorPayout: 100,
          workerPayout: 300,
        },
      ];

      // Do the negative updates explicitely after the positive so they are guaranteed to appear later in the miner updates
      // Because of the async PromiseAll which triggers and completes task creation in a non-order specific
      // way we have to ensure reputation is deducted correctly
      const colonyExpenditureNegativeReputation = [
        {
          colonyIdx: 100,
          domainId: 1,
          managerPayout: 2,
          evaluatorPayout: 1,
          workerPayout: 7,
        },
        {
          colonyIdx: 102,
          domainId: 1,
          managerPayout: 200,
          evaluatorPayout: 100,
          workerPayout: 100,
        },
      ];

      await Promise.all(
        colonyExpenditurePositiveReputation.map(async (taskProp) => {
          const { colony } = colonies[taskProp.colonyIdx];

          await colony.setAdministrationRole(1, UINT256_MAX, MANAGER, 1, true);
          await colony.setFundingRole(1, UINT256_MAX, MANAGER, 1, true);

          await setupClaimedExpenditure({
            colonyNetwork,
            colony,
            domainId: taskProp.domainId,
            manager: MANAGER,
            evaluator: EVALUATOR,
            worker: WORKER,
            managerPayout: taskProp.managerPayout,
            evaluatorPayout: taskProp.evaluatorPayout,
            workerPayout: taskProp.workerPayout,
            managerRating: taskProp.managerRating,
            workerRating: taskProp.workerRating,
          });
        }),
      );

      await Promise.all(
        colonyExpenditureNegativeReputation.map(async (taskProp) => {
          const { colony } = colonies[taskProp.colonyIdx];

          await setupClaimedExpenditure({
            colonyNetwork,
            colony,
            domainId: taskProp.domainId,
            manager: MANAGER,
            evaluator: EVALUATOR,
            worker: WORKER,
            managerPayout: taskProp.managerPayout,
            evaluatorPayout: taskProp.evaluatorPayout,
            workerPayout: 0,
            managerRating: taskProp.managerRating,
          });

          const localSkillId = await colony.getRootLocalSkill();
          const rootLocalSkill = await colonyNetwork.getSkill(localSkillId);

          await colony.emitSkillReputationPenalty(rootLocalSkill.children[0], WORKER, -taskProp.workerPayout);
          const domain = await colony.getDomain(taskProp.domainId);
          const rootDomain = await colony.getDomain(1);
          let proof = UINT256_MAX;
          if (domain.skillId !== rootDomain.skillId) {
            const rootSkill = await colony.getSkill(rootDomain.skillId);
            proof = rootSkill.children.indexOf(domain.skillId);
          }
          await colony.emitDomainReputationPenalty(1, proof, taskProp.domainId, WORKER, -taskProp.workerPayout);
        }),
      );
    });

    it("can mine reputation for all tasks", async function () {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.saveCurrentState();
      await goodClient.addLogContentsToReputationTree();
      await goodClient.saveCurrentState();

      const globalReputations = [
        // ColonyIdx 100
        { id: 1, colonyIdx: 100, skillId: 706, account: undefined, value: 1633 },
        { id: 2, colonyIdx: 100, skillId: 704, account: undefined, value: 2041 },
        { id: 3, colonyIdx: 100, skillId: 707, account: undefined, value: 842 },
        { id: 4, colonyIdx: 100, skillId: 708, account: undefined, value: 1197 },
        { id: 5, colonyIdx: 100, skillId: 709, account: undefined, value: 0 },
        { id: 6, colonyIdx: 100, skillId: 710, account: undefined, value: 1097 },
        { id: 7, colonyIdx: 100, skillId: 711, account: undefined, value: 100 },
        { id: 8, colonyIdx: 100, skillId: 712, account: undefined, value: 0 },
        { id: 9, colonyIdx: 100, skillId: 713, account: undefined, value: 0 },

        { id: 11, colonyIdx: 100, skillId: 704, account: MANAGER, value: 282 },
        { id: 12, colonyIdx: 100, skillId: 707, account: MANAGER, value: 40 },
        { id: 10, colonyIdx: 100, skillId: 708, account: MANAGER, value: 240 },
        { id: 12, colonyIdx: 100, skillId: 710, account: MANAGER, value: 220 },
        { id: 14, colonyIdx: 100, skillId: 711, account: MANAGER, value: 20 },

        { id: 17, colonyIdx: 100, skillId: 704, account: EVALUATOR, value: 126 },
        { id: 19, colonyIdx: 100, skillId: 707, account: EVALUATOR, value: 5 },
        { id: 16, colonyIdx: 100, skillId: 708, account: EVALUATOR, value: 120 },
        { id: 18, colonyIdx: 100, skillId: 710, account: EVALUATOR, value: 110 },
        { id: 15, colonyIdx: 100, skillId: 711, account: EVALUATOR, value: 10 },

        { id: 20, colonyIdx: 100, skillId: 706, account: WORKER, value: 1633 },
        { id: 21, colonyIdx: 100, skillId: 704, account: WORKER, value: 1633 },
        { id: 22, colonyIdx: 100, skillId: 707, account: WORKER, value: 797 },
        { id: 23, colonyIdx: 100, skillId: 708, account: WORKER, value: 837 },
        { id: 24, colonyIdx: 100, skillId: 709, account: WORKER, value: 0 },
        { id: 25, colonyIdx: 100, skillId: 710, account: WORKER, value: 767 },
        { id: 26, colonyIdx: 100, skillId: 711, account: WORKER, value: 70 },
        { id: 27, colonyIdx: 100, skillId: 712, account: WORKER, value: 0 },
        { id: 28, colonyIdx: 100, skillId: 713, account: WORKER, value: 0 },

        // ColonyIdx 101
        { id: 29, colonyIdx: 101, skillId: 714, account: undefined, value: 1000 },
        { id: 30, colonyIdx: 101, skillId: 718, account: undefined, value: 1000 },
        { id: 31, colonyIdx: 101, skillId: 720, account: undefined, value: 1000 },
        { id: 32, colonyIdx: 101, skillId: 714, account: MANAGER, value: 200 },
        { id: 33, colonyIdx: 101, skillId: 718, account: MANAGER, value: 200 },
        { id: 34, colonyIdx: 101, skillId: 720, account: MANAGER, value: 200 },
        { id: 35, colonyIdx: 101, skillId: 714, account: EVALUATOR, value: 100 },
        { id: 36, colonyIdx: 101, skillId: 718, account: EVALUATOR, value: 100 },
        { id: 37, colonyIdx: 101, skillId: 720, account: EVALUATOR, value: 100 },
        { id: 38, colonyIdx: 101, skillId: 714, account: WORKER, value: 700 },
        { id: 39, colonyIdx: 101, skillId: 718, account: WORKER, value: 700 },
        { id: 40, colonyIdx: 101, skillId: 720, account: WORKER, value: 700 },
        { id: 41, colonyIdx: 101, skillId: 716, account: undefined, value: 700 },
        { id: 42, colonyIdx: 101, skillId: 716, account: WORKER, value: 700 },

        // ColonyIdx 102
        { id: 43, colonyIdx: 102, skillId: 726, account: undefined, value: 900 },
        { id: 44, colonyIdx: 102, skillId: 724, account: undefined, value: 1800 },
        { id: 45, colonyIdx: 102, skillId: 727, account: undefined, value: 0 },
        { id: 46, colonyIdx: 102, skillId: 728, account: undefined, value: 930 },
        { id: 47, colonyIdx: 102, skillId: 729, account: undefined, value: 0 },
        { id: 48, colonyIdx: 102, skillId: 730, account: undefined, value: 930 },
        { id: 49, colonyIdx: 102, skillId: 731, account: undefined, value: 0 },
        { id: 50, colonyIdx: 102, skillId: 732, account: undefined, value: 930 },
        { id: 51, colonyIdx: 102, skillId: 733, account: undefined, value: 0 },

        { id: 52, colonyIdx: 102, skillId: 724, account: MANAGER, value: 600 },
        { id: 53, colonyIdx: 102, skillId: 728, account: MANAGER, value: 200 },
        { id: 54, colonyIdx: 102, skillId: 730, account: MANAGER, value: 200 },
        { id: 55, colonyIdx: 102, skillId: 732, account: MANAGER, value: 200 },

        { id: 56, colonyIdx: 102, skillId: 724, account: EVALUATOR, value: 300 },
        { id: 57, colonyIdx: 102, skillId: 728, account: EVALUATOR, value: 100 },
        { id: 58, colonyIdx: 102, skillId: 730, account: EVALUATOR, value: 100 },
        { id: 59, colonyIdx: 102, skillId: 732, account: EVALUATOR, value: 100 },

        { id: 60, colonyIdx: 102, skillId: 726, account: WORKER, value: 900 },
        { id: 61, colonyIdx: 102, skillId: 724, account: WORKER, value: 900 },
        { id: 62, colonyIdx: 102, skillId: 727, account: WORKER, value: 0 },
        { id: 63, colonyIdx: 102, skillId: 728, account: WORKER, value: 630 },
        { id: 64, colonyIdx: 102, skillId: 729, account: WORKER, value: 0 },
        { id: 65, colonyIdx: 102, skillId: 730, account: WORKER, value: 630 },
        { id: 66, colonyIdx: 102, skillId: 731, account: WORKER, value: 0 },
        { id: 67, colonyIdx: 102, skillId: 732, account: WORKER, value: 630 },
        { id: 68, colonyIdx: 102, skillId: 733, account: WORKER, value: 0 },
      ];

      globalReputations.forEach((globalRep) => {
        const { colony } = colonies[globalRep.colonyIdx];
        const key = makeReputationKey(colony.address, new BN(globalRep.skillId), globalRep.account);
        const value = makeReputationValue(globalRep.value, globalRep.id);
        // Just check the reputation amount matches
        const decimalValueInClient = new BN(goodClient.reputations[key].slice(2, 66), 16);
        const decimalValueExpected = new BN(value.slice(2, 66), 16);
        expect(decimalValueInClient, `${globalRep.id} failed. Actual value is ${decimalValueInClient}`).to.eq.BN(decimalValueExpected);
      });
    });
  });

  describe("when there is a dispute over reputation root hash", function () {
    // These tests are useful for checking that every type of parent / child / user / colony-wide-sum skills are accounted for
    // correctly. Unsure if I should force them to be run every time.
    let snapshotId;
    let nDecays;
    beforeEach(async function () {
      console.log("Snapshotting");
      const p = new web3.eth.providers.HttpProvider("http://localhost:8545");

      snapshotId = await snapshot(p);
    });

    afterEach(async function () {
      const p = new web3.eth.providers.HttpProvider("http://localhost:8545");
      console.log("Reverting");
      await revert(p, snapshotId);
    });
    const N_TRANSITIONS = 198;
    const updates = Array.from(Array(N_TRANSITIONS).keys());

    const errors = [];

    before(async function () {
      nDecays = Object.keys(goodClient.previousReputations).length;
      for (let i = 0; i < nDecays; i += 1) {
        errors.push("colony-reputation-mining-decay-incorrect");
      }
      const miningCycleAddress = await colonyNetwork.getReputationMiningCycle(true);
      const miningCycle = await IReputationMiningCycle.at(miningCycleAddress);
      const updateLogLength = await miningCycle.getReputationUpdateLogLength();
      const lastUpdate = await miningCycle.getReputationUpdateLogEntry(updateLogLength - 1);
      const nUpdates = parseInt(lastUpdate.nUpdates, 10) + parseInt(lastUpdate.nPreviousUpdates, 10);
      if (N_TRANSITIONS !== nUpdates + nDecays) {
        console.error("Wrong number of updates, existing");
        process.exit(1);
      }
      for (let i = 0; i < updateLogLength; i += 1) {
        const update = await miningCycle.getReputationUpdateLogEntry(i);
        let error;
        if (new BN(update.amount).lt(new BN(0))) {
          error = "colony-reputation-mining-decreased-reputation-value-incorrect";
        } else {
          error = "colony-reputation-mining-increased-reputation-value-incorrect";
        }
        for (let j = 0; j < update.nUpdates; j += 1) {
          errors.push(error);
        }
      }
    });

    updates.forEach(async (badIndex) => {
      it(`should cope if wrong reputation transition is transition ${badIndex}`, async function advancingTest() {
        // await advanceMiningCycleNoContest({ colonyNetwork, test: this });
        // await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });

        const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, badIndex, 0xfffffffff);
        await badClient.initialise(colonyNetwork.address);

        const currentHash = await colonyNetwork.getReputationRootHash();

        // const savedHash = await goodClient.reputationTree.getRootHash();
        await badClient.loadState(currentHash);
        await goodClient.loadState(currentHash);

        await submitAndForwardTimeToDispute([goodClient, badClient], this);

        const righthash = await goodClient.getRootHash();
        const wronghash = await badClient.getRootHash();
        expect(righthash, "Hashes from clients are equal, surprisingly").to.not.eq.BN(wronghash);

        const repCycle = await getActiveRepCycle(colonyNetwork);

        const error = errors[badIndex];

        await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
          client2: { respondToChallenge: error },
        });
        await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
        await repCycle.confirmNewHash(1, { from: MINER1 });
      });
    });
  });
});
