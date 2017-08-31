/* globals artifacts */
import sha3 from 'solidity-sha3';
import testHelper from '../helpers/test-helper';

const ColonyNetwork = artifacts.require('ColonyNetwork');
const Colony = artifacts.require('Colony');
const Authority = artifacts.require('Authority');
const EternalStorage = artifacts.require('EternalStorage');

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
  let authority;
  let eternalStorage;
  let colonyNetwork;

  before(async function () {
    colonyNetwork = await ColonyNetwork.new();
  });

  beforeEach(async function () {
    COLONY_KEY = testHelper.getRandomString(7);
    await colonyNetwork.createColony(COLONY_KEY);
    let address = await colonyNetwork.getColony(COLONY_KEY);
    colony = await Colony.at(address);
    let authorityAddress = await colony.authority.call();
    authority = await Authority.at(authorityAddress);
    let extStorageAddress = await colony.eternalStorage.call();
    eternalStorage = await EternalStorage.at(extStorageAddress);
  });

  describe('when initialised', () => {
    it('should accept ether', async function () {
      await colony.send(1);
      let colonyBalance = web3.eth.getBalance(colony.address);
      assert.equal(colonyBalance.toNumber(), 1);
    });

    it('should take deploying user as an owner', async function () {
      const owner = await colony.owner.call();
      assert.equal(owner, MAIN_ACCOUNT);
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

  describe('when creating/updating tasks', () => {
    it('should allow admins to make task', async function () {
      await colony.makeTask('name', 'summary');
      const name = await eternalStorage.getStringValue.call(sha3('task_name', 0));
      assert.equal(name, 'name', 'Wrong task name');
      const summary = await eternalStorage.getStringValue.call(sha3('task_summary', 0));
      assert.equal(summary, 'summary', 'Wrong task summary');
      const accepted = await eternalStorage.getBooleanValue.call(sha3('task_accepted', 0));
      assert.isFalse(accepted, 'Wrong accepted value');
      const eth = await eternalStorage.getUIntValue.call(sha3('task_eth', 0));
      assert.equal(eth.toNumber(), 0, 'Wrong task ether value');
      const tokensWei = await eternalStorage.getUIntValue.call(sha3('task_tokensWei', 0));
      assert.equal(tokensWei.toNumber(), 0, 'Wrong tokens wei value');
      const budgetSet = await eternalStorage.getBooleanValue.call(sha3('task_funded', 0));
      assert.isFalse(budgetSet, 'Wrong initial budgetSet value');
    });

    it('should allow admins to make task with a 160 chars long title', async function () {
      const bigTitle = _.times(160, () => 'A').join('');
      await colony.makeTask(bigTitle, 'summary');
      const name = await eternalStorage.getStringValue.call(sha3('task_name', 0));
      assert.equal(name, bigTitle, 'Wrong task name');
    });

    it('should allow admins to edit task title', async function () {
      await colony.makeTask('name', 'summary');
      await colony.updateTaskTitle(0, 'nameedit');
      const name = await eternalStorage.getStringValue.call(sha3('task_name', 0));
      assert.equal(name, 'nameedit', 'Wrong task name');
      const summary = await eternalStorage.getStringValue.call(sha3('task_summary', 0));
      assert.equal(summary, 'summary', 'Wrong task summary');
      const accepted = await eternalStorage.getBooleanValue.call(sha3('task_accepted', 0));
      assert.isFalse(accepted, 'Wrong accepted value');
      const eth = await eternalStorage.getUIntValue.call(sha3('task_eth', 0));
      assert.equal(eth.toNumber(), 0, 'Wrong task ether value');
      const tokensWei = await eternalStorage.getUIntValue.call(sha3('task_tokensWei', 0));
      assert.equal(tokensWei.toNumber(), 0, 'Wrong tokens wei value');
    });

    it('should allow admins to edit task summary', async function () {
      await colony.makeTask('name', 'summary');
      await colony.updateTaskSummary(0, 'summaryedit');
      const name = await eternalStorage.getStringValue.call(sha3('task_name', 0));
      assert.equal(name, 'name', 'Wrong task name');
      const summary = await eternalStorage.getStringValue.call(sha3('task_summary', 0));
      assert.equal(summary, 'summaryedit', 'Wrong task summary');
      const taskaccepted = await eternalStorage.getBooleanValue.call(sha3('task_accepted', 0));
      assert.isFalse(taskaccepted, 'Wrong accepted value');
      const eth = await eternalStorage.getUIntValue.call(sha3('task_eth', 0));
      assert.equal(eth.toNumber(), 0, 'Wrong task ether value');
      const tokensWei = await eternalStorage.getUIntValue.call(sha3('task_tokensWei', 0));
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
      const name = await eternalStorage.getStringValue.call(sha3('task_name', 0));
      assert.equal(name, 'nameedit', 'Wrong task name');
      const summary = await eternalStorage.getStringValue.call(sha3('task_summary', 0));
      assert.equal(summary, 'summary', 'Wrong task summary');
      const accepted = await eternalStorage.getBooleanValue.call(sha3('task_accepted', 0));
      assert.isFalse(accepted, 'Wrong accepted value');
      const eth = await eternalStorage.getUIntValue.call(sha3('task_eth', 0));
      assert.equal(eth.toNumber(), 10000, 'Wrong task ether value');
      const tokensWei = await eternalStorage.getUIntValue.call(sha3('task_tokensWei', 0));
      assert.equal(tokensWei.toNumber(), 0, 'Wrong tokens wei value');
      const budgetSet = await eternalStorage.getBooleanValue.call(sha3('task_funded', 0));
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
      const budgetSet = await eternalStorage.getBooleanValue.call(sha3('task_funded', 0));
      assert.isTrue(budgetSet, 'Wrong tokens wei value');
      await colony.completeAndPayTask(0, OTHER_ACCOUNT);
      const otherAccountTokenBalance = await colony.balanceOf.call(OTHER_ACCOUNT);
      assert.equal(otherAccountTokenBalance.toNumber(), 100, 'OTHER_ACCOUNT balance should be 100 tokens.');
      await colony.addUserToRole(OTHER_ACCOUNT, 1);
      await colony.contributeTokensWeiToTask(1, 95, { from: OTHER_ACCOUNT });
      const name = await eternalStorage.getStringValue.call(sha3('task_name', 1));
      assert.equal(name, 'name2', 'Wrong task name');
      const summary = await eternalStorage.getStringValue.call(sha3('task_summary', 1));
      assert.equal(summary, 'summary2', 'Wrong task summary');
      const accepted = await eternalStorage.getBooleanValue.call(sha3('task_accepted', 1));
      assert.isFalse(accepted, 'Wrong accepted value');
      const eth = await eternalStorage.getUIntValue.call(sha3('task_eth', 1));
      assert.equal(eth.toNumber(), 0, 'Wrong task ether value');
      const tokensWei = await eternalStorage.getUIntValue.call(sha3('task_tokensWei', 1));
      assert.equal(tokensWei.toNumber(), 95, 'Wrong tokens wei value');
    });

    it('should reserve the correct number of tokens when admins fund tasks with pool tokens', async function () {
      await colony.generateTokensWei(100);
      await colony.makeTask('name', 'summary');
      await colony.setReservedTokensWeiForTask(0, 70);
      let reservedTokensWei = await colony.reservedTokensWei.call();
      assert.equal(reservedTokensWei.toNumber(), 70, 'Has not reserved the right amount of colony tokens.');
      let tokensWei = await eternalStorage.getUIntValue.call(sha3('task_tokensWei', 0));
      assert.equal(tokensWei.toNumber(), 70, 'Wrong tokens wei value');
      let tokensWeiReserved = await eternalStorage.getUIntValue.call(sha3('task_tokensWeiReserved', 0));
      assert.equal(tokensWeiReserved.toNumber(), 70, 'Wrong tokens wei reserved value');
      let budgetSet = await eternalStorage.getBooleanValue.call(sha3('task_funded', 0));
      assert.isTrue(budgetSet, 'Wrong budgetSet value');
      await colony.setReservedTokensWeiForTask(0, 100);
      reservedTokensWei = await colony.reservedTokensWei.call();
      assert.equal(reservedTokensWei.toNumber(), 100, 'Has not reserved the right amount of colony tokens.');
      budgetSet = await eternalStorage.getBooleanValue.call(sha3('task_funded', 0));
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
      let tokensWei = await eternalStorage.getUIntValue.call(sha3('task_tokensWei', 1));
      assert.equal(tokensWei.toNumber(), 60, 'Wrong tokens wei value');
      await colony.setReservedTokensWeiForTask(1, 80); // 80 reserved and 0 remaining available
      let reservedTokensWei = await colony.reservedTokensWei.call();
      assert.equal(reservedTokensWei.toNumber(), 80, 'Has not reserved the right amount of colony tokens.');
      reservedTokensWei = await eternalStorage.getUIntValue.call(sha3('task_tokensWeiReserved', 1));
      assert.equal(reservedTokensWei.toNumber(), 80, 'Wrong tokens wei reserved value');
      tokensWei = await eternalStorage.getUIntValue.call(sha3('task_tokensWei', 1));
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

      const name = await eternalStorage.getStringValue.call(sha3('task_name', 0));
      assert.equal(name, 'nameedit', 'Wrong task name');
      const summary = await eternalStorage.getStringValue.call(sha3('task_summary', 0));
      assert.equal(summary, 'summary', 'Wrong task summary');
      const accepted = await eternalStorage.getBooleanValue.call(sha3('task_accepted', 0));
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
      const name = await eternalStorage.getStringValue.call(sha3('task_name', 0));
      assert.equal(name, 'nameedit', 'Wrong task name');
      const summary = await eternalStorage.getStringValue.call(sha3('task_summary', 0));
      assert.equal(summary, 'summary', 'Wrong task summary');
      const accepted = await eternalStorage.getBooleanValue.call(sha3('task_accepted', 0));
      assert.isTrue(accepted, 'Wrong accepted value');
      const eth = await eternalStorage.getUIntValue.call(sha3('task_eth', 0));
      assert.equal(eth.toNumber(), 10000, 'Wrong task ether value');
      const tokensWei = await eternalStorage.getUIntValue.call(sha3('task_tokensWei', 0));
      assert.equal(tokensWei.toNumber(), 80, 'Wrong tokens wei value');
      assert.equal(web3.eth.getBalance(OTHER_ACCOUNT).minus(prevBalance).toNumber(), 10000);
    });

    it('should allow admin to refund task tokens', async function () {
      await colony.generateTokensWei(100);
      await colony.makeTask('name', 'summary');
      await colony.setReservedTokensWeiForTask(0, 80);
      let reservedTokensWei = await colony.reservedTokensWei.call();
      assert.equal(reservedTokensWei.toNumber(), 80, 'Has not reserved the right amount of colony tokens.');
      let taskTokensWei = await eternalStorage.getUIntValue.call(sha3('task_tokensWei', 0));
      assert.equal(taskTokensWei.toNumber(), 80, 'Has not set the task token funds correctly');
      await colony.acceptTask(0);
      await colony.removeReservedTokensWeiForTask(0);
      reservedTokensWei = await colony.reservedTokensWei.call();
      assert.equal(reservedTokensWei.toNumber(), 0, 'Has not released the task colony tokens.');
      taskTokensWei = await eternalStorage.getUIntValue.call(sha3('task_tokensWei', 0));
      assert.equal(taskTokensWei.toNumber(), 80, 'Has not cleared the task token funds correctly');
    });

    it('should NOT allow admin to refund task tokens if task not accepted', async function () {
      await colony.generateTokensWei(100);
      await colony.makeTask('name', 'summary');
      await colony.setReservedTokensWeiForTask(0, 80);
      let reservedTokensWei = await colony.reservedTokensWei.call();
      assert.equal(reservedTokensWei.toNumber(), 80, 'Has not reserved the right amount of colony tokens.');
      let taskTokensWei = await eternalStorage.getUIntValue.call(sha3('task_tokensWei', 0));
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
      taskTokensWei = await eternalStorage.getUIntValue.call(sha3('task_tokensWei', 0));
      assert.equal(taskTokensWei.toNumber(), 80);
    });

    it.skip('should transfer 95% of tokens to task completor and 5% to colonyNetwork on completing a task', async function () {
      await colony.generateTokensWei(100);
      await colony.makeTask('name', 'summary');
      await colony.updateTaskTitle(0, 'nameedit');
      await colony.setReservedTokensWeiForTask(0, 100);
      await colony.completeAndPayTask(0, OTHER_ACCOUNT);
      const otherAccountTokenBalance = await colony.balanceOf.call(OTHER_ACCOUNT);
      assert.strictEqual(otherAccountTokenBalance.toNumber(), 95, 'Token balance is not 95% of task token value');
      const colonyNetworkTokenBalance = await colony.balanceOf.call(colonyNetwork.address);
      assert.strictEqual(colonyNetworkTokenBalance.toNumber(), 5, 'ColonyNetwork token balance is not 5% of task token value');
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
