// Input:
/* globals artifacts */

const Resolver = artifacts.require("./Resolver");
const { setupEtherRouter } = require("../helpers/upgradable-contracts");

module.exports = async (callback) => {
  const interfaceArgPos = process.argv.indexOf("--interfaceName");
  const interfaceName = process.argv[interfaceArgPos + 1];
  const implementationNameArgPost = process.argv.indexOf("--implementationNames");
  const implementationNames = process.argv[implementationNameArgPost + 1].split(",");
  const implementations = implementationNames.map((x) => artifacts.require(x));

  const deployments = await Promise.all(implementations.map((x) => x.new()));
  const resolver = await Resolver.new();

  const deployedImplementations = {};
  for (let idx = 0; idx < implementations.length; idx += 1) {
    deployedImplementations[implementations[idx].contractName] = deployments[idx].address;
  }
  await setupEtherRouter(interfaceName, deployedImplementations, resolver);
  console.log(resolver.address);
  callback();
};
