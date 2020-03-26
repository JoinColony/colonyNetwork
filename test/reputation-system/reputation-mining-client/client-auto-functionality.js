/* eslint-disable no-underscore-dangle */

import path from "path";
import chai from "chai";
import bnChai from "bn-chai";

import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";

import { DEFAULT_STAKE, MINING_CYCLE_DURATION } from "../../../helpers/constants";
import {
  getActiveRepCycle,
  forwardTime,
  advanceMiningCycleNoContest,
  checkSuccessEthers,
  checkErrorRevertEthers,
  mineBlock,
  finishReputationMiningCycle,
  currentBlock,
  getWaitForNSubmissionsPromise,
} from "../../../helpers/test-helper";
import {
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  giveUserCLNYTokensAndStake,
  setupFinalizedTask,
  fundColonyWithTokens,
} from "../../../helpers/test-data-generator";
import ReputationMinerClient from "../../../packages/reputation-miner/ReputationMinerClient";
import ReputationMinerTestWrapper from "../../../packages/reputation-miner/test/ReputationMinerTestWrapper";
import MaliciousReputationMinerExtraRep from "../../../packages/reputation-miner/test/MaliciousReputationMinerExtraRep";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "..", "..", "build", "contracts"),
});

const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

process.env.SOLIDITY_COVERAGE
  ? contract.skip
  : contract("Reputation miner client auto enabled functionality", (accounts) => {
      const MINER1 = accounts[5];
      const MINER2 = accounts[6];
      const MINER3 = accounts[7];

      let colonyNetwork;
      let repCycle;
      let reputationMinerClient;
      let goodClient;
      let startingBlockNumber;

      const setupNewNetworkInstance = async (_MINER1, _MINER2, _MINER3) => {
        colonyNetwork = await setupColonyNetwork();

        const { metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork);
        await fundColonyWithTokens(metaColony, clnyToken, DEFAULT_STAKE);

        await giveUserCLNYTokensAndStake(colonyNetwork, _MINER1, DEFAULT_STAKE);
        await giveUserCLNYTokensAndStake(colonyNetwork, _MINER2, DEFAULT_STAKE);
        await giveUserCLNYTokensAndStake(colonyNetwork, _MINER3, DEFAULT_STAKE);
        await colonyNetwork.initialiseReputationMining();
        await colonyNetwork.startNextCycle();

        await advanceMiningCycleNoContest({ colonyNetwork, test: this });
        await setupFinalizedTask({ colonyNetwork, colony: metaColony, token: clnyToken });
        await advanceMiningCycleNoContest({ colonyNetwork, test: this });
        const startingBlock = await currentBlock();
        startingBlockNumber = startingBlock.number;

        goodClient = new ReputationMinerTestWrapper({
          loader,
          realProviderPort,
          minerAddress: MINER2,
          useJsTree: true,
          // dbPath: "./reputationStates_good.sqlite"
        });
        reputationMinerClient = new ReputationMinerClient({
          loader,
          realProviderPort,
          minerAddress: MINER1,
          useJsTree: true,
          auto: true,
          oracle: false,
        });
      };

      before(async () => {
        await setupNewNetworkInstance(MINER1, MINER2, MINER3);
      });

      beforeEach(async function () {
        repCycle = await getActiveRepCycle(colonyNetwork);
        await goodClient.resetDB();
        await goodClient.initialise(colonyNetwork.address);
        await goodClient.sync(startingBlockNumber);
        await goodClient.saveCurrentState();
        await reputationMinerClient.initialise(colonyNetwork.address, startingBlockNumber);
      });

      afterEach(async function () {
        await reputationMinerClient.close();
        const reputationMiningGotClean = await finishReputationMiningCycle(colonyNetwork, this);
        if (!reputationMiningGotClean) await setupNewNetworkInstance(MINER1, MINER2);
      });

      describe("core functionality", function () {
        it("should successfully complete a hash submission if it's the only miner", async function () {
          const rootHash = await reputationMinerClient._miner.getRootHash();
          const nNodes = await reputationMinerClient._miner.getRootHashNNodes();
          const jrh = await reputationMinerClient._miner.justificationTree.getRootHash();

          const oldHash = await colonyNetwork.getReputationRootHash();

          const repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();
          const receive12Submissions = getWaitForNSubmissionsPromise(repCycleEthers, rootHash, nNodes, jrh, 12);

          // Forward through most of the cycle duration and wait for the client to submit all 12 allowed entries
          await forwardTime(MINING_CYCLE_DURATION * 0.9, this);
          await receive12Submissions;

          const colonyNetworkEthers = await reputationMinerClient._miner.colonyNetwork;
          const miningCycleComplete = new Promise(function (resolve, reject) {
            colonyNetworkEthers.on("ReputationMiningCycleComplete", async (_hash, _nNodes, event) => {
              const newHash = await colonyNetwork.getReputationRootHash();
              expect(newHash).to.not.equal(oldHash, "The old and new hashes are the same");
              expect(newHash).to.equal(rootHash, "The network root hash doens't match the one submitted");
              event.removeListener();
              resolve();
            });

            // After 30s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("ERROR: timeout while waiting for confirming hash"));
            }, 30000);
          });

          // Forward time to the end of the mining cycle and since we are the only miner, check the client confirmed our hash correctly
          await forwardTime(MINING_CYCLE_DURATION * 0.1, this);
          await miningCycleComplete;
        });

        it("should follow updates if it is only an oracle", async function () {
          const oracleClient = new ReputationMinerClient({
            loader,
            realProviderPort,
            minerAddress: MINER2,
            useJsTree: true,
            oracle: true,
            auto: false,
            // dbPath: "./reputationStates_good.sqlite"
          });

          await oracleClient.initialise(colonyNetwork.address, startingBlockNumber);

          const rootHash = await reputationMinerClient._miner.getRootHash();
          const nNodes = await reputationMinerClient._miner.getRootHashNNodes();
          const jrh = await reputationMinerClient._miner.justificationTree.getRootHash();

          const oldHash = await colonyNetwork.getReputationRootHash();

          const repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();
          const receive12Submissions = getWaitForNSubmissionsPromise(repCycleEthers, rootHash, nNodes, jrh, 12);

          // Forward through most of the cycle duration and wait for the client to submit all 12 allowed entries
          await forwardTime(MINING_CYCLE_DURATION * 0.9, this);
          await receive12Submissions;

          const colonyNetworkEthers = await reputationMinerClient._miner.colonyNetwork;
          const miningCycleComplete = new Promise(function (resolve, reject) {
            colonyNetworkEthers.on("ReputationMiningCycleComplete", async (_hash, _nNodes, event) => {
              const newHash = await colonyNetwork.getReputationRootHash();
              expect(newHash).to.not.equal(oldHash, "The old and new hashes are the same");
              expect(newHash).to.equal(rootHash, "The network root hash doens't match the one submitted");
              event.removeListener();
              resolve();
            });

            // After 30s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("ERROR: timeout while waiting for confirming hash"));
            }, 30000);
          });

          let oracleCheckInterval;

          const rootHashBeforeUpdate = await oracleClient._miner.reputationTree.getRootHash();
          // Wait for the oracle to update

          const oracleUpdated = new Promise(function (resolve, reject) {
            let oracleLastSeenHash = "0x00";
            const checkOracle = async function () {
              const oracleCurrentHash = await oracleClient._miner.reputationTree.getRootHash();
              if (oracleCurrentHash !== rootHashBeforeUpdate && oracleCurrentHash === oracleLastSeenHash) {
                // This 'if' statement can be read as "If the oracle has started updating AND the oracle has finished updating"
                resolve();
              } else {
                oracleLastSeenHash = oracleCurrentHash;
                await forwardTime(1, this);
              }
            };
            oracleCheckInterval = setInterval(checkOracle.bind(this), 5000);
            setTimeout(() => {
              reject(new Error("ERROR: timeout while waiting for oracle to update"));
            }, 100000);
          });

          // Forward time to the end of the mining cycle and since we are the only miner, check the client confirmed our hash correctly
          await forwardTime(MINING_CYCLE_DURATION * 0.1, this);
          await miningCycleComplete;

          await oracleUpdated;

          clearTimeout(oracleCheckInterval);

          // Check the oracle has the same root hash as the miner after updating
          const oracleHash = await oracleClient._miner.reputationTree.getRootHash();
          const minerHash = await reputationMinerClient._miner.reputationTree.getRootHash();
          assert.equal(oracleHash, minerHash, "The oracle has updated, but does not have the right hash");

          await oracleClient.close();
        });

        it("should successfully resume submitting hashes if it's restarted", async function () {
          const rootHash = await reputationMinerClient._miner.getRootHash();
          const nNodes = await reputationMinerClient._miner.getRootHashNNodes();
          const jrh = await reputationMinerClient._miner.justificationTree.getRootHash();

          const oldHash = await colonyNetwork.getReputationRootHash();

          const repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();
          const receive2Submissions = getWaitForNSubmissionsPromise(repCycleEthers, rootHash, nNodes, jrh, 2);

          // Forward through half of the cycle duration and wait for the client to submit some entries
          await forwardTime(MINING_CYCLE_DURATION * 0.5, this);
          await receive2Submissions; // It might submit a couple more, but that's fine for the purposes of this test.
          await reputationMinerClient.close();

          // start up another one.
          const reputationMinerClient2 = new ReputationMinerClient({
            loader,
            realProviderPort,
            minerAddress: MINER1,
            useJsTree: true,
            auto: true,
          });
          await reputationMinerClient2.initialise(colonyNetwork.address, startingBlockNumber);
          const receive12Submissions = getWaitForNSubmissionsPromise(repCycleEthers, rootHash, nNodes, jrh, 12);

          await mineBlock();
          await receive12Submissions;

          const colonyNetworkEthers = await reputationMinerClient._miner.colonyNetwork;
          const miningCycleComplete = new Promise(function (resolve, reject) {
            colonyNetworkEthers.on("ReputationMiningCycleComplete", async (_hash, _nNodes, event) => {
              const newHash = await colonyNetwork.getReputationRootHash();
              expect(newHash).to.not.equal(oldHash, "The old and new hashes are the same");
              expect(newHash).to.equal(rootHash, "The network root hash doens't match the one submitted");
              event.removeListener();
              resolve();
            });

            // After 30s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("ERROR: timeout while waiting for confirming hash"));
            }, 30000);
          });

          // Forward time to the end of the mining cycle and since we are the only miner, check the client confirmed our hash correctly
          await forwardTime(MINING_CYCLE_DURATION * 0.6, this);
          await miningCycleComplete;
          await reputationMinerClient2.close();
        });

        it("should successfully complete a hash submission if there are 2 good miners", async function () {
          const oldHash = await colonyNetwork.getReputationRootHash();
          const rootHash = await reputationMinerClient._miner.getRootHash();
          const nNodes = await reputationMinerClient._miner.getRootHashNNodes();
          const jrh = await reputationMinerClient._miner.justificationTree.getRootHash();

          const repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();
          const receive12Submissions = getWaitForNSubmissionsPromise(repCycleEthers, rootHash, nNodes, jrh, 12);

          // Make a submission from the second client and then await the remaining 11 submissions from the first client
          await goodClient.loadState(rootHash);

          // Forward time and wait for the client to submit all 12 allowed entries
          await forwardTime(MINING_CYCLE_DURATION * 0.5, this);
          await checkSuccessEthers(goodClient.submitRootHash());
          await receive12Submissions;

          const colonyNetworkEthers = await reputationMinerClient._miner.colonyNetwork;
          const miningCycleComplete = new Promise(function (resolve, reject) {
            colonyNetworkEthers.on("ReputationMiningCycleComplete", async (_hash, _nNodes, event) => {
              const newHash = await colonyNetwork.getReputationRootHash();
              expect(newHash).to.not.equal(oldHash, "The old and new hashes are the same");
              expect(newHash).to.equal(rootHash, "The network root hash doens't match the one submitted");
              event.removeListener();
              resolve();
            });

            // After 30s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("ERROR: timeout while waiting for confirming hash"));
            }, 60000);
          });

          // Forward time to the end of the mining cycle and since we are the only miner, check the client confirmed our hash correctly
          await forwardTime(MINING_CYCLE_DURATION * 0.5, this);
          await miningCycleComplete;
        });

        it("should successfully complete a dispute resolution", async function () {
          const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree: true, minerAddress: MINER3 }, 1, 0);
          await badClient.initialise(colonyNetwork.address);
          // We need to load the current good state in to the bad client.
          await badClient.sync(startingBlockNumber);
          // make the bad client behave badly again
          badClient.amountToFalsify = 0xfffffffff;

          await badClient.addLogContentsToReputationTree();

          const rootHash = await reputationMinerClient._miner.getRootHash();
          const nNodes = await reputationMinerClient._miner.getRootHashNNodes();
          const jrh = await reputationMinerClient._miner.justificationTree.getRootHash();

          const badRootHash = await badClient.getRootHash();
          const badNNodes = await badClient.getRootHashNNodes();
          const badJrh = await badClient.justificationTree.getRootHash();

          const repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();

          const receive12Submissions = getWaitForNSubmissionsPromise(repCycleEthers, rootHash, nNodes, jrh, 12);

          // Forward through most of the cycle duration
          await forwardTime(MINING_CYCLE_DURATION * 0.5, this);
          await receive12Submissions;

          const goodClientConfirmedJRH = new Promise(function (resolve, reject) {
            repCycleEthers.on("JustificationRootHashConfirmed", async (_hash, _nNodes, _jrh, event) => {
              if (_hash === rootHash && _nNodes.eq(nNodes) && _jrh === jrh) {
                event.removeListener();
                resolve();
              }
            });

            // After 30s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("ERROR: timeout while waiting for good client to confirm JRH"));
            }, 30000);
          });

          const goodClientConfirmedBinarySearch = new Promise(function (resolve, reject) {
            repCycleEthers.on("BinarySearchConfirmed", async (_hash, _nNodes, _jrh, _firstDisagree, event) => {
              if (_hash === rootHash && _nNodes.eq(nNodes) && _jrh === jrh) {
                event.removeListener();
                resolve();
              }
            });

            // After 30s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("ERROR: timeout while waiting for good client to confirm binary search result"));
            }, 30000);
          });

          // Wait for good client to respond to Challenge.
          const goodClientCompleteChallenge = new Promise(function (resolve, reject) {
            repCycleEthers.on("ChallengeCompleted", async (_hash, _nNodes, _jrh, event) => {
              if (_hash === rootHash && _nNodes.eq(nNodes) && _jrh === jrh) {
                event.removeListener();
                resolve();
              }
            });

            // After 30s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("ERROR: timeout while waiting for goodClientToCompleteChallenge"));
            }, 30000);
          });

          await badClient.submitRootHash();
          await goodClientConfirmedJRH;
          await badClient.confirmJustificationRootHash();

          const [, badIndex] = await badClient.getMySubmissionRoundAndIndex();
          const goodIndex = badIndex.add(1).mod(2);
          console.log(goodIndex, badIndex);
          let disputeRound = await repCycle.getDisputeRound(0);
          let badEntry = disputeRound[badIndex];
          let goodEntry = disputeRound[goodIndex];

          while (badEntry.upperBound !== badEntry.lowerBound) {
            if (parseInt(badEntry.challengeStepCompleted, 10) <= parseInt(goodEntry.challengeStepCompleted, 10)) {
              await badClient.respondToBinarySearchForChallenge();
            }
            disputeRound = await repCycle.getDisputeRound(0);
            badEntry = disputeRound[badIndex];
            goodEntry = disputeRound[goodIndex];
          }

          await badClient.confirmBinarySearchResult();

          await goodClientConfirmedBinarySearch;
          // Bad client can't respond
          await checkErrorRevertEthers(badClient.respondToChallenge(), "colony-reputation-mining-decay-incorrect");

          await goodClientCompleteChallenge;

          const goodClientInvalidateOpponent = new Promise(function (resolve, reject) {
            repCycleEthers.on("HashInvalidated", async (_hash, _nNodes, _jrh, event) => {
              console.log("*************", _hash, badRootHash, _nNodes, badNNodes, _jrh, badJrh);
              if (_hash === badRootHash && _nNodes.eq(badNNodes) && _jrh === badJrh) {
                event.removeListener();
                resolve();
              }
            });

            // After 30s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("ERROR: timeout while waiting for HashInvalidated"));
            }, 30000);
          });

          // Forward time
          await forwardTime(600, this);
          // Good client should now realise it can timeout bad submission

          await goodClientInvalidateOpponent;

          // Add a listener to process log for when a new cycle starts, which won't happen yet because the submission window is still open

          const newCycleStart = new Promise(function (resolve, reject) {
            reputationMinerClient._miner.colonyNetwork.on("ReputationMiningCycleComplete", async (_hash, _nNodes, event) => {
              event.removeListener();
              resolve();
            });

            // After 30s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("ERROR: timeout while waiting for new cycle to happen"));
            }, 30000);
          });

          // Forward time again, so the submission window is closed
          await forwardTime(MINING_CYCLE_DURATION * 0.5, this);
          // Good client should realise it can confirm new hash. So we wait for that event.
          await newCycleStart;

          // And finally, check the root hash was accepted as expected.
          const acceptedRootHash = await colonyNetwork.getReputationRootHash();
          assert.equal(acceptedRootHash, rootHash);
        });
      });
    });
