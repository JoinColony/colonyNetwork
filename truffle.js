require("babel-register");

module.exports = {
  networks: {
    development: {
      host: "localhost",
      port: 8545,
      gasPrice: 0,
      network_id: "*"
    },
    integration: {
      host: "localhost",
      port: 8545,
      gasPrice: 0,
      network_id: "1998"
    },
    coverage: {
      host: "localhost",
      port: 8555, // <-- Use port 8555
      gas: 0xfffffffffff, // <-- Use this high gas value
      gasPrice: 0x01, // <-- Use this low gas price
      network_id: "1999"
    }
  },
  mocha: {
    reporter: "mocha-circleci-reporter",
    reporterOptions: {
      currency: "USD",
      gasPrice: 5,
      onlyCalledMethods: true
    },
    slow: 1000
  },
  compilers: {
    solc: {
      version: "0.4.23",
      docker: false,
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        },
        evmVersion: "byzantium"
      }
    }
  }
};
