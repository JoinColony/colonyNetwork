/* eslint-disable no-undef */

const ColonyNetwork = artifacts.require('./ColonyNetwork');
const EtherRouter = artifacts.require('./EtherRouter');
const Resolver = artifacts.require('./Resolver');

module.exports = function (deployer, network) {
  console.log(`## ${network} network ##`);
  deployer.deploy([ColonyNetwork]);
  deployer.deploy([EtherRouter]);
  deployer.deploy([Resolver]);
};
