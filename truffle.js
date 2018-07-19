require("babel-register");

module.exports = {
  networks: {
    development: {
      host: "localhost",
      port: 8545,
      gas: 6700000,
      gasPrice: 0,
      network_id: "*",
      websockets: true
    },
    integration: {
      host: "localhost",
      port: 8545,
      gas: 6700000,
      gasPrice: 0,
      network_id: "integration",
      websockets: true
    },
    coverage: {
      host: "localhost",
      network_id: "*",
      port: 8555, // <-- Use port 8555
      gas: 0xfffffffffff, // <-- Use this high gas value
      gasPrice: 0x01, // <-- Use this low gas price
      websockets: true
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
      docker: true
    }
  }
};
