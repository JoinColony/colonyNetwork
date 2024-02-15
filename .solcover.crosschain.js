const config = require("./.solcover.js")

config.istanbulFolder = `./coverage-cross-chain-${process.env.TRUFFLE_HOME ? "home" : "foreign"}`

module.exports = config
