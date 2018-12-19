/* globals artifacts */
/* eslint-disable no-console */

const namehash = require("eth-ens-namehash");

const ENSRegistry = artifacts.require("./ENSRegistry");
const EtherRouter = artifacts.require("./EtherRouter");
const IColonyNetwork = artifacts.require("./IColonyNetwork");

// eslint-disable-next-line no-unused-vars
module.exports = async function(deployer) {
  const etherRouterDeployed = await EtherRouter.deployed();
  const colonyNetwork = await IColonyNetwork.at(etherRouterDeployed.address);

  const ensRegistry = await ENSRegistry.deployed();
  const rootNode = namehash.hash("joincolony.eth");
  await ensRegistry.setOwner(rootNode, colonyNetwork.address);
  await colonyNetwork.setupRegistrar(ensRegistry.address, rootNode);

  console.log("### ENSRegistry set up at", ensRegistry.address, "and linked to ColonyNetwork");
};
