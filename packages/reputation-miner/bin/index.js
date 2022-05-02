const path = require("path");
const { argv } = require("yargs")
  .option('privateKey', {string:true})
  .option('colonyNetworkAddress', {string:true})
  .option('minerAddress', {string:true})
  .option('providerAddress', {type: "array", default: []});
const ethers = require("ethers");
const backoff = require("exponential-backoff").backOff;

const ReputationMinerClient = require("../ReputationMinerClient");

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

class RetryProvider extends ethers.providers.StaticJsonRpcProvider {
  constructor(connectionInfo, adapterObject){
    super(connectionInfo);
    this.adapter = adapterObject;
  }

  static attemptCheck(err, attemptNumber){
    console.log("Retrying RPC request #", attemptNumber);
    if (attemptNumber === 5){
      return false;
    }
    return true;
  }

  getNetwork(){
    return backoff(() => super.getNetwork(), {retry: RetryProvider.attemptCheck});
  }

  // This should return a Promise (and may throw erros)
  // method is the method name (e.g. getBalance) and params is an
  // object with normalized values passed in, depending on the method
  perform(method, params) {
    return backoff(() => super.perform(method, params), {retry: RetryProvider.attemptCheck, startingDelay: 1000});
  }
}

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
  contractDir: path.resolve(__dirname, "..", "..", "..", "build", "contracts")
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
  provider = new ethers.providers.JsonRpcProvider(rpcEndpoint);
} else {
  const providers = providerAddress.map(endpoint => {
    const {protocol, username, password, host, pathname} = new URL(endpoint);
    const connectionInfo = {
      url: `${protocol}//${host}${pathname}`,
      user: decodeURI(username),
      password: decodeURI(password.replace(/%23/, '#')),
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
