import { checkSuccessEthers } from "../../helpers/test-helper";

const ethers = require("ethers");
const express = require("express");
const path = require('path');

const ReputationMiner = require("./ReputationMiner");

const minStake = ethers.utils.bigNumberify(10).pow(18).mul(2000); // eslint-disable-line prettier/prettier
const miningCycleDuration = ethers.utils.bigNumberify(60).mul(60).mul(24); // 24 hours
const constant = ethers.utils.bigNumberify(2).pow(256).sub(1).div(miningCycleDuration);
let submissionIndex = 0;
let best12Submissions = [];
let boundAndWrappedBlockChecks;

class ReputationMinerClient {
  /**
   * Constructor for ReputationMiner
   * @param {string} minerAddress            The address that is staking CLNY that will allow the miner to submit reputation hashes
   * @param {Number} [realProviderPort=8545] The port that the RPC node with the ability to sign transactions from `minerAddress` is responding on. The address is assumed to be `localhost`.
   */
  constructor({ minerAddress, loader, realProviderPort, minerPort = 3000, privateKey, provider, useJsTree, dbPath, auto }) {
    this._loader = loader;
    this._miner = new ReputationMiner({ minerAddress, loader, provider, privateKey, realProviderPort, useJsTree, dbPath });
    this._auto = auto;
    if (typeof this._auto === "undefined") {
      this._auto = true;
    }

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
        const decimalValue = ethers.utils.bigNumberify(`0x${this._miner.reputations[key].slice(2, 66)}`, 16).toString();
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

    // Query specific reputation values
    this._app.get("/:rootHash/:colonyAddress/:skillId/:userAddress", async (req, res) => {
      const key = ReputationMiner.getKey(req.params.colonyAddress, req.params.skillId, req.params.userAddress);
      const currentHash = await this._miner.getRootHash();
      if (currentHash === req.params.rootHash) {
        if (this._miner.reputations[key]) {
          const proof = await this._miner.getReputationProofObject(key);
          delete proof.nNodes;
          proof.reputationAmount = ethers.utils.bigNumberify(`0x${proof.value.slice(2, 66)}`).toString();
          return res.status(200).send(proof);
        }
        return res.status(400).send({ message: "Requested reputation does not exist or invalid request" });
      }

      try {
        const [branchMask, siblings, value] = await this._miner.getHistoricalProofAndValue(req.params.rootHash, key);
        const proof = { branchMask: `${branchMask.toString(16)}`, siblings, key, value };
        proof.reputationAmount = ethers.utils.bigNumberify(`0x${proof.value.slice(2, 66)}`).toString();
        return res.status(200).send(proof);
      } catch (err) {
        return res.status(400).send({ message: "Requested reputation does not exist or invalid request" });
      }
    });

    this.server = this._app.listen(minerPort, () => {
      console.log("⭐️ Reputation oracle running on port ", this.server.address().port);
    });
  }

  /**
   * Initialises the mining client so that it knows where to find the `ColonyNetwork` contract
   * @param  {string}  colonyNetworkAddress The address of the current `ColonyNetwork` contract
   * @return {Promise}
   */
  async initialise(colonyNetworkAddress) {
    await this._miner.initialise(colonyNetworkAddress);
    // TODO: Use this._miner.repCycleContractDef which is already initialised
    this.repCycleContractDef = await this._loader.load({ contractName: "IReputationMiningCycle" }, { abi: true, address: false });

    // TODO: Get latest state from database, then sync to current state on-chain.
    // However, for now, we're the only miner, so we can just load the current saved state and go from there.
    const latestReputationHash = await this._miner.colonyNetwork.getReputationRootHash();
    await this._miner.createDB();
    await this._miner.loadState(latestReputationHash);
    if (this._miner.nReputations.eq(0)) {
      console.log("No existing reputations found - starting from scratch");
    }

    console.log("🏁 Initialised");
    if (this._auto) {
      // Initial call to process the existing log from the cycle we're currently in
      await this.processReputationLog();
      best12Submissions = await this.getTwelveBestSubmissions();

      // Add a listener to process log for when a new cycle starts
      const ReputationMiningCycleComplete = ethers.utils.id("ReputationMiningCycleComplete(bytes32,uint256)");
      const filter = {
        address: this._miner.colonyNetwork.address,
        topics: [ ReputationMiningCycleComplete ]
      }

      // If a new mining cycle starts, process the new reputation update log and rehydrate the 12 best submissions
      await this._miner.realProvider.on(filter, async () => {
        await this.processReputationLog();
        best12Submissions = await this.getTwelveBestSubmissions();
      });
      
      // Do the other checks for whether we can submit or confirm a hash
      const boundBlockChecks = this.doBlockChecks.bind(this);
      const gatedBlockChecks = async function (b) {
        await boundBlockChecks(b);
        this._miner.realProvider.once('block', boundAndWrappedBlockChecks);
      }
      boundAndWrappedBlockChecks = gatedBlockChecks.bind(this);
      this._miner.realProvider.once('block', boundAndWrappedBlockChecks);
      this._miner.realProvider.polling = true;
      this._miner.realProvider.pollingInterval = 1000;
    }
  }

  /**
   * Navigate through the mining process logic used when the client is in auto mode.
   * Up to 12 submissions of our current proposed Hash/nNodes/JRH are made at the earliest block possible
   * Once any disputes are resolved and mining window has closed, we confirm the last remaining hash
   * @param  {Number}  blockNumber The block number we are currently acting on
   * @return {Promise}
   */
  async doBlockChecks(blockNumber) {
    const block = await this._miner.realProvider.getBlock(blockNumber);
    const addr = await this._miner.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, this.repCycleContractDef.abi, this._miner.realWallet);

    const hash = await this._miner.getRootHash();
    const nNodes = await this._miner.getRootHashNNodes();
    const jrh = await this._miner.justificationTree.getRootHash();
    const nHashSubmissions = await repCycle.getNSubmissionsForHash(hash, nNodes, jrh);

    // If less than 12 submissions have been made, submit at our next best possible time
    if (nHashSubmissions.lt(12) && best12Submissions[submissionIndex]) {
      if (block.timestamp >= best12Submissions[submissionIndex].timestamp) {    
        const {entryIndex} = best12Submissions[submissionIndex];
        const canSubmit = await this._miner.submissionPossible(entryIndex);
        if (canSubmit) {
          console.log("⏰ Looks like it's time to submit an entry to the current cycle");
          await this.submitEntry(entryIndex);
          submissionIndex += 1;
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
      // console.log("oppIndex", oppIndex);
      const oppEntry = disputeRound[oppIndex];
      // console.log("oppEntry", oppEntry);
      const oppSubmission = await repCycle.getReputationHashSubmission(oppEntry.firstSubmitter);

      if (oppSubmission.proposedNewRootHash === ethers.constants.AddressZero){
        // Then we don't have an opponent
        if (round.eq(0)) {
          // We can only advance if the window is closed
          if (ethers.utils.bigNumberify(block.timestamp).sub(windowOpened).lt(miningCycleDuration)) return;
        } else {
          // We can only advance if the previous round is complete
          const previousRoundComplete = await repCycle.challengeRoundComplete(round - 1);
          if (!previousRoundComplete) return;
        }
        await repCycle.invalidateHash(round, oppIndex);
        return;
      }

      // If we're here, we do have an opponent.
      // Has our opponent timed out?
      const opponentTimeout = ethers.utils.bigNumberify(block.timestamp).sub(oppEntry.lastResponseTimestamp).gte(600);
      if (opponentTimeout){
        // If so, invalidate them.
        await repCycle.invalidateHash(round, oppIndex);
        return;
      }
      console.log(oppSubmission);

      // Our opponent hasn't timed out yet. We should check if we can respond to something though
      // 1. Do we still need to confirm JRH?
      if (submission.jrhNNodes.eq(0)) {
        await this._miner.confirmJustificationRootHash();
      // 2. Are we in the middle of a binary search?
      // Check our opponent has confirmed their JRH, and the binary search is ongoing.
      } else if (!oppSubmission.jrhNNodes.eq(0) && !entry.upperBound.eq(entry.lowerBound)){
        // Yes. Are we able to respond?
        // We can respond if neither of us have responded to this stage yet or
        // if they have responded already
        if (oppEntry.challengeStepCompleted.gte(entry.challengeStepCompleted)) {
          await this._miner.respondToBinarySearchForChallenge();
        }
      // 3. Are we at the end of a binary search and need to confirm?
      // Check that our opponent has finished the binary search, check that we have, and check we've not confirmed yet
      } else if (
        oppEntry.upperBound.eq(oppEntry.lowerBound) && 
        entry.upperBound.eq(entry.lowerBound) && 
        ethers.utils.bigNumberify(2).pow(entry.challengeStepCompleted.sub(2)).lte(submission.jrhNNodes) 
      )
      {
        await this._miner.confirmBinarySearchResult();
      // 4. Is the binary search confirmed, and we need to respond to challenge?
      // Check our opponent has confirmed their binary search result, check that we have too, and that we've not responded to this challenge yet
      } else if (
          ethers.utils.bigNumberify(2).pow(oppEntry.challengeStepCompleted.sub(2)).gt(oppSubmission.jrhNNodes) && 
          ethers.utils.bigNumberify(2).pow(entry.challengeStepCompleted.sub(2)).gt(submission.jrhNNodes) &&
          ethers.utils.bigNumberify(2).pow(entry.challengeStepCompleted.sub(3)).lte(submission.jrhNNodes)
        )
      {
        await this._miner.respondToChallenge();
      }
    } 

    if (lastHashStanding && ethers.utils.bigNumberify(block.timestamp).sub(windowOpened).gte(miningCycleDuration)) {
      // If the submission window is closed and we are the last hash, confirm it
      best12Submissions = []; // Clear the submissions
      submissionIndex = 0;
      await this.confirmEntry();
    }
  }

  close() {
    this._miner.realProvider.removeListener('block', boundAndWrappedBlockChecks);
    this._miner.realProvider.polling = false;
    this.server.close();
  }

  async processReputationLog() {
    console.log("📁 Processing reputation update log");
    await this._miner.addLogContentsToReputationTree();
    console.log("💾 Writing new reputation state to database");
    await this._miner.saveCurrentState();
  }

  async getTwelveBestSubmissions() {
    const addr = await this._miner.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, this.repCycleContractDef.abi, this._miner.realWallet);
    const [, balance] = await this._miner.tokenLocking.getUserLock(this._miner.clnyAddress, this._miner.minerAddress);
    const reputationMiningWindowOpenTimestamp = await repCycle.getReputationMiningWindowOpenTimestamp();
    const rootHash = await this._miner.getRootHash();

    const timeAbleToSubmitEntries = [];
    for (let i = ethers.utils.bigNumberify(1); i.lte(balance.div(minStake)); i = i.add(1)) {
      const entryHash = await repCycle.getEntryHash(this._miner.minerAddress, i, rootHash);  
      const timeAbleToSubmitEntry = ethers.utils.bigNumberify(entryHash).div(constant).add(reputationMiningWindowOpenTimestamp);

      const validEntry = {
        timestamp: timeAbleToSubmitEntry,
        entryIndex: i
      }
      timeAbleToSubmitEntries.push(validEntry);
    }

    timeAbleToSubmitEntries.sort(function (a, b) {
      return a.timestamp.sub(b.timestamp).toNumber();
    });

    return timeAbleToSubmitEntries.slice(0, 12);
  }

  async submitEntry(entryIndex) {
    const rootHash = await this._miner.getRootHash();
    console.log("#️⃣ Miner", this._miner.minerAddress ,"submitting new reputation hash", rootHash, "at entry index", entryIndex.toNumber());

    // Submit hash
    let submitRootHashTx = await this._miner.submitRootHash(entryIndex);
    if (!submitRootHashTx.nonce) {
      // Assume we've been given back the submitRootHashTx hash.
      submitRootHashTx = await this._miner.realProvider.getTransaction(submitRootHashTx);
    }
    console.log("⛏️ Transaction waiting to be mined", submitRootHashTx.hash);
    
    // TODO: Think of a better way to do error handling here
    await checkSuccessEthers(submitRootHashTx.wait());
    console.log("🆗 New reputation hash submitted successfully");
  }

  async confirmEntry() {
    const addr = await this._miner.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, this.repCycleContractDef.abi, this._miner.realWallet);

    console.log("⏰ Looks like it's time to confirm the new hash");
    // Confirm hash
    // We explicitly use the previous nonce +1, in case we're using Infura and we end up
    // querying a node that hasn't had the above transaction propagate to it yet.
    // TODO: not sure we need this still: nonce: confirmNewHashTx.nonce + 1 in the tx below
    // This won't be valid anyway if we're not confirming immediately in the next transaction
    const [round] = await this._miner.getMySubmissionRoundAndIndex();
    if (round && round.gte(0)) {
      const confirmNewHashTx = await repCycle.confirmNewHash(round, { gasLimit: 4000000 });
      console.log("⛏️ Transaction waiting to be mined", confirmNewHashTx.hash);
      await confirmNewHashTx.wait();
      console.log("✅ New reputation hash confirmed");
    }
  }
}

module.exports = ReputationMinerClient;
