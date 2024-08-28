/* globals artifacts, hre */

const EtherRouter = artifacts.require("EtherRouter");
const EtherRouterCreate3 = artifacts.require("EtherRouterCreate3");
const Resolver = artifacts.require("Resolver");

const truffleContract = require("@truffle/contract");
const createXABI = require("../lib/createx/artifacts/src/ICreateX.sol/ICreateX.json");

const { setupEtherRouter } = require("../helpers/upgradable-contracts");
const { CREATEX_ADDRESS } = require("../helpers/constants");

const { setupProxyColonyNetwork } = require("../helpers/upgradable-contracts");

const ProxyColonyNetwork = artifacts.require("ProxyColonyNetwork");
const ProxyColony = artifacts.require("ProxyColony");

module.exports = async () => {
  const accounts = await web3.eth.getAccounts();

  await hre.run("ensureCreateXDeployed");
  const CreateX = truffleContract({ abi: createXABI.abi });
  CreateX.setProvider(web3.currentProvider);
  const createX = await CreateX.at(CREATEX_ADDRESS);

  // This is a fake instance of an etherRouter, just so we can call encodeABs
  const fakeEtherRouter = await EtherRouterCreate3.at(CREATEX_ADDRESS);
  const setOwnerData = fakeEtherRouter.contract.methods.setOwner(accounts[0]).encodeABI();

  const tx = await createX.methods["deployCreate3AndInit(bytes32,bytes,bytes,(uint256,uint256))"](
    `0xb77d57f4959eafa0339424b83fcfaf9c15407461005e95d52076387600e2c1e9`,
    EtherRouterCreate3.bytecode,
    setOwnerData,
    [0, 0],
    { from: accounts[0] },
  );

  const etherRouter = await EtherRouter.at(tx.logs.filter((log) => log.event === "ContractCreation")[0].args.newContract);

  const proxyColonyNetworkImplementation = await ProxyColonyNetwork.new();
  ProxyColonyNetwork.setAsDeployed(proxyColonyNetworkImplementation);

  let resolver = await Resolver.new();

  await Resolver.setAsDeployed(resolver);

  await setupProxyColonyNetwork(etherRouter, proxyColonyNetworkImplementation, resolver);

  // Set up the resolver for shell colonies and register it with the network

  resolver = await Resolver.new();
  const proxyColonyImplementation = await ProxyColony.new();

  await setupEtherRouter("bridging", "ProxyColony", { ProxyColony: proxyColonyImplementation.address }, resolver);
  const proxyColonyNetwork = await ProxyColonyNetwork.at(etherRouter.address);

  await proxyColonyNetwork.setProxyColonyResolverAddress(resolver.address);
};
