module.exports = {
    copyNodeModules: true,
    skipFiles: [
      'Migrations.sol',
      'EtherRouter.sol',
    ],
    testCommand: './node_modules/.bin/truffle test --network coverage',
    testrpcOptions: `--port 8555 -i coverage`
};
