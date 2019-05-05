/* globals artifacts */
/* eslint-disable no-underscore-dangle */

import path from "path";
import chai from "chai";
import bnChai from "bn-chai";

import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";

import { DEFAULT_STAKE, MINING_CYCLE_DURATION } from "../../helpers/constants";
import { advanceMiningCycleNoContest, getActiveRepCycle, forwardTime } from "../../helpers/test-helper";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, giveUserCLNYTokensAndStake } from "../../helpers/test-data-generator";
import ReputationMinerTestWrapper from "../../packages/reputation-miner/test/ReputationMinerTestWrapper";
import ReputationMinerClient from "../../packages/reputation-miner/ReputationMinerClient";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ITokenLocking = artifacts.require("ITokenLocking");

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "..", "build", "contracts")
});

const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

process.env.SOLIDITY_COVERAGE
  ? contract.skip
  : contract("Reputation miner client auto enabled functionality", accounts => {
      const MINER1 = accounts[5];

      let colonyNetwork;
      let repCycle;
      let clnyToken;
      let reputationMiner;
      let reputationMinerClient;

      before(async () => {
        // Setup a new network instance as we'll be modifying the global skills tree
        colonyNetwork = await setupColonyNetwork();
        const tokenLockingAddress = await colonyNetwork.getTokenLocking();
        const tokenLocking = await ITokenLocking.at(tokenLockingAddress);
        ({ clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

        await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);
        await colonyNetwork.initialiseReputationMining();
        await colonyNetwork.startNextCycle();

        const lock = await tokenLocking.getUserLock(clnyToken.address, MINER1);
        expect(lock.balance).to.eq.BN(DEFAULT_STAKE);

        reputationMiner = new ReputationMinerTestWrapper({ loader, minerAddress: MINER1, realProviderPort, useJsTree: true });
      });

      beforeEach(async function() {
        // Advance two cycles to clear active and inactive state.
        await advanceMiningCycleNoContest({ colonyNetwork, test: this });
        await advanceMiningCycleNoContest({ colonyNetwork, test: this });

        await reputationMiner.resetDB();
        await reputationMiner.initialise(colonyNetwork.address);
        await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });
        await reputationMiner.saveCurrentState();
        repCycle = await getActiveRepCycle(colonyNetwork);
      });

      afterEach(async function() {
        reputationMinerClient.close();
      });

      describe("core functionality", function() {
        it("should submit 12 entries as soon as it is able to", async function() {
          this.timeout(1000000);
          reputationMinerClient = new ReputationMinerClient({ loader, realProviderPort, minerAddress: MINER1, useJsTree: true, auto: true });
          await reputationMinerClient.initialise(colonyNetwork.address);

          const rootHash = await reputationMinerClient._miner.getRootHash();
          const nNodes = await reputationMinerClient._miner.getRootHashNNodes();
          const jrh = await reputationMinerClient._miner.justificationTree.getRootHash();
          const { minerAddress } = reputationMinerClient._miner;

          // Forward through most of the cycle duration and wait for the client to submit all 12 allowed entries
          await forwardTime(MINING_CYCLE_DURATION * 0.9, this);

          const receive12Submissions = new Promise(function(resolve) {
            reputationMinerClient._miner.realProvider.on("block", async () => {
              const nSubmissions = await repCycle.getNSubmissionsForHash(rootHash, nNodes, jrh);
              if (nSubmissions.toNumber() === 12) {
                resolve();
              }
            });
          });
          await receive12Submissions;

          // Check the reputation cycle submission matches our miner
          // Validate the miner address in submission is correct
          const lastSubmitter = await repCycle.getSubmissionUser(rootHash, nNodes, jrh, 0);
          expect(lastSubmitter).to.equal(minerAddress);

          // Validate the root hash matches what the miner submitted
          const submission = await repCycle.getReputationHashSubmission(minerAddress);
          expect(submission.proposedNewRootHash).to.equal(rootHash);

          // Forward time to the end of the mining cycle and since we are the only miner, check the client confirmed our hash correctly
          await forwardTime(MINING_CYCLE_DURATION * 0.1, this);
        });

        it("should confirm entry when mining window closes and all disputes are resolved", async function() {
          const oldHash = await colonyNetwork.getReputationRootHash();

          await forwardTime(MINING_CYCLE_DURATION * 0.9, this);
          await reputationMiner.addLogContentsToReputationTree();
          await reputationMiner.submitRootHash();
          await reputationMiner.saveCurrentState();

          const rootHash = await reputationMiner.getRootHash();

          const confirmHash = new Promise(function(resolve) {
            reputationMiner.realProvider.on("block", async () => {
              const newRepCycle = await getActiveRepCycle(colonyNetwork);
              if (newRepCycle.address !== repCycle.address) {
                const newHash = await colonyNetwork.getReputationRootHash();
                expect(newHash).to.not.equal(oldHash, "The old and new hashes are the same");
                expect(newHash).to.equal(rootHash, "The network root hash doens't match the one submitted");
                resolve();
              }
            });
          });

          reputationMinerClient = new ReputationMinerClient({ loader, realProviderPort, minerAddress: MINER1, useJsTree: true, auto: true });
          reputationMinerClient.initialise(colonyNetwork.address);

          // Forward time to the end of the mining cycle and since we are the only miner, check the client confirmed our hash correctly
          await forwardTime(MINING_CYCLE_DURATION * 0.1, this);
          await confirmHash;
        });
      });
    });
