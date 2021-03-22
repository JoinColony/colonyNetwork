const axios = require("axios");
const ethers = require("ethers");
const express = require("express");

class KycOracle {
  /**
   * Constructor for KycOracle
   * @param {string} privateKey              The private key of the address that has the administration permission.
   *                                           If used, `userAddress` is not needed and will be derived.
   * @param {string} userAddress             The address that has the administration permission to edit the whitelist.
   * @param {string} whitelistAddress        The address the whitelist.
   * @param {Object} loader                  The loader for loading the contract interfaces. Usually a TruffleLoader.
   * @param {Object} provider                Ethers provider that allows access to an ethereum node.
   * @param {Number} [port]                  The port the oracle will serve on
   */
  constructor({ privateKey, userAddress, apiKey, loader, provider, port = 3000 }) {
    if (privateKey) {
      this.wallet = new ethers.Wallet(privateKey, this.provider);
      this.userAddress = this.wallet.address;
    } else {
      this.wallet = provider.getSigner(userAddress);
      this.userAddress = userAddress;
    }
    console.log("Transactions will be signed from ", this.userAddress);

    this.apiKey = apiKey;

    this.loader = loader;
    this.provider = provider;

    this.app = express();

    this.app.use(function (req, res, next) {
      res.header("Access-Control-Allow-Origin", "*");
      next();
    });

    this.app.get("", async (req, res) => {
      return res.status(200).send("KycOracle is running!");
    });

    // Create a new session
    this.app.get("/session", async (req, res) => {
      const { data } = await axios.post(
        "https://workflow-api.synaps.io/v2/session/init",
        {}, // No data
        {
          headers: {
            "Api-Key": this.apiKey,
          },
        }
      );

      return res.status(200).send(data);
    });

    // Query for KYC status and update the whitelist
    this.app.get("/status/:sessionId", async (req, res) => {
      const { data } = await axios.get("https://workflow-api.synaps.io/v2/workflow/details", {
        headers: {
          "Api-Key": this.apiKey,
          "Session-Id": req.params.sessionId,
        },
      });

      // TODO: Update this logic once the final verification flow is ready
      const validated = data.identity_step[0].state === "VALIDATED";
      const userAddress = this.userAddress;

      if (validated) {
        const alreadyApproved = await this.whitelist.getApproval(userAddress);
        if(!alreadyApproved) {
          // TODO: Pull actual user address from Synaps, this is only a placeholder
          const gasEstimate = await this.whitelist.estimateGas.approveUser(userAddress, true);
          await this.whitelist.approveUser(userAddress, true, { gasLimit: gasEstimate, gasPrice: this.gasPrice });
        }
      }

      return res.status(200).send(data);
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

      if (data[type]){
        this.gasPrice = ethers.utils.hexlify(data[type] / 10 * 1e9);
      } else {
        this.gasPrice = ethers.utils.hexlify(20000000000);
      }
    } catch (err) {
      console.log(`Error during gas estimation: ${err}`);
      this.gasPrice = ethers.utils.hexlify(20000000000);
    }
  }
}

module.exports = KycOracle;
