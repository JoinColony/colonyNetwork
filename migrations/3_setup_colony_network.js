/* globals artifacts */
/* eslint-disable no-console */
const { setupUpgradableColonyNetwork } = require("../helpers/upgradable-contracts");

const ColonyNetwork = artifacts.require("./ColonyNetwork");
const ColonyNetworkMining = artifacts.require("./ColonyNetworkMining");
const ColonyNetworkAuction = artifacts.require("./ColonyNetworkAuction");
const ColonyNetworkRegistrar = artifacts.require("./ColonyNetworkRegistrar");
const EtherRouter = artifacts.require("./EtherRouter");
const Resolver = artifacts.require("./Resolver");

module.exports = deployer => {
  let etherRouter;
  let resolver;
  let colonyNetwork;
  let colonyNetworkMining;
  let colonyNetworkAuction;
  let colonyNetworkRegistrar;
  deployer
    .then(() => ColonyNetwork.deployed())
    .then(instance => {
      colonyNetwork = instance;
      return ColonyNetworkMining.deployed();
    })
    .then(instance => {
      colonyNetworkMining = instance;
      return ColonyNetworkAuction.deployed();
    })
    .then(instance => {
      colonyNetworkAuction = instance;
      return ColonyNetworkRegistrar.deployed();
    })
    .then(instance => {
      colonyNetworkRegistrar = instance;
      return EtherRouter.deployed();
    })
    .then(instance => {
      etherRouter = instance;
      return Resolver.deployed();
    })
    .then(instance => {
      resolver = instance;
      return setupUpgradableColonyNetwork(etherRouter, resolver, colonyNetwork, colonyNetworkMining, colonyNetworkAuction, colonyNetworkRegistrar);
    })
    .then(() => {
      console.log("### Colony Network setup with Resolver", resolver.address, "and EtherRouter", etherRouter.address);
    })
    .catch(err => {
      console.log("### Error occurred ", err);
    });
};
