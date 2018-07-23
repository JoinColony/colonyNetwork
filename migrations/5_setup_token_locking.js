/* globals artifacts */
/* eslint-disable no-console */

const { setupUpgradableTokenLocking } = require("../helpers/upgradable-contracts");

const TokenLocking = artifacts.require("./TokenLocking");
const IColonyNetwork = artifacts.require("./IColonyNetwork");
const EtherRouter = artifacts.require("./EtherRouter");
const Resolver = artifacts.require("./Resolver");

module.exports = deployer => {
  let resolver;
  let etherRouter;
  let colonyNetworkEtherRouter;
  deployer
    .then(() => Resolver.new())
    .then(instance => {
      resolver = instance;
      return EtherRouter.new();
    })
    .then(instance => {
      etherRouter = instance;
      return TokenLocking.new();
    })
    .then(instance => setupUpgradableTokenLocking(etherRouter, resolver, instance))
    .then(() => EtherRouter.deployed())
    .then(_colonyNetworkEtherRouter => {
      colonyNetworkEtherRouter = _colonyNetworkEtherRouter;
      return IColonyNetwork.at(_colonyNetworkEtherRouter.address);
    })
    .then(iColonyNetwork => iColonyNetwork.setTokenLocking(etherRouter.address))
    .then(() => TokenLocking.at(etherRouter.address))
    .then(tokenLocking => tokenLocking.setColonyNetwork(colonyNetworkEtherRouter.address))
    .then(() => {
      console.log("### Token locking setup at ", etherRouter.address, "with Resolver", resolver.address);
    })
    .catch(err => {
      console.log("### Error occurred ", err);
    });
};
