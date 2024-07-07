/* globals hre */

const path = require("path");
const chai = require("chai");
const bnChai = require("bn-chai");
const ethers = require("ethers");

const { TruffleLoader } = require("../../../packages/package-utils");

const { DEFAULT_STAKE, MINING_CYCLE_DURATION, CHALLENGE_RESPONSE_WINDOW_DURATION } = require("../../../helpers/constants");
const {
  forwardTime,
  forwardTimeTo,
  advanceMiningCycleNoContest,
  checkSuccessEthers,
  checkErrorRevertEthers,
  mineBlock,
  finishReputationMiningCycle,
  currentBlock,
  getWaitForNSubmissionsPromise,
  getMiningCycleCompletePromise,
  TestAdapter,
  getBlock,
  web3GetTransactionReceipt,
  web3GetTransaction,
  sleep,
  stopMining,
  startMining,
  getChainId,
} = require("../../../helpers/test-helper");
const {
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  giveUserCLNYTokensAndStake,
  setupClaimedExpenditure,
  fundColonyWithTokens,
} = require("../../../helpers/test-data-generator");
const ReputationMinerClient = require("../../../packages/reputation-miner/ReputationMinerClient");
const ReputationMinerTestWrapper = require("../../../packages/reputation-miner/test/ReputationMinerTestWrapper");
const MaliciousReputationMinerExtraRep = require("../../../packages/reputation-miner/test/MaliciousReputationMinerExtraRep");
const ReputationMinerLongTransactionMined = require("../../../packages/reputation-miner/test/ReputationMinerLongTransactionMined");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const loader = new TruffleLoader({
  contractRoot: path.resolve(__dirname, "..", "..", "..", "artifacts", "contracts"),
});

const realProviderPort = 8545;
let MINER1;
let MINER2;
let MINER3;

hre.__SOLIDITY_COVERAGE_RUNNING
  ? contract.skip
  : contract("Reputation miner client auto enabled functionality", (accounts) => {
      [, , , , , MINER1, MINER2, MINER3] = accounts;

      let colonyNetwork;
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
        const chainId = await getChainId();
        await metaColony.initialiseReputationMining(chainId, ethers.constants.HashZero, 0);

        await advanceMiningCycleNoContest({ colonyNetwork, test: this });
        await setupClaimedExpenditure({ colonyNetwork, colony: metaColony });
        await advanceMiningCycleNoContest({ colonyNetwork, test: this });
        const startingBlock = await currentBlock();
        startingBlockNumber = startingBlock.number;

        goodClient = new ReputationMinerTestWrapper({
          loader,
          realProviderPort,
          minerAddress: _MINER2,
          useJsTree: true,
          // dbPath: "./reputationStates_good.sqlite"
        });
        reputationMinerClient = new ReputationMinerClient({
          loader,
          realProviderPort,
          minerAddress: _MINER1,
          useJsTree: true,
          auto: true,
          oracle: false,
          processingDelay: 1,
        });
      };

      before(async () => {
        await setupNewNetworkInstance(MINER1, MINER2, MINER3);
      });

      beforeEach(async function () {
        await goodClient.initialise(colonyNetwork.address);
        await goodClient.resetDB();
        await goodClient.sync(startingBlockNumber);
        await goodClient.saveCurrentState();
        reputationMinerClient = new ReputationMinerClient({
          loader,
          realProviderPort,
          minerAddress: MINER1,
          useJsTree: true,
          auto: true,
          oracle: false,
          processingDelay: 1,
        });
        await reputationMinerClient.initialise(colonyNetwork.address, startingBlockNumber);
      });

      afterEach(async function () {
        await reputationMinerClient.close();
        const reputationMiningGotClean = await finishReputationMiningCycle(colonyNetwork, this);
        if (!reputationMiningGotClean) await setupNewNetworkInstance(MINER1, MINER2, MINER3);
      });

      describe("core functionality", function () {
        it("should successfully complete a hash submission if it's the only miner", async function () {
          const rootHash = await reputationMinerClient._miner.getRootHash();
          const nLeaves = await reputationMinerClient._miner.getRootHashNLeaves();
          const jrh = await reputationMinerClient._miner.justificationTree.getRootHash();

          const oldHash = await colonyNetwork.getReputationRootHash();

          const repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();
          const receive12Submissions = getWaitForNSubmissionsPromise(repCycleEthers, (await currentBlock()).number, rootHash, nLeaves, jrh, 12);

          // Forward through most of the cycle duration and wait for the client to submit all 12 allowed entries
          await forwardTime(MINING_CYCLE_DURATION * 0.9, this);
          await receive12Submissions;

          const miningCycleComplete = getMiningCycleCompletePromise(
            reputationMinerClient._miner.colonyNetwork,
            (await currentBlock()).number,
            oldHash,
            rootHash,
          );

          // Forward time to the end of the mining cycle and since we are the only miner, check the client confirmed our hash correctly
          await forwardTime(MINING_CYCLE_DURATION * 0.1 + CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
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
            processingDelay: 1,
            // dbPath: "./reputationStates_good.sqlite"
          });

          await oracleClient.initialise(colonyNetwork.address, startingBlockNumber);

          const rootHash = await reputationMinerClient._miner.getRootHash();
          const nLeaves = await reputationMinerClient._miner.getRootHashNLeaves();
          const jrh = await reputationMinerClient._miner.justificationTree.getRootHash();

          const oldHash = await colonyNetwork.getReputationRootHash();

          const repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();
          const receive12Submissions = getWaitForNSubmissionsPromise(repCycleEthers, (await currentBlock()).number, rootHash, nLeaves, jrh, 12);

          // Forward through most of the cycle duration and wait for the client to submit all 12 allowed entries
          await forwardTime(MINING_CYCLE_DURATION * 0.9, this);
          await receive12Submissions;

          const miningCycleComplete = getMiningCycleCompletePromise(
            reputationMinerClient._miner.colonyNetwork,
            (await currentBlock()).number,
            oldHash,
            rootHash,
          );

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
          await forwardTime(MINING_CYCLE_DURATION * 0.1 + MINING_CYCLE_DURATION, this);
          await miningCycleComplete;

          await mineBlock(); // Triggers the client to process the next cycle.

          await oracleUpdated;
          clearTimeout(oracleCheckInterval);

          // Wait until the client has processed the block
          while (reputationMinerClient.lockedForBlockProcessing) {
            await sleep(1000);
          }

          // Check the oracle has the same root hash as the miner after updating
          const oracleHash = await oracleClient._miner.reputationTree.getRootHash();
          const minerHash = await reputationMinerClient._miner.reputationTree.getRootHash();
          assert.equal(oracleHash, minerHash, "The oracle has updated, but does not have the right hash");

          await oracleClient.close();
        });

        it("should successfully resume submitting hashes if it's restarted", async function () {
          const rootHash = await reputationMinerClient._miner.getRootHash();
          const nLeaves = await reputationMinerClient._miner.getRootHashNLeaves();
          const jrh = await reputationMinerClient._miner.justificationTree.getRootHash();

          const oldHash = await colonyNetwork.getReputationRootHash();

          const repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();
          const receive2Submissions = getWaitForNSubmissionsPromise(repCycleEthers, (await currentBlock()).number, rootHash, nLeaves, jrh, 2);

          // Forward through half of the cycle duration and wait for the client to submit some entries
          await forwardTime(MINING_CYCLE_DURATION / 2, this);
          await receive2Submissions; // It might submit a couple more, but that's fine for the purposes of this test.
          await reputationMinerClient.close();

          // start up another one.
          const reputationMinerClient2 = new ReputationMinerClient({
            loader,
            realProviderPort,
            minerAddress: MINER1,
            useJsTree: true,
            auto: true,
            processingDelay: 1,
          });
          await reputationMinerClient2.initialise(colonyNetwork.address, startingBlockNumber);
          const receive12Submissions = getWaitForNSubmissionsPromise(repCycleEthers, (await currentBlock()).number, rootHash, nLeaves, jrh, 12);

          await mineBlock();
          await receive12Submissions;

          const miningCycleComplete = getMiningCycleCompletePromise(
            reputationMinerClient._miner.colonyNetwork,
            (await currentBlock()).number,
            oldHash,
            rootHash,
          );

          // Forward time to the end of the mining cycle and since we are the only miner, check the client confirmed our hash correctly
          await forwardTime(MINING_CYCLE_DURATION * 0.6 + MINING_CYCLE_DURATION, this);
          await miningCycleComplete;
          await reputationMinerClient2.close();
        });

        it("should successfully complete a hash submission if there are 2 good miners", async function () {
          const oldHash = await colonyNetwork.getReputationRootHash();
          const rootHash = await reputationMinerClient._miner.getRootHash();
          const nLeaves = await reputationMinerClient._miner.getRootHashNLeaves();
          const jrh = await reputationMinerClient._miner.justificationTree.getRootHash();

          const repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();
          const receive12Submissions = getWaitForNSubmissionsPromise(repCycleEthers, (await currentBlock()).number, rootHash, nLeaves, jrh, 12);

          // Make a submission from the second client and then await the remaining 11 submissions from the first client
          await goodClient.loadState(oldHash);
          await goodClient.addLogContentsToReputationTree();

          // Forward time and wait for the client to submit all 12 allowed entries
          await forwardTime(MINING_CYCLE_DURATION / 2, this);
          await checkSuccessEthers(goodClient.submitRootHash());
          await receive12Submissions;

          const miningCycleComplete = getMiningCycleCompletePromise(
            reputationMinerClient._miner.colonyNetwork,
            (await currentBlock()).number,
            oldHash,
            rootHash,
          );

          // Forward time to the end of the mining cycle and since we are the only miner, check the client confirmed our hash correctly
          await forwardTime(MINING_CYCLE_DURATION / 2 + CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
          await miningCycleComplete;
        });

        it("miners should be randomised in terms of order of allowed responses each cycle", async function () {
          const reputationMinerClient2 = new ReputationMinerClient({
            loader,
            realProviderPort,
            minerAddress: MINER2,
            useJsTree: true,
            auto: true,
            oracle: false,
            processingDelay: 1,
          });
          await reputationMinerClient.initialise(colonyNetwork.address, startingBlockNumber);
          await reputationMinerClient2.initialise(colonyNetwork.address, startingBlockNumber);

          let differentAddresses = false;
          const completionAddresses = [];
          while (!differentAddresses) {
            const repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();
            const receive12Submissions = getWaitForNSubmissionsPromise(repCycleEthers, (await currentBlock()).number, null, null, null, 12);

            // Forward time and wait for the client to submit all 12 allowed entries
            await forwardTime(MINING_CYCLE_DURATION / 2, this);
            await receive12Submissions;

            let cycleComplete = false;
            let error = false;
            const colonyNetworkEthers = reputationMinerClient._miner.colonyNetwork;
            let completionEvent;
            const miningCycleCompletePromise = new Promise(function (resolve, reject) {
              colonyNetworkEthers.on("ReputationMiningCycleComplete", async (_hash, _nLeaves, event) => {
                await event.removeListener();
                cycleComplete = true;
                completionEvent = event;
                resolve();
              });

              // After 30s, we throw a timeout error
              setTimeout(() => {
                error = true;
                reject(new Error("ERROR: timeout while waiting for confirming hash"));
              }, 30000);
            });

            while (!cycleComplete && !error) {
              await forwardTime(MINING_CYCLE_DURATION / 10);
              await sleep(1000);
            }

            if (error) {
              throw miningCycleCompletePromise;
            }

            const t = await completionEvent.getTransaction();
            completionAddresses.push(t.from);
            // We repeat this loop until both miners have confirmed in different cycles
            if ([...new Set(completionAddresses)].length > 1) {
              differentAddresses = true;
            }
          }
          await reputationMinerClient2.close();
        });

        it("Losing a race shouldn't prevent a miner from continuing", async function () {
          const SUBMISSION_SIG = web3.utils.soliditySha3("submitRootHash(bytes32,uint256,bytes32,uint256)").slice(0, 10);

          const reputationMinerClient2 = new ReputationMinerClient({
            loader,
            realProviderPort,
            minerAddress: MINER3,
            useJsTree: true,
            auto: true,
            oracle: false,
            processingDelay: 1,
          });
          await reputationMinerClient2.initialise(colonyNetwork.address, startingBlockNumber);

          let lostRace = false;
          while (reputationMinerClient.lockedForBlockProcessing || reputationMinerClient2.lockedForBlockProcessing) {
            await sleep(1000);
          }
          reputationMinerClient.lockedForBlockProcessing = true;
          reputationMinerClient2.lockedForBlockProcessing = true;

          let latestBlock = await currentBlock();
          let firstSubmissionBlockNumber = latestBlock.number;

          let repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();
          let receive12Submissions = getWaitForNSubmissionsPromise(repCycleEthers, (await currentBlock()).number, null, null, null, 12);

          await forwardTime(MINING_CYCLE_DURATION / 2, this);
          const oldHash = await colonyNetwork.getReputationRootHash();

          await goodClient.loadState(oldHash);
          await goodClient.addLogContentsToReputationTree();
          for (let i = 0; i < 11; i += 1) {
            await goodClient.submitRootHash();
          }

          await stopMining();
          latestBlock = await currentBlock();

          // Wait until all our block listeners have fired on both clients
          while (
            latestBlock.number !== reputationMinerClient.blockSeenWhileLocked ||
            latestBlock.number !== reputationMinerClient2.blockSeenWhileLocked
          ) {
            await sleep(1000);
            latestBlock = await currentBlock();
          }

          const miner1TxCountBefore = await web3.eth.getTransactionCount(MINER1);
          const miner3TxCountBefore = await web3.eth.getTransactionCount(MINER3);
          let miner1TxCountAfter = miner1TxCountBefore;
          let miner3TxCountAfter = miner3TxCountBefore;

          reputationMinerClient.lockedForBlockProcessing = false;
          reputationMinerClient2.lockedForBlockProcessing = false;

          await mineBlock();
          while (miner1TxCountAfter === miner1TxCountBefore || miner3TxCountAfter === miner3TxCountBefore) {
            await sleep(1000);
            miner1TxCountAfter = await web3.eth.getTransactionCount(MINER1, "pending");
            miner3TxCountAfter = await web3.eth.getTransactionCount(MINER3, "pending");
          }

          await startMining(); // Turn on automining
          await mineBlock(); // Mine the pending transactions

          // Wait until the clients have processed the block
          while (reputationMinerClient.lockedForBlockProcessing || reputationMinerClient2.lockedForBlockProcessing) {
            await sleep(1000);
          }

          // Mine another block, which should trigger submissions (with a processing delay of 1)
          await mineBlock();
          await receive12Submissions;

          // Forward time to the end of the mining cycle and since we are the only miner, check the client confirmed our hash correctly
          await forwardTime(MINING_CYCLE_DURATION / 2 + CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

          await goodClient.confirmNewHash();
          let endBlock = await currentBlock();
          let endBlockNumber = endBlock.number;
          // For every block...
          for (let i = firstSubmissionBlockNumber; i <= endBlockNumber; i += 1) {
            const block = await getBlock(i);
            // Check every transaction...
            for (let txCount = 0; txCount < block.transactions.length; txCount += 1) {
              const txHash = block.transactions[txCount];
              const txReceipt = await web3GetTransactionReceipt(txHash);
              if (!txReceipt.status) {
                // Was it actually a race?
                const tx = await web3GetTransaction(txHash);
                if (tx.input.slice(0, 10) === SUBMISSION_SIG) {
                  lostRace = true;
                }
              }
            }
          }
          // }

          assert(lostRace, "No lostrace seen");

          // So we've now seen a miner lose a race - let's check they can go through a cycle correctly.
          repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();
          receive12Submissions = getWaitForNSubmissionsPromise(repCycleEthers, (await currentBlock()).number, null, null, null, 12);

          latestBlock = await currentBlock();
          firstSubmissionBlockNumber = latestBlock.number;
          // Forward time and wait for the clients to submit all 12 allowed entries
          await forwardTime(MINING_CYCLE_DURATION / 2, this);

          await receive12Submissions;
          endBlock = await currentBlock();
          endBlockNumber = endBlock.number;

          const submissionAddresses = [];

          // For every block...
          for (let i = firstSubmissionBlockNumber; i <= endBlockNumber; i += 1) {
            const block = await getBlock(i);
            // Check every transaction...
            for (let txCount = 0; txCount < block.transactions.length; txCount += 1) {
              const txHash = block.transactions[txCount];
              const tx = await web3GetTransaction(txHash);
              if (tx.input.slice(0, 10) === SUBMISSION_SIG) {
                submissionAddresses.push(tx.from);
              }
            }
          }

          // If we are locked for block processing (for example, after stopping block checks due to an error), this will hang
          // Reset everything to be well behaved before testing the assertion.
          try {
            let count = 0;
            while (reputationMinerClient.lockedForBlockProcessing || reputationMinerClient2.lockedForBlockProcessing) {
              await sleep(1000);
              count += 1;
              if (count > 60) {
                throw new Error("ERROR: timeout while waiting for block processing to finish");
              }
            }
          } catch (err) {
            // If the above timed out, the test probably failed and we need to take manual action to close reputationMinerClient2
            if (err.toString().includes("ERROR: timeout while waiting for block processing to finish")) {
              reputationMinerClient2.lockedForBlockProcessing = false;
            } else {
              throw err;
            }
          }

          await reputationMinerClient2.close();

          if ([...new Set(submissionAddresses)].length === 1) {
            assert(false, "Only one miner address seen");
          }
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
          const nLeaves = await reputationMinerClient._miner.getRootHashNLeaves();
          const jrh = await reputationMinerClient._miner.justificationTree.getRootHash();

          const badRootHash = await badClient.getRootHash();
          const badNLeaves = await badClient.getRootHashNLeaves();
          const badJrh = await badClient.justificationTree.getRootHash();

          const repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();

          const receive12Submissions = getWaitForNSubmissionsPromise(repCycleEthers, (await currentBlock()).number, rootHash, nLeaves, jrh, 12);

          // Forward through most of the cycle duration
          await forwardTime(MINING_CYCLE_DURATION / 2, this);
          await receive12Submissions;

          const goodClientConfirmedJRH = new Promise(function (resolve, reject) {
            repCycleEthers.on("JustificationRootHashConfirmed", async (_hash, _nLeaves, _jrh, event) => {
              if (_hash === rootHash && _nLeaves.eq(nLeaves) && _jrh === jrh) {
                await event.removeListener();
                resolve();
              }
            });

            // After 60s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("ERROR: timeout while waiting for good client to confirm JRH"));
            }, 60000);
          });

          const goodClientConfirmedBinarySearch = new Promise(function (resolve, reject) {
            repCycleEthers.on("BinarySearchConfirmed", async (_hash, _nLeaves, _jrh, _firstDisagree, event) => {
              if (_hash === rootHash && _nLeaves.eq(nLeaves) && _jrh === jrh) {
                await event.removeListener();
                resolve();
              }
            });

            // After 60s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("ERROR: timeout while waiting for good client to confirm binary search result"));
            }, 60000);
          });

          // Wait for good client to respond to Challenge.
          const goodClientCompleteChallenge = new Promise(function (resolve, reject) {
            repCycleEthers.on("ChallengeCompleted", async (_hash, _nLeaves, _jrh, event) => {
              if (_hash === rootHash && _nLeaves.eq(nLeaves) && _jrh === jrh) {
                await event.removeListener();
                resolve();
              }
            });

            // After 60s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("ERROR: timeout while waiting for goodClientToCompleteChallenge"));
            }, 60000);
          });

          await badClient.submitRootHash();
          let disputeRound = await repCycleEthers.getDisputeRound(0);
          const [, badIndex] = await badClient.getMySubmissionRoundAndIndex();
          const goodIndex = badIndex.add(1).mod(2);

          let badEntry = disputeRound[badIndex];
          let goodEntry = disputeRound[goodIndex];
          // Forward time again so clients can start responding to challenges
          await forwardTimeTo(parseInt(goodEntry.lastResponseTimestamp, 10));
          await noEventSeen(repCycleEthers, "JustificationRootHashConfirmed");

          await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

          await mineBlock();
          await goodClientConfirmedJRH;

          await mineBlock();
          await badClient.confirmJustificationRootHash();

          disputeRound = await repCycleEthers.getDisputeRound(0);
          badEntry = disputeRound[badIndex];
          goodEntry = disputeRound[goodIndex];

          function getGoodClientBinarySearchStepPromise() {
            return new Promise(function (resolve, reject) {
              repCycleEthers.on("BinarySearchStep", async (_hash, _nLeaves, _jrh, event) => {
                if (_hash === rootHash && _nLeaves.eq(nLeaves) && _jrh === jrh) {
                  await event.removeListener();
                  resolve();
                }
              });

              // After 30s, we throw a timeout error
              setTimeout(() => {
                reject(new Error("ERROR: timeout while waiting for goodClientBinarySearchStep"));
              }, 30000);
            });
          }

          while (!badEntry.upperBound.eq(badEntry.lowerBound)) {
            await mineBlock();
            const goodClientSearchStepPromise = getGoodClientBinarySearchStepPromise();
            await forwardTimeTo(parseInt(badEntry.lastResponseTimestamp, 10) + CHALLENGE_RESPONSE_WINDOW_DURATION);
            await goodClientSearchStepPromise;
            if (parseInt(badEntry.challengeStepCompleted, 10) <= parseInt(goodEntry.challengeStepCompleted, 10)) {
              await mineBlock();
              await badClient.respondToBinarySearchForChallenge();
            }
            disputeRound = await repCycleEthers.getDisputeRound(0);
            badEntry = disputeRound[badIndex];
            goodEntry = disputeRound[goodIndex];
          }

          await noEventSeen(repCycleEthers, "BinarySearchConfirmed");

          disputeRound = await repCycleEthers.getDisputeRound(0);
          badEntry = disputeRound[badIndex];
          goodEntry = disputeRound[goodIndex];

          await forwardTimeTo(parseInt(badEntry.lastResponseTimestamp, 10) + CHALLENGE_RESPONSE_WINDOW_DURATION + 1);

          await mineBlock();
          await goodClientConfirmedBinarySearch;
          await mineBlock();
          await badClient.confirmBinarySearchResult();

          disputeRound = await repCycleEthers.getDisputeRound(0);
          badEntry = disputeRound[badIndex];

          await forwardTimeTo(parseInt(badEntry.lastResponseTimestamp, 10) + CHALLENGE_RESPONSE_WINDOW_DURATION + 1);

          await mineBlock();
          await goodClientCompleteChallenge;

          const goodClientInvalidateOpponent = new Promise(function (resolve, reject) {
            repCycleEthers.on("HashInvalidated", async (_hash, _nLeaves, _jrh, event) => {
              if (_hash === badRootHash && _nLeaves.eq(badNLeaves) && _jrh === badJrh) {
                await event.removeListener();
                resolve();
              }
            });

            // After 30s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("ERROR: timeout while waiting for HashInvalidated"));
            }, 30000);
          });

          disputeRound = await repCycleEthers.getDisputeRound(0);
          badEntry = disputeRound[badIndex];
          goodEntry = disputeRound[goodIndex];

          const noChallengeCompleted = noEventSeen(repCycleEthers, "ChallengeCompleted");
          const noHashInvalidated = noEventSeen(repCycleEthers, "HashInvalidated");

          await noChallengeCompleted;
          await noHashInvalidated;

          await checkErrorRevertEthers(badClient.respondToChallenge(), "colony-reputation-mining-decay-incorrect");

          // await forwardTimeTo(parseInt(badEntry.lastResponseTimestamp, 10) + CHALLENGE_RESPONSE_WINDOW_DURATION * 2 + 1, this);
          await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

          // Good client should now realise it can timeout bad submission
          await goodClientInvalidateOpponent;
          await mineBlock();
          // Add a listener to process log for when a new cycle starts, which won't happen yet because the submission window is still open

          const newCycleStart = new Promise(function (resolve, reject) {
            reputationMinerClient._miner.colonyNetwork.on("ReputationMiningCycleComplete", async (_hash, _nLeaves, event) => {
              await event.removeListener();
              resolve();
            });

            // After 60s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("ERROR: timeout while waiting for new cycle to happen"));
            }, 60000);
          });

          await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

          // Good client should realise it can confirm new hash. So we wait for that event.
          await newCycleStart;

          // And finally, check the root hash was accepted as expected.
          const acceptedRootHash = await colonyNetwork.getReputationRootHash();
          assert.equal(acceptedRootHash, rootHash);
        });

        it("should load the reputation state and JRH from disk if available", async function () {
          const rootHash = await reputationMinerClient._miner.getRootHash();
          const nLeaves = await reputationMinerClient._miner.getRootHashNLeaves();
          const jrh = await reputationMinerClient._miner.justificationTree.getRootHash();

          const repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();

          // start up another one - does it quick-load pre submission?
          let adapter = new TestAdapter();

          const reputationMinerClient2 = new ReputationMinerClient({
            loader,
            realProviderPort,
            minerAddress: MINER1,
            useJsTree: true,
            auto: true,
            adapter,
            processingDelay: 1,
          });
          await reputationMinerClient2.initialise(colonyNetwork.address, startingBlockNumber);
          expect(adapter.outputs[0]).to.equal("Successfully resumed pre-submission", "The client didn't resume pre-submission");
          await reputationMinerClient2.close();

          const receive2Submissions = getWaitForNSubmissionsPromise(repCycleEthers, (await currentBlock()).number, rootHash, nLeaves, jrh, 2);

          // Forward through half of the cycle duration and wait for the client to submit some entries
          await forwardTime(MINING_CYCLE_DURATION / 2, this);
          await receive2Submissions; // It might submit a couple more, but that's fine for the purposes of this test.
          await reputationMinerClient.close();

          adapter = new TestAdapter();

          // start up another one.
          const reputationMinerClient3 = new ReputationMinerClient({
            loader,
            realProviderPort,
            minerAddress: MINER1,
            useJsTree: true,
            auto: true,
            adapter,
            processingDelay: 1,
          });
          await reputationMinerClient3.initialise(colonyNetwork.address, startingBlockNumber);
          expect(adapter.outputs[0]).to.equal("Successfully resumed mid-submission", "The client didn't resume mid-submission");
          await reputationMinerClient3.close();
        });

        it("should not invalidate ourselves if we're slow to respond", async function () {
          const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree: true, minerAddress: MINER3 }, 1, 0);
          await badClient.initialise(colonyNetwork.address);
          // We need to load the current good state in to the bad client.
          await badClient.sync(startingBlockNumber);
          // make the bad client behave badly again
          badClient.amountToFalsify = 0xfffffffff;

          await badClient.addLogContentsToReputationTree();

          const rootHash = await reputationMinerClient._miner.getRootHash();
          const nLeaves = await reputationMinerClient._miner.getRootHashNLeaves();
          const jrh = await reputationMinerClient._miner.justificationTree.getRootHash();

          const badRootHash = await badClient.getRootHash();
          const badNLeaves = await badClient.getRootHashNLeaves();
          const badJrh = await badClient.justificationTree.getRootHash();

          const repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();

          const receive12Submissions = getWaitForNSubmissionsPromise(repCycleEthers, (await currentBlock()).number, rootHash, nLeaves, jrh, 12);

          // Forward through most of the cycle duration
          await forwardTime(MINING_CYCLE_DURATION / 2, this);
          await receive12Submissions;

          const goodClientConfirmedJRH = new Promise(function (resolve, reject) {
            repCycleEthers.on("JustificationRootHashConfirmed", async (_hash, _nLeaves, _jrh, event) => {
              if (_hash === rootHash && _nLeaves.eq(nLeaves) && _jrh === jrh) {
                await event.removeListener();
                resolve();
              }
            });

            // After 60s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("ERROR: timeout while waiting for good client to confirm JRH"));
            }, 60000);
          });

          await badClient.submitRootHash();

          const openingTimestamp = await repCycleEthers.getReputationMiningWindowOpenTimestamp();

          await forwardTimeTo(openingTimestamp.add(MINING_CYCLE_DURATION), this);
          await noEventSeen(repCycleEthers, "JustificationRootHashConfirmed");

          const goodClientInvalidateOpponent = new Promise(function (resolve, reject) {
            repCycleEthers.on("HashInvalidated", async (_hash, _nLeaves, _jrh, event) => {
              if (_hash === badRootHash && _nLeaves.eq(badNLeaves) && _jrh === badJrh) {
                await event.removeListener();
                resolve();
              }
            });

            // After 60s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("ERROR: timeout while waiting for HashInvalidated"));
            }, 60000);
          });

          const disputeRound = await repCycleEthers.getDisputeRound(0);
          const entry = disputeRound[0];

          // Forward time again so clients can start responding to challenges
          await forwardTimeTo(parseInt(entry.lastResponseTimestamp, 10) + CHALLENGE_RESPONSE_WINDOW_DURATION, this);

          // Good client should now realise it can confirm JRH
          await goodClientConfirmedJRH;
          await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
          // Good client should now relise it can invalidate the bad submission
          await goodClientInvalidateOpponent;
          await mineBlock();
          // Add a listener to process log for when a new cycle starts, which won't happen yet because the submission window is still open

          const newCycleStart = new Promise(function (resolve, reject) {
            reputationMinerClient._miner.colonyNetwork.on("ReputationMiningCycleComplete", async (_hash, _nLeaves, event) => {
              await event.removeListener();
              resolve();
            });

            // After 60s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("ERROR: timeout while waiting for new cycle to happen"));
            }, 60000);
          });

          await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

          // Good client should realise it can confirm new hash. So we wait for that event.
          await newCycleStart;

          // And finally, check the root hash was accepted as expected.
          const acceptedRootHash = await colonyNetwork.getReputationRootHash();
          assert.equal(acceptedRootHash, rootHash);
        });

        it("should successfully resume a dispute resolution", async function () {
          const badClient = new MaliciousReputationMinerExtraRep({ loader, realProviderPort, useJsTree: true, minerAddress: MINER3 }, 1, 0);
          await badClient.initialise(colonyNetwork.address);
          // We need to load the current good state in to the bad client.
          await badClient.sync(startingBlockNumber);
          // make the bad client behave badly again
          badClient.amountToFalsify = 0xfffffffff;

          await badClient.addLogContentsToReputationTree();

          const rootHash = await reputationMinerClient._miner.getRootHash();
          const nLeaves = await reputationMinerClient._miner.getRootHashNLeaves();
          const jrh = await reputationMinerClient._miner.justificationTree.getRootHash();

          const badRootHash = await badClient.getRootHash();
          const badNLeaves = await badClient.getRootHashNLeaves();
          const badJrh = await badClient.justificationTree.getRootHash();

          const repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();

          const receive12Submissions = getWaitForNSubmissionsPromise(repCycleEthers, (await currentBlock()).number, rootHash, nLeaves, jrh, 12);
          const openingTimestamp = await repCycleEthers.getReputationMiningWindowOpenTimestamp();

          // Forward through most of the cycle duration
          await forwardTimeTo(openingTimestamp.add(MINING_CYCLE_DURATION / 2), this);
          await receive12Submissions;

          await reputationMinerClient.close();

          await badClient.submitRootHash();

          // Forward time again so clients can start responding to challenges
          await forwardTimeTo(openingTimestamp.add(MINING_CYCLE_DURATION));
          await noEventSeen(repCycleEthers, "JustificationRootHashConfirmed");

          const reputationMinerClient2 = new ReputationMinerClient({
            loader,
            realProviderPort,
            minerAddress: MINER1,
            useJsTree: true,
            auto: true,
            processingDelay: 1,
          });
          await reputationMinerClient2.initialise(colonyNetwork.address, startingBlockNumber);

          const goodClientConfirmedJRH = new Promise(function (resolve, reject) {
            repCycleEthers.on("JustificationRootHashConfirmed", async (_hash, _nLeaves, _jrh, event) => {
              if (_hash === rootHash && _nLeaves.eq(nLeaves) && _jrh === jrh) {
                await event.removeListener();
                resolve();
              }
            });

            // After 60s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("ERROR: timeout while waiting for good client to confirm JRH"));
            }, 60000);
          });

          await forwardTimeTo(openingTimestamp.add(MINING_CYCLE_DURATION + CHALLENGE_RESPONSE_WINDOW_DURATION + 1), this);

          await goodClientConfirmedJRH;

          const goodClientInvalidateOpponent = new Promise(function (resolve, reject) {
            repCycleEthers.on("HashInvalidated", async (_hash, _nLeaves, _jrh, event) => {
              if (_hash === badRootHash && _nLeaves.eq(badNLeaves) && _jrh === badJrh) {
                await event.removeListener();
                resolve();
              }
            });

            // After 30s, we throw a timeout error
            setTimeout(() => {
              reject(new Error("ERROR: timeout while waiting for HashInvalidated"));
            }, 30000);
          });

          const disputeRound = await repCycleEthers.getDisputeRound(0);
          const [, badIndex] = await badClient.getMySubmissionRoundAndIndex();

          const badEntry = disputeRound[badIndex];

          // Bad entry timestamp + CHALLENGE_RESPONSE_WINDOW_DURATION is the earliest time we can invalidate
          // the bad entry. After an additional CHALLENGE_RESPONSE_WINDOW_DURATION, we are guaranteed to be able to invalidate.

          await forwardTimeTo(parseInt(badEntry.lastResponseTimestamp, 10) + CHALLENGE_RESPONSE_WINDOW_DURATION * 2, this);

          // Good client should now realise it can timeout bad submission
          await goodClientInvalidateOpponent;

          // Add a listener to process log for when a new cycle starts, which won't happen yet because the submission window is still open

          const newCycleStart = getMiningCycleCompletePromise(reputationMinerClient._miner.colonyNetwork, (await currentBlock()).number);

          await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

          // Good client should realise it can confirm new hash. So we wait for that event.
          await newCycleStart;

          // And finally, check the root hash was accepted as expected.
          const acceptedRootHash = await colonyNetwork.getReputationRootHash();
          assert.equal(acceptedRootHash, rootHash);
          await reputationMinerClient2.close();
        });

        it(`should continue to mine successfully even if the submission hash takes a long time to be mined
          (e.g. because it ran out of funds)`, async function () {
          let repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();
          let openingTimestamp = parseInt(await repCycleEthers.getReputationMiningWindowOpenTimestamp(), 10);
          // Advance through a reputation cycle
          let rootHash = await reputationMinerClient._miner.getRootHash();

          let receive12Submissions = getWaitForNSubmissionsPromise(repCycleEthers, (await currentBlock()).number, null, null, null, 12);

          const delayedReputationMinerClient = new ReputationMinerClient({
            loader,
            realProviderPort,
            minerAddress: MINER2,
            useJsTree: true,
            auto: true,
            oracle: false,
            processingDelay: 1,
          });
          // That client is fine until we give it an awkward miner
          delayedReputationMinerClient._miner = new ReputationMinerLongTransactionMined({
            minerAddress: MINER2,
            loader,
            realProviderPort,
            useJsTree: true,
          });

          await delayedReputationMinerClient.initialise(colonyNetwork.address, startingBlockNumber);

          // Forward through most of the cycle duration and wait for the clients to submit all 12 allowed entries
          await forwardTimeTo(openingTimestamp + MINING_CYCLE_DURATION * 0.9, this);
          await receive12Submissions;

          let oldHash = await colonyNetwork.getReputationRootHash();

          let miningCycleComplete = getMiningCycleCompletePromise(
            reputationMinerClient._miner.colonyNetwork,
            (await currentBlock()).number,
            oldHash,
            rootHash,
          );

          // Forward time to the end of the mining cycle and since we are the only miner, check the client confirmed our hash correctly
          await forwardTimeTo(openingTimestamp + MINING_CYCLE_DURATION + CHALLENGE_RESPONSE_WINDOW_DURATION, this);
          await miningCycleComplete;

          // Advance through another - the client should still be waiting for the first transaction to return.
          repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();
          openingTimestamp = parseInt(await repCycleEthers.getReputationMiningWindowOpenTimestamp(), 10);

          receive12Submissions = getWaitForNSubmissionsPromise(repCycleEthers, (await currentBlock()).number, null, null, null, 12);

          await forwardTimeTo(openingTimestamp + MINING_CYCLE_DURATION * 0.9, this);
          await receive12Submissions;

          rootHash = await reputationMinerClient._miner.getRootHash();
          oldHash = await colonyNetwork.getReputationRootHash();
          miningCycleComplete = getMiningCycleCompletePromise(
            reputationMinerClient._miner.colonyNetwork,
            (await currentBlock()).number,
            oldHash,
            rootHash,
          );

          await forwardTimeTo(openingTimestamp + MINING_CYCLE_DURATION + CHALLENGE_RESPONSE_WINDOW_DURATION, this);
          await miningCycleComplete;

          // We now resolve the original
          delayedReputationMinerClient._miner.resolveSubmission();

          // And then we get both clients to process the newest cycle. The good miner will update normally.
          // In the case of the delayedReputationMinerClient, we expect it to recognise something has gone
          // wrong, and resync.

          repCycleEthers = await reputationMinerClient._miner.getActiveRepCycle();
          openingTimestamp = parseInt(await repCycleEthers.getReputationMiningWindowOpenTimestamp(), 10);

          receive12Submissions = getWaitForNSubmissionsPromise(repCycleEthers, (await currentBlock()).number, null, null, null, 12);

          await forwardTimeTo(openingTimestamp + MINING_CYCLE_DURATION * 0.9, this);
          await receive12Submissions;

          // check delayed miner and good miner have ended up in the same state.
          const rootHash2 = await reputationMinerClient._miner.getRootHash();
          const rootHash3 = await delayedReputationMinerClient._miner.getRootHash();
          expect(rootHash2).to.equal(rootHash3);

          delayedReputationMinerClient._miner.resolveSubmission();
          await delayedReputationMinerClient.close();
        });

        function noEventSeen(contract, event) {
          return new Promise(function (resolve, reject) {
            let listener;
            contract.on(event, async () => {
              await contract.off(event, listener);
              reject(new Error(`ERROR: The event ${event} was unexpectedly seen`));
            });
            [listener] = contract.listeners(event).slice(-1);
            setTimeout(async () => {
              await contract.off(event, listener);
              resolve();
            }, 5000);
          });
        }
      });
    });
