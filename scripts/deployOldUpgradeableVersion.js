// Input:
/* globals artifacts */

const fs = require("fs");
const path = require("path");

const Promise = require("bluebird");
const exec = Promise.promisify(require("child_process").exec);
const contract = require("@truffle/contract");
const { getColonyEditable, getColonyNetworkEditable, web3GetCode } = require("../helpers/test-helper");
const { ROOT_ROLE, RECOVERY_ROLE, ADMINISTRATION_ROLE, ARCHITECTURE_ROLE, ADDRESS_ZERO } = require("../helpers/constants");

const colonyDeployed = {};
const colonyNetworkDeployed = {};
const deployedResolverAddresses = {};

module.exports.deployOldExtensionVersion = async (contractName, interfaceName, implementationNames, versionTag, colonyNetwork) => {
  if (versionTag.indexOf(" ") !== -1) {
    throw new Error("Version tag cannot contain spaces");
  }
  if (deployedResolverAddresses[interfaceName] && deployedResolverAddresses[interfaceName][versionTag]) {
    // Already deployed... if truffle's not snapshotted it away. See if there's any code there.
    const resolverAddress = deployedResolverAddresses[interfaceName][versionTag];
    const code = await web3GetCode(resolverAddress);
    if (code !== "0x") {
      return;
    }
  }

  try {
    // eslint-disable-next-line prettier/prettier
    const extensionResolverAddress = await module.exports.deployOldUpgradeableVersion(
      contractName,
      interfaceName,
      implementationNames,
      versionTag,
      colonyNetwork,
    );

    const metaColonyAddress = await colonyNetwork.getMetaColony();
    const metaColony = await artifacts.require("IMetaColony").at(metaColonyAddress);
    await metaColony.addExtensionToNetwork(web3.utils.soliditySha3(contractName), extensionResolverAddress);
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
};

module.exports.deployColonyVersionGLWSS4 = (colonyNetwork) => {
  return module.exports.deployOldColonyVersion(
    "Colony",
    "IMetaColony",
    [
      // eslint-disable-next-line max-len
      "Colony,ColonyDomains,ColonyExpenditure,ColonyFunding,ColonyPayment,ColonyRewards,ColonyRoles,ColonyTask,ContractRecovery,ColonyArbitraryTransaction",
    ],
    "glwss4",
    colonyNetwork,
  );
};

module.exports.deployColonyVersionHMWSS = (colonyNetwork) => {
  return module.exports.deployOldColonyVersion(
    "Colony",
    "IMetaColony",
    [
      // eslint-disable-next-line max-len
      "Colony,ColonyDomains,ColonyExpenditure,ColonyFunding,ColonyRewards,ColonyRoles,ContractRecovery,ColonyArbitraryTransaction",
    ],
    "hmwss",
    colonyNetwork,
  );
};

module.exports.deployColonyNetworkVersionGLWSS4 = () => {
  return module.exports.deployOldColonyNetworkVersion(
    "",
    "IColonyNetwork",
    ["ColonyNetwork,ColonyNetworkAuction,ColonyNetworkDeployer,ColonyNetworkENS,ColonyNetworkExtensions,ColonyNetworkMining,ContractRecovery"],
    "glwss4",
  );
};

const registerOldColonyVersion = async (colonyVersionResolverAddress, colonyNetwork) => {
  const colonyVersionResolver = await artifacts.require("Resolver").at(colonyVersionResolverAddress);
  const versionImplementationAddress = await colonyVersionResolver.lookup(web3.utils.soliditySha3("version()").slice(0, 10));
  const versionImplementation = await artifacts.require("IMetaColony").at(versionImplementationAddress);
  const version = await versionImplementation.version();

  const registeredResolver = await colonyNetwork.getColonyVersionResolver(version);
  if (registeredResolver !== ADDRESS_ZERO && registeredResolver !== colonyVersionResolverAddress) {
    throw new Error(`Version ${version} already registered at unexpected address`);
  } else if (registeredResolver === ADDRESS_ZERO) {
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    const metaColony = await artifacts.require("IMetaColony").at(metaColonyAddress);
    await metaColony.addNetworkColonyVersion(version, colonyVersionResolverAddress);
  }
};

module.exports.deployOldColonyVersion = async (contractName, interfaceName, implementationNames, versionTag, colonyNetwork) => {
  if (versionTag.indexOf(" ") !== -1) {
    throw new Error("Version tag cannot contain spaces");
  }
  if (!colonyDeployed[interfaceName]) {
    colonyDeployed[interfaceName] = {};
  }
  if (colonyDeployed[interfaceName][versionTag]) {
    // Already deployed... if truffle's not snapshotted it away. See if there's any code there.
    const { resolverAddress } = colonyDeployed[interfaceName][versionTag];
    const code = await web3GetCode(resolverAddress);
    if (code !== "0x") {
      // Must also check it's registered
      await registerOldColonyVersion(resolverAddress, colonyNetwork);
      return colonyDeployed[interfaceName][versionTag];
    }
  }

  try {
    const colonyVersionResolverAddress = await module.exports.deployOldUpgradeableVersion(
      contractName,
      interfaceName,
      implementationNames,
      versionTag,
      colonyNetwork,
    );

    await registerOldColonyVersion(colonyVersionResolverAddress, colonyNetwork);

    const interfaceArtifact = fs.readFileSync(`./colonyNetwork-${versionTag}/build/contracts/${interfaceName}.json`);
    const OldInterface = contract(JSON.parse(interfaceArtifact));
    OldInterface.setProvider(web3.currentProvider);
    const accounts = await web3.eth.getAccounts();
    let existingDefaults = OldInterface.defaults();
    OldInterface.defaults({ ...existingDefaults, from: accounts[0] });

    const oldAuthorityArtifact = fs.readFileSync(`./colonyNetwork-${versionTag}/build/contracts/ColonyAuthority.json`);
    const OldAuthority = contract(JSON.parse(oldAuthorityArtifact));
    OldAuthority.setProvider(web3.currentProvider);
    existingDefaults = OldAuthority.defaults();
    OldAuthority.defaults({ ...existingDefaults, from: accounts[0] });

    colonyDeployed[interfaceName] = colonyDeployed[interfaceName] || {};
    colonyDeployed[interfaceName][versionTag] = { OldInterface, OldAuthority, resolverAddress: colonyVersionResolverAddress };
    console.log("Deployed", interfaceName, "at version", versionTag, "with resolver", colonyVersionResolverAddress);
    return colonyDeployed[interfaceName][versionTag];
  } catch (e) {
    console.log(e);
    return process.exit(1);
  }
};

module.exports.downgradeColony = async (colonyNetwork, colony, version) => {
  if (!colonyDeployed.IMetaColony[version]) {
    throw new Error("Version not deployed");
  }
  const accounts = await web3.eth.getAccounts();
  const editableColony = await getColonyEditable(colony, colonyNetwork);

  // To downgrade a colony, we need to set the authority to the old authority contract,
  // and set the resolver to the old version resolver. We don't allow this during ordinary
  // operation, so directly editing the relevant storage slots is required.

  const oldAuthority = await colonyDeployed.IMetaColony[version].OldAuthority.new(colony.address);
  await oldAuthority.setUserRole(accounts[0], ROOT_ROLE, true);
  await oldAuthority.setUserRole(accounts[0], RECOVERY_ROLE, true);
  await oldAuthority.setUserRole(accounts[0], ADMINISTRATION_ROLE, true);
  await oldAuthority.setUserRole(accounts[0], ARCHITECTURE_ROLE, true);
  await oldAuthority.setOwner(colony.address);
  await editableColony.setStorageSlot(0, `0x${"0".repeat(24)}${oldAuthority.address.slice(2)}`);
  const oldVersionResolver = colonyDeployed.IMetaColony[version].resolverAddress;
  await editableColony.setStorageSlot(2, `0x${"0".repeat(24)}${oldVersionResolver.slice(2)}`);
};

module.exports.downgradeColonyNetwork = async (colonyNetwork, version) => {
  if (!colonyNetworkDeployed[version]) {
    throw new Error("Version not deployed");
  }

  const editableNetwork = await getColonyNetworkEditable(colonyNetwork);
  const oldAuthority = await colonyNetworkDeployed[version].OldAuthority.new(colonyNetwork.address);
  await editableNetwork.setStorageSlot(0, `0x${"0".repeat(24)}${oldAuthority.address.slice(2)}`);
  const oldVersionResolver = colonyNetworkDeployed[version].resolverAddress;
  await editableNetwork.setStorageSlot(2, `0x${"0".repeat(24)}${oldVersionResolver.slice(2)}`);
};

module.exports.deployOldColonyNetworkVersion = async (contractName, interfaceName, implementationNames, versionTag, colonyNetwork) => {
  if (versionTag.indexOf(" ") !== -1) {
    throw new Error("Version tag cannot contain spaces");
  }
  if (colonyNetworkDeployed[versionTag]) {
    // Already deployed... if truffle's not snapshotted it away. See if there's any code there.
    const { resolverAddress } = colonyNetworkDeployed[versionTag];
    const code = await web3GetCode(resolverAddress);
    if (code !== "0x") {
      return colonyNetworkDeployed[versionTag];
    }
  }
  colonyNetworkDeployed[versionTag] = {};

  try {
    const colonyNetworkResolverAddress = await module.exports.deployOldUpgradeableVersion(
      contractName,
      interfaceName,
      implementationNames,
      versionTag,
      colonyNetwork,
    );

    const interfaceArtifact = fs.readFileSync(`./colonyNetwork-${versionTag}/build/contracts/IColonyNetwork.json`);
    const OldInterface = contract(JSON.parse(interfaceArtifact));
    OldInterface.setProvider(web3.currentProvider);

    const accounts = await web3.eth.getAccounts();
    let existingDefaults = OldInterface.defaults();
    OldInterface.defaults({ ...existingDefaults, from: accounts[0] });

    const oldAuthorityArtifact = fs.readFileSync(`./colonyNetwork-${versionTag}/build/contracts/ColonyNetworkAuthority.json`);
    const OldAuthority = contract(JSON.parse(oldAuthorityArtifact));
    OldAuthority.setProvider(web3.currentProvider);

    existingDefaults = OldAuthority.defaults();
    OldAuthority.defaults({ ...existingDefaults, from: accounts[0] });

    colonyNetworkDeployed[versionTag] = { resolverAddress: colonyNetworkResolverAddress, OldInterface, OldAuthority };

    return colonyNetworkDeployed[versionTag];
  } catch (e) {
    console.log(e);
    return process.exit(1);
  }
};

module.exports.deployOldUpgradeableVersion = async (contractName, interfaceName, implementationNames, versionTag) => {
  // Check out old version of repo in to a new directory
  //  If directory exists, assume we've already done this and skip
  let exists;

  try {
    exists = fs.existsSync(`./colonyNetwork-${versionTag}/build/contracts/`);
  } catch (err) {
    exists = false;
  }

  if (!exists) {
    console.log("Cloning necessary version of repository");
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

  console.log("Deploying old version of contract");
  await exec(`cp ./scripts/deployOldUpgradeableVersionTruffle.js ./colonyNetwork-${versionTag}/scripts/deployOldUpgradeableVersionTruffle.js`);

  const network = process.env.SOLIDITY_COVERAGE ? "coverage" : "development";
  let res;
  console.log("deploying");

  try {
    res = await exec(
      `cd ${path.resolve(__dirname, `../colonyNetwork-${versionTag}`)} ` +
        "&& npx truffle exec ./scripts/deployOldUpgradeableVersionTruffle.js " +
        `--network ${network} --interfaceName ${interfaceName} --implementationNames ${implementationNames.join(",")}`,
    );
  } catch (err) {
    console.log("err", err);
  }

  const resolverAddress = res.split("\n").slice(-2)[0].trim();
  deployedResolverAddresses[interfaceName] = deployedResolverAddresses[interfaceName] || {};
  deployedResolverAddresses[interfaceName][versionTag] = resolverAddress;

  return resolverAddress;
};
