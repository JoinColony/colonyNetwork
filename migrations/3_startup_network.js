/* eslint-disable no-undef, no-unused-vars-rest/no-unused-vars, no-var */
const assert = require('assert');

const ColonyNetwork = artifacts.require('./ColonyNetwork.sol');
const RootColonyResolver = artifacts.require('./RootColonyResolver.sol');
const ColonyFactory = artifacts.require('./ColonyFactory.sol');
const EternalStorage = artifacts.require('./EternalStorage.sol');

module.exports = function (deployer) {
  var rootColonyDeployed;
  var rootColonyResolverDeployed;
  var colonyFactoryDeployed;
  var eternalStorageRootDeployed;

  deployer.then(function () {
    return ColonyNetwork.deployed();
  })
  .then(function (instance) {
    rootColonyDeployed = instance;
    return RootColonyResolver.deployed();
  })
  .then(function (instance) {
    rootColonyResolverDeployed = instance;
    return ColonyFactory.deployed();
  })
  .then(function (instance) {
    colonyFactoryDeployed = instance;
    return EternalStorage.deployed();
  })
  .then(function (instance) {
    eternalStorageRootDeployed = instance;
    return eternalStorageRootDeployed.owner.call();
  })
  .then(function (owner) {
    return eternalStorageRootDeployed.changeOwner(rootColonyDeployed.address);
  })
  .then(function () {
    return eternalStorageRootDeployed.owner();
  })
  .then(function (owner) {
    assert.equal(owner, rootColonyDeployed.address);
    return rootColonyResolverDeployed.registerRootColony(rootColonyDeployed.address);
  })
  .then(function (value) {
    return rootColonyResolverDeployed.rootColonyAddress.call();
  })
  .then(function (rootColonyAddress) {
    assert.equal(rootColonyAddress, rootColonyDeployed.address);
    return colonyFactoryDeployed.registerRootColonyResolver(rootColonyResolverDeployed.address);
  })
  .then(function () {
    return colonyFactoryDeployed.rootColonyResolverAddress.call();
  })
  .then(function (rootColonyResolverAddress) {
    assert.equal(rootColonyResolverAddress, rootColonyResolverDeployed.address);
    return rootColonyDeployed.registerColonyFactory(colonyFactoryDeployed.address);
  })
  .then(function () {
    return rootColonyDeployed.colonyFactory();
  })
  .then(function (colonyFactoryAddress) {
    assert.equal(colonyFactoryAddress, colonyFactoryDeployed.address);
    return rootColonyDeployed.registerEternalStorage(eternalStorageRootDeployed.address);
  })
  .then(function () {
    return rootColonyDeployed.eternalStorageRoot();
  })
  .then(function (eternalStorageRoot) {
    assert.equal(eternalStorageRoot, eternalStorageRootDeployed.address);
    console.log('### Network contracts registered successfully ###');
  });
};
