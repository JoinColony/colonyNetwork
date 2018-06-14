/* globals artifacts */

import { toBN } from "web3-utils";

import {
  MANAGER,
  EVALUATOR,
  WORKER,
  OTHER,
  MANAGER_ROLE,
  EVALUATOR_ROLE,
  WORKER_ROLE,
  SPECIFICATION_HASH,
  SPECIFICATION_HASH_UPDATED,
  DELIVERABLE_HASH,
  INITIAL_FUNDING,
  SECONDS_PER_DAY,
  MANAGER_RATING,
  WORKER_RATING,
  RATING_1_SALT,
  RATING_2_SALT,
  RATING_1_SECRET,
  RATING_2_SECRET
} from "../helpers/constants";
import {
  getTokenArgs,
  web3GetBalance,
  checkErrorRevert,
  expectEvent,
  currentBlockTime,
  createSignatures,
  createSignaturesTrezor
} from "../helpers/test-helper";
import { fundColonyWithTokens, setupRatedTask, setupAssignedTask, setupFundedTask } from "../helpers/test-data-generator";

import { setupColonyVersionResolver } from "../helpers/upgradable-contracts";

const Colony = artifacts.require("Colony");
const Resolver = artifacts.require("Resolver");
const EtherRouter = artifacts.require("EtherRouter");
const IColony = artifacts.require("IColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const Token = artifacts.require("Token");
const Authority = artifacts.require("Authority");
const ColonyFunding = artifacts.require("ColonyFunding");
const ColonyTask = artifacts.require("ColonyTask");
const ReputationMiningCycle = artifacts.require("ReputationMiningCycle");

contract("Colony", addresses => {
  let colony;
  let token;
  let otherToken;
  let authority;
  let colonyNetwork;

  before(async () => {
    const resolverColonyNetworkDeployed = await Resolver.deployed();
    const colonyTemplate = await Colony.new();
    const colonyFunding = await ColonyFunding.new();
    const colonyTask = await ColonyTask.new();
    const resolver = await Resolver.new();
    const etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolverColonyNetworkDeployed.address);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    await setupColonyVersionResolver(colonyTemplate, colonyTask, colonyFunding, resolver, colonyNetwork);

    const clnyToken = await Token.new("Colony Network Token", "CLNY", 18);
    await colonyNetwork.createMetaColony(clnyToken.address);

    await colonyNetwork.startNextCycle();
  });

  beforeEach(async () => {
    const tokenArgs = getTokenArgs();
    token = await Token.new(...tokenArgs);
    const { logs } = await colonyNetwork.createColony(token.address);
    const { colonyAddress } = logs[0].args;
    await token.setOwner(colonyAddress);
    colony = await IColony.at(colonyAddress);
    const authorityAddress = await colony.authority.call();
    authority = await Authority.at(authorityAddress);
    const otherTokenArgs = getTokenArgs();
    otherToken = await Token.new(...otherTokenArgs);
  });

  describe("when initialised", () => {
    it("should accept ether", async () => {
      await colony.send(1);
      const colonyBalance = await web3GetBalance(colony.address);
      assert.equal(colonyBalance.toNumber(), 1);
    });

    it("should take colony network as an owner", async () => {
      const owner = await colony.owner.call();
      assert.equal(owner, colonyNetwork.address);
    });

    it("should return zero task count", async () => {
      const taskCount = await colony.getTaskCount.call();
      assert.equal(taskCount, 0);
    });

    it("should return zero for taskChangeNonce", async () => {
      const taskChangeNonce = await colony.getTaskChangeNonce.call(1);
      assert.equal(taskChangeNonce, 0);
    });

    it("should fail if a non-admin tries to mint tokens", async () => {
      await checkErrorRevert(colony.mintTokens(100, { from: OTHER }));
    });

    it("should not allow reinitialisation", async () => {
      await checkErrorRevert(colony.initialiseColony(0x0));
    });

    it("should correctly generate a rating secret", async () => {
      const ratingSecret1 = await colony.generateSecret.call(RATING_1_SALT, MANAGER_RATING);
      assert.equal(ratingSecret1, RATING_1_SECRET);
      const ratingSecret2 = await colony.generateSecret.call(RATING_2_SALT, WORKER_RATING);
      assert.equal(ratingSecret2, RATING_2_SECRET);
    });
  });

  describe("when working with permissions", () => {
    it("should be able to add a colony owner", async () => {
      await authority.setUserRole(OTHER, 0, true);
      const owner = await authority.hasUserRole.call(OTHER, 0);
      assert.isTrue(owner);
    });

    it("should be able to add a colony admin", async () => {
      await authority.setUserRole(OTHER, 1, true);
      const admin = await authority.hasUserRole.call(OTHER, 1);
      assert.isTrue(admin);
    });

    it("should be able to remove a colony owner", async () => {
      await authority.setUserRole(OTHER, 0, true);
      await authority.setUserRole(OTHER, 0, false);
      const owner = await authority.hasUserRole.call(OTHER, 0);
      assert.isFalse(owner);
    });

    it("should be able to remove a colony admin", async () => {
      await authority.setUserRole(OTHER, 1, true);
      await authority.setUserRole(OTHER, 1, false);
      const admin = await authority.hasUserRole.call(OTHER, 1);
      assert.isFalse(admin);
    });
  });

  describe("when creating tasks", () => {
    it("should allow admins to make task", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      const task = await colony.getTask.call(1);
      assert.equal(task[0], SPECIFICATION_HASH);
      assert.equal(task[1], "0x0000000000000000000000000000000000000000000000000000000000000000");
      assert.isFalse(task[2]);
      assert.isFalse(task[3]);
      assert.equal(task[4].toNumber(), 0);
      assert.equal(task[5].toNumber(), 0);
    });

    it("should fail if a non-admin user tries to make a task", async () => {
      await checkErrorRevert(colony.makeTask(SPECIFICATION_HASH, 1, { from: OTHER }));
      const taskCount = await colony.getTaskCount.call();
      assert.equal(taskCount.toNumber(), 0);
    });

    it("should set the task manager as the creator", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      const taskCount = await colony.getTaskCount.call();
      assert.equal(taskCount.toNumber(), 1);
      const taskManager = await colony.getTaskRole.call(1, MANAGER_ROLE);
      assert.equal(taskManager[0], MANAGER);
    });

    it("should return the correct number of tasks", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.makeTask(SPECIFICATION_HASH, 1);
      const taskCount = await colony.getTaskCount.call();

      assert.equal(taskCount.toNumber(), 5);
    });

    it("should set the task domain correctly", async () => {
      const skillCount = await colonyNetwork.getSkillCount.call();
      await colony.addDomain(skillCount.toNumber());
      await colony.makeTask(SPECIFICATION_HASH, 2);
      const task = await colony.getTask.call(1);
      assert.equal(task[8].toNumber(), 2);
    });

    it("should log a TaskAdded event", async () => {
      await expectEvent(colony.makeTask(SPECIFICATION_HASH, 1), "TaskAdded");
    });
  });

  describe("when bootstrapping the colony", () => {
    const INITIAL_REPUTATIONS = [toBN(5 * 1e18).toString(), toBN(4 * 1e18).toString(), toBN(3 * 1e18).toString(), toBN(2 * 1e18).toString()];
    const INITIAL_ADDRESSES = addresses.slice(0, 4);

    it("should assign reputation correctly when bootstrapping the colony", async () => {
      const skillCount = await colonyNetwork.getSkillCount.call();

      await colony.mintTokens(toBN(14 * 1e18).toString());
      await colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS);
      const inactiveReputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
      const inactiveReputationMiningCycle = ReputationMiningCycle.at(inactiveReputationMiningCycleAddress);
      const numberOfReputationLogs = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      assert.equal(numberOfReputationLogs.toNumber(), INITIAL_ADDRESSES.length);
      const updateLog = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(0);
      assert.equal(updateLog[0], INITIAL_ADDRESSES[0]);
      assert.equal(updateLog[1].toString(), INITIAL_REPUTATIONS[0]);
      assert.equal(updateLog[2].toString(), skillCount.toNumber());
    });

    it("should assign tokens correctly when bootstrapping the colony", async () => {
      await colony.mintTokens(toBN(14 * 1e18).toString());
      await colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS);

      const balance = await token.balanceOf(INITIAL_ADDRESSES[0]);
      assert.equal(balance.toString(), INITIAL_REPUTATIONS[0]);
    });

    it("should be able to bootstrap colony more than once", async () => {
      const amount = toBN(10 * 1e18).toString();
      await colony.mintTokens(amount);
      await colony.bootstrapColony([INITIAL_ADDRESSES[0]], [INITIAL_REPUTATIONS[0]]);
      await colony.bootstrapColony([INITIAL_ADDRESSES[0]], [INITIAL_REPUTATIONS[0]]);

      const balance = await token.balanceOf(INITIAL_ADDRESSES[0]);
      assert.equal(balance.toString(), amount);
    });

    it("should throw if length of inputs is not equal", async () => {
      await colony.mintTokens(toBN(14 * 1e18).toString());
      await checkErrorRevert(colony.bootstrapColony([INITIAL_ADDRESSES[0]], INITIAL_REPUTATIONS));
      await checkErrorRevert(colony.bootstrapColony(INITIAL_ADDRESSES, [INITIAL_REPUTATIONS[0]]));
    });

    it("should not allow negative number", async () => {
      await colony.mintTokens(toBN(14 * 1e18).toString());
      await checkErrorRevert(
        colony.bootstrapColony(
          [INITIAL_ADDRESSES[0]],
          [
            toBN(5 * 1e18)
              .neg()
              .toString()
          ]
        )
      );
    });

    it("should throw if there is not enough funds to send", async () => {
      await colony.mintTokens(toBN(10 * 1e18).toString());
      await checkErrorRevert(colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS));

      const balance = await token.balanceOf(INITIAL_ADDRESSES[0]);
      assert.equal(balance.toString(), "0");
    });

    it("should not allow non-creator to bootstrap reputation", async () => {
      await colony.mintTokens(toBN(14 * 1e18).toString());
      await checkErrorRevert(
        colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS, {
          from: addresses[1]
        })
      );
    });

    it("should not allow bootstrapping if colony is not in bootstrap state", async () => {
      await colony.mintTokens(toBN(14 * 1e18).toString());
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await checkErrorRevert(colony.bootstrapColony(INITIAL_REPUTATIONS, INITIAL_ADDRESSES));
    });
  });

  describe("when updating tasks", () => {
    it("should allow the worker and evaluator roles to be assigned", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, EVALUATOR_ROLE, EVALUATOR);
      const evaluator = await colony.getTaskRole.call(1, EVALUATOR_ROLE);
      assert.equal(evaluator[0], EVALUATOR);

      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      const worker = await colony.getTaskRole.call(1, WORKER_ROLE);
      assert.equal(worker[0], WORKER);
    });

    it("should not allow the worker or evaluator roles to be assigned by an address that is not the manager", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await checkErrorRevert(colony.setTaskRoleUser(1, EVALUATOR_ROLE, EVALUATOR, { from: OTHER }));
      const evaluator = await colony.getTaskRole.call(1, EVALUATOR_ROLE);
      assert.equal(evaluator[0], "0x0000000000000000000000000000000000000000");

      await checkErrorRevert(colony.setTaskRoleUser(1, WORKER_ROLE, WORKER, { from: OTHER }));
      const worker = await colony.getTaskRole.call(1, WORKER_ROLE);
      assert.equal(worker[0], "0x0000000000000000000000000000000000000000");
    });

    it("should correctly increment `taskChangeNonce` for multiple updates on a single task", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);

      // Change the task brief
      let txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      const signers = [MANAGER, WORKER];
      let sigs = await createSignatures(colony, 1, signers, 0, txData);
      await colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, [0, 0], 0, txData);

      let taskChangeNonce = await colony.getTaskChangeNonce.call(1);
      assert.equal(taskChangeNonce, 1);

      // Change the due date
      const dueDate = await currentBlockTime();
      txData = await colony.contract.setTaskDueDate.getData(1, dueDate);
      sigs = await createSignatures(colony, 1, signers, 0, txData);
      await colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, [0, 0], 0, txData);

      taskChangeNonce = await colony.getTaskChangeNonce.call(1);
      assert.equal(taskChangeNonce, 2);
    });

    it("should correctly increment `taskChangeNonce` for multiple updates on multiple tasks", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);

      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(2, WORKER_ROLE, WORKER);

      const signers = [MANAGER, WORKER];

      // Change the task1 brief
      const txData1 = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      const sigs1 = await createSignatures(colony, 1, signers, 0, txData1);

      // Change the task2 brief
      const txData2 = await colony.contract.setTaskBrief.getData(2, SPECIFICATION_HASH_UPDATED);
      const sigs2 = await createSignatures(colony, 2, signers, 0, txData2);

      // Execute the above 2 changes
      await colony.executeTaskChange(sigs1.sigV, sigs1.sigR, sigs1.sigS, [0, 0], 0, txData1);
      let taskChangeNonce = await colony.getTaskChangeNonce.call(1);
      assert.equal(taskChangeNonce, 1);
      await colony.executeTaskChange(sigs2.sigV, sigs2.sigR, sigs2.sigS, [0, 0], 0, txData2);
      taskChangeNonce = await colony.getTaskChangeNonce.call(2);
      assert.equal(taskChangeNonce, 1);

      // Change the task2 due date
      const dueDate = await currentBlockTime();
      const txData3 = await colony.contract.setTaskDueDate.getData(2, dueDate);
      const sigs3 = await createSignatures(colony, 2, signers, 0, txData3);

      await colony.executeTaskChange(sigs3.sigV, sigs3.sigR, sigs3.sigS, [0, 0], 0, txData3);
      taskChangeNonce = await colony.getTaskChangeNonce.call(2);
      assert.equal(taskChangeNonce, 2);
    });

    it("should allow update of task brief signed by manager only when worker has not been assigned", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      const sigs = await createSignatures(colony, 1, [MANAGER], 0, txData);
      await colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, [0], 0, txData);
      const task = await colony.getTask.call(1);
      assert.equal(task[0], SPECIFICATION_HASH_UPDATED);
    });

    it("should allow update of task brief signed by manager and worker", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      const signers = [MANAGER, WORKER];
      const sigs = await createSignatures(colony, 1, signers, 0, txData);
      await colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, [0, 0], 0, txData);
      const task = await colony.getTask.call(1);
      assert.equal(task[0], SPECIFICATION_HASH_UPDATED);
    });

    it("should allow update of task brief signed by manager and worker using Trezor-style signatures", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      const signers = [MANAGER, WORKER];
      const sigs = await createSignaturesTrezor(colony, 1, signers, 0, txData);
      await colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, [1, 1], 0, txData);
      const task = await colony.getTask.call(1);
      assert.equal(task[0], SPECIFICATION_HASH_UPDATED);
    });

    it("should allow update of task brief signed by manager and worker if one uses Trezor-style signatures and the other does not", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      const sigs = await createSignatures(colony, 1, [MANAGER], 0, txData);
      const trezorSigs = await createSignaturesTrezor(colony, 1, [WORKER], 0, txData);
      await colony.executeTaskChange(
        [sigs.sigV[0], trezorSigs.sigV[0]],
        [sigs.sigR[0], trezorSigs.sigR[0]],
        [sigs.sigS[0], trezorSigs.sigS[0]],
        [0, 1],
        0,
        txData
      );
      const task = await colony.getTask.call(1);
      assert.equal(task[0], SPECIFICATION_HASH_UPDATED);
    });

    it("should not allow update of task brief signed by manager twice, with two different signature styles", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      const sigs = await createSignatures(colony, 1, [MANAGER], 0, txData);
      const trezorSigs = await createSignaturesTrezor(colony, 1, [MANAGER], 0, txData);
      await checkErrorRevert(
        colony.executeTaskChange(
          [sigs.sigV[0], trezorSigs.sigV[0]],
          [sigs.sigR[0], trezorSigs.sigR[0]],
          [sigs.sigS[0], trezorSigs.sigS[0]],
          [0, 1],
          0,
          txData
        )
      );
      const task = await colony.getTask.call(1);
      assert.equal(task[0], SPECIFICATION_HASH);
    });

    it("should allow update of task due date signed by manager and worker", async () => {
      const dueDate = await currentBlockTime();

      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      const txData = await colony.contract.setTaskDueDate.getData(1, dueDate);
      const signers = [MANAGER, WORKER];
      const sigs = await createSignatures(colony, 1, signers, 0, txData);
      await colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, [0, 0], 0, txData);

      const task = await colony.getTask.call(1);
      assert.equal(task[4], dueDate);
    });

    it("should fail if a non-colony call is made to the task update functions", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await checkErrorRevert(colony.setTaskBrief(1, SPECIFICATION_HASH_UPDATED, { from: OTHER }));
    });

    it("should fail update of task brief signed by a non-registered role", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, EVALUATOR_ROLE, EVALUATOR);

      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      const signers = [MANAGER, OTHER];
      const sigs = await createSignatures(colony, 1, signers, 0, txData);

      await checkErrorRevert(colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, [0, 0], 0, txData));
    });

    it("should fail update of task brief signed by manager and evaluator", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, EVALUATOR_ROLE, EVALUATOR);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);

      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      const signers = [MANAGER, EVALUATOR];
      const sigs = await createSignatures(colony, 1, signers, 0, txData);

      await checkErrorRevert(colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, [0, 0], 0, txData));
    });

    it("should fail to execute task change for a non-registered function signature", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      const txData = await colony.contract.getTaskRole.getData(1, 0);
      const signers = [MANAGER, EVALUATOR];
      const sigs = await createSignatures(colony, 1, signers, 0, txData);

      await checkErrorRevert(colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, [0, 0], 0, txData));
    });

    it("should fail to execute change of task brief, using an invalid task id", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      const txData = await colony.contract.setTaskBrief.getData(10, SPECIFICATION_HASH_UPDATED);
      const signers = [MANAGER, EVALUATOR];
      const sigs = await createSignatures(colony, 1, signers, 0, txData);

      await checkErrorRevert(colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, [0, 0], 0, txData));
    });

    it("should fail to execute task change, if the task is already finalized", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await colony.finalizeTask(taskId);

      const txData = await colony.contract.setTaskBrief.getData(taskId, SPECIFICATION_HASH_UPDATED);
      const signers = [MANAGER, EVALUATOR];
      const sigs = await createSignatures(colony, 1, signers, 0, txData);

      await checkErrorRevert(colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, [0, 0], 0, txData));
    });

    it("should log a TaskBriefChanged event, if the task brief gets changed", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      const sigs = await createSignatures(colony, 1, [MANAGER], 0, txData);
      await expectEvent(colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, [0], 0, txData), "TaskBriefChanged");
    });

    it("should log a TaskDueDateChanged event, if the task due date gets changed", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      const dueDate = await currentBlockTime();
      const txData = await colony.contract.setTaskDueDate.getData(1, dueDate);
      const sigs = await createSignatures(colony, 1, [MANAGER], 0, txData);
      await expectEvent(colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, [0, 0], 0, txData), "TaskDueDateChanged");
    });

    it("should log a TaskSkillChanged event, if the task skill gets changed", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      // Acquire meta colony, create new global skill, assign new task's skill
      const metaColonyAddress = await colonyNetwork.getMetaColony.call();
      const metaColony = await IColony.at(metaColonyAddress);
      await metaColony.addGlobalSkill(1);

      const skillCount = await colonyNetwork.getSkillCount.call();
      await expectEvent(colony.setTaskSkill(1, skillCount.toNumber()), "TaskSkillChanged");
    });

    it("should log a TaskDomainChanged event, if the task domain gets changed", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      // Create a domain, change task's domain
      const skillCount = await colonyNetwork.getSkillCount.call();
      await colony.addDomain(skillCount.toNumber());

      await expectEvent(colony.setTaskDomain(1, 2), "TaskDomainChanged");
    });

    it("should log a TaskRoleUserChanged event, if a task role's user gets changed", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);

      // Change the task role's user
      await expectEvent(colony.setTaskRoleUser(1, WORKER_ROLE, WORKER), "TaskRoleUserChanged");
    });
  });

  describe("when submitting task deliverable", () => {
    it("should update task", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 4;
      await setupAssignedTask({ colonyNetwork, colony, dueDate });

      let task = await colony.getTask.call(1);
      assert.equal(task[1], "0x0000000000000000000000000000000000000000000000000000000000000000");

      const currentTime = await currentBlockTime();
      await colony.submitTaskDeliverable(1, DELIVERABLE_HASH, { from: WORKER });
      task = await colony.getTask.call(1);
      assert.equal(task[1], DELIVERABLE_HASH);
      assert.closeTo(task[7].toNumber(), currentTime, 2);
    });

    it("should fail if I try to submit work for a task that is finalized", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await colony.finalizeTask(taskId);
      await checkErrorRevert(colony.submitTaskDeliverable(taskId, DELIVERABLE_HASH));
    });

    it("should fail if I try to submit work for a task that is past its due date", async () => {
      let dueDate = await currentBlockTime();
      dueDate -= 1;
      await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await checkErrorRevert(colony.submitTaskDeliverable(1, DELIVERABLE_HASH));
    });

    it("should fail if I try to submit work for a task using an invalid id", async () => {
      await checkErrorRevert(colony.submitTaskDeliverable(10, DELIVERABLE_HASH));
    });

    it("should fail if I try to submit work twice", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 4;
      await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.submitTaskDeliverable(1, DELIVERABLE_HASH, { from: WORKER });

      await checkErrorRevert(colony.submitTaskDeliverable(1, SPECIFICATION_HASH, { from: WORKER }));
      const task = await colony.getTask.call(1);
      assert.equal(task[1], DELIVERABLE_HASH);
    });

    it("should fail if I try to submit work if I'm not the assigned worker", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 4;
      await setupAssignedTask({ colonyNetwork, colony, dueDate });

      await checkErrorRevert(colony.submitTaskDeliverable(1, SPECIFICATION_HASH, { from: OTHER }));
      const task = await colony.getTask.call(1);
      assert.notEqual(task[1], DELIVERABLE_HASH);
    });
  });

  describe("when finalizing a task", () => {
    it('should set the task "finalized" property to "true"', async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await colony.finalizeTask(taskId);
      const task = await colony.getTask.call(taskId);
      assert.isTrue(task[2]);
    });

    it("should fail if the task work ratings have not been assigned", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFundedTask({ colonyNetwork, colony, token });
      await checkErrorRevert(colony.finalizeTask(taskId));
    });

    it("should fail if a non-admin tries to accept the task", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await checkErrorRevert(colony.finalizeTask(taskId, { from: OTHER }));
    });

    it("should fail if I try to accept a task that was finalized before", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await colony.finalizeTask(taskId);
      await checkErrorRevert(colony.finalizeTask(taskId));
    });

    it("should fail if I try to accept a task using an invalid id", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await setupRatedTask({ colonyNetwork, colony, token });
      await checkErrorRevert(colony.finalizeTask(10));
    });

    it("should log a TaskFinalized event", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await expectEvent(colony.finalizeTask(taskId), "TaskFinalized");
    });
  });

  describe("when cancelling a task", () => {
    it('should set the task "cancelled" property to "true"', async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });

      await colony.cancelTask(taskId);
      const task = await colony.getTask.call(taskId);
      assert.isTrue(task[3]);
    });

    it("should be possible to return funds back to the domain", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFundedTask({ colonyNetwork, colony, token });
      const task = await colony.getTask.call(taskId);
      const domainId = task[8].toNumber();
      const domain = await colony.getDomain.call(domainId);
      const taskPotId = task[6];
      const domainPotId = domain[1];

      // Our test-data-generator already set up some task fund with tokens,
      // but we need some Ether, too
      await colony.send(101);
      await colony.claimColonyFunds(0x0);
      await colony.moveFundsBetweenPots(1, taskPotId, 100, 0x0);

      // And another token
      await otherToken.mint(101);
      await otherToken.transfer(colony.address, 101);
      await colony.claimColonyFunds(otherToken.address);
      await colony.moveFundsBetweenPots(1, taskPotId, 100, otherToken.address);

      // Keep track of original Ether balance in pots
      const originalDomainEtherBalance = await colony.getPotBalance.call(domainPotId, 0x0);
      const originalTaskEtherBalance = await colony.getPotBalance.call(taskPotId, 0x0);
      // And same for the token
      const originalDomainTokenBalance = await colony.getPotBalance.call(domainPotId, token.address);
      const originalTaskTokenBalance = await colony.getPotBalance.call(taskPotId, token.address);
      // And the other token
      const originalDomainOtherTokenBalance = await colony.getPotBalance.call(domainPotId, otherToken.address);
      const originalTaskOtherTokenBalance = await colony.getPotBalance.call(taskPotId, otherToken.address);

      // Now that everything is set up, let's cancel the task, move funds and compare pots afterwards
      await colony.cancelTask(taskId);
      await colony.moveFundsBetweenPots(taskPotId, domainPotId, originalTaskEtherBalance, 0x0);
      await colony.moveFundsBetweenPots(taskPotId, domainPotId, originalTaskTokenBalance, token.address);
      await colony.moveFundsBetweenPots(taskPotId, domainPotId, originalTaskOtherTokenBalance, otherToken.address);

      const cancelledTaskEtherBalance = await colony.getPotBalance.call(taskPotId, 0x0);
      const cancelledDomainEtherBalance = await colony.getPotBalance.call(domainPotId, 0x0);
      const cancelledTaskTokenBalance = await colony.getPotBalance.call(taskPotId, token.address);
      const cancelledDomainTokenBalance = await colony.getPotBalance.call(domainPotId, token.address);
      const cancelledTaskOtherTokenBalance = await colony.getPotBalance.call(taskPotId, otherToken.address);
      const cancelledDomainOtherTokenBalance = await colony.getPotBalance.call(domainPotId, otherToken.address);
      assert.notEqual(originalTaskEtherBalance.toNumber(), cancelledTaskEtherBalance.toNumber());
      assert.notEqual(originalDomainEtherBalance.toNumber(), cancelledDomainEtherBalance.toNumber());
      assert.notEqual(originalTaskTokenBalance.toNumber(), cancelledTaskTokenBalance.toNumber());
      assert.notEqual(originalDomainTokenBalance.toNumber(), cancelledDomainTokenBalance.toNumber());
      assert.notEqual(originalTaskOtherTokenBalance.toNumber(), cancelledTaskOtherTokenBalance.toNumber());
      assert.notEqual(originalDomainOtherTokenBalance.toNumber(), cancelledDomainOtherTokenBalance.toNumber());
      assert.equal(cancelledTaskEtherBalance.toNumber(), 0);
      assert.equal(cancelledTaskTokenBalance.toNumber(), 0);
      assert.equal(cancelledTaskOtherTokenBalance.toNumber(), 0);
      assert.equal(originalDomainEtherBalance.plus(originalTaskEtherBalance).toNumber(), cancelledDomainEtherBalance.toNumber());
      assert.equal(originalDomainTokenBalance.plus(originalTaskTokenBalance).toNumber(), cancelledDomainTokenBalance.toNumber());
      assert.equal(originalDomainOtherTokenBalance.plus(originalTaskOtherTokenBalance).toNumber(), cancelledDomainOtherTokenBalance.toNumber());
    });

    it("should fail if manager tries to cancel a task that was finalized", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await colony.finalizeTask(taskId);
      await checkErrorRevert(colony.cancelTask(taskId));
    });

    it("should fail if manager tries to cancel a task with invalid id", async () => {
      await checkErrorRevert(colony.cancelTask(10));
    });

    it("should log a TaskCanceled event", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await expectEvent(colony.cancelTask(taskId), "TaskCanceled");
    });
  });

  describe("when funding tasks", () => {
    it("should be able to set the task payouts for different roles", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      await colony.setTaskRoleUser(1, EVALUATOR_ROLE, EVALUATOR);
      await colony.mintTokens(100);
      // Set the manager payout as 5000 wei and 100 colony tokens
      await colony.setTaskManagerPayout(1, 0x0, 5000);
      await colony.setTaskManagerPayout(1, token.address, 100);

      // Set the evaluator payout as 1000 ethers
      const txData1 = await colony.contract.setTaskEvaluatorPayout.getData(1, 0x0, 1000);
      const sigs = await createSignatures(colony, 1, [MANAGER, EVALUATOR], 0, txData1);
      await colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, [0, 0], 0, txData1);

      // Set the evaluator payout as 40 colony tokens
      const txData2 = await colony.contract.setTaskEvaluatorPayout.getData(1, token.address, 40);
      const sigs2 = await createSignatures(colony, 1, [MANAGER, EVALUATOR], 0, txData2);
      await colony.executeTaskChange(sigs2.sigV, sigs2.sigR, sigs2.sigS, [0, 0], 0, txData2);

      // Set the worker payout as 98000 wei and 200 colony tokens
      const txData3 = await colony.contract.setTaskWorkerPayout.getData(1, 0x0, 98000);
      const sigs3 = await createSignatures(colony, 1, [MANAGER, WORKER], 0, txData3);
      await colony.executeTaskChange(sigs3.sigV, sigs3.sigR, sigs3.sigS, [0, 0], 0, txData3);

      const txData4 = await colony.contract.setTaskWorkerPayout.getData(1, token.address, 200);
      const sigs4 = await createSignatures(colony, 1, [MANAGER, WORKER], 0, txData4);
      await colony.executeTaskChange(sigs4.sigV, sigs4.sigR, sigs4.sigS, [0, 0], 0, txData4);

      const taskPayoutManager1 = await colony.getTaskPayout.call(1, MANAGER_ROLE, 0x0);
      assert.equal(taskPayoutManager1.toNumber(), 5000);
      const taskPayoutManager2 = await colony.getTaskPayout.call(1, MANAGER_ROLE, token.address);
      assert.equal(taskPayoutManager2.toNumber(), 100);

      const taskPayoutEvaluator1 = await colony.getTaskPayout.call(1, EVALUATOR_ROLE, 0x0);
      assert.equal(taskPayoutEvaluator1.toNumber(), 1000);
      const taskPayoutEvaluator2 = await colony.getTaskPayout.call(1, EVALUATOR_ROLE, token.address);
      assert.equal(taskPayoutEvaluator2.toNumber(), 40);

      const taskPayoutWorker1 = await colony.getTaskPayout.call(1, WORKER_ROLE, 0x0);
      assert.equal(taskPayoutWorker1.toNumber(), 98000);
      const taskPayoutWorker2 = await colony.getTaskPayout.call(1, WORKER_ROLE, token.address);
      assert.equal(taskPayoutWorker2.toNumber(), 200);
    });

    it("should log a TaskWorkerPayoutChanged event, if the task's worker's payout changed", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      await colony.mintTokens(100);

      // Set the evaluator payout as 1000 ethers
      const txData = await colony.contract.setTaskWorkerPayout.getData(1, 0x0, 98000);
      const sigs = await createSignatures(colony, 1, [MANAGER, WORKER], 0, txData);

      await expectEvent(colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, [0, 0], 0, txData), "TaskWorkerPayoutChanged");
    });
  });

  describe("when claiming payout for a task", () => {
    it("should payout agreed tokens for a task", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await colony.finalizeTask(taskId);
      const networkBalanceBefore = await token.balanceOf.call(colonyNetwork.address);
      await colony.claimPayout(taskId, MANAGER_ROLE, token.address);
      const networkBalanceAfter = await token.balanceOf.call(colonyNetwork.address);
      assert.equal(networkBalanceAfter.minus(networkBalanceBefore).toNumber(), 1 * 1e18);
      const balance = await token.balanceOf.call(MANAGER);
      assert.equal(balance.toNumber(), 99 * 1e18);
      const potBalance = await colony.getPotBalance.call(2, token.address);
      assert.equal(potBalance.toNumber(), 250 * 1e18);
    });

    it("should payout agreed ether for a task", async () => {
      await colony.send(353);
      await colony.claimColonyFunds(0x0);
      let dueDate = await currentBlockTime();
      dueDate -= 1;
      const taskId = await setupRatedTask({
        colonyNetwork,
        colony,
        token: 0x0,
        dueDate,
        managerPayout: 100,
        evaluatorPayout: 50,
        workerPayout: 200
      });
      await colony.finalizeTask(taskId);
      const metaColonyAddress = await colonyNetwork.getMetaColony.call();
      const balanceBefore = await web3GetBalance(MANAGER);
      const metaBalanceBefore = await web3GetBalance(metaColonyAddress);
      await colony.claimPayout(taskId, MANAGER_ROLE, 0x0, { gasPrice: 0 });
      const balanceAfter = await web3GetBalance(MANAGER);
      const metaBalanceAfter = await web3GetBalance(metaColonyAddress);
      assert.equal(balanceAfter.minus(balanceBefore).toNumber(), 99);
      assert.equal(metaBalanceAfter.minus(metaBalanceBefore).toNumber(), 1);
      const potBalance = await colony.getPotBalance.call(2, 0x0);
      assert.equal(potBalance.toNumber(), 250);
    });

    it("should return error when task is not finalized", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await checkErrorRevert(colony.claimPayout(taskId, MANAGER_ROLE, token.address));
    });

    it("should return error when called by account that doesn't match the role", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await colony.finalizeTask(taskId);

      await checkErrorRevert(colony.claimPayout(taskId, MANAGER_ROLE, token.address, { from: OTHER }));
    });
  });
});
