/* eslint-env node */
/* globals RootColony, RootColonyResolver, ColonyFactory, EternalStorage */
module.exports = function(done) {

  var rootColonyDeployed = RootColony.deployed();
  var rootColonyResolverDeployed = RootColonyResolver.deployed();
  var colonyFactoryDeployed = ColonyFactory.deployed();
  var eternalStorageRootDeployed = EternalStorage.deployed();

  rootColonyResolverDeployed.registerRootColony(rootColonyDeployed.address)
  .then(function(){
    return colonyFactoryDeployed.registerRootColonyResolver(rootColonyResolverDeployed.address);
  })
  .then(function(){
    return rootColonyDeployed.registerColonyFactory(colonyFactoryDeployed.address);
  })
  .then(function(){
    return eternalStorageRootDeployed.changeOwner(colonyFactoryDeployed.address);
  })
  .then(function(){
    return colonyFactoryDeployed.registerEternalStorage(eternalStorageRootDeployed.address);
  })
  .then(function(){
    console.log('### Network contracts registered successfully ###');
    process.exit(0);
  })
  .then(done)
  .catch(function(err){
    console.error('An error occurred while trying to register network contracts');
    console.error('Error: ', err);
    process.exit(1);
  });
};
