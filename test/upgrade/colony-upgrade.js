/* globals artifacts */
const { ethers } = require("ethers");

const { setupColonyVersionResolver } = require("../../helpers/upgradable-contracts");
const { ROOT_ROLE } = require("../../helpers/constants");
const { makeExpenditure, setupRandomColony } = require("../../helpers/test-data-generator");

const IColonyNetwork = artifacts.require("IColonyNetwork");
const IMetaColony = artifacts.require("IMetaColony");
const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");
const ColonyDomains = artifacts.require("ColonyDomains");
const ColonyExpenditure = artifacts.require("ColonyExpenditure");
const ColonyFunding = artifacts.require("ColonyFunding");
const ColonyRewards = artifacts.require("ColonyRewards");
const ColonyRoles = artifacts.require("ColonyRoles");
const ContractRecovery = artifacts.require("ContractRecovery");
const ContractEditing = artifacts.require("ContractEditing");
const ColonyArbitraryTransaction = artifacts.require("ColonyArbitraryTransaction");
const UpdatedColony = artifacts.require("UpdatedColony");
const IUpdatedColony = artifacts.require("IUpdatedColony");

contract("Colony contract upgrade", (accounts) => {
  const ACCOUNT_ONE = accounts[0];

  let colonyNetwork;
  let metaColony;
  let colony;
  let token;

  let updatedColony;
  let updatedColonyVersion;

  before(async function () {
    const etherRouterColonyNetwork = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouterColonyNetwork.address);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);

    ({ colony, token } = await setupRandomColony(colonyNetwork));

    const colonyDomains = await ColonyDomains.new();
    const colonyExpenditure = await ColonyExpenditure.new();
    const colonyFunding = await ColonyFunding.new();
    const colonyRoles = await ColonyRoles.new();
    const colonyRewards = await ColonyRewards.new();
    const contractRecovery = await ContractRecovery.new();
    const colonyArbitraryTransaction = await ColonyArbitraryTransaction.new();

    await makeExpenditure({ colony });
    await makeExpenditure({ colony });

    // Setup new Colony contract version on the Network
    const updatedColonyContract = await UpdatedColony.new();
    const resolver = await Resolver.new();
    await resolver.register("isUpdated()", updatedColonyContract.address);
    await setupColonyVersionResolver(
      updatedColonyContract,
      colonyDomains,
      colonyExpenditure,
      colonyFunding,
      colonyRewards,
      colonyRoles,
      contractRecovery,
      colonyArbitraryTransaction,
      resolver,
    );

    updatedColonyVersion = await updatedColonyContract.version();
    await metaColony.addNetworkColonyVersion(updatedColonyVersion.toNumber(), resolver.address);

    // Check new Colony contract version is registered successfully
    updatedColonyVersion = await colonyNetwork.getCurrentColonyVersion();

    // Upgrade our existing colony
    // 8->9 upgrade, unlike other upgrades to date, not idempotent, so have to delete
    // the local root skill id
    // As this test runs using Ganache, we can't use hardhat_setStorageAt here
    const contractEditing = await ContractEditing.new();
    const colonyAsEtherRouter = await EtherRouter.at(colony.address);
    const colonyResolverAddress = await colonyAsEtherRouter.resolver();
    const colonyResolver = await Resolver.at(colonyResolverAddress);
    await colonyResolver.register("setStorageSlot(uint256,bytes32)", contractEditing.address);
    const editableColony = await ContractEditing.at(colony.address);
    await editableColony.setStorageSlot(36, ethers.constants.HashZero);

    await colony.upgrade(updatedColonyVersion);
    updatedColony = await IUpdatedColony.at(colony.address);
  });

  describe("when upgrading Colony contract", function () {
    it("should have updated the version number", async function () {
      const newVersion = await updatedColony.version();
      assert.equal(newVersion.toNumber(), updatedColonyVersion.toNumber());
    });

    it("should be able to lookup newly registered function on Colony", async function () {
      const y = await updatedColony.isUpdated();
      assert.isTrue(y);
    });

    it("should return correct total number of expenditures", async function () {
      const updatedExpenditureCount = await updatedColony.getExpenditureCount();
      assert.equal(2, updatedExpenditureCount.toNumber());
    });

    it("should return correct permissions", async function () {
      const founder = await colony.hasUserRole(ACCOUNT_ONE, 1, ROOT_ROLE);
      assert.isTrue(founder);
    });

    it("should return correct token address", async function () {
      const tokenAddress = await updatedColony.getToken();
      assert.equal(token.address, tokenAddress);
    });
  });
});
