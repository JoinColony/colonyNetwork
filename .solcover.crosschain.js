const config = require("./.solcover.js")

let chainId;
// We configure the truffle coverage chain to have the same chainid as one of the
// nodes we've started up, but on a different port
// TODO: Actually query nodes, don't hard-code here, or work out how to get environment
// variables in package.json to work here as I want.
if (JSON.parse(process.env.TRUFFLE_FOREIGN)){
  chainId = FORKED_XDAI_CHAINID + 1;
} else {
  chainId = FORKED_XDAI_CHAINID;
}

config.providerOptions.network_id = chainId;
config.providerOptions._chainId = chainId;
config.providerOptions._chainIdRpc = chainId;

config.istanbulFolder = `./coverage-cross-chain-${process.env.TRUFFLE_HOME ? "home" : "foreign"}`

module.exports = config
