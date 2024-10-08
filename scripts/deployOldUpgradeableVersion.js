/* globals artifacts, hre */

const fs = require("fs");

const Promise = require("bluebird");
const exec = Promise.promisify(require("child_process").exec);
const contract = require("@truffle/contract");
const { ethers } = require("ethers");
const { web3GetCode, setStorageSlot } = require("../helpers/test-helper");
const { ROOT_ROLE, RECOVERY_ROLE, ADMINISTRATION_ROLE, ARCHITECTURE_ROLE, ADDRESS_ZERO } = require("../helpers/constants");
const { setupEtherRouter } = require("../helpers/upgradable-contracts");

let colonyDeployed = {};
let colonyNetworkDeployed = {};
let deployedResolverAddresses = {};

module.exports.resetAlreadyDeployedVersionTracking = async () => {
  colonyDeployed = {};
  colonyNetworkDeployed = {};
  deployedResolverAddresses = {};
};

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

module.exports.deployColonyVersionIMWSS = (colonyNetwork) => {
  return module.exports.deployOldColonyVersion(
    "Colony",
    "IMetaColony",
    [
      // eslint-disable-next-line max-len
      "Colony,ColonyDomains,ColonyExpenditure,ColonyFunding,ColonyRewards,ColonyRoles,ContractRecovery,ColonyArbitraryTransaction",
    ],
    "imwss",
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

module.exports.registerOldColonyVersion = async (colonyVersionResolverAddress, colonyNetwork) => {
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
    // Already deployed... note that if a snapshot revert is made without calling `resetAlreadyDeployedVersionTracking`,
    // then this will break.
    const { resolverAddress } = colonyDeployed[interfaceName][versionTag];
    // Must also check it's registered
    await module.exports.registerOldColonyVersion(resolverAddress, colonyNetwork);
    return colonyDeployed[interfaceName][versionTag];
  }

  try {
    const colonyVersionResolverAddress = await module.exports.deployOldUpgradeableVersion(
      contractName,
      interfaceName,
      implementationNames,
      versionTag,
      colonyNetwork,
    );

    await module.exports.registerOldColonyVersion(colonyVersionResolverAddress, colonyNetwork);
    const versionUsesTruffle = fs.existsSync(`./colonyNetwork-${versionTag}/truffle.js`);
    if (versionUsesTruffle) {
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
    }
    console.log("WARNING: Version uses hardhat, hardhat version of this function not yet properly implemented");
    colonyDeployed[interfaceName] = colonyDeployed[interfaceName] || {};
    colonyDeployed[interfaceName][versionTag] = { resolverAddress: colonyVersionResolverAddress };

    return colonyDeployed[interfaceName][versionTag];
  } catch (e) {
    console.log(e);
    return process.exit(1);
  }
};

const getNodeVersionCommand = async (_nodeVersion) => {
  let nodeVersion = _nodeVersion;
  console.log(_nodeVersion);
  if (_nodeVersion.startsWith("14.")) {
    // 14.x is not supported by truffle, our .nvmrc was incorrect for some releases
    nodeVersion = "16";
  }
  try {
    await exec(". $HOME/.nvm/nvm.sh ");
    return `. $HOME/.nvm/nvm.sh && nvm install ${nodeVersion} && nvm use ${nodeVersion}`;
  } catch (error) {
    console.log("No nvm found, try fnm");
  }
  try {
    await exec("fnm --version");
    return `eval "$(fnm env)" && fnm install ${nodeVersion} && fnm use ${nodeVersion}`;
  } catch (error) {
    console.log("No fnm found");
  }
  // Try n?
  throw new Error("No node version manager found");
};

async function setupNextVersionRepo() {
  console.log("Cloning the network...");
  await exec(`rm -rf colonyNetwork-next`);
  await exec(`git clone --depth 1 --branch develop https://github.com/JoinColony/colonyNetwork.git colonyNetwork-next`);
  await exec(`cd colonyNetwork-next && git submodule update --init --recursive`);
  const nodeVersion = fs.readFileSync(`colonyNetwork-next/.nvmrc`, "utf8").trim();
  await exec(`cd colonyNetwork-next && ${await getNodeVersionCommand(nodeVersion)}`);

  console.log("Installing the network...");
  let packageManagerCommand;
  if (fs.existsSync(`./colonyNetwork-next/pnpm-lock.yaml`)) {
    packageManagerCommand = "pnpm";
  } else {
    packageManagerCommand = "npm";
  }

  await exec(`cd colonyNetwork-next && ${packageManagerCommand} install`);
}

module.exports.deployNextColonyVersion = async (colonyNetwork) => {
  await setupNextVersionRepo();
  const nodeVersion = fs.readFileSync(`colonyNetwork-next/.nvmrc`, "utf8").trim();

  // Bump version number in Colony.sol
  const version = (
    await exec(
      `cd colonyNetwork-next/contracts/colony/ &&
    grep 'function version() public pure returns (uint256 colonyVersion) { return ' Colony.sol |
    sed 's/function version() public pure returns (uint256 colonyVersion) { return //' | sed 's/; }//' | sed 's/ //g'`,
    )
  ).trim();
  console.log(`Current Colony contract version is ${version}`);
  const nextVersion = parseInt(version, 10) + 1;

  await exec(
    // eslint-disable-next-line max-len
    `sed -i.bak "s/function version() public pure returns (uint256 colonyVersion) { return ${version}/function version() public pure returns (uint256 colonyVersion) { return ${nextVersion}/g" ./colonyNetwork-next/contracts/colony/Colony.sol`,
  );

  const cmdBase = `cd colonyNetwork-next && ${await getNodeVersionCommand(nodeVersion)}`;

  const resolverAddress = await deployViaHardhat("next", cmdBase, "IMetaColony", [
    // eslint-disable-next-line max-len
    "Colony",
    "ColonyDomains",
    "ColonyExpenditure",
    "ColonyFunding",
    "ColonyRewards",
    "ColonyRoles",
    "ContractRecovery",
    "ColonyArbitraryTransaction",
  ]);

  await module.exports.registerOldColonyVersion(resolverAddress, colonyNetwork);
  console.log('Deployed "next" version of Colony contract with resolver', resolverAddress);
};

module.exports.deployNextExtensionVersion = async (colonyNetwork, extensionName) => {
  if (extensionName === "VotingReputation") {
    throw new Error("VotingReputation extension not supported in this script");
  }
  await setupNextVersionRepo();

  const nodeVersion = fs.readFileSync(`colonyNetwork-next/.nvmrc`, "utf8").trim();
  // Bump version number in extension
  const version = (
    await exec(
      `cd colonyNetwork-next/contracts/extensions/ &&
       grep -A 1 'function version() public pure override' ./${extensionName}.sol | tail -n 1 | awk '{print $2}' | sed 's/;//'`,
    )
  ).trim();
  console.log(`Current extension version is ${version}`);
  const nextVersion = parseInt(version, 10) + 1;

  await exec(
    // eslint-disable-next-line max-len
    `sed -i.bak "s/return ${version}/return ${nextVersion}/g" ./colonyNetwork-next/contracts/extensions/${extensionName}.sol`,
  );

  const cmdBase = `cd colonyNetwork-next && ${await getNodeVersionCommand(nodeVersion)}`;
  await exec(`${cmdBase} && npx hardhat compile`);
  const resolver = await artifacts.require("Resolver").new();
  const resolverAddress = resolver.address;
  const nextArtifact = JSON.parse(
    fs.readFileSync(`./colonyNetwork-next/artifacts/contracts/extensions/${extensionName}.sol/${extensionName}.json`, "utf8"),
  );

  const signer = new ethers.providers.JsonRpcProvider().getSigner();
  const factory = new ethers.ContractFactory(nextArtifact.abi, nextArtifact.bytecode, signer);
  const res = await factory.deploy();
  await res.deployed();

  const implementationInterface = await artifacts.require(extensionName);
  const implementation = await implementationInterface.at(res.address);
  const deployedImplementations = {};
  deployedImplementations[extensionName] = implementation.address;

  await setupEtherRouter("extensions", extensionName, deployedImplementations, resolver);

  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await artifacts.require("IMetaColony").at(metaColonyAddress);
  await metaColony.addExtensionToNetwork(web3.utils.soliditySha3(extensionName), resolverAddress);

  console.log(`Deployed "next" version of extension ${extensionName} with resolver`, resolverAddress);
};

module.exports.downgradeColony = async (colonyNetwork, colony, version) => {
  if (!colonyDeployed.IMetaColony[version]) {
    throw new Error("Version not deployed");
  }
  const accounts = await web3.eth.getAccounts();

  // To downgrade a colony, we need to set the authority to the old authority contract,
  // and set the resolver to the old version resolver. We don't allow this during ordinary
  // operation, so directly editing the relevant storage slots is required.

  const oldAuthority = await colonyDeployed.IMetaColony[version].OldAuthority.new(colony.address);
  await oldAuthority.setUserRole(accounts[0], ROOT_ROLE, true);
  await oldAuthority.setUserRole(accounts[0], RECOVERY_ROLE, true);
  await oldAuthority.setUserRole(accounts[0], ADMINISTRATION_ROLE, true);
  await oldAuthority.setUserRole(accounts[0], ARCHITECTURE_ROLE, true);
  await oldAuthority.setOwner(colony.address);
  await setStorageSlot(colony, 0, `0x${"0".repeat(24)}${oldAuthority.address.slice(2)}`);
  const oldVersionResolver = colonyDeployed.IMetaColony[version].resolverAddress;
  await setStorageSlot(colony, 2, `0x${"0".repeat(24)}${oldVersionResolver.slice(2)}`);
};

module.exports.downgradeColonyNetwork = async (colonyNetwork, version) => {
  if (!colonyNetworkDeployed[version]) {
    throw new Error("Version not deployed");
  }

  const oldAuthority = await colonyNetworkDeployed[version].OldAuthority.new(colonyNetwork.address);
  await setStorageSlot(colonyNetwork, 0, `0x${"0".repeat(24)}${oldAuthority.address.slice(2)}`);
  const oldVersionResolver = colonyNetworkDeployed[version].resolverAddress;
  await setStorageSlot(colonyNetwork, 2, `0x${"0".repeat(24)}${oldVersionResolver.slice(2)}`);
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

  let resolverAddress;
  let versionUsesTruffle;
  let cmdBase;

  // Clone the network if needed
  if (!exists) {
    console.log(`Network version ${versionTag} doesnt exist, attempting to generate`);
    console.log("Cloning the network...");
    await exec(`rm -rf colonyNetwork-${versionTag}`);
    await exec(`git clone --depth 1 --branch ${versionTag} https://github.com/JoinColony/colonyNetwork.git colonyNetwork-${versionTag}`);
    await exec(`cd colonyNetwork-${versionTag} && git submodule update --init --recursive`);
  }

  // Configure node version
  const nodeVersion = fs.readFileSync(`colonyNetwork-${versionTag}/.nvmrc`).toString().trim();
  cmdBase = `cd colonyNetwork-${versionTag} && ${await getNodeVersionCommand(nodeVersion)}`; // eslint-disable-line prefer-const

  // Finish building if needed
  if (!exists) {
    versionUsesTruffle = fs.existsSync(`./colonyNetwork-${versionTag}/truffle.js`);
    // If truffle.js is not present, we're in a hardhat environment
    if (versionUsesTruffle) {
      await exec(`${cmdBase} && sed -ie 's/parseInt(process.env.CHAIN_ID, 10) || 1999/"*"/g' ./truffle.js`); // Handle hardhat coverage

      console.log("Installing the network...");
      await exec(`${cmdBase} && npm i -g yarn && yarn install --ignore-engines`); // npm install slow on old node versions
      await exec(`${cmdBase} && npm run provision:token:contracts`);
    } else {
      console.log("Installing the network...");
      let packageManagerCommand;
      if (fs.existsSync(`./colonyNetwork-${versionTag}/pnpm-lock.yaml`)) {
        packageManagerCommand = "pnpm";
      } else {
        packageManagerCommand = "npm";
      }

      await exec(`cd colonyNetwork-${versionTag} && ${packageManagerCommand} install`);
    }
  } else {
    versionUsesTruffle = fs.existsSync(`./colonyNetwork-${versionTag}/truffle.js`);
  }

  if (versionUsesTruffle) {
    resolverAddress = await deployViaTruffle(versionTag, cmdBase, interfaceName, implementationNames);
  } else {
    resolverAddress = await deployViaHardhat(versionTag, cmdBase, interfaceName, implementationNames);
  }

  deployedResolverAddresses[interfaceName] = deployedResolverAddresses[interfaceName] || {};
  deployedResolverAddresses[interfaceName][versionTag] = resolverAddress;
  console.log("Deployed", interfaceName, "at version", versionTag, "with resolver", resolverAddress);
  return resolverAddress;
};

async function deployViaTruffle(versionTag, cmdBase, interfaceName, implementationNames) {
  console.log("Deploying upgradable version...");
  await exec(`cp ./scripts/setupOldUpgradeableVersion.js ./colonyNetwork-${versionTag}/scripts/setupOldUpgradeableVersion.js`);

  const network = hre.__SOLIDITY_COVERAGE_RUNNING ? "coverage" : "development";

  const res = await exec(
    `${cmdBase} ` +
      "&& sed -ie 's/8555/8545/g' ./truffle.js " +
      "&& npx truffle exec ./scripts/setupOldUpgradeableVersion.js " +
      `--network ${network} --interfaceName ${interfaceName} --implementationNames ${implementationNames.join(",")}`,
    { maxBuffer: 1024 * 5000 },
  );

  const resolverAddress = res.split("\n").slice(-2)[0].trim();
  return resolverAddress;
}

async function deployViaHardhat(versionTag, cmdBase, interfaceName, implementationNames) {
  console.log("Deploying upgradable version...");
  await exec(`cp ./scripts/setupOldUpgradeableVersionHardhat.js ./colonyNetwork-${versionTag}/scripts/setupOldUpgradeableVersionHardhat.js`);

  const network = hre.__SOLIDITY_COVERAGE_RUNNING ? "coverage" : "development";

  const res = await exec(
    `${cmdBase} ` +
      `&& INTERFACE_NAME=${interfaceName} IMPLEMENTATION_NAMES=${implementationNames.join(
        ",",
      )} npx hardhat run ./scripts/setupOldUpgradeableVersionHardhat.js ` +
      `--network ${network}`,
    { maxBuffer: 1024 * 5000 },
  );

  const resolverAddress = res.split("\n").slice(-2)[0].trim();
  return resolverAddress;
}
