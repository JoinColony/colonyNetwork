module.exports = {
    skipFiles: [
      'Migrations.sol',
      'EtherRouter.sol',
      'gnosis',
      'Token.sol',
      'PatriciaTree'
    ],
    compileCommand: '../node_modules/.bin/truffle compile',
    testCommand: '../node_modules/.bin/truffle test --network coverage',
    testrpcOptions: `--port 8555 -i coverage --acctKeys="./coverageEnv/ganache-accounts.json" --noVMErrorsOnRPCResponse`
};
