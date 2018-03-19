/* globals artifacts */
/* eslint-disable no-undef, no-console */

const SafeMath = artifacts.require("./SafeMath");
const ColonyTask = artifacts.require("./ColonyTask");
const ColonyNetwork = artifacts.require("./ColonyNetwork");
const ColonyNetworkStaking = artifacts.require("./ColonyNetworkStaking");
const EtherRouter = artifacts.require("./EtherRouter");
const Resolver = artifacts.require("./Resolver");
const ReputationMiningCycle = artifacts.require("./ReputationMiningCycle");

module.exports = (deployer, network) => {
  console.log(`## ${network} network ##`);
  deployer.deploy([SafeMath]);
  deployer.link(SafeMath, ColonyTask);
  deployer.deploy([ColonyNetwork]);
  deployer.deploy([ColonyNetworkStaking]);
  deployer.deploy([EtherRouter]);
  deployer.deploy([Resolver]);

  // We `require` the ReputationMiningCycle object to make sure
  // it is injected in the `artifacts` variables during test
  // preparation. We need this for the eth-gas-reporter.
  // See https://github.com/cgewecke/eth-gas-reporter/issues/64
  // This log prevents "variable not used" warnings.
  console.log(ReputationMiningCycle);
};
