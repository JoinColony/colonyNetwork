// Input:
/* globals artifacts */

// Check out v3
// Deploy v3 resolver
// Point v3 on network to that resolver

// Checkout out v4
// Deploy v4 resolver
// Point v4 on network to that resolver
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const cnAddress = require("../etherrouter-address.json").etherRouterAddress;

const IColonyNetwork = artifacts.require("./IColonyNetwork");
const IMetaColony = artifacts.require("./IMetaColony");

module.exports = async () => {
  // While debugging, always checkout currenthash
  // await exec("git checkout 2690fba3d3002fd72912cd74f1fbf4932c734e94 && git submodule update");
  const currentHash = await exec("git log -1 --format='%H'");
  // const currentHash = res.stdout.trim();
  let v3ResolverAddress;
  let v4ResolverAddress;
  const colonyNetwork = await IColonyNetwork.at(cnAddress);
  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await IMetaColony.at(metaColonyAddress);
  try {
    await exec("git checkout ad5569de24567517aa12624e29600c9136fb594d && git submodule update");

    // Comment out uneeded parts of file
    await exec("sed -i'' '26,27 s|^|//|' ./migrations/4_setup_colony_version_resolver.js");
    await exec("sed -i'' '31 s|^|//|' ./migrations/4_setup_colony_version_resolver.js");
    await exec("sed -i'' 's|await ContractRecovery.deployed()|await ContractRecovery.new()|' ./migrations/4_setup_colony_version_resolver.js");
    await exec("rm -r ./build");
    let res = await exec("yarn run truffle migrate --reset -f 4 --to 4");
    if (res.stdout) {
      // How this response looks changes node 10->12
      res = res.stdout;
    }
    let index = res.indexOf("Colony version 3 set to Resolver");
    v3ResolverAddress = res.substring(index + 33, index + 33 + 42);
    console.log("v3 address:", v3ResolverAddress);
    await metaColony.addNetworkColonyVersion(3, v3ResolverAddress);

    await exec("git checkout -f burgundy-glider && git submodule update");

    // Comment out uneeded parts of file
    await exec("sed -i'' '27,28 s|^|//|' ./migrations/4_setup_colony_version_resolver.js");
    await exec("sed -i'' '32 s|^|//|' ./migrations/4_setup_colony_version_resolver.js");
    await exec("sed -i'' 's|await ContractRecovery.deployed()|await ContractRecovery.new()|' ./migrations/4_setup_colony_version_resolver.js");
    await exec("rm -r ./build");
    res = await exec("yarn run truffle migrate --reset -f 4 --to 4");
    if (res.stdout) {
      // How this response looks changes node 10->12
      res = res.stdout;
    }
    index = res.indexOf("Colony version 4 set to Resolver");
    v4ResolverAddress = res.substring(index + 33, index + 33 + 42);
    await metaColony.addNetworkColonyVersion(4, v4ResolverAddress);
  } catch (err) {
    console.log(err);
  }
  console.log(v3ResolverAddress);
  console.log(v4ResolverAddress);
  // put things back how they were.
  await exec(`git checkout -f ${currentHash}`);
  await exec("git submodule update");
  await exec("yarn run truffle compile");
};
