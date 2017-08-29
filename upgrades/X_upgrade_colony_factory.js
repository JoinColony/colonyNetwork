// These globals are added by Truffle:
/* globals ColonyNetwork, RootColonyResolver, ColonyFactory, TaskLibrary, SecurityLibrary, ColonyLibrary,
 TokenLibrary*/

module.exports = function (deployer) {
  // Migration contract: 0xe615ff35ace036315f37c8c7d5dd9b82f37a201e
  // Check this migration contract is right, then edit the truffle artifact so it is
  // pointing at this contract.
  const rootColonyDeployed = ColonyNetwork.at('');
  const rootColonyResolver = RootColonyResolver.at('');
  let newColonyFactory;
  // I'm just redeploying all libraries here - we could only redeploy the libraries that have
  // Actually changed.
  deployer.deploy(TaskLibrary)
  .then(function () {
    return deployer.deploy(SecurityLibrary);
  })
  .then(function () {
    return deployer.deploy(ColonyLibrary);
  })
  .then(function () {
    return deployer.deploy(TokenLibrary);
  })
  .then(function () {
    return deployer.autolink();
  })
  .then(function () {
    return deployer.deploy(ColonyFactory);
  })
  .then(function () {
    newColonyFactory = ColonyFactory.deployed();
    return newColonyFactory.registerRootColonyResolver(rootColonyResolver.address);
  })
  .then(function () {
    return rootColonyDeployed.registerColonyFactory(newColonyFactory.address);
  })
  .then(function () {
    console.log('### ColonyFactory upgraded. Colony owners should now call the "upgrade" function ###');
  })
  .catch(function (err) {
    console.log('An error occurred:');
    console.log(err);
  });
};
