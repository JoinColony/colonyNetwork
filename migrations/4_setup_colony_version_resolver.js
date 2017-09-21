const upgradableContracts = require('../helpers/upgradable-contracts');
const Colony = artifacts.require('./Colony');
const ColonyNetwork = artifacts.require('./ColonyNetwork');
const EtherRouter = artifacts.require('./EtherRouter');
const Resolver = artifacts.require('./Resolver');
const MultiSigWallet = artifacts.require('multisig-wallet/MultiSigWallet');

module.exports = function (deployer, network, accounts) {
  // Create a new Colony (version) and setup a new Resolver for it
  let colony;
  let version;
  let resolver;
  let colonyNetwork;
  deployer.then(function () {
    return Colony.new();
  })
  .then(function (instance) {
    colony = instance;
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
    return upgradableContracts.setupColonyVersionResolver(colony, resolver, colonyNetwork);
  })
  .then(function (r) {
    console.log('### Colony version', version, 'set to Resolver', resolver.address);
  })
  .catch(function (err) {
    console.log('### Error occurred ', err);
  });
};
