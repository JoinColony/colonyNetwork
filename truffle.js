const HDWalletProvider = require("truffle-hdwallet-provider");
const ganache = require("ganache");

const ganacheProvider = ganache.provider({ total_accounts: 14, seed: "smoketest", logging: { quiet: true } });
const LedgerWalletProvider = require("@umaprotocol/truffle-ledger-provider");

const ledgerOptions = {
  networkId: 100, // xdai
  path: "44'/60'/0'/0", // ledger default derivation path
  askConfirm: false,
  accountsLength: 1,
  accountsOffset: 0,
};

const DISABLE_DOCKER = !process.env.DISABLE_DOCKER;

const coverageOptimiserSettings = {
  enabled: false,
  runs: 200,
  details: {
    peephole: false,
    jumpdestRemover: false,
    orderLiterals: true, // <-- TRUE! Stack too deep when false
    deduplicate: false,
    cse: false,
    constantOptimizer: false,
    yul: true,
    yulDetails: {
      stackAllocation: true,
    },
  },
};

const normalOptimizerSettings = {
  enabled: true,
  runs: 200,
};

module.exports = {
  networks: {
    development: {
      host: "localhost",
      port: 8545,
      gasPrice: 0,
      network_id: "*",
      skipDryRun: true,
      disableConfirmationListener: true,
    },
    integration: {
      host: "localhost",
      port: 8545,
      gasPrice: 0,
      network_id: 1998,
      skipDryRun: true,
    },
    coverage: {
      host: "localhost",
      port: 8555,
      network_id: parseInt(process.env.CHAIN_ID, 10) || 1999,
      skipDryRun: true,
      disableConfirmationListener: true,
    },
    goerliFork: {
      host: "localhost",
      port: 8605,
      gasPrice: 0,
      network_id: "5",
    },
    mainnetFork: {
      host: "localhost",
      port: 8601,
      gasPrice: 0,
      network_id: "1",
    },
    goerli: {
      provider: () => {
        return new HDWalletProvider("replace-with-private-key-when-using", "https://goerli.infura.io/v3/e21146aa267845a2b7b4da025178196d");
      },
      network_id: "5",
    },
    mainnet: {
      provider: () => {
        return new HDWalletProvider("replace-with-private-key-when-using", "https://mainnet.infura.io/v3/e21146aa267845a2b7b4da025178196d");
      },
      network_id: "1",
    },
    storageSmoke: {
      provider: () => {
        return ganacheProvider;
      },
      network_id: "*",
    },
    xdai: {
      url: "https://xdai-archive.blockscout.com/",
      gasPrice: 2000000000,
      network_id: 100,
    },
    xdaiLedger: {
      provider() {
        return new LedgerWalletProvider(ledgerOptions, "https://xdai-archive.blockscout.com/");
      },
      network_id: 100,
      gasPrice: 2000000000,
    },
  },
  mocha: {
    reporter: "mocha-circleci-reporter",
    reporterOptions: {
      currency: "USD",
      gasPrice: 5,
      onlyCalledMethods: true,
      excludeContracts: ["Migrations"],
    },
    slow: 1000,
  },
  compilers: {
    solc: {
      version: "0.7.3",
      docker: DISABLE_DOCKER,
      parser: "solcjs",
      settings: {
        optimizer: process.env.SOLIDITY_COVERAGE ? coverageOptimiserSettings : normalOptimizerSettings,
        evmVersion: "istanbul",
      },
    },
  },
  plugins: ["solidity-coverage"],
};
