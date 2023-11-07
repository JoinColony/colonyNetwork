// Input:
/* globals artifacts */

const fs = require("fs");
const path = require("path");

const Promise = require("bluebird");
const exec = Promise.promisify(require("child_process").exec);

module.exports.deployOldExtensionVersion = async (contractName, interfaceName, implementationNames, versionTag, colonyNetwork) => {
  if (versionTag.indexOf(" ") !== -1) {
    throw new Error("Version tag cannot contain spaces");
  }

  try {
    // eslint-disable-next-line prettier/prettier
    const extensionResolverAddress = await deployOldUpgradeableVersion(
      contractName,
      interfaceName,
      implementationNames,
      versionTag,
      colonyNetwork
    );

    const metaColonyAddress = await colonyNetwork.getMetaColony();
    const metaColony = await artifacts.require("IMetaColony").at(metaColonyAddress);
    await metaColony.addExtensionToNetwork(web3.utils.soliditySha3(contractName), extensionResolverAddress);
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
};

module.exports.deployOldColonyVersion = async (contractName, interfaceName, implementationNames, versionTag, colonyNetwork) => {
  if (versionTag.indexOf(" ") !== -1) {
    throw new Error("Version tag cannot contain spaces");
  }

  try {
    const colonyVersionResolverAddress = await deployOldUpgradeableVersion(
      contractName,
      interfaceName,
      implementationNames,
      versionTag,
      colonyNetwork,
    );

    const colonyVersionResolver = await artifacts.require("Resolver").at(colonyVersionResolverAddress);
    const versionImplementationAddress = await colonyVersionResolver.lookup(web3.utils.soliditySha3("version()").slice(0, 10));
    const versionImplementation = await artifacts.require("IColony").at(versionImplementationAddress);
    const version = await versionImplementation.version();

    const metaColonyAddress = await colonyNetwork.getMetaColony();
    const metaColony = await artifacts.require("IMetaColony").at(metaColonyAddress);
    await metaColony.addNetworkColonyVersion(version, colonyVersionResolverAddress);
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
};

async function deployOldUpgradeableVersion(contractName, interfaceName, implementationNames, versionTag) {
  // Check out old version of repo in to a new directory
  //  If directory exists, assume we've already done this and skip
  let exists;

  try {
    exists = fs.existsSync(`./colonyNetwork-${versionTag}/build/contracts/`);
  } catch (err) {
    exists = false;
  }

  if (!exists) {
    console.log("doesnt exist");
    await exec(`rm -rf colonyNetwork-${versionTag}`);
    await exec(`git clone --depth 1 --branch ${versionTag} https://github.com/JoinColony/colonyNetwork.git colonyNetwork-${versionTag}`);
    await exec(`cd colonyNetwork-${versionTag} && git submodule update --init --recursive`);

    await exec(`cd colonyNetwork-${versionTag} && npm install`);
    await exec(`cd colonyNetwork-${versionTag} && npm run provision:token:contracts`);
  }

  // This is how we could do it without an extra script, but pricing ourselves in to 'truffle deploy' every time,
  //   which takes about an extra minute.

  //   await exec(`cd colonyNetwork-${versionTag} && npx truffle deploy`);
  //   const etherRouterJSONContents = fs.readFileSync(`./colonyNetwork-${versionTag}/etherrouter-address.json`);
  //   const otherColonyNetworkAddress = JSON.parse(etherRouterJSONContents).etherRouterAddress;
  //   const otherColonyNetwork = await artifacts.require("IColonyNetwork").at(otherColonyNetworkAddress);

  //   const events = await otherColonyNetwork.getPastEvents("ExtensionAddedToNetwork", { fromBlock: 0, toBlock: "latest" });
  //   const relevantEvents = events.filter((event) => event.returnValues.extensionId === web3.utils.soliditySha3(contractName));
  //   const extensionVersion = await relevantEvents[0].returnValues.version;
  //   const extensionResolverAddress = await otherColonyNetwork.getExtensionResolver(web3.utils.soliditySha3(contractName), extensionVersion);

  await exec(`cp ./scripts/deployOldUpgradeableVersionTruffle.js ./colonyNetwork-${versionTag}/scripts/deployOldUpgradeableVersionTruffle.js`);

  const network = process.env.SOLIDITY_COVERAGE ? "coverage" : "development";
  let res;

  try {
    res = await exec(
      `cd ${path.resolve(__dirname, `../colonyNetwork-${versionTag}`)} ` +
        "&& npx truffle exec ./scripts/deployOldUpgradeableVersionTruffle.js " +
        `--network ${network} --interfaceName ${interfaceName} --implementationNames ${implementationNames.join(",")}`,
    );

    console.log("res", res);
  } catch (err) {
    console.log("err", err);
  }

  const resolverAddress = res.split("\n").slice(-2)[0].trim();
  return resolverAddress;
}
