const path = require("path");

const { argv } = require("yargs").option("privateKey", { string: true }).option("colonyNetworkAddress", { string: true });

const { colonyNetworkAddress, gasPrice, privateKey, rpcEndpoint, port, dbPath, gasLimit } = argv;

const { TruffleLoader, RetryProvider } = require("../../package-utils");

const loader = new TruffleLoader({
  contractRoot: path.resolve(__dirname, "..", "..", "..", "artifacts", "contracts"),
});

const MetatransactionBroadcaster = require("../MetatransactionBroadcaster");

const provider = new RetryProvider(rpcEndpoint);

const client = new MetatransactionBroadcaster({ gasPrice, privateKey, loader, provider, port, dbPath, gasLimit });
client.initialise(colonyNetworkAddress);
