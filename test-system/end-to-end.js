/* globals artifacts */

const path = require("path");
const BN = require("bn.js");
const chai = require("chai");
const bnChai = require("bn-chai");

const { TruffleLoader } = require("../packages/package-utils");
const {
  submitAndForwardTimeToDispute,
  getActiveRepCycle,
  advanceMiningCycleNoContest,
  accommodateChallengeAndInvalidateHash,
  makeReputationKey,
  makeReputationValue,
  removeSubdomainLimit,
} = require("../helpers/test-helper");

const {
  giveUserCLNYTokensAndStake,
  setupRandomColony,
  fundColonyWithTokens,
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  setupFinalizedTask,
} = require("../helpers/test-data-generator");

const { DEFAULT_STAKE, INITIAL_FUNDING } = require("../helpers/constants");

const ReputationMinerTestWrapper = require("../packages/reputation-miner/test/ReputationMinerTestWrapper");
const MaliciousReputationMinerExtraRep = require("../packages/reputation-miner/test/MaliciousReputationMinerExtraRep");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ITokenLocking = artifacts.require("ITokenLocking");

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "build", "contracts"),
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
  const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;
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
    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();

    goodClient = new ReputationMinerTestWrapper({ loader, realProviderPort, useJsTree, minerAddress: MINER1 });
    await goodClient.resetDB();
    await goodClient.initialise(colonyNetwork.address);

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
    this.timeout(0);

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
      const domainsSetupPromise = b.map(() => Promise.all(colonies.map(({ colony }) => colony.addDomain(1, 0, 1))));
      await Promise.all(domainsSetupPromise);

      const domainsCheckPromise = colonies.map(async ({ colony }) => {
        const domainCount = await colony.getDomainCount();
        expect(domainCount).to.eq.BN(5);
      });
      await Promise.all(domainsCheckPromise);
    });

    it("can create a set of global skills", async function () {
      let skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(503); // Ensure we're starting from the intended skill
      // Build a better balanced skills tree hierarchy we're going to use in reputation
      // Current skills tree is:
      // 1 -> 2                                  // Local colonyId 1 (meta colony) skills
      // 3                                       // Global skill
      // 4 -> [5, 6, 7, 8]                       // Local colonyId 2 skills
      // 9 -> [10, 11, 12, 13]                   // Local colonyId 3 skills
      // 14 -> [15, 16, 17, 18]                  // Local colonyId 4 skills
      // 19 -> [20, 21, 22, 23]                  // Local colonyId 5 skills
      // [...]                                   // Remaining colonies local (domain) skills
      // Below update adds the following local (domain) skills in 3 new colonies
      // 504 -> [505, 506, 507]
      //              506 -> 508 -> [509, 510]
      //         505 -> 511
      // 512 -> [513, 514, 515]
      //              514 -> 516 -> [517, 518]
      //         513 -> 519
      // 520 -> [521, 522, 523]
      //              522 -> 524 -> [525, 526]
      //         521 -> 527
      for (let i = 0; i < 3; i += 1) {
        const { colony, token } = await setupRandomColony(colonyNetwork); // This creates skill 504/512/520 as the top-level domain skill
        colonies.push({ colony, token });
        await colony.addDomain(1, 0, 1); // Add skillId 505,513 and 521, domain 2
        await colony.addDomain(1, 0, 1); // Add skillId 506,514 and 522, domain 3
        await colony.addDomain(1, 0, 1); // Add skillId 507,515 and 523, domain 4

        await colony.addDomain(1, 1, 3); // Add skillId 508,516 and 524, domain 5

        await colony.addDomain(1, 3, 5); // Add skillId 509,517 and 525, domain 6
        await colony.addDomain(1, 3, 5); // Add skillId 510,518 and 526, domain 7

        await colony.addDomain(1, 0, 2); // Add skillId 511,519 and 527, domain 8
      }
      skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(527);

      // Add 500 more skills which won't be used in reputation
      const s = Array.from(Array(500).keys());
      const skillsSetupPromise = s.map(() => metaColony.addGlobalSkill());
      await Promise.all(skillsSetupPromise);

      skillCount = await colonyNetwork.getSkillCount();
      // 500 for the domain in each new colony + global skill + metaColony's 2 domain skills + 24 new ones we created
      expect(skillCount).to.eq.BN(1027);
    });

    it("can fund all colonies with own tokens", async function () {
      const fundColoniesPromise = colonies.map(({ colony, token }) => fundColonyWithTokens(colony, token, INITIAL_FUNDING.muln(10)));
      await Promise.all(fundColoniesPromise);
    });

    it("can create a range of tasks accross colonies", async function () {
      const colonyTaskPositiveReputation = [
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
      const colonyTaskNegativeReputation = [
        {
          colonyIdx: 100,
          domainId: 1,
          managerPayout: 2,
          evaluatorPayout: 1,
          workerPayout: 7,
          workerRating: 1,
        },
        {
          colonyIdx: 102,
          domainId: 1,
          managerPayout: 200,
          evaluatorPayout: 100,
          workerPayout: 100,
          workerRating: 1,
        },
      ];

      await Promise.all(
        colonyTaskPositiveReputation.map(async (taskProp) => {
          const { colony } = colonies[taskProp.colonyIdx];

          await colony.setAdministrationRole(1, 0, MANAGER, 1, true);
          await colony.setFundingRole(1, 0, MANAGER, 1, true);

          await setupFinalizedTask({
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
        colonyTaskNegativeReputation.map(async (taskProp) => {
          const { colony } = colonies[taskProp.colonyIdx];

          await setupFinalizedTask({
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
    });

    it("can mine reputation for all tasks", async function () {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });
      await goodClient.addLogContentsToReputationTree();

      const globalReputations = [
        // ColonyIdx 100
        { id: 1, colonyIdx: 100, skillId: 3, account: undefined, value: 1633 },
        { id: 2, colonyIdx: 100, skillId: 504, account: undefined, value: 2041 },
        { id: 3, colonyIdx: 100, skillId: 505, account: undefined, value: 842 },
        { id: 4, colonyIdx: 100, skillId: 506, account: undefined, value: 1197 },
        { id: 5, colonyIdx: 100, skillId: 507, account: undefined, value: 0 },
        { id: 6, colonyIdx: 100, skillId: 508, account: undefined, value: 1097 },
        { id: 7, colonyIdx: 100, skillId: 509, account: undefined, value: 100 },
        { id: 8, colonyIdx: 100, skillId: 510, account: undefined, value: 0 },
        { id: 9, colonyIdx: 100, skillId: 511, account: undefined, value: 0 },

        { id: 11, colonyIdx: 100, skillId: 504, account: MANAGER, value: 282 },
        { id: 12, colonyIdx: 100, skillId: 505, account: MANAGER, value: 40 },
        { id: 10, colonyIdx: 100, skillId: 506, account: MANAGER, value: 240 },
        { id: 12, colonyIdx: 100, skillId: 508, account: MANAGER, value: 220 },
        { id: 14, colonyIdx: 100, skillId: 509, account: MANAGER, value: 20 },

        { id: 17, colonyIdx: 100, skillId: 504, account: EVALUATOR, value: 126 },
        { id: 19, colonyIdx: 100, skillId: 505, account: EVALUATOR, value: 5 },
        { id: 16, colonyIdx: 100, skillId: 506, account: EVALUATOR, value: 120 },
        { id: 18, colonyIdx: 100, skillId: 508, account: EVALUATOR, value: 110 },
        { id: 15, colonyIdx: 100, skillId: 509, account: EVALUATOR, value: 10 },

        { id: 20, colonyIdx: 100, skillId: 3, account: WORKER, value: 1633 },
        { id: 21, colonyIdx: 100, skillId: 504, account: WORKER, value: 1633 },
        { id: 22, colonyIdx: 100, skillId: 505, account: WORKER, value: 797 },
        { id: 23, colonyIdx: 100, skillId: 506, account: WORKER, value: 837 },
        { id: 24, colonyIdx: 100, skillId: 507, account: WORKER, value: 0 },
        { id: 25, colonyIdx: 100, skillId: 508, account: WORKER, value: 767 },
        { id: 26, colonyIdx: 100, skillId: 509, account: WORKER, value: 70 },
        { id: 27, colonyIdx: 100, skillId: 510, account: WORKER, value: 0 },
        { id: 28, colonyIdx: 100, skillId: 511, account: WORKER, value: 0 },

        // ColonyIdx 101
        { id: 29, colonyIdx: 101, skillId: 514, account: undefined, value: 1000 },
        { id: 30, colonyIdx: 101, skillId: 512, account: undefined, value: 1000 },
        { id: 31, colonyIdx: 101, skillId: 516, account: undefined, value: 1000 },
        { id: 32, colonyIdx: 101, skillId: 514, account: MANAGER, value: 200 },
        { id: 33, colonyIdx: 101, skillId: 512, account: MANAGER, value: 200 },
        { id: 34, colonyIdx: 101, skillId: 516, account: MANAGER, value: 200 },
        { id: 35, colonyIdx: 101, skillId: 514, account: EVALUATOR, value: 100 },
        { id: 36, colonyIdx: 101, skillId: 512, account: EVALUATOR, value: 100 },
        { id: 37, colonyIdx: 101, skillId: 516, account: EVALUATOR, value: 100 },
        { id: 38, colonyIdx: 101, skillId: 514, account: WORKER, value: 700 },
        { id: 39, colonyIdx: 101, skillId: 512, account: WORKER, value: 700 },
        { id: 40, colonyIdx: 101, skillId: 516, account: WORKER, value: 700 },
        { id: 41, colonyIdx: 101, skillId: 3, account: undefined, value: 700 },
        { id: 42, colonyIdx: 101, skillId: 3, account: WORKER, value: 700 },

        // ColonyIdx 102
        { id: 43, colonyIdx: 102, skillId: 3, account: undefined, value: 900 },
        { id: 44, colonyIdx: 102, skillId: 520, account: undefined, value: 1800 },
        { id: 45, colonyIdx: 102, skillId: 521, account: undefined, value: 0 },
        { id: 46, colonyIdx: 102, skillId: 522, account: undefined, value: 930 },
        { id: 47, colonyIdx: 102, skillId: 523, account: undefined, value: 0 },
        { id: 48, colonyIdx: 102, skillId: 524, account: undefined, value: 930 },
        { id: 49, colonyIdx: 102, skillId: 525, account: undefined, value: 0 },
        { id: 50, colonyIdx: 102, skillId: 526, account: undefined, value: 930 },
        { id: 51, colonyIdx: 102, skillId: 527, account: undefined, value: 0 },

        { id: 52, colonyIdx: 102, skillId: 520, account: MANAGER, value: 600 },
        { id: 53, colonyIdx: 102, skillId: 522, account: MANAGER, value: 200 },
        { id: 54, colonyIdx: 102, skillId: 524, account: MANAGER, value: 200 },
        { id: 55, colonyIdx: 102, skillId: 526, account: MANAGER, value: 200 },

        { id: 56, colonyIdx: 102, skillId: 520, account: EVALUATOR, value: 300 },
        { id: 57, colonyIdx: 102, skillId: 522, account: EVALUATOR, value: 100 },
        { id: 58, colonyIdx: 102, skillId: 524, account: EVALUATOR, value: 100 },
        { id: 59, colonyIdx: 102, skillId: 526, account: EVALUATOR, value: 100 },

        { id: 60, colonyIdx: 102, skillId: 3, account: WORKER, value: 900 },
        { id: 61, colonyIdx: 102, skillId: 520, account: WORKER, value: 900 },
        { id: 62, colonyIdx: 102, skillId: 521, account: WORKER, value: 0 },
        { id: 63, colonyIdx: 102, skillId: 522, account: WORKER, value: 630 },
        { id: 64, colonyIdx: 102, skillId: 523, account: WORKER, value: 0 },
        { id: 65, colonyIdx: 102, skillId: 524, account: WORKER, value: 630 },
        { id: 66, colonyIdx: 102, skillId: 525, account: WORKER, value: 0 },
        { id: 67, colonyIdx: 102, skillId: 526, account: WORKER, value: 630 },
        { id: 68, colonyIdx: 102, skillId: 527, account: WORKER, value: 0 },
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
    const updates = Array.from(Array(75).keys());
    updates.forEach(async (badIndex) => {
      it(`should cope if wrong reputation transition is transition ${badIndex}`, async function advancingTest() {
        await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);
        await advanceMiningCycleNoContest({ colonyNetwork, test: this });
        await advanceMiningCycleNoContest({ colonyNetwork, test: this, client: goodClient });

        const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree, minerAddress: MINER2 }, badIndex, 0xfffffffff);
        await badClient.initialise(colonyNetwork.address);

        await goodClient.saveCurrentState();
        const savedHash = await goodClient.reputationTree.getRootHash();
        await badClient.loadState(savedHash);

        await submitAndForwardTimeToDispute([goodClient, badClient], this);

        const righthash = await goodClient.getRootHash();
        const wronghash = await badClient.getRootHash();
        expect(righthash, "Hashes from clients are equal, surprisingly").to.not.eq.BN(wronghash);

        const repCycle = await getActiveRepCycle(colonyNetwork);

        let error;
        if (badIndex < 72) {
          error = "colony-reputation-mining-decay-incorrect";
        } else {
          error = "colony-reputation-mining-increased-reputation-value-incorrect";
        }
        await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
          client2: { respondToChallenge: error },
        });
        await repCycle.confirmNewHash(1);
      });
    });
  });
});
