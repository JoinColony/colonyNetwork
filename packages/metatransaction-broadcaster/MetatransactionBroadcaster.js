import sqlite3 from "sqlite3";

const ethers = require("ethers");
const express = require("express");
const sqlite = require("sqlite");
const { colonyIOCors, ConsoleAdapter, updateGasEstimate } = require("../package-utils");

class MetatransactionBroadcaster {
  /**
   * Constructor for MetatransactionBroadcaster
   * @param {string} privateKey              The private key of the address that executes the metatransactions
   * @param {Object} loader                  The loader for loading the contract interfaces. Usually a TruffleLoader.
   * @param {Object} provider                Ethers provider that allows access to an ethereum node.
   */
  constructor({ privateKey, loader, provider, adapter, dbPath = "./mtxCache.sqlite", port = 3000, gasLimit = 500000 }) {
    this.provider = provider;
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.senderAddress = this.wallet.address;

    this.gasLimit = gasLimit;

    console.log("Transactions will be sent from ", this.senderAddress);
    this.dbPath = dbPath;

    this.loader = loader;

    this.adapter = adapter;
    if (typeof this.adapter === "undefined") {
      this.adapter = new ConsoleAdapter();
    }

    this.app = express();

    this.app.use(colonyIOCors);

    this.app.use(express.json());

    this.app.get("", async (req, res) => {
      return res.status(200).send("Metatransaction Broadcaster is running!");
    });

    this.app.post("/broadcast", async (req, res) => {

      // Is it a 'normal' metatransaction?
      if (req.body.payload) {
        return this.processMetatransaction(req, res);
      // Is it EIP712 transaction?
      } else if (req.body.deadline) {
        return this.processEIP712Transaction(req, res)
      } else {
        return res.status(400).send({
          status: "fail",
          data: {
            payload: "Not recognised type of metatransaction",
          },
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

    this.gasPrice = await updateGasEstimate("safeLow", this.chainId, this.adapter);
    this.tokenLockingAddress = await this.colonyNetwork.getTokenLocking();

    this.metaTxDef = await this.loader.load({ contractName: "IBasicMetaTransaction" }, { abi: true, address: false });
    this.metaTxTokenDef = await this.loader.load({ contractName: "MetaTxToken" }, { abi: true, address: false });
  }

  async close() {
    this.server.close();
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

  async isTokenTransactionValid(target, txData, userAddress) {
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
      } else if (tx.signature === "setAuthority(address)") {
        // Get the most recent metatx this user sent on colonyNetwork
        let logs = await this.provider.getLogs({
          address: this.colonyNetwork.address,
          topics: [ ethers.utils.id("MetaTransactionExecuted(address,address,bytes)")]
        })
        const data = logs.map((l) => { return {
          log: l,
          event: this.colonyNetwork.interface.parseLog(l)
        }}).filter(x => x.event.args.userAddress === userAddress )
        // Get the TokenAuthorityDeployed event
        const receipt = await this.provider.getTransactionReceipt(data[data.length - 1].log.transactionHash)
        logs = receipt.logs.map(l => this.colonyNetwork.interface.parseLog(l)).filter(e => e.name === "TokenAuthorityDeployed")
        // If the address is the same, it's valid
        return logs[logs.length -1].args.tokenAuthorityAddress === tx.args[0]
      } else if (tx.signature === "setOwner(address)") {
        const checksummedAddress = ethers.utils.getAddress(tx.args[0]);
        const isColony = await this.colonyNetwork.isColony(checksummedAddress);
        valid = isColony;
      }
    } catch (err) {
      // Not a token related transaction (we recognise)
    }
    return valid;
  }

  async isColonyFamilyTransactionAllowed(target, txData, userAddress) {
    const colonyDef = await this.loader.load({ contractName: "IColony" }, { abi: true, address: false });
    const possibleColony = new ethers.Contract(target, colonyDef.abi, this.wallet);
    try {
      const tx = possibleColony.interface.parseTransaction({ data: txData });
      if (tx.signature === "makeArbitraryTransaction(address,bytes)") {
        return false;
      }
      if (tx.signature === "makeArbitraryTransactions(address[],bytes[],bool)") {
        return false;
      }
      if (tx.signature === "makeSingleArbitraryTransaction(address,bytes)") {
        return false;
      }
    } catch (err) {
      // Not a colony related transaction (we recognise)
    }

    const votingRepDef = await this.loader.load({ contractName: "VotingReputation" }, { abi: true, address: false });
    const possibleVotingRep = new ethers.Contract(target, votingRepDef.abi, this.wallet);
    try {
      const tx = possibleVotingRep.interface.parseTransaction({ data: txData });
      if (tx.signature === "finalizeMotion(uint256)") {
        // eslint-disable-next-line no-underscore-dangle
        const motion = await possibleVotingRep.getMotion(tx.args._motionId);
        // Get the motion
        let motionTarget = motion.altTarget;
        if (motionTarget === "0x0000000000000000000000000000000000000000") {
          motionTarget = await possibleVotingRep.getColony();
        }
        // Is the motion doing something we'd allow? Duplicated logic from main function

        const addressValid = await this.isAddressValid(motionTarget);
        // It's possible it's not a valid address, but could be a valid transaction with a token.
        const validTokenTransaction = await this.isTokenTransactionValid(motionTarget, motion.action, userAddress);
        const allowedColonyFamilyTransaction = await this.isColonyFamilyTransactionAllowed(motionTarget, motion.action);
        if (!(addressValid && allowedColonyFamilyTransaction) && !validTokenTransaction) {
          return false;
        }
        return true;
      }
    } catch (err) {
      // Not a voting rep related transaction (we recognise)
    }

    return true;
  }

  async processMetatransaction(req, res) {
    try {
      const { target, userAddress, payload, r, s, v } = req.body;

      const contract = new ethers.Contract(target, this.metaTxDef.abi, this.wallet);
      this.gasPrice = await updateGasEstimate("safeLow", this.chainId, this.adapter);

      let gasEstimate;

      try {
        gasEstimate = await contract.estimateGas.executeMetaTransaction(userAddress, payload, r, s, v, { gasPrice: this.gasPrice });
        if (gasEstimate > this.gasLimit) {
          return res.status(400).send({
            status: "fail",
            data: {
              payload: "Transaction too expensive and will not be broadcast",
            },
          });
        }
      } catch (err) {
        return res.status(400).send({
          status: "fail",
          data: {
            payload: "Transaction reverts and will not be broadcast",
          },
        });
      }

      // Check target is valid
      const addressValid = await this.isAddressValid(target);
      // It's possible it's not a valid address, but could be a valid transaction with a token.
      const validTokenTransaction = await this.isTokenTransactionValid(target, payload, userAddress);
      const allowedColonyFamilyTransaction = await this.isColonyFamilyTransactionAllowed(target, payload, userAddress);
      if (!(addressValid && allowedColonyFamilyTransaction) && !validTokenTransaction) {
        const data = {};
        if (!addressValid) {
          data.target = "Not a contract we pay metatransactions for";
        }
        if (!allowedColonyFamilyTransaction) {
          data.payload = "Not a function on colony we pay metatransactions for";
        }

        // validTokenTransaction after '||' unnecessary, but included for clarity
        // This condition guards against a colony being set up with a native token that follows
        // the ERC20 interface, but the functions calls do something totally different.
        if (!validTokenTransaction || (validTokenTransaction && gasEstimate > 50000)) {
          data.payload = "Not a transaction we pay metatransactions for";
        }
        return res.status(400).send({
          status: "fail",
          data,
        });
      }

      const tx = await contract.executeMetaTransaction(userAddress, payload, r, s, v, { gasPrice: this.gasPrice });
      return res.send({
        status: "success",
        data: {
          txHash: tx.hash,
        },
      });
    } catch (err) {
      return res.status(500).send({
        status: "error",
        message: err,
      });
    }
  }

  async processEIP712Transaction(req, res) {
    try {
      const { target, owner, spender, value, deadline, r, s, v } = req.body;
      const contract = new ethers.Contract(target, this.metaTxTokenDef.abi, this.wallet);
      this.gasPrice = await updateGasEstimate("safeLow", this.chainId, this.adapter);

      let gasEstimate;
      try {
        gasEstimate = await contract.estimateGas.permit(owner, spender, value, deadline, v, r, s, { gasPrice: this.gasPrice });
        if (gasEstimate > this.gasLimit) {
          return res.status(400).send({
            status: "fail",
            data: {
              payload: "Transaction too expensive and will not be broadcast",
            },
          });
        }
      } catch (err) {
        return res.status(400).send({
          status: "fail",
          data: {
            payload: "Transaction reverts and will not be broadcast",
          },
        });
      }

      // Check spender is valid
      console.log(spender)
      const valid = await this.isAddressValid(spender);
      if (!valid){
        const data = {};
        data.payload = "Not a spender we pay metatransactions for";
        return res.status(400).send({
          status: "fail",
          data,
        });
      }

      const tx = await contract.permit(owner, spender, value, deadline, v, r, s, { gasPrice: this.gasPrice })
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
  };
}

module.exports = MetatransactionBroadcaster;
