require("@babel/register")({
  presets: ["@babel/preset-env"],
});
require("@babel/polyfill");

const ethers = require("ethers");
const path = require("path");

const { argv } = require("yargs")
  .option("privateKey", { string: true })
  .option("whitelistAddress", { string: true })
  .option("apiKey", { string: true });

const KycOracle = require("../KycOracle");
const TruffleLoader = require("../TruffleLoader").default;

const { userAddress, privateKey, whitelistAddress, apiKey, network, providerPort, providerAddress } = argv;
const supportedInfuraNetworks = ["mainnet"];

if ((!userAddress && !privateKey) || !whitelistAddress) {
  console.log("❗️ Must specify all of ( --userAddress or --privateKey ) and --whitelistAddress and --apiKey on the command line!");
  process.exit();
}

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "..", "..", "build", "contracts")
});

let provider;
if (network) {
  if (!supportedInfuraNetworks.includes(network)) {
    console.log(`❗️ "network" option accepts only supported Infura networks: ${supportedInfuraNetworks} !`);
    process.exit();
  }
  provider = new ethers.providers.InfuraProvider(network);
} else {
  provider = new ethers.providers.JsonRpcProvider(`http://${providerAddress || "localhost"}:${providerPort || "8545"}`);
}

const client = new KycOracle({ privateKey, userAddress, apiKey, loader, provider });
client.initialise(whitelistAddress);
