/* globals artifacts */
/* eslint-disable no-console */
const { setupUpgradableColonyNetwork } = require("../helpers/upgradable-contracts");

const ContractRecovery = artifacts.require("./ContractRecovery");
const ColonyNetwork = artifacts.require("./ColonyNetwork");
const ColonyNetworkMining = artifacts.require("./ColonyNetworkMining");
const ColonyNetworkAuction = artifacts.require("./ColonyNetworkAuction");
const ColonyNetworkENS = artifacts.require("./ColonyNetworkENS");
const EtherRouter = artifacts.require("./EtherRouter");
const Resolver = artifacts.require("./Resolver");

module.exports = deployer => {
  let etherRouter;
  let resolver;
  let colonyNetwork;
  let colonyNetworkMining;
  let colonyNetworkAuction;
  let colonyNetworkENS;
  let contractRecovery;
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
      return ColonyNetworkENS.deployed();
    })
    .then(instance => {
      colonyNetworkENS = instance;
      return EtherRouter.deployed();
    })
    .then(instance => {
      etherRouter = instance;
      return Resolver.deployed();
    })
    .then(instance => {
      resolver = instance;
      return ContractRecovery.deployed();
    })
    .then(instance => {
      contractRecovery = instance;
      return setupUpgradableColonyNetwork(
        etherRouter,
        resolver,
        colonyNetwork,
        colonyNetworkMining,
        colonyNetworkAuction,
        colonyNetworkENS,
        contractRecovery
      );
    })
    .then(() => {
      console.log("### Colony Network setup with Resolver", resolver.address, "and EtherRouter", etherRouter.address);
    })
    .catch(err => {
      console.log("### Error occurred ", err);
    });
};
