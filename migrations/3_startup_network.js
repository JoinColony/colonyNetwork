/* eslint-env node */
/* globals RootColony, RootColonyResolver, ColonyFactory, EternalStorage */
module.exports = function(done) {

  var rootColonyDeployed = RootColony.deployed();
  var rootColonyResolverDeployed = RootColonyResolver.deployed();
  var colonyFactoryDeployed = ColonyFactory.deployed();
  var eternalStorageRootDeployed = EternalStorage.deployed();

  eternalStorageRootDeployed.changeOwner(colonyFactoryDeployed.address)
  .then(function(){
    return rootColonyResolverDeployed.registerRootColony(rootColonyDeployed.address);
  })
  .then(function(){
    return colonyFactoryDeployed.registerRootColonyResolver(rootColonyResolverDeployed.address);
  })
  .then(function(){
    return rootColonyDeployed.registerColonyFactory(colonyFactoryDeployed.address);
  })
  .then(function(){
    return colonyFactoryDeployed.registerEternalStorage(eternalStorageRootDeployed.address);
  })
  .then(function(){
    console.log('### Network contracts registered successfully ###');
    return;
  })
  .then(done)
  .catch(done);
};
