/* globals artifacts */
/* eslint-disable no-console */

const { setupColonyVersionResolver } = require("../helpers/upgradable-contracts");

const Colony = artifacts.require("./Colony");
const ColonyFunding = artifacts.require("./ColonyFunding");
const ColonyTask = artifacts.require("./ColonyTask");
const ColonyTransactionReviewer = artifacts.require("./ColonyTransactionReviewer");
const ColonyNetwork = artifacts.require("./ColonyNetwork");
const EtherRouter = artifacts.require("./EtherRouter");
const Resolver = artifacts.require("./Resolver");

module.exports = deployer => {
  // Create a new Colony (version) and setup a new Resolver for it
  let colony;
  let colonyFunding;
  let version;
  let resolver;
  let colonyNetwork;
  let colonyTask;
  let colonyTransactionReviewer;
  deployer
    .then(() => Colony.new())
    .then(instance => {
      colony = instance;
      return ColonyFunding.new();
    })
    .then(instance => {
      colonyFunding = instance;
      return ColonyTask.new();
    })
    .then(instance => {
      colonyTask = instance;
      return ColonyTransactionReviewer.new();
    })
    .then(instance => {
      colonyTransactionReviewer = instance;
      return colony.version.call();
    })
    .then(_version => {
      version = _version.toNumber();
      return Resolver.new();
    })
    .then(_resolver => {
      resolver = _resolver;
      return EtherRouter.deployed();
    })
    .then(_etherRouter => ColonyNetwork.at(_etherRouter.address))
    .then(instance => {
      colonyNetwork = instance;
      // Register the new Colony contract version with the newly setup Resolver
      return setupColonyVersionResolver(colony, colonyTask, colonyFunding, colonyTransactionReviewer, resolver, colonyNetwork);
    })
    .then(() => {
      console.log("### Colony version", version, "set to Resolver", resolver.address);
    })
    .catch(err => {
      console.log("### Error occurred ", err);
    });
};
