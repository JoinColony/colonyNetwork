const path = require("path");
const jsonfile = require("jsonfile");
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
  constructor({ file, minerAddress, loader, realProviderPort, seed, privateKey, provider }) {
    this._loader = loader;
    this._miner = new ReputationMiner({ minerAddress, loader, provider, privateKey, realProviderPort });
    this._seed = seed;
    this._file = path.resolve(process.cwd(), file);

    this._app = express();
    this._app.get("/:colonyAddress/:skillId/:userAddress", async (req, res) => {
      const key = await ReputationMiner.getKey(req.params.colonyAddress, req.params.skillId, req.params.userAddress);
      if (this._miner.reputations[key]) {
        const proof = await this._miner.getReputationProofObject(key);
        delete proof.nNodes;
        proof.reputationAmount = ethers.utils.bigNumberify(`0x${proof.value.slice(2, 66)}`).toString();

        res.status(200).send(proof);
      } else {
        res.status(400).send({ message: "Requested reputation does not exist or invalid request" });
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

    try {
      // TODO: I don't really like writing properties like that. We might need a setReputations() method on the miner
      // It can also then set the nReputations
      this._miner.reputations = jsonfile.readFileSync(this._file);
      console.log("💾 Restored from JSON file");
    } catch (err) {
      this._miner.reputations = {};
      console.log("No existing reputations found - starting from scratch");
    }
    this._miner.nReputations = Object.keys(this._miner.reputations).length;

    if (this._miner.nReputations === 0 && this._seed) {
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
      console.log("💾 Writing initialised state with dummy data to JSON file");

      jsonfile.writeFileSync(this._file, this._miner.reputations);
    } else {
      // TODO: It would be good to have an interface on the miner for that, I'm pretty sure this logic is already somewhere in there
      for (let i = 0; i < Object.keys(this._miner.reputations).length; i += 1) {
        const key = Object.keys(this._miner.reputations)[i];
        await this._miner.reputationTree.insert(key, this._miner.reputations[key], { gasLimit: 4000000 }); // eslint-disable-line no-await-in-loop
      }
    }

    console.log("🏁 Initialised");
    setTimeout(() => this.checkSubmissionWindow(), 0);
  }

  async checkSubmissionWindow() {
    // TODO: Check how much of this does actually belong into the Miner itself
    // One could introduce lifecycle hooks in the miner to avoid code duplication

    // Check if it's been an hour since the window opened
    const addr = await this._miner.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, this.repCycleContractDef.abi, this._miner.realWallet);

    const windowOpened = await repCycle.reputationMiningWindowOpenTimestamp();

    const block = await this._miner.realProvider.getBlock("latest");
    const now = block.timestamp;
    if (now - windowOpened > 3600) {
      console.log("⏰ Looks like it's time to submit an update");
      // If so, process the log
      await this._miner.addLogContentsToReputationTree();

      console.log("💾 Writing new reputation state to JSON file");
      jsonfile.writeFileSync(this._file, this._miner.reputations);

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
      // setTimeout(() => this.checkSubmissionWindow(), 3660000);
      // console.log("⌛️ will next check in one hour and one minute");
      setTimeout(() => this.checkSubmissionWindow(), 10000);
    } else {
      // Set a timeout for 3610 - (now - windowOpened)
      setTimeout(() => this.checkSubmissionWindow(), 10000);
      // const timeout = Math.max(3610 - (now - windowOpened), 10);
      // console.log("⌛️ will next check in ", timeout, "seconds");
      // setTimeout(() => this.checkSubmissionWindow(), timeout * 1000);
    }
  }
}

module.exports = ReputationMinerClient;
