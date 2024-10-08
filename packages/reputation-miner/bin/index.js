const path = require("path");
const { argv } = require("yargs")
  .option('privateKey', {string:true})
  .option('colonyNetworkAddress', {string:true})
  .option('minerAddress', {string:true})
  .option('providerAddress', {type: "array", default: []});
const ethers = require("ethers");

const ReputationMinerClient = require("../ReputationMinerClient");
const {RetryProvider} = require("../../package-utils");

const { ConsoleAdapter, SlackAdapter, DiscordAdapter, TruffleLoader } = require("../../package-utils");

const supportedInfuraNetworks = ["goerli", "rinkeby", "ropsten", "kovan", "mainnet"];
const {
  minerAddress,
  privateKey,
  colonyNetworkAddress,
  dbPath,
  network,
  localPort,
  localProviderAddress,
  providerAddress,
  syncFrom,
  auto,
  oracle,
  exitOnError,
  adapter,
  oraclePort,
  processingDelay,
  adapterLabel,
} = argv;

if ((!minerAddress && !privateKey) || !colonyNetworkAddress || !syncFrom) {
  console.log("❗️ You have to specify all of ( --minerAddress or --privateKey ) and --colonyNetworkAddress and --syncFrom on the command line!");
  process.exit();
}


let adapterObject;

if (adapter === 'slack') {
  adapterObject = new SlackAdapter();
} else if (adapter === 'discord'){
  adapterObject = new DiscordAdapter(adapterLabel);
} else {
  adapterObject = new ConsoleAdapter();
}

const loader = new TruffleLoader({
  contractRoot: path.resolve(__dirname, "..", "..", "..", "artifacts", "contracts")
});

let provider;
if (network) {
  if (!supportedInfuraNetworks.includes(network)) {
    console.log(`❗️ "network" option accepts only supported Infura networks: ${supportedInfuraNetworks} !`);
    process.exit();
  }
  provider = new ethers.providers.InfuraProvider(network);
} else if (providerAddress.length === 0){
  const rpcEndpoint = `${localProviderAddress || "http://localhost"}:${localPort || "8545"}`;
  provider = new RetryProvider(rpcEndpoint);
} else {
  const providers = providerAddress.map(endpoint => {
    const {protocol, username, password, host, pathname} = new URL(endpoint);
    const connectionInfo = {
      url: `${protocol}//${host}${pathname}`,
      user: decodeURI(username),
      password: decodeURI(password.replace(/%23/, '#')),
    }
    if (connectionInfo.user === "") {
      delete connectionInfo.user;
    }
    if (connectionInfo.password === "") {
      delete connectionInfo.password;
    }
    return new RetryProvider(connectionInfo, adapterObject);
  })
  // This is, at best, a huge hack...
  providers.forEach(x => x.getNetwork());

  // The Fallback provider somehow strips out blockTag, so isn't suitable for use during syncing.
  // See https://github.com/ethers-io/ethers.js/discussions/1960
  // When sorted, use this line instead.
  // provider = new ethers.providers.FallbackProvider(providers, 1)
  [ provider ] = providers;
}

const client = new ReputationMinerClient({
  loader,
  minerAddress,
  privateKey,
  provider,
  useJsTree: true,
  dbPath,
  auto,
  oracle,
  exitOnError,
  adapter: adapterObject,
  oraclePort,
  processingDelay
});
client.initialise(colonyNetworkAddress, syncFrom);
