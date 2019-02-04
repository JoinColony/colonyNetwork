module.exports = {
    skipFiles: [
      'Migrations.sol',
      'EtherRouter.sol',
      'PatriciaTree',
      'ContractEditing' // only used in setting up colony-network-recovery.js tests, never in production
    ],
    copyPackages: ['openzeppelin-solidity'],
    compileCommand: 'yarn run provision:token:contracts',
    testCommand: '../node_modules/.bin/truffle test --network coverage',
    testrpcOptions: `--port 8555 -i 1999 --acctKeys="./coverageEnv/ganache-accounts.json" --noVMErrorsOnRPCResponse --accounts 12`
};
