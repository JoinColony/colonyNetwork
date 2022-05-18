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

module.exports = async function (deployer, network) {
  console.log(`## ${network} network ##`);
  await deployer.deploy(ColonyNetwork);
  await deployer.deploy(ColonyNetworkDeployer);
  await deployer.deploy(ColonyNetworkMining);
  await deployer.deploy(ColonyNetworkAuction);
  await deployer.deploy(ColonyNetworkENS);
  await deployer.deploy(ColonyNetworkExtensions);
  await deployer.deploy(ReputationMiningCycle);
  await deployer.deploy(ReputationMiningCycleRespond);
  await deployer.deploy(ReputationMiningCycleBinarySearch);
  await deployer.deploy(EtherRouter);
  await deployer.deploy(Resolver);
  await deployer.deploy(ContractRecovery);
};
