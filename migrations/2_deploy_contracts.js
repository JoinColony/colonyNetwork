// These globals are added by Truffle:
/* globals TaskLibrary, SecurityLibrary, ColonyLibrary,
 TokenLibrary, RootColony, RootColonyResolver, ColonyFactory, EternalStorage */

module.exports = function (deployer) {
  // Deploy libraries first
  deployer.deploy([TaskLibrary]);
  deployer.deploy([SecurityLibrary]);
  deployer.deploy([ColonyLibrary]);
  deployer.deploy([TokenLibrary]);
  deployer.autolink();
  // Deploy colony network contracts
  deployer.deploy([RootColony]);
  deployer.deploy([RootColonyResolver]);
  deployer.deploy([ColonyFactory]);
  deployer.deploy([EternalStorage]);
};
