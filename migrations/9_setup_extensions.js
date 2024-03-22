/* globals artifacts */

const { soliditySha3 } = require("web3-utils");

const { setupEtherRouter } = require("../helpers/upgradable-contracts");

const CoinMachine = artifacts.require("./CoinMachine");
const EvaluatedExpenditure = artifacts.require("./EvaluatedExpenditure");
const StakedExpenditure = artifacts.require("./StakedExpenditure");
const FundingQueue = artifacts.require("./FundingQueue");
const OneTxPayment = artifacts.require("./OneTxPayment");
const ReputationBootstrapper = artifacts.require("./ReputationBootstrapper");
const StreamingPayments = artifacts.require("./StreamingPayments");
const VotingReputation = artifacts.require("./VotingReputation");
const VotingReputationStaking = artifacts.require("./VotingReputationStaking");
const VotingReputationMisalignedRecovery = artifacts.require("./VotingReputationMisalignedRecovery");
const TokenSupplier = artifacts.require("./TokenSupplier");
const Whitelist = artifacts.require("./Whitelist");
const StagedExpenditure = artifacts.require("./StagedExpenditure");

const Resolver = artifacts.require("./Resolver");
const EtherRouter = artifacts.require("./EtherRouter");
const IColonyNetwork = artifacts.require("./IColonyNetwork");
const IMetaColony = artifacts.require("./IMetaColony");

async function addExtension(colonyNetwork, contractDir, interfaceName, extensionName, implementations) {
  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await IMetaColony.at(metaColonyAddress);

  const NAME_HASH = soliditySha3(extensionName);
  const deployments = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const implementation of implementations) {
    const deployment = await implementation.new();
    deployments.push(deployment);
  }

  const resolver = await Resolver.new();

  const deployedImplementations = {};
  for (let idx = 0; idx < implementations.length; idx += 1) {
    deployedImplementations[implementations[idx].contractName] = deployments[idx].address;
  }
  await setupEtherRouter(contractDir, interfaceName, deployedImplementations, resolver);
  await metaColony.addExtensionToNetwork(NAME_HASH, resolver.address);
  console.log(`### ${extensionName} extension installed`);
}

// eslint-disable-next-line no-unused-vars
module.exports = async function (deployer, network, accounts) {
  const etherRouterDeployed = await EtherRouter.deployed();
  const colonyNetwork = await IColonyNetwork.at(etherRouterDeployed.address);

  await addExtension(colonyNetwork, "extensions", "CoinMachine", "CoinMachine", [CoinMachine]);
  await addExtension(colonyNetwork, "extensions", "EvaluatedExpenditure", "EvaluatedExpenditure", [EvaluatedExpenditure]);
  await addExtension(colonyNetwork, "extensions", "FundingQueue", "FundingQueue", [FundingQueue]);
  await addExtension(colonyNetwork, "extensions", "OneTxPayment", "OneTxPayment", [OneTxPayment]);
  await addExtension(colonyNetwork, "extensions", "ReputationBootstrapper", "ReputationBootstrapper", [ReputationBootstrapper]);
  await addExtension(colonyNetwork, "extensions", "StakedExpenditure", "StakedExpenditure", [StakedExpenditure]);
  await addExtension(colonyNetwork, "extensions", "StreamingPayments", "StreamingPayments", [StreamingPayments]);
  await addExtension(colonyNetwork, "extensions", "TokenSupplier", "TokenSupplier", [TokenSupplier]);
  await addExtension(colonyNetwork, "extensions/votingReputation", "IVotingReputation", "VotingReputation", [
    VotingReputation,
    VotingReputationStaking,
    VotingReputationMisalignedRecovery,
  ]);
  await addExtension(colonyNetwork, "extensions", "Whitelist", "Whitelist", [Whitelist]);
  await addExtension(colonyNetwork, "extensions", "StagedExpenditure", "StagedExpenditure", [StagedExpenditure]);
};
