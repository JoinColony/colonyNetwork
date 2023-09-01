// Input:
/* globals artifacts */

const Promise = require("bluebird");
const path = require("path");
const exec = Promise.promisify(require("child_process").exec);

module.exports = async (contractName, interfaceName, implementationNames, versionTag, colonyNetwork) => {
  if (versionTag.indexOf(" ") !== -1) {
    throw new Error("Version tag cannot contain spaces");
  }
  try {
    // Check out old version of repo in to a new directory
    await exec(`rm -rf colonyNetwork-${versionTag}`);
    await exec(`git clone --depth 1 --branch ${versionTag} https://github.com/JoinColony/colonyNetwork.git colonyNetwork-${versionTag}`);
    await exec(`cd colonyNetwork-${versionTag} && git submodule update --init --recursive`);

    await exec(`cd colonyNetwork-${versionTag} && npm install`);
    await exec(`cd colonyNetwork-${versionTag} && npm run provision:token:contracts`);

    // This is how we could do it without an extra script, but pricing ourselves in to 'truffle deploy' every time, which
    // takes about an extra minute.
    //   await exec(`cd colonyNetwork-${versionTag} && npx truffle deploy`);

    //   const etherRouterJSONContents = fs.readFileSync(`./colonyNetwork-${versionTag}/etherrouter-address.json`);
    //   const otherColonyNetworkAddress = JSON.parse(etherRouterJSONContents).etherRouterAddress;
    //   const otherColonyNetwork = await artifacts.require("IColonyNetwork").at(otherColonyNetworkAddress);

    //   const events = await otherColonyNetwork.getPastEvents("ExtensionAddedToNetwork", { fromBlock: 0, toBlock: "latest" });

    //   const relevantEvents = events.filter((event) => {
    //     return event.returnValues.extensionId === web3.utils.soliditySha3(contractName);
    //   });
    //   const extensionVersion = await relevantEvents[0].returnValues.version;

    //   const extensionResolverAddress = await otherColonyNetwork.getExtensionResolver(web3.utils.soliditySha3(contractName), extensionVersion);

    const network = process.env.SOLIDITY_COVERAGE ? "coverage" : "development";

    await exec(`cp ./scripts/deployOldExtensionVersionTruffle.js ./colonyNetwork-${versionTag}/scripts/deployOldExtensionVersionTruffle.js`);
    const res = await exec(
      `cd ${path.resolve(
        __dirname,
        `../colonyNetwork-${versionTag}`
      )} && npx truffle exec --network ${network} ./scripts/deployOldExtensionVersionTruffle.js --interfaceName ${interfaceName}` +
        ` --implementationNames ${implementationNames.join(",")}`
    );

    console.log(res);
    const extensionResolverAddress = res.split("\n").slice(-2)[0].trim();

    const metaColonyAddress = await colonyNetwork.getMetaColony();
    const metaColony = await artifacts.require("IMetaColony").at(metaColonyAddress);
    await metaColony.addExtensionToNetwork(web3.utils.soliditySha3(contractName), extensionResolverAddress);
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
};
