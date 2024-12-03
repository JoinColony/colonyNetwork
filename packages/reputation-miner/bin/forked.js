const hre = require("hardhat");
const path = require("path");
const express = require("express");
const axios = require("axios")

const { argv } = require("yargs")
  .option('privateKey', {string:true})
  .option('colonyNetworkAddress', {string:true})
  .option('minerAddress', {string:true})
  .option('providerAddress', {type: "array", default: []});
// const ethers = require("ethers");

const {ethers} = hre;

const ReputationMinerClient = require("../ReputationMinerClient");
const { ConsoleAdapter, TruffleLoader } = require("../../package-utils");

const {
    minerAddress,
    privateKey,
    colonyNetworkAddress,
    dbPath,
    syncFrom,
    auto,
    oracle,
    exitOnError,
    oraclePort,
    processingDelay,
  } = argv;

const loader = new TruffleLoader({
    contractRoot: path.resolve(__dirname, "..", "..", "..", "artifacts", "contracts")
});

const provider = new ethers.providers.StaticJsonRpcProvider("http://localhost:8545");
const adapterObject = new ConsoleAdapter();

const client = new ReputationMinerClient({
  loader,
  minerAddress,
  privateKey,
  provider,
  useJsTree: true,
  dbPath,
  auto,
  oracle,
  exitOnError,
  adapter: adapterObject,
  oraclePort: 3001,
  processingDelay
});

async function main() {
  await client.initialise(colonyNetworkAddress, syncFrom);
  client._miner.realWallet = await ethers.getImpersonatedSigner(minerAddress);

  if (oracle) {
    // Start a forked oracle. This will query our local node, and if that fails, query upstream.

    this._app = express();

    this._app.use(function(req, res, next) {
      res.header("Access-Control-Allow-Origin", "*");
      next();
    });

    this._app.get("/favicon.ico", (req, res) => {
      res.status(204).end();
    });

    this._app.get("/", (req, res) => {
      res.status(204).end();
    });


    this._app.get("*", async (req, res) => {

      try {
        const { data } = await axios.get(`http://localhost:${3001}/${req.originalUrl}`);
        res.send(data);
      } catch (e) {
        console.log('Local reputation request failed, trying upstream URL:');
        // If the local oracle fails, query the upstream oracle.
        console.log(`${process.env.REPUTATION_URL}/${req.originalUrl}`)
        try {

          const { data } = await axios({
            url: `${process.env.REPUTATION_URL}/${req.originalUrl}`,
          });

          res.send(data);
        } catch (e2) {
          console.log('Upstream reputation request failed, forwarding result');
          res.status(e2.response.status).send(await e2.response.data);
        }
      }
    });


    this._app.listen(oraclePort || 3000, () => {
      console.log(`Forked (pass-through) oracle listening on port ${oraclePort || 3000}`);
    });
  }
}

main();