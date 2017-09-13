/* eslint-disable no-undef */

const ColonyNetwork = artifacts.require('./ColonyNetwork.sol');

module.exports = function (deployer, network) {
  console.log(`## ${network} network ##`);
  deployer.deploy([ColonyNetwork]);
};
