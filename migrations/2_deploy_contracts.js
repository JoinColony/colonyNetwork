// These globals are added by Truffle:
/* globals TaskLibrary, SecurityLibrary, ColonyLibrary,
 TokenLibrary, RootColony, RootColonyResolver, ColonyFactory, EternalStorage */

module.exports = function (deployer) {
  deployer.deploy([
    // Deploy libraries first
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
