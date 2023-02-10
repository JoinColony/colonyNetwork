const config = require("./.solcover.js")
const log = console.log;
const { execSync } = require("child_process");

const existingCompileComplete = config.onCompileComplete;

config.istanbulFolder = `./coverage-cross-chain-${process.env.TRUFFLE_HOME ? "home" : "foreign"}`


function provisionSafeContracts(){
  let output;
  const provisionSafeContracts = `yarn run provision:safe:contracts`;

  log('Provisioning Safe contracts...')
  execSync(provisionSafeContracts);
}

config.onCompileComplete = function() {
	existingCompileComplete();
	provisionSafeContracts();
}

module.exports = config