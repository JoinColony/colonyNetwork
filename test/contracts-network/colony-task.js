/* global artifacts */
import BN from "bn.js";
import { ethers } from "ethers";
import chai from "chai";
import bnChai from "bn-chai";

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
  ACTIVE_TASK_STATE,
  CANCELLED_TASK_STATE,
  FINALIZED_TASK_STATE,
  MANAGER_RATING,
  WORKER_RATING,
  RATING_1_SALT,
  RATING_2_SALT,
  RATING_1_SECRET,
  RATING_2_SECRET,
  MAX_PAYOUT,
  GLOBAL_SKILL_ID,
} from "../../helpers/constants";

import { getSigsAndTransactionData, executeSignedTaskChange, executeSignedRoleAssignment } from "../../helpers/task-review-signing";

import {
  getTokenArgs,
  web3GetBalance,
  checkErrorRevert,
  expectEvent,
  expectAllEvents,
  forwardTime,
  currentBlockTime,
  addTaskSkillEditingFunctions,
} from "../../helpers/test-helper";

import {
  fundColonyWithTokens,
  setupFinalizedTask,
  setupRatedTask,
  setupAssignedTask,
  setupFundedTask,
  makeTask,
  setupRandomColony,
  assignRoles,
} from "../../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IMetaColony = artifacts.require("IMetaColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const Token = artifacts.require("Token");
const TaskSkillEditing = artifacts.require("TaskSkillEditing");

contract("ColonyTask", (accounts) => {
  const MANAGER = accounts[0];
  const EVALUATOR = MANAGER;
  const WORKER = accounts[2];
  const OTHER = accounts[3];
  const COLONY_ADMIN = accounts[4];

  let colony;
  let metaColony;
  let token;
  let otherToken;
  let colonyNetwork;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);

    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.setRewardInverse(100);
    await colony.setAdministrationRole(1, UINT256_MAX, COLONY_ADMIN, 1, true);

    const otherTokenArgs = getTokenArgs();
    otherToken = await Token.new(...otherTokenArgs);
    await otherToken.unlock();
  });

  describe("when creating tasks", () => {
    it("should allow admins to make task", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await makeTask({ colony, dueDate });
      const task = await colony.getTask(taskId);
      expect(task.specificationHash).to.equal(SPECIFICATION_HASH);
      expect(task.deliverableHash).to.equal(ethers.constants.HashZero);
      expect(task.status).to.eq.BN(ACTIVE_TASK_STATE);
      expect(task.dueDate).to.eq.BN(dueDate);
      expect(task.domainId).to.eq.BN(1);
    });

    it("should fail if a non-admin user tries to make a task", async () => {
      const taskCountBefore = await colony.getTaskCount();
      await checkErrorRevert(colony.makeTask(1, UINT256_MAX, SPECIFICATION_HASH, 1, 1, 0, { from: OTHER }), "ds-auth-unauthorized");
      const taskCountAfter = await colony.getTaskCount();
      expect(taskCountBefore).to.be.eq.BN(taskCountAfter);
    });

    it("should set the task manager as the creator and evaluator", async () => {
      const taskId = await makeTask({ colony });

      const taskManager = await colony.getTaskRole(taskId, MANAGER_ROLE);
      expect(taskManager.user).to.equal(MANAGER);

      const taskEvaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      expect(taskEvaluator.user).to.equal(MANAGER);
    });

    it("should allow the reassignment of evaluator", async () => {
      const newEvaluator = accounts[1];
      expect(MANAGER).to.not.equal(newEvaluator);

      const taskId = await makeTask({ colony });

      let taskEvaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      expect(taskEvaluator.user).to.equal(EVALUATOR);

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "removeTaskEvaluatorRole",
        signers: [MANAGER], // NOTE: only one signature because manager === evaluator
        sigTypes: [0],
        args: [taskId],
      });

      taskEvaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      expect(taskEvaluator.user).to.equal(ethers.constants.AddressZero);

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskEvaluatorRole",
        signers: [MANAGER, newEvaluator],
        sigTypes: [0, 0],
        args: [taskId, newEvaluator],
      });

      taskEvaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      expect(taskEvaluator.user).to.equal(newEvaluator);
    });

    it("should return the correct number of tasks", async () => {
      const taskCountBefore = await colony.getTaskCount();

      for (let i = 0; i < 5; i += 1) {
        await makeTask({ colony });
      }

      const taskCountAfter = await colony.getTaskCount();
      expect(taskCountAfter).to.be.eq.BN(taskCountBefore.addn(5));
    });

    it("should set the task domain correctly", async () => {
      await colony.addDomain(1, UINT256_MAX, 1);
      const taskId = await makeTask({ colonyNetwork, colony, domainId: 2 });
      const task = await colony.getTask(taskId);
      expect(task.domainId).to.eq.BN(2);
    });

    it("should log TaskAdded and FundingPotAdded events", async () => {
      await expectAllEvents(colony.makeTask(1, UINT256_MAX, SPECIFICATION_HASH, 1, 3, 0), ["TaskAdded", "FundingPotAdded"]);
    });

    it("should optionally set the skill and due date", async () => {
      const skillId = GLOBAL_SKILL_ID;
      const currTime = await currentBlockTime();
      const dueDate = currTime + SECONDS_PER_DAY * 10;

      const taskId = await makeTask({ colony, skillId, dueDate });
      const task = await colony.getTask(taskId);
      expect(task.dueDate).to.eq.BN(dueDate);
      expect(task.skillIds[0]).to.eq.BN(skillId);
    });

    it("should set the due date to 90 days from now if unspecified", async () => {
      const skillId = GLOBAL_SKILL_ID;
      const dueDate = 0;
      const taskId = await makeTask({ colony, skillId, dueDate });
      const task = await colony.getTask(taskId);
      const currTime = await currentBlockTime();
      const expectedDueDate = currTime + SECONDS_PER_DAY * 90;
      expect(task.dueDate).to.eq.BN(expectedDueDate);
    });
  });

  describe("when updating tasks", () => {
    it("should not be able to pass unallowed function signature to `executeTaskRoleAssignment`", async () => {
      const taskId = await makeTask({ colony });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskDueDate",
          signers: [MANAGER, WORKER],
          sigTypes: [0, 0],
          args: [taskId, WORKER],
        }),
        "colony-task-change-is-not-role-assignment"
      );
    });

    it("should not be able to send any ether while assigning a role", async () => {
      const taskId = await makeTask({ colony });

      const sigTypes = [0, 0];
      const signers = [MANAGER, WORKER];
      const args = [taskId, WORKER];
      const { sigV, sigR, sigS, txData } = await getSigsAndTransactionData({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers,
        sigTypes,
        args,
      });
      await checkErrorRevert(colony.executeTaskRoleAssignment(sigV, sigR, sigS, sigTypes, 10, txData), "colony-task-role-assignment-non-zero-value");
    });

    it("should not be able to execute task change when the number of signature parts differ", async () => {
      const taskId = await makeTask({ colony });
      const sigTypes = [0, 0];
      const signers = [MANAGER, WORKER];
      const args = [taskId, WORKER];
      const { sigV, sigR, sigS, txData } = await getSigsAndTransactionData({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers,
        sigTypes,
        args,
      });

      await checkErrorRevert(
        colony.executeTaskRoleAssignment([sigV[0]], sigR, sigS, [0], 0, txData),
        "colony-task-role-assignment-signatures-count-do-not-match"
      );
    });

    it("should allow the worker and evaluator roles to be assigned", async () => {
      const newEvaluator = accounts[1];
      expect(MANAGER).to.not.equal(newEvaluator);

      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER],
      });

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "removeTaskEvaluatorRole",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId],
      });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskEvaluatorRole",
        signers: [MANAGER, newEvaluator],
        sigTypes: [0, 0],
        args: [taskId, newEvaluator],
      });

      const worker = await colony.getTaskRole(taskId, WORKER_ROLE);
      expect(worker.user).to.equal(WORKER);

      const evaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      expect(evaluator.user).to.equal(newEvaluator);
    });

    it("should not allow a worker to be assigned if the task has no skill", async () => {
      const taskId = await makeTask({ colony, skillId: 0 });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [MANAGER, WORKER],
          sigTypes: [0, 0],
          args: [taskId, WORKER],
        }),
        "colony-task-role-assignment-execution-failed"
      );

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskSkill",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, 3], // skillId 3
      });

      executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER],
      });
    });

    it("should not allow the worker or evaluator roles to be assigned only by manager", async () => {
      const newEvaluator = accounts[1];
      expect(MANAGER).to.not.equal(newEvaluator);

      const taskId = await makeTask({ colony });

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "removeTaskEvaluatorRole",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId],
      });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskEvaluatorRole",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, newEvaluator],
        }),
        "colony-task-role-assignment-does-not-meet-required-signatures"
      );

      const evaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      expect(evaluator.user).to.equal(ethers.constants.AddressZero);

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, WORKER],
        }),
        "colony-task-role-assignment-does-not-meet-required-signatures"
      );

      const worker = await colony.getTaskRole(taskId, WORKER_ROLE);
      expect(worker.user).to.equal(ethers.constants.AddressZero);
    });

    it("should not allow role to be assigned if it is already assigned to somebody", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER],
      });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [MANAGER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, OTHER],
        }),
        "colony-task-role-assignment-execution-failed"
      );

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskEvaluatorRole",
          signers: [MANAGER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, OTHER],
        }),
        "colony-task-role-assignment-execution-failed"
      );
    });

    it("should allow role to be unassigned, as long as the current assigned address agrees", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER],
      });

      let workerInfo = await colony.getTaskRole(taskId, WORKER_ROLE);
      expect(workerInfo.user).to.equal(WORKER);

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "removeTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId],
      });

      workerInfo = await colony.getTaskRole(taskId, WORKER_ROLE);
      expect(workerInfo.user).to.equal(ethers.constants.AddressZero);
    });

    it("should not allow role to be unassigned, if current assigned address does not agree", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER],
      });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [MANAGER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, ethers.constants.AddressZero],
        }),
        "colony-task-role-assignment-not-signed-by-new-user-for-role"
      );

      const workerInfo = await colony.getTaskRole(taskId, WORKER_ROLE);
      expect(workerInfo.user).to.equal(WORKER);
    });

    it("should not allow role to be assigned if passed address is not equal to one of the signers", async () => {
      const newEvaluator = accounts[1];
      expect(MANAGER).to.not.equal(newEvaluator);

      const taskId = await makeTask({ colony });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [MANAGER, WORKER],
          sigTypes: [0, 0],
          args: [taskId, newEvaluator],
        }),
        "colony-task-role-assignment-not-signed-by-new-user-for-role"
      );

      const workerInfo = await colony.getTaskRole(taskId, WORKER_ROLE);
      expect(workerInfo.user).to.equal(ethers.constants.AddressZero);
    });

    it("should allow manager to assign himself to a role", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, MANAGER],
      });

      const workerInfo = await colony.getTaskRole(taskId, WORKER_ROLE);
      expect(workerInfo.user).to.equal(MANAGER);
    });

    it("should not allow anyone to assign himself to a role with one signature except manager", async () => {
      const taskId = await makeTask({ colony });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [WORKER],
          sigTypes: [0],
          args: [taskId, WORKER],
        }),
        "colony-task-role-assignment-does-not-meet-required-signatures"
      );

      const workerInfo = await colony.getTaskRole(taskId, WORKER_ROLE);
      expect(workerInfo.user).to.equal(ethers.constants.AddressZero);
    });

    it("should allow different modes of signing when assigning roles", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [WORKER, MANAGER],
        sigTypes: [0, 1],
        args: [taskId, WORKER],
      });

      const workerInfo = await colony.getTaskRole(taskId, WORKER_ROLE);
      expect(workerInfo.user).to.equal(WORKER);
    });

    it("should not allow role assignment if none of the signers is manager", async () => {
      const taskId = await makeTask({ colony });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [WORKER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, WORKER],
        }),
        "colony-task-role-assignment-not-signed-by-manager"
      );

      const workerInfo = await colony.getTaskRole(taskId, WORKER_ROLE);
      expect(workerInfo.user).to.equal(ethers.constants.AddressZero);
    });

    it("should allow to change manager role if the user agrees", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskManagerRole",
        signers: [MANAGER, COLONY_ADMIN],
        sigTypes: [0, 0],
        args: [taskId, COLONY_ADMIN, 1, UINT256_MAX],
      });

      const managerInfo = await colony.getTaskRole(taskId, MANAGER_ROLE);
      expect(managerInfo.user).to.equal(COLONY_ADMIN);
    });

    it("should not allow assignment of manager to other role with 1 signature if signer is not manager", async () => {
      const taskId = await makeTask({ colony });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [COLONY_ADMIN],
          sigTypes: [0],
          args: [taskId, MANAGER],
        }),
        "colony-task-role-assignment-not-signed-by-manager"
      );

      const managerInfo = await colony.getTaskRole(taskId, WORKER_ROLE);
      expect(managerInfo.user).to.equal(ethers.constants.AddressZero);
    });

    it("should not allow assignment of manager role if the user does not agree", async () => {
      const taskId = await makeTask({ colony });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskManagerRole",
          signers: [MANAGER, WORKER],
          sigTypes: [0, 0],
          args: [taskId, COLONY_ADMIN, 1, UINT256_MAX],
        }),
        "colony-task-role-assignment-not-signed-by-new-user-for-role"
      );

      const managerInfo = await colony.getTaskRole(taskId, MANAGER_ROLE);
      expect(managerInfo.user).to.equal(MANAGER);
    });

    it("should not allow assignment of manager role if user is not an admin", async () => {
      const taskId = await makeTask({ colony });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskManagerRole",
          signers: [MANAGER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, OTHER, 1, UINT256_MAX],
        }),
        "colony-task-role-assignment-execution-failed"
      );

      const managerInfo = await colony.getTaskRole(taskId, MANAGER_ROLE);
      expect(managerInfo.user).to.equal(MANAGER);
    });

    it("should not allow removal of manager role", async () => {
      const taskId = await makeTask({ colony });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskManagerRole",
          signers: [MANAGER, COLONY_ADMIN],
          sigTypes: [0, 0],
          args: [taskId, ethers.constants.AddressZero, 1, UINT256_MAX],
        }),
        "colony-task-role-assignment-not-signed-by-new-user-for-role"
      );

      const managerInfo = await colony.getTaskRole(taskId, MANAGER_ROLE);
      expect(managerInfo.user).to.equal(MANAGER);
    });

    it("should not allow assignment of manager role if current manager is not one of the signers", async () => {
      const newEvaluator = accounts[1];
      expect(MANAGER).to.not.equal(newEvaluator);

      const taskId = await makeTask({ colony });

      // Setting the worker
      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, COLONY_ADMIN],
        sigTypes: [0, 0],
        args: [taskId, COLONY_ADMIN],
      });

      // Setting the evaluator
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "removeTaskEvaluatorRole",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId],
      });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskEvaluatorRole",
        signers: [MANAGER, newEvaluator],
        sigTypes: [0, 0],
        args: [taskId, newEvaluator],
      });

      await checkErrorRevert(
        // Evaluator and worker trying to set a manager
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskManagerRole",
          signers: [newEvaluator, WORKER],
          sigTypes: [0, 0],
          args: [taskId, WORKER, 1, UINT256_MAX],
        }),
        "colony-task-role-assignment-not-signed-by-manager"
      );

      const managerInfo = await colony.getTaskRole(taskId, MANAGER_ROLE);
      expect(managerInfo.user).to.equal(MANAGER);
    });

    it("should correctly increment `taskChangeNonce` for multiple updates on a single task", async () => {
      const taskId = await makeTask({ colony });

      // Change the task brief
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskBrief",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, SPECIFICATION_HASH_UPDATED],
      });

      let taskChangeNonce = await colony.getTaskChangeNonce(taskId);
      expect(taskChangeNonce).to.eq.BN(1);

      // Change the due date
      const dueDate = await currentBlockTime();

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskDueDate",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, dueDate],
      });

      taskChangeNonce = await colony.getTaskChangeNonce(taskId);
      expect(taskChangeNonce).to.eq.BN(2);
    });

    it("should correctly increment `taskChangeNonce` for multiple updates on multiple tasks", async () => {
      const taskId1 = await makeTask({ colony });
      const taskId2 = await makeTask({ colony });

      // Change the task1 brief
      await executeSignedTaskChange({
        colony,
        taskId: taskId1,
        functionName: "setTaskBrief",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId1, SPECIFICATION_HASH_UPDATED],
      });
      let taskChangeNonce = await colony.getTaskChangeNonce(taskId1);
      expect(taskChangeNonce).to.eq.BN(1);

      await executeSignedTaskChange({
        colony,
        taskId: taskId2,
        functionName: "setTaskBrief",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId2, SPECIFICATION_HASH_UPDATED],
      });

      taskChangeNonce = await colony.getTaskChangeNonce(taskId2);
      expect(taskChangeNonce).to.eq.BN(1);

      // Change the task2 due date
      const dueDate = await currentBlockTime();

      await executeSignedTaskChange({
        colony,
        taskId: taskId2,
        functionName: "setTaskDueDate",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId2, dueDate],
      });

      taskChangeNonce = await colony.getTaskChangeNonce(taskId2);
      expect(taskChangeNonce).to.eq.BN(2);
    });

    it("should allow update of task brief signed by manager only when worker has not been assigned", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskBrief",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, SPECIFICATION_HASH_UPDATED],
      });

      const task = await colony.getTask(taskId);
      expect(task.specificationHash).to.eq.BN(SPECIFICATION_HASH_UPDATED);
    });

    it("should allow update of task brief signed by manager and worker", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER],
      });

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskBrief",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, SPECIFICATION_HASH_UPDATED],
      });

      const task = await colony.getTask(taskId);
      expect(task.specificationHash).to.eq.BN(SPECIFICATION_HASH_UPDATED);
    });

    it("should allow update of task brief signed by manager and worker using Trezor-style signatures", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER],
      });

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskBrief",
        signers: [MANAGER, WORKER],
        sigTypes: [1, 1],
        args: [taskId, SPECIFICATION_HASH_UPDATED],
      });

      const task = await colony.getTask(taskId);
      expect(task.specificationHash).to.eq.BN(SPECIFICATION_HASH_UPDATED);
    });

    it("should allow update of task brief signed by manager and worker if one uses Trezor-style signatures and the other does not", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER],
      });

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskBrief",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 1],
        args: [taskId, SPECIFICATION_HASH_UPDATED],
      });

      const task = await colony.getTask(taskId);
      expect(task.specificationHash).to.eq.BN(SPECIFICATION_HASH_UPDATED);
    });

    it("should not allow update of task brief signed by manager twice, with two different signature styles", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER],
      });

      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          taskId,
          functionName: "setTaskBrief",
          signers: [MANAGER, MANAGER],
          sigTypes: [0, 1],
          args: [taskId, SPECIFICATION_HASH_UPDATED],
        }),
        "colony-task-duplicate-reviewers"
      );

      const task = await colony.getTask(taskId);
      expect(task.specificationHash).to.eq.BN(SPECIFICATION_HASH);
    });

    it("should allow update of task due date signed by manager and worker", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER],
      });

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskDueDate",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, dueDate],
      });

      const task = await colony.getTask(taskId);
      expect(task.dueDate).to.eq.BN(dueDate);
    });

    it("should not allow update of task due if it is trying to be set to 0", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await makeTask({ colony, dueDate });

      await checkErrorRevert(
        executeSignedTaskChange({ colony, taskId, functionName: "setTaskDueDate", signers: [MANAGER], sigTypes: [0], args: [taskId, 0] }),
        "colony-task-change-execution-failed"
      );

      const task = await colony.getTask(taskId);
      expect(task.dueDate).to.eq.BN(dueDate);
    });

    it("should fail if a non-colony call is made to the task update functions", async () => {
      await makeTask({ colony });
      await checkErrorRevert(colony.setTaskBrief(1, SPECIFICATION_HASH_UPDATED, { from: OTHER }), "colony-not-self");
    });

    it("should fail update of task brief signed by a non-registered role", async () => {
      const taskId = await makeTask({ colony });

      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          taskId,
          functionName: "setTaskBrief",
          signers: [MANAGER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, SPECIFICATION_HASH_UPDATED],
        }),
        "colony-task-change-does-not-meet-signatures-required"
      );
    });

    it("should fail update of task brief signed by manager and evaluator", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER],
      });

      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          taskId,
          functionName: "setTaskBrief",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, SPECIFICATION_HASH_UPDATED],
        }),
        "colony-task-change-does-not-meet-signatures-required"
      );
    });

    it("should fail to execute task change for a non-registered function signature", async () => {
      const taskId = await makeTask({ colony });

      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          taskId,
          functionName: "getTaskRole",
          signers: [MANAGER, EVALUATOR],
          sigTypes: [0, 0],
          args: [taskId, 0],
        }),
        "colony-task-change-does-not-meet-signatures-required"
      );
    });

    it("should fail to execute change of task brief, using an invalid task id", async () => {
      const taskId = await makeTask({ colony });
      const taskCount = await colony.getTaskCount();
      const nonExistentTaskId = taskCount.addn(10);

      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          taskId,
          functionName: "setTaskBrief",
          signers: [MANAGER],
          sigTypes: [0],
          args: [nonExistentTaskId, SPECIFICATION_HASH_UPDATED],
        }),
        "colony-task-does-not-exist"
      );
    });

    it("should fail to execute change of task brief, using invalid task id 0", async () => {
      const taskId = 0;

      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          taskId,
          functionName: "setTaskBrief",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, SPECIFICATION_HASH_UPDATED],
        }),
        "colony-task-does-not-exist"
      );
    });

    it("should fail to execute task change, when trying to set skill to 0", async () => {
      const taskId = await makeTask({ colony });

      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          functionName: "setTaskSkill",
          taskId,
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, 0],
        }),
        "colony-task-change-execution-failed"
      );
    });

    it("should fail to execute task change, if the task is already finalized", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFinalizedTask({ colonyNetwork, colony, token });

      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          taskId,
          functionName: "setTaskBrief",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, SPECIFICATION_HASH_UPDATED],
        }),
        "colony-task-finalized"
      );
    });

    it("should fail to change task manager, if the task is complete", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const dueDate = await currentBlockTime();
      const taskId = await setupFundedTask({ colonyNetwork, colony, token, dueDate });

      await forwardTime(SECONDS_PER_DAY);
      await colony.completeTask(taskId);

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskManagerRole",
          signers: [MANAGER, COLONY_ADMIN],
          sigTypes: [0, 0],
          args: [taskId, COLONY_ADMIN, 1, UINT256_MAX],
        }),
        "colony-task-role-assignment-execution-failed"
      );
    });

    it("should log a TaskBriefSet event, if the task brief gets changed", async () => {
      const taskId = await makeTask({ colony });

      const tx = executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskBrief",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, SPECIFICATION_HASH_UPDATED],
      });
      await expectEvent(tx, "TaskBriefSet", [taskId, SPECIFICATION_HASH_UPDATED]);
      await expectEvent(tx, "TaskChangedViaSignatures", [[MANAGER]]);
    });

    it("should log a TaskDueDateSet event, if the task due date gets changed", async () => {
      const taskId = await makeTask({ colony });

      const dueDate = await currentBlockTime();
      const tx = executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskDueDate",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, dueDate],
      });

      await expectEvent(tx, "TaskDueDateSet", [taskId, dueDate]);
      await expectEvent(tx, "TaskChangedViaSignatures", [[MANAGER]]);
    });

    it("should log a TaskSkillSet event, if the task skill gets changed", async () => {
      const taskId = await makeTask({ colony });
      await metaColony.addGlobalSkill();

      const skillCount = await colonyNetwork.getSkillCount();

      const tx = executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskSkill",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, skillCount],
      });
      await expectEvent(tx, "TaskSkillSet", [taskId, skillCount]);
      await expectEvent(tx, "TaskChangedViaSignatures", [[MANAGER]]);
    });

    it("should log a TaskRoleUserSet event, if a task role's user gets changed", async () => {
      const taskId = await makeTask({ colony });

      // Change the task role's user
      const tx = await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER],
      });

      // await expectEvent(tx, "TaskRoleUserSet", [taskId, WORKER_ROLE, WORKER]);
      await expectEvent(tx, "TaskChangedViaSignatures", [[MANAGER, WORKER]]);
    });

    it("should fail to execute task change with a non zero value", async () => {
      const taskId = await makeTask({ colony });
      const { sigV, sigR, sigS, txData } = await getSigsAndTransactionData({
        colony,
        taskId,
        functionName: "setTaskDueDate",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, 1],
      });

      await checkErrorRevert(colony.executeTaskChange(sigV, sigR, sigS, [0], 100, txData), "colony-task-change-non-zero-value");
    });

    it("should fail to execute task change with a mismatched set of signature parts", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      const { sigV, sigR, sigS, txData } = await getSigsAndTransactionData({
        colony,
        taskId,
        functionName: "setTaskDueDate",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, 1],
      });

      await checkErrorRevert(colony.executeTaskChange([sigV[0]], sigR, sigS, [0], 0, txData), "colony-task-change-signatures-count-do-not-match");
    });

    it("should fail to execute task change send for a task role assignment call (which should be using executeTaskRoleAssignment)", async () => {
      const taskId = await makeTask({ colony });
      const { sigV, sigR, sigS, txData } = await getSigsAndTransactionData({
        colony,
        taskId,
        functionName: "setTaskEvaluatorRole",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, "0x29738B9BB168790211D84C99c4AEAd215c34D731"],
      });

      await checkErrorRevert(colony.executeTaskChange(sigV, sigR, sigS, [0], 0, txData), "colony-task-change-is-role-assignment");
    });
  });

  describe("when submitting task deliverable", () => {
    it("should update task", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 4;
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });

      let task = await colony.getTask(taskId);
      expect(task.deliverableHash).to.equal(ethers.constants.HashZero);

      await colony.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER });
      const currentTime = await currentBlockTime();
      task = await colony.getTask(taskId);
      expect(task.deliverableHash).to.equal(DELIVERABLE_HASH);
      expect(task.completionTimestamp).to.eq.BN(currentTime);
    });

    it("should fail if I try to submit work for a task that is complete", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, token, dueDate });
      await colony.completeTask(taskId);
      await checkErrorRevert(colony.submitTaskDeliverable(taskId, DELIVERABLE_HASH), "colony-task-complete");
    });

    it("should fail if I try to submit work for a task that is finalized", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const dueDate = await currentBlockTime();
      const taskId = await setupFinalizedTask({ colonyNetwork, colony, dueDate, token });
      await checkErrorRevert(colony.submitTaskDeliverable(taskId, DELIVERABLE_HASH), "colony-task-complete");
    });

    it("should succeed if I try to submit work for a task that is past its due date but not yet marked as complete", async () => {
      let dueDate = await currentBlockTime();
      dueDate -= 1;
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER });
      const task = await colony.getTask(taskId);
      expect(task.deliverableHash).to.equal(DELIVERABLE_HASH);
    });

    it("should fail if I try to submit work for a task using an invalid id", async () => {
      const taskCount = await colony.getTaskCount();
      const invalidTaskId = taskCount.addn(10);
      await checkErrorRevert(colony.submitTaskDeliverable(invalidTaskId, DELIVERABLE_HASH), "colony-task-does-not-exist");
    });

    it("should fail if I try to submit work twice", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 4;
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER });

      await checkErrorRevert(colony.submitTaskDeliverable(taskId, SPECIFICATION_HASH, { from: WORKER }), "colony-task-complete");
      const task = await colony.getTask(taskId);
      expect(task.deliverableHash).to.equal(DELIVERABLE_HASH);
    });

    it("should fail if I try to submit work if I'm not the assigned worker", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 4;
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });

      await checkErrorRevert(colony.submitTaskDeliverable(taskId, SPECIFICATION_HASH, { from: OTHER }), "colony-task-role-identity-mismatch");
      const task = await colony.getTask(taskId);
      expect(task.deliverableHash).to.not.equal(DELIVERABLE_HASH);
    });

    it("should log a TaskDeliverableSubmitted event", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 4;
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });

      await expectEvent(colony.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER }), "TaskDeliverableSubmitted", [
        WORKER,
        taskId,
        DELIVERABLE_HASH,
      ]);
    });
  });

  describe("when finalizing a task", () => {
    it('should set the task "status" property to "finalized"', async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFinalizedTask({ colonyNetwork, colony, token });
      const task = await colony.getTask(taskId);
      expect(task.status).to.eq.BN(FINALIZED_TASK_STATE);
    });

    it("should fail if the task work ratings have not been assigned and they still have time to be", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate, token });
      await colony.completeTask(taskId);
      await checkErrorRevert(colony.finalizeTask(taskId), "colony-task-ratings-incomplete");
    });

    it("should fail if it's not sufficiently funded to support all its payouts", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await makeTask({ colonyNetwork, colony, token });
      await colony.setAllTaskPayouts(taskId, token.address, MANAGER_PAYOUT, EVALUATOR_PAYOUT, WORKER_PAYOUT, { from: MANAGER });
      await assignRoles({ colony, taskId, manager: MANAGER, evaluator: EVALUATOR, worker: WORKER });

      await colony.submitTaskDeliverableAndRating(taskId, DELIVERABLE_HASH, RATING_1_SECRET, { from: WORKER });
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });
      await colony.revealTaskWorkRating(taskId, MANAGER_ROLE, MANAGER_RATING, RATING_1_SALT, { from: WORKER });
      await colony.revealTaskWorkRating(taskId, WORKER_ROLE, WORKER_RATING, RATING_2_SALT, { from: EVALUATOR });
      await checkErrorRevert(colony.finalizeTask(taskId), "colony-task-not-funded");
    });

    it("should fail if I try to accept a task that was finalized before", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFinalizedTask({ colonyNetwork, colony, token });
      await checkErrorRevert(colony.finalizeTask(taskId), "colony-task-already-finalized");
    });

    it("should fail if I try to accept a task using an invalid id", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskCount = await colony.getTaskCount();
      const nonExistentTaskId = taskCount.addn(10);
      await checkErrorRevert(colony.finalizeTask(nonExistentTaskId), "colony-task-not-complete");
    });

    it("should log a TaskFinalized event", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await expectEvent(colony.finalizeTask(taskId), "TaskFinalized", [MANAGER, taskId]);
    });
  });

  describe("when cancelling a task", () => {
    it('should set the task "status" property to "cancelled"', async () => {
      const taskId = await makeTask({ colony });
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "cancelTask",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId],
      });

      const task = await colony.getTask(taskId);
      expect(task.status).to.eq.BN(CANCELLED_TASK_STATE);
    });

    it("should be possible to return funds back to the domain", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFundedTask({ colonyNetwork, colony, token });
      const task = await colony.getTask(taskId);
      const { domainId } = task;
      const domain = await colony.getDomain(domainId);
      const taskPotId = task.fundingPotId;
      const domainPotId = domain.fundingPotId;

      // Our test-data-generator already set up some task fund with tokens,
      // but we need some Ether, too
      await colony.send(101);
      await colony.claimColonyFunds(ethers.constants.AddressZero);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, domainPotId, taskPotId, 100, ethers.constants.AddressZero);

      // And another token
      await otherToken.mint(colony.address, 101);
      await colony.claimColonyFunds(otherToken.address);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, domainPotId, taskPotId, 100, otherToken.address);

      // Keep track of original Ether balance in funding pots
      const originalDomainEtherBalance = await colony.getFundingPotBalance(domainPotId, ethers.constants.AddressZero);
      const originalTaskEtherBalance = await colony.getFundingPotBalance(taskPotId, ethers.constants.AddressZero);
      // And same for the token
      const originalDomainTokenBalance = await colony.getFundingPotBalance(domainPotId, token.address);
      const originalTaskTokenBalance = await colony.getFundingPotBalance(taskPotId, token.address);
      // And the other token
      const originalDomainOtherTokenBalance = await colony.getFundingPotBalance(domainPotId, otherToken.address);
      const originalTaskOtherTokenBalance = await colony.getFundingPotBalance(taskPotId, otherToken.address);

      // Now that everything is set up, let's cancel the task, move funds and compare funding pots afterwards
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "cancelTask",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId],
      });

      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, taskPotId, domainPotId, originalTaskEtherBalance, ethers.constants.AddressZero);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, taskPotId, domainPotId, originalTaskTokenBalance, token.address);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, taskPotId, domainPotId, originalTaskOtherTokenBalance, otherToken.address);

      const cancelledTaskEtherBalance = await colony.getFundingPotBalance(taskPotId, ethers.constants.AddressZero);
      const cancelledDomainEtherBalance = await colony.getFundingPotBalance(domainPotId, ethers.constants.AddressZero);
      const cancelledTaskTokenBalance = await colony.getFundingPotBalance(taskPotId, token.address);
      const cancelledDomainTokenBalance = await colony.getFundingPotBalance(domainPotId, token.address);
      const cancelledTaskOtherTokenBalance = await colony.getFundingPotBalance(taskPotId, otherToken.address);
      const cancelledDomainOtherTokenBalance = await colony.getFundingPotBalance(domainPotId, otherToken.address);

      expect(originalTaskEtherBalance).to.not.eq.BN(cancelledTaskEtherBalance);
      expect(originalDomainEtherBalance).to.not.eq.BN(cancelledDomainEtherBalance);
      expect(originalTaskTokenBalance).to.not.eq.BN(cancelledTaskTokenBalance);
      expect(originalDomainTokenBalance).to.not.eq.BN(cancelledDomainTokenBalance);
      expect(originalTaskOtherTokenBalance).to.not.eq.BN(cancelledTaskOtherTokenBalance);
      expect(originalDomainOtherTokenBalance).to.not.eq.BN(cancelledDomainOtherTokenBalance);

      expect(cancelledTaskEtherBalance).to.be.zero;
      expect(cancelledTaskTokenBalance).to.be.zero;
      expect(cancelledTaskOtherTokenBalance).to.be.zero;

      expect(originalDomainEtherBalance.add(originalTaskEtherBalance)).to.eq.BN(cancelledDomainEtherBalance);
      expect(originalDomainTokenBalance.add(originalTaskTokenBalance)).to.eq.BN(cancelledDomainTokenBalance);
      expect(originalDomainOtherTokenBalance.add(originalTaskOtherTokenBalance)).to.eq.BN(cancelledDomainOtherTokenBalance);
    });

    it("should fail if manager tries to cancel a task that was completed", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFundedTask({ colonyNetwork, colony, token });
      await colony.submitTaskDeliverable(taskId, SPECIFICATION_HASH, { from: WORKER });
      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          taskId,
          functionName: "cancelTask",
          signers: [MANAGER, WORKER],
          sigTypes: [0, 0],
          args: [taskId],
        }),
        "colony-task-change-execution-failed"
      );
    });

    it("should fail if manager tries to cancel a task with invalid id", async () => {
      const taskId = await makeTask({ colony });
      const taskCount = await colony.getTaskCount();
      const invalidTaskId = taskCount.addn(10);

      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          taskId,
          functionName: "cancelTask",
          signers: [MANAGER],
          sigTypes: [0],
          args: [invalidTaskId],
        }),
        "colony-task-does-not-exist"
      );
    });

    it("should log a TaskCanceled event", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFundedTask({ colonyNetwork, colony, token });
      const tx = executeSignedTaskChange({
        colony,
        taskId,
        functionName: "cancelTask",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId],
      });

      await expectEvent(tx, "TaskCanceled", [taskId]);
      await expectEvent(tx, "TaskChangedViaSignatures", [[MANAGER, WORKER]]);
    });
  });

  describe("when funding tasks", () => {
    it("should be able to set the task payouts for different roles", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 7;

      const taskId = await makeTask({ colony, dueDate });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER],
      });
      await colony.mintTokens(100);

      // Set the manager payout as 5000 wei and 100 colony tokens
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, ethers.constants.AddressZero, 5000],
      });

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, token.address, 100],
      });

      // Set the evaluator payout as 1000 ethers
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskEvaluatorPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, ethers.constants.AddressZero, 1000],
      });

      // Set the evaluator payout as 40 colony tokens
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskEvaluatorPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, token.address, 40],
      });

      // Set the worker payout as 98000 wei and 200 colony tokens
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskWorkerPayout",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, ethers.constants.AddressZero, 98000],
      });

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskWorkerPayout",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, token.address, 200],
      });

      const taskPayoutManager1 = await colony.getTaskPayout(taskId, MANAGER_ROLE, ethers.constants.AddressZero);
      expect(taskPayoutManager1).to.eq.BN(5000);
      const taskPayoutManager2 = await colony.getTaskPayout(taskId, MANAGER_ROLE, token.address);
      expect(taskPayoutManager2).to.eq.BN(100);

      const taskPayoutEvaluator1 = await colony.getTaskPayout(taskId, EVALUATOR_ROLE, ethers.constants.AddressZero);
      expect(taskPayoutEvaluator1).to.eq.BN(1000);
      const taskPayoutEvaluator2 = await colony.getTaskPayout(taskId, EVALUATOR_ROLE, token.address);
      expect(taskPayoutEvaluator2).to.eq.BN(40);

      const taskPayoutWorker1 = await colony.getTaskPayout(taskId, WORKER_ROLE, ethers.constants.AddressZero);
      expect(taskPayoutWorker1).to.eq.BN(98000);
      const taskPayoutWorker2 = await colony.getTaskPayout(taskId, WORKER_ROLE, token.address);
      expect(taskPayoutWorker2).to.eq.BN(200);
    });

    it("should be able (if manager) to set all payments at once if evaluator and worker are manager or unassigned", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 7;

      const taskId = await makeTask({ colony, dueDate });
      await checkErrorRevert(
        colony.setAllTaskPayouts(taskId, ethers.constants.AddressZero, 5000, 1000, 98000, { from: OTHER }),
        "colony-task-role-identity-mismatch"
      );
      await colony.setAllTaskPayouts(taskId, ethers.constants.AddressZero, 5000, 1000, 98000);

      const taskPayoutManager = await colony.getTaskPayout(taskId, MANAGER_ROLE, ethers.constants.AddressZero);
      expect(taskPayoutManager).to.eq.BN(5000);

      const taskPayoutEvaluator = await colony.getTaskPayout(taskId, EVALUATOR_ROLE, ethers.constants.AddressZero);
      expect(taskPayoutEvaluator).to.eq.BN(1000);

      const taskPayoutWorker = await colony.getTaskPayout(taskId, WORKER_ROLE, ethers.constants.AddressZero);
      expect(taskPayoutWorker).to.eq.BN(98000);
    });

    it("should not be able to set all payments at once if worker is assigned and not manager", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 7;

      const taskId = await makeTask({ colony, dueDate });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER],
      });

      await checkErrorRevert(colony.setAllTaskPayouts(taskId, ethers.constants.AddressZero, 5000, 1000, 98000), "colony-funding-worker-already-set");
    });

    it("should not be able to set all payments at once if evaluator is assigned and not manager", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 7;

      const taskId = await makeTask({ colony, dueDate, evaluator: accounts[6] });
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "removeTaskEvaluatorRole",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId],
      });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskEvaluatorRole",
        signers: [MANAGER, accounts[4]],
        sigTypes: [0, 0],
        args: [taskId, accounts[4]],
      });

      await checkErrorRevert(
        colony.setAllTaskPayouts(taskId, ethers.constants.AddressZero, 5000, 1000, 98000),
        "colony-funding-evaluator-already-set"
      );
    });

    it("should log a TaskWorkerPayoutSet event, if the task's worker's payout changed", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER],
      });
      await colony.mintTokens(100);

      // Set the worker payout as 98000 wei
      const tx = executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskWorkerPayout",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, ethers.constants.AddressZero, 98000],
      });
      await expectEvent(tx, "TaskPayoutSet", [taskId, WORKER_ROLE, ethers.constants.AddressZero, 98000]);
      await expectEvent(tx, "TaskChangedViaSignatures", [[MANAGER, WORKER]]);
    });

    it("should correctly return the current total payout", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFundedTask({ colonyNetwork, colony, token });
      const { fundingPotId } = await colony.getTask(taskId);

      const totalTokenPayout = await colony.getFundingPotPayout(fundingPotId, token.address);
      const totalTokenPayoutExpected = MANAGER_PAYOUT.add(EVALUATOR_PAYOUT).add(WORKER_PAYOUT);
      expect(totalTokenPayout).to.eq.BN(totalTokenPayoutExpected);
    });

    it("should not be able to set a payout above the limit", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, ethers.constants.AddressZero, MAX_PAYOUT],
      });

      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          taskId,
          functionName: "setTaskManagerPayout",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, ethers.constants.AddressZero, MAX_PAYOUT.addn(1)],
        }),
        "colony-task-change-execution-failed" // Should be "colony-payout-too-large"
      );
    });
  });

  describe("when claiming payout for a task", () => {
    it("should payout agreed tokens for a task", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFinalizedTask({ colonyNetwork, colony, token });
      const task = await colony.getTask(taskId);
      const taskPotId = task.fundingPotId;

      const networkBalanceBefore = await token.balanceOf(colonyNetwork.address);
      const managerBalanceBefore = await token.balanceOf(MANAGER);
      const potBalanceBefore = await colony.getFundingPotBalance(taskPotId, token.address);

      await colony.claimTaskPayout(taskId, MANAGER_ROLE, token.address);

      const networkBalanceAfter = await token.balanceOf(colonyNetwork.address);
      expect(networkBalanceAfter.sub(networkBalanceBefore)).to.eq.BN(WAD.addn(1));

      const managerBalanceAfter = await token.balanceOf(MANAGER);
      expect(managerBalanceAfter.sub(managerBalanceBefore)).to.eq.BN(WAD.muln(99).subn(1));

      const potBalanceAfter = await colony.getFundingPotBalance(taskPotId, token.address);
      expect(potBalanceBefore.sub(potBalanceAfter)).to.eq.BN(WAD.muln(100));
    });

    it("should payout agreed ether for a task", async () => {
      await colony.send(400);
      await colony.claimColonyFunds(ethers.constants.AddressZero);

      let dueDate = await currentBlockTime();
      dueDate -= 1;
      const taskId = await setupFinalizedTask({
        colonyNetwork,
        colony,
        token: ethers.constants.AddressZero,
        dueDate,
        managerPayout: 100,
        evaluatorPayout: 50,
        workerPayout: 200,
      });

      const task = await colony.getTask(taskId);
      const taskPotId = task.fundingPotId;
      const potBalanceBefore = await colony.getFundingPotBalance(taskPotId, ethers.constants.AddressZero);

      const workerBalanceBefore = await web3GetBalance(WORKER);
      const metaBalanceBefore = await web3GetBalance(metaColony.address);

      await colony.claimTaskPayout(taskId, WORKER_ROLE, ethers.constants.AddressZero, { gasPrice: 0 });

      const workerBalanceAfter = await web3GetBalance(WORKER);
      expect(new BN(workerBalanceAfter).sub(new BN(workerBalanceBefore))).to.eq.BN(new BN(197));

      const metaBalanceAfter = await web3GetBalance(metaColony.address);
      expect(new BN(metaBalanceAfter).sub(new BN(metaBalanceBefore))).to.eq.BN(3);

      const potBalanceAfter = await colony.getFundingPotBalance(taskPotId, ethers.constants.AddressZero);
      expect(potBalanceBefore.sub(potBalanceAfter)).to.eq.BN(new BN(200));
    });

    it("should disburse nothing for unsatisfactory work, for manager and worker", async () => {
      const evaluator = accounts[1];
      const managerBalanceBefore = await token.balanceOf(MANAGER);
      const evaluatorBalanceBefore = await token.balanceOf(evaluator);
      const workerBalanceBefore = await token.balanceOf(WORKER);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFinalizedTask({
        colonyNetwork,
        colony,
        token,
        evaluator,
        managerRating: 1,
        workerRating: 1,
      });

      await colony.claimTaskPayout(taskId, MANAGER_ROLE, token.address);
      await colony.claimTaskPayout(taskId, WORKER_ROLE, token.address);
      await colony.claimTaskPayout(taskId, EVALUATOR_ROLE, token.address);

      const managerBalanceAfter = await token.balanceOf(MANAGER);
      expect(managerBalanceAfter.sub(managerBalanceBefore)).to.be.zero;

      const workerBalanceAfter = await token.balanceOf(WORKER);
      expect(workerBalanceAfter.sub(workerBalanceBefore)).to.be.zero;

      const evaluatorBalanceAfter = await token.balanceOf(evaluator);
      const evaluatorPayout = EVALUATOR_PAYOUT.divn(100).muln(99).subn(1); // "Subtract" 1% fee
      expect(evaluatorBalanceAfter.sub(evaluatorBalanceBefore)).to.eq.BN(evaluatorPayout);
    });

    it("should disburse nothing for unsatisfactory work, for evaluator", async () => {
      const evaluator = accounts[1];
      const managerBalanceBefore = await token.balanceOf(MANAGER);
      const evaluatorBalanceBefore = await token.balanceOf(evaluator);
      const workerBalanceBefore = await token.balanceOf(WORKER);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const dueDate = await currentBlockTime();
      const taskId = await setupFundedTask({ colonyNetwork, colony, dueDate, token, evaluator });

      await colony.completeTask(taskId);

      await forwardTime(SECONDS_PER_DAY * 10 + 1, this);
      await colony.finalizeTask(taskId);

      await colony.claimTaskPayout(taskId, MANAGER_ROLE, token.address);
      await colony.claimTaskPayout(taskId, WORKER_ROLE, token.address);
      await colony.claimTaskPayout(taskId, EVALUATOR_ROLE, token.address);

      const managerBalanceAfter = await token.balanceOf(MANAGER);
      const managerPayout = MANAGER_PAYOUT.divn(100).muln(99).subn(1); // "Subtract" 1% fee
      expect(managerBalanceAfter.sub(managerBalanceBefore)).to.eq.BN(managerPayout);

      const workerBalanceAfter = await token.balanceOf(WORKER);
      const workerPayout = WORKER_PAYOUT.divn(100).muln(99).subn(1); // "Subtract" 1% fee
      expect(workerBalanceAfter.sub(workerBalanceBefore)).to.eq.BN(workerPayout);

      const evaluatorBalanceAfter = await token.balanceOf(evaluator);
      expect(evaluatorBalanceAfter.sub(evaluatorBalanceBefore)).to.be.zero;
    });

    it("should return error when task is not finalized", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await checkErrorRevert(colony.claimTaskPayout(taskId, MANAGER_ROLE, token.address), "colony-task-not-finalized");
    });

    it("should payout correct rounded up network fees, for small task payouts", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFinalizedTask({
        colonyNetwork,
        colony,
        token,
        managerPayout: 99,
        workerPayout: 1,
        evaluatorPayout: 2,
      });

      const networkBalance1 = await token.balanceOf(colonyNetwork.address);
      const managerBalanceBefore = await token.balanceOf(MANAGER);

      await colony.claimTaskPayout(taskId, MANAGER_ROLE, token.address);
      const networkBalance2 = await token.balanceOf(colonyNetwork.address);
      const managerBalanceAfter = await token.balanceOf(MANAGER);
      expect(networkBalance2.sub(networkBalance1)).to.eq.BN(1);
      expect(managerBalanceAfter.sub(managerBalanceBefore)).to.eq.BN(98);

      const workerBalanceBefore = await token.balanceOf(WORKER);

      await colony.claimTaskPayout(taskId, WORKER_ROLE, token.address);
      const networkBalance3 = await token.balanceOf(colonyNetwork.address);
      const workerBalanceAfter = await token.balanceOf(WORKER);
      expect(networkBalance3.sub(networkBalance2)).to.eq.BN(1);
      expect(workerBalanceAfter.sub(workerBalanceBefore)).to.be.zero;
    });

    it("should take the whole payout as fee, when network fee is 1 (=100%)", async () => {
      await metaColony.setNetworkFeeInverse(1);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFinalizedTask({
        colonyNetwork,
        colony,
        token,
        managerPayout: 99,
        workerPayout: 1,
        evaluatorPayout: 2,
      });

      const networkBalance1 = await token.balanceOf(colonyNetwork.address);
      const managerBalanceBefore = await token.balanceOf(MANAGER);

      await colony.claimTaskPayout(taskId, MANAGER_ROLE, token.address);
      const networkBalance2 = await token.balanceOf(colonyNetwork.address);
      const managerBalanceAfter = await token.balanceOf(MANAGER);
      expect(networkBalance2.sub(networkBalance1)).to.eq.BN(99);
      expect(managerBalanceAfter.sub(managerBalanceBefore)).to.be.zero;

      const workerBalanceBefore = await token.balanceOf(WORKER);

      await colony.claimTaskPayout(taskId, WORKER_ROLE, token.address);
      const networkBalance3 = await token.balanceOf(colonyNetwork.address);
      const workerBalanceAfter = await token.balanceOf(WORKER);
      expect(networkBalance3.sub(networkBalance2)).to.eq.BN(1);
      expect(workerBalanceAfter.sub(workerBalanceBefore)).to.be.zero;
    });

    it("should payout 0 network fees, for 0 value payouts", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFinalizedTask({
        colonyNetwork,
        colony,
        token,
        managerPayout: 100,
        workerPayout: 0,
        evaluatorPayout: 0,
      });

      const networkBalanceBefore = await token.balanceOf(colonyNetwork.address);
      const workerBalanceBefore = await token.balanceOf(WORKER);

      await colony.claimTaskPayout(taskId, WORKER_ROLE, token.address);

      const networkBalanceAfter = await token.balanceOf(colonyNetwork.address);
      const workerBalanceAfter = await token.balanceOf(WORKER);
      expect(networkBalanceAfter.sub(networkBalanceBefore)).to.be.zero;
      expect(workerBalanceAfter.sub(workerBalanceBefore)).to.be.zero;
    });
  });

  describe("when a task has multiple skills", () => {
    before(async () => {
      // Introduce our ability to add and remove skills from tasks, just for these tests until
      // more than one skill per task is supported.
      await addTaskSkillEditingFunctions(colonyNetwork);
    });

    it("should allow a task with 42 skills to finalise", async () => {
      // 60 was an overestimate, it seems - I can't go much higher than this.
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      const taskSkillEditingColony = await TaskSkillEditing.at(colony.address);
      for (let i = 0; i < 42; i += 1) {
        await taskSkillEditingColony.addTaskSkill(taskId, GLOBAL_SKILL_ID);
      }
      await expectEvent(colony.finalizeTask(taskId), "TaskFinalized", [taskId]);
    });

    it("an empty element shouldn't affect finalization of the task", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      const taskSkillEditingColony = await TaskSkillEditing.at(colony.address);
      await taskSkillEditingColony.addTaskSkill(taskId, 3);
      await taskSkillEditingColony.addTaskSkill(taskId, 3);
      await taskSkillEditingColony.addTaskSkill(taskId, 3);
      await taskSkillEditingColony.removeTaskSkill(taskId, 2);
      await expectEvent(colony.finalizeTask(taskId), "TaskFinalized", [MANAGER, taskId]);
    });
  });
});
