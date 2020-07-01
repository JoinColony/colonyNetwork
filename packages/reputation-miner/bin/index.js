require("@babel/register")({
  presets: ["@babel/preset-env"]
});
require("@babel/polyfill");

const path = require("path");
const { argv } = require("yargs");
const ethers = require("ethers");

const ReputationMinerClient = require("../ReputationMinerClient");
const TruffleLoader = require("../TruffleLoader");

const supportedInfuraNetworks = ["goerli", "rinkeby", "ropsten", "kovan", "mainnet"];
const {
  minerAddress,
  privateKey,
  colonyNetworkAddress,
  dbPath,
  network,
  localPort,
  localProviderAddress,
  syncFrom,
  auto,
  oracle,
  exitOnError,
  adapter
} = argv;

if ((!minerAddress && !privateKey) || !colonyNetworkAddress || !syncFrom) {
  console.log("❗️ You have to specify all of ( --minerAddress or --privateKey ) and --colonyNetworkAddress and --syncFrom on the command line!");
  process.exit();
}

const loader = new TruffleLoader({
  contractDir: path.resolve(process.cwd(), "build", "contracts")
});

let provider;
if (network) {
  if (!supportedInfuraNetworks.includes(network)) {
    console.log(`❗️ "network" option accepts only supported Infura networks: ${supportedInfuraNetworks} !`);
    process.exit();
  }
  provider = new ethers.providers.InfuraProvider(network);
} else {
  provider = new ethers.providers.JsonRpcProvider(`http://${localProviderAddress || "localhost"}:${localPort || "8545"}`);
}

let adapterObject;

if (adapter === 'slack') {
  adapterObject = require('../adapters/slack').default; // eslint-disable-line global-require
} else {
  adapterObject = require('../adapters/console').default; // eslint-disable-line global-require
}

const client = new ReputationMinerClient(
  { loader, minerAddress, privateKey, provider, useJsTree: true, dbPath, auto, oracle, exitOnError, adapter:adapterObject }
);
client.initialise(colonyNetworkAddress, syncFrom);
