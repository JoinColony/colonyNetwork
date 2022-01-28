require("@babel/register")({
  presets: ["@babel/preset-env"],
});
require("@babel/polyfill");

const ethers = require("ethers");
const path = require("path");

const { argv } = require("yargs")
  .option("privateKey", { string: true })
  .option("whitelistAddress", { string: true })
  .option("apiKey", { string: true })
  .option("adminAddress", { string: true })
  .option("providerAddress", { type: "array", default: [] });

const KycOracle = require("../KycOracle");
const TruffleLoader = require("../TruffleLoader").default;

const { adminAddress, privateKey, whitelistAddress, apiKey, network, localProviderPort, localProviderAddress, providerAddress, dbPath, port } = argv;
const supportedInfuraNetworks = ["mainnet"];

if ((!adminAddress && !privateKey) || !whitelistAddress || !apiKey) {
  console.log("❗️ Must specify all of ( --adminAddress or --privateKey ) and --whitelistAddress and --apiKey on the command line!");
  process.exit();
}

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "..", "..", "build", "contracts"),
});

let provider;
if (network) {
  if (!supportedInfuraNetworks.includes(network)) {
    console.log(`❗️ "network" option accepts only supported Infura networks: ${supportedInfuraNetworks} !`);
    process.exit();
  }
  provider = new ethers.providers.InfuraProvider(network);
} else if (providerAddress.length === 0) {
  provider = new ethers.providers.JsonRpcProvider(`http://${localProviderAddress || "localhost"}:${localProviderPort || "8545"}`);
} else {
  provider = new ethers.providers.JsonRpcProvider(providerAddress[0]);
}

const client = new KycOracle({ privateKey, adminAddress, apiKey, loader, provider, dbPath, port });
client.initialise(whitelistAddress);
