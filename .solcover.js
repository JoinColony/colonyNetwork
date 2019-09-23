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

module.exports = {
    skipFiles: [
      'Migrations.sol',
      'EtherRouter.sol',
      'PatriciaTree',
      'testHelpers/ContractEditing', // only used in setting up colony-network-recovery.js tests, never in production
      'testHelpers/NoLimitSubdomains',
      'testHelpers/TaskSkillEditing'
    ],
    providerOptions: {
      port: 8555,
      network_id: 1999,
      account_keys_path: "./ganache-accounts.json",
      vmErrorsOnRPCResponse: false,
      total_accounts: 12
    },
    onCompileComplete: provisionTokenContracts
}

