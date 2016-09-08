// These globals are added by Truffle:
/* globals TaskLibrary, SecurityLibrary, ColonyLibrary,
 ColonyPaymentProvider, TokenLibrary, RootColony, RootColonyResolver, ColonyFactory, EternalStorage, VotingLibrary */

module.exports = function (deployer) {
  // Deploy libraries first
  deployer.deploy([ColonyPaymentProvider]);
  deployer.deploy([TaskLibrary]);
  deployer.deploy([SecurityLibrary]);
  deployer.deploy([ColonyLibrary]);
  deployer.deploy([TokenLibrary]);
  deployer.deploy([VotingLibrary]);
  deployer.autolink();
  // Deploy colony network contracts
  deployer.deploy([RootColony]);
  deployer.deploy([RootColonyResolver]);
  deployer.deploy([ColonyFactory]);
  deployer.deploy([EternalStorage]);
};
