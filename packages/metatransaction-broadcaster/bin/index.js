const path = require("path");
const ethers = require("ethers");

const { argv } = require("yargs").option("privateKey", { string: true }).option("colonyNetworkAddress", { string: true });

const { colonyNetworkAddress, gasPrice, privateKey, rpcEndpoint, port, dbPath, gasLimit } = argv;

const { TruffleLoader } = require("../../package-utils");

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "..", "..", "build", "contracts"),
});

const MetatransactionBroadcaster = require("../MetatransactionBroadcaster");

const provider = new ethers.providers.JsonRpcProvider(rpcEndpoint);

const client = new MetatransactionBroadcaster({ gasPrice, privateKey, loader, provider, port, dbPath, gasLimit });
client.initialise(colonyNetworkAddress);
