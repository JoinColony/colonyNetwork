/* globals artifacts */

import path from "path";
import BN from "bn.js";
import chai from "chai";
import bnChai from "bn-chai";
import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";

import {
  submitAndForwardTimeToDispute,
  getActiveRepCycle,
  advanceMiningCycleNoContest,
  accommodateChallengeAndInvalidateHash,
  makeReputationKey,
  makeReputationValue
} from "../helpers/test-helper";

import {
  giveUserCLNYTokensAndStake,
  setupRandomColony,
  fundColonyWithTokens,
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  setupFinalizedTask
} from "../helpers/test-data-generator";

import { DEFAULT_STAKE, INITIAL_FUNDING } from "../helpers/constants";

import ReputationMinerTestWrapper from "../packages/reputation-miner/test/ReputationMinerTestWrapper";
import MaliciousReputationMinerExtraRep from "../packages/reputation-miner/test/MaliciousReputationMinerExtraRep";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ITokenLocking = artifacts.require("ITokenLocking");

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "build", "contracts")
});

const useJsTree = true;

contract("End to end Colony network and Reputation mining testing", function(accounts) {
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

  before(async function() {
    // Setup a new network instance as we'll be modifying the global skills tree
    colonyNetwork = await setupColonyNetwork();
    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await ITokenLocking.at(tokenLockingAddress);
    ({ metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

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

  describe("when working with larger volumes", function() {
    this.timeout(0);

    it("can create 100 colonies", async function() {
      // Setup 100 random colonies, reward set to default 0%
      const a = Array.from(Array(100).keys());
      const coloniesSetupPromise = a.map(() => setupRandomColony(colonyNetwork));

      colonies = await Promise.all(coloniesSetupPromise);
      const colonyCount = await colonyNetwork.getColonyCount();
      expect(colonyCount).to.eq.BN(101);
    });

    it("can create 5 domains in each of the 100 colonies", async function() {
      const b = Array.from(Array(4).keys());
      const domainsSetupPromise = b.map(() => Promise.all(colonies.map(({ colony }) => colony.addDomain(1))));
      await Promise.all(domainsSetupPromise);

      const domainsCheckPromise = colonies.map(async ({ colony }) => {
        const domainCount = await colony.getDomainCount();
        expect(domainCount).to.eq.BN(5);
      });
      await Promise.all(domainsCheckPromise);
    });

    it("can create 100 global skills", async function() {
      let skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(503); // Ensure we're starting from the intended skill
      // Build a better balanced skills tree hierarchy we're going to use in reputation
      // Current skills tree is:
      // 1 -> 2 -> 3                                  // Local colonyId 1 (meta colony) skills
      // 1 -> 4? -> [5, 6, 7, 8]                       // Local colonyId 2 skills
      // 1 -> 9 -> [10, 11, 12, 13]                   // Local colonyId 3 skills
      // 1 -> 14 -> [15, 16, 17, 18]                  // Local colonyId 4 skills
      // 1 -> 19 -> [20, 21, 22, 23]                  // Local colonyId 5 skills
      // 1 -> [...]                                   // Remaining colonies local (domain) skills
      // 1 -> 504 -> [505, 506, 507]
      //                   506 -> 508 -> [509, 510]
      //              505 -> 511
      await metaColony.addGlobalSkill(1); // Add skill 504
      await metaColony.addGlobalSkill(504); // Adds skillId 505
      await metaColony.addGlobalSkill(504); // Adds skillId 506
      await metaColony.addGlobalSkill(504); // Adds skillId 507
      await metaColony.addGlobalSkill(506); // Adds skillId 508
      await metaColony.addGlobalSkill(508); // Adds skillId 509
      await metaColony.addGlobalSkill(508); // Adds skillId 510
      await metaColony.addGlobalSkill(505); // Adds skillId 511
      skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(511);

      // TODO: The client was taking too long to process update of a node with ~500 children child skill updates.
      // Would like to profile the client performance better and optimise that for larger still trees
      // Add 500 more skills which won't be used in reputation
      // const s = Array.from(Array(500).keys());
      // const skillsSetupPromise = s.map(() => metaColony.addGlobalSkill(1));
      // await Promise.all(skillsSetupPromise);

      skillCount = await colonyNetwork.getSkillCount();
      // 500 for the domain in each new colony + global skill + metaColony's 2 domain skills + 8 new ones we created
      expect(skillCount).to.eq.BN(511);
    });

    it("can fund all colonies with own tokens", async function() {
      const fundColoniesPromise = colonies.map(({ colony, token }) => fundColonyWithTokens(colony, token, INITIAL_FUNDING.muln(10)));
      await Promise.all(fundColoniesPromise);
    });

    it("can create 5 tasks in each of the 100 colonies", async function() {
      // Have 3 colonies with 5 tasks each cross populated with unique data for the purposes of testing earned reputation
      const colonyTaskProps = [
        {
          colonyIdx: 1, // Index in the colonies[] array (note that this excludes the meta colony)
          domainId: 1, // Domain
          skillId: 508,
          managerPayout: 200,
          evaluatorPayout: 100,
          workerPayout: 700,
          managerRating: 2,
          workerRating: 2
        },
        {
          colonyIdx: 1,
          domainId: 2,
          skillId: 506,
          managerPayout: 20,
          evaluatorPayout: 10,
          workerPayout: 70,
          managerRating: 2,
          workerRating: 2
        },
        {
          colonyIdx: 1,
          domainId: 3,
          skillId: 505,
          managerPayout: 40,
          evaluatorPayout: 5,
          workerPayout: 800,
          managerRating: 2,
          workerRating: 2
        },
        {
          colonyIdx: 1,
          domainId: 4,
          skillId: 509,
          managerPayout: 20,
          evaluatorPayout: 10,
          workerPayout: 70,
          managerRating: 2,
          workerRating: 2
        },
        {
          colonyIdx: 1,
          domainId: 5,
          skillId: 504,
          managerPayout: 2,
          evaluatorPayout: 1,
          workerPayout: 7,
          managerRating: 2,
          workerRating: 1
        }
      ];

      colonyTaskProps.forEach(async taskProp => {
        const { colony } = colonies[taskProp.colonyIdx];
        await setupFinalizedTask({
          colonyNetwork,
          colony,
          domainId: taskProp.domainId,
          skillId: taskProp.skillId,
          manager: MANAGER,
          evaluator: EVALUATOR,
          worker: WORKER,
          managerPayout: taskProp.managerPayout,
          evaluatorPayout: taskProp.evaluatorPayout,
          workerPayout: taskProp.workerPayout,
          managerRating: taskProp.managerRating,
          workerRating: taskProp.workerRating
        });
      });

      // const tasksCheckPromise = colonies.map(async ({ colony }) => {
      //   const taskCount = await colony.getTaskCount();
      //   expect(taskCount).to.eq.BN(5);
      // });
      // await Promise.all(tasksCheckPromise);
    });

    it("can mine reputation for 500 tasks", async function() {
      await advanceMiningCycleNoContest({ colonyNetwork, client: goodClient, minerAddress: MINER1, test: this });

      // This log processes 100 * 5 completed tasks + 1 miner reward for previous cycle
      // All 500 tasks are incrementing the reputation amounts, i.e. there are no negative updates
      const repCycle = await getActiveRepCycle(colonyNetwork);
      const reputationCycleNLogEntries = await repCycle.getReputationUpdateLogLength();
      expect(reputationCycleNLogEntries).to.eq.BN(21);

      await goodClient.addLogContentsToReputationTree();

      // For simplicity we are only validating the global reputation
      const globalReputations = [
        { id: 1, colonyIdx: 1, skillId: 1, account: undefined, value: 1633 },
        { id: 2, colonyIdx: 1, skillId: 504, account: undefined, value: 1633 },
        { id: 3, colonyIdx: 1, skillId: 505, account: undefined, value: 797 },
        { id: 4, colonyIdx: 1, skillId: 506, account: undefined, value: 837 },
        { id: 5, colonyIdx: 1, skillId: 507, account: undefined, value: 0 },
        { id: 6, colonyIdx: 1, skillId: 508, account: undefined, value: 767 },
        { id: 7, colonyIdx: 1, skillId: 509, account: undefined, value: 70 },
        { id: 8, colonyIdx: 1, skillId: 510, account: undefined, value: 0 },
        { id: 9, colonyIdx: 1, skillId: 511, account: undefined, value: 0 },
        { id: 10, colonyIdx: 1, skillId: 1, account: WORKER, value: 1633 },
        { id: 11, colonyIdx: 1, skillId: 504, account: WORKER, value: 1633 },
        { id: 12, colonyIdx: 1, skillId: 505, account: WORKER, value: 797 },
        { id: 13, colonyIdx: 1, skillId: 506, account: WORKER, value: 837 },
        { id: 14, colonyIdx: 1, skillId: 507, account: WORKER, value: 0 },
        { id: 15, colonyIdx: 1, skillId: 508, account: WORKER, value: 767 },
        { id: 16, colonyIdx: 1, skillId: 509, account: WORKER, value: 70 },
        { id: 17, colonyIdx: 1, skillId: 510, account: WORKER, value: 0 },
        { id: 18, colonyIdx: 1, skillId: 511, account: WORKER, value: 0 }
      ];

      globalReputations.forEach(globalRep => {
        const { colony } = colonies[globalRep.colonyIdx];
        const key = makeReputationKey(colony.address, new BN(globalRep.skillId), globalRep.account);
        const value = makeReputationValue(globalRep.value, globalRep.id);
        const decimalValue = new BN(goodClient.reputations[key].slice(2, 66), 16);
        expect(goodClient.reputations[key], `${globalRep.id} failed. Actual value is ${decimalValue}`).to.eq.BN(value);
      });
    });
  });

  describe.skip("when there is a dispute over reputation root hash", function() {
    // These tests are useful for checking that every type of parent / child / user / colony-wide-sum skills are accounted for
    // correctly. Unsure if I should force them to be run every time.
    [0, 1, 2, 3, 4, 5, 6, 7].forEach(async badIndex => {
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
        if (badIndex < 4) {
          error = "colony-reputation-mining-decay-incorrect";
        } else {
          error = "colony-reputation-mining-increased-reputation-value-incorrect";
        }
        await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
          client2: { respondToChallenge: error }
        });
        await repCycle.confirmNewHash(1);
      });
    });
  });
});
