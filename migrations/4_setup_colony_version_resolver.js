const upgradableContracts = require('../helpers/upgradable-contracts');
const Colony = artifacts.require('./Colony');
const ColonyFunding = artifacts.require('./ColonyFunding');
const ColonyTask = artifacts.require('./ColonyTask');
const ColonyNetwork = artifacts.require('./ColonyNetwork');
const EtherRouter = artifacts.require('./EtherRouter');
const Resolver = artifacts.require('./Resolver');
const MultiSigWallet = artifacts.require('multisig-wallet/MultiSigWallet');

module.exports = function (deployer, network, accounts) {
  // Create a new Colony (version) and setup a new Resolver for it
  let colony;
  let colonyFunding;
  let version;
  let resolver;
  let colonyNetwork;
  let colonyTask;
  deployer.then(function () {
    return Colony.new();
  })
  .then(function (instance) {
    colony = instance;
    return ColonyFunding.new();
  })
  .then(function(instance){
    colonyFunding = instance;
    return ColonyTask.new();
  })
  .then(function(instance){
    colonyTask = instance;
    return colony.version.call();
  })
  .then(function (_version) {
    version = _version.toNumber();
    return Resolver.new();
  })
  .then(function (_resolver) {
    resolver = _resolver;
    return EtherRouter.deployed();
  })
  .then(function (_etherRouter) {
    return ColonyNetwork.at(_etherRouter.address);
  })
  .then(function (instance) {
    colonyNetwork = instance;
    // Register the new Colony contract version with the newly setup Resolver
    return upgradableContracts.setupColonyVersionResolver(colony, colonyTask, colonyFunding, resolver, colonyNetwork);
  })
  .then(function () {
    console.log('### Colony version', version, 'set to Resolver', resolver.address);
  })
  .catch(function (err) {
    console.log('### Error occurred ', err);
  });
};
