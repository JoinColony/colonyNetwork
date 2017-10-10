const upgradableContracts = require('../helpers/upgradable-contracts');
const ColonyNetwork = artifacts.require('./ColonyNetwork');
const EtherRouter = artifacts.require('./EtherRouter');
const Resolver = artifacts.require('./Resolver');
const MultiSigWallet = artifacts.require('multisig-wallet/MultiSigWallet');

module.exports = function (deployer, network, accounts) {
  let etherRouter;
  let resolver;
  let colonyNetwork;
  deployer.then(function () {
    return ColonyNetwork.deployed();
  })
  .then(function(instance) {
    colonyNetwork = instance;
    return EtherRouter.deployed();
  })
  .then(function (instance) {
    etherRouter = instance;
    return Resolver.deployed();
  })
  .then(function (instance) {
    resolver = instance;
    return upgradableContracts.setupUpgradableColonyNetwork(etherRouter, resolver, colonyNetwork);
  })
  .then(function (r) {
    console.log('### Colony Network setup with Resolver', resolver.address, 'and EtherRouter', etherRouter.address);
  })
  .catch(function (err) {
    console.log('### Error occurred ', err);
  });
};
