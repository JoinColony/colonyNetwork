require("@babel/register")({
  presets: ["@babel/preset-env"]
});
require("@babel/polyfill");

const path = require("path");
const { argv } = require("yargs");
const { TruffleLoader } = require("@colony/colony-js-contract-loader-fs");
const ethers = require("ethers");

const ReputationMinerClient = require("../ReputationMinerClient");

const supportedInfuraNetworks = ["goerli", "rinkeby", "ropsten", "kovan", "mainnet"];
const { minerAddress, privateKey, colonyNetworkAddress, dbPath, network, localPort } = argv;

if ((!minerAddress && !privateKey) || !colonyNetworkAddress) {
  console.log("❗️ You have to specify all of ( --minerAddress or --privateKey ) and --colonyNetworkAddress on the command line!");
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
  provider = new ethers.providers.JsonRpcProvider(`http://localhost:${localPort || "8545"}`);
}

const client = new ReputationMinerClient({ loader, minerAddress, privateKey, provider, useJsTree: true, dbPath });
client.initialise(colonyNetworkAddress);
