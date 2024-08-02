const hre = require("hardhat");
const path = require("path");

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
  oraclePort,
  processingDelay
});

async function main() {
  await client.initialise(colonyNetworkAddress, syncFrom);
  client._miner.realWallet = await ethers.getImpersonatedSigner(minerAddress);
}

main();