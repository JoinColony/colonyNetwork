/* globals artifacts */
/* eslint-disable no-console */

const { setupColonyVersionResolver } = require("../helpers/upgradable-contracts");

const Colony = artifacts.require("./Colony");
const ColonyFunding = artifacts.require("./ColonyFunding");
const ColonyTask = artifacts.require("./ColonyTask");
const ContractRecovery = artifacts.require("./ContractRecovery");
const EtherRouter = artifacts.require("./EtherRouter");
const Resolver = artifacts.require("./Resolver");
const IColonyNetwork = artifacts.require("./IColonyNetwork");

// eslint-disable-next-line no-unused-vars
module.exports = async function(deployer) {
  // Create a new Colony (version) and setup a new Resolver for it
  const colony = await Colony.new();
  const colonyFunding = await ColonyFunding.new();
  const colonyTask = await ColonyTask.new();
  const contractRecovery = await ContractRecovery.deployed();
  const version = await colony.version();
  const resolver = await Resolver.new();

  const etherRouterDeployed = await EtherRouter.deployed();
  const colonyNetwork = await IColonyNetwork.at(etherRouterDeployed.address);

  // Register the new Colony contract version with the newly setup Resolver
  await setupColonyVersionResolver(colony, colonyTask, colonyFunding, contractRecovery, resolver);
  await colonyNetwork.initialise(resolver.address);

  console.log("### Colony version", version.toString(), "set to Resolver", resolver.address);
};
