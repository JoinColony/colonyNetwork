/* globals artifacts */
import { solSha3 } from 'colony-utils';
import _ from 'lodash';
import testHelper from '../helpers/test-helper';

const RootColony = artifacts.require('RootColony');
const Colony = artifacts.require('Colony');
const EternalStorage = artifacts.require('EternalStorage');
const Ownable = artifacts.require('Ownable');

contract('Colony', function (accounts) {
  let COLONY_KEY;
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];
  const THIRD_ACCOUNT = accounts[2];
  // this value must be high enough to certify that the failure was not due to the amount of gas but due to a exception being thrown
  const GAS_TO_SPEND = 4700000;

  const optionsToSpotTransactionFailure = {
    from: MAIN_ACCOUNT,
    gas: GAS_TO_SPEND,
  };

  let colony;
  let eternalStorage;
  let rootColony;

  before(async function () {
    rootColony = await RootColony.deployed();
  });

  beforeEach(async function () {
    COLONY_KEY = testHelper.getRandomString(7);
    await rootColony.createColony(COLONY_KEY);
    let colony_ = await rootColony.getColony(COLONY_KEY);
    colony = await Colony.at(colony_);
    let extStorageAddress = await colony.eternalStorage.call();
    eternalStorage = await EternalStorage.at(extStorageAddress);
  });

  describe('when created', () => {
    it('should accept ether', async function () {
      await colony.send(1);
      let colonyBalance = web3.eth.getBalance(colony.address);
      assert.equal(colonyBalance.toNumber(), 1);
    });

    it('should not be able to change owner of colony\'s EthernalStorage', async function () {
      const eternalStorageAddress = await colony.eternalStorage.call();
      const ownableStorage = await Ownable.at(eternalStorageAddress);
      let ownerBefore = await ownableStorage.owner.call();
      assert.equal(ownerBefore, colony.address);

      let tx;
      try {
        tx = await ownableStorage.changeOwner(THIRD_ACCOUNT);
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }

      let ownerAfter = await ownableStorage.owner.call();
      assert.equal(ownerAfter, colony.address);
    });

    it('should throw if colony tries to change EternalStorage owner with invalid address', async function () {
      const ownableContract = await Ownable.new();
      let tx;
      try {
        tx = await ownableContract.changeOwner('0x0');
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }

      const owner = await ownableContract.owner.call();
      assert.equal(owner, MAIN_ACCOUNT);
    });

    it('should take deploying user as an owner', async function () {
      const owner = await colony.userIsInRole.call(MAIN_ACCOUNT, 0);
      assert.isTrue(owner, 'First user isn\'t an owner');
    });

    it('should users not be an admin until I add s/he', async function () {
      const admin = await colony.userIsInRole.call(OTHER_ACCOUNT, 1);
      assert.isFalse(admin, 'Other user is an admin');
    });

    it('should other users not be an owner until I add s/he', async function () {
      const owner = await colony.userIsInRole.call(OTHER_ACCOUNT, 0);
      assert.isFalse(owner, 'Other user is an owner');
    });

    it('should keep a count of the number of admins', async function () {
      await colony.addUserToRole(OTHER_ACCOUNT, 1);
      const _adminsCount = await colony.countUsersInRole.call(0);
      assert.equal(_adminsCount.toNumber(), 1, 'Admin count is different from 1');
    });

    it('should keep a count of the number of owners', async function () {
      const _ownersCount = await colony.countUsersInRole.call(0);
      assert.equal(_ownersCount.toNumber(), 1, 'Owners count is different from 1');
    });

    it('should increase owner count by the number of owners added', async function () {
      await colony.addUserToRole(OTHER_ACCOUNT, 0);
      const _ownersCount = await colony.countUsersInRole.call(0);
      assert.equal(_ownersCount.toNumber(), 2, 'Owners count is incorrect');
    });

    it('should decrease owner count by the number of owners removed', async function () {
      await colony.addUserToRole(OTHER_ACCOUNT, 0);
      await colony.removeUserFromRole(OTHER_ACCOUNT, 0);
      const _ownersCount = await colony.countUsersInRole.call(0);
      assert.equal(_ownersCount.toNumber(), 1, 'Owners count is incorrect');
    });

    it('should increase admin count by the number of admins added', async function () {
      await colony.addUserToRole(OTHER_ACCOUNT, 1);
      const _adminsCount = await colony.countUsersInRole.call(1);
      assert.equal(_adminsCount.toNumber(), 1, 'Admin count is incorrect');
    });

    it('should decrease admin count by the number of admins removed', async function () {
      await colony.addUserToRole(OTHER_ACCOUNT, 1);
      await colony.removeUserFromRole(OTHER_ACCOUNT, 1);
      const _adminsCount = await colony.countUsersInRole.call(1);
      assert.equal(_adminsCount.toNumber(), 0, 'Admin count is incorrect');
    });

    it('should allow admins to leave the colony at their own will', async function () {
      await colony.addUserToRole(OTHER_ACCOUNT, 1);
      await colony.removeUserFromRole(OTHER_ACCOUNT, 1, { from: OTHER_ACCOUNT });
      const _adminsCount = await colony.userIsInRole.call(OTHER_ACCOUNT, 1);
      assert.isFalse(_adminsCount, 'Admins cannot leave at their own will');
    });

    it('should allow a revoked owner to be set as an owner again', async function () {
      await colony.addUserToRole(OTHER_ACCOUNT, 0);
      await colony.removeUserFromRole(OTHER_ACCOUNT, 0);
      await colony.addUserToRole(OTHER_ACCOUNT, 0);
      const _isOwner = await colony.userIsInRole.call(OTHER_ACCOUNT, 0);
      assert.isTrue(_isOwner, 'previously revoked owners cannot be set as owners again');
      const _ownersCount = await colony.countUsersInRole.call(0);
      assert.equal(_ownersCount.toNumber(), 2, 'owners count is incorrect');
    });

    it('should allow a revoked admin to be promoted to admin again', async function () {
      await colony.addUserToRole(OTHER_ACCOUNT, 1);
      await colony.removeUserFromRole(OTHER_ACCOUNT, 1);
      await colony.addUserToRole(OTHER_ACCOUNT, 1);
      const _isAdmin = await colony.userIsInRole.call(OTHER_ACCOUNT, 1);
      assert.isTrue(_isAdmin, 'previously revoked admins cannot be promoted to admin again');
      const _adminsCount = await colony.countUsersInRole.call(0);
      assert.equal(_adminsCount.toNumber(), 1, 'admins count is incorrect');
    });

    it('should fail to remove the last owner', async function () {
      let tx;
      try {
        tx = await colony.removeUserFromRole(MAIN_ACCOUNT, 0, optionsToSpotTransactionFailure);
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail to remove owner if not an owner themself', async function () {
      await colony.addUserToRole(OTHER_ACCOUNT, 0);
      await colony.addUserToRole(THIRD_ACCOUNT, 1);

      let tx;
      try {
        tx = await colony.removeUserFromRole(OTHER_ACCOUNT, 0, { from: THIRD_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
      const _isOwner = await colony.userIsInRole.call(OTHER_ACCOUNT, 0);
      assert.isTrue(_isOwner);
    });

    it('should fail to add the same owner address multiple times', async function () {
      let tx;
      try {
        tx = await colony.addUserToRole(MAIN_ACCOUNT, 0, optionsToSpotTransactionFailure);
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail to add the same admin address multiple times', async function () {
      await colony.addUserToRole(MAIN_ACCOUNT, 1, optionsToSpotTransactionFailure);

      let tx;
      try {
        tx = await colony.addUserToRole(MAIN_ACCOUNT, 1, optionsToSpotTransactionFailure);
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail to remove an address that is currently not an admin', async function () {
      await colony.addUserToRole(OTHER_ACCOUNT, 1);
      await colony.removeUserFromRole(OTHER_ACCOUNT, 1);

      let tx;
      try {
        tx = await colony.removeUserFromRole(OTHER_ACCOUNT, 1, optionsToSpotTransactionFailure);
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail to remove an address that was never an admin', async function () {
      let tx;
      try {
        tx = await colony.removeUserFromRole(OTHER_ACCOUNT, 1, optionsToSpotTransactionFailure);
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail to add the same owner address multiple times', async function () {
      let tx;
      try {
        tx = await colony.addUserToRole(MAIN_ACCOUNT, 0, optionsToSpotTransactionFailure);
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail to remove an address that is currently not an owner', async function () {
      await colony.addUserToRole(OTHER_ACCOUNT, 0);
      await colony.removeUserFromRole(OTHER_ACCOUNT, 0);

      let tx;
      try {
        tx = await colony.removeUserFromRole(OTHER_ACCOUNT, 0, optionsToSpotTransactionFailure);
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail to remove an address that was never an owner', async function () {
      let tx;
      try {
        tx = await colony.removeUserFromRole(OTHER_ACCOUNT, 0, optionsToSpotTransactionFailure);
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should generate tokens and assign it to the colony', async function () {
      await colony.generateTokensWei(100);
      const _totalSupply = await colony.totalSupply.call();
      assert.equal(_totalSupply.toNumber(), 100, 'Token total is incorrect');
      const colonyBalance = await colony.balanceOf.call(colony.address);
      assert.equal(colonyBalance.toNumber(), 100, 'Colony balance is incorrect');
    });
  });

  describe('when creating/updating tasks', () => {
    it('should allow admins to make task', async function () {
      await colony.makeTask('name', 'summary');
      const name = await eternalStorage.getStringValue.call(solSha3('task_name', 0));
      assert.equal(name, 'name', 'Wrong task name');
      const summary = await eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      assert.equal(summary, 'summary', 'Wrong task summary');
      const accepted = await eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      assert.isFalse(accepted, 'Wrong accepted value');
      const eth = await eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      assert.equal(eth.toNumber(), 0, 'Wrong task ether value');
      const tokensWei = await eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      assert.equal(tokensWei.toNumber(), 0, 'Wrong tokens wei value');
      const budgetSet = await eternalStorage.getBooleanValue.call(solSha3('task_funded', 0));
      assert.isFalse(budgetSet, 'Wrong initial budgetSet value');
    });

    it('should allow admins to make task with a 160 chars long title', async function () {
      const bigTitle = _.times(160, () => 'A').join('');
      await colony.makeTask(bigTitle, 'summary');
      const name = await eternalStorage.getStringValue.call(solSha3('task_name', 0));
      assert.equal(name, bigTitle, 'Wrong task name');
    });

    it('should allow admins to edit task title', async function () {
      await colony.makeTask('name', 'summary');
      await colony.updateTaskTitle(0, 'nameedit');
      const name = await eternalStorage.getStringValue.call(solSha3('task_name', 0));
      assert.equal(name, 'nameedit', 'Wrong task name');
      const summary = await eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      assert.equal(summary, 'summary', 'Wrong task summary');
      const accepted = await eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      assert.isFalse(accepted, 'Wrong accepted value');
      const eth = await eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      assert.equal(eth.toNumber(), 0, 'Wrong task ether value');
      const tokensWei = await eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      assert.equal(tokensWei.toNumber(), 0, 'Wrong tokens wei value');
    });

    it('should allow admins to edit task summary', async function () {
      await colony.makeTask('name', 'summary');
      await colony.updateTaskSummary(0, 'summaryedit');
      const name = await eternalStorage.getStringValue.call(solSha3('task_name', 0));
      assert.equal(name, 'name', 'Wrong task name');
      const summary = await eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      assert.equal(summary, 'summaryedit', 'Wrong task summary');
      const taskaccepted = await eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      assert.isFalse(taskaccepted, 'Wrong accepted value');
      const eth = await eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      assert.equal(eth.toNumber(), 0, 'Wrong task ether value');
      const tokensWei = await eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      assert.equal(tokensWei.toNumber(), 0, 'Wrong tokens wei value');
    });

    it('should fail if other users non-admins try to edit a task title', async function () {
      await colony.makeTask('name', 'summary');

      let tx;
      try {
        tx = await colony.updateTaskTitle(0, 'nameedit', { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if other users non-admins try to edit a task summary', async function () {
      await colony.makeTask('name', 'summary');

      let tx;
      try {
        tx = await colony.updateTaskSummary(0, 'summary', { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if other users non-admins try to make a task', async function () {
      let tx;
      try {
        tx = await colony.makeTask('name', 'summary', { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });
  });

  describe('when funding tasks', () => {
    it('should allow admins to fund task with ETH', async function () {
      await colony.makeTask('name', 'summary');
      await colony.updateTaskTitle(0, 'nameedit');
      await colony.contributeEthToTask(0, { value: 10000 });
      const name = await eternalStorage.getStringValue.call(solSha3('task_name', 0));
      assert.equal(name, 'nameedit', 'Wrong task name');
      const summary = await eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      assert.equal(summary, 'summary', 'Wrong task summary');
      const accepted = await eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      assert.isFalse(accepted, 'Wrong accepted value');
      const eth = await eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      assert.equal(eth.toNumber(), 10000, 'Wrong task ether value');
      const tokensWei = await eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      assert.equal(tokensWei.toNumber(), 0, 'Wrong tokens wei value');
      const budgetSet = await eternalStorage.getBooleanValue.call(solSha3('task_funded', 0));
      assert.isTrue(budgetSet, 'Wrong tokens wei value');
    });

    it('should fail if non-admins fund task with ETH', async function () {
      await colony.makeTask('name', 'summary');
      let tx;
      try {
        tx = await colony.contributeEthToTask(0, {
          value: 10000,
          from: OTHER_ACCOUNT,
          gas: GAS_TO_SPEND,
        });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should allow admins to fund task with own tokens', async function () {
      await colony.generateTokensWei(100)
      await colony.makeTask('name', 'summary');
      await colony.makeTask('name2', 'summary2');
      await colony.updateTaskTitle(0, 'nameedit');
      let reservedTokensWei = await colony.reservedTokensWei.call();
      assert.equal(0, reservedTokensWei.toNumber(), 'Colony reserved tokens should be set to initially 0 count.');
      const colonyBalance = await colony.balanceOf.call(colony.address);
      assert.equal(colonyBalance.toNumber(), 100, 'Colony address balance should be 100 tokens.');
      await colony.setReservedTokensWeiForTask(0, 100);
      reservedTokensWei = await colony.reservedTokensWei.call();
      assert.equal(100, reservedTokensWei.toNumber(), 'Colony tokens were not reserved for task');
      const budgetSet = await eternalStorage.getBooleanValue.call(solSha3('task_funded', 0));
      assert.isTrue(budgetSet, 'Wrong tokens wei value');
      await colony.completeAndPayTask(0, OTHER_ACCOUNT);
      const otherAccountTokenBalance = await colony.balanceOf.call(OTHER_ACCOUNT);
      assert.equal(otherAccountTokenBalance.toNumber(), 100, 'OTHER_ACCOUNT balance should be 100 tokens.');
      await colony.addUserToRole(OTHER_ACCOUNT, 1);
      await colony.contributeTokensWeiToTask(1, 95, { from: OTHER_ACCOUNT });
      const name = await eternalStorage.getStringValue.call(solSha3('task_name', 1));
      assert.equal(name, 'name2', 'Wrong task name');
      const summary = await eternalStorage.getStringValue.call(solSha3('task_summary', 1));
      assert.equal(summary, 'summary2', 'Wrong task summary');
      const accepted = await eternalStorage.getBooleanValue.call(solSha3('task_accepted', 1));
      assert.isFalse(accepted, 'Wrong accepted value');
      const eth = await eternalStorage.getUIntValue.call(solSha3('task_eth', 1));
      assert.equal(eth.toNumber(), 0, 'Wrong task ether value');
      const tokensWei = await eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 1));
      assert.equal(tokensWei.toNumber(), 95, 'Wrong tokens wei value');
    });

    it('should reserve the correct number of tokens when admins fund tasks with pool tokens', async function () {
      await colony.generateTokensWei(100);
      await colony.makeTask('name', 'summary');
      await colony.setReservedTokensWeiForTask(0, 70);
      let reservedTokensWei = await colony.reservedTokensWei.call();
      assert.equal(reservedTokensWei.toNumber(), 70, 'Has not reserved the right amount of colony tokens.');
      let tokensWei = await eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      assert.equal(tokensWei.toNumber(), 70, 'Wrong tokens wei value');
      let tokensWeiReserved = await eternalStorage.getUIntValue.call(solSha3('task_tokensWeiReserved', 0));
      assert.equal(tokensWeiReserved.toNumber(), 70, 'Wrong tokens wei reserved value');
      let budgetSet = await eternalStorage.getBooleanValue.call(solSha3('task_funded', 0));
      assert.isTrue(budgetSet, 'Wrong budgetSet value');
      await colony.setReservedTokensWeiForTask(0, 100);
      reservedTokensWei = await colony.reservedTokensWei.call();
      assert.equal(reservedTokensWei.toNumber(), 100, 'Has not reserved the right amount of colony tokens.');
      budgetSet = await eternalStorage.getBooleanValue.call(solSha3('task_funded', 0));
      assert.isTrue(budgetSet, 'Wrong tokens wei value');

      let tx;
      try {
        tx = await colony.setReservedTokensWeiForTask(0, 150, optionsToSpotTransactionFailure);
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if admins fund tasks with more pool tokens than they have available', async function () {
      await colony.generateTokensWei(100);
      await colony.makeTask('name', 'summary');
      await colony.makeTask('name2', 'summary2');
      await colony.updateTaskTitle(0, 'nameedit');
      await colony.setReservedTokensWeiForTask(0, 100);
      await colony.completeAndPayTask(0, OTHER_ACCOUNT);
      await colony.generateTokensWei(100);
      await colony.makeTask('name', 'summary');

      let tx;
      try {
        tx = await colony.setReservedTokensWeiForTask(1, 150, optionsToSpotTransactionFailure);
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should take into account number of tokens already assigned when reassigning task budget', async function () {
      await colony.generateTokensWei(100);
      await colony.makeTask('name', 'summary');
      await colony.setReservedTokensWeiForTask(0, 20); // 20 reserved and 80 remaining available
      await colony.completeAndPayTask(0, MAIN_ACCOUNT); // MAIN_ACCOUNT earns 20 tokens
      await colony.makeTask('name1', 'summary1');
      await colony.setReservedTokensWeiForTask(1, 40); // 40 reserved and 40 remaining available
      await colony.contributeTokensWeiToTask(1, 20);
      let tokensWei = await eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 1));
      assert.equal(tokensWei.toNumber(), 60, 'Wrong tokens wei value');
      await colony.setReservedTokensWeiForTask(1, 80); // 80 reserved and 0 remaining available
      let reservedTokensWei = await colony.reservedTokensWei.call();
      assert.equal(reservedTokensWei.toNumber(), 80, 'Has not reserved the right amount of colony tokens.');
      reservedTokensWei = await eternalStorage.getUIntValue.call(solSha3('task_tokensWeiReserved', 1));
      assert.equal(reservedTokensWei.toNumber(), 80, 'Wrong tokens wei reserved value');
      tokensWei = await eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 1));
      assert.equal(tokensWei.toNumber(), 100, 'Wrong tokens wei value');
    });

    it('should not allow non-admin to close task', async function () {
      await colony.makeTask('name', 'summary');
      await colony.updateTaskTitle(0, 'nameedit');
      await colony.contributeEthToTask(0, { value: 10000 });

      let tx;
      try {
        tx = await colony.completeAndPayTask(0, OTHER_ACCOUNT, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      const name = await eternalStorage.getStringValue.call(solSha3('task_name', 0));
      assert.equal(name, 'nameedit', 'Wrong task name');
      const summary = await eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      assert.equal(summary, 'summary', 'Wrong task summary');
      const accepted = await eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      assert.isFalse(accepted, 'Wrong accepted value');
    });

    it('should allow admin to close task', async function () {
      const prevBalance = web3.eth.getBalance(OTHER_ACCOUNT);
      await colony.makeTask('name', 'summary');
      await colony.updateTaskTitle(0, 'nameedit');
      await colony.generateTokensWei(100);
      await colony.setReservedTokensWeiForTask(0, 80);
      await colony.contributeEthToTask(0, { value: 10000 });
      await colony.completeAndPayTask(0, OTHER_ACCOUNT);
      const name = await eternalStorage.getStringValue.call(solSha3('task_name', 0));
      assert.equal(name, 'nameedit', 'Wrong task name');
      const summary = await eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      assert.equal(summary, 'summary', 'Wrong task summary');
      const accepted = await eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      assert.isTrue(accepted, 'Wrong accepted value');
      const eth = await eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      assert.equal(eth.toNumber(), 10000, 'Wrong task ether value');
      const tokensWei = await eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      assert.equal(tokensWei.toNumber(), 80, 'Wrong tokens wei value');
      assert.equal(web3.eth.getBalance(OTHER_ACCOUNT).minus(prevBalance).toNumber(), 10000);
    });

    it('should allow admin to refund task tokens', async function () {
      await colony.generateTokensWei(100);
      await colony.makeTask('name', 'summary');
      await colony.setReservedTokensWeiForTask(0, 80);
      let reservedTokensWei = await colony.reservedTokensWei.call();
      assert.equal(reservedTokensWei.toNumber(), 80, 'Has not reserved the right amount of colony tokens.');
      let taskTokensWei = await eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      assert.equal(taskTokensWei.toNumber(), 80, 'Has not set the task token funds correctly');
      await colony.acceptTask(0);
      await colony.removeReservedTokensWeiForTask(0);
      reservedTokensWei = await colony.reservedTokensWei.call();
      assert.equal(reservedTokensWei.toNumber(), 0, 'Has not released the task colony tokens.');
      taskTokensWei = await eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      assert.equal(taskTokensWei.toNumber(), 80, 'Has not cleared the task token funds correctly');
    });

    it('should NOT allow admin to refund task tokens if task not accepted', async function () {
      await colony.generateTokensWei(100);
      await colony.makeTask('name', 'summary');
      await colony.setReservedTokensWeiForTask(0, 80);
      let reservedTokensWei = await colony.reservedTokensWei.call();
      assert.equal(reservedTokensWei.toNumber(), 80, 'Has not reserved the right amount of colony tokens.');
      let taskTokensWei = await eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      assert.equal(taskTokensWei.toNumber(), 80, 'Has not set the task token funds correctly');

      let tx;
      try {
        tx = await colony.removeReservedTokensWeiForTask(0, optionsToSpotTransactionFailure);
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      reservedTokensWei = await colony.reservedTokensWei.call();
      assert.equal(reservedTokensWei.toNumber(), 80);
      taskTokensWei = await eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      assert.equal(taskTokensWei.toNumber(), 80);
    });

    it.skip('should transfer 95% of tokens to task completor and 5% to rootColony on completing a task', async function () {
      await colony.generateTokensWei(100);
      await colony.makeTask('name', 'summary');
      await colony.updateTaskTitle(0, 'nameedit');
      await colony.setReservedTokensWeiForTask(0, 100);
      await colony.completeAndPayTask(0, OTHER_ACCOUNT);
      const otherAccountTokenBalance = await colony.balanceOf.call(OTHER_ACCOUNT);
      assert.strictEqual(otherAccountTokenBalance.toNumber(), 95, 'Token balance is not 95% of task token value');
      const rootColonyTokenBalance = await colony.balanceOf.call(rootColony.address);
      assert.strictEqual(rootColonyTokenBalance.toNumber(), 5, 'RootColony token balance is not 5% of task token value');
    });

    it('should fail if non-admins try to generate tokens', async function () {
      let tx;
      try {
        tx = await colony.generateTokensWei(100, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if non-admins try to contribute with tokens from the pool', async function () {
      await colony.generateTokensWei(100);
      await colony.makeTask('name', 'summary');

      let tx;
      try {
        tx = await colony.contributeTokensWeiToTask(0, 100, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if non-admins try to contribute with tokens', async function () {
      await colony.generateTokensWei(100);
      await colony.makeTask('name', 'summary');
      let tx;
      try {
        tx = await colony.setReservedTokensWeiForTask(0, 100, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail to fund task with tokens if there are no sufficient tokens in colony', async function () {
      await colony.generateTokensWei(100);
      await colony.makeTask('name', 'summary');

      let tx;
      try {
        tx = await colony.setReservedTokensWeiForTask(0, 200, optionsToSpotTransactionFailure);
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });
  });
});
