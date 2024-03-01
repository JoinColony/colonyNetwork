/* globals artifacts */

const { setupReputationMiningCycleResolver } = require("../helpers/upgradable-contracts");
const { XDAI_CHAINID, FORKED_XDAI_CHAINID } = require("../helpers/constants");

const IColonyNetwork = artifacts.require("./IColonyNetwork");
const ReputationMiningCycle = artifacts.require("./ReputationMiningCycle");
const ReputationMiningCycleRespond = artifacts.require("./ReputationMiningCycleRespond");
const ReputationMiningCycleBinarySearch = artifacts.require("./ReputationMiningCycleBinarySearch");
const EtherRouter = artifacts.require("./EtherRouter");
const Resolver = artifacts.require("./Resolver");
const ChainId = artifacts.require("./ChainId");

// eslint-disable-next-line no-unused-vars
module.exports = async function (deployer) {
  // Check chain id
  // If not a mining chain, then skip
  const c = await ChainId.new();
  const chainId = await c.getChainId();

  if (chainId.toNumber() !== FORKED_XDAI_CHAINID && chainId.toNumber() !== XDAI_CHAINID) {
    console.log("Not mining chain, skipping setting up mining cycle resolver");
    return;
  }

  // Create a new Colony (version) and setup a new Resolver for it
  const reputationMiningCycle = await ReputationMiningCycle.deployed();
  const reputationMiningCycleRespond = await ReputationMiningCycleRespond.deployed();
  const reputationMiningCycleBinarySearch = await ReputationMiningCycleBinarySearch.deployed();
  const resolver = await Resolver.new();

  const etherRouterDeployed = await EtherRouter.deployed();
  const colonyNetwork = await IColonyNetwork.at(etherRouterDeployed.address);

  // Register a new Resolver for ReputationMining instance and set it on the Network
  await setupReputationMiningCycleResolver(
    reputationMiningCycle,
    reputationMiningCycleRespond,
    reputationMiningCycleBinarySearch,
    resolver,
    colonyNetwork,
  );

  console.log("### ReputationMiningCycle set to Resolver", resolver.address);
};
