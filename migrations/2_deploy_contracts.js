/* globals artifacts */
/* eslint-disable no-undef, no-console */

const SafeMath = artifacts.require("./SafeMath");
const ColonyTask = artifacts.require("./ColonyTask");
const ColonyNetwork = artifacts.require("./ColonyNetwork");
const ColonyNetworkMining = artifacts.require("./ColonyNetworkMining");
const ColonyNetworkAuction = artifacts.require("./ColonyNetworkAuction");
const EtherRouter = artifacts.require("./EtherRouter");
const Resolver = artifacts.require("./Resolver");

// We `require` the ReputationMiningCycle object to make sure
// it is injected in the `artifacts` variables during test
// preparation. We need this for the eth-gas-reporter.
// See https://github.com/cgewecke/eth-gas-reporter/issues/64
artifacts.require("./ReputationMiningCycle");

module.exports = (deployer, network) => {
  console.log(`## ${network} network ##`);
  deployer.deploy([SafeMath]);
  deployer.link(SafeMath, ColonyTask);
  deployer.deploy([ColonyNetwork]);
  deployer.deploy([ColonyNetworkMining]);
  deployer.deploy([ColonyNetworkAuction]);
  deployer.deploy([EtherRouter]);
  deployer.deploy([Resolver]);
};
