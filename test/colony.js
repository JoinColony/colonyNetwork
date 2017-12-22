/* globals artifacts */
import { MANAGER,
  EVALUATOR,
  WORKER,
  OTHER,
  MANAGER_ROLE,
  EVALUATOR_ROLE,
  WORKER_ROLE,
  SPECIFICATION_HASH,
  SPECIFICATION_HASH_UPDATED,
  DELIVERABLE_HASH,
  SECONDS_PER_DAY,
  MANAGER_RATING,
  WORKER_RATING,
  RATING_1_SALT,
  RATING_2_SALT,
  RATING_1_SECRET,
  RATING_2_SECRET } from '../helpers/constants';
import testHelper from '../helpers/test-helper';
import testDataGenerator from '../helpers/test-data-generator';

const EtherRouter = artifacts.require('EtherRouter');
const IColony = artifacts.require('IColony');
const IColonyNetwork = artifacts.require('IColonyNetwork');
const Token = artifacts.require('Token');
const Authority = artifacts.require('Authority');

contract('Colony', () => {
  let COLONY_KEY;
  let colony;
  let token;
  let authority;
  let colonyNetwork;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    COLONY_KEY = testHelper.getRandomString(7);
    await colonyNetwork.createColony(COLONY_KEY);
    const address = await colonyNetwork.getColony.call(COLONY_KEY);
    colony = await IColony.at(address);
    const authorityAddress = await colony.authority.call();
    authority = await Authority.at(authorityAddress);
    const tokenAddress = await colony.getToken.call();
    token = await Token.at(tokenAddress);
  });

  describe('when initialised', () => {
    it('should accept ether', async () => {
      await colony.send(1);
      const colonyBalance = await testHelper.web3GetBalance(colony.address);
      assert.equal(colonyBalance.toNumber(), 1);
    });

    it('should take colony network as an owner', async () => {
      const owner = await colony.owner.call();
      assert.equal(owner, colonyNetwork.address);
    });

    it('should return zero task count', async () => {
      const taskCount = await colony.getTaskCount.call();
      assert.equal(taskCount, 0);
    });

    it('should fail if a non-admin tries to mint tokens', async () => {
      await testHelper.checkErrorRevert(colony.mintTokens(100, { from: OTHER }));
    });

    it('should not allow reinitialisation', async () => {
      await testHelper.checkErrorRevert(colony.initialiseColony(0x0));
    });

    it('should correctly generate a rating secret', async () => {
      const ratingSecret1 = await colony.generateSecret.call(RATING_1_SALT, MANAGER_RATING);
      assert.equal(ratingSecret1, RATING_1_SECRET);
      const ratingSecret2 = await colony.generateSecret.call(RATING_2_SALT, WORKER_RATING);
      assert.equal(ratingSecret2, RATING_2_SECRET);
    });
  });

  describe('when working with permissions', () => {
    it('should be able to add a colony owner', async () => {
      await authority.setUserRole(OTHER, 0, true);
      const owner = await authority.hasUserRole.call(OTHER, 0);
      assert.isTrue(owner);
    });

    it('should be able to add a colony admin', async () => {
      await authority.setUserRole(OTHER, 1, true);
      const admin = await authority.hasUserRole.call(OTHER, 1);
      assert.isTrue(admin);
    });

    it('should be able to remove a colony owner', async () => {
      await authority.setUserRole(OTHER, 0, true);
      await authority.setUserRole(OTHER, 0, false);
      const owner = await authority.hasUserRole.call(OTHER, 0);
      assert.isFalse(owner);
    });

    it('should be able to remove a colony admin', async () => {
      await authority.setUserRole(OTHER, 1, true);
      await authority.setUserRole(OTHER, 1, false);
      const admin = await authority.hasUserRole.call(OTHER, 1);
      assert.isFalse(admin);
    });
  });

  describe('when creating tasks', () => {
    it('should allow admins to make task', async () => {
      await colony.makeTask(SPECIFICATION_HASH);
      const task = await colony.getTask.call(1);
      assert.equal(testHelper.hexToUtf8(task[0]), SPECIFICATION_HASH);
      assert.equal(testHelper.hexToUtf8(task[1]), '');
      assert.isFalse(task[2]);
      assert.isFalse(task[3]);
      assert.equal(task[4].toNumber(), 0);
      assert.equal(task[5].toNumber(), 0);
    });

    it('should fail if a non-admin user tries to make a task', async () => {
      await testHelper.checkErrorRevert(colony.makeTask(SPECIFICATION_HASH, { from: OTHER }));
      const taskCount = await colony.getTaskCount.call();
      assert.equal(taskCount.toNumber(), 0);
    });

    it('should set the task manager as the creator', async () => {
      await colony.makeTask(SPECIFICATION_HASH);
      const taskCount = await colony.getTaskCount.call();
      assert.equal(taskCount.toNumber(), 1);
      const taskManager = await colony.getTaskRole.call(1, MANAGER_ROLE);
      assert.equal(taskManager[0], MANAGER);
    });

    it('should return the correct number of tasks', async () => {
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.makeTask(SPECIFICATION_HASH);
      const taskCount = await colony.getTaskCount.call();

      assert.equal(taskCount.toNumber(), 5);
    });

    it('should log a TaskAdded event', async () => {
      await testHelper.expectEvent(colony.makeTask(SPECIFICATION_HASH), 'TaskAdded');
    });
  });

  describe('when updating tasks', () => {
    it('should allow the worker and evaluator roles to be assigned', async () => {
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.setTaskRoleUser(1, EVALUATOR_ROLE, EVALUATOR);
      const evaluator = await colony.getTaskRole.call(1, EVALUATOR_ROLE);
      assert.equal(evaluator[0], EVALUATOR);

      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      const worker = await colony.getTaskRole.call(1, WORKER_ROLE);
      assert.equal(worker[0], WORKER);
    });

    it('should allow manager to submit an update of task brief and worker to approve it', async () => {
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
      await colony.approveTaskChange(1, WORKER_ROLE, { from: WORKER });

      const task = await colony.getTask.call(1);
      assert.equal(testHelper.hexToUtf8(task[0]), SPECIFICATION_HASH_UPDATED);
    });

    it('should allow manager to submit an update of task due date and worker to approve it', async () => {
      const dueDate = testHelper.currentBlockTime();

      await colony.makeTask(SPECIFICATION_HASH);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      const txData = await colony.contract.setTaskDueDate.getData(1, dueDate);
      await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
      await colony.approveTaskChange(1, WORKER_ROLE, { from: WORKER });

      const task = await colony.getTask.call(1);
      assert.equal(task[4], dueDate);
    });

    it('should fail if a non-colony call is made to the task update functions', async () => {
      await colony.makeTask(SPECIFICATION_HASH);
      await testHelper.checkErrorRevert(colony.setTaskBrief(1, SPECIFICATION_HASH_UPDATED, { from: OTHER }));
    });

    it('should fail if non-registered role tries to submit an update of task brief', async () => {
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.setTaskRoleUser(1, EVALUATOR_ROLE, EVALUATOR);

      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      await testHelper.checkErrorRevert(colony.proposeTaskChange(txData, 0, 0, { from: OTHER }));
    });

    it('should fail if evaluator tries to submit an update of task brief', async () => {
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.setTaskRoleUser(1, EVALUATOR_ROLE, EVALUATOR);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);

      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      await testHelper.checkErrorRevert(colony.proposeTaskChange(txData, 0, EVALUATOR_ROLE, { from: EVALUATOR }));
    });

    it('should fail if non-registered role tries to approve an update of task brief', async () => {
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.setTaskRoleUser(1, EVALUATOR_ROLE, EVALUATOR);

      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
      await testHelper.checkErrorRevert(colony.approveTaskChange(1, WORKER_ROLE, { from: WORKER }));
    });

    it('should fail if evaluator tries to approve an update of task brief', async () => {
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.setTaskRoleUser(1, EVALUATOR_ROLE, EVALUATOR);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);

      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
      await testHelper.checkErrorRevert(colony.approveTaskChange(1, EVALUATOR_ROLE, { from: EVALUATOR }));
    });

    it('should fail to submit a task update for a non-registered function signature', async () => {
      await colony.makeTask(SPECIFICATION_HASH);
      const txData = await colony.contract.getTaskRole.getData(1, 0);
      await testHelper.checkErrorRevert(colony.proposeTaskChange(txData, 0, 0));
      const transactionCount = await colony.getTransactionCount.call();
      assert.equal(transactionCount.toNumber(), 0);
    });

    it('should fail to submit update of task brief, using an invalid task id', async () => {
      await colony.makeTask(SPECIFICATION_HASH);
      const txData = await colony.contract.setTaskBrief.getData(10, SPECIFICATION_HASH_UPDATED);

      await testHelper.checkErrorRevert(colony.proposeTaskChange(txData, 0, 0));
      const transactionCount = await colony.getTransactionCount.call();
      assert.equal(transactionCount.toNumber(), 0);
    });

    it('should fail to submit update of task brief, if the task was already finalized', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, token, 310 * 1e18);
      const taskId = await testDataGenerator.setupRatedTask(colony, token);
      await colony.finalizeTask(taskId);

      const txData = await colony.contract.setTaskBrief.getData(taskId, SPECIFICATION_HASH_UPDATED);
      await testHelper.checkErrorRevert(colony.proposeTaskChange(txData, 0, MANAGER_ROLE));
    });

    it('should fail to approve task update, using an invalid transaction id', async () => {
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);

      await testHelper.checkErrorRevert(colony.approveTaskChange(10, WORKER_ROLE, { from: WORKER }));
    });

    it('should fail to approve task update twice', async () => {
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      const txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH_UPDATED);
      await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
      await colony.approveTaskChange(1, WORKER_ROLE, { from: WORKER });

      await testHelper.checkErrorRevert(colony.approveTaskChange(1, WORKER_ROLE, { from: WORKER }));
    });
  });

  describe('when submitting task deliverable', () => {
    it('should update task', async () => {
      const dueDate = testHelper.currentBlockTime() + (SECONDS_PER_DAY * 4);
      await testDataGenerator.setupAssignedTask(colony, dueDate);

      let task = await colony.getTask.call(1);
      assert.equal(testHelper.hexToUtf8(task[1]), '');

      const currentTime = testHelper.currentBlockTime();
      await colony.submitTaskDeliverable(1, DELIVERABLE_HASH, { from: WORKER });
      task = await colony.getTask.call(1);
      assert.equal(testHelper.hexToUtf8(task[1]), DELIVERABLE_HASH);
      assert.closeTo(task[7].toNumber(), currentTime, 2);
    });

    it('should fail if I try to submit work for a task that is finalized', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, token, 310 * 1e18);
      const taskId = await testDataGenerator.setupRatedTask(colony, token);
      await colony.finalizeTask(taskId);
      await testHelper.checkErrorRevert(colony.submitTaskDeliverable(taskId, DELIVERABLE_HASH));
    });

    it('should fail if I try to submit work for a task that is past its due date', async () => {
      var dueDate = testHelper.currentBlockTime() - 1;
      await testDataGenerator.setupAssignedTask(colony, dueDate);
      await testHelper.checkErrorRevert(colony.submitTaskDeliverable(1, DELIVERABLE_HASH));
    });

    it('should fail if I try to submit work for a task using an invalid id', async () => {
      await testHelper.checkErrorRevert(colony.submitTaskDeliverable(10, DELIVERABLE_HASH));
    });

    it('should fail if I try to submit work twice', async () => {
      const dueDate = testHelper.currentBlockTime() + (SECONDS_PER_DAY * 4);
      await testDataGenerator.setupAssignedTask(colony, dueDate);
      await colony.submitTaskDeliverable(1, DELIVERABLE_HASH, { from: WORKER });

      await testHelper.checkErrorRevert(colony.submitTaskDeliverable(1, SPECIFICATION_HASH, { from: WORKER }));
      const task = await colony.getTask.call(1);
      assert.equal(testHelper.hexToUtf8(task[1]), DELIVERABLE_HASH);
    });

    it('should fail if I try to submit work if I\'m not the assigned worker', async () => {
      const dueDate = testHelper.currentBlockTime() + (SECONDS_PER_DAY * 4);
      await testDataGenerator.setupAssignedTask(colony, dueDate);

      await testHelper.checkErrorRevert(colony.submitTaskDeliverable(1, SPECIFICATION_HASH, { from: OTHER }));
      const task = await colony.getTask.call(1);
      assert.notEqual(testHelper.hexToUtf8(task[1]), DELIVERABLE_HASH);
    });
  });

  describe('when accepting a task', () => {
    it('should set the task "finalized" property to "true"', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, token, 310 * 1e18);
      const taskId = await testDataGenerator.setupRatedTask(colony, token);
      await colony.finalizeTask(taskId);
      const task = await colony.getTask.call(taskId);
      assert.isTrue(task[2]);
    });

    it('should fail if the task work ratings have not been assigned', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, token, 310 * 1e18);
      const taskId = await testDataGenerator.setupFundedTask(colony, token);
      await testHelper.checkErrorRevert(colony.finalizeTask(taskId));
    });

    it('should fail if a non-admin tries to accept the task', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, token, 310 * 1e18);
      const taskId = await testDataGenerator.setupRatedTask(colony, token);
      await testHelper.checkErrorRevert(colony.finalizeTask(taskId, { from: OTHER }));
    });

    it('should fail if I try to accept a task that was finalized before', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, token, 310 * 1e18);
      const taskId = await testDataGenerator.setupRatedTask(colony, token);
      await colony.finalizeTask(taskId);
      await testHelper.checkErrorRevert(colony.finalizeTask(taskId));
    });

    it('should fail if I try to accept a task using an invalid id', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, token, 310 * 1e18);
      await testDataGenerator.setupRatedTask(colony, token);
      await testHelper.checkErrorRevert(colony.finalizeTask(10));
    });
  });

  describe('when cancelling a task', () => {
    it('should set the task "cancelled" property to "true"', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, token, 310 * 1e18);
      const taskId = await testDataGenerator.setupRatedTask(colony, token);

      await colony.cancelTask(taskId);
      const task = await colony.getTask.call(taskId);
      assert.isTrue(task[3]);
    });

    it('should fail if manager tries to cancel a task that was finalized', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, token, 310 * 1e18);
      const taskId = await testDataGenerator.setupRatedTask(colony, token);
      await colony.finalizeTask(taskId);
      await testHelper.checkErrorRevert(colony.cancelTask(taskId));
    });

    it('should fail if manager tries to cancel a task with invalid id', async () => {
      await testHelper.checkErrorRevert(colony.cancelTask(10));
    });
  });

  describe('when funding tasks', () => {
    it('should be able to set the task payouts for different roles', async () => {
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      await colony.mintTokens(100);
      // Set the manager payout as 5000 wei and 100 colony tokens
      const txData1 = await colony.contract.setTaskPayout.getData(1, MANAGER_ROLE, 0x0, 5000);
      await colony.proposeTaskChange(txData1, 0, 0);
      await colony.approveTaskChange(1, WORKER_ROLE, { from: WORKER });
      const txData2 = await colony.contract.setTaskPayout.getData(1, MANAGER_ROLE, token.address, 100);
      await colony.proposeTaskChange(txData2, 0, 0);
      await colony.approveTaskChange(2, WORKER_ROLE, { from: WORKER });

      // Set the evaluator payout as 40 colony tokens
      const txData3 = await colony.contract.setTaskPayout.getData(1, EVALUATOR_ROLE, token.address, 40);
      await colony.proposeTaskChange(txData3, 0, 0);
      await colony.approveTaskChange(3, WORKER_ROLE, { from: WORKER });

      // Set the worker payout as 98000 wei and 200 colony tokens
      const txData4 = await colony.contract.setTaskPayout.getData(1, 2, 0x0, 98000);
      await colony.proposeTaskChange(txData4, 0, 0);
      await colony.approveTaskChange(4, WORKER_ROLE, { from: WORKER });
      const txData5 = await colony.contract.setTaskPayout.getData(1, WORKER_ROLE, token.address, 200);
      await colony.proposeTaskChange(txData5, 0, 0);
      await colony.approveTaskChange(5, WORKER_ROLE, { from: WORKER });

      const taskPayoutManager1 = await colony.getTaskPayout.call(1, MANAGER_ROLE, 0x0);
      assert.equal(taskPayoutManager1.toNumber(), 5000);
      const taskPayoutManager2 = await colony.getTaskPayout.call(1, MANAGER_ROLE, token.address);
      assert.equal(taskPayoutManager2.toNumber(), 100);

      const taskPayoutEvaluator = await colony.getTaskPayout.call(1, EVALUATOR_ROLE, token.address);
      assert.equal(taskPayoutEvaluator.toNumber(), 40);

      const taskPayoutWorker1 = await colony.getTaskPayout.call(1, WORKER_ROLE, 0x0);
      assert.equal(taskPayoutWorker1.toNumber(), 98000);
      const taskPayoutWorker2 = await colony.getTaskPayout.call(1, WORKER_ROLE, token.address);
      assert.equal(taskPayoutWorker2.toNumber(), 200);
    });
  });

  describe('when claiming payout for a task', () => {
    it('should payout agreed tokens for a task', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, token, 310 * 1e18);
      const taskId = await testDataGenerator.setupRatedTask(colony, token);
      await colony.finalizeTask(taskId);
      const networkBalanceBefore = await token.balanceOf.call(colonyNetwork.address);
      await colony.claimPayout(taskId, MANAGER_ROLE, token.address);
      let networkBalanceAfter = await token.balanceOf.call(colonyNetwork.address);
      assert.equal(networkBalanceAfter.minus(networkBalanceBefore).toNumber(), 1 * 1e18);
      let balance = await token.balanceOf.call(MANAGER);
      assert.equal(balance.toNumber(), 99 * 1e18);
      let potBalance = await colony.getPotBalance.call(2, token.address);
      assert.equal(potBalance.toNumber(), 200 * 1e18);
    });

    it('should payout agreed ether for a task', async () => {
      await colony.send(303);
      await colony.claimColonyFunds(0x0);  
      var dueDate = testHelper.currentBlockTime() - 1;
      const taskId = await testDataGenerator.setupRatedTask(colony, 0x0, dueDate, undefined, undefined, 100, 200);
      await colony.finalizeTask(taskId);
      const commonColonyAddress = await colonyNetwork.getColony.call('Common Colony');
      const balanceBefore = await testHelper.web3GetBalance(MANAGER);
      const commonBalanceBefore = await testHelper.web3GetBalance(commonColonyAddress);
      await colony.claimPayout(taskId, MANAGER_ROLE, 0x0, { gasPrice: 0 });
      const balanceAfter = await testHelper.web3GetBalance(MANAGER);
      const commonBalanceAfter = await testHelper.web3GetBalance(commonColonyAddress);
      assert.equal(balanceAfter.minus(balanceBefore).toNumber(), 99);
      assert.equal(commonBalanceAfter.minus(commonBalanceBefore).toNumber(), 1);
      const potBalance = await colony.getPotBalance.call(2, 0x0);
      assert.equal(potBalance.toNumber(), 200);
    });

    it('should return error when task is not finalized', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, token, 310 * 1e18);
      const taskId = await testDataGenerator.setupRatedTask(colony, token);
      await testHelper.checkErrorRevert(colony.claimPayout(taskId, MANAGER_ROLE, token.address));
    });

    it('should return error when called by account that doesn\'t match the role', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, token, 310 * 1e18);
      const taskId = await testDataGenerator.setupRatedTask(colony, token);
      await colony.finalizeTask(taskId);

      await testHelper.checkErrorRevert(colony.claimPayout(taskId, MANAGER_ROLE, token.address, { from: OTHER }));
    });
  });
});
