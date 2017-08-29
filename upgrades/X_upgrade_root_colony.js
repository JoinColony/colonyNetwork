// These globals are added by Truffle:
/* globals ColonyNetwork, RootColonyResolver, ColonyFactory, SecurityLibrary, ColonyLibrary,
 EternalStorage, assert */
module.exports = function (deployer) {
  // Migration contract: 0xe615ff35ace036315f37c8c7d5dd9b82f37a201e
  // Check this migration contract is right, then edit the truffle artifact so it is
  // pointing at this contract.
  const rootColonyOld = ColonyNetwork.at('');
  const rootColonyResolver = RootColonyResolver.at('');
  let colonyFactory;
  let rootColonyNew;
  let eternalStorageRoot;
  // I'm just redeploying all libraries here - we could only redeploy the libraries that have
  // Actually changed.
  deployer.deploy(SecurityLibrary)
  .then(function () {
    return deployer.deploy(ColonyLibrary);
  })
  .then(function () {
    return deployer.autolink();
  })
  .then(function () {
    return rootColonyOld.colonyFactory.call();
  })
  .then(function (colonyFactoryAddress) {
    colonyFactory = ColonyFactory.at(colonyFactoryAddress);
  })
  .then(function () {
    return ColonyNetwork.new();
  })
  .then(function (_rootColonyNew) {
    rootColonyNew = ColonyNetwork.at(_rootColonyNew.address);
    console.log('New ColonyNetwork created at ', rootColonyNew.address);
    // assert.notEqual(rootColonyNew.address, rootColonyOld.address);
    return rootColonyResolver.registerRootColony(rootColonyNew.address);
  })
  .then(function () {
    return rootColonyResolver.rootColonyAddress.call();
  })
  .then(function (_rootColonyAddress) { // eslint-disable-line no-unused-vars-rest/no-unused-vars
    // assert.equal(_rootColonyAddress, rootColonyNew.address);
    return rootColonyNew.registerColonyFactory(colonyFactory.address);
  })
  .then(function () {
    return rootColonyNew.colonyFactory.call();
  })
  .then(function (_colonyFactoryAddress) { // eslint-disable-line no-unused-vars-rest/no-unused-vars
    // assert.equal(_colonyFactoryAddress, colonyFactory.address);
    return rootColonyOld.changeEternalStorageOwner(rootColonyNew.address);
  })
  .then(function () {
    return rootColonyOld.eternalStorageRoot.call();
  })
  .then(function (eternalStorageRootAddress) {
    eternalStorageRoot = EternalStorage.at(eternalStorageRootAddress);
    return eternalStorageRoot.owner.call();
  })
  .then(function (_owner) { // eslint-disable-line no-unused-vars-rest/no-unused-vars
    // assert.equal(_owner, rootColonyNew.address);
    return rootColonyNew.registerEternalStorage(eternalStorageRoot.address);
  })
  .then(function () {
    return rootColonyNew.eternalStorageRoot.call();
  })
  // .then(function (storageRoot) {
  //   assert.equal(storageRoot, eternalStorageRoot.address);
  // })
  .then(function () {
    console.log('### ColonyNetwork upgraded!');
  })
  .catch(function (err) {
    console.log('An error occurred:');
    console.log(err);
  });
};
