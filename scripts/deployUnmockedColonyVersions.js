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
const cnAddress = require("../etherrouter-address.json").etherRouterAddress; // eslint-disable-line import/no-unresolved

const IColonyNetwork = artifacts.require("./IColonyNetwork");
const IMetaColony = artifacts.require("./IMetaColony");
const ADDRESS_LENGTH = 42;
const RESOLVER_LOG_OFFSET = 33;

module.exports = async () => {
  // While debugging, add a line to checkout currenthash
  const currentHash = await exec("git log -1 --format='%H'");
  let v3ResolverAddress;
  let v4ResolverAddress;
  const colonyNetwork = await IColonyNetwork.at(cnAddress);
  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await IMetaColony.at(metaColonyAddress);
  try {
    await exec("mv ./build ./buildBackup");
    await exec("git checkout auburn-glider && git submodule update");

    // Comment out uneeded parts of file
    await exec("sed -i'' -e '26,27 s|^|//|' ./migrations/4_setup_colony_version_resolver.js");
    await exec("sed -i'' -e '31 s|^|//|' ./migrations/4_setup_colony_version_resolver.js");
    await exec("sed -i'' -e 's|await ContractRecovery.deployed()|await ContractRecovery.new()|' ./migrations/4_setup_colony_version_resolver.js");
    await exec("rm -rf ./build");
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
    await exec("sed -i'' -e '27,28 s|^|//|' ./migrations/4_setup_colony_version_resolver.js");
    await exec("sed -i'' -e '32 s|^|//|' ./migrations/4_setup_colony_version_resolver.js");
    await exec("sed -i'' -e 's|await ContractRecovery.deployed()|await ContractRecovery.new()|' ./migrations/4_setup_colony_version_resolver.js");
    await exec("rm -rf ./build");
    res = await exec("yarn run truffle migrate --reset -f 4 --to 4");

    if (res.stdout) {
      // How this response looks changes node 10->12
      res = res.stdout;
    }
    index = res.indexOf("Colony version 4 set to Resolver");
    v4ResolverAddress = res.substring(index + RESOLVER_LOG_OFFSET, index + RESOLVER_LOG_OFFSET + ADDRESS_LENGTH);
    await metaColony.addNetworkColonyVersion(4, v4ResolverAddress);
  } catch (err) {
    console.log(err);
  }
  console.log(v3ResolverAddress);
  console.log(v4ResolverAddress);
  // put things back how they were.
  await exec(`git checkout -f ${currentHash}`);
  await exec("git submodule update");
  await exec("rm -rf ./build");
  await exec("mv ./buildBackup ./build");
};
