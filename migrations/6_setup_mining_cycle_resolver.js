/* globals artifacts */

const { setupReputationMiningCycleResolver } = require("../helpers/upgradable-contracts");

const IColonyNetwork = artifacts.require("./IColonyNetwork");
const ReputationMiningCycle = artifacts.require("./ReputationMiningCycle");
const ReputationMiningCycleRespond = artifacts.require("./ReputationMiningCycleRespond");
const ReputationMiningCycleBinarySearch = artifacts.require("./ReputationMiningCycleBinarySearch");
const EtherRouter = artifacts.require("./EtherRouter");
const Resolver = artifacts.require("./Resolver");

// eslint-disable-next-line no-unused-vars
module.exports = async function (deployer) {
  // Create a new Colony (version) and setup a new Resolver for it
  const reputationMiningCycle = await ReputationMiningCycle.deployed();
  const reputationMiningCycleRespond = await ReputationMiningCycleRespond.deployed();
  const reputationMiningCycleBinarySearch = await ReputationMiningCycleBinarySearch.deployed();
  const resolver = await Resolver.new();

  const etherRouterDeployed = await EtherRouter.deployed();
  const colonyNetwork = await IColonyNetwork.at(etherRouterDeployed.address);

  // Register a new Resolver for ReputationMining instance and set it on the Network
  await setupReputationMiningCycleResolver(reputationMiningCycle, reputationMiningCycleRespond, reputationMiningCycleBinarySearch, resolver, colonyNetwork);

  console.log("### ReputationMiningCycle set to Resolver", resolver.address);
};
