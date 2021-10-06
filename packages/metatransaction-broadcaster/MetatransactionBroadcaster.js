import sqlite3 from "sqlite3";

const ethers = require("ethers");
const express = require("express");
const request = require("request-promise");
const sqlite = require("sqlite");
const ConsoleAdapter = require("./adapters/console").default;

class MetatransactionBroadcaster {
  /**
   * Constructor for MetatransactionBroadcaster
   * @param {string} privateKey              The private key of the address that executes the metatransactions
   * @param {Object} loader                  The loader for loading the contract interfaces. Usually a TruffleLoader.
   * @param {Object} provider                Ethers provider that allows access to an ethereum node.
   */
  constructor({ privateKey, loader, provider, adapter, dbPath = "./mtxCache.sqlite", port = 3000 }) {
    this.provider = provider;
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.senderAddress = this.wallet.address;

    console.log("Transactions will be sent from ", this.senderAddress);
    this.dbPath = dbPath;

    this.loader = loader;

    this.adapter = adapter;
    if (typeof this.adapter === "undefined") {
      this.adapter = ConsoleAdapter;
    }

    this.app = express();

    this.app.use(function (req, res, next) {
      const origin = req.get("origin");

      const colonyRegex = /.*colony\.io/;
      const colonyMatches = colonyRegex.exec(origin);

      const localRegex = /http:\/\/(127(\.\d+){1,3}|[0:]+1|localhost)/;

      const localMatches = localRegex.exec(origin);

      if (colonyMatches) {
        res.header("Access-Control-Allow-Origin", colonyMatches[0]);
      } else if (localMatches) {
        res.header("Access-Control-Allow-Origin", "*");
      }
      res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Synaps-Session-Id");
      next();
    });

    this.app.use(express.json());

    this.app.get("", async (req, res) => {
      return res.status(200).send("Metatransaction Broadcaster is running!");
    });

    this.app.post("/broadcast", async (req, res) => {
      try {
        const { target, userAddress, payload, r, s, v } = req.body;
        // Check target is valid
        const addressValid = await this.isAddressValid(target);
        // It's possible it's not a valid address, but could be a valid transaction with a token.
        const validTokenTransaction = await this.isTransactionValid(target, payload);
        if (!addressValid && !validTokenTransaction) {
          const data = {};
          if (!addressValid) {
            data.target = "Not a contract we pay metatransactions for";
          }
          if (!validTokenTransaction) {
            data.payload = "Not a transaction we pay metatransactions for";
          }
          return res.status(400).send({
            status: "fail",
            data,
          });
        }

        const contract = new ethers.Contract(target, this.metaTxDef.abi, this.wallet);
        await this.updateGasEstimate("safeLow");

        const tx = await contract.executeMetaTransaction(userAddress, payload, r, s, v, { gasPrice: this.gasPrice });

        return res.send({
          status: "success",
          data: {
            txHash: tx.hash,
          },
        });
      } catch (err) {
        console.log(err);
        return res.status(500).send({
          status: "error",
          message: err,
        });
      }
    });

    this.server = this.app.listen(port, () => {
      console.log(`⭐️ Metatransaction Broadcaster running on port ${this.server.address().port}`);
    });
  }

  /**
   * Initialises the metatransaction broadcaster so that it knows where to find the colonyNetwork contract
   * @param  {string}  colonyNetworkAddress The address of the current `colonyNetwork` contract
   * @return {Promise}
   */
  async initialise(colonyNetworkAddress) {
    await this.createDB();

    const network = await this.provider.getNetwork();
    this.chainId = network.chainId;

    const colonyNetworkDef = await this.loader.load({ contractName: "IColonyNetwork" }, { abi: true, address: false });
    this.colonyNetwork = new ethers.Contract(colonyNetworkAddress, colonyNetworkDef.abi, this.wallet);

    await this.updateGasEstimate("safeLow");
    this.tokenLockingAddress = await this.colonyNetwork.getTokenLocking();

    this.metaTxDef = await this.loader.load({ contractName: "IBasicMetaTransaction" }, { abi: true, address: false });
  }

  async close() {
    this.server.close();
  }

  /**
   * Update the gas estimate
   * @param  {string}  Transaction speed (fastest, fast, safeLow)
   * @return {Promise}
   */
  async updateGasEstimate(_type) {
    let type = _type;
    const options = {
      headers: {
        "User-Agent": "Request-Promise",
      },
      json: true, // Automatically parses the JSON string in the response
    };
    let defaultGasPrice;
    let factor;

    if (this.chainId === 100) {
      options.uri = "https://blockscout.com/xdai/mainnet/api/v1/gas-price-oracle";
      defaultGasPrice = ethers.utils.hexlify(1000000000);
      factor = 1;
      // This oracle presents the information slightly differently from ethgasstation.
      if (_type === "safeLow") {
        type = "slow";
      }
    } else if (this.chainId === 1) {
      options.uri = "https://ethgasstation.info/json/ethgasAPI.json";
      defaultGasPrice = ethers.utils.hexlify(20000000000);
      factor = 10;
    } else {
      this.adapter.error(`Error during gas estimation: unknown chainid ${this.chainId}`);
      this.gasPrice = ethers.utils.hexlify(20000000000);
      return;
    }

    // Get latest from whichever oracle
    try {
      const gasEstimates = await request(options);

      if (gasEstimates[type]) {
        this.gasPrice = ethers.utils.hexlify((gasEstimates[type] / factor) * 1e9);
      } else {
        this.gasPrice = defaultGasPrice;
      }
    } catch (err) {
      this.adapter.error(`Error during gas estimation: ${err}`);
      this.gasPrice = defaultGasPrice;
    }
  }

  async createDB() {
    const db = await sqlite.open({ filename: this.dbPath, driver: sqlite3.Database });
    await db.run(
      `CREATE TABLE IF NOT EXISTS addresses (
        address text NOT NULL UNIQUE,
        validForMtx bool NOT NULL
      )`
    );
    await db.close();
  }

  async isAddressValid(address) {
    const checksummedAddress = ethers.utils.getAddress(address);
    const db = await sqlite.open({ filename: this.dbPath, driver: sqlite3.Database });
    const res = await db.all(
      `SELECT DISTINCT addresses.validForMtx as validForMtx
       FROM addresses
       WHERE addresses.address="${checksummedAddress}"`
    );
    await db.close();
    const valid = res.map((x) => x.validForMtx);
    if (valid.length === 1) {
      return valid[0] === 1; // Effectively converting Tinyint(1) to Boolean
    }

    if (valid.length > 1) {
      throw new Error("More than one matching address in DB");
    }

    // If not in the DB, then we have to see if it's a good idea
    // Is it one of our 'fixed' addresses?
    // i.e. is it the network or token locking?
    if (checksummedAddress === this.colonyNetwork.address || checksummedAddress === this.tokenLockingAddress) {
      await this.setAddressValid(checksummedAddress);
      return true;
    }

    // Is it a colony?
    const isColony = await this.colonyNetwork.isColony(checksummedAddress);
    if (isColony) {
      await this.setAddressValid(checksummedAddress);
      return true;
    }

    // Is it an extension?
    // We do this is two parts. Is it an old-style extension?
    // First, instantiate it as if it's an extension.
    const colonyExtensionDef = await this.loader.load({ contractName: "ColonyExtension" }, { abi: true, address: false });
    const possibleExtension = new ethers.Contract(checksummedAddress, colonyExtensionDef.abi, this.wallet);
    try {
      const extensionId = await possibleExtension.identifier();
      const extensionColony = await possibleExtension.getColony();
      const oldInstallation = await this.colonyNetwork.getExtensionInstallation(extensionId, extensionColony);
      if (oldInstallation === checksummedAddress) {
        await this.setAddressValid(checksummedAddress);
        return true;
      }
    } catch (err) {
      // Not an extension
    }

    // TODO Is it a new-style extension?
    return false;
  }

  async setAddressValid(address) {
    const db = await sqlite.open({ filename: this.dbPath, driver: sqlite3.Database });
    await db.run(
      `INSERT INTO addresses (address, validForMtx)
       VALUES ("${address}", true)
       ON CONFLICT(address) DO
       UPDATE SET validForMtx = "true"`
    );
    await db.close();
  }

  async isTransactionValid(target, txData) {
    const metaTxTokenDef = await this.loader.load({ contractName: "MetaTxToken" }, { abi: true, address: false });
    const possibleToken = new ethers.Contract(target, metaTxTokenDef.abi, this.wallet);
    let valid = false;
    try {
      const tx = possibleToken.interface.parseTransaction({ data: txData });
      if (tx.signature === "transfer(address,uint256)") {
        valid = await this.isAddressValid(tx.args[0]);
      } else if (tx.signature === "transferFrom(address,address,uint256)") {
        valid = await this.isAddressValid(tx.args[1]);
      } else if (tx.signature === "approve(address,uint256)") {
        valid = await this.isAddressValid(tx.args[0]);
      }
    } catch (err) {
      // Not a token related transaction (we recognise)
    }
    return valid;
  }
}

module.exports = MetatransactionBroadcaster;
