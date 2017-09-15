/* eslint-disable no-undef */

const ColonyNetwork = artifacts.require('./ColonyNetwork.sol');
const EtherRouter = artifacts.require('./EtherRouter.sol');
const Resolver = artifacts.require('./Resolver.sol');

module.exports = function (deployer, network) {
  console.log(`## ${network} network ##`);
  deployer.deploy([ColonyNetwork]);
  deployer.deploy([EtherRouter]);
  deployer.deploy([Resolver]);
};
