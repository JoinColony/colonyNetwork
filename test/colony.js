/* globals artifacts */
import sha3 from 'solidity-sha3';
import testHelper from '../helpers/test-helper';

const EtherRouter = artifacts.require('EtherRouter');
const Resolver = artifacts.require('Resolver');
const Colony = artifacts.require('Colony');
const IColony = artifacts.require('IColony');
const IColonyNetwork = artifacts.require('IColonyNetwork');
const Token = artifacts.require('Token');
const Authority = artifacts.require('Authority');

contract('Colony', function (accounts) {
  let COLONY_KEY;
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];
  const THIRD_ACCOUNT = accounts[2];
  // This value must be high enough to certify that the failure was not due to the amount of gas but due to a exception being thrown
  const GAS_TO_SPEND = 4700000;
  // The base58 decoded, bytes32 converted value of the task ipfsHash
  const specificationHash = '9bb76d8e6c89b524d34a454b3140df28';
  const newSpecificationHash = '9bb76d8e6c89b524d34a454b3140df29';
  const deliverableHash = '9cc89e3e3d12a672d67a424b3640ce34';
  const newDeliverableHash = '9cc89e3e3d12a672d67a424b3640ce34';

  const optionsToSpotTransactionFailure = {
    from: MAIN_ACCOUNT,
    gas: GAS_TO_SPEND,
  };

  let colony;
  let token;
  let authority;
  let colonyNetwork;

  before(async function () {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async function () {
    COLONY_KEY = testHelper.getRandomString(7);
    await colonyNetwork.createColony(COLONY_KEY);
    let address = await colonyNetwork.getColony.call(COLONY_KEY);
    colony = await IColony.at(address);
    let authorityAddress = await colony.authority.call();
    authority = await Authority.at(authorityAddress);
    let tokenAddress = await colony.getToken.call();
    token = await Token.at(tokenAddress);
  });

  describe('when initialised', () => {
    it('should accept ether', async function () {
      let colonyBalancePre = await testHelper.web3GetBalance(colony.address);
      await colony.send(1);
      let colonyBalance = await testHelper.web3GetBalance(colony.address);
      assert.equal(colonyBalance.toNumber(), 1);
    });

    it('should take colony network as an owner', async function () {
      const owner = await colony.owner.call();
      assert.equal(owner, colonyNetwork.address);
    });

    it('should return zero task count', async function () {
      const taskCount = await colony.getTaskCount.call();
      assert.equal(taskCount, 0);
    });

    it('should fail if a non-admin tries to mint tokens', async function () {
      let tx;
      try {
        tx = await colony.mintTokens(100, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should not allow reinitialisation', async function (){
      let tx;
      try {
        tx = await colony.initialiseColony(0x0, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });
  });

  describe('when working with permissions', () => {
    it('should be able to add a colony owner', async function () {
      await authority.setUserRole(OTHER_ACCOUNT, 0, true);
      const owner = await authority.hasUserRole.call(OTHER_ACCOUNT, 0);
      assert.isTrue(owner);
    });

    it('should be able to add a colony admin', async function () {
      await authority.setUserRole(OTHER_ACCOUNT, 1, true);
      const admin = await authority.hasUserRole.call(OTHER_ACCOUNT, 1);
      assert.isTrue(admin);
    });

    it('should be able to remove a colony owner', async function () {
      await authority.setUserRole(OTHER_ACCOUNT, 0, true);
      await authority.setUserRole(OTHER_ACCOUNT, 0, false);
      const owner = await authority.hasUserRole.call(OTHER_ACCOUNT, 0);
      assert.isFalse(owner);
    });

    it('should be able to remove a colony admin', async function () {
      await authority.setUserRole(OTHER_ACCOUNT, 1, true);
      await authority.setUserRole(OTHER_ACCOUNT, 1, false);
      const admin = await authority.hasUserRole.call(OTHER_ACCOUNT, 1);
      assert.isFalse(admin);
    });
  });

  describe('when creating tasks', () => {
    it('should allow admins to make task', async function () {
      await colony.makeTask(specificationHash);
      const task = await colony.getTask.call(1);
      assert.equal(testHelper.hexToUtf8(task[0]), specificationHash);
      assert.equal(testHelper.hexToUtf8(task[1]), '');
      assert.isFalse(task[2]);
      assert.isFalse(task[3]);
      assert.equal(task[4].toNumber(), 0);
      assert.equal(task[5].toNumber(), 0);
    });

    it('should fail if a non-admin user tries to make a task', async function () {
      let tx;
      try {
        tx = await colony.makeTask(specificationHash, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should set the task manager as the creator', async function () {
      await colony.makeTask(specificationHash);
      const taskCount = await colony.getTaskCount.call();
      assert.equal(taskCount.toNumber(), 1);
      const taskManager = await colony.getTaskRole.call(1, 0);
      assert.equal(taskManager[0], MAIN_ACCOUNT);
    });

    it('should return the correct number of tasks', async function () {
      await colony.makeTask(specificationHash);
      await colony.makeTask(specificationHash);
      await colony.makeTask(specificationHash);
      await colony.makeTask(specificationHash);
      await colony.makeTask(specificationHash);
      const taskCount = await colony.getTaskCount.call();

      assert.equal(taskCount.toNumber(), 5);
    });

    it("should log a TaskAdded event", async function () {
      const tx = await colony.makeTask(ipfsDecodedHash);
      assert.equal(tx.logs[0].event, 'TaskAdded');
    });
  });

  describe('when updating tasks', () => {
    it('should allow the worker and evaluator roles to be assigned', async function () {
      await colony.makeTask(specificationHash);
      await colony.setTaskEvaluator(1, OTHER_ACCOUNT);
      const evaluator = await colony.getTaskRole.call(1, 1);
      assert.equal(evaluator[0], OTHER_ACCOUNT);

      await colony.setTaskWorker(1, THIRD_ACCOUNT);
      const worker = await colony.getTaskRole.call(1, 2);
      assert.equal(worker[0], THIRD_ACCOUNT);
    });

    it('should allow manager to submit an update of task brief and worker to approve it', async function () {
      await colony.makeTask(specificationHash);
      await colony.setTaskWorker(1, OTHER_ACCOUNT);
      const txData = await colony.contract.setTaskBrief.getData(1, newSpecificationHash);
      await colony.proposeTaskChange(txData, 0, 0);
      await colony.approveTaskChange(1, 2, { from: OTHER_ACCOUNT });

      const task = await colony.getTask.call(1);
      assert.equal(testHelper.hexToUtf8(task[0]), newSpecificationHash);
    });

    it('should allow manager to submit an update of task due date and worker to approve it', async function () {
      var dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 1);
      dueDate = dueDate.getTime();

      await colony.makeTask(specificationHash);
      await colony.setTaskWorker(1, OTHER_ACCOUNT);
      const txData = await colony.contract.setTaskDueDate.getData(1, dueDate);
      await colony.proposeTaskChange(txData, 0, 0);
      await colony.approveTaskChange(1, 2, { from: OTHER_ACCOUNT });

      const task = await colony.getTask.call(1);
      assert.equal(task[4], dueDate);
    });

    it('should fail if a non-colony call is made to the task update functions', async function () {
      await colony.makeTask(specificationHash);
      let tx;
      try {
        tx = await colony.setTaskBrief(1, newSpecificationHash, { gas: GAS_TO_SPEND, from: THIRD_ACCOUNT });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if non-registered role tries to submit an update of task brief', async function () {
      await colony.makeTask(specificationHash);
      await colony.setTaskEvaluator(1, OTHER_ACCOUNT);

      const txData = await colony.contract.setTaskBrief.getData(1, newSpecificationHash);

      let tx;
      try {
        tx = await colony.proposeTaskChange(txData, 0, 0, { from: THIRD_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if evaluator tries to submit an update of task brief', async function () {
      await colony.makeTask(specificationHash);
      await colony.setTaskEvaluator(1, OTHER_ACCOUNT);
      await colony.setTaskWorker(1, THIRD_ACCOUNT);

      const txData = await colony.contract.setTaskBrief.getData(1, newSpecificationHash);

      let tx;
      try {
        tx = await colony.proposeTaskChange(txData, 0, 1, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if non-registered role tries to approve an update of task brief', async function () {
      await colony.makeTask(specificationHash);
      await colony.setTaskEvaluator(1, OTHER_ACCOUNT);

      const txData = await colony.contract.setTaskBrief.getData(1, newSpecificationHash);
      await colony.proposeTaskChange(txData, 0, 0);

      let tx;
      try {
        tx = await colony.approveTaskChange(1, 2, { from: THIRD_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if evaluator tries to approve an update of task brief', async function () {
      await colony.makeTask(specificationHash);
      await colony.setTaskEvaluator(1, OTHER_ACCOUNT);
      await colony.setTaskWorker(1, THIRD_ACCOUNT);

      const txData = await colony.contract.setTaskBrief.getData(1, newSpecificationHash);
      await colony.proposeTaskChange(txData, 0, 0);

      let tx;
      try {
        tx = await colony.approveTaskChange(1, 1, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail to submit a task update for a non-registered function signature', async function () {
      await colony.makeTask(specificationHash);
      const txData = await colony.contract.getTaskRole.getData(1, 0);

      let tx;
      try {
        tx = await colony.proposeTaskChange(txData, 0, 0, { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      const transactionCount = await colony.getTransactionCount.call();
      assert.equal(transactionCount.toNumber(), 0);
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail to submit update of task brief, using an invalid task id', async function () {
      await colony.makeTask(specificationHash);
      const txData = await colony.contract.setTaskBrief.getData(10, newSpecificationHash);

      let tx;
      try {
        tx = await colony.proposeTaskChange(txData, 0, 0, { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }

      const transactionCount = await colony.getTransactionCount.call();
      assert.equal(transactionCount.toNumber(), 0);
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail to submit update of task brief, if the task was already accepted', async function () {
      await colony.makeTask(specificationHash);
      await colony.acceptTask(1);
      const txData = await colony.contract.setTaskBrief.getData(1, newSpecificationHash);

      let tx;
      try {
        tx = await colony.proposeTaskChange(txData, 0, 0, { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }

      const transactionCount = await colony.getTransactionCount.call();
      assert.equal(transactionCount.toNumber(), 0);
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail to approve task update, using an invalid transaction id', async function () {
      await colony.makeTask(specificationHash);
      await colony.setTaskWorker(1, OTHER_ACCOUNT);
      const txData = await colony.contract.setTaskBrief.getData(1, newSpecificationHash);
      await colony.proposeTaskChange(txData, 0, 0);

      let tx;
      try {
        tx = await colony.approveTaskChange(10, 2, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }

      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail to approve task update twice', async function () {
      await colony.makeTask(specificationHash);
      await colony.setTaskWorker(1, OTHER_ACCOUNT);
      const txData = await colony.contract.setTaskBrief.getData(1, newSpecificationHash);
      await colony.proposeTaskChange(txData, 0, 0);
      await colony.approveTaskChange(1, 2, { from: OTHER_ACCOUNT });

      let tx;
      try {
        tx = await colony.approveTaskChange(1, 2, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }

      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });
  });

  describe('when submitting task deliverable', () => {
    it('should update task', async function () {
      await colony.makeTask(specificationHash);
      await colony.setTaskEvaluator(1, OTHER_ACCOUNT);
      await colony.setTaskWorker(1, THIRD_ACCOUNT);
      let task = await colony.getTask.call(1);
      assert.equal(testHelper.hexToUtf8(task[1]), '');

      await colony.submitTaskDeliverable(1, deliverableHash, { from: THIRD_ACCOUNT });
      task = await colony.getTask.call(1);
      assert.equal(testHelper.hexToUtf8(task[1]), deliverableHash);
    });

    it('should fail if I try to submit work for a task that is accepted', async function () {
      await colony.makeTask(specificationHash);
      await colony.setTaskEvaluator(1, OTHER_ACCOUNT);
      await colony.setTaskWorker(1, THIRD_ACCOUNT);
      await colony.acceptTask(1);
      let tx;
      try {
        tx = await colony.submitTaskDeliverable(1, deliverableHash, { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if I try to submit work for a task using an invalid id', async function () {
      let tx;
      try {
        tx = await colony.submitTaskDeliverable(10, deliverableHash, { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if I try to submit work twice', async function () {
      await colony.makeTask(specificationHash);
      await colony.setTaskEvaluator(1, OTHER_ACCOUNT);
      await colony.setTaskWorker(1, THIRD_ACCOUNT);
      await colony.submitTaskDeliverable(1, deliverableHash, { from: THIRD_ACCOUNT });
      
      let tx;
      try {
        tx = await colony.submitTaskDeliverable(1, specificationHash, { from: THIRD_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      const task = await colony.getTask.call(1);
      assert.equal(testHelper.hexToUtf8(task[1]), deliverableHash);
    });
  });

  describe('when accepting a task', () => {
    it('should set the task "accepted" property to "true"', async function () {
      await colony.makeTask(specificationHash);
      await colony.acceptTask(1);
      const task = await colony.getTask.call(1);
      assert.isTrue(task[2]);
    });

    it('should fail if a non-admin tries to accept the task', async function () {
      await colony.makeTask(specificationHash);
      let tx;
      try {
        tx = await colony.acceptTask(1, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if I try to accept a task that was accepted before', async function () {
      await colony.makeTask(specificationHash);
      await colony.acceptTask(1);
      let tx;
      try {
        tx = await colony.acceptTask(1, { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if I try to accept a task using an invalid id', async function () {
      let tx;
      try {
        tx = await colony.acceptTask(10, { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });
  });

  describe('when cancelling a task', () => {
    it('should set the task "cancelled" property to "true"', async function () {
      await colony.makeTask(specificationHash);
      await colony.cancelTask(1);
      const task = await colony.getTask.call(1);
      assert.isTrue(task[3]);
    });

    it('should fail if manager tries to cancel a task that was accepted', async function () {
      await colony.makeTask(specificationHash);
      await colony.acceptTask(1);
      let tx;
      try {
        tx = await colony.cancelTask(1, { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if manager tries to cancel a task with invalid id', async function () {
      let tx;
      try {
        tx = await colony.cancelTask(10, { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });
  });

  describe('when funding tasks', () => {
    it('should be able to set the task payouts for different roles', async function () {
      await colony.makeTask(specificationHash);
      await colony.setTaskWorker(1, OTHER_ACCOUNT);
      await colony.mintTokens(100);
      // Set the manager payout as 5000 wei and 100 colony tokens
      const txData1 = await colony.contract.setTaskPayout.getData(1, 0, 0x0, 5000);
      await colony.proposeTaskChange(txData1, 0, 0);
      await colony.approveTaskChange(1, 2, { from: OTHER_ACCOUNT });
      const txData2 = await colony.contract.setTaskPayout.getData(1, 0, token.address, 100);
      await colony.proposeTaskChange(txData2, 0, 0);
      await colony.approveTaskChange(2, 2, { from: OTHER_ACCOUNT });

      // Set the evaluator payout as 40 colony tokens
      const txData3 = await colony.contract.setTaskPayout.getData(1, 1, token.address, 40);
      await colony.proposeTaskChange(txData3, 0, 0);
      await colony.approveTaskChange(3, 2, { from: OTHER_ACCOUNT });

      // Set the worker payout as 98000 wei and 200 colony tokens
      const txData4 = await colony.contract.setTaskPayout.getData(1, 2, 0x0, 98000);
      await colony.proposeTaskChange(txData4, 0, 0);
      await colony.approveTaskChange(4, 2, { from: OTHER_ACCOUNT });
      const txData5 = await colony.contract.setTaskPayout.getData(1, 2, token.address, 200);
      await colony.proposeTaskChange(txData5, 0, 0);
      await colony.approveTaskChange(5, 2, { from: OTHER_ACCOUNT });

      const taskPayoutManager1 = await colony.getTaskPayout.call(1, 0, 0x0);
      assert.equal(taskPayoutManager1.toNumber(), 5000);
      const taskPayoutManager2 = await colony.getTaskPayout.call(1, 0, token.address);
      assert.equal(taskPayoutManager2.toNumber(), 100);

      const taskPayoutEvaluator = await colony.getTaskPayout.call(1, 1, token.address);
      assert.equal(taskPayoutEvaluator.toNumber(), 40);

      const taskPayoutWorker1 = await colony.getTaskPayout.call(1, 2, 0x0);
      assert.equal(taskPayoutWorker1.toNumber(), 98000);
      const taskPayoutWorker2 = await colony.getTaskPayout.call(1, 2, token.address);
      assert.equal(taskPayoutWorker2.toNumber(), 200);
    });

  });

  describe('when claiming payout for a task', () => {

    it('should payout agreed tokens for a task', async function (){
      await colony.makeTask(specificationHash);
      await colony.setTaskWorker(1, OTHER_ACCOUNT);
      await colony.mintTokens(300);
      await colony.claimColonyFunds(token.address);
      // Set the manager payout as 200 colony tokens
      const txData = await colony.contract.setTaskPayout.getData(1, 0, token.address, 200);
      await colony.proposeTaskChange(txData, 0, 0);
      await colony.approveTaskChange(1, 2, { from: OTHER_ACCOUNT });

      await colony.moveFundsBetweenPots(1,2,200,token.address);
      await colony.acceptTask(1);
      let networkBalanceBefore = await token.balanceOf.call(colonyNetwork.address);
      await colony.claimPayout(1, 0, token.address);
      let networkBalanceAfter = await token.balanceOf.call(colonyNetwork.address);
      assert.equal(networkBalanceAfter.minus(networkBalanceBefore).toNumber(), 2);
      let balance = await token.balanceOf.call(accounts[0]);
      assert.equal(balance.toNumber(), 198);
      let potBalance = await colony.getPotBalance.call(2, token.address);
      assert.equal(potBalance.toNumber(), 0);
    });

    it('should payout agreed ether for a task', async function (){
      await colony.makeTask(specificationHash);
      await colony.setTaskWorker(1, OTHER_ACCOUNT);
      await colony.send(300);
      await colony.claimColonyFunds(0x0);
      // Set the manager payout as 200 wei
      const txData = await colony.contract.setTaskPayout.getData(1, 0, 0x0, 200);
      await colony.proposeTaskChange(txData, 0, 0);
      await colony.approveTaskChange(1, 2, { from: OTHER_ACCOUNT });
      await colony.moveFundsBetweenPots(1,2,200,0x0);
      await colony.acceptTask(1);
      let commonColonyAddress = await colonyNetwork.getColony.call("Common Colony");
      let balanceBefore = await testHelper.web3GetBalance(accounts[0]);
      let commonBalanceBefore = await testHelper.web3GetBalance(commonColonyAddress);
      await colony.claimPayout(1, 0, 0x0, {gasPrice: 0});
      let balanceAfter = await testHelper.web3GetBalance(accounts[0]);
      let commonBalanceAfter = await testHelper.web3GetBalance(commonColonyAddress);
      assert.equal(balanceAfter.minus(balanceBefore).toNumber(), 198);
      assert.equal(commonBalanceAfter.minus(commonBalanceBefore).toNumber(), 2);
      let potBalance = await colony.getPotBalance.call(2, 0x0);
      assert.equal(potBalance.toNumber(), 0);
    });

    it('should return error when task is not accepted', async function () {
      await colony.makeTask(specificationHash);
      await colony.mintTokens(100);
      // Set the manager payout as 200 colony tokens
      const txData1 = await colony.contract.setTaskPayout.getData(1, 0, token.address, 200);
      await colony.proposeTaskChange(txData1, 0, 0);

      let tx;
      try {
        tx = await colony.claimPayout(1, 0, token.address, { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should return error when called by account that doesn\'t match the role', async function () {
      await colony.makeTask(specificationHash);
      await colony.mintTokens(100);
      // Set the manager payout as 200 colony tokens
      const txData1 = await colony.contract.setTaskPayout.getData(1, 0, token.address, 200);
      await colony.proposeTaskChange(txData1, 0, 0);
      await colony.acceptTask(1);

      let tx;
      try {
        tx = await colony.claimPayout(1, 0, token.address, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });
  });
});
