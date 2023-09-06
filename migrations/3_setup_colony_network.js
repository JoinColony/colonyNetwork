/* globals artifacts */
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
const EtherRouter = artifacts.require("./EtherRouter");
const Resolver = artifacts.require("./Resolver");

// eslint-disable-next-line no-unused-vars
module.exports = async function (deployer) {
  const colonyNetwork = await ColonyNetwork.deployed();
  const colonyNetworkDeployer = await ColonyNetworkDeployer.deployed();
  const colonyNetworkMining = await ColonyNetworkMining.deployed();
  const colonyNetworkAuction = await ColonyNetworkAuction.deployed();
  const colonyNetworkENS = await ColonyNetworkENS.deployed();
  const colonyNetworkExtensions = await ColonyNetworkExtensions.deployed();
  const etherRouter = await EtherRouter.deployed();
  const resolver = await Resolver.deployed();
  const contractRecovery = await ContractRecovery.deployed();

  await setupUpgradableColonyNetwork(
    etherRouter,
    resolver,
    colonyNetwork,
    colonyNetworkDeployer,
    colonyNetworkMining,
    colonyNetworkAuction,
    colonyNetworkENS,
    colonyNetworkExtensions,
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
