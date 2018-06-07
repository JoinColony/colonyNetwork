const path = require("path");
const { argv } = require("yargs");
const { TruffleLoader } = require("@colony/colony-js-contract-loader-fs");

const ReputationMinerClient = require("../ReputationMinerClient");

const { file, minerAddress, colonyNetworkAddress } = argv;

if (!minerAddress || !colonyNetworkAddress || !file) {
  console.log("❗️ You have to specify all of --minerAddress, --colonyNetworkAddress and --file on the command line!");
  process.exit();
}

const loader = new TruffleLoader({
  contractDir: path.resolve(process.cwd(), "build", "contracts")
});

const client = new ReputationMinerClient({ file, loader, minerAddress });
client.initialise(colonyNetworkAddress);
