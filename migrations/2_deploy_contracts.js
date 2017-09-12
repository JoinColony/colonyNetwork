/* eslint-disable no-undef */

const ColonyNetwork = artifacts.require('./ColonyNetwork.sol');

module.exports = function (deployer, network) {
  console.log(`## ${network} network ##`);
  deployer.deploy([ColonyNetwork]);

  // Add demo data if we're not deploying to the live network.
  if (network === 'integration') {
    const UpdatedToken = artifacts.require('./UpdatedToken.sol');
    deployer.deploy(UpdatedToken);
  }
};
