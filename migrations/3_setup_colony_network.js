/* globals artifacts */
/* eslint-disable no-console */
const upgradableContracts = require("../helpers/upgradable-contracts");

const ColonyNetwork = artifacts.require("./ColonyNetwork");
const EtherRouter = artifacts.require("./EtherRouter");
const Resolver = artifacts.require("./Resolver");

module.exports = deployer => {
  let etherRouter;
  let resolver;
  let colonyNetwork;
  deployer
    .then(() => ColonyNetwork.deployed())
    .then(instance => {
      colonyNetwork = instance;
      return EtherRouter.deployed();
    })
    .then(instance => {
      etherRouter = instance;
      return Resolver.deployed();
    })
    .then(instance => {
      resolver = instance;
      return upgradableContracts.setupUpgradableColonyNetwork(etherRouter, resolver, colonyNetwork);
    })
    .then(() => {
      console.log("### Colony Network setup with Resolver", resolver.address, "and EtherRouter", etherRouter.address);
    })
    .catch(err => {
      console.log("### Error occurred ", err);
    });
};
