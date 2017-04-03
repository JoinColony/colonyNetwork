require('babel-register');

module.exports = {
  networks: {
    development: {
      host: 'localhost',
      port: 8545,
      gas: 3500000,
      gasPrice: 0,
      network_id: '*',
    },
    integration: {
      host: 'localhost',
      port: 8545,
      gas: 3500000,
      gasPrice: 0,
      network_id: '*',
    },
    mocha: {
      reporter: 'spec',
    },
  },
};
