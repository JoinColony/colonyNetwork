const ethers = require("ethers");
const express = require("express");
const path = require("path");
const apicache = require("apicache")

const ReputationMiner = require("./ReputationMiner");
const { ConsoleAdapter, updateGasEstimate } = require("../package-utils");

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

const CHALLENGE_RESPONSE_WINDOW_DURATION = 20 * 60;

const cache = apicache.middleware

const racingFunctionSignatures = [
  "submitRootHash(bytes32,uint256,bytes32,uint256)",
  "confirmNewHash(uint256)",
  "invalidateHash(uint256,uint256)",
  "respondToBinarySearchForChallenge(uint256,uint256,bytes,bytes32[])",
  "confirmBinarySearchResult(uint256,uint256,bytes,bytes32[])",
  "respondToChallenge(uint256[26],bytes32[7],bytes32[],bytes32[],bytes32[],bytes32[],bytes32[],bytes32[])",
  "confirmJustificationRootHash(uint256,uint256,bytes32[],bytes32[])"
].map(x => ethers.utils.id(x).slice(0,10))

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
      this._adapter = new ConsoleAdapter();
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
      this._app.get("/:rootHash/:colonyAddress/:skillId/", cache('1 hour'), async (req, res) => {
        if (
          !ethers.utils.isHexString(req.params.rootHash) ||
          !ethers.utils.isHexString(req.params.colonyAddress) ||
          !ethers.BigNumber.from(req.params.skillId)
        ) {
          return res.status(400).send({ message: "One of the parameters was incorrect" });
        }
        const {
          addresses,
          reputations
        } = await this._miner.getAddressesWithReputation(req.params.rootHash, req.params.colonyAddress, req.params.skillId);

        try {
          return res.status(200).send({ addresses, reputations });
        } catch (err) {
          return res.status(500).send({ message: "An error occurred querying the reputation" });
        }
      });

      // Query all reputation for a single user in a colony
      this._app.get("/:rootHash/:colonyAddress/:userAddress/all", cache('1 hour'), async (req, res) => {
        if (
          !ethers.utils.isHexString(req.params.rootHash) ||
          !ethers.utils.isHexString(req.params.colonyAddress) ||
          !ethers.utils.isHexString(req.params.userAddress)
        ) {
          return res.status(400).send({ message: "One of the parameters was incorrect" });
        }
        const reputations = await this._miner.getReputationsForAddress(req.params.rootHash, req.params.colonyAddress, req.params.userAddress);
        try {
          return res.status(200).send({ reputations });
        } catch (err) {
          return res.status(500).send({ message: "An error occurred querying the reputation" });
        }
      });

      // Query specific reputation values, but without proofs
      this._app.get("/:rootHash/:colonyAddress/:skillId/:userAddress/noProof", cache('1 hour'), async (req, res) => {
        if (
          !ethers.utils.isHexString(req.params.rootHash) ||
          !ethers.utils.isHexString(req.params.colonyAddress) ||
          !ethers.utils.isHexString(req.params.userAddress) ||
          !ethers.BigNumber.from(req.params.skillId)
        ) {
          return res.status(400).send({ message: "One of the parameters was incorrect" });
        }

        try {
          const key = ReputationMiner.getKey(req.params.colonyAddress, req.params.skillId, req.params.userAddress);
          const value = await this._miner.getHistoricalValue(req.params.rootHash, key);
          if (value instanceof Error) {
            return res.status(400).send({ message: value.message.replace("Error: ") });
          }
          const proof = { key, value };
          proof.reputationAmount = ethers.BigNumber.from(`0x${proof.value.slice(2, 66)}`).toString();
          return res.status(200).send(proof);
        } catch (err) {
          return res.status(500).send({ message: "An error occurred querying the reputation" });
        }
      });

      // Query specific reputation values
      this._app.get("/:rootHash/:colonyAddress/:skillId/:userAddress", cache('1 hour'), async (req, res) => {
        if (
          !ethers.utils.isHexString(req.params.rootHash) ||
          !ethers.utils.isHexString(req.params.colonyAddress) ||
          !ethers.utils.isHexString(req.params.userAddress) ||
          !ethers.BigNumber.from(req.params.skillId)
        ) {
          return res.status(400).send({ message: "One of the parameters was incorrect" });
        }

        const key = ReputationMiner.getKey(req.params.colonyAddress, req.params.skillId, req.params.userAddress);

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
          console.log(err)
          return res.status(500).send({ message: "An error occurred querying the reputation" });
        }
      });

      this._app.get("/latestState", cache('1 hour'), async (req, res) => {
        try {
          const dbPathLatest = await this._miner.saveLatestToFile();
          return res.download(dbPathLatest)
        } catch (err) {
          console.log(err)
          return res.status(500).send({ message: "An error occurred generating the database of the state" });
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
    this.startingBlock = startingBlock;
    await this._miner.initialise(colonyNetworkAddress);

    let resumedSuccessfully = false;
    // If we have a JRH saved, and it goes from the current (on chain) state to
    // a state that we know, then let's assume it's correct
    const latestConfirmedReputationHash = await this._miner.colonyNetwork.getReputationRootHash();
    const repCycle = await this._miner.getActiveRepCycle();

    await this._miner.loadJustificationTree();
    const jhKeys = Object.keys(this._miner.justificationHashes)
    const firstLeaf = jhKeys[0]
    const lastLeaf = jhKeys[jhKeys.length - 1]

    if (firstLeaf && lastLeaf) { // lastLeaf will never be undefined if firstLeaf isn't, but this is more semantic
      const firstStateHash = this._miner.justificationHashes[firstLeaf].jhLeafValue.slice(0, 66)
      const lastStateHash = this._miner.justificationHashes[lastLeaf].jhLeafValue.slice(0, 66)

      if (firstStateHash === latestConfirmedReputationHash){
        // We need to be able to load that state (but no Justification Tree)

        await this._miner.loadStateToPrevious(firstStateHash)
        const previousStateHash = await this._miner.previousReputationTree.getRootHash();
        if (previousStateHash === firstStateHash){

          // Then, if successful, we need to load the last state hash, including the justification tree
          await this._miner.loadState(lastStateHash);
          const currentStateHash = await this._miner.reputationTree.getRootHash();
          if (currentStateHash === lastStateHash){
          // Loading the state was successful...
            const submittedState = await repCycle.getReputationHashSubmission(this._miner.minerAddress);
            if (submittedState.proposedNewRootHash === ethers.utils.hexZeroPad(0, 32)) {
              resumedSuccessfully = true;
              this._adapter.log("Successfully resumed pre-submission");
            } else {
              const jrh = await this._miner.justificationTree.getRootHash();
              if (submittedState.proposedNewRootHash === currentStateHash && submittedState.jrh === jrh){
                resumedSuccessfully = true;
                this._adapter.log("Successfully resumed mid-submission");
              }
            }
          }
        }
      }
    }

    if (!resumedSuccessfully) {
      // Reset any partial loading we did trying to resume.
      await this._miner.initialise(colonyNetworkAddress);

      // Get latest state from database if available, otherwise sync to current state on-chain
      await ReputationMiner.createDB(this._miner.db);
      await this._miner.loadState(latestConfirmedReputationHash);
      if (this._miner.nReputations.eq(0)) {
        this._adapter.log("Latest state not found - need to sync");
        await this._miner.sync(this.startingBlock, true);
      }
      // Initial call to process the existing log from the cycle we're currently in
      await this.processReputationLog();
    }

    this.gasBlockAverages = [];

    this._miner.realProvider.polling = true;
    this._miner.realProvider.pollingInterval = 1000;

    this.blockTimeoutCheck = setTimeout(this.reportBlockTimeout.bind(this), 300000);

    // Work out when the confirm timeout should be.
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

  /**
   * Navigate through the mining process logic used when the client is in auto mode.
   * Up to 12 submissions of our current proposed Hash/nLeaves/JRH are made at the earliest block possible
   * Once any disputes are resolved and mining window has closed, we confirm the last remaining hash
   * @param  {Number}  blockNumber The block number we are currently acting on
   * @return {Promise}
   */
  async doBlockChecks(blockNumber) {
    let repCycle;
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

      if (this._blockOverdue) {
          this._adapter.error("Resolved: We are seeing blocks be mined again.");
          this._blockOverdue = false;
      }

      const block = await this._miner.realProvider.getBlock(blockNumber);
      const addr = await this._miner.colonyNetwork.getReputationMiningCycle(true);

      if (addr !== this.miningCycleAddress) {
        repCycle = new ethers.Contract(addr, this._miner.repCycleContractDef.abi, this._miner.realWallet);
        // Then the cycle has completed since we last checked.
        if (this.confirmTimeoutCheck) {
          clearTimeout(this.confirmTimeoutCheck);
        }

        if (this._miningCycleConfirmationOverdue) {
          this._adapter.error("Resolved: The mining cycle has now confirmed as expected.");
          this._miningCycleConfirmationOverdue = false;
        }

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

        // First check is the confirmed cycle the one we expect?
        // Note no blocktags in these calls - we care if we're up-to-date, not the historical state (here)
        // If we're not, we resync and stop here for this block.
        const syncCheck = await this.ensureSynced();
        if (!syncCheck) {
          this.endDoBlockChecks();
          return;
        }

        await this._miner.updatePeriodLength(repCycle);
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
      if (!repCycle) {
        repCycle = new ethers.Contract(addr, this._miner.repCycleContractDef.abi, this._miner.realWallet);
      }
      const nHashSubmissions = await repCycle.getNSubmissionsForHash(hash, NLeaves, jrh);

      // If less than 12 submissions have been made, submit at our next best possible time
      if (nHashSubmissions.lt(12) && this.best12Submissions[this.submissionIndex]) {
        if (block.timestamp >= this.best12Submissions[this.submissionIndex].timestamp) {
          const {entryIndex} = this.best12Submissions[this.submissionIndex];
          const canSubmit = await this._miner.submissionPossible(entryIndex);
          if (canSubmit) {
            this._adapter.log("⏰ Looks like it's time to submit an entry to the current cycle");
            this.submissionIndex += 1;
            const gasPrice = await updateGasEstimate("average", this.chainId, this._adapter);
            await this._miner.setGasPrice(gasPrice);
            await this.submitEntry(entryIndex);
            this.endDoBlockChecks();
            return;
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
          const responsePossible = await repCycle["getResponsePossible(uint8,uint256)"](disputeStages.INVALIDATE_HASH, entry.lastResponseTimestamp);
          if (!responsePossible) {
            this.endDoBlockChecks();
            return;
          }
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
          const gasPrice = await updateGasEstimate("fast", this.chainId, this._adapter);
          await this._miner.setGasPrice(gasPrice);

          this._adapter.log("Invalidating pseudo-opponent in dispute");
          await repCycle.invalidateHash(round, oppIndex, {"gasPrice": this._miner.gasPrice});
          this.endDoBlockChecks();
          return;
        }

        // If we're here, we do have an opponent.
        // Before checking if our opponent has timed out yet, check if we can respond to something
        // 1. Do we still need to confirm JRH?
        if (submission.jrhNLeaves.eq(0)) {
          const responsePossible = await repCycle["getResponsePossible(uint8,uint256)"](disputeStages.CONFIRM_JRH, entry.lastResponseTimestamp);
          if (responsePossible){
            const gasPrice = await updateGasEstimate("fast", this.chainId, this._adapter);
            await this._miner.setGasPrice(gasPrice);
            this._adapter.log("Confirming JRH in dispute");
            const tx = await this._miner.confirmJustificationRootHash();
            await tx.wait();
          }
        // 2. Are we in the middle of a binary search?
        // Check our opponent has confirmed their JRH, and the binary search is ongoing.
        } else if (!oppSubmission.jrhNLeaves.eq(0) && !entry.upperBound.eq(entry.lowerBound)){
          // Yes. Are we able to respond?
          // We can respond if neither of us have responded to this stage yet or
          // if they have responded already
          if (oppEntry.challengeStepCompleted.gte(entry.challengeStepCompleted)) {
            const responsePossible = await repCycle["getResponsePossible(uint8,uint256)"](
              disputeStages.BINARY_SEARCH_RESPONSE,
              entry.lastResponseTimestamp
            );
            if (responsePossible){
            const gasPrice = await updateGasEstimate("fast", this.chainId, this._adapter);
            await this._miner.setGasPrice(gasPrice);
              this._adapter.log("Responding to binary search in dispute");
              const tx = await this._miner.respondToBinarySearchForChallenge();
              await tx.wait();
            }
          }
        // 3. Are we at the end of a binary search and need to confirm?
        // Check that our opponent has finished the binary search, check that we have, and check we've not confirmed yet
        } else if (
          oppEntry.upperBound.eq(oppEntry.lowerBound) &&
          entry.upperBound.eq(entry.lowerBound) &&
          entry.challengeStepCompleted.gte(2) &&
          ethers.BigNumber.from(2).pow(entry.challengeStepCompleted.sub(2)).lte(submission.jrhNLeaves)
        )
        {
          const responsePossible = await repCycle["getResponsePossible(uint8,uint256)"](
            disputeStages.BINARY_SEARCH_CONFIRM,
            entry.lastResponseTimestamp
          );
          if (responsePossible){
            const gasPrice = await updateGasEstimate("fast", this.chainId, this._adapter);
            await this._miner.setGasPrice(gasPrice);
            this._adapter.log("Confirming binary search in dispute");
            const tx = await this._miner.confirmBinarySearchResult();
            await tx.wait();
          }
        // 4. Is the binary search confirmed, and we need to respond to challenge?
        // Check our opponent has confirmed their binary search result, check that we have too, and that we've not responded to this challenge yet
        } else if (
            oppEntry.challengeStepCompleted.gte(2) &&
            ethers.BigNumber.from(2).pow(oppEntry.challengeStepCompleted.sub(2)).gt(oppSubmission.jrhNLeaves) &&
            entry.challengeStepCompleted.gte(3) &&
            ethers.BigNumber.from(2).pow(entry.challengeStepCompleted.sub(2)).gt(submission.jrhNLeaves) &&
            ethers.BigNumber.from(2).pow(entry.challengeStepCompleted.sub(3)).lte(submission.jrhNLeaves)
          )
        {
          const responsePossible = await repCycle["getResponsePossible(uint8,uint256)"](
            disputeStages.RESPOND_TO_CHALLENGE,
            entry.lastResponseTimestamp
          );
          if (responsePossible){
            const gasPrice = await updateGasEstimate("fast", this.chainId, this._adapter);
            await this._miner.setGasPrice(gasPrice);
            this._adapter.log("Responding to challenge in dispute");
            const tx = await this._miner.respondToChallenge();
            await tx.wait();
          }
        }

        // Has our opponent timed out?

        const opponentTimeout = ethers.BigNumber.from(block.timestamp).sub(oppEntry.lastResponseTimestamp).gte(CHALLENGE_RESPONSE_WINDOW_DURATION);
        if (opponentTimeout){
          const responsePossible = await repCycle["getResponsePossible(uint8,uint256)"](
            disputeStages.INVALIDATE_HASH,
            ethers.BigNumber.from(oppEntry.lastResponseTimestamp).add(CHALLENGE_RESPONSE_WINDOW_DURATION)
          );
          if (responsePossible) {
            // If so, invalidate them.
            const gasPrice = await updateGasEstimate("fast", this.chainId, this._adapter);
            await this._miner.setGasPrice(gasPrice);
            this._adapter.log("Invalidating opponent in dispute");
            await repCycle.invalidateHash(round, oppIndex, {"gasPrice": this._miner.gasPrice});
            this.endDoBlockChecks();
            return;
          }
        }

      }

      if (lastHashStanding && ethers.BigNumber.from(block.timestamp).sub(windowOpened).gte(this._miner.getMiningCycleDuration())) {
        // If the submission window is closed and we are the last hash, confirm it
        const [round, index] = await this._miner.getMySubmissionRoundAndIndex();
        const disputeRound = await repCycle.getDisputeRound(round);
        const entry = disputeRound[index];

        const responsePossible = await repCycle["getResponsePossible(uint8,uint256)"](disputeStages.CONFIRM_NEW_HASH, entry.lastResponseTimestamp);
        if (responsePossible){
          await this.confirmEntry();
        }
      }
      this.endDoBlockChecks();
    } catch (err) {
      const repCycleCode = await this._miner.realProvider.getCode(repCycle.address);
      // If it's out-of-ether...
      if (err.toString().indexOf('does not have enough funds') >= 0 ) {
        // This could obviously be much better in the future, but for now, we'll settle for this not triggering a restart loop.
        const signingAddress = await this._miner.realWallet.getAddress()
        this._adapter.error(`Block checks suspended due to not enough Ether. Send ether to \`${signingAddress}\`, then restart the miner`);
        return;
      }
      if (repCycleCode === "0x") {
        // The repcycle was probably advanced by another miner while we were trying to
        // respond to it. That's fine, and we'll sort ourselves out on the next block.
        this.endDoBlockChecks();
        return;
      }
      this._adapter.error(`Error during block checks: ${err}`);
      if (racingFunctionSignatures.indexOf(err.transaction.data.slice(0, 10)) > -1){
        // An error on a function that we were 'racing' to execute failed - most likely because someone else did it.
        // So let's keep mining.
        console.log('Sometimes-expected transaction failure - we lost a race to submit for a stage. Continuing mining')
        this.endDoBlockChecks();
        return;
      }
      if (this._exitOnError) {
        this._adapter.error(`Automatically restarting`);
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

  async ensureSynced() {
    const nLeaves = await this._miner.colonyNetwork.getReputationRootHashNNodes();
    const currentRootHash = await this._miner.colonyNetwork.getReputationRootHash();
    const localRootHash = await this._miner.reputationTree.getRootHash();
    if (!nLeaves.eq(this._miner.nReputations) || localRootHash !== currentRootHash) {
      this._adapter.log(`Unexpected confirmed hash seen on colonyNetwork. Let's resync.`)
      await this._miner.sync(this.startingBlock, true);
      return false;
    }
    return true;
  }

  async processReputationLog(blockNumber) {
    this._adapter.log("📁 Processing reputation update log");
    await this._miner.addLogContentsToReputationTree(blockNumber);
    this._adapter.log("💾 Writing new reputation state to database");
    await this._miner.saveCurrentState();
    this._adapter.log("💾 Caching justification tree to disk");
    await this._miner.saveJustificationTree();
  }

  async getTwelveBestSubmissions() {
    const addr = await this._miner.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, this._miner.repCycleContractDef.abi, this._miner.realWallet);

    const miningStake = await this._miner.colonyNetwork.getMiningStake(
      this._miner.minerAddress,
    );

    const balance = miningStake.amount;

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
    this._adapter.log("⏰ Looks like it's time to confirm the new hash");
    // Confirm hash if possible
    const [round] = await this._miner.getMySubmissionRoundAndIndex();
    if (round && round.gte(0)) {
      const gasPrice = await updateGasEstimate("average", this.chainId, this._adapter);
      await this._miner.setGasPrice(gasPrice);

      const confirmNewHashTx = await this._miner.confirmNewHash();

      this._adapter.log(`⛏️ Transaction waiting to be mined ${confirmNewHashTx.hash}`);
      await confirmNewHashTx.wait();
      this._adapter.log("✅ New reputation hash confirmed");
    }
  }

  async reportBlockTimeout() {
    this._adapter.error("Error: No block seen for five minutes. Something is almost certainly wrong!");
    this._blockOverdue = true;
  }

  async reportConfirmTimeout() {
    this._adapter.error("Error: We expected to see the mining cycle confirm ten minutes ago. Something might be wrong!");
    this._miningCycleConfirmationOverdue = true;
  }

}

module.exports = ReputationMinerClient;
