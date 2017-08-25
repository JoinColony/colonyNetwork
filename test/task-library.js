/* globals artifacts */
import { solSha3 } from 'colony-utils';
import testHelper from '../helpers/test-helper';

const RootColony = artifacts.require('RootColony');
const Colony = artifacts.require('Colony');
const EternalStorage = artifacts.require('EternalStorage');

contract('TaskLibrary', function (accounts) {
  let COLONY_KEY = 'COLONY_TEST';
  const BIGGER_TASK_SUMMARY = 'Lorem ipsum dolor sit amet, consectetur adipiscing el';
  const BIGGER_TASK_TITLE = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit';
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];
  let colony;
  let eternalStorage;
  const GAS_TO_SPEND = 4700000;

  beforeEach(async function () {
    const rootColony = await RootColony.deployed();
    COLONY_KEY = testHelper.getRandomString(7);
    await rootColony.createColony(COLONY_KEY);
    const address = await rootColony.getColony.call(COLONY_KEY);
    colony = await Colony.at(address);
    const eternalStorageAddress = await colony.eternalStorage.call();
    eternalStorage = EternalStorage.at(eternalStorageAddress);
  });

  describe('when adding tasks', () => {
    it('should add an entry to tasks array', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      const name = await eternalStorage.getStringValue.call(solSha3('task_name', 0));
      assert.equal(name, 'TASK A', 'Wrong task name');
    });

    it('should fail if another user (not the owner) tries to add a new task', async function () {
      let tx;
      try {
        tx = await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY', { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if I give it an invalid title', async function () {
      let tx;
      try {
        tx = await colony.makeTask('', 'INTERESTING TASK SUMMARY', { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });
  });

  describe('when updating existing tasks', () => {
    it('should update data to tasks array', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.updateTaskTitle(0, 'TASK B');
      const name = await eternalStorage.getStringValue.call(solSha3('task_name', 0));
      assert.equal(name, 'TASK B', 'Wrong task name');
      const summary = await eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      assert.equal(summary, 'INTERESTING TASK SUMMARY', 'Wrong task summary');
    });

    it('should not interfere in "accepted", "eth" or "tokens" props', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      const prevAcceptedValue = await eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      const prevEthBalance = await eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      const prevTokensBalance = await eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      await colony.updateTaskTitle(0, 'TASK B');
      const name = await eternalStorage.getStringValue.call(solSha3('task_name', 0));
      assert.equal(name, 'TASK B', 'Incorrect task name');
      const summary = await eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      assert.equal(summary, 'INTERESTING TASK SUMMARY', 'Wrong task summary');
      const accepted = await eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      assert.equal(accepted, prevAcceptedValue, 'Wrong accepted value');
      const eth = await eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      assert.equal(eth.toNumber(), prevEthBalance, 'Wrong task ether value');
      const tokensWei = await eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      assert.equal(tokensWei.toNumber(), prevTokensBalance, 'Wrong tokens wei value');
    });

    it('should fail if the task was already accepted', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.acceptTask(0);
      const accepted = await eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      assert.isTrue(accepted, 'Wrong accepted value');

      let tx;
      try {
        tx = await colony.updateTaskTitle(0, 'TASK B', { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if I give it an invalid title', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      let tx;
      try {
        tx = await colony.updateTaskTitle(0, '', { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if I try to update a task when i\'m not the owner', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      let tx;
      try {
        tx = await colony.updateTaskTitle(0, 'TASK B', { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if I try to update a task using an invalid id', async function () {
      let tx;
      try {
        tx = await colony.updateTaskTitle(10, 'New title', { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });
  });

  describe('when retrieving task data', () => {
    it('should return every task attribute for a valid id', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      const name = await eternalStorage.getStringValue.call(solSha3('task_name', 0));
      assert.equal(name, 'TASK A', 'Wrong task name');
      const summary = await eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      assert.equal(summary, 'INTERESTING TASK SUMMARY', 'Wrong task summary');
      const accepted = await eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      assert.isFalse(accepted, '"accepted" flag is "true" after creating a task');
    });
  });

  describe('when accepting a task', () => {
    it('should the "accepted" prop be set as "true"', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.acceptTask(0);
      const accepted = await eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      assert.isTrue(accepted, '"accepted" flag is incorrect');
    });

    it('should fail if I try to accept a task when i\'m not the owner', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      let tx;
      try {
        tx = await colony.acceptTask(0, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if I try to accept a task was accepted before', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.acceptTask(0);
      let tx;
      try {
        tx = await colony.acceptTask(0, { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if I try to accept a task using an invalid id', async function () {
      let tx;
      try {
        tx = await colony.acceptTask(10, { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });
  });

  describe('when contributing to a task', () => {
    it('should "tokens" prop be raised by the amount of tokens I send', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.generateTokensWei(100);
      await colony.setReservedTokensWeiForTask(0, 10);
      const tokensWei = await eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      assert.equal(tokensWei.toNumber(), 10, '"tokens" value is incorrect');
    });

    it('should "ETH" prop be raised by the amount of ETH I send', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.contributeEthToTask(0, { value: 10 });
      const eth = await eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      assert.equal(eth.toNumber(), 10, '"eth" value is incorrect');
    });

    it('should "ETH" and "tokens" props be raised by the amount of ETH and tokens I send', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.generateTokensWei(100);
      await colony.contributeEthToTask(0, { value: 10 });
      await colony.setReservedTokensWeiForTask(0, 100);
      const eth = await eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      assert.equal(eth.toNumber(), 10, '"eth" value is incorrect');
      const tokensWei = await eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      assert.equal(tokensWei.toNumber(), 100, '"tokens" value is incorrect');
    });

    it('should set the "setBudget" to "true" when the task is funded with ETH', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.contributeEthToTask(0, { value: 10 });
      const budgetSet = await eternalStorage.getBooleanValue.call(solSha3('task_funded', 0));
      assert.isTrue(budgetSet, '"setBudget" task property should be "true"');
    });

    it('should set the "setBudget" to "true" when the task is funded with tokens', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.generateTokensWei(100);
      await colony.setReservedTokensWeiForTask(0, 10);
      const budgetSet = await eternalStorage.getBooleanValue.call(solSha3('task_funded', 0));
      assert.isTrue(budgetSet, '"setBudget" task property should be "true"');
    });

    it('should set the "setBudget" to "true" when the task is funded with 0 tokens', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.generateTokensWei(100);
      await colony.setReservedTokensWeiForTask(0, 0);
      const budgetSet = await eternalStorage.getBooleanValue.call(solSha3('task_funded', 0));
      assert.isTrue(budgetSet, '"setBudget" task property should be "true"');
    });

    it('should fail if I try to contribute to an accepted task', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.acceptTask(0);

      let tx;
      try {
        tx = await colony.contributeEthToTask(0, { value: 10, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if I try to contribute to a nonexistent task', async function () {
      let tx;
      try {
        tx = await colony.contributeEthToTask(100000, { value: 10, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });
  });

  describe('when using count function', () => {
    it('should return zero if no task was added', async function () {
      const taskCount = await colony.getTaskCount.call();
      assert.equal(taskCount, 0, '"count" return is incorrect');
    });

    it('should return the number of tasks if tasks were added', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.makeTask('TASK B', 'INTERESTING TASK SUMMARY');
      await colony.makeTask('TASK C', 'INTERESTING TASK SUMMARY');
      await colony.makeTask('TASK D', 'INTERESTING TASK SUMMARY');
      await colony.makeTask('TASK E', 'INTERESTING TASK SUMMARY');
      await colony.makeTask(BIGGER_TASK_TITLE, BIGGER_TASK_SUMMARY);
      await colony.makeTask(BIGGER_TASK_TITLE, BIGGER_TASK_SUMMARY);
      const taskCount = await colony.getTaskCount.call();
      assert.equal(taskCount, 7, '"count" return is incorrect');
    });
  });
});
