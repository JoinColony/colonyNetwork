/* globals artifacts */
/* eslint-disable no-undef, no-console */

const SafeMath = artifacts.require("./SafeMath");
const ColonyTask = artifacts.require("./ColonyTask");
const ColonyNetwork = artifacts.require("./ColonyNetwork");
const ColonyNetworkStaking = artifacts.require("./ColonyNetworkStaking");
const EtherRouter = artifacts.require("./EtherRouter");
const Resolver = artifacts.require("./Resolver");

module.exports = (deployer, network) => {
  console.log(`## ${network} network ##`);
  deployer.deploy([SafeMath]);
  deployer.link(SafeMath, ColonyTask);
  deployer.deploy([ColonyNetwork]);
  deployer.deploy([ColonyNetworkStaking]);
  deployer.deploy([EtherRouter]);
  deployer.deploy([Resolver]);
};
