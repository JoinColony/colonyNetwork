const { execSync } = require("child_process");
const config = require("./.solcover.js")

function getFilesToSkip(){
  const array = [
    'Migrations.sol',
    'common/EtherRouter.sol',
    'patriciaTree',
    'testHelpers',
  ];

  const output = execSync("ls ./**/*Updated*", {cwd: "./contracts/"});
  return array.concat(output.toString().split('\n').slice(0,-1)).concat(config.skipFiles)
}

config.istanbulFolder = "./coverage-upgrade"
config.skipFiles = getFilesToSkip();

module.exports = config