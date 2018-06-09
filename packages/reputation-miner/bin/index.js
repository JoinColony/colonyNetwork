const path = require("path");
const { argv } = require("yargs");
const { TruffleLoader } = require("@colony/colony-js-contract-loader-fs");
const ethers = require("ethers");

const ReputationMinerClient = require("../ReputationMinerClient");

const { file, minerAddress, colonyNetworkAddress, rinkeby, privateKey, seed } = argv;

if ((!minerAddress && !privateKey) || !colonyNetworkAddress || !file) {
  console.log("❗️ You have to specify all of ( --minerAddress or --privateKey ), --colonyNetworkAddress and --file on the command line!");
  process.exit();
}

const loader = new TruffleLoader({
  contractDir: path.resolve(process.cwd(), "build", "contracts")
});

let provider;
if (rinkeby) {
  provider = new ethers.providers.InfuraProvider("rinkeby");
}

const client = new ReputationMinerClient({ file, loader, minerAddress, privateKey, provider, seed });
client.initialise(colonyNetworkAddress);
