module.exports = {
    skipFiles: [
      'Migrations.sol',
      'EtherRouter.sol',
      'PatriciaTree',
      'ERC20ExtendedToken.sol'
    ],
    copyPackages: ['openzeppelin-solidity'],
    compileCommand: 'yarn run provision:token:contracts:compile',
    testCommand: '../node_modules/.bin/truffle test --network coverage',
    testrpcOptions: `--port 8555 -i 1999 --acctKeys="./coverageEnv/ganache-accounts.json" --noVMErrorsOnRPCResponse --accounts 12`
};
