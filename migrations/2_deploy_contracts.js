// These globals are added by Truffle:
/* globals ColonyPaymentProvider, TaskLibrary, SecurityLibrary, ColonyLibrary,
 TokenLibrary, RootColony, RootColonyResolver, ColonyFactory, EternalStorage */

module.exports = function (deployer) {
  deployer.deploy([
    // Deploy libraries first
    ColonyPaymentProvider,
    TaskLibrary,
    SecurityLibrary,
    ColonyLibrary,
    TokenLibrary,
  ]);
  deployer.autolink();
  deployer.deploy([
    // Deploy colony network contracts
    RootColony,
    RootColonyResolver,
    ColonyFactory,
    EternalStorage,
  ]);
};
