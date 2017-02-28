// These globals are added by Truffle:
/* globals RootColony, RootColonyResolver, ColonyFactory, EternalStorage */

module.exports = function (deployer) {
  const rootColonyDeployed = RootColony.deployed();
  const rootColonyResolverDeployed = RootColonyResolver.deployed();
  const colonyFactoryDeployed = ColonyFactory.deployed();
  const eternalStorageRootDeployed = EternalStorage.deployed();

  deployer
  .then(function () {
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
