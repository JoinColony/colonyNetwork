const config = require("./.solcover.js")

config.providerOptions.network_id = parseInt(process.env.CHAIN_ID, 10);
config.providerOptions._chainId = parseInt(process.env.CHAIN_ID, 10);
config.providerOptions._chainIdRpc = parseInt(process.env.CHAIN_ID, 10);
config.istanbulFolder = `./coverage-anotherChain-1`
module.exports = config