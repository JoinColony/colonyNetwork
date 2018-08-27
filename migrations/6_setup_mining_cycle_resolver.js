/* globals artifacts */
/* eslint-disable no-console */

const { setupReputationMiningCycleResolver } = require("../helpers/upgradable-contracts");

const IColonyNetwork = artifacts.require("./IColonyNetwork");
const ReputationMiningCycle = artifacts.require("./ReputationMiningCycle");
const ReputationMiningCycleRespond = artifacts.require("./ReputationMiningCycleRespond");
const EtherRouter = artifacts.require("./EtherRouter");
const Resolver = artifacts.require("./Resolver");

module.exports = deployer => {
  // Create a new Colony (version) and setup a new Resolver for it
  let reputationMiningCycle;
  let reputationMiningCycleRespond;
  let resolver;
  let colonyNetwork;

  deployer
    .then(() => ReputationMiningCycle.deployed())
    .then(instance => {
      reputationMiningCycle = instance;
      return ReputationMiningCycleRespond.deployed();
    })
    .then(instance => {
      reputationMiningCycleRespond = instance;
      return Resolver.new();
    })
    .then(_resolver => {
      resolver = _resolver;
      return EtherRouter.deployed();
    })
    .then(_etherRouter => IColonyNetwork.at(_etherRouter.address))
    .then(instance => {
      colonyNetwork = instance;
      // Register the new Colony contract version with the newly setup Resolver
      return setupReputationMiningCycleResolver(reputationMiningCycle, reputationMiningCycleRespond, resolver, colonyNetwork);
    })
    .then(() => {
      console.log("### ReputationMiningCycle set to Resolver", resolver.address);
    })
    .catch(err => {
      console.log("### Error occurred ", err);
    });
};
