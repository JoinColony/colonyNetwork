/* globals ColonyPaymentProvider, TaskLibrary, SecurityLibrary, ColonyLibrary, ColonyTokenLedger, RootColony, RootColonyResolver, ColonyFactory, EternalStorage */
module.exports = function(deployer) {
  deployer.deploy([
    // Deploy libraries first
    ColonyPaymentProvider,
    TaskLibrary,
    SecurityLibrary,
    ColonyLibrary,
    ColonyTokenLedger
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
