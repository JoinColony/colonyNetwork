module.exports = {
  rpc: {
    host: 'localhost',
    port: 8545,
    // Gas limit used for deploys. Default is 4712388
    gas: 3300000,
    // Gas price used for deploys. Default is 100000000000
    gasPrice: 0,
  },
  mocha: {
    reporter: 'spec',
  },
};
