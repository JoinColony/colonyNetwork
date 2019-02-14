/* globals artifacts */

import path from "path";
import BN from "bn.js";
import { toBN } from "web3-utils";
import chai from "chai";
import bnChai from "bn-chai";
import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";

import {
  forwardTime,
  checkErrorRevert,
  checkErrorRevertEthers,
  submitAndForwardTimeToDispute,
  runBinarySearch,
  getActiveRepCycle,
  advanceMiningCycleNoContest,
  accommodateChallengeAndInvalidateHash,
  finishReputationMiningCycleAndWithdrawAllMinerStakes
} from "../helpers/test-helper";

import {
  giveUserCLNYTokensAndStake,
  setupRandomColony,
  fundColonyWithTokens,
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken
} from "../helpers/test-data-generator";

import { DEFAULT_STAKE, MINING_CYCLE_DURATION } from "../helpers/constants";

import ReputationMinerTestWrapper from "../packages/reputation-miner/test/ReputationMinerTestWrapper";
import MaliciousReputationMinerExtraRep from "../packages/reputation-miner/test/MaliciousReputationMinerExtraRep";
import MaliciousReputationMinerWrongUID from "../packages/reputation-miner/test/MaliciousReputationMinerWrongUID";
import MaliciousReputationMinerReuseUID from "../packages/reputation-miner/test/MaliciousReputationMinerReuseUID";
import MaliciousReputationMinerWrongNewestReputation from "../packages/reputation-miner/test/MaliciousReputationMinerWrongNewestReputation";
import MaliciousReputationMinerClaimNew from "../packages/reputation-miner/test/MaliciousReputationMinerClaimNew";
import MaliciousReputationMinerUnsure from "../packages/reputation-miner/test/MaliciousReputationMinerUnsure";
import MaliciousReputationMinerWrongJRH from "../packages/reputation-miner/test/MaliciousReputationMinerWrongJRH";
import MaliciousReputationMinerWrongNNodes from "../packages/reputation-miner/test/MaliciousReputationMinerWrongNNodes";
import MaliciousReputationMinerWrongNNodes2 from "../packages/reputation-miner/test/MaliciousReputationMinerWrongNNodes2";
import MaliciousReputationMinerAddNewReputation from "../packages/reputation-miner/test/MaliciousReputationMinerAddNewReputation";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ITokenLocking = artifacts.require("ITokenLocking");
const IColony = artifacts.require("IColony");

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "build", "contracts")
});

const useJsTree = true;

contract("End to end Colony network and Reputation mining testing", accounts => {
  const MINER1 = accounts[5];
  const MINER2 = accounts[6];

  let metaColony;
  let colonyNetwork;
  let tokenLocking;
  let clnyToken;
  let goodClient;
  const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

  before(async () => {
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
  //  const lock = await tokenLocking.getUserLock(clnyToken.address, MINER1);
  //  expect(lock.balance).to.eq.BN(DEFAULT_STAKE);

    // Advance two cycles to clear active and inactive state.
   // await advanceMiningCycleNoContest({ colonyNetwork, test: this });
   // await advanceMiningCycleNoContest({ colonyNetwork, test: this });

    // The inactive reputation log now has the reward for this miner, and the accepted state is empty.
    // This is the same starting point for all tests.
    const repCycle = await getActiveRepCycle(colonyNetwork);
    const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
    console.log("nInactiveLogEntries", nInactiveLogEntries.toString());
  //  expect(nInactiveLogEntries).to.eq.BN(1);
  });

  describe("when working with the network", function () {
    this.timeout(9000000);
    it("can create 100 colonies", async function () {
      // Setup 100 random colonies, reward set to default 0%
      const a = Array.from(Array(100).keys());
      const promises = a.map(async () => {
        return setupRandomColony(colonyNetwork);
      });

      await Promise.all(promises);
      const colonyCount = await colonyNetwork.getColonyCount();
      expect(colonyCount).to.eq.BN(101);
    });

    it("can create 20 domains in each of the 100 colonies", async function () {
      const a = Array.from(Array(100).keys());
      const b = Array.from(Array(20).keys());
      const promises = a.map(async (i) => {
        const colonyAddress = await colonyNetwork.getColony(i+1);
        const colony = await IColony.at(colonyAddress);
        const promisesDomainSetup = b.map(async () => {
          return colony.addDomain(1);
        });
        await Promise.all(promisesDomainSetup); 

        const domainCount = await colony.getDomainCount();
        expect(domainCount).to.eq.BN(51);
      });

      await Promise.all(promises);
    });

    it.skip("can create 10,000 global skills", async function () {
      for (let i = 1; i <= 10000; i+=1) {
        // TODO better balance the skills tree
        await metaColony.addGlobalSkill(1);
      }

      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(10001); 
    });

    // TODO Setup 100,000 tasks

    // TODO Setup reputation mining ~ every 1,000 tasks
  });

  describe.skip("when there is a dispute over reputation root hash", function () {
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