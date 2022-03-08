/* globals artifacts */

const ContractRecovery = artifacts.require("./ContractRecovery");
const ColonyNetwork = artifacts.require("./ColonyNetwork");
const ColonyNetworkDeployer = artifacts.require("./ColonyNetworkDeployer");
const ColonyNetworkMining = artifacts.require("./ColonyNetworkMining");
const ColonyNetworkAuction = artifacts.require("./ColonyNetworkAuction");
const ColonyNetworkENS = artifacts.require("./ColonyNetworkENS");
const ColonyNetworkExtensions = artifacts.require("./ColonyNetworkExtensions");
const ReputationMiningCycle = artifacts.require("./ReputationMiningCycle");
const ReputationMiningCycleRespond = artifacts.require("./ReputationMiningCycleRespond");
const ReputationMiningCycleBinarySearch = artifacts.require("./ReputationMiningCycleBinarySearch");

const EtherRouter = artifacts.require("./EtherRouter");
const Resolver = artifacts.require("./Resolver");

// We `require` the ReputationMiningCycle object to make sure
// it is injected in the `artifacts` variables during test
// preparation. We need this for the eth-gas-reporter.
// See https://github.com/cgewecke/eth-gas-reporter/issues/64
artifacts.require("./ReputationMiningCycle");

module.exports = (deployer, network) => {
  console.log(`## ${network} network ##`);
  deployer.deploy(ColonyNetwork);
  deployer.deploy(ColonyNetworkDeployer);
  deployer.deploy(ColonyNetworkMining);
  deployer.deploy(ColonyNetworkAuction);
  deployer.deploy(ColonyNetworkENS);
  deployer.deploy(ColonyNetworkExtensions);
  deployer.deploy(ReputationMiningCycle);
  deployer.deploy(ReputationMiningCycleRespond);
  deployer.deploy(ReputationMiningCycleBinarySearch);
  deployer.deploy(EtherRouter);
  deployer.deploy(Resolver);
  deployer.deploy(ContractRecovery);
};
