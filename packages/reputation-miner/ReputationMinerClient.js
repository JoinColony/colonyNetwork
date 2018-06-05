const { argv } = require("yargs");

// We disable the import/no-unresolved rule for these lines because when ESLint is run on Circle, the contracts haven't
// been compiled yet and so would fail here.
const ReputationMiningCycleJSON = require("../../build/contracts/IReputationMiningCycle.json"); // eslint-disable-line import/no-unresolved

const jsonfile = require("jsonfile");

const { file } = argv;

const ethers = require("ethers");

const express = require("express");

const ReputationMiner = require("./ReputationMiner");

let client;

class ReputationMinerClient extends ReputationMiner {
  /**
   * Constructor for ReputationMiner
   * @param {string} minerAddress            The address that is staking CLNY that will allow the miner to submit reputation hashes
   * @param {Number} [realProviderPort=8545] The port that the RPC node with the ability to sign transactions from `minerAddress` is responding on. The address is assumed to be `localhost`.
   */
  constructor(_minerAddress, _realProviderPort) {
    super(_minerAddress, _realProviderPort);

    // this.realProvider = new ethers.providers.InfuraProvider("kovan");

    this._app = express();
    this._app.get("/:colonyAddress/:skillId/:userAddress", async (req, res) => {
      const key = await ReputationMiner.getKey(req.params.colonyAddress, req.params.skillId, req.params.userAddress);
      if (key) {
        const proof = await this.getReputationProofObject(key);
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
    await super.initialise(colonyNetworkAddress);

    try {
      this.reputations = jsonfile.readFileSync(file);
      console.log("💾 Restored from JSON file");
    } catch (err) {
      this.reputations = {};
      console.log("No existing reputations found - starting from scratch");
    }
    this.nReputations = Object.keys(this.reputations).length;

    if (this.nReputations === 0 && argv.seed) {
      // Temporary data if --seed is set and there's nothing to restore from.
      const ADDRESS1 = "0x309e642dbf573119ca75153b25f5b8462ff1b90b";
      const ADDRESS2 = "0xbc13dbc1a954b3443d6f75297a232faa513774b3";
      const ADDRESS3 = "0x2b183746bd1403cdec8e4fe45139339da20bcf3d";
      const ADDRESS4 = "0xcd0751d4181acda4f8edb2f3b33b915f91abeef0";
      const ADDRESS0 = "0x0000000000000000000000000000000000000000";
      await this.insert(ADDRESS1, 1, ADDRESS2, "999999999");
      await this.insert(ADDRESS1, 1, ADDRESS0, "999999999");
      await this.insert(ADDRESS1, 2, ADDRESS2, "888888888888888");
      await this.insert(ADDRESS1, 2, ADDRESS0, "888888888888888");
      await this.insert(ADDRESS3, 1, ADDRESS2, "100000000");
      await this.insert(ADDRESS3, 1, ADDRESS4, "100000000");
      await this.insert(ADDRESS3, 1, ADDRESS0, "200000000");
      console.log("💾 Writing initialised state with dummy data to JSON file");

      jsonfile.writeFileSync(file, this.reputations);
    } else {
      for (let i = 0; i < Object.keys(this.reputations).length; i += 1) {
        const key = Object.keys(this.reputations)[i];
        await this.reputationTree.insert(key, this.reputations[key], { gasLimit: 4000000 }); // eslint-disable-line no-await-in-loop
      }
    }

    console.log("🏁 Initialised");
    const that = this;
    setTimeout(() => that.checkSubmissionWindow(), 0);
  }

  async addLogContentsToReputationTree() {
    await super.addLogContentsToReputationTree();
    console.log("💾 Writing new reputation state to JSON file");
    jsonfile.writeFileSync(file, this.reputations);
  }

  async checkSubmissionWindow() {
    // Check if it's been an hour since the window opened
    const addr = await this.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, ReputationMiningCycleJSON.abi, this.realWallet);

    const windowOpened = await repCycle.reputationMiningWindowOpenTimestamp();

    const block = await client.realProvider.getBlock("latest");
    const now = block.timestamp;
    if (now - windowOpened > 3600) {
      console.log("⏰ Looks like it's time to submit an update");
      // If so, process the log
      await client.addLogContentsToReputationTree();

      console.log("#️⃣ Submitting new reputation hash");

      // Submit hash
      await client.submitRootHash();

      console.log("Confirming new reputation hash...");

      // Confirm hash
      const tx = await repCycle.confirmNewHash(0, { gasLimit: 3500000 });
      console.log("✅ New reputation hash confirmed, via TXID", tx);
      const that = this;
      // setTimeout(() => that.checkSubmissionWindow(), 3600000);
      setTimeout(() => that.checkSubmissionWindow(), 10000);
    } else {
      // Set a timeout for 3601 - (now - windowOpened)
      const that = this;
      setTimeout(() => that.checkSubmissionWindow(), 10000);
      // setTimeout(() => that.checkSubmissionWindow(), 3601000 - (now - windowOpened) * 1000);
    }
  }
}

if (!argv.minerAddress || !argv.colonyNetworkAddress || !argv.file) {
  console.log("❗️ You have to specify all of --minerAddress, --colonyNetworkAddress and --file on the command line!");
  process.exit();
}

client = new ReputationMinerClient(argv.minerAddress);
client.initialise(argv.colonyNetworkAddress);
