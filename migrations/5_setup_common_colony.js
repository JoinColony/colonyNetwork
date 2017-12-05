const assert = require('assert');
const upgradableContracts = require('../helpers/upgradable-contracts');
const Colony = artifacts.require('./Colony');
const ColonyNetwork = artifacts.require('./ColonyNetwork');
const EtherRouter = artifacts.require('./EtherRouter');
const Resolver = artifacts.require('./Resolver');
const MultiSigWallet = artifacts.require('multisig-wallet/MultiSigWallet');

module.exports = function (deployer, network, accounts) {
  // Create the common colony
  let colony;
  let version;
  let resolver;
  let colonyNetwork;
  deployer.then(function () {
    return EtherRouter.deployed();
  })
  .then(function (_etherRouter) {
    return ColonyNetwork.at(_etherRouter.address);
  })
  .then(function (instance) {
    colonyNetwork = instance;
    return colonyNetwork.createColony("Common Colony");
  })
  .then(function () {
    return colonyNetwork.getSkillCount.call();
  })
  .then(function (skillCount) {
    assert.equal(skillCount.toNumber(), 1);
    return colonyNetwork.getColony.call("Common Colony");
  })
  .then(function (commonColonyAddress) {
    console.log('### Common Colony created at', commonColonyAddress);
  })
  .catch(function (err) {
    console.log('### Error occurred ', err);
  });
};
