/* eslint-disable no-undef */

const Token = artifacts.require('./Token.sol');
const EtherRouter = artifacts.require('./EtherRouter.sol');
const ColonyNetwork = artifacts.require('./ColonyNetwork.sol');
const SecurityLibrary = artifacts.require('./SecurityLibrary.sol');
const TaskLibrary = artifacts.require('./TaskLibrary.sol');

module.exports = function (deployer, network) {
  console.log(`## ${network} network ##`);
  deployer.deploy([Token]);
  deployer.deploy([EtherRouter]);
  deployer.deploy([SecurityLibrary]);
  deployer.deploy([TaskLibrary]);
  deployer.link(SecurityLibrary, ColonyNetwork);
  deployer.link(TaskLibrary, ColonyNetwork);
  deployer.deploy([ColonyNetwork]);

  // Add demo data if we're not deploying to the live network.
  if (network === 'integration') {
  }
};
