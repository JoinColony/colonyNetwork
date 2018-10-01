/* globals artifacts */
import { currentBlockTime, getTokenArgs } from "../helpers/test-helper";
import { setupColonyVersionResolver } from "../helpers/upgradable-contracts";
import { SPECIFICATION_HASH, SPECIFICATION_HASH_UPDATED } from "../helpers/constants";
import { makeTask } from "../helpers/test-data-generator";

const IColonyNetwork = artifacts.require("IColonyNetwork");
const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");
const IColony = artifacts.require("IColony");
const ColonyTask = artifacts.require("ColonyTask");
const ColonyFunding = artifacts.require("ColonyFunding");
const UpdatedColony = artifacts.require("UpdatedColony");
const IUpdatedColony = artifacts.require("IUpdatedColony");
const Authority = artifacts.require("Authority");
const Token = artifacts.require("Token");
const ContractRecovery = artifacts.require("ContractRecovery");

contract("Colony contract upgrade", accounts => {
  const ACCOUNT_ONE = accounts[0];

  let colony;
  let colonyTask;
  let colonyFunding;
  let authority;
  let token;
  let colonyNetwork;
  let updatedColony;
  let updatedColonyVersion;
  let contractRecovery;

  let dueDate;

  before(async () => {
    const etherRouterColonyNetwork = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouterColonyNetwork.address);

    dueDate = await currentBlockTime();

    const tokenArgs = getTokenArgs();
    const colonyToken = await Token.new(...tokenArgs);
    const { logs } = await colonyNetwork.createColony(colonyToken.address);
    const { colonyAddress } = logs[0].args;
    colony = await IColony.at(colonyAddress);
    colonyTask = await ColonyTask.new();
    colonyFunding = await ColonyFunding.new();
    contractRecovery = await ContractRecovery.new();
    const authorityAddress = await colony.authority();
    authority = await Authority.at(authorityAddress);
    const tokenAddress = await colony.getToken();
    token = await Token.at(tokenAddress);

    await makeTask({ colony, dueDate });
    await makeTask({ colony, dueDate: dueDate + 1, hash: SPECIFICATION_HASH_UPDATED });
    // Setup new Colony contract version on the Network
    const updatedColonyContract = await UpdatedColony.new();
    const resolver = await Resolver.new();
    await resolver.register("isUpdated()", updatedColonyContract.address);
    await setupColonyVersionResolver(updatedColonyContract, colonyTask, colonyFunding, contractRecovery, resolver, colonyNetwork);

    // Check new Colony contract version is registered successfully
    updatedColonyVersion = await colonyNetwork.getCurrentColonyVersion();

    // Upgrade our existing colony
    await colony.upgrade(updatedColonyVersion.toNumber());
    updatedColony = await IUpdatedColony.at(colonyAddress);
  });

  describe("when upgrading Colony contract", () => {
    it("should have updated the version number", async () => {
      const newVersion = await updatedColony.version();
      assert.equal(newVersion.toNumber(), updatedColonyVersion.toNumber());
    });

    it("should be able to lookup newly registered function on Colony", async () => {
      const y = await updatedColony.isUpdated();
      assert.isTrue(y);
    });

    it("should return correct total number of tasks", async () => {
      const updatedTaskCount = await updatedColony.getTaskCount();
      assert.equal(2, updatedTaskCount.toNumber());
    });

    it("should return correct tasks", async () => {
      const task1 = await updatedColony.getTask(1);
      assert.equal(task1[0], SPECIFICATION_HASH);
      assert.equal(task1[2].toNumber(), 0);
      assert.equal(task1[3].toNumber(), dueDate);
      assert.equal(task1[4].toNumber(), 0);

      const task2 = await updatedColony.getTask(2);
      assert.equal(task2[0], SPECIFICATION_HASH_UPDATED);
      assert.equal(task2[2].toNumber(), 0);
      assert.equal(task2[3].toNumber(), dueDate + 1);
      assert.equal(task2[4].toNumber(), 0);
    });

    it("should return correct permissions", async () => {
      const owner = await authority.hasUserRole(ACCOUNT_ONE, 0);
      assert.isTrue(owner);
    });

    it("should return correct token address", async () => {
      const tokenAddress = await updatedColony.getToken();
      assert.equal(token.address, tokenAddress);
    });
  });
});
