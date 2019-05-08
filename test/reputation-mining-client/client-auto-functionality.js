/* eslint-disable no-underscore-dangle */

import path from "path";
import chai from "chai";
import bnChai from "bn-chai";

import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";

import { DEFAULT_STAKE, MINING_CYCLE_DURATION } from "../../helpers/constants";
import { getActiveRepCycle, forwardTime, finishReputationMiningCycle, advanceMiningCycleNoContest } from "../../helpers/test-helper";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, giveUserCLNYTokensAndStake } from "../../helpers/test-data-generator";
import ReputationMinerClient from "../../packages/reputation-miner/ReputationMinerClient";
import ReputationMinerTestWrapper from "../../packages/reputation-miner/test/ReputationMinerTestWrapper";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "..", "build", "contracts")
});

const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

process.env.SOLIDITY_COVERAGE
  ? contract.skip
  : contract.only("Reputation miner client auto enabled functionality", accounts => {
      const MINER1 = accounts[5];
      const MINER2 = accounts[6];

      let colonyNetwork;
      let repCycle;
      let reputationMinerClient;
      let reputationMinerClient2;
      let goodClient;

      const setupNewNetworkInstance = async (_MINER1, _MINER2) => {
        colonyNetwork = await setupColonyNetwork();
        await setupMetaColonyWithLockedCLNYToken(colonyNetwork);

        await giveUserCLNYTokensAndStake(colonyNetwork, _MINER1, DEFAULT_STAKE);
        await giveUserCLNYTokensAndStake(colonyNetwork, _MINER2, DEFAULT_STAKE);
        await colonyNetwork.initialiseReputationMining();
        await colonyNetwork.startNextCycle();

        await advanceMiningCycleNoContest({ colonyNetwork, test: this });
        await advanceMiningCycleNoContest({ colonyNetwork, test: this });
      };

      before(async () => {
        await setupNewNetworkInstance(MINER1, MINER2);
      });

      beforeEach(async function() {
        repCycle = await getActiveRepCycle(colonyNetwork);
      });

      afterEach(async function() {
        const reputationMiningGotClean = await finishReputationMiningCycle(colonyNetwork, this);
        if (!reputationMiningGotClean) await setupNewNetworkInstance(MINER1, MINER2);
        reputationMinerClient.close();
        if (reputationMinerClient2) {
          reputationMinerClient2.close();
        }
      });

      describe("core functionality", function() {
        it("should successfully complete a hash submission if it's the only miner", async function() {
          reputationMinerClient = new ReputationMinerClient({ loader, realProviderPort, minerAddress: MINER1, useJsTree: true, auto: true });
          await reputationMinerClient.initialise(colonyNetwork.address);
          const rootHash = await reputationMinerClient._miner.getRootHash();
          const nNodes = await reputationMinerClient._miner.getRootHashNNodes();
          const jrh = await reputationMinerClient._miner.justificationTree.getRootHash();
          const { minerAddress } = reputationMinerClient._miner;

          const repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();
          const receive12Submissions = new Promise(function(resolve, reject) {
            repCycleEthers.on("ReputationRootHashSubmitted", async (_miner, _hash, _nNodes, _jrh, _entryIndex, event) => {
              const nSubmissions = await repCycle.getNSubmissionsForHash(rootHash, nNodes, jrh);
              if (nSubmissions.toNumber() === 12) {
                // Check the reputation cycle submission matches our miner
                // Validate the miner address in submission is correct
                const lastSubmitter = await repCycle.getSubmissionUser(rootHash, nNodes, jrh, 11);
                expect(lastSubmitter).to.equal(minerAddress);

                // Validate the root hash matches what the miner submitted
                const submission = await repCycle.getReputationHashSubmission(minerAddress);
                expect(submission.proposedNewRootHash).to.equal(rootHash);

                event.removeListener();
                resolve();
              }
            });

            // After 30s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("timeout while waiting for 12 hash submissions"));
            }, 30000);
          });

          // Forward through most of the cycle duration and wait for the client to submit all 12 allowed entries
          await forwardTime(MINING_CYCLE_DURATION * 0.9, this);
          await receive12Submissions;

          const oldHash = await colonyNetwork.getReputationRootHash();

          const colonyNetworkEthers = await reputationMinerClient._miner.colonyNetwork;
          const miningCycleComplete = new Promise(function(resolve, reject) {
            colonyNetworkEthers.on("ReputationMiningCycleComplete", async (_hash, _nNodes, event) => {
              const newHash = await colonyNetwork.getReputationRootHash();
              expect(newHash).to.not.equal(oldHash, "The old and new hashes are the same");
              expect(newHash).to.equal(rootHash, "The network root hash doens't match the one submitted");
              event.removeListener();
              resolve();
            });

            // After 30s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("timeout while waiting for confirming hash"));
            }, 30000);
          });

          // Forward time to the end of the mining cycle and since we are the only miner, check the client confirmed our hash correctly
          await forwardTime(MINING_CYCLE_DURATION * 0.1, this);
          await miningCycleComplete;
        });

        it.only("should successfully complete a hash submission if there are 2 good miners", async function() {
          reputationMinerClient = new ReputationMinerClient({ loader, realProviderPort, minerAddress: MINER1, useJsTree: true, auto: true });
          await reputationMinerClient.initialise(colonyNetwork.address);
          goodClient = new ReputationMinerTestWrapper({
            loader,
            realProviderPort,
            minerAddress: MINER2,
            useJsTree: true,
            dbPath: "./reputationStates2.sqlite"
          });
          await goodClient.initialise(colonyNetwork.address);
          await goodClient.addLogContentsToReputationTree();

          const rootHash = await reputationMinerClient._miner.getRootHash();
          const nNodes = await reputationMinerClient._miner.getRootHashNNodes();
          const jrh = await reputationMinerClient._miner.justificationTree.getRootHash();
          const { minerAddress } = reputationMinerClient._miner;
          const minerAddress2 = goodClient.minerAddress;

          const repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();
          const receive12Submissions = new Promise(function(resolve, reject) {
            repCycleEthers.on("ReputationRootHashSubmitted", async (_miner, _hash, _nNodes, _jrh, _entryIndex, event) => {
              const nSubmissions = await repCycle.getNSubmissionsForHash(rootHash, nNodes, jrh);
              if (nSubmissions.toNumber() === 12) {
                // Check the reputation cycle submission matches our miners
                for (let i = 0; i < 12; i += 1) {
                  // Validate the miner address in submission is correct
                  const submitter = await repCycle.getSubmissionUser(rootHash, nNodes, jrh, i);
                  expect(submitter).to.be.one.of([MINER1, MINER2]);
                }

                // Validate the root hash matches what the miners submitted
                const submission = await repCycle.getReputationHashSubmission(minerAddress);
                expect(submission.proposedNewRootHash).to.equal(rootHash);
                const submission2 = await repCycle.getReputationHashSubmission(minerAddress2);
                expect(submission2.proposedNewRootHash).to.equal(rootHash);

                event.removeListener();
                resolve();
              }
            });

            // After 30s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("timeout while waiting for 12 hash submissions"));
            }, 30000);
          });

          // Forward through most of the cycle duration and wait for the client to submit all 12 allowed entries
          await forwardTime(MINING_CYCLE_DURATION * 0.5, this);

          // Make 2 submissions
          await goodClient.submitRootHash();
          await goodClient.submitRootHash();

          await receive12Submissions;
          const oldHash = await colonyNetwork.getReputationRootHash();

          const colonyNetworkEthers = await reputationMinerClient._miner.colonyNetwork;
          const miningCycleComplete = new Promise(function(resolve, reject) {
            colonyNetworkEthers.on("ReputationMiningCycleComplete", async (_hash, _nNodes, event) => {
              const newHash = await colonyNetwork.getReputationRootHash();
              expect(newHash).to.not.equal(oldHash, "The old and new hashes are the same");
              expect(newHash).to.equal(rootHash, "The network root hash doens't match the one submitted");
              event.removeListener();
              resolve();
            });

            // After 30s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("timeout while waiting for confirming hash"));
            }, 30000);
          });

          // Forward time to the end of the mining cycle and since we are the only miner, check the client confirmed our hash correctly
          await forwardTime(MINING_CYCLE_DURATION * 0.5, this);
          await miningCycleComplete;
        });
      });
    });
