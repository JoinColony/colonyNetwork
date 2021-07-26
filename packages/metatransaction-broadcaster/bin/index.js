require("@babel/register")({
  presets: ["@babel/preset-env"],
});
require("@babel/polyfill");

const { argv } = require("yargs");
const path = require("path");

const { colonyNetworkAddress, gasPrice, privateKey } = argv;

const TruffleLoader = require("../TruffleLoader").default;

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "..", "..", "build", "contracts"),
});

const MetatransactionBroadcaster = require("../MetatransactionBroadcaster");

const client = new MetatransactionBroadcaster({ gasPrice, privateKey, loader });
client.initialise(colonyNetworkAddress);
