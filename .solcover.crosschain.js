const config = require("./.solcover.js")
const log = console.log;
const { execSync } = require("child_process");

const existingCompileComplete = config.onCompileComplete;

config.istanbulFolder = `./coverage-cross-chain-${process.env.TRUFFLE_HOME ? "home" : "foreign"}`

config.onCompileComplete = function() {
	existingCompileComplete();
}

module.exports = config
