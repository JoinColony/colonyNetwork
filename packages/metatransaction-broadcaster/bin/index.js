require("@babel/register")({
  presets: ["@babel/preset-env"],
});
require("@babel/polyfill");
const ethers = require("ethers");

const { argv } = require("yargs").option("privateKey", { string: true }).option("colonyNetworkAddress", { string: true });

const path = require("path");

const { colonyNetworkAddress, gasPrice, privateKey, rpcEndpoint } = argv;

const TruffleLoader = require("../TruffleLoader").default;

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "..", "..", "build", "contracts"),
});

const MetatransactionBroadcaster = require("../MetatransactionBroadcaster");

const provider = new ethers.providers.JsonRpcProvider(rpcEndpoint);

const client = new MetatransactionBroadcaster({ gasPrice, privateKey, loader, provider });
client.initialise(colonyNetworkAddress);
