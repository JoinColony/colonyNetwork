const config = require("./.solcover.js")
const log = console.log;
const { execSync } = require("child_process");
const ethers  = require("ethers");

const existingCompileComplete = config.onCompileComplete;

let chainId;
// We configure the truffle coverage chain to have the same chainid as one of the
// nodes we've started up, but on a different port
// TODO: Actually query nodes, don't hard-code here, or work out how to get environment
// variables in package.json to work here as I want.
if (JSON.parse(process.env.TRUFFLE_FOREIGN)){
  chainId = 265669101;
} else {
  chainId = 265669100;
}

config.providerOptions.network_id = chainId;
config.providerOptions._chainId = chainId;
config.providerOptions._chainIdRpc = chainId;

config.istanbulFolder = `./coverage-cross-chain-${JSON.parse(process.env.TRUFFLE_FOREIGN) ? "foreign" : "home"}`

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