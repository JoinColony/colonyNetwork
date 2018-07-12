/* globals artifacts */
/* eslint-disable no-console */

const namehash = require("eth-ens-namehash");

const ENSRegistry = artifacts.require("./ENSRegistry");
const EtherRouter = artifacts.require("./EtherRouter");
const IColonyNetwork = artifacts.require("./IColonyNetwork");

module.exports = deployer => {
  let ensRegistry;
  let colonyNetwork;
  const rootNode = namehash.hash("joincolony.eth");

  deployer
    .then(() => EtherRouter.deployed())
    .then(instance => {
      colonyNetwork = IColonyNetwork.at(instance.address);
      return ENSRegistry.deployed();
    })
    .then(instance => {
      ensRegistry = instance;
    })
    .then(() => ensRegistry.setOwner(rootNode, colonyNetwork.address))
    .then(() => colonyNetwork.setupRegistrar(ensRegistry.address, rootNode))
    .then(() => {
      console.log("### ENSRegistry set up at", ensRegistry.address, "and linked to ColonyNetwork");
    })
    .catch(err => {
      console.log("### Error occurred ", err);
    });
};
