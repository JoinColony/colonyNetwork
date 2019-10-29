/* global artifacts */
import { BN } from "bn.js";
import { ethers } from "ethers";
import chai from "chai";
import bnChai from "bn-chai";
import { soliditySha3 } from "web3-utils";

import {
  UINT256_MAX,
  WAD,
  MANAGER_ROLE,
  EVALUATOR_ROLE,
  WORKER_ROLE,
  SPECIFICATION_HASH,
  SPECIFICATION_HASH_UPDATED,
  DELIVERABLE_HASH,
  INITIAL_FUNDING,
  SECONDS_PER_DAY,
  MANAGER_PAYOUT,
  WORKER_PAYOUT,
  EVALUATOR_PAYOUT,
  MANAGER_RATING,
  RATING_1_SALT,
  RATING_2_SALT,
  RATING_1_SECRET,
  RATING_2_SECRET,
  CANCELLED_TASK_STATE,
  FINALIZED_TASK_STATE,
  GLOBAL_SKILL_ID
} from "../../helpers/constants";

import {
  web3GetBalance,
  checkErrorRevert,
  expectEvent,
  expectAllEvents,
  forwardTime,
  currentBlockTime,
  getBlockTime
} from "../../helpers/test-helper";

import { fundColonyWithTokens, setupRandomColony, assignRoles, submitDeliverableAndRatings } from "../../helpers/test-data-generator";
import { getSigsAndTransactionData, executeSignedTaskChange, executeSignedRoleAssignment } from "../../helpers/task-review-signing";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IMetaColony = artifacts.require("IMetaColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");

const TasksFactory = artifacts.require("TasksFactory");
const Tasks = artifacts.require("Tasks");

contract("Tasks extension", accounts => {
  const MANAGER = accounts[0];
  const EVALUATOR = accounts[1];
  const WORKER = accounts[2];

  const ADMIN = accounts[3];
  const OTHER = accounts[4];

  let colonyNetwork;
  let metaColony;

  let colony;
  let token;
  let domain1;

  let tasksFactory;
  let tasks;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);
    await metaColony.setNetworkFeeInverse(UINT256_MAX);

    tasksFactory = await TasksFactory.new();

    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.setRewardInverse(UINT256_MAX);
    await colony.setAdministrationRole(1, 0, ADMIN, 1, true);
    await colony.addDomain(1, 0, 1); // Domain 2
    domain1 = await colony.getDomain(1);

    await tasksFactory.deployExtension(colony.address);
    const tasksAddress = await tasksFactory.deployedExtensions(colony.address);
    tasks = await Tasks.at(tasksAddress);

    await colony.setArbitrationRole(1, 0, tasks.address, 1, true);
    await colony.setAdministrationRole(1, 0, tasks.address, 1, true);
  });

  describe("when deploying the extension", () => {
    it("should not allow non-root users to deploy", async () => {
      await checkErrorRevert(tasksFactory.deployExtension(colony.address, { from: OTHER }), "colony-extension-user-not-root");
    });

    it("should not allow the extension to be deployed twice", async () => {
      await checkErrorRevert(tasksFactory.deployExtension(colony.address), "colony-extension-already-deployed");
    });

    it("should not allow non-root users to remove the extension", async () => {
      await checkErrorRevert(tasksFactory.removeExtension(colony.address, { from: OTHER }), "colony-extension-user-not-root");
    });

    it("should allow root users to remove the extension", async () => {
      await tasksFactory.removeExtension(colony.address);
    });
  });

  describe("when creating tasks", () => {
    it("should allow admins to make a task", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();
      const task = await tasks.getTask(taskId);

      expect(task.specificationHash).to.equal(SPECIFICATION_HASH);
      expect(task.deliverableHash).to.equal(ethers.constants.HashZero);
      expect(task.completionTimestamp).to.be.zero;
    });

    it("should fail if a non-admin user tries to make a task", async () => {
      await checkErrorRevert(tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: OTHER }), "colony-task-not-admin");
    });

    it("should set the task creator as the manager and evaluator", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();
      const task = await tasks.getTask(taskId);

      const taskManager = await tasks.getTaskRoleUser(taskId, MANAGER_ROLE);
      const taskEvaluator = await tasks.getTaskRoleUser(taskId, EVALUATOR_ROLE);
      const expenditureManager = await colony.getExpenditureSlot(task.expenditureId, MANAGER_ROLE);
      const expenditureEvaluator = await colony.getExpenditureSlot(task.expenditureId, EVALUATOR_ROLE);

      expect(taskManager).to.equal(MANAGER);
      expect(taskEvaluator).to.equal(MANAGER);
      expect(expenditureManager.recipient).to.equal(MANAGER);
      expect(expenditureEvaluator.recipient).to.equal(MANAGER);
    });

    it("should allow the reassignment of evaluator", async () => {
      const newEvaluator = accounts[1];
      expect(newEvaluator).to.not.equal(MANAGER);

      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      let evaluator = await tasks.getTaskRoleUser(taskId, EVALUATOR_ROLE);
      expect(evaluator).to.equal(MANAGER);

      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "removeTaskEvaluatorRole",
        signers: [MANAGER], // NOTE: only one signature because manager === evaluator
        sigTypes: [0],
        args: [taskId]
      });

      evaluator = await tasks.getTaskRoleUser(taskId, EVALUATOR_ROLE);
      expect(evaluator).to.equal(ethers.constants.AddressZero);

      await executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskEvaluatorRole",
        signers: [MANAGER, newEvaluator],
        sigTypes: [0, 0],
        args: [taskId, newEvaluator]
      });

      evaluator = await tasks.getTaskRoleUser(taskId, EVALUATOR_ROLE);
      expect(evaluator).to.equal(newEvaluator);
    });

    it("should return the correct number of tasks", async () => {
      const taskCountBefore = await tasks.getTaskCount();

      for (let i = 0; i < 5; i += 1) {
        await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      }

      const taskCountAfter = await tasks.getTaskCount();
      expect(taskCountAfter.sub(taskCountBefore)).to.be.eq.BN(5);
    });

    it("should set the task domain correctly", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 2, 0, 0);
      const taskId = await tasks.getTaskCount();

      const task = await tasks.getTask(taskId);
      const expenditure = await colony.getExpenditure(task.expenditureId);
      expect(expenditure.domainId).to.eq.BN(2);
    });

    it("should log TaskAdded and TaskDueDateSet events", async () => {
      await expectAllEvents(tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0), ["TaskAdded", "TaskDueDateSet"]);
    });

    it("should optionally set the skill and due date", async () => {
      const currTime = await currentBlockTime();
      const dueDate = currTime + SECONDS_PER_DAY;

      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, dueDate);
      const taskId = await tasks.getTaskCount();

      const task = await tasks.getTask(taskId);
      expect(task.dueDate).to.eq.BN(dueDate);

      const slot = await colony.getExpenditureSlot(task.expenditureId, WORKER_ROLE);
      expect(slot.skills[0]).to.eq.BN(GLOBAL_SKILL_ID);
    });

    it("should set the due date to 90 days from now if unspecified", async () => {
      const tx = await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0);
      const taskId = await tasks.getTaskCount();

      const task = await tasks.getTask(taskId);
      const currTime = await getBlockTime(tx.receipt.blockNumber);
      expect(task.dueDate).to.eq.BN(currTime + SECONDS_PER_DAY * 90);
    });
  });

  describe("when updating tasks", () => {
    it("should not be able to `executeTaskRoleAssignment` on a nonexistent task", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await checkErrorRevert(
        executeSignedRoleAssignment({
          tasks,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [MANAGER, WORKER],
          sigTypes: [0, 0],
          args: [taskId.addn(1), WORKER]
        }),
        "colony-task-does-not-exist"
      );
    });

    it("should not be able to `executeTaskRoleAssignment` on a finalized task", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await submitDeliverableAndRatings({ tasks, taskId });
      await tasks.finalizeTask(1, 0, taskId, { from: MANAGER });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          tasks,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [MANAGER, WORKER],
          sigTypes: [0, 0],
          args: [taskId, WORKER]
        }),
        "colony-task-finalized"
      );
    });

    it("should not be able to pass unallowed function signature to `executeTaskRoleAssignment`", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await checkErrorRevert(
        executeSignedRoleAssignment({
          tasks,
          taskId,
          functionName: "setTaskDueDate", // Not a role change function!
          signers: [MANAGER, WORKER],
          sigTypes: [0, 0],
          args: [taskId, WORKER]
        }),
        "colony-task-change-is-not-role-assignment"
      );
    });

    it("should not be able to send any ether while assigning a role", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      const { sigV, sigR, sigS, txData } = await getSigsAndTransactionData({
        tasks,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      await checkErrorRevert(tasks.executeTaskRoleAssignment(sigV, sigR, sigS, [0, 0], 10, txData), "colony-task-role-assignment-non-zero-value");
    });

    it("should not be able to execute task change when the number of signature parts differ", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      const { sigV, sigR, sigS, txData } = await getSigsAndTransactionData({
        tasks,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      await checkErrorRevert(
        tasks.executeTaskRoleAssignment([sigV[0]], sigR, sigS, [0], 0, txData),
        "colony-task-role-assignment-signatures-count-do-not-match"
      );
    });

    it("should allow the evaluator and worker roles to be assigned", async () => {
      const newEvaluator = accounts[1];
      expect(newEvaluator).to.not.equal(MANAGER);

      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "removeTaskEvaluatorRole",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId]
      });

      await executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskEvaluatorRole",
        signers: [MANAGER, newEvaluator],
        sigTypes: [0, 0],
        args: [taskId, newEvaluator]
      });

      const evaluator = await tasks.getTaskRoleUser(taskId, EVALUATOR_ROLE);
      expect(evaluator).to.equal(newEvaluator);

      await executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      const worker = await tasks.getTaskRoleUser(taskId, WORKER_ROLE);
      expect(worker).to.equal(WORKER);
    });

    it("should not allow a worker to be assigned if the task has no skill", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await checkErrorRevert(
        executeSignedRoleAssignment({
          tasks,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [MANAGER, WORKER],
          sigTypes: [0, 0],
          args: [taskId, WORKER]
        }),
        "colony-task-role-assignment-execution-failed"
      );

      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "setTaskSkill",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, GLOBAL_SKILL_ID]
      });

      executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });
    });

    it("should not allow the evaluator or worker roles to be assigned only by manager", async () => {
      const newEvaluator = accounts[1];
      expect(newEvaluator).to.not.equal(MANAGER);

      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "removeTaskEvaluatorRole",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId]
      });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          tasks,
          taskId,
          functionName: "setTaskEvaluatorRole",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, newEvaluator]
        }),
        "colony-task-role-assignment-does-not-meet-required-signatures"
      );

      await checkErrorRevert(
        executeSignedRoleAssignment({
          tasks,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, WORKER]
        }),
        "colony-task-role-assignment-does-not-meet-required-signatures"
      );
    });

    it("should not allow role to be assigned if it is already assigned to somebody", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await checkErrorRevert(
        executeSignedRoleAssignment({
          tasks,
          taskId,
          functionName: "setTaskEvaluatorRole",
          signers: [MANAGER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, OTHER]
        }),
        "colony-task-role-assignment-execution-failed"
      );

      await executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          tasks,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [MANAGER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, OTHER]
        }),
        "colony-task-role-assignment-execution-failed"
      );
    });

    it("should allow role to be unassigned, as long as the current assigned address agrees", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      let worker = await tasks.getTaskRoleUser(taskId, WORKER_ROLE);
      expect(worker).to.equal(WORKER);

      // Worker does not agree
      await checkErrorRevert(
        executeSignedRoleAssignment({
          tasks,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [MANAGER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, ethers.constants.AddressZero]
        }),
        "colony-task-role-assignment-not-signed-by-new-user-for-role"
      );

      // Now they do!
      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "removeTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId]
      });

      worker = await tasks.getTaskRoleUser(taskId, WORKER_ROLE);
      expect(worker).to.equal(ethers.constants.AddressZero);
    });

    it("should not allow role to be assigned if passed address is not equal to one of the signers", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await checkErrorRevert(
        executeSignedRoleAssignment({
          tasks,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [MANAGER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, WORKER]
        }),
        "colony-task-role-assignment-not-signed-by-new-user-for-role"
      );
    });

    it("should allow manager to assign themself to a role", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, MANAGER]
      });

      const worker = await tasks.getTaskRoleUser(taskId, WORKER_ROLE);
      expect(worker).to.equal(MANAGER);
    });

    it("should not allow anyone to assign themself to a role with one signature except manager", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await checkErrorRevert(
        executeSignedRoleAssignment({
          tasks,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [WORKER],
          sigTypes: [0],
          args: [taskId, WORKER]
        }),
        "colony-task-role-assignment-does-not-meet-required-signatures"
      );
    });

    it("should allow different modes of signing when assigning roles", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [WORKER, MANAGER],
        sigTypes: [0, 1], // Different sig types
        args: [taskId, WORKER]
      });

      const worker = await tasks.getTaskRoleUser(taskId, WORKER_ROLE);
      expect(worker).to.equal(WORKER);
    });

    it("should not allow role assignment if none of the signers is manager", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await checkErrorRevert(
        executeSignedRoleAssignment({
          tasks,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [WORKER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, WORKER]
        }),
        "colony-task-role-assignment-not-signed-by-manager"
      );
    });

    it("should allow to change manager role if the user agrees", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskManagerRole",
        signers: [MANAGER, ADMIN],
        sigTypes: [0, 0],
        args: [taskId, ADMIN, 1, 0]
      });

      const manager = await tasks.getTaskRoleUser(taskId, MANAGER_ROLE);
      expect(manager).to.equal(ADMIN);
    });

    it("should not allow one-signature assignment of manager to a role if signer is not manager", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await checkErrorRevert(
        executeSignedRoleAssignment({
          tasks,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [OTHER],
          sigTypes: [0],
          args: [taskId, MANAGER]
        }),
        "colony-task-role-assignment-not-signed-by-manager"
      );
    });

    it("should not allow assignment of manager role if the user does not agree", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await checkErrorRevert(
        executeSignedRoleAssignment({
          tasks,
          taskId,
          functionName: "setTaskManagerRole",
          signers: [MANAGER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, ADMIN, 1, 0]
        }),
        "colony-task-role-assignment-not-signed-by-new-user-for-role"
      );
    });

    it("should not allow assignment of manager role if user is not an admin", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await checkErrorRevert(
        executeSignedRoleAssignment({
          tasks,
          taskId,
          functionName: "setTaskManagerRole",
          signers: [MANAGER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, OTHER, 1, 0]
        }),
        "colony-task-role-assignment-execution-failed"
      );
    });

    it("should not allow removal of manager role", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await checkErrorRevert(
        executeSignedRoleAssignment({
          tasks,
          taskId,
          functionName: "setTaskManagerRole",
          signers: [MANAGER, ADMIN],
          sigTypes: [0, 0],
          args: [taskId, ethers.constants.AddressZero, 1, 0]
        }),
        "colony-task-role-assignment-not-signed-by-new-user-for-role"
      );
    });

    it("should not allow assignment of manager role if current manager is not one of the signers", async () => {
      const newEvaluator = accounts[1];
      expect(newEvaluator).to.not.equal(MANAGER);

      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      // Setting the worker
      await executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, ADMIN],
        sigTypes: [0, 0],
        args: [taskId, ADMIN]
      });

      // Setting the evaluator
      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "removeTaskEvaluatorRole",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId]
      });

      await executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskEvaluatorRole",
        signers: [MANAGER, newEvaluator],
        sigTypes: [0, 0],
        args: [taskId, newEvaluator]
      });

      // Evaluator and worker trying to set a manager
      await checkErrorRevert(
        executeSignedRoleAssignment({
          tasks,
          taskId,
          functionName: "setTaskManagerRole",
          signers: [newEvaluator, WORKER],
          sigTypes: [0, 0],
          args: [taskId, WORKER, 1, 0]
        }),
        "colony-task-role-assignment-not-signed-by-manager"
      );
    });

    it("should correctly increment `taskChangeNonce` for multiple updates on multiple tasks", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId1 = await tasks.getTaskCount();

      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId2 = await tasks.getTaskCount();

      // Change the task1 brief
      await executeSignedTaskChange({
        tasks,
        taskId: taskId1,
        functionName: "setTaskBrief",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId1, SPECIFICATION_HASH_UPDATED]
      });
      let taskChangeNonce = await tasks.getTaskChangeNonce(taskId1);
      expect(taskChangeNonce).to.eq.BN(1);

      await executeSignedTaskChange({
        tasks,
        taskId: taskId2,
        functionName: "setTaskBrief",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId2, SPECIFICATION_HASH_UPDATED]
      });

      taskChangeNonce = await tasks.getTaskChangeNonce(taskId2);
      expect(taskChangeNonce).to.eq.BN(1);

      // Change the task2 due date
      const dueDate = await currentBlockTime();

      await executeSignedTaskChange({
        tasks,
        taskId: taskId2,
        functionName: "setTaskDueDate",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId2, dueDate]
      });

      taskChangeNonce = await tasks.getTaskChangeNonce(taskId2);
      expect(taskChangeNonce).to.eq.BN(2);
    });

    it("should allow update of task brief signed by manager only when worker has not been assigned", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "setTaskBrief",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, SPECIFICATION_HASH_UPDATED]
      });

      const task = await tasks.getTask(taskId);
      expect(task.specificationHash).to.eq.BN(SPECIFICATION_HASH_UPDATED);
    });

    it("should allow update of task brief signed by manager and worker", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "setTaskBrief",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, SPECIFICATION_HASH_UPDATED]
      });

      const task = await tasks.getTask(taskId);
      expect(task.specificationHash).to.eq.BN(SPECIFICATION_HASH_UPDATED);
    });

    it("should allow update of task brief signed by manager and worker using Trezor-style signatures", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "setTaskBrief",
        signers: [MANAGER, WORKER],
        sigTypes: [1, 1],
        args: [taskId, SPECIFICATION_HASH_UPDATED]
      });

      const task = await tasks.getTask(taskId);
      expect(task.specificationHash).to.eq.BN(SPECIFICATION_HASH_UPDATED);
    });

    it("should allow update of task brief signed by manager and worker if one uses Trezor-style signatures and the other does not", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "setTaskBrief",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 1],
        args: [taskId, SPECIFICATION_HASH_UPDATED]
      });

      const task = await tasks.getTask(taskId);
      expect(task.specificationHash).to.eq.BN(SPECIFICATION_HASH_UPDATED);
    });

    it("should not allow update of task brief signed by manager twice, with two different signature styles", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      await checkErrorRevert(
        executeSignedTaskChange({
          tasks,
          taskId,
          functionName: "setTaskBrief",
          signers: [MANAGER, MANAGER],
          sigTypes: [0, 1],
          args: [taskId, SPECIFICATION_HASH_UPDATED]
        }),
        "colony-task-duplicate-reviewers"
      );
    });

    it("should allow update of task due date signed by manager and worker", async () => {
      const dueDate = await currentBlockTime();
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "setTaskDueDate",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, dueDate]
      });

      const task = await tasks.getTask(taskId);
      expect(task.dueDate).to.eq.BN(dueDate);
    });

    it("should fail if a non-colony call is made to the task update functions", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await checkErrorRevert(tasks.setTaskBrief(taskId, SPECIFICATION_HASH_UPDATED, { from: OTHER }), "colony-task-not-self");
    });

    it("should fail update of task brief signed by a non-registered role", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await checkErrorRevert(
        executeSignedTaskChange({
          tasks,
          taskId,
          functionName: "setTaskBrief",
          signers: [MANAGER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, SPECIFICATION_HASH_UPDATED]
        }),
        "colony-task-change-does-not-meet-signatures-required"
      );
    });

    it("should fail update of task brief signed by manager and evaluator", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      await checkErrorRevert(
        executeSignedTaskChange({
          tasks,
          taskId,
          functionName: "setTaskBrief",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, SPECIFICATION_HASH_UPDATED]
        }),
        "colony-task-change-does-not-meet-signatures-required"
      );
    });

    it("should fail to execute task change for a non-registered function signature", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await checkErrorRevert(
        executeSignedTaskChange({
          tasks,
          taskId,
          functionName: "getTaskRole",
          signers: [MANAGER, EVALUATOR],
          sigTypes: [0, 0],
          args: [taskId, 0]
        }),
        "colony-task-change-does-not-meet-signatures-required"
      );
    });

    it("should fail to execute change of task brief, using an invalid taskId", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();
      const taskCount = await tasks.getTaskCount();
      const nonExistentTaskId = taskCount.addn(10);

      await checkErrorRevert(
        executeSignedTaskChange({
          tasks,
          taskId,
          functionName: "setTaskBrief",
          signers: [MANAGER],
          sigTypes: [0],
          args: [nonExistentTaskId, SPECIFICATION_HASH_UPDATED]
        }),
        "colony-task-does-not-exist"
      );
    });

    it("should fail to execute change of task brief, using invalid taskId 0", async () => {
      const taskId = 0;

      await checkErrorRevert(
        executeSignedTaskChange({
          tasks,
          taskId,
          functionName: "setTaskBrief",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, SPECIFICATION_HASH_UPDATED]
        }),
        "colony-task-does-not-exist"
      );
    });

    it("should fail to execute task changes, when trying to set skill to 0", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await checkErrorRevert(
        executeSignedTaskChange({
          tasks,
          taskId,
          functionName: "setTaskSkill",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, 0]
        }),
        "colony-task-change-execution-failed"
      );
    });

    it("should fail to execute task change, if the task is already finalized", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await submitDeliverableAndRatings({ tasks, taskId });
      await tasks.finalizeTask(1, 0, taskId, { from: MANAGER });

      await checkErrorRevert(
        executeSignedTaskChange({
          tasks,
          taskId,
          functionName: "setTaskBrief",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, SPECIFICATION_HASH_UPDATED]
        }),
        "colony-task-finalized"
      );
    });

    it("should fail to change task manager, if the task is complete", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await forwardTime(90 * SECONDS_PER_DAY);
      await tasks.completeTask(taskId, { from: MANAGER });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          tasks,
          taskId,
          functionName: "setTaskManagerRole",
          signers: [MANAGER, ADMIN],
          sigTypes: [0, 0],
          args: [taskId, ADMIN, 1, 0]
        }),
        "colony-task-role-assignment-execution-failed"
      );
    });

    it("should log a TaskBriefSet event, if the task brief gets changed", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await expectEvent(
        executeSignedTaskChange({
          tasks,
          taskId,
          functionName: "setTaskBrief",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, SPECIFICATION_HASH_UPDATED]
        }),
        "TaskBriefSet"
      );
    });

    it("should log a TaskDueDateSet event, if the task due date gets changed", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      const dueDate = await currentBlockTime();
      await expectEvent(
        executeSignedTaskChange({
          tasks,
          taskId,
          functionName: "setTaskDueDate",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, dueDate]
        }),
        "TaskDueDateSet"
      );
    });

    it("should fail to execute task change with a non zero value", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      const { sigV, sigR, sigS, txData } = await getSigsAndTransactionData({
        tasks,
        taskId,
        functionName: "setTaskBrief",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, SPECIFICATION_HASH_UPDATED]
      });

      await checkErrorRevert(tasks.executeTaskChange(sigV, sigR, sigS, [0], 100, txData), "colony-task-change-non-zero-value");
    });

    it("should fail to execute task change with a mismatched set of signature parts", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      const { sigV, sigR, sigS, txData } = await getSigsAndTransactionData({
        tasks,
        taskId,
        functionName: "setTaskBrief",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, SPECIFICATION_HASH_UPDATED]
      });

      await checkErrorRevert(tasks.executeTaskChange([sigV[0]], sigR, sigS, [0], 0, txData), "colony-task-change-signatures-count-do-not-match");
    });

    it("should fail to execute task change send for a task role assignment call (which should be using executeTaskRoleAssignment)", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      const { sigV, sigR, sigS, txData } = await getSigsAndTransactionData({
        tasks,
        taskId,
        functionName: "setTaskEvaluatorRole",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, "0x29738B9BB168790211D84C99c4AEAd215c34D731"]
      });

      await checkErrorRevert(tasks.executeTaskChange(sigV, sigR, sigS, [0], 0, txData), "colony-task-change-is-role-assignment");
    });

    it("should fail to execute task change with the wrong signatures, one signer", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      const { sigV, sigR, sigS, txData } = await getSigsAndTransactionData({
        tasks,
        taskId,
        functionName: "setTaskBrief",
        signers: [OTHER],
        sigTypes: [0],
        args: [taskId, SPECIFICATION_HASH_UPDATED]
      });

      await checkErrorRevert(tasks.executeTaskChange(sigV, sigR, sigS, [0], 0, txData), "colony-task-signatures-do-not-match-reviewer-1");
    });

    it("should fail to execute task change with the wrong signatures, two signers", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      const { sigV, sigR, sigS, txData } = await getSigsAndTransactionData({
        tasks,
        taskId,
        functionName: "setTaskBrief",
        signers: [MANAGER, OTHER],
        sigTypes: [0, 0],
        args: [taskId, SPECIFICATION_HASH_UPDATED]
      });

      await checkErrorRevert(tasks.executeTaskChange(sigV, sigR, sigS, [0, 0], 0, txData), "colony-task-signatures-do-not-match-reviewer-2");
    });
  });

  describe("when submitting task deliverable", () => {
    it("should update task", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();
      await assignRoles({ tasks, taskId, manager: MANAGER, evaluator: EVALUATOR, worker: WORKER });

      const tx = await tasks.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER });

      const task = await tasks.getTask(taskId);
      const currTime = await getBlockTime(tx.receipt.blockNumber);
      expect(task.deliverableHash).to.equal(DELIVERABLE_HASH);
      expect(task.completionTimestamp).to.eq.BN(currTime);
    });

    it("should fail if I try to submit work for a task that is complete", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();
      await assignRoles({ tasks, taskId, manager: MANAGER, evaluator: EVALUATOR, worker: WORKER });

      await forwardTime(90 * SECONDS_PER_DAY);
      await tasks.completeTask(taskId, { from: MANAGER });

      await checkErrorRevert(tasks.submitTaskDeliverable(taskId, DELIVERABLE_HASH), "colony-task-complete");
    });

    it("should fail if I try to submit work for a task that is finalized", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await submitDeliverableAndRatings({ tasks, taskId });
      await tasks.finalizeTask(1, 0, taskId, { from: MANAGER });

      await checkErrorRevert(tasks.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER }), "colony-task-complete");
    });

    it("should succeed if I try to submit work for a task that is past its due date but not yet marked as complete", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await forwardTime(SECONDS_PER_DAY * 90 + 1);
      await tasks.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER });

      const task = await tasks.getTask(taskId);
      expect(task.deliverableHash).to.equal(DELIVERABLE_HASH);
    });

    it("should fail if I try to submit work for a task using an invalid id", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await checkErrorRevert(tasks.submitTaskDeliverable(taskId.addn(1), DELIVERABLE_HASH), "colony-task-does-not-exist");
    });

    it("should fail if I try to submit work twice", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await tasks.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER });

      await checkErrorRevert(tasks.submitTaskDeliverable(taskId, SPECIFICATION_HASH, { from: WORKER }), "colony-task-complete");
    });

    it("should fail if I try to mark a taske complete after work is submitted", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await tasks.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER });

      await checkErrorRevert(tasks.completeTask(taskId, { from: MANAGER }), "colony-task-complete");
    });

    it("should fail if I try to submit work if I'm not the assigned worker", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: OTHER });
      await checkErrorRevert(tasks.submitTaskDeliverable(taskId, SPECIFICATION_HASH, { from: WORKER }), "colony-task-role-identity-mismatch");
    });

    it("should log a TaskDeliverableSubmitted event", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await expectEvent(tasks.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER }), "TaskDeliverableSubmitted");
    });

    it("should fail if I try to complete the task before the due date", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await checkErrorRevert(tasks.completeTask(taskId, { from: MANAGER }), "colony-task-due-date-in-future");
    });
  });

  describe("when evaluating a task", () => {
    it("should fail if I try to evaluate before work is submitted", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await checkErrorRevert(tasks.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR }), "colony-task-not-complete");
    });

    it("should fail if I try to evaluate twice", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await tasks.submitTaskDeliverableAndRating(taskId, DELIVERABLE_HASH, RATING_1_SECRET, { from: WORKER });

      await checkErrorRevert(
        tasks.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER }),
        "colony-task-rating-secret-already-exists"
      );
    });

    it("should fail if the wrong user tries to rate the wrong role", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await tasks.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER });

      const SECRET = soliditySha3("secret");
      await checkErrorRevert(tasks.submitTaskWorkRating(taskId, MANAGER_ROLE, SECRET, { from: OTHER }), "colony-user-cannot-rate-task-manager");
      await checkErrorRevert(tasks.submitTaskWorkRating(taskId, WORKER_ROLE, SECRET, { from: OTHER }), "colony-user-cannot-rate-task-worker");
      await checkErrorRevert(tasks.submitTaskWorkRating(taskId, EVALUATOR_ROLE, SECRET), "colony-unsupported-role-to-rate");
    });

    it("can retreive rating secret information", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });

      const tx = await tasks.submitTaskDeliverableAndRating(taskId, DELIVERABLE_HASH, RATING_1_SECRET, { from: WORKER });
      const currTime = await getBlockTime(tx.receipt.blockNumber);

      const ratingSecretsInfo = await tasks.getTaskWorkRatingSecretsInfo(taskId);
      expect(ratingSecretsInfo[0]).to.eq.BN(1);
      expect(ratingSecretsInfo[1]).to.eq.BN(currTime);

      const ratingSecret = await tasks.getTaskWorkRatingSecret(taskId, MANAGER_ROLE);
      expect(ratingSecret).to.eq.BN(RATING_1_SECRET);
    });

    it("should fail if the user tries to rate too late", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });

      await tasks.submitTaskDeliverableAndRating(taskId, DELIVERABLE_HASH, RATING_1_SECRET, { from: WORKER });

      await forwardTime(SECONDS_PER_DAY * 5 + 1);
      await checkErrorRevert(
        tasks.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: MANAGER }),
        "colony-task-rating-secret-submit-period-closed"
      );
    });

    it("should not allow a user to reveal after the deadline, with two secrets", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });

      await tasks.submitTaskDeliverableAndRating(taskId, DELIVERABLE_HASH, RATING_1_SECRET, { from: WORKER });
      await tasks.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: MANAGER });

      await forwardTime(SECONDS_PER_DAY * 5 + 1);
      await checkErrorRevert(
        tasks.revealTaskWorkRating(taskId, MANAGER_ROLE, MANAGER_RATING, RATING_1_SALT, { from: WORKER }),
        "colony-task-rating-secret-reveal-period-closed"
      );
    });

    it("should not allow a user to reveal after the deadline, with one secret", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });

      await tasks.submitTaskDeliverableAndRating(taskId, DELIVERABLE_HASH, RATING_1_SECRET, { from: WORKER });

      await forwardTime(SECONDS_PER_DAY * 10 + 1);
      await checkErrorRevert(
        tasks.revealTaskWorkRating(taskId, MANAGER_ROLE, MANAGER_RATING, RATING_1_SALT, { from: WORKER }),
        "colony-task-rating-secret-reveal-period-closed"
      );
    });

    it("should not allow a user to reveal during the submission period", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });

      await tasks.submitTaskDeliverableAndRating(taskId, DELIVERABLE_HASH, RATING_1_SECRET, { from: WORKER });

      await checkErrorRevert(
        tasks.revealTaskWorkRating(taskId, MANAGER_ROLE, MANAGER_RATING, RATING_1_SALT, { from: WORKER }),
        "colony-task-rating-secret-reveal-period-not-open"
      );
    });

    it("should not allow a user to reveal a non-matching rating", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });

      await tasks.submitTaskDeliverableAndRating(taskId, DELIVERABLE_HASH, soliditySha3(RATING_1_SALT, 3), { from: WORKER });
      await tasks.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: MANAGER });

      await checkErrorRevert(
        tasks.revealTaskWorkRating(taskId, MANAGER_ROLE, 2, RATING_1_SALT, { from: WORKER }),
        "colony-task-rating-secret-mismatch"
      );
    });

    it("should not allow a user to reveal a rating of None", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });

      await tasks.submitTaskDeliverableAndRating(taskId, DELIVERABLE_HASH, soliditySha3(RATING_1_SALT, 0), { from: WORKER });
      await tasks.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: MANAGER });

      await checkErrorRevert(tasks.revealTaskWorkRating(taskId, MANAGER_ROLE, 0, RATING_1_SALT, { from: WORKER }), "colony-task-rating-missing");
    });
  });

  describe("when finalizing a task", () => {
    it('should set the task "status" property to "finalized"', async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await submitDeliverableAndRatings({ tasks, taskId });
      await tasks.finalizeTask(1, 0, taskId, { from: MANAGER });

      const task = await tasks.getTask(taskId);
      const expenditure = await colony.getExpenditure(task.expenditureId);
      expect(expenditure.status).to.eq.BN(FINALIZED_TASK_STATE);
    });

    it("should fail if I try to finalize a task twice", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await submitDeliverableAndRatings({ tasks, taskId });
      await tasks.finalizeTask(1, 0, taskId, { from: MANAGER });

      await checkErrorRevert(tasks.finalizeTask(1, 0, taskId, { from: MANAGER }), "colony-expenditure-not-active");
    });

    it("should fail if I try to finalize a task that is not complete", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await checkErrorRevert(tasks.finalizeTask(1, 0, taskId), "colony-task-not-complete");
    });

    it("should fail if the task work ratings have not been assigned and they still have time to be", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await tasks.submitTaskDeliverable(taskId, SPECIFICATION_HASH, { from: WORKER });

      await checkErrorRevert(tasks.finalizeTask(1, 0, taskId), "colony-task-ratings-not-closed");
    });

    it("should fail if the task work ratings have not been revealed and they still have time to be", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await tasks.submitTaskDeliverableAndRating(taskId, SPECIFICATION_HASH, RATING_1_SECRET, { from: WORKER });
      await tasks.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: MANAGER });

      await checkErrorRevert(tasks.finalizeTask(1, 0, taskId), "colony-task-ratings-not-closed");
    });

    it("should finalize if the rate and reveal period have elapsed", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await tasks.submitTaskDeliverable(taskId, SPECIFICATION_HASH, { from: WORKER });

      // No ratings submitted, so must wait for both rate and reveal periods to elapse
      await forwardTime(SECONDS_PER_DAY * 10 + 1);
      await tasks.finalizeTask(1, 0, taskId, { from: MANAGER });
    });

    it("should finalize if only the reveal period has elapsed after both secrets are submitted", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await tasks.submitTaskDeliverableAndRating(taskId, SPECIFICATION_HASH, RATING_1_SECRET, { from: WORKER });
      await tasks.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: MANAGER });

      await checkErrorRevert(tasks.finalizeTask(1, 0, taskId), "colony-task-ratings-not-closed");

      // Both secrets submitted, so we only have to wait for the reveal period to elapse
      await forwardTime(SECONDS_PER_DAY * 5 + 1);
      await tasks.finalizeTask(1, 0, taskId, { from: MANAGER });
    });

    it("should assign manager and worker maximum rating if unrated", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();
      const task = await tasks.getTask(taskId);

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await tasks.submitTaskDeliverable(taskId, SPECIFICATION_HASH, { from: WORKER });

      forwardTime(SECONDS_PER_DAY * 10 + 1);
      await tasks.finalizeTask(1, 0, taskId, { from: MANAGER });

      const managerSlot = await colony.getExpenditureSlot(task.expenditureId, MANAGER_ROLE);
      const evaluatorSlot = await colony.getExpenditureSlot(task.expenditureId, EVALUATOR_ROLE);
      const workerSlot = await colony.getExpenditureSlot(task.expenditureId, WORKER_ROLE);

      expect(managerSlot.payoutModifier).to.eq.BN(WAD.divn(2)); // Implicit rating of 3
      expect(evaluatorSlot.payoutModifier).to.eq.BN(WAD.neg()); // Rating of 0 for failing to rate
      expect(workerSlot.payoutModifier).to.be.zero; // Implicit rating of 3, minus 1 for rateFail, gives 2
    });

    it("should fail if it's not sufficiently funded to support all its payouts", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "setTaskWorkerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, token.address, WORKER_PAYOUT]
      });

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await submitDeliverableAndRatings({ tasks, taskId });

      await checkErrorRevert(tasks.finalizeTask(1, 0, taskId), "colony-expenditure-not-funded");
    });

    it("should fail if I try to accept a task that was finalized before", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await submitDeliverableAndRatings({ tasks, taskId });
      await tasks.finalizeTask(1, 0, taskId, { from: MANAGER });

      await checkErrorRevert(tasks.finalizeTask(1, 0, taskId), "colony-expenditure-not-active");
    });

    it("should fail if I try to accept a task using an invalid id", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await checkErrorRevert(tasks.finalizeTask(1, 0, taskId.addn(1)), "colony-task-does-not-exist");
    });

    it("should emit two negative reputation updates for a bad worker rating", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();
      const task = await tasks.getTask(taskId);
      const expenditure = await colony.getExpenditure(task.expenditureId);

      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      const numEntriesBefore = await repCycle.getReputationUpdateLogLength();

      await tasks.setAllTaskPayouts(taskId, token.address, 0, 0, WAD, { from: MANAGER });
      await colony.moveFundsBetweenPots(1, 0, 0, domain1.fundingPotId, expenditure.fundingPotId, WAD, token.address);
      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });

      // Worker doesn't rate, so extra penalties
      await tasks.submitTaskDeliverable(taskId, SPECIFICATION_HASH, { from: WORKER });
      await tasks.submitTaskWorkRating(taskId, WORKER_ROLE, soliditySha3(RATING_2_SALT, 1), { from: MANAGER });
      await forwardTime(SECONDS_PER_DAY * 5 + 1);
      await tasks.revealTaskWorkRating(taskId, WORKER_ROLE, 1, RATING_2_SALT, { from: MANAGER });
      await forwardTime(SECONDS_PER_DAY * 5 + 1);
      await tasks.finalizeTask(1, 0, taskId, { from: MANAGER });

      const numEntriesAfter = await repCycle.getReputationUpdateLogLength();
      expect(numEntriesAfter.sub(numEntriesBefore)).to.eq.BN(2);

      // Does not include rateFail penalty
      const skillPenalty = await repCycle.getReputationUpdateLogEntry(numEntriesAfter.subn(1));
      expect(skillPenalty.user).to.equal(WORKER);
      expect(skillPenalty.skillId).to.eq.BN(GLOBAL_SKILL_ID);
      expect(skillPenalty.amount).to.eq.BN(WAD.neg());

      // Includes rateFail penalty
      const domainPenalty = await repCycle.getReputationUpdateLogEntry(numEntriesAfter.subn(2));
      expect(domainPenalty.user).to.equal(WORKER);
      expect(domainPenalty.skillId).to.eq.BN(domain1.skillId);
      expect(domainPenalty.amount).to.eq.BN(WAD.muln(3).divn(2).neg()); // eslint-disable-line prettier/prettier
    });

    it("should emit one negative reputation update for a bad manager/evaluator rating", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();
      const task = await tasks.getTask(taskId);
      const expenditure = await colony.getExpenditure(task.expenditureId);

      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      const numEntriesBefore = await repCycle.getReputationUpdateLogLength();

      await tasks.setAllTaskPayouts(taskId, token.address, WAD, 0, 0, { from: MANAGER });
      await colony.moveFundsBetweenPots(1, 0, 0, domain1.fundingPotId, expenditure.fundingPotId, WAD, token.address);
      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await submitDeliverableAndRatings({ tasks, taskId, managerRating: 1 });
      await tasks.finalizeTask(1, 0, taskId, { from: MANAGER });

      const numEntriesAfter = await repCycle.getReputationUpdateLogLength();
      expect(numEntriesAfter.sub(numEntriesBefore)).to.eq.BN(1);

      const domainPenalty = await repCycle.getReputationUpdateLogEntry(numEntriesAfter.subn(1));
      expect(domainPenalty.user).to.equal(MANAGER);
      expect(domainPenalty.skillId).to.eq.BN(domain1.skillId);
      expect(domainPenalty.amount).to.eq.BN(WAD.neg());
    });
  });

  describe("when cancelling a task", () => {
    it('should set the task "status" property to "cancelled"', async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "cancelTask",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId]
      });

      const task = await tasks.getTask(taskId);
      const expenditure = await colony.getExpenditure(task.expenditureId);
      expect(expenditure.status).to.eq.BN(CANCELLED_TASK_STATE);
    });

    it("should fail if manager tries to cancel a task that was completed", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await tasks.submitTaskDeliverable(taskId, SPECIFICATION_HASH, { from: WORKER });

      await checkErrorRevert(
        executeSignedTaskChange({
          tasks,
          taskId,
          functionName: "cancelTask",
          signers: [MANAGER, WORKER],
          sigTypes: [0, 0],
          args: [taskId]
        }),
        "colony-task-change-execution-failed"
      );
    });

    it("should fail if manager tries to cancel a task with invalid id", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await checkErrorRevert(
        executeSignedTaskChange({
          tasks,
          taskId,
          functionName: "cancelTask",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId.addn(1)]
        }),
        "colony-task-does-not-exist"
      );
    });
  });

  describe("when funding tasks", () => {
    it("should be able to set the task payouts for different roles", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      // Set the manager payout as 5000 wei and 100 colony tokens
      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, ethers.constants.AddressZero, 5000]
      });

      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, token.address, 100]
      });

      // Set the evaluator payout as 1000 ethers
      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "setTaskEvaluatorPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, ethers.constants.AddressZero, 1000]
      });

      // Set the evaluator payout as 40 colony tokens
      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "setTaskEvaluatorPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, token.address, 40]
      });

      // Set the worker payout as 98000 wei and 200 colony tokens
      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "setTaskWorkerPayout",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, ethers.constants.AddressZero, 98000]
      });

      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "setTaskWorkerPayout",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, token.address, 200]
      });

      const task = await tasks.getTask(taskId);
      const taskPayoutManager1 = await colony.getExpenditureSlotPayout(task.expenditureId, MANAGER_ROLE, ethers.constants.AddressZero);
      expect(taskPayoutManager1).to.eq.BN(5000);
      const taskPayoutManager2 = await colony.getExpenditureSlotPayout(task.expenditureId, MANAGER_ROLE, token.address);
      expect(taskPayoutManager2).to.eq.BN(100);

      const taskPayoutEvaluator1 = await colony.getExpenditureSlotPayout(task.expenditureId, EVALUATOR_ROLE, ethers.constants.AddressZero);
      expect(taskPayoutEvaluator1).to.eq.BN(1000);
      const taskPayoutEvaluator2 = await colony.getExpenditureSlotPayout(task.expenditureId, EVALUATOR_ROLE, token.address);
      expect(taskPayoutEvaluator2).to.eq.BN(40);

      const taskPayoutWorker1 = await colony.getExpenditureSlotPayout(task.expenditureId, WORKER_ROLE, ethers.constants.AddressZero);
      expect(taskPayoutWorker1).to.eq.BN(98000);
      const taskPayoutWorker2 = await colony.getExpenditureSlotPayout(task.expenditureId, WORKER_ROLE, token.address);
      expect(taskPayoutWorker2).to.eq.BN(200);
    });

    it("should be able (if manager) to set all payments at once if evaluator and worker are manager or unassigned", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();
      await checkErrorRevert(
        tasks.setAllTaskPayouts(taskId, ethers.constants.AddressZero, 5000, 1000, 98000, { from: OTHER }),
        "colony-task-role-identity-mismatch"
      );
      await tasks.setAllTaskPayouts(taskId, ethers.constants.AddressZero, 5000, 1000, 98000);

      const taskPayoutManager = await colony.getExpenditureSlotPayout(taskId, MANAGER_ROLE, ethers.constants.AddressZero);
      expect(taskPayoutManager).to.eq.BN(5000);

      const taskPayoutEvaluator = await colony.getExpenditureSlotPayout(taskId, EVALUATOR_ROLE, ethers.constants.AddressZero);
      expect(taskPayoutEvaluator).to.eq.BN(1000);

      const taskPayoutWorker = await colony.getExpenditureSlotPayout(taskId, WORKER_ROLE, ethers.constants.AddressZero);
      expect(taskPayoutWorker).to.eq.BN(98000);
    });

    it("should not be able to set all payments at once if worker is assigned and is not the manager", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      await checkErrorRevert(tasks.setAllTaskPayouts(taskId, ethers.constants.AddressZero, 5000, 1000, 98000), "colony-funding-worker-already-set");
    });

    it("should not be able to set all payments at once if evaluator is assigned and is not the manager", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "removeTaskEvaluatorRole",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId]
      });

      await executeSignedRoleAssignment({
        tasks,
        taskId,
        functionName: "setTaskEvaluatorRole",
        signers: [MANAGER, EVALUATOR],
        sigTypes: [0, 0],
        args: [taskId, EVALUATOR]
      });

      await checkErrorRevert(
        tasks.setAllTaskPayouts(taskId, ethers.constants.AddressZero, 5000, 1000, 98000),
        "colony-funding-evaluator-already-set"
      );
    });

    it("should correctly return the current total payout", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await tasks.setAllTaskPayouts(taskId, token.address, MANAGER_PAYOUT, EVALUATOR_PAYOUT, WORKER_PAYOUT);

      const task = await tasks.getTask(taskId);
      const expenditure = await colony.getExpenditure(task.expenditureId);
      const totalTokenPayout = await colony.getFundingPotPayout(expenditure.fundingPotId, token.address);
      expect(totalTokenPayout).to.eq.BN(MANAGER_PAYOUT.add(EVALUATOR_PAYOUT).add(WORKER_PAYOUT));
    });

    it("should be possible to return funds back to the domain if cancelled", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await tasks.setAllTaskPayouts(taskId, token.address, 0, 0, WAD);
      await tasks.setAllTaskPayouts(taskId, ethers.constants.AddressZero, 0, 0, WAD);

      const task = await tasks.getTask(taskId);
      const expenditure = await colony.getExpenditure(task.expenditureId);

      await colony.send(WAD);
      await colony.claimColonyFunds(ethers.constants.AddressZero);
      await colony.moveFundsBetweenPots(1, 0, 0, domain1.fundingPotId, expenditure.fundingPotId, WAD, ethers.constants.AddressZero);
      await colony.moveFundsBetweenPots(1, 0, 0, domain1.fundingPotId, expenditure.fundingPotId, WAD, token.address);

      // Keep track of original Ether balance in funding pots
      const originalDomainEtherBalance = await colony.getFundingPotBalance(domain1.fundingPotId, ethers.constants.AddressZero);
      const originalTaskEtherBalance = await colony.getFundingPotBalance(expenditure.fundingPotId, ethers.constants.AddressZero);

      // And same for the token
      const originalDomainTokenBalance = await colony.getFundingPotBalance(domain1.fundingPotId, token.address);
      const originalTaskTokenBalance = await colony.getFundingPotBalance(expenditure.fundingPotId, token.address);

      // Can't withdraw funds for active task...
      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, 0, 0, expenditure.fundingPotId, domain1.fundingPotId, WAD, token.address),
        "colony-funding-expenditure-bad-state"
      );

      // Now that everything is set up, let's cancel the task, move funds and compare funding pots afterwards
      await executeSignedTaskChange({
        tasks,
        taskId,
        functionName: "cancelTask",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId]
      });

      await colony.moveFundsBetweenPots(1, 0, 0, expenditure.fundingPotId, domain1.fundingPotId, WAD, ethers.constants.AddressZero);
      await colony.moveFundsBetweenPots(1, 0, 0, expenditure.fundingPotId, domain1.fundingPotId, WAD, token.address);

      const cancelledTaskEtherBalance = await colony.getFundingPotBalance(expenditure.fundingPotId, ethers.constants.AddressZero);
      const cancelledDomainEtherBalance = await colony.getFundingPotBalance(domain1.fundingPotId, ethers.constants.AddressZero);
      const cancelledTaskTokenBalance = await colony.getFundingPotBalance(expenditure.fundingPotId, token.address);
      const cancelledDomainTokenBalance = await colony.getFundingPotBalance(domain1.fundingPotId, token.address);

      expect(originalTaskEtherBalance).to.not.eq.BN(cancelledTaskEtherBalance);
      expect(originalDomainEtherBalance).to.not.eq.BN(cancelledDomainEtherBalance);
      expect(originalTaskTokenBalance).to.not.eq.BN(cancelledTaskTokenBalance);
      expect(originalDomainTokenBalance).to.not.eq.BN(cancelledDomainTokenBalance);

      expect(cancelledTaskEtherBalance).to.be.zero;
      expect(cancelledTaskTokenBalance).to.be.zero;

      expect(originalDomainEtherBalance.add(originalTaskEtherBalance)).to.eq.BN(cancelledDomainEtherBalance);
      expect(originalDomainTokenBalance.add(originalTaskTokenBalance)).to.eq.BN(cancelledDomainTokenBalance);
    });
  });

  describe("when claiming payout for a task", () => {
    it("should payout agreed ether and tokens for a task", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      // Setup payouts
      await tasks.setAllTaskPayouts(taskId, ethers.constants.AddressZero, 0, 0, WAD);
      await tasks.setAllTaskPayouts(taskId, token.address, 0, 0, WORKER_PAYOUT);

      const task = await tasks.getTask(taskId);
      const expenditure = await colony.getExpenditure(task.expenditureId);

      await colony.send(WAD);
      await colony.claimColonyFunds(ethers.constants.AddressZero);
      await colony.moveFundsBetweenPots(1, 0, 0, domain1.fundingPotId, expenditure.fundingPotId, WAD, ethers.constants.AddressZero);
      await colony.moveFundsBetweenPots(1, 0, 0, domain1.fundingPotId, expenditure.fundingPotId, WORKER_PAYOUT, token.address);

      // Complete task
      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await submitDeliverableAndRatings({ tasks, taskId });
      await tasks.finalizeTask(1, 0, taskId, { from: MANAGER });

      // Claim payouts
      const workerEtherBalanceBefore = await web3GetBalance(WORKER);
      await colony.claimExpenditurePayout(task.expenditureId, WORKER_ROLE, ethers.constants.AddressZero);

      const workerEtherBalanceAfter = await web3GetBalance(WORKER);
      expect(new BN(workerEtherBalanceAfter).sub(new BN(workerEtherBalanceBefore))).to.eq.BN(WAD.subn(1));

      const workerBalanceBefore = await token.balanceOf(WORKER);
      await colony.claimExpenditurePayout(task.expenditureId, WORKER_ROLE, token.address);

      const workerBalanceAfter = await token.balanceOf(WORKER);
      expect(workerBalanceAfter.sub(workerBalanceBefore)).to.eq.BN(WORKER_PAYOUT.subn(1));
    });

    it("should disburse nothing for unsatisfactory work, for manager and worker", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await tasks.setAllTaskPayouts(taskId, token.address, MANAGER_PAYOUT, EVALUATOR_PAYOUT, WORKER_PAYOUT);

      const task = await tasks.getTask(taskId);
      const expenditure = await colony.getExpenditure(task.expenditureId);
      const totalPayout = MANAGER_PAYOUT.add(EVALUATOR_PAYOUT).add(WORKER_PAYOUT);
      await colony.moveFundsBetweenPots(1, 0, 0, 1, expenditure.fundingPotId, totalPayout, token.address);

      await assignRoles({ tasks, taskId, manager: MANAGER, evaluator: EVALUATOR, worker: WORKER });
      await submitDeliverableAndRatings({ tasks, taskId, managerRating: 1, workerRating: 1 });
      await tasks.finalizeTask(1, 0, taskId, { from: MANAGER });

      const managerSlot = await colony.getExpenditureSlot(task.expenditureId, MANAGER_ROLE);
      const evaluatorSlot = await colony.getExpenditureSlot(task.expenditureId, EVALUATOR_ROLE);
      const workerSlot = await colony.getExpenditureSlot(task.expenditureId, WORKER_ROLE);

      expect(managerSlot.payoutModifier).to.eq.BN(WAD.neg()); // rating of 1
      expect(evaluatorSlot.payoutModifier).to.be.zero; // rating of 2
      expect(workerSlot.payoutModifier).to.eq.BN(WAD.neg()); // rating of 1

      const managerBalanceBefore = await token.balanceOf(MANAGER);
      const evaluatorBalanceBefore = await token.balanceOf(EVALUATOR);
      const workerBalanceBefore = await token.balanceOf(WORKER);

      await colony.claimExpenditurePayout(task.expenditureId, MANAGER_ROLE, token.address);
      await colony.claimExpenditurePayout(task.expenditureId, EVALUATOR_ROLE, token.address);
      await colony.claimExpenditurePayout(task.expenditureId, WORKER_ROLE, token.address);

      const managerBalanceAfter = await token.balanceOf(MANAGER);
      const evaluatorBalanceAfter = await token.balanceOf(EVALUATOR);
      const workerBalanceAfter = await token.balanceOf(WORKER);

      expect(managerBalanceAfter.sub(managerBalanceBefore)).to.be.zero;
      expect(evaluatorBalanceAfter.sub(evaluatorBalanceBefore)).to.eq.BN(EVALUATOR_PAYOUT.subn(1));
      expect(workerBalanceAfter.sub(workerBalanceBefore)).to.be.zero;
    });

    it("should disburse nothing for unsatisfactory work, for evaluator", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await tasks.setAllTaskPayouts(taskId, token.address, MANAGER_PAYOUT, EVALUATOR_PAYOUT, WORKER_PAYOUT);

      const task = await tasks.getTask(taskId);
      const expenditure = await colony.getExpenditure(task.expenditureId);
      const totalPayout = MANAGER_PAYOUT.add(EVALUATOR_PAYOUT).add(WORKER_PAYOUT);
      await colony.moveFundsBetweenPots(1, 0, 0, 1, expenditure.fundingPotId, totalPayout, token.address);

      await assignRoles({ tasks, taskId, manager: MANAGER, evaluator: EVALUATOR, worker: WORKER });

      await tasks.submitTaskDeliverableAndRating(taskId, SPECIFICATION_HASH, RATING_1_SECRET, { from: WORKER });
      await forwardTime(SECONDS_PER_DAY * 5 + 1);
      await tasks.revealTaskWorkRating(taskId, MANAGER_ROLE, MANAGER_RATING, RATING_1_SALT, { from: WORKER });
      await forwardTime(SECONDS_PER_DAY * 5 + 1);
      await tasks.finalizeTask(1, 0, taskId, { from: MANAGER });

      const managerSlot = await colony.getExpenditureSlot(task.expenditureId, MANAGER_ROLE);
      const evaluatorSlot = await colony.getExpenditureSlot(task.expenditureId, EVALUATOR_ROLE);
      const workerSlot = await colony.getExpenditureSlot(task.expenditureId, WORKER_ROLE);

      expect(managerSlot.payoutModifier).to.be.zero; // Rating of 2
      expect(evaluatorSlot.payoutModifier).to.eq.BN(WAD.neg()); // Rating of 1
      expect(workerSlot.payoutModifier).to.eq.BN(WAD.divn(2)); // Implicit rating of 3

      const managerPayout = await colony.getExpenditureSlotPayout(task.expenditureId, MANAGER_ROLE, token.address);
      const evaluatorPayout = await colony.getExpenditureSlotPayout(task.expenditureId, EVALUATOR_ROLE, token.address);
      const workerPayout = await colony.getExpenditureSlotPayout(task.expenditureId, WORKER_ROLE, token.address);

      expect(managerPayout).to.eq.BN(MANAGER_PAYOUT);
      expect(evaluatorPayout).to.eq.BN(EVALUATOR_PAYOUT);
      expect(workerPayout).to.eq.BN(WORKER_PAYOUT);

      const managerBalanceBefore = await token.balanceOf(MANAGER);
      const evaluatorBalanceBefore = await token.balanceOf(EVALUATOR);
      const workerBalanceBefore = await token.balanceOf(WORKER);

      await colony.claimExpenditurePayout(task.expenditureId, MANAGER_ROLE, token.address);
      await colony.claimExpenditurePayout(task.expenditureId, EVALUATOR_ROLE, token.address);
      await colony.claimExpenditurePayout(task.expenditureId, WORKER_ROLE, token.address);

      const managerBalanceAfter = await token.balanceOf(MANAGER);
      const evaluatorBalanceAfter = await token.balanceOf(EVALUATOR);
      const workerBalanceAfter = await token.balanceOf(WORKER);

      expect(managerBalanceAfter.sub(managerBalanceBefore)).to.eq.BN(MANAGER_PAYOUT.subn(1));
      expect(evaluatorBalanceAfter.sub(evaluatorBalanceBefore)).to.be.zero;
      expect(workerBalanceAfter.sub(workerBalanceBefore)).to.eq.BN(WORKER_PAYOUT.subn(1));
    });

    it("should automatically reclaim funds after unsatisfactory reviews", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, GLOBAL_SKILL_ID, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      await tasks.setAllTaskPayouts(taskId, token.address, 0, 0, WORKER_PAYOUT);

      const task = await tasks.getTask(taskId);
      const expenditure = await colony.getExpenditure(task.expenditureId);
      await colony.moveFundsBetweenPots(1, 0, 0, domain1.fundingPotId, expenditure.fundingPotId, WORKER_PAYOUT, token.address);

      await assignRoles({ tasks, taskId, manager: MANAGER, worker: WORKER });
      await submitDeliverableAndRatings({ tasks, taskId, workerRating: 1 });
      await tasks.finalizeTask(1, 0, taskId, { from: MANAGER });

      const balanceBefore = await colony.getFundingPotBalance(domain1.fundingPotId, token.address);
      await colony.claimExpenditurePayout(task.expenditureId, WORKER_ROLE, token.address);
      const balanceAfter = await colony.getFundingPotBalance(domain1.fundingPotId, token.address);
      expect(balanceAfter.sub(balanceBefore)).to.eq.BN(WORKER_PAYOUT);
    });

    it("should return error when task is not finalized", async () => {
      await tasks.makeTask(1, 0, 1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: MANAGER });
      const taskId = await tasks.getTaskCount();

      const task = await tasks.getTask(taskId);
      await checkErrorRevert(colony.claimExpenditurePayout(task.expenditureId, MANAGER_ROLE, token.address), "colony-expenditure-not-finalized");
    });
  });
});
