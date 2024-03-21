/* globals artifacts */

const { setupUpgradableTokenLocking } = require("../helpers/upgradable-contracts");

const TokenLocking = artifacts.require("./TokenLocking");
const IColonyNetwork = artifacts.require("./IColonyNetwork");
const EtherRouter = artifacts.require("./EtherRouter");
const Resolver = artifacts.require("./Resolver");

// eslint-disable-next-line no-unused-vars
module.exports = async function (deployer) {
  const resolver = await Resolver.new();
  const etherRouter = await EtherRouter.new();
  const tokenLockingContract = await TokenLocking.new();
  await setupUpgradableTokenLocking(etherRouter, resolver, tokenLockingContract);

  const cnAddress = require("../etherrouter-address.json").etherRouterAddress; // eslint-disable-line import/no-unresolved
  const etherRouterDeployed = await EtherRouter.at(cnAddress);
  const colonyNetwork = await IColonyNetwork.at(etherRouterDeployed.address);
  await colonyNetwork.setTokenLocking(etherRouter.address);

  const tokenLocking = await TokenLocking.at(etherRouter.address);
  await tokenLocking.setColonyNetwork(colonyNetwork.address);

  console.log("### TokenLocking setup at ", tokenLocking.address, "with Resolver", resolver.address);
};
