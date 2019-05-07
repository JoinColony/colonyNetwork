/* eslint-disable no-underscore-dangle */

import path from "path";
import chai from "chai";
import bnChai from "bn-chai";

import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";

import { DEFAULT_STAKE, MINING_CYCLE_DURATION } from "../../helpers/constants";
import { getActiveRepCycle, forwardTime, finishReputationMiningCycle } from "../../helpers/test-helper";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, giveUserCLNYTokensAndStake } from "../../helpers/test-data-generator";
import ReputationMinerClient from "../../packages/reputation-miner/ReputationMinerClient";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "..", "build", "contracts")
});

const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

process.env.SOLIDITY_COVERAGE
  ? contract.skip
  : contract("Reputation miner client auto enabled functionality", accounts => {
      const MINER1 = accounts[5];
      const MINER2 = accounts[6];

      let colonyNetwork;
      let repCycle;
      let reputationMinerClient;

      const setupNewNetworkInstance = async (_MINER1, _MINER2) => {
        colonyNetwork = await setupColonyNetwork();
        await setupMetaColonyWithLockedCLNYToken(colonyNetwork);

        await giveUserCLNYTokensAndStake(colonyNetwork, _MINER1, DEFAULT_STAKE);
        await giveUserCLNYTokensAndStake(colonyNetwork, _MINER2, DEFAULT_STAKE);
        await colonyNetwork.initialiseReputationMining();
        await colonyNetwork.startNextCycle();
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
      });

      describe("core functionality", function() {
        it("should submit 12 entries as soon as it is able to", async function() {
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

          // Check the reputation cycle submission matches our miner
          // Validate the miner address in submission is correct
          const lastSubmitter = await repCycle.getSubmissionUser(rootHash, nNodes, jrh, 11);
          expect(lastSubmitter).to.equal(minerAddress);

          // Validate the root hash matches what the miner submitted
          const submission = await repCycle.getReputationHashSubmission(minerAddress);
          expect(submission.proposedNewRootHash).to.equal(rootHash);

          const oldHash = await colonyNetwork.getReputationRootHash();

          const colonyNetworkEthers = await reputationMinerClient._miner.colonyNetwork;

          const miningCycleComplete = new Promise(function(resolve, reject) {
            colonyNetworkEthers.on("ReputationMiningCycleComplete", async (_hash, _nNodes, event) => {
              const newHash = await colonyNetwork.getReputationRootHash();
              console.log("newHash", newHash);
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
          await forwardTime(MINING_CYCLE_DURATION * 1, this);
          await miningCycleComplete;
        });
      });
    });
