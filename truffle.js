require("@babel/register");
require("@babel/polyfill");
const HDWalletProvider = require("truffle-hdwallet-provider");
const ganache = require("ganache-core");

const ganacheProvider = ganache.provider({ total_accounts: 14, seed: "smoketest" });

const DISABLE_DOCKER = !process.env.DISABLE_DOCKER;

module.exports = {
  networks: {
    development: {
      host: "localhost",
      port: 8545,
      gasPrice: 0,
      network_id: "*",
      skipDryRun: true,
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
        optimizer: {
          enabled: true,
          runs: 200,
        },
        evmVersion: "istanbul",
      },
    },
  },
  plugins: ["truffle-security", "solidity-coverage"],
};
