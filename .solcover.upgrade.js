const { execSync } = require("child_process");
const log = console.log;

// Copies pre-built token artifacts to .coverage_artifacts/contracts
function provisionTokenContracts(config){
  let output;
  const provisionColonyToken = `bash ./scripts/provision-token-contracts.sh`;

  log('Provisioning ColonyToken contracts...')
  output = execSync(provisionColonyToken);
  log(output.toString())
}

function getFilesToSkip(){
  const array = [
    'Migrations.sol',
    'common/EtherRouter.sol',
    'patriciaTree',
    'testHelpers',
  ];

  const output = execSync("ls ./**/*Updated*", {cwd: "./contracts/"});

  return array.concat(output.toString().split('\n').slice(0,-1))
}

module.exports = {
    skipFiles: getFilesToSkip(),
    providerOptions: {
      port: 8555,
      network_id: 1999,
      account_keys_path: "./ganache-accounts.json",
      vmErrorsOnRPCResponse: false,
      total_accounts: 18
    },
    onCompileComplete: provisionTokenContracts,
    istanbulFolder: "./coverage-upgrade"
}

