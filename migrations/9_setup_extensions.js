/* globals artifacts */

const { soliditySha3 } = require("web3-utils");

const { setupEtherRouter } = require("../helpers/upgradable-contracts");

const CoinMachine = artifacts.require("./CoinMachine");
const FundingQueue = artifacts.require("./FundingQueue");
const OneTxPayment = artifacts.require("./OneTxPayment");
const VotingReputation = artifacts.require("./VotingReputation");
const TokenSupplier = artifacts.require("./TokenSupplier");

const Resolver = artifacts.require("./Resolver");
const EtherRouter = artifacts.require("./EtherRouter");
const IColonyNetwork = artifacts.require("./IColonyNetwork");
const IMetaColony = artifacts.require("./IMetaColony");

async function addExtension(colonyNetwork, name, implementation) {
  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await IMetaColony.at(metaColonyAddress);

  const NAME_HASH = soliditySha3(name);
  const deployment = await implementation.new();
  const resolver = await Resolver.new();
  // Computed property names! Fancy!
  await setupEtherRouter(name, { [name]: deployment.address }, resolver);
  await metaColony.addExtensionToNetwork(NAME_HASH, resolver.address);
  console.log(`### ${name} extension installed`);
}

// eslint-disable-next-line no-unused-vars
module.exports = async function (deployer, network, accounts) {
  const etherRouterDeployed = await EtherRouter.deployed();
  const colonyNetwork = await IColonyNetwork.at(etherRouterDeployed.address);

  await addExtension(colonyNetwork, "CoinMachine", CoinMachine);
  await addExtension(colonyNetwork, "FundingQueue", FundingQueue);
  await addExtension(colonyNetwork, "OneTxPayment", OneTxPayment);
  await addExtension(colonyNetwork, "VotingReputation", VotingReputation);
  await addExtension(colonyNetwork, "TokenSupplier", TokenSupplier);
};
