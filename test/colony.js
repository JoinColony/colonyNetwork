/* globals artifacts */
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
import { getRandomString, getTokenArgs, web3GetBalance, checkErrorRevert, hexToUtf8, expectEvent, currentBlockTime } from "../helpers/test-helper";
import { fundColonyWithTokens, setupRatedTask, setupAssignedTask, setupFundedTask } from "../helpers/test-data-generator";

const EtherRouter = artifacts.require("EtherRouter");
const IColony = artifacts.require("IColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const Token = artifacts.require("Token");
const Authority = artifacts.require("Authority");

contract("Colony", () => {
  let COLONY_KEY;
  let colony;
  let token;
  let otherToken;
  let authority;
  let colonyNetwork;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    COLONY_KEY = getRandomString(7);
    const tokenArgs = getTokenArgs();
    token = await Token.new(...tokenArgs);
    await colonyNetwork.createColony(COLONY_KEY, token.address);
    const address = await colonyNetwork.getColony.call(COLONY_KEY);
    await token.setOwner(address);
    colony = await IColony.at(address);
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
      assert.equal(hexToUtf8(task[0]), SPECIFICATION_HASH);
      assert.equal(hexToUtf8(task[1]), "");
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
      const taskDomain = await colony.getTaskDomain.call(1, 0);
      assert.equal(taskDomain.toNumber(), 2);
    });

    it("should log a TaskAdded event", async () => {
      await expectEvent(colony.makeTask(SPECIFICATION_HASH, 1), "TaskAdded");
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

    it("should allow manager to submit an update of task brief and worker to approve it", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
      await colony.approveTaskChange(1, WORKER_ROLE, { from: WORKER });

      const task = await colony.getTask.call(1);
      assert.equal(hexToUtf8(task[0]), SPECIFICATION_HASH_UPDATED);
    });

    it("should allow manager to submit an update of task due date and worker to approve it", async () => {
      const dueDate = currentBlockTime();

      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      const txData = await colony.contract.setTaskDueDate.getData(1, dueDate);
      await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
      await colony.approveTaskChange(1, WORKER_ROLE, { from: WORKER });

      const task = await colony.getTask.call(1);
      assert.equal(task[4], dueDate);
    });

    it("should fail if a non-colony call is made to the task update functions", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await checkErrorRevert(colony.setTaskBrief(1, SPECIFICATION_HASH_UPDATED, { from: OTHER }));
    });

    it("should fail if non-registered role tries to submit an update of task brief", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, EVALUATOR_ROLE, EVALUATOR);

      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      await checkErrorRevert(colony.proposeTaskChange(txData, 0, 0, { from: OTHER }));
    });

    it("should fail if evaluator tries to submit an update of task brief", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, EVALUATOR_ROLE, EVALUATOR);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);

      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      await checkErrorRevert(colony.proposeTaskChange(txData, 0, EVALUATOR_ROLE, { from: EVALUATOR }));
    });

    it("should fail if non-registered role tries to approve an update of task brief", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, EVALUATOR_ROLE, EVALUATOR);

      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
      await checkErrorRevert(colony.approveTaskChange(1, WORKER_ROLE, { from: WORKER }));
    });

    it("should fail if evaluator tries to approve an update of task brief", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, EVALUATOR_ROLE, EVALUATOR);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);

      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
      await checkErrorRevert(colony.approveTaskChange(1, EVALUATOR_ROLE, { from: EVALUATOR }));
    });

    it("should fail to submit a task update for a non-registered function signature", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      const txData = await colony.contract.getTaskRole.getData(1, 0);
      await checkErrorRevert(colony.proposeTaskChange(txData, 0, 0));
      const transactionCount = await colony.getTransactionCount.call();
      assert.equal(transactionCount.toNumber(), 0);
    });

    it("should fail to submit update of task brief, using an invalid task id", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      const txData = await colony.contract.setTaskBrief.getData(10, SPECIFICATION_HASH_UPDATED);

      await checkErrorRevert(colony.proposeTaskChange(txData, 0, 0));
      const transactionCount = await colony.getTransactionCount.call();
      assert.equal(transactionCount.toNumber(), 0);
    });

    it("should fail to submit update of task brief, if the task was already finalized", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await colony.finalizeTask(taskId);

      const txData = await colony.contract.setTaskBrief.getData(taskId, SPECIFICATION_HASH_UPDATED);
      await checkErrorRevert(colony.proposeTaskChange(txData, 0, MANAGER_ROLE));
    });

    it("should fail to approve task update, using an invalid transaction id", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);

      await checkErrorRevert(colony.approveTaskChange(10, WORKER_ROLE, { from: WORKER }));
    });

    it("should fail to approve task update twice", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
      await colony.approveTaskChange(1, WORKER_ROLE, { from: WORKER });

      await checkErrorRevert(colony.approveTaskChange(1, WORKER_ROLE, { from: WORKER }));
    });
  });

  describe("when submitting task deliverable", () => {
    it("should update task", async () => {
      const dueDate = currentBlockTime() + SECONDS_PER_DAY * 4;
      await setupAssignedTask({ colonyNetwork, colony, dueDate });

      let task = await colony.getTask.call(1);
      assert.equal(hexToUtf8(task[1]), "");

      const currentTime = currentBlockTime();
      await colony.submitTaskDeliverable(1, DELIVERABLE_HASH, { from: WORKER });
      task = await colony.getTask.call(1);
      assert.equal(hexToUtf8(task[1]), DELIVERABLE_HASH);
      assert.closeTo(task[7].toNumber(), currentTime, 2);
    });

    it("should fail if I try to submit work for a task that is finalized", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await colony.finalizeTask(taskId);
      await checkErrorRevert(colony.submitTaskDeliverable(taskId, DELIVERABLE_HASH));
    });

    it("should fail if I try to submit work for a task that is past its due date", async () => {
      const dueDate = currentBlockTime() - 1;
      await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await checkErrorRevert(colony.submitTaskDeliverable(1, DELIVERABLE_HASH));
    });

    it("should fail if I try to submit work for a task using an invalid id", async () => {
      await checkErrorRevert(colony.submitTaskDeliverable(10, DELIVERABLE_HASH));
    });

    it("should fail if I try to submit work twice", async () => {
      const dueDate = currentBlockTime() + SECONDS_PER_DAY * 4;
      await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.submitTaskDeliverable(1, DELIVERABLE_HASH, { from: WORKER });

      await checkErrorRevert(colony.submitTaskDeliverable(1, SPECIFICATION_HASH, { from: WORKER }));
      const task = await colony.getTask.call(1);
      assert.equal(hexToUtf8(task[1]), DELIVERABLE_HASH);
    });

    it("should fail if I try to submit work if I'm not the assigned worker", async () => {
      const dueDate = currentBlockTime() + SECONDS_PER_DAY * 4;
      await setupAssignedTask({ colonyNetwork, colony, dueDate });

      await checkErrorRevert(colony.submitTaskDeliverable(1, SPECIFICATION_HASH, { from: OTHER }));
      const task = await colony.getTask.call(1);
      assert.notEqual(hexToUtf8(task[1]), DELIVERABLE_HASH);
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
      const domainId = await colony.getTaskDomain.call(taskId, 0);
      const domain = await colony.getDomain.call(domainId);
      const taskPotId = task[6];
      const domainPotId = domain[1];

      // Our testDataGenerator already set up some task fund with tokens,
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

      // // Set the evaluator payout as 1000 ethers
      const txData1 = await colony.contract.setTaskEvaluatorPayout.getData(1, 0x0, 1000);
      await colony.proposeTaskChange(txData1, 0, MANAGER_ROLE);
      await colony.approveTaskChange(1, EVALUATOR_ROLE, { from: EVALUATOR });

      // // Set the evaluator payout as 40 colony tokens
      const txData2 = await colony.contract.setTaskEvaluatorPayout.getData(1, token.address, 40);
      await colony.proposeTaskChange(txData2, 0, MANAGER_ROLE);
      await colony.approveTaskChange(2, EVALUATOR_ROLE, { from: EVALUATOR });

      // // Set the worker payout as 98000 wei and 200 colony tokens
      const txData3 = await colony.contract.setTaskWorkerPayout.getData(1, 0x0, 98000);
      await colony.proposeTaskChange(txData3, 0, MANAGER_ROLE);
      await colony.approveTaskChange(3, WORKER_ROLE, { from: WORKER });

      const txData4 = await colony.contract.setTaskWorkerPayout.getData(1, token.address, 200);
      await colony.proposeTaskChange(txData4, 0, MANAGER_ROLE);
      await colony.approveTaskChange(4, WORKER_ROLE, { from: WORKER });

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
      const dueDate = currentBlockTime() - 1;
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
      const commonColonyAddress = await colonyNetwork.getColony.call("Common Colony");
      const balanceBefore = await web3GetBalance(MANAGER);
      const commonBalanceBefore = await web3GetBalance(commonColonyAddress);
      await colony.claimPayout(taskId, MANAGER_ROLE, 0x0, { gasPrice: 0 });
      const balanceAfter = await web3GetBalance(MANAGER);
      const commonBalanceAfter = await web3GetBalance(commonColonyAddress);
      assert.equal(balanceAfter.minus(balanceBefore).toNumber(), 99);
      assert.equal(commonBalanceAfter.minus(commonBalanceBefore).toNumber(), 1);
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
