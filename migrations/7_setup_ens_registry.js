/* globals artifacts */

const { setupENSRegistrar } = require("../helpers/upgradable-contracts");

const EtherRouter = artifacts.require("./EtherRouter");
const IColonyNetwork = artifacts.require("./IColonyNetwork");
const ENSRegistry = artifacts.require("ENSRegistry");

// eslint-disable-next-line no-unused-vars
module.exports = async function (deployer, network, accounts) {
  const etherRouterDeployed = await EtherRouter.deployed();
  const colonyNetwork = await IColonyNetwork.at(etherRouterDeployed.address);
  const ensRegistry = await ENSRegistry.new();
  await setupENSRegistrar(colonyNetwork, ensRegistry, accounts[0]);

  console.log("### ENSRegistry set up at", ensRegistry.address, "and linked to ColonyNetwork");
};
