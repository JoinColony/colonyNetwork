/* globals artifacts */
/* eslint-disable prefer-arrow-callback */
import { currentBlockTime, getTokenArgs } from "../helpers/test-helper";
import { setupColonyVersionResolver } from "../helpers/upgradable-contracts";
import { ROOT_ROLE, SPECIFICATION_HASH, SPECIFICATION_HASH_UPDATED } from "../helpers/constants";
import { makeTask } from "../helpers/test-data-generator";

const IColonyNetwork = artifacts.require("IColonyNetwork");
const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");
const IColony = artifacts.require("IColony");
const IMetaColony = artifacts.require("IMetaColony");
const ColonyTask = artifacts.require("ColonyTask");
const ColonyPayment = artifacts.require("ColonyPayment");
const ColonyFunding = artifacts.require("ColonyFunding");
const UpdatedColony = artifacts.require("UpdatedColony");
const IUpdatedColony = artifacts.require("IUpdatedColony");
const Token = artifacts.require("Token");
const ContractRecovery = artifacts.require("ContractRecovery");

contract("Colony contract upgrade", accounts => {
  const ACCOUNT_ONE = accounts[0];

  let metaColony;
  let colony;
  let colonyTask;
  let colonyPayment;
  let colonyFunding;
  let token;
  let colonyNetwork;
  let updatedColony;
  let updatedColonyVersion;
  let contractRecovery;

  let dueDate;

  before(async function() {
    const etherRouterColonyNetwork = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouterColonyNetwork.address);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);

    dueDate = await currentBlockTime();

    const tokenArgs = getTokenArgs();
    const colonyToken = await Token.new(...tokenArgs);
    await colonyToken.unlock();
    const { logs } = await colonyNetwork.createColony(colonyToken.address);
    const { colonyAddress } = logs[0].args;
    colony = await IColony.at(colonyAddress);
    colonyTask = await ColonyTask.new();
    colonyPayment = await ColonyPayment.new();
    colonyFunding = await ColonyFunding.new();
    contractRecovery = await ContractRecovery.new();
    const tokenAddress = await colony.getToken();
    token = await Token.at(tokenAddress);

    await makeTask({ colony, dueDate });
    await makeTask({ colony, dueDate: dueDate + 1, hash: SPECIFICATION_HASH_UPDATED });
    // Setup new Colony contract version on the Network
    const updatedColonyContract = await UpdatedColony.new();
    const resolver = await Resolver.new();
    await resolver.register("isUpdated()", updatedColonyContract.address);
    await setupColonyVersionResolver(updatedColonyContract, colonyTask, colonyPayment, colonyFunding, contractRecovery, resolver);

    updatedColonyVersion = await updatedColonyContract.version();
    await metaColony.addNetworkColonyVersion(updatedColonyVersion.toNumber(), resolver.address);

    // Check new Colony contract version is registered successfully
    updatedColonyVersion = await colonyNetwork.getCurrentColonyVersion();

    // Upgrade our existing colony
    await colony.upgrade(updatedColonyVersion);
    updatedColony = await IUpdatedColony.at(colonyAddress);
  });

  describe("when upgrading Colony contract", function() {
    it("should have updated the version number", async function() {
      const newVersion = await updatedColony.version();
      assert.equal(newVersion.toNumber(), updatedColonyVersion.toNumber());
    });

    it("should be able to lookup newly registered function on Colony", async function() {
      const y = await updatedColony.isUpdated();
      assert.isTrue(y);
    });

    it("should return correct total number of tasks", async function() {
      const updatedTaskCount = await updatedColony.getTaskCount();
      assert.equal(2, updatedTaskCount.toNumber());
    });

    it("should return correct tasks after Task struct is extended", async function() {
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

    it("should return correct permissions", async function() {
      const founder = await colony.hasUserRole(ACCOUNT_ONE, 1, ROOT_ROLE);
      assert.isTrue(founder);
    });

    it("should return correct token address", async function() {
      const tokenAddress = await updatedColony.getToken();
      assert.equal(token.address, tokenAddress);
    });
  });
});
