const ethers = require("ethers");
const express = require("express");
const BN = require("bn.js");

const ReputationMiner = require("./ReputationMiner");

class ReputationMinerClient {
  /**
   * Constructor for ReputationMiner
   * @param {string} minerAddress            The address that is staking CLNY that will allow the miner to submit reputation hashes
   * @param {Number} [realProviderPort=8545] The port that the RPC node with the ability to sign transactions from `minerAddress` is responding on. The address is assumed to be `localhost`.
   */
  constructor({ file, minerAddress, loader, realProviderPort, seed, privateKey, provider, useJSTree, auto }) {
    this._loader = loader;
    this._miner = new ReputationMiner({ minerAddress, loader, provider, privateKey, realProviderPort, dbPath: file, useJSTree });
    this._seed = seed;
    this._auto = auto || true;

    this._app = express();
    this._app.get("/:rootHash/:colonyAddress/:skillId/:userAddress", async (req, res) => {
      const key = await ReputationMiner.getKey(req.params.colonyAddress, req.params.skillId, req.params.userAddress);
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

    this.server = this._app.listen(3000, () => {
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

    this.repCycleContractDef = await this._loader.load({ contractName: "IReputationMiningCycle" }, { abi: true, address: false });

    // TODO: Get latest state from database, then sync to current state on-chain.
    // However, for now, we're the only miner, so we can just load the current saved state and go from there.
    const latestReputationHash = await this._miner.colonyNetwork.getReputationRootHash();
    await this._miner.createDB();
    await this._miner.loadState(latestReputationHash);
    if (this._miner.nReputations.eq(0)) {
      console.log("No existing reputations found - starting from scratch");
      if (this._seed) {
        // Temporary data if --seed is set and there's nothing to restore from.
        const ADDRESS1 = "0x309e642dbf573119ca75153b25f5b8462ff1b90b";
        const ADDRESS2 = "0xbc13dbc1a954b3443d6f75297a232faa513774b3";
        const ADDRESS3 = "0x2b183746bd1403cdec8e4fe45139339da20bcf3d";
        const ADDRESS4 = "0xcd0751d4181acda4f8edb2f3b33b915f91abeef0";
        const ADDRESS0 = "0x0000000000000000000000000000000000000000";
        await this._miner.insert(ADDRESS1, 1, ADDRESS2, new BN("999999999"));
        await this._miner.insert(ADDRESS1, 1, ADDRESS0, new BN("999999999"));
        await this._miner.insert(ADDRESS1, 2, ADDRESS2, new BN("888888888888888"));
        await this._miner.insert(ADDRESS1, 2, ADDRESS0, new BN("888888888888888"));
        await this._miner.insert(ADDRESS3, 1, ADDRESS2, new BN("100000000"));
        await this._miner.insert(ADDRESS3, 1, ADDRESS4, new BN("100000000"));
        await this._miner.insert(ADDRESS3, 1, ADDRESS0, new BN("200000000"));
        console.log("💾 Writing initialised state with dummy data to database");

        await this._miner.saveCurrentState();
      }
    }

    console.log("🏁 Initialised");
    if (this.auto) {
      this.timeout = setTimeout(() => this.checkSubmissionWindow(), 0);
    }
  }

  close() {
    clearTimeout(this.timeout);
    this.server.close();
  }

  async checkSubmissionWindow() {
    // TODO: Check how much of this does actually belong into the Miner itself
    // One could introduce lifecycle hooks in the miner to avoid code duplication

    // Check if it's been an hour since the window opened
    const addr = await this._miner.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, this.repCycleContractDef.abi, this._miner.realWallet);

    let windowOpened = await repCycle.getReputationMiningWindowOpenTimestamp();
    windowOpened = windowOpened.toNumber();

    const block = await this._miner.realProvider.getBlock("latest");
    const now = block.timestamp;
    if (now - windowOpened > 3600) {
      console.log("⏰ Looks like it's time to submit an update");
      // If so, process the log
      await this._miner.addLogContentsToReputationTree();

      console.log("💾 Writing new reputation state to database");
      await this._miner.saveCurrentState();

      console.log("#️⃣ Submitting new reputation hash");

      // Submit hash
      let tx = await this._miner.submitRootHash();
      if (!tx.nonce) {
        // Assume we've been given back the tx hash.
        tx = await this._miner.realProvider.getTransaction(tx);
      }

      console.log("Confirming new reputation hash...");

      // Confirm hash
      // We explicitly use the previous nonce +1, in case we're using Infura and we end up
      // querying a node that hasn't had the above transaction propagate to it yet.
      tx = await repCycle.confirmNewHash(0, { gasLimit: 3500000, nonce: tx.nonce + 1 });

      console.log("✅ New reputation hash confirmed, via TX", tx);
      // this.timeout = setTimeout(() => this.checkSubmissionWindow(), 3660000);
      // console.log("⌛️ will next check in one hour and one minute");
      this.timeout = setTimeout(() => this.checkSubmissionWindow(), 10000);
    } else {
      // Set a timeout for 3610 - (now - windowOpened)
      this.timeout = setTimeout(() => this.checkSubmissionWindow(), 10000);
      // const timeout = Math.max(3610 - (now - windowOpened), 10);
      // console.log("⌛️ will next check in ", timeout, "seconds");
      // this.timeout = setTimeout(() => this.checkSubmissionWindow(), timeout * 1000);
    }
  }
}

module.exports = ReputationMinerClient;
