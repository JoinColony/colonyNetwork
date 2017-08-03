module.exports = {
    copyNodeModules: true,
    skipFiles: [
      'Migrations.sol',
    ],
    testCommand: './node_modules/.bin/truffle test --network coverage',
    testrpcOptions: `--port 8555`
};
