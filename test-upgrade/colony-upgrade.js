/* globals artifacts */
const { currentBlockTime, getColonyEditable } = require("../helpers/test-helper");
const { setupColonyVersionResolver } = require("../helpers/upgradable-contracts");
const { ROOT_ROLE, SPECIFICATION_HASH, SPECIFICATION_HASH_UPDATED } = require("../helpers/constants");
const { makeTask, setupRandomColony } = require("../helpers/test-data-generator");

const IColonyNetwork = artifacts.require("IColonyNetwork");
const IMetaColony = artifacts.require("IMetaColony");
const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");
const ColonyDomains = artifacts.require("ColonyDomains");
const ColonyExpenditure = artifacts.require("ColonyExpenditure");
const ColonyFunding = artifacts.require("ColonyFunding");
const ColonyPayment = artifacts.require("ColonyPayment");
const ColonyRewards = artifacts.require("ColonyRewards");
const ColonyRoles = artifacts.require("ColonyRoles");
const ColonyTask = artifacts.require("ColonyTask");
const ContractRecovery = artifacts.require("ContractRecovery");
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

  let dueDate;

  before(async function () {
    const etherRouterColonyNetwork = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouterColonyNetwork.address);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);

    ({ colony, token } = await setupRandomColony(colonyNetwork));

    const colonyDomains = await ColonyDomains.new();
    const colonyExpenditure = await ColonyExpenditure.new();
    const colonyFunding = await ColonyFunding.new();
    const colonyPayment = await ColonyPayment.new();
    const colonyRoles = await ColonyRoles.new();
    const colonyRewards = await ColonyRewards.new();
    const colonyTask = await ColonyTask.new();
    const contractRecovery = await ContractRecovery.new();
    const colonyArbitraryTransaction = await ColonyArbitraryTransaction.new();

    dueDate = await currentBlockTime();
    await makeTask({ colony, dueDate });
    await makeTask({ colony, dueDate: dueDate + 1, hash: SPECIFICATION_HASH_UPDATED });

    // Setup new Colony contract version on the Network
    const updatedColonyContract = await UpdatedColony.new();
    const resolver = await Resolver.new();
    await resolver.register("isUpdated()", updatedColonyContract.address);
    await setupColonyVersionResolver(
      updatedColonyContract,
      colonyDomains,
      colonyExpenditure,
      colonyFunding,
      colonyPayment,
      colonyRewards,
      colonyRoles,
      colonyTask,
      contractRecovery,
      colonyArbitraryTransaction,
      resolver
    );

    updatedColonyVersion = await updatedColonyContract.version();
    await metaColony.addNetworkColonyVersion(updatedColonyVersion.toNumber(), resolver.address);

    // Check new Colony contract version is registered successfully
    updatedColonyVersion = await colonyNetwork.getCurrentColonyVersion();

    // Upgrade our existing colony
    // 8->9 upgrade, unlike other upgrades to date, not idempotent, so have to delete
    // the local root skill id
    const editableColony = await getColonyEditable(colony, colonyNetwork);
    await editableColony.setStorageSlot(36, "0x0000000000000000000000000000000000000000000000000000000000000000");

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

    it("should return correct total number of tasks", async function () {
      const updatedTaskCount = await updatedColony.getTaskCount();
      assert.equal(2, updatedTaskCount.toNumber());
    });

    it("should return correct tasks after Task struct is extended", async function () {
      const task1 = await updatedColony.getTask(1);
      assert.equal(task1.specificationHash, SPECIFICATION_HASH);
      assert.equal(task1.status.toNumber(), 0);
      assert.equal(task1.dueDate.toNumber(), dueDate);
      assert.equal(task1.domainId.toNumber(), 1);

      const task2 = await updatedColony.getTask(2);
      assert.equal(task2.specificationHash, SPECIFICATION_HASH_UPDATED);
      assert.equal(task2.status.toNumber(), 0);
      assert.equal(task2.dueDate.toNumber(), dueDate + 1);
      assert.equal(task2.domainId.toNumber(), 1);
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
