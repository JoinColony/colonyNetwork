const axios = require("axios");
const ethers = require("ethers");
const express = require("express");
const etherpass = require("etherpass");

const { getChallenge } = etherpass;
const { verifyEthSignature } = etherpass;
const sqlite3 = require("sqlite3");
const sqlite = require("sqlite");
const bodyParser = require("body-parser");

class KycOracle {
  /**
   * Constructor for KycOracle
   * @param {string} privateKey              The private key of the address that has the administration permission.
   *                                           If used, `adminAddress` is not needed and will be derived.
   * @param {string} adminAddress             The address that has the administration permission to edit the whitelist.
   * @param {string} whitelistAddress        The address the whitelist.
   * @param {Object} loader                  The loader for loading the contract interfaces. Usually a TruffleLoader.
   * @param {Object} provider                Ethers provider that allows access to an ethereum node.
   * @param {Number} [port]                  The port the oracle will serve on
   */
  constructor({ privateKey, adminAddress, apiKey, loader, provider, dbPath, port = 3000 }) {
    if (privateKey) {
      this.wallet = new ethers.Wallet(privateKey, this.provider);
      this.adminAddress = this.wallet.address;
    } else {
      this.wallet = provider.getSigner(adminAddress);
      this.adminAddress = adminAddress;
    }
    console.log("Transactions will be signed from ", this.adminAddress);

    this.apiKey = apiKey;
    this.dbPath = dbPath;

    if (!this.dbPath) {
      this.dbPath = "kycSessions.db";
    }

    this.loader = loader;
    this.provider = provider;

    this.app = express();

    this.app.use(function (req, res, next) {
      // TODO: Echo origin back, if allowed. Basically, *.colony.io
      res.header("Access-Control-Allow-Origin", "*");
      next();
    });

    this.app.use(bodyParser.json());

    this.app.get("", async (req, res) => {
      return res.status(200).send("KycOracle is running!");
    });

    this.app.post("/auth/challenge", (req, res) => {
      try {
        const { address } = req.body;
        const challenge = getChallenge(address);
        return res.json({ challenge });
      } catch (err) {
        return res.status(500).send(err);
      }
    });

    this.app.post("/auth/token", async (req, res) => {
      try {
        if (typeof req.body.challenge !== "string" || typeof req.body.signature !== "string") {
          throw new Error("Invalid challenge/signature");
        }

        // This throws if bad signature
        const address = verifyEthSignature(req.body.challenge, req.body.signature);

        // Do we already have a session for this address on synaps?
        let sessionId = await this.getSessionForAddress(address);

        if (!sessionId) {
          // Create a session for them
          const { data } = await axios.post(
            "https://workflow-api.synaps.io/v2/session/init",
            {}, // No data
            {
              headers: {
                "Api-Key": this.apiKey,
                alias: address,
              },
            }
          );
          sessionId = data.session_id;

          // And save to db
          await this.setSessionForAddress(address, sessionId);
        }

        return res.json({ sessionId });
      } catch (err) {
        console.log;
        return res.status(500).send(err);
      }
    });

    // Query for KYC status and update the whitelist
    this.app.get("/status/:sessionId", async (req, res) => {
      try {
        const { data } = await axios.get("https://workflow-api.synaps.io/v2/session/info", {
          headers: {
            "Api-Key": this.apiKey,
            "Session-Id": req.params.sessionId,
          },
        });

        const validated = data.status === "VERIFIED";
        const userAddress = await this.getAddressForSession(req.params.sessionId);

        if (validated) {
          const alreadyApproved = await this.whitelist.getApproval(userAddress);
          if (!alreadyApproved) {
            await this.updateGasEstimate("safeLow");
            const gasEstimate = await this.whitelist.estimateGas.approveUser(userAddress, true);
            this.whitelist.approveUser(userAddress, true, { gasLimit: gasEstimate, gasPrice: this.gasPrice });
          }
        }

        return res.status(200).send(data);
      } catch (err) {
        console.log(err);
        return res.status(500).send(err);
      }
    });

    this.server = this.app.listen(port, () => {
      console.log(`⭐️ KycOracle running on port ${this.server.address().port}`);
    });
  }

  /**
   * Initialises the Kyc Oracle so that it knows where to find the `Whitelist` contract
   * @param  {string}  whitelistAddress The address of the current `Whitelist` contract
   * @return {Promise}
   */
  async initialise(whitelistAddress) {
    const network = await this.provider.getNetwork();
    this.chainId = network.chainId;

    this.whitelistContractDef = await this.loader.load({ contractName: "Whitelist" }, { abi: true, address: false });
    this.whitelist = new ethers.Contract(whitelistAddress, this.whitelistContractDef.abi, this.wallet);

    await this.updateGasEstimate("safeLow");
    await this.createDB();
  }

  /**
   * Update the gas estimate
   * @param  {string}  Transaction speed (fastest, fast, safeLow)
   * @return {Promise}
   */
  async updateGasEstimate(type) {
    if (this.chainId === 100) {
      this.gasPrice = ethers.utils.hexlify(1000000000);
      return;
    }

    try {
      // Get latest from ethGasStation
      const { data } = await axios.get("https://ethgasstation.info/json/ethgasAPI.json");

      if (data[type]) {
        this.gasPrice = ethers.utils.hexlify((data[type] / 10) * 1e9);
      } else {
        this.gasPrice = ethers.utils.hexlify(20000000000);
      }
    } catch (err) {
      console.log(`Error during gas estimation: ${err}`);
      this.gasPrice = ethers.utils.hexlify(20000000000);
    }
  }

  async createDB() {
    const db = await sqlite.open({ filename: this.dbPath, driver: sqlite3.Database });
    await db.run("CREATE TABLE IF NOT EXISTS users ( address text NOT NULL UNIQUE, session_id text NOT NULL  )");
    await db.close();
  }

  async getSessionForAddress(address) {
    const db = await sqlite.open({ filename: this.dbPath, driver: sqlite3.Database });
    const res = await db.all(
      `SELECT DISTINCT users.session_id as session_id
       FROM users
       WHERE users.address="${address}"`
    );
    await db.close();
    const sessionIds = res.map((x) => x.session_id);
    console.log(sessionIds);
    if (sessionIds.length > 1) {
      throw new Error("More than one matching address");
    }
    return sessionIds[0];
  }

  async setSessionForAddress(address, session) {
    console.log(address, session);
    const db = await sqlite.open({ filename: this.dbPath, driver: sqlite3.Database });
    await db.run(
      `INSERT INTO users (address, session_id) VALUES ('${address}', '${session}') ON CONFLICT(address) DO UPDATE SET session_id = '${session}'`
    );
    await db.close();
  }

  async getAddressForSession(sessionId) {
    const db = await sqlite.open({ filename: this.dbPath, driver: sqlite3.Database });
    const res = await db.all(
      `SELECT DISTINCT users.address as address
       FROM users
       WHERE users.session_id="${sessionId}"`
    );
    await db.close();
    const addresses = res.map((x) => x.address);
    if (addresses.length > 1) {
      throw new Error("More than one matching session");
    }
    return addresses[0];
  }
}

module.exports = KycOracle;
