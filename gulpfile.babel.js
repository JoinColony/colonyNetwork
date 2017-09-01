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

const gethClient = options.parity ? 'parity' : 'testrpc';

gulp.task('deploy:contracts', [gethClient, 'clean:contracts'], () => {
  return execute(`truffle migrate --reset`);
});

gulp.task('clean:contracts', done => rimraf('./build/contracts/*', done));

const cleanUpgradeTempContracts = () => {
  return new Promise((resolve, reject) => {
    rimraf('./contracts/Updated*.*', resolve);
  });
};

gulp.task('versionColonyContract', ['deploy:contracts'], async () => {
  const VERSION = await executeWithOutput(`grep "uint256 public version = " ./contracts/Colony.sol | tr -d 'uint256 public version = ' | tr -d ';\n'`);
  console.log('Current Colony contract version is', VERSION);

  return execute(`mv Colony.json Colony_${VERSION}.json`, { cwd: './build/contracts' });
});

gulp.task('lint:contracts', 'Lint contracts', () => {
  return execute('solium --dir . || true');
});

const checkCoverageAgainstThreshold = () => {
  return execute('istanbul check-coverage --statements 94 --branches 88 --functions 92 --lines 94');
};

gulp.task('generate:contracts:integration', ['deploy:contracts'], async () => {
  const VERSION = await executeWithOutput(`grep "uint256 public version = " ./contracts/Colony.sol | tr -d 'uint256 public version = ' | tr -d ';\n'`);
  const UPDATED_VERSION=VERSION+1;

  return execute(`cp Token.sol UpdatedToken.sol`, { cwd: './contracts' })
  .then(execute(`sed -ie'' s/'Token'/'UpdatedToken'/g UpdatedToken.sol`, { cwd: './contracts' }))
  .then(execute(`sed -ie'' s/'function mint'/'function isUpdated() constant returns(bool) {return true;} function mint'/g UpdatedToken.sol`, { cwd: './contracts' }))
  .then(execute(`cp Resolver.sol UpdatedResolver.sol`, { cwd: './contracts' }))
  .then(execute(`sed -ie'' s/'Resolver'/'UpdatedResolver'/g UpdatedResolver.sol`, { cwd: './contracts' }))
  .then(execute(`sed -ie'' s/'function stringToSig'/'function isUpdated() constant returns(bool) {return true;} function stringToSig'/g UpdatedResolver.sol`, { cwd: './contracts' }))
  .then(execute(`cp ColonyNetwork.sol UpdatedColonyNetwork.sol`, { cwd: './contracts' }))
  .then(execute(`cp Colony.sol UpdatedColony.sol`, { cwd: './contracts' }))
  .then(execute(`sed -ie'' s/'contract ColonyNetwork'/'contract UpdatedColonyNetwork'/g UpdatedColonyNetwork.sol`, { cwd: './contracts' }))
  .then(execute(`sed -ie'' s/'contract Colony'/'contract UpdatedColony'/g UpdatedColony.sol`, { cwd: './contracts' }))
  .then(execute(`sed -ie'' s/'function Colony'/'function UpdatedColony'/g UpdatedColony.sol`, { cwd: './contracts' }))
  .then(execute(`sed -ie'' s/'uint256 public version = ${VERSION}'/'uint256 public version = ${UPDATED_VERSION}'/g UpdatedColony.sol`, { cwd: './contracts' }))
  .then(execute(`sed -ie'' s/'bytes32 public name;'/'bytes32 public name;function isUpdated() constant returns(bool) {return true;}'/g UpdatedColony.sol`, { cwd: './contracts' }));
});

gulp.task('test:contracts', 'Run contract tests', ['deploy:contracts', 'lint:contracts', 'versionColonyContract'], () => {
  const cmd = makeCmd(`truffle test`);
  return execute(cmd);
});

gulp.task('testrpc', async () => {
  const cmd = makeCmd(`testrpc`);
  executeDetached(cmd);
  return waitForPort('8545');
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

gulp.task('test:contracts:gasCosts', 'Run gas cost tests', ['deploy:contracts'], () => {
  const cmd = makeCmd(`truffle test gasCosts/gasCosts.js`);
  return execute(cmd);
});

gulp.task('test:contracts:upgrade', 'Run contract upgrade tests', ['deploy:contracts', 'generate:contracts:integration'], () => {
  const cmd = makeCmd(`truffle test ./upgrade-test/* --network integration`);
  return execute(cmd).then(cleanUpgradeTempContracts);
});

gulp.task('test:contracts:coverage', 'Run contract test coverage using solidity-coverage', () => {
  const cmd = makeCmd(`solidity-coverage`);
  return execute(cmd).then(checkCoverageAgainstThreshold);
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
