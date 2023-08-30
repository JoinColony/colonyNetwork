const path = require("path");
const yargs = require("yargs")
const ethers = require("ethers");
const backoff = require("exponential-backoff").backOff;

const ReputationMinerClient = require("../ReputationMinerClient");

const { ConsoleAdapter, SlackAdapter, DiscordAdapter, TruffleLoader } = require("../../package-utils");

const supportedInfuraNetworks = ["goerli", "rinkeby", "ropsten", "kovan", "mainnet"];

const { argv } = yargs
  .option("adapter", {
    type: "string",
    choices: ["console", "discord", "slack"],
    default: "console"
  })
  .option("adapterLabel", {
    type: "string",
  })
  .option("auto", {
    describe: "Whether to automatically submit hashes and respond to challenges",
    type: "boolean",
    default: true
  })
  .option("colonyNetworkAddress", {
    type: "string",
    default: "0x78163f593D1Fa151B4B7cacD146586aD2b686294"
  })
  .option("dbPath", {
    describe: "Path where to save the database",
    type: "string",
    default: "./reputations.sqlite"
  })
  .option("exitOnError", {
    describe: "Whether to exit when an error is hit or not.",
    type: "boolean",
    default: false,
  })
  .option("minerAddress", {
    describe: "The address that is staking CLNY that will allow the miner to submit reputation hashes",
    type: "string",
    conflicts: "privateKey",
  })
  .option("network", {
    type: "string",
    choices: supportedInfuraNetworks,
    conflicts: ["providerAddress", "localProviderAddress"]
  })
  .option("oracle", {
    describe: "Whether to serve requests as a reputation oracle or not",
    type: "boolean",
    default: true
  })
  .option("oraclePort", {
    type: "number",
    default: 3000,
  })
  .option("privateKey", {
    // eslint-disable-next-line max-len
    describe: "The private key of the address that is mining, allowing the miner to sign transactions. If used, `minerAddress` is not needed and will be derived.",
    type: "string",
    conflicts: "minerAddress",
  })
  .option("processingDelay", {
    describe: "Delay between processing reputation logs",
    type: 'number',
    default: 10,
  })
  .option("providerAddress", {
    type: "array",
    conflicts: ["network", "localProviderAddress"]
  })
  .option("rpcEndpoint", {
    type: "string",
    conflicts: ["network", "providerAddress"]
  })
  .option("syncFrom", {
    type: "number",
    default: 11897847,
  })
  .env("REP_MINER")
;

const {
  adapter,
  adapterLabel,
  auto,
  colonyNetworkAddress,
  dbPath,
  exitOnError,
  minerAddress,
  network,
  oracle,
  oraclePort,
  privateKey,
  processingDelay,
  providerAddress,
  rpcEndpoint,
  syncFrom,
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

if (!minerAddress && !privateKey) {
  console.log("❗️ You have to specify either --minerAddress or --privateKey");
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
} else if (providerAddress.length) {
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
} else {
  provider = new ethers.providers.JsonRpcProvider(rpcEndpoint || 'http://localhost:8545');
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
