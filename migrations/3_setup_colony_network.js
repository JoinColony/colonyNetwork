/* globals artifacts */
const contract = require("@truffle/contract");
const { writeFileSync } = require("fs");
const path = require("path");
const { setupUpgradableColonyNetwork } = require("../helpers/upgradable-contracts");

const ColonyNetworkAuthority = artifacts.require("./ColonyNetworkAuthority");
const ContractRecovery = artifacts.require("./ContractRecovery");
const ColonyNetwork = artifacts.require("./ColonyNetwork");
const ColonyNetworkDeployer = artifacts.require("./ColonyNetworkDeployer");
const ColonyNetworkMining = artifacts.require("./ColonyNetworkMining");
const ColonyNetworkAuction = artifacts.require("./ColonyNetworkAuction");
const ColonyNetworkENS = artifacts.require("./ColonyNetworkENS");
const ColonyNetworkExtensions = artifacts.require("./ColonyNetworkExtensions");
const ColonyNetworkSkills = artifacts.require("./ColonyNetworkSkills");
const EtherRouterCreate3 = artifacts.require("./EtherRouterCreate3");
const Resolver = artifacts.require("./Resolver");
const createXABI = require("../lib/createx/artifacts/src/ICreateX.sol/ICreateX.json");

// eslint-disable-next-line no-unused-vars
module.exports = async function (deployer, network, accounts) {
  const colonyNetwork = await ColonyNetwork.deployed();
  const colonyNetworkDeployer = await ColonyNetworkDeployer.deployed();
  const colonyNetworkMining = await ColonyNetworkMining.deployed();
  const colonyNetworkAuction = await ColonyNetworkAuction.deployed();
  const colonyNetworkENS = await ColonyNetworkENS.deployed();
  const colonyNetworkExtensions = await ColonyNetworkExtensions.deployed();
  const colonyNetworkSkills = await ColonyNetworkSkills.deployed();
  const resolver = await Resolver.deployed();
  const contractRecovery = await ContractRecovery.deployed();

  // Deploy EtherRouter through CreateX
  const CreateX = contract({ abi: createXABI.abi });
  CreateX.setProvider(web3.currentProvider);
  const createX = await CreateX.at("0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed");

  // This is a fake instance of an etherRouter, just so we can call encodeABI
  const fakeEtherRouter = await EtherRouterCreate3.at(colonyNetwork.address);
  const setOwnerData = fakeEtherRouter.contract.methods.setOwner(accounts[0]).encodeABI();
  const tx = await createX.methods["deployCreate3AndInit(bytes32,bytes,bytes,(uint256,uint256))"](
    // `${accounts[0]}001212121212121212121212`,
    `0xb77d57f4959eafa0339424b83fcfaf9c15407461005e95d52076387600e2c1e9`,
    EtherRouterCreate3.bytecode,
    setOwnerData,
    [0, 0],
    { from: accounts[0] },
  );

  const etherRouter = await EtherRouterCreate3.at(tx.logs.filter((log) => log.event === "ContractCreation")[0].args.newContract);

  await setupUpgradableColonyNetwork(
    etherRouter,
    resolver,
    colonyNetwork,
    colonyNetworkDeployer,
    colonyNetworkMining,
    colonyNetworkAuction,
    colonyNetworkENS,
    colonyNetworkExtensions,
    colonyNetworkSkills,
    contractRecovery,
  );

  const authorityNetwork = await ColonyNetworkAuthority.new(etherRouter.address);
  await authorityNetwork.setOwner(etherRouter.address);
  await etherRouter.setAuthority(authorityNetwork.address);

  writeFileSync(path.resolve(__dirname, "..", "etherrouter-address.json"), JSON.stringify({ etherRouterAddress: etherRouter.address }), {
    encoding: "utf8",
  });

  console.log(
    "### Colony Network setup with Resolver",
    resolver.address,
    ", EtherRouter",
    etherRouter.address,
    " and Authority ",
    authorityNetwork.address,
  );
};
