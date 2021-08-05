const ethers = require("ethers");
const express = require("express");
const path = require('path');
const request = require('request-promise');
const ConsoleAdapter = require('./adapters/console').default;

const ReputationMiner = require("./ReputationMiner");

const minStake = ethers.BigNumber.from(10).pow(18).mul(2000); // eslint-disable-line prettier/prettier
const MINUTE_IN_SECONDS = 60;
const disputeStages = {
 CONFIRM_JRH: 0,
 BINARY_SEARCH_RESPONSE: 1,
 BINARY_SEARCH_CONFIRM: 2,
 RESPOND_TO_CHALLENGE: 3,
 INVALIDATE_HASH: 4,
 CONFIRM_NEW_HASH: 5
}

class ReputationMinerClient {
  /**
   * Constructor for ReputationMiner
   * @param {string} minerAddress            The address that is staking CLNY that will allow the miner to submit reputation hashes
   * @param {Object} loader                  The loader for loading the contract interfaces. Usually a TruffleLoader
   * @param {Number} [realProviderPort]      The port that the RPC node with the ability to sign transactions from `minerAddress` is responding on. The address is assumed to be `localhost`.
   * @param {Number} oraclePort              The port the reputation oracle will serve on
   * @param {string} privateKey              The private key of the address that is mining, allowing the miner to sign transactions.
   *                                         If used, `minerAddress` is not needed and will be derived.
   * @param {Object} provider                Ethers Provider that allows access to an ethereum node.
   * @param {bool}   useJsTree               Whether to use the Javascript Patricia tree implementation (true) or the solidity implementation (false)
   * @param {string} dbPath                  Path where to save the database
   * @param {bool}   auto                    Whether to automatically submit hashes and respond to challenges
   * @param {bool}   oracle                  Whether to serve requests as a reputation oracle or not
   * @param {bool}   exitOnError             Whether to exit when an error is hit or not.
   * @param {Object} adapter                 An object with .log and .error that controls where the output from the miner ends up.
   */
  constructor({ minerAddress, loader, realProviderPort, oraclePort = 3000, privateKey, provider, useJsTree, dbPath, auto, oracle, exitOnError, adapter, processingDelay }) { // eslint-disable-line max-len
    this._loader = loader;
    this._miner = new ReputationMiner({ minerAddress, loader, provider, privateKey, realProviderPort, useJsTree, dbPath });
    this._auto = auto;
    this._oracle = oracle;
    this._exitOnError = exitOnError;
    this.submissionIndex = 0;
    this.blocksSinceCycleCompleted = 0;
    this.best12Submissions = [];
    this.lockedForBlockProcessing;
    this._adapter = adapter;
    this._processingDelay = processingDelay;
    this.oraclePort = oraclePort;

    if (typeof this._processingDelay === "undefined") {
      this._processingDelay = 10;
    }

    if (typeof this._auto === "undefined") {
      this._auto = true;
    }

    if (typeof this._oracle === "undefined") {
      this._oracle = true;
    }

    if (typeof this._adapter === "undefined" ) {
      this._adapter = ConsoleAdapter;
    }

    if (this._oracle) {
      this._app = express();

      this._app.use(function(req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        next();
      });

      this._app.get("/", async (req, res) => {
        return res.status(200).sendFile(path.join(__dirname, 'viz/index.html'));
      });

      // Serve visualizers
      this._app.get("/repTree", async (req, res) => {
        return res.status(200).sendFile(path.join(__dirname, 'viz/repTree.html'));
      });

      this._app.get("/repCycle", async (req, res) => {
        return res.status(200).sendFile(path.join(__dirname, 'viz/repCycle.html'));
      });

      // Serve data for visualizers
      this._app.get("/reputations", async (req, res) => {
        const rootHash = await this._miner.getRootHash();
        const reputations = Object.keys(this._miner.reputations).map(key => {
          const decimalValue = ethers.BigNumber.from(`0x${this._miner.reputations[key].slice(2, 66)}`, 16).toString();
          return { key, decimalValue }
        })
        return res.status(200).send({ rootHash, reputations });
      });

      this._app.get("/network", async (req, res) => {
        return res.status(200).send(this._miner.realProvider._network.name); // eslint-disable-line no-underscore-dangle
      });

      this._app.get("/repCycleContractDef", async (req, res) => {
        return res.status(200).send(this._miner.repCycleContractDef);
      });

      this._app.get("/repCycleAddresses", async (req, res) => {
        const activeAddr = await this._miner.colonyNetwork.getReputationMiningCycle(true);
        const inactiveAddr = await this._miner.colonyNetwork.getReputationMiningCycle(false);
        return res.status(200).send({ active: activeAddr, inactive: inactiveAddr });
      });

      // Query users who have given reputation in colony
      this._app.get("/:rootHash/:colonyAddress/:skillId/", async (req, res) => {
        if (
          !ethers.utils.isHexString(req.params.rootHash) ||
          !ethers.utils.isHexString(req.params.colonyAddress) ||
          !ethers.BigNumber.from(req.params.skillId)
        ) {
          return res.status(400).send({ message: "One of the parameters was incorrect" });
        }
        const addresses = await this._miner.getAddressesWithReputation(req.params.rootHash, req.params.colonyAddress, req.params.skillId);
        try {
          return res.status(200).send({ addresses });
        } catch (err) {
          return res.status(500).send({ message: "An error occurred querying the reputation" });
        }
      });

      // Query specific reputation values
      this._app.get("/:rootHash/:colonyAddress/:skillId/:userAddress", async (req, res) => {
        if (
          !ethers.utils.isHexString(req.params.rootHash) ||
          !ethers.utils.isHexString(req.params.colonyAddress) ||
          !ethers.utils.isHexString(req.params.userAddress) ||
          !ethers.BigNumber.from(req.params.skillId)
        ) {
          return res.status(400).send({ message: "One of the parameters was incorrect" });
        }

        const key = ReputationMiner.getKey(req.params.colonyAddress, req.params.skillId, req.params.userAddress);
        const currentHash = await this._miner.getRootHash();
        if (currentHash === req.params.rootHash) {
          if (this._miner.reputations[key]) {
            const proof = await this._miner.getReputationProofObject(key);
            delete proof.NLeaves;
            proof.reputationAmount = ethers.BigNumber.from(`0x${proof.value.slice(2, 66)}`).toString();
            return res.status(200).send(proof);
          }
          return res.status(400).send({ message: "Requested reputation does not exist" });
        }

        try {
          const historicalProof = await this._miner.getHistoricalProofAndValue(req.params.rootHash, key);
          if (historicalProof instanceof Error) {
            return res.status(400).send({ message: historicalProof.message.replace("Error: ") });
          }
          const [branchMask, siblings, value] = historicalProof;
          const proof = { branchMask: `${branchMask.toString(16)}`, siblings, key, value };
          proof.reputationAmount = ethers.BigNumber.from(`0x${proof.value.slice(2, 66)}`).toString();
          return res.status(200).send(proof);
        } catch (err) {
          return res.status(500).send({ message: "An error occurred querying the reputation" });
        }
      });
    }
  }

  /**
   * Initialises the mining client so that it knows where to find the `ColonyNetwork` contract
   * @param  {string}  colonyNetworkAddress The address of the current `ColonyNetwork` contract
   * @return {Promise}
   */
  async initialise(colonyNetworkAddress, startingBlock) {
    this.resolveBlockChecksFinished = undefined;
    await this._miner.initialise(colonyNetworkAddress);

    // Get latest state from database if available, otherwise sync to current state on-chain
    const latestReputationHash = await this._miner.colonyNetwork.getReputationRootHash();
    await this._miner.createDB();
    await this._miner.loadState(latestReputationHash);
    if (this._miner.nReputations.eq(0)) {
      this._adapter.log("No existing reputations found - starting from scratch");
      await this._miner.sync(startingBlock, true);
    }

    this.gasBlockAverages = [];

    // Initial call to process the existing log from the cycle we're currently in
    await this.processReputationLog();
    this._miner.realProvider.polling = true;
    this._miner.realProvider.pollingInterval = 1000;

    this.blockTimeoutCheck = setTimeout(this.reportBlockTimeout.bind(this), 300000);

    // Work out when the confirm timeout should be.
    const repCycle = await this._miner.getActiveRepCycle();
    await this._miner.updatePeriodLength(repCycle);

    await this.setMiningCycleTimeout(repCycle);

    this.miningCycleAddress = repCycle.address;

    if (this._auto) {
      this.best12Submissions = await this.getTwelveBestSubmissions();

      // Have we already submitted any of these? Need to update submissionIndex if so
      const block = await this._miner.realProvider.getBlock('latest');
      // Ensure the submission index is reset to the correct point in the best12Submissions array
      this.submissionIndex = 0;
      for (let i = 0; i < this.best12Submissions.length; i += 1 ){
        if (block.timestamp >= this.best12Submissions[i].timestamp) {
          const {entryIndex} = this.best12Submissions[i];
          const entryIndexAlreadySubmitted = await repCycle.minerSubmittedEntryIndex(this._miner.minerAddress, entryIndex);
          if (entryIndexAlreadySubmitted) {
            this.submissionIndex += 1
          } else {
            break;
          }
        }
      }
    }
    // Set up the listener to take actions on each block
    this.lockedForBlockProcessing = false;
    this._miner.realProvider.on('block', this.doBlockChecks.bind(this));

    const network = await this._miner.realProvider.getNetwork();
    this.chainId = network.chainId;

    this._adapter.log("🏁 Initialised");
    if (this._oracle) {
      this.server = this._app.listen(this.oraclePort, () => {
       this._adapter.log(`⭐️ Reputation oracle running on port ${this.server.address().port}`);
     });
    }
  }

  async updateGasEstimate(type) {
    if (this.chainId === 100){
      this._miner.gasPrice = ethers.utils.hexlify(1000000000);
      return;
    }
    // Get latest from ethGasStation
    const options = {
      uri: 'https://ethgasstation.info/json/ethgasAPI.json',
      headers: {
          'User-Agent': 'Request-Promise'
      },
      json: true // Automatically parses the JSON string in the response
    };
    try {
      const gasEstimates = await request(options);

      if (gasEstimates[type]){
        this._miner.gasPrice = ethers.utils.hexlify(gasEstimates[type] / 10 * 1e9);
      } else {
        this._miner.gasPrice = ethers.utils.hexlify(20000000000);
      }
    } catch (err) {
      this._adapter.error(`Error during gas estimation: ${err}`);
      this._miner.gasPrice = ethers.utils.hexlify(20000000000);
    }
  }

  /**
   * Navigate through the mining process logic used when the client is in auto mode.
   * Up to 12 submissions of our current proposed Hash/nLeaves/JRH are made at the earliest block possible
   * Once any disputes are resolved and mining window has closed, we confirm the last remaining hash
   * @param  {Number}  blockNumber The block number we are currently acting on
   * @return {Promise}
   */
  async doBlockChecks(blockNumber) {
    try {
      if (this.lockedForBlockProcessing) {
        this.blockSeenWhileLocked = blockNumber;
        return;
      }
      this.blockSeenWhileLocked = false;
      this.lockedForBlockProcessing = true;
      // DO NOT PUT ANY AWAITS ABOVE THIS LINE OR YOU WILL GET RACE CONDITIONS
      // When you leave this function, make sure to call this.endDoBlockChecks() to unlock

      if (this.blockTimeoutCheck) {
        clearTimeout(this.blockTimeoutCheck);
      }

      const block = await this._miner.realProvider.getBlock(blockNumber);
      const addr = await this._miner.colonyNetwork.getReputationMiningCycle(true);

      const repCycle = new ethers.Contract(addr, this._miner.repCycleContractDef.abi, this._miner.realWallet);
      if (addr !== this.miningCycleAddress) {
        // Then the cycle has completed since we last checked.
        if (this.confirmTimeoutCheck) {
          clearTimeout(this.confirmTimeoutCheck);
        }
        await this._miner.updatePeriodLength(repCycle);

        // If we don't see this next cycle completed at an appropriate time, then report it

        await this.setMiningCycleTimeout(repCycle);

        // Let's process the reputation log if it's been this._processingDelay blocks
        if (this.blocksSinceCycleCompleted < this._processingDelay) {
          this.blocksSinceCycleCompleted += 1;
		      if (this.blocksSinceCycleCompleted === 1) {
            this._adapter.log(`⏰ Waiting for ${this._processingDelay} blocks before processing next log`)
          };
          this.endDoBlockChecks();
          return;
        }
        await this.processReputationLog();

        // And if appropriate, sort out our potential submissions for the next cycle.
        if (this._auto){
          this.best12Submissions = await this.getTwelveBestSubmissions();
          this.submissionIndex = 0; // Reset that we've not submitted any
        }

        this.miningCycleAddress = addr;
        this.blocksSinceCycleCompleted = 0;
      }

      // If we're not auto-mining, then we don't need to do anything else.
      if (!this._auto) {
        this.endDoBlockChecks();
        return;
      }

      const hash = await this._miner.getRootHash();
      const NLeaves = await this._miner.getRootHashNLeaves();
      const jrh = await this._miner.justificationTree.getRootHash();
      const nHashSubmissions = await repCycle.getNSubmissionsForHash(hash, NLeaves, jrh);

      // If less than 12 submissions have been made, submit at our next best possible time
      if (nHashSubmissions.lt(12) && this.best12Submissions[this.submissionIndex]) {
        if (block.timestamp >= this.best12Submissions[this.submissionIndex].timestamp) {
          const {entryIndex} = this.best12Submissions[this.submissionIndex];
          const canSubmit = await this._miner.submissionPossible(entryIndex);
          if (canSubmit) {
            this._adapter.log("⏰ Looks like it's time to submit an entry to the current cycle");
            this.submissionIndex += 1;
            await this.updateGasEstimate('safeLow');
            await this.submitEntry(entryIndex);
          }
        }
      }

      const windowOpened = await repCycle.getReputationMiningWindowOpenTimestamp();

      const nUniqueSubmittedHashes = await repCycle.getNUniqueSubmittedHashes();
      const nInvalidatedHashes = await repCycle.getNInvalidatedHashes();
      const lastHashStanding = nUniqueSubmittedHashes.sub(nInvalidatedHashes).eq(1);

      // We are in a state of dispute! Run through the process.
      if (!lastHashStanding && !nUniqueSubmittedHashes.isZero()) {
        // Is what we believe to be the right submission being disputed?
        const [round, index] = await this._miner.getMySubmissionRoundAndIndex();
        const disputeRound = await repCycle.getDisputeRound(round);
        const entry = disputeRound[index];
        const submission = await repCycle.getReputationHashSubmission(entry.firstSubmitter);

        // Do we have an opponent?
        const oppIndex = index.mod(2).isZero() ? index.add(1) : index.sub(1);
        // this._adapter.log(`oppIndex ${oppIndex}`);
        const oppEntry = disputeRound[oppIndex];
        // this._adapter.log(`oppEntry ${oppEntry}`);
        const oppSubmission = await repCycle.getReputationHashSubmission(oppEntry.firstSubmitter);

        if (oppSubmission.proposedNewRootHash === ethers.constants.AddressZero){
          const responsePossible = await repCycle.getResponsePossible(disputeStages.INVALIDATE_HASH, entry.lastResponseTimestamp);
          if (!responsePossible) { return; }
          // Then we don't have an opponent
          if (round.eq(0)) {
            // We can only advance if the window is closed
            if (ethers.BigNumber.from(block.timestamp).sub(windowOpened).lt(this._miner.getMiningCycleDuration())) {
              this.endDoBlockChecks();
              return;
            };
          } else {
            // We can only advance if the previous round is complete
            const previousRoundComplete = await repCycle.challengeRoundComplete(round - 1);
            if (!previousRoundComplete) {
              this.endDoBlockChecks();
              return;
            }
          }
          await this.updateGasEstimate('safeLow');
          await repCycle.invalidateHash(round, oppIndex, {"gasPrice": this._miner.gasPrice});
          this.endDoBlockChecks();
          return;
        }

        // If we're here, we do have an opponent.
        // Has our opponent timed out?
        // TODO: Remove these magic numbers

        const opponentTimeout = ethers.BigNumber.from(block.timestamp).sub(oppEntry.lastResponseTimestamp).gte(600);
        if (opponentTimeout){
          const responsePossible = await repCycle.getResponsePossible(
            disputeStages.INVALIDATE_HASH,
            ethers.BigNumber.from(oppEntry.lastResponseTimestamp).add(600)
          );
          if (responsePossible) {
            // If so, invalidate them.
            await this.updateGasEstimate('safeLow');
            await repCycle.invalidateHash(round, oppIndex, {"gasPrice": this._miner.gasPrice});
            this.endDoBlockChecks();
            return;
          }
        }
        // this._adapter.log(oppSubmission);

        // Our opponent hasn't timed out yet. We should check if we can respond to something though
        // 1. Do we still need to confirm JRH?
        if (submission.jrhNLeaves.eq(0)) {
          const responsePossible = await repCycle.getResponsePossible(disputeStages.CONFIRM_JRH, entry.lastResponseTimestamp);
          if (responsePossible){
            await this.updateGasEstimate('fast');
            await this._miner.confirmJustificationRootHash();
          }
        // 2. Are we in the middle of a binary search?
        // Check our opponent has confirmed their JRH, and the binary search is ongoing.
        } else if (!oppSubmission.jrhNLeaves.eq(0) && !entry.upperBound.eq(entry.lowerBound)){
          // Yes. Are we able to respond?
          // We can respond if neither of us have responded to this stage yet or
          // if they have responded already
          if (oppEntry.challengeStepCompleted.gte(entry.challengeStepCompleted)) {
            const responsePossible = await repCycle.getResponsePossible(disputeStages.BINARY_SEARCH_RESPONSE, entry.lastResponseTimestamp);
            if (responsePossible){
              await this.updateGasEstimate('fast');
              await this._miner.respondToBinarySearchForChallenge();
            }
          }
        // 3. Are we at the end of a binary search and need to confirm?
        // Check that our opponent has finished the binary search, check that we have, and check we've not confirmed yet
        } else if (
          oppEntry.upperBound.eq(oppEntry.lowerBound) &&
          entry.upperBound.eq(entry.lowerBound) &&
          ethers.BigNumber.from(2).pow(entry.challengeStepCompleted.sub(2)).lte(submission.jrhNLeaves)
        )
        {
          const responsePossible = await repCycle.getResponsePossible(disputeStages.BINARY_SEARCH_CONFIRM, entry.lastResponseTimestamp);
          if (responsePossible){
            await this.updateGasEstimate('fast');
            await this._miner.confirmBinarySearchResult();
          }
        // 4. Is the binary search confirmed, and we need to respond to challenge?
        // Check our opponent has confirmed their binary search result, check that we have too, and that we've not responded to this challenge yet
        } else if (
            ethers.BigNumber.from(2).pow(oppEntry.challengeStepCompleted.sub(2)).gt(oppSubmission.jrhNLeaves) &&
            ethers.BigNumber.from(2).pow(entry.challengeStepCompleted.sub(2)).gt(submission.jrhNLeaves) &&
            ethers.BigNumber.from(2).pow(entry.challengeStepCompleted.sub(3)).lte(submission.jrhNLeaves)
          )
        {
          const responsePossible = await repCycle.getResponsePossible(disputeStages.RESPOND_TO_CHALLENGE, entry.lastResponseTimestamp);
          if (responsePossible){
            await this.updateGasEstimate('fast');
            await this._miner.respondToChallenge();
          }
        }
      }

      if (lastHashStanding && ethers.BigNumber.from(block.timestamp).sub(windowOpened).gte(this._miner.getMiningCycleDuration())) {
        // If the submission window is closed and we are the last hash, confirm it
        const [round, index] = await this._miner.getMySubmissionRoundAndIndex();
        const disputeRound = await repCycle.getDisputeRound(round);
        const entry = disputeRound[index];

        const responsePossible = await repCycle.getResponsePossible(disputeStages.CONFIRM_NEW_HASH, entry.lastResponseTimestamp);
        if (responsePossible){
          await this.updateGasEstimate('average');
          await this.confirmEntry();
        }
      }
      this.endDoBlockChecks();
    } catch (err) {
      this._adapter.error(`Error during block checks: ${err}`);
      // If it's out-of-ether...
      if (err.toString().indexOf('does not have enough funds') >= 0 ) {
        // This could obviously be much better in the future, but for now, we'll settle for this not triggering a restart loop.
        this._adapter.error(`Block checks suspended due to not enough Ether. Send ether to \`${this._miner.minerAddress}\`, then restart the miner`);
      } else if (this._exitOnError) {
          process.exit(1);
          // Note we don't call this.endDoBlockChecks here... this is a deliberate choice on my part; depending on what the error is,
          // we might no longer be in a sane state, and might have only half-processed the reputation log, or similar. So playing it safe,
          // and not unblocking the doBlockCheck function.
      }
    }
  }

  endDoBlockChecks() {
    if (this.resolveBlockChecksFinished){
      this.resolveBlockChecksFinished();
    }
    this.blockTimeoutCheck = setTimeout(this.reportBlockTimeout.bind(this), 300000);
    this.lockedForBlockProcessing = false;
    if (this.blockSeenWhileLocked){
      // NB Not an async call - we do not want to wait here for the block checks to complete.
      this.doBlockChecks(this.blockSeenWhileLocked);
    }
  }

  async close() {
    this._miner.realProvider.polling = false;

    const blockChecksFinished = new Promise((resolve) => {
      this.resolveBlockChecksFinished = resolve;
    });

    this._miner.realProvider.removeAllListeners('block');
    const blockListenerCount = this._miner.realProvider.listenerCount('block');
    if(blockListenerCount !== 0) {
      this._adapter.error("ERROR: on block listener not removed on client close");
    }

    if (this.server){
      this.server.close();
    }

    if (this.lockedForBlockProcessing) {
      await blockChecksFinished;
    }

    if (this.blockTimeoutCheck) {
      clearTimeout(this.blockTimeoutCheck);
    }

    if (this.confirmTimeoutCheck) {
      clearTimeout(this.confirmTimeoutCheck);
    }

  }

  async processReputationLog() {
    this._adapter.log("📁 Processing reputation update log");
    await this._miner.addLogContentsToReputationTree();
    this._adapter.log("💾 Writing new reputation state to database");
    await this._miner.saveCurrentState();
  }

  async getTwelveBestSubmissions() {
    const addr = await this._miner.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, this._miner.repCycleContractDef.abi, this._miner.realWallet);

    const balance = await this._miner.tokenLocking.getObligation(
      this._miner.minerAddress,
      this._miner.clnyAddress,
      this._miner.colonyNetwork.address
    );

    const reputationMiningWindowOpenTimestamp = await repCycle.getReputationMiningWindowOpenTimestamp();
    const rootHash = await this._miner.getRootHash();

    const timeAbleToSubmitEntries = [];
    for (let i = ethers.BigNumber.from(1); i.lte(balance.div(minStake)); i = i.add(1)) {
      const entryHash = await repCycle.getEntryHash(this._miner.minerAddress, i, rootHash);
      const timeAbleToSubmitEntry = ethers.BigNumber.from(entryHash).div(this._miner.constant).add(reputationMiningWindowOpenTimestamp);

      const validEntry = {
        timestamp: timeAbleToSubmitEntry,
        entryIndex: i
      }
      timeAbleToSubmitEntries.push(validEntry);
    }

    timeAbleToSubmitEntries.sort(function (a, b) {
      return a.timestamp.sub(b.timestamp).toNumber();
    });

    const maxEntries = Math.min(12, timeAbleToSubmitEntries.length);

    return timeAbleToSubmitEntries.slice(0, maxEntries);
  }

  async setMiningCycleTimeout(repCycle){
    const openTimestamp = await repCycle.getReputationMiningWindowOpenTimestamp();
    this.confirmTimeoutCheck = setTimeout(
      this.reportConfirmTimeout.bind(this),
      (this._miner.getMiningCycleDuration() + 10 * MINUTE_IN_SECONDS - (Date.now() / 1000 - openTimestamp)) * 1000
    );
  }

  async submitEntry(entryIndex) {
    const rootHash = await this._miner.getRootHash();
    this._adapter.log(`#️⃣ Miner ${this._miner.minerAddress} submitting new reputation hash ${rootHash} at entry index ${entryIndex.toNumber()}`);

    // Submit hash
    let submitRootHashTx = await this._miner.submitRootHash(entryIndex);
    if (!submitRootHashTx.nonce) {
      // Assume we've been given back the submitRootHashTx hash.
      submitRootHashTx = await this._miner.realProvider.getTransaction(submitRootHashTx);
    }
    this._adapter.log(`⛏️ Transaction waiting to be mined ${submitRootHashTx.hash}`);

    await submitRootHashTx.wait();
    this._adapter.log("🆗 New reputation hash submitted successfully");
  }

  async confirmEntry() {
    const addr = await this._miner.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, this._miner.repCycleContractDef.abi, this._miner.realWallet);

    this._adapter.log("⏰ Looks like it's time to confirm the new hash");
    // Confirm hash
    const [round] = await this._miner.getMySubmissionRoundAndIndex();
    if (round && round.gte(0)) {
      const gasEstimate = await repCycle.estimateGas.confirmNewHash(round);

      const confirmNewHashTx = await repCycle.confirmNewHash(round, { gasLimit: gasEstimate, gasPrice: this._miner.gasPrice });
      this._adapter.log(`⛏️ Transaction waiting to be mined ${confirmNewHashTx.hash}`);
      await confirmNewHashTx.wait();
      this._adapter.log("✅ New reputation hash confirmed");
    }
  }

  async reportBlockTimeout() {
    this._adapter.error("Error: No block seen for five minutes. Something is almost certainly wrong!");
  }

  async reportConfirmTimeout() {
    this._adapter.error("Error: We expected to see the mining cycle confirm ten minutes ago. Something might be wrong!");
  }

}

module.exports = ReputationMinerClient;
