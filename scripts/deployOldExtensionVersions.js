// Input:
/* globals artifacts */

const Promise = require("bluebird");
const exec = Promise.promisify(require("child_process").exec);
const { soliditySha3 } = require("web3-utils");
const cnAddress = require("../etherrouter-address.json").etherRouterAddress; // eslint-disable-line import/no-unresolved

const IMetaColony = artifacts.require("./IMetaColony");
const IColonyNetwork = artifacts.require("./IColonyNetwork");
const ColonyExtension = artifacts.require("./ColonyExtension");
const Resolver = artifacts.require("./Resolver");

module.exports = async (callback) => {
  // While debugging, add a line to checkout currenthash
  let currentHash = await exec("git log -1 --format='%H'");
  if (currentHash.stdout) {
    currentHash = currentHash.stdout;
  }
  console.log("Current hash is", currentHash);

  const colonyNetwork = await IColonyNetwork.at(cnAddress);
  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await IMetaColony.at(metaColonyAddress);
  try {
    await exec("mv ./build ./buildBackup");
    await exec("git checkout -f lwss && git submodule update");

    // Comment out uneeded parts of file
    await exec("sed -i'' -e '19,20 s|^|//|' ./migrations/9_setup_extensions.js");
    await exec("sed -i'' -e '27 s|^|//|' ./migrations/9_setup_extensions.js");
    await exec("sed -i'' -e ' s|EtherRouter.deployed|EtherRouter.new|' ./migrations/9_setup_extensions.js");
    // eslint-disable-next-line no-template-curly-in-string
    await exec("sed -i'' -e ' s|installed|installed at address ${resolver.address}|' ./migrations/9_setup_extensions.js");

    await exec("rm -rf ./build");
    let res = await exec("npx truffle migrate --reset -f 9 --to 9");

    if (res.stdout) {
      // How this response looks changes node 10->12
      res = res.stdout;
    }

    const regex = /### (.*) extension installed at address ([0-9a-zA-z]*)/g;
    const matches = res.matchAll(regex);

    // eslint-disable-next-line no-restricted-syntax
    for (const match of matches) {
      const NAME_HASH = soliditySha3(match[1]);
      const resolver = await Resolver.at(match[2]);
      const sig = await resolver.stringToSig("version()");
      const target = await resolver.lookup(sig);
      const extensionImplementation = await ColonyExtension.at(target);
      const version = await extensionImplementation.version();

      try {
        await metaColony.addExtensionToNetwork(NAME_HASH, match[2]);
        console.log(`Installed ${match[1]} version ${version}`);
      } catch (err) {
        if (err.reason === "colony-network-extension-already-set") {
          console.log(`${match[1]} version ${version} is already installed`);
        } else {
          console.log(err);
        }
      }
    }
  } catch (err) {
    console.log(err);
  }
  // console.log(v3ResolverAddress);
  // console.log(v4ResolverAddress);
  // // put things back how they were.
  console.log("Check out original hash");
  await exec(`git checkout -f ${currentHash}`);
  console.log("Update submodules");
  await exec("git submodule update");
  console.log("Delete build directory");
  await exec("rm -rf ./build");
  console.log("Restore build directory from backup");
  await exec("mv ./buildBackup ./build");
  callback();
};
