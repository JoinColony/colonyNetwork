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
      'common/EtherRouter.sol',
      'patriciaTree',
      'testHelpers/ContractEditing.sol', // only used in setting up colony-network-recovery.js tests, never in production
      'testHelpers/NoLimitSubdomains.sol',
      'testHelpers/TaskSkillEditing.sol'
    ],
    providerOptions: {
      port: 8555,
      network_id: parseInt(process.env.CHAIN_ID, 10),
      _chainId: parseInt(process.env.CHAIN_ID, 10),
      _chainIdRpc: parseInt(process.env.CHAIN_ID, 10),
      account_keys_path: "./ganache-accounts.json",
      vmErrorsOnRPCResponse: false,
      total_accounts: 18
    },
    onCompileComplete: provisionTokenContracts,
    istanbulFolder: `./coverage-chainid-${process.env.CHAIN_ID}`
}

