// Input:
/* globals artifacts */

const Resolver = artifacts.require("./Resolver");
const { setupEtherRouter } = require("../helpers/upgradable-contracts");

async function main() {
  const interfaceName = process.env.INTERFACE_NAME;
  const implementationNames = process.env.IMPLEMENTATION_NAMES.split(",");
  const implementations = implementationNames.map((x) => artifacts.require(x));

  const deployments = [];
  for (let idx = 0; idx < implementations.length; idx += 1) {
    const res = await implementations[idx].new();
    deployments.push(res);
  }

  const resolver = await Resolver.new();

  const deployedImplementations = {};
  for (let idx = 0; idx < implementations.length; idx += 1) {
    deployedImplementations[implementations[idx].contractName] = deployments[idx].address;
  }

  await setupEtherRouter("colony", interfaceName, deployedImplementations, resolver);
  console.log(resolver.address); // This returns the address to the caller
}

main();
