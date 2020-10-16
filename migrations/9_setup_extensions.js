/* globals artifacts */

const { soliditySha3 } = require("web3-utils");

const { setupEtherRouter } = require("../helpers/upgradable-contracts");

const CoinMachine = artifacts.require("./CoinMachine");
const FundingQueue = artifacts.require("./FundingQueue");
const OneTxPayment = artifacts.require("./OneTxPayment");
const VotingReputation = artifacts.require("./VotingReputation");

const Resolver = artifacts.require("./Resolver");
const EtherRouter = artifacts.require("./EtherRouter");
const IColonyNetwork = artifacts.require("./IColonyNetwork");
const IMetaColony = artifacts.require("./IMetaColony");

// eslint-disable-next-line no-unused-vars
module.exports = async function (deployer, network, accounts) {
  const etherRouterDeployed = await EtherRouter.deployed();
  const colonyNetwork = await IColonyNetwork.at(etherRouterDeployed.address);
  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await IMetaColony.at(metaColonyAddress);

  const COIN_MACHINE = soliditySha3("CoinMachine");
  const coinMachineImplementation = await CoinMachine.new();
  const coinmachineResolver = await Resolver.new();
  await setupEtherRouter("CoinMachine", { CoinMachine: coinMachineImplementation.address }, coinmachineResolver);
  await metaColony.addExtensionToNetwork(COIN_MACHINE, coinmachineResolver.address);

  console.log("### CoinMachine extension installed");

  const FUNDING_QUEUE = soliditySha3("FundingQueue");
  const fundingQueueImplementation = await FundingQueue.new();
  const fundingQueueResolver = await Resolver.new();
  await setupEtherRouter("FundingQueue", { FundingQueue: fundingQueueImplementation.address }, fundingQueueResolver);
  await metaColony.addExtensionToNetwork(FUNDING_QUEUE, fundingQueueResolver.address);

  console.log("### FundingQueue extension installed");

  const ONE_TX_PAYMENT = soliditySha3("OneTxPayment");
  const oneTxPaymentImplementation = await OneTxPayment.new();
  const oneTxPaymentResolver = await Resolver.new();
  await setupEtherRouter("OneTxPayment", { OneTxPayment: oneTxPaymentImplementation.address }, oneTxPaymentResolver);
  await metaColony.addExtensionToNetwork(ONE_TX_PAYMENT, oneTxPaymentResolver.address);

  console.log("### OneTxPayment extension installed");

  const VOTING_REPUTATION = soliditySha3("VotingReputation");
  const votingReputationImplementation = await VotingReputation.new();
  const votingReputationResolver = await Resolver.new();
  await setupEtherRouter("VotingReputation", { VotingReputation: votingReputationImplementation.address }, votingReputationResolver);
  await metaColony.addExtensionToNetwork(VOTING_REPUTATION, votingReputationResolver.address);

  console.log("### VotingReputation extension installed");
};
