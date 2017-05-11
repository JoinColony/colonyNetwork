

'use strict';

const request = require('request');

const doRequest = function (port, done) {
  request({
    url: 'http://127.0.0.1:' + port,
    rejectUnauthorized: false,
  }, function (err) {
    if (!err) {
      console.log('Ready.');
      done();
    } else {
      doRequest(port, done);
    }
  });
};

module.exports = function (grunt) {
  // Project configuration.
  grunt.initConfig({
    wait_async: {
      geth: {
        options: {
          wait(done) {
            console.log('waiting for Ethereum RPC...');
            doRequest(8545, done);
          },
          timeout: 30000,
        },
      },
    },
    shell: {
      startParity: {
        command() {
            let command = 'parity --chain ./parity-genesis.json '
            command += '--author $(parity --keys-path ./keys account list | sed "s/\\\[//g" | sed "s/\\\]//g" | awk "{split(\\$0, a, \\\", \\\"); print a[3]}") '
            command += '--unlock $(parity --keys-path ./keys account list | sed "s/\\\[//g" | sed "s/\\\]//g" | awk "{split(\\$0, a, \\\", \\\"); print a[1]}"),'
            command += '$(parity --keys-path ./keys account list | sed "s/\\\[//g" | sed "s/\\\]//g" | awk "{split(\\$0, a, \\\", \\\"); print a[2]}"),'
            command += '$(parity --keys-path ./keys account list | sed "s/\\\[//g" | sed "s/\\\]//g" | awk "{split(\\$0, a, \\\", \\\"); print a[3]}") '
            command += '--password ./parityPassword --reseal-on-txs all --tx-gas-limit 0x47E7C4 --gasprice 0x0 --gas-floor-target 0x47E7C4 --force-sealing --jsonrpc-interface all --jsonrpc-hosts all '
            command += '--reseal-min-period 0 --no-dapps --no-network --keys-path ./keys --no-import-keys --geth --rpccorsdomain="http://localhost:3000"'
            return command
        },
        options: {
          async:true,
          stdout: false,
          stderr: false,
        },
      },
      endParity: {
        command: 'PSID=0; PSID=$( ps aux | grep parity | grep -v \'grep\' | awk {\'print $2\'}); if [ $PSID > 0 ] ; then kill $PSID; else echo \'No Parity running\'; fi',
      },
      initGeth: {
        command: 'geth init ./genesis.json',
        options: {
          async: false,
          stdout: false,
          stderr: false,
        },
      },
      startGeth: {
        command: 'geth --networkid 19191919191 --rpc --password ./password --unlock "0,1,2" --rpccorsdomain "*" --rpcaddr "127.0.0.1" --rpcport "8545" --mine --etherbase "2"',
        options: {
          async: true,
          stdout: false,
          stderr: false,
        },
      },
      endGeth: { // Why the space in ' geth' below? to avoid collisions with 'inet_gethost'! #FML
        command: 'PSID=0; PSID=$( ps aux | grep \' geth\' | grep -v \'grep\' | awk {\'print $2\'}); if [ $PSID > 0 ] ; then kill $PSID; else echo \'No geth running\'; fi',
      },
      timecat: {
        command: 'time cat',
        options: {
          async: false,
          stdout: false,
          stderr: false,
        },
      },
      truffleTest: {
        command: 'truffle test',
      },
      contractLinting: {
        command: './node_modules/.bin/solium --dir . || true',
      },
      truffleDeploy: {
        command: 'truffle migrate --reset',
      },
      truffleCompile: {
        command: 'truffle compile',
      },
      truffleClean: {
        command: 'rm -rf build/contracts/*',
      },
      truffleTestContract: {
        command: 'truffle test',
      },
      truffleIntegrationTest: {
        command: 'truffle test ./integration-test/test/*',
      },
      cleanIntegrationTestsContracts: {
        command: 'rm ./contracts/Fake*.sol',
      },
      generateIntegrationTestsContracts: {
        command: 'bash ./makeFakeContracts.sh',
      },
      versionColonyContract: {
        command: 'bash ./versionColonyContract.sh',
      },
    },
  });

  grunt.loadNpmTasks('grunt-shell-spawn');
  grunt.loadNpmTasks('grunt-wait-async');

  grunt.registerTask('deployContracts', [
    'shell:truffleDeploy',
    'shell:versionColonyContract',
  ]);

  grunt.registerTask('compileContracts', [
    'shell:truffleCompile',
    'shell:versionColonyContract',
  ]);

  grunt.registerTask('testContracts', () => {
    grunt.task.run(['cleanup']);
    if (grunt.option === 'geth') {
      grunt.task.run(['shell:initGeth', 'shell:startGeth']);
    } else {
      grunt.task.run(['shell:startParity']);
    }

    grunt.task.run([
      'wait_async:geth',
      'shell:contractLinting',
      'shell:truffleTest',
    ]);
  });

  grunt.registerTask('testContractsIntegration', () => {
    grunt.task.run(['cleanup']);
    if (grunt.option === 'geth') {
      grunt.task.run(['shell:initGeth', 'shell:startGeth']);
    } else {
      grunt.task.run(['shell:startParity']);
    }

    grunt.task.run([
      'wait_async:geth',
      'shell:generateIntegrationTestsContracts',
      'shell:truffleIntegrationTest',
      'shell:cleanIntegrationTestsContracts',
    ]);
  });

  grunt.registerTask('cleanup', [
    'shell:endGeth',
    'shell:endParity',
    'shell:truffleClean',
  ]);
};
