/* globals artifacts */

const { soliditySha3 } = require("web3-utils");

const { setupEtherRouter } = require("../helpers/upgradable-contracts");

const CoinMachine = artifacts.require("./CoinMachine");
const EvaluatedExpenditure = artifacts.require("./EvaluatedExpenditure");
const FundingQueue = artifacts.require("./FundingQueue");
const MultisigPermissions = artifacts.require("./MultisigPermissions");
const OneTxPayment = artifacts.require("./OneTxPayment");
const ReputationBootstrapper = artifacts.require("./ReputationBootstrapper");
const StagedExpenditure = artifacts.require("./StagedExpenditure");
const StakedExpenditure = artifacts.require("./StakedExpenditure");
const StreamingPayments = artifacts.require("./StreamingPayments");
const VotingReputation = artifacts.require("./VotingReputation");
const VotingReputationStaking = artifacts.require("./VotingReputationStaking");
const VotingReputationMisalignedRecovery = artifacts.require("./VotingReputationMisalignedRecovery");
const TokenSupplier = artifacts.require("./TokenSupplier");
const Whitelist = artifacts.require("./Whitelist");

const Resolver = artifacts.require("./Resolver");
const EtherRouter = artifacts.require("./EtherRouter");
const IColonyNetwork = artifacts.require("./IColonyNetwork");
const IMetaColony = artifacts.require("./IMetaColony");

async function addExtension(colonyNetwork, interfaceName, extensionName, implementations) {
  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await IMetaColony.at(metaColonyAddress);

  const NAME_HASH = soliditySha3(extensionName);
  const deployments = await Promise.all(implementations.map((x) => x.new()));
  const resolver = await Resolver.new();

  const deployedImplementations = {};
  for (let idx = 0; idx < implementations.length; idx += 1) {
    deployedImplementations[implementations[idx].contractName] = deployments[idx].address;
  }
  await setupEtherRouter(interfaceName, deployedImplementations, resolver);
  await metaColony.addExtensionToNetwork(NAME_HASH, resolver.address);
  console.log(`### ${extensionName} extension installed`);
}

// eslint-disable-next-line no-unused-vars
module.exports = async function (deployer, network, accounts) {
  const etherRouterDeployed = await EtherRouter.deployed();
  const colonyNetwork = await IColonyNetwork.at(etherRouterDeployed.address);

  await addExtension(colonyNetwork, "CoinMachine", "CoinMachine", [CoinMachine]);
  await addExtension(colonyNetwork, "EvaluatedExpenditure", "EvaluatedExpenditure", [EvaluatedExpenditure]);
  await addExtension(colonyNetwork, "FundingQueue", "FundingQueue", [FundingQueue]);
  await addExtension(colonyNetwork, "MultisigPermissions", "MultisigPermissions", [MultisigPermissions]);
  await addExtension(colonyNetwork, "OneTxPayment", "OneTxPayment", [OneTxPayment]);
  await addExtension(colonyNetwork, "ReputationBootstrapper", "ReputationBootstrapper", [ReputationBootstrapper]);
  await addExtension(colonyNetwork, "StagedExpenditure", "StagedExpenditure", [StagedExpenditure]);
  await addExtension(colonyNetwork, "StakedExpenditure", "StakedExpenditure", [StakedExpenditure]);
  await addExtension(colonyNetwork, "StreamingPayments", "StreamingPayments", [StreamingPayments]);
  await addExtension(colonyNetwork, "TokenSupplier", "TokenSupplier", [TokenSupplier]);
  await addExtension(colonyNetwork, "IVotingReputation", "VotingReputation", [
    VotingReputation,
    VotingReputationStaking,
    VotingReputationMisalignedRecovery,
  ]);
  await addExtension(colonyNetwork, "Whitelist", "Whitelist", [Whitelist]);
};
