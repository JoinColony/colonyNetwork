require("@babel/register")({
  presets: ["@babel/preset-env"]
});
require("@babel/polyfill");

const path = require("path");
const { argv } = require("yargs");
const { TruffleLoader } = require("@colony/colony-js-contract-loader-fs");
const ethers = require("ethers");

const ReputationMinerClient = require("../ReputationMinerClient");

const { minerAddress, colonyNetworkAddress, rinkeby, privateKey, seed } = argv;

if ((!minerAddress && !privateKey) || !colonyNetworkAddress) {
  console.log("❗️ You have to specify all of ( --minerAddress or --privateKey ) and --colonyNetworkAddress on the command line!");
  process.exit();
}

const loader = new TruffleLoader({
  contractDir: path.resolve(process.cwd(), "build", "contracts")
});

let provider;
if (rinkeby) {
  provider = new ethers.providers.InfuraProvider("rinkeby");
}

const client = new ReputationMinerClient({ loader, minerAddress, privateKey, provider, seed, useJsTree: true });
client.initialise(colonyNetworkAddress);
