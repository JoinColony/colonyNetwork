/* eslint-env node */
/* eslint no-use-before-define: 0, complexity: 0, arrow-body-style: 0 */

import originalGulp from 'gulp';
import gulpHelp from 'gulp-help';
import shell from 'pshell';
import request from 'request';
import minimist from 'minimist';
import rimraf from 'rimraf';

const getEnv = envVar => process.env[envVar];
const gulp = gulpHelp(originalGulp, {
  hideEmpty: true,
  hideDepsMessage: true,
});
const options = minimist(process.argv.slice(2));

const gethClient = options.geth ? 'geth' : 'parity';

gulp.task('deploy:contracts', [gethClient, 'clean:contracts'], () => {
  return execute(`truffle migrate --reset`);
});

gulp.task('clean:contracts', done => rimraf('./build/contracts/*', done));

const cleanIntegrationFakeContracts = () => {
  return new Promise((resolve, reject) => {
    rimraf('./contracts/Fake*.*', resolve);
  });
};

gulp.task('versionColonyContract', ['deploy:contracts'], async () => {
  const VERSION = await executeWithOutput(`grep "uint256 public version = " ./contracts/Colony.sol | tr -d 'uint256 public version = ' | tr -d ';\n'`);
  console.log('Current Colony contract version is', VERSION);

  return execute(`mv Colony.json Colony_${VERSION}.json`, { cwd: './build/contracts' });
});

gulp.task('lint:contracts', () => {
  return execute('solium --dir . || true');
});

gulp.task('generate:contracts:integration', ['deploy:contracts'], async () => {
  const VERSION = await executeWithOutput(`grep "uint256 public version = " ./contracts/Colony.sol | tr -d 'uint256 public version = ' | tr -d ';\n'`);
  const UPDATED_VERSION=VERSION+1;

  return execute(`cp ColonyFactory.sol FakeNewColonyFactory.sol`, { cwd: './contracts' })
  .then(execute(`cp RootColony.sol FakeNewRootColony.sol`, { cwd: './contracts' }))
  .then(execute(`cp Colony.sol FakeUpdatedColony.sol`, { cwd: './contracts' }))
  .then(execute(`sed -ie'' s/'new Colony'/'new FakeUpdatedColony'/g FakeNewColonyFactory.sol`, { cwd: './contracts' }))
  .then(execute(`sed -ie'' s/'Colony.sol'/'FakeUpdatedColony.sol'/g FakeNewColonyFactory.sol`, { cwd: './contracts' }))
  .then(execute(`sed -ie'' s/'contract ColonyFactory'/'contract FakeNewColonyFactory'/g FakeNewColonyFactory.sol`, { cwd: './contracts' }))
  .then(execute(`sed -ie'' s/'Colony(colonyAddress'/'FakeUpdatedColony(colonyAddress'/g FakeNewColonyFactory.sol`, { cwd: './contracts' }))
  .then(execute(`sed -ie'' s/'Colony colonyNew'/'FakeUpdatedColony colonyNew'/g FakeNewColonyFactory.sol`, { cwd: './contracts' }))
  .then(execute(`sed -ie'' s/'contract RootColony'/'contract FakeNewRootColony'/g FakeNewRootColony.sol`, { cwd: './contracts' }))
  .then(execute(`sed -ie'' s/'contract Colony'/'contract FakeUpdatedColony'/g FakeUpdatedColony.sol`, { cwd: './contracts' }))
  .then(execute(`sed -ie'' s/'function Colony'/'function FakeUpdatedColony'/g FakeUpdatedColony.sol`, { cwd: './contracts' }))
  .then(execute(`sed -ie'' s/'uint256 public version = ${VERSION}'/'uint256 public version = ${UPDATED_VERSION}'/g FakeUpdatedColony.sol`, { cwd: './contracts' }))
  .then(execute(`sed -ie'' s/'address public eternalStorage;'/'address public eternalStorage;function isUpdated() constant returns(bool) {return true;}'/g FakeUpdatedColony.sol`, { cwd: './contracts' }));
});

gulp.task('parity', async () => {
  const out = await executeWithOutput('parity --keys-path ./keys account list');
  const addresses = out.replace(/(\[|\]|\n)/g, '').split(', ');

  if (!addresses.length) {
    throw new Error('No parity addresses found. Did you initialise it correctly?');
  }
  const cmd = makeCmd(`
    parity --chain ./parity-genesis.json
    --author ${addresses[2]}
    --unlock ${addresses[0]},${addresses[1]},${addresses[2]}
    --password ./parityPassword --keys-path ./keys --geth --no-dapps
    --tx-gas-limit 0x47E7C4 --gasprice 0x0 --gas-floor-target 0x47E7C4
    --reseal-on-txs all --reseal-min-period 0
    --jsonrpc-interface all --jsonrpc-hosts all --jsonrpc-cors="http://localhost:3000"
  `);
  executeDetached(cmd);
  return waitForPort('8545');
});

gulp.task('geth', () => {
  const cmd = makeCmd(`
    geth init ./truffle/genesis.json &&
    geth --networkid 19191919191 --rpc --password ./password
    --unlock "0,1,2" --rpccorsdomain "*" --rpcaddr "127.0.0.1"
    --rpcport "8545" --mine --etherbase "2"
  `);
  executeDetached(cmd);
  return waitForPort('8545');
});

gulp.task('test:contracts', 'Run contract tests', ['deploy:contracts', 'lint:contracts', 'versionColonyContract'], () => {
  const cmd = makeCmd(`truffle test`);
  return execute(cmd);
});

gulp.task('test:contracts:gasCosts', 'Run gas cost tests', ['deploy:contracts'], () => {
  const cmd = makeCmd(`truffle test test/gasCosts.js`);
  return execute(cmd);
});

gulp.task('test:contracts:integration', 'Run contract integration tests', ['deploy:contracts', 'generate:contracts:integration'], () => {
  const cmd = makeCmd(`truffle test ./integration-test/test/* --network integration`);
  return execute(cmd).then(cleanIntegrationFakeContracts);
});

const waitForPort = port => {
  return new Promise(resolve => {
    const req = () => {
      request({
        url: 'http://127.0.0.1:' + port,
        rejectUnauthorized: false,
      }, err => {
        if (!err) {
          return resolve(true);
        }
        return setTimeout(req, 2000);
      });
    };
    req();
  });
};

const shellContext = shell.context({
  echoCommand: false,
  env: {
    PATH: ['node_modules/.bin', process.env.PATH],
  },
});

const execute = (cmd, opts) => {
  return shellContext(cmd, {
    ...(opts || {}),
  }).catch(() => process.exit(1));
};

const executeWithOutput = (cmd, opts) => execute(cmd, { captureOutput: true, ...(opts || {}) })
  .then(res => res.stdout);

const executeDetached = (cmd, opts) => {
  const { childProcess: child, promise } = shellContext.exec(cmd, {
    detached: true,
    stdio: 'ignore',
    ...(opts || {}),
  });
  child.unref();
  promise.catch(e => { console.error(e); process.exit(1); });
  const killProcess = e => {
    if (e) { console.error(e); }
    console.log(`Cleaning up. Killing child process ${child.pid}...`);
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (err) {
      /* ignore those */
    }
  };
  process.on('exit', killProcess);
  process.on('uncaughtException', killProcess);
  process.on('unhandledRejection', killProcess);
};

const makeCmd = cmd => cmd.replace(/\s+/g, ' ');

process.on('SIGINT', () => {
  console.log('Caught interrupt signal. Exiting gracefully...');
  process.exit();
});
