/* eslint-disable no-undef */

const TaskLibrary = artifacts.require('./TaskLibrary.sol');
const SecurityLibrary = artifacts.require('./SecurityLibrary.sol');
const ColonyLibrary = artifacts.require('./ColonyLibrary.sol');
const TokenLibrary = artifacts.require('./TokenLibrary.sol');
const RootColony = artifacts.require('./RootColony.sol');
const RootColonyResolver = artifacts.require('./RootColonyResolver.sol');
const ColonyFactory = artifacts.require('./ColonyFactory.sol');
const EternalStorage = artifacts.require('./EternalStorage.sol');
const EtherRouter = artifacts.require('./EtherRouter.sol');
const Token = artifacts.require('./Token.sol');

module.exports = function (deployer, network) {
  console.log(`## ${network} network ##`);
  // Deploy libraries first
  deployer.deploy([TaskLibrary]);
  deployer.deploy([SecurityLibrary]);
  deployer.deploy([ColonyLibrary]);
  deployer.deploy([TokenLibrary]);
  // Link and deploy contracts
  deployer.link(ColonyLibrary, RootColony);
  deployer.link(SecurityLibrary, RootColony);
  deployer.deploy([RootColony]);
  deployer.deploy([RootColonyResolver]);
  deployer.link(SecurityLibrary, ColonyFactory);
  deployer.link(TaskLibrary, ColonyFactory);
  deployer.link(TokenLibrary, ColonyFactory);
  deployer.deploy([ColonyFactory]);
  deployer.deploy([EternalStorage]);

  // Add demo data if we're not deploying to the live network.
  if (network === 'integration') {
    const FakeNewRootColony = artifacts.require('./FakeNewRootColony.sol');
    const FakeNewColonyFactory = artifacts.require('./FakeNewColonyFactory.sol');
    // Link and deploy contracts
    deployer.link(ColonyLibrary, FakeNewRootColony);
    deployer.link(SecurityLibrary, FakeNewRootColony);
    deployer.deploy([FakeNewRootColony]);
    deployer.link(SecurityLibrary, FakeNewColonyFactory);
    deployer.link(TaskLibrary, FakeNewColonyFactory);
    deployer.link(TokenLibrary, FakeNewColonyFactory);
    deployer.deploy([FakeNewColonyFactory]);
  }

  // Deploy token and router
  deployer.deploy(EtherRouter);
  deployer.deploy(Token);
};
