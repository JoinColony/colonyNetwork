/* globals artifacts */
/* eslint-disable no-console */

const namehash = require("eth-ens-namehash");
const web3Utils = require("web3-utils");

const ENSRegistry = artifacts.require("./ENSRegistry");
const EtherRouter = artifacts.require("./EtherRouter");
const IColonyNetwork = artifacts.require("./IColonyNetwork");

// eslint-disable-next-line no-unused-vars
module.exports = async function(deployer, network, accounts) {
  const etherRouterDeployed = await EtherRouter.deployed();
  const colonyNetwork = await IColonyNetwork.at(etherRouterDeployed.address);

  const ensRegistry = await ENSRegistry.deployed();
  const rootNode = namehash.hash("joincolony.eth");

  const USER_HASH = await web3Utils.soliditySha3("user");
  const COLONY_HASH = await web3Utils.soliditySha3("colony");

  await colonyNetwork.setupRegistrar(ensRegistry.address, rootNode);

  await ensRegistry.setOwner(rootNode, accounts[0]);

  await ensRegistry.setSubnodeOwner(rootNode, USER_HASH, etherRouterDeployed.address);
  await ensRegistry.setSubnodeOwner(rootNode, COLONY_HASH, etherRouterDeployed.address);

  console.log("### ENSRegistry set up at", ensRegistry.address, "and linked to ColonyNetwork");
};
