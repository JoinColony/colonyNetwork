/* globals ColonyPaymentProvider, TaskLibrary, SecurityLibrary, ColonyLibrary, RootColony, RootColonyResolver, ColonyFactory, EternalStorage, FakeNewRootColony, FakeNewColonyFactory, FakeUpdatedColony */
module.exports = function(deployer) {
  deployer.deploy([
    // Deploy libraries first
    ColonyPaymentProvider,
    TaskLibrary,
    SecurityLibrary,
    ColonyLibrary
  ]);
  deployer.autolink();
  deployer.deploy([
    // Deploy colony network contracts
    RootColony,
    RootColonyResolver,
    ColonyFactory,
    EternalStorage
  ]);
};
