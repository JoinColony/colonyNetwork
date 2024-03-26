const config = require("./.solcover.js")

config.istanbulFolder = `./coverage-cross-chain-${process.env.HARDHAT_FOREIGN ? "foreign" : "home"}`

module.exports = config
