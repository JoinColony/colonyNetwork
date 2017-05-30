/* eslint-disable no-undef, no-unused-vars-rest/no-unused-vars, no-var */

const RootColony = artifacts.require('./RootColony.sol');
const RootColonyResolver = artifacts.require('./RootColonyResolver.sol');
const ColonyFactory = artifacts.require('./ColonyFactory.sol');
const EternalStorage = artifacts.require('./EternalStorage.sol');

module.exports = function (deployer) {
  var rootColonyDeployed;
  var rootColonyResolverDeployed;
  var colonyFactoryDeployed;
  var eternalStorageRootDeployed;

  RootColony.deployed()
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
    return eternalStorageRootDeployed.changeOwner(rootColonyDeployed.address);
  })
  .then(function () {
    return rootColonyResolverDeployed.registerRootColony(rootColonyDeployed.address);
  })
  .then(function () {
    return colonyFactoryDeployed.registerRootColonyResolver(rootColonyResolverDeployed.address);
  })
  .then(function () {
    return rootColonyDeployed.registerColonyFactory(colonyFactoryDeployed.address);
  })
  .then(function () {
    return rootColonyDeployed.registerEternalStorage(eternalStorageRootDeployed.address);
  })
  .then(function () {
    console.log('### Network contracts registered successfully ###');
  });
};
