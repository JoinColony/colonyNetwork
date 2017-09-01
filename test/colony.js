/* globals artifacts */
import sha3 from 'solidity-sha3';
import testHelper from '../helpers/test-helper';

const ColonyNetwork = artifacts.require('ColonyNetwork');
const Colony = artifacts.require('Colony');
const Token = artifacts.require('Token');
const Authority = artifacts.require('Authority');

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
  let token;
  let authority;
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
    let tokenAddress = await colony.token.call();
    token = await Token.at(tokenAddress);
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

    it('should return zero task count', async function () {
      const taskCount = await colony.taskCount.call();
      assert.equal(taskCount, 0);
    });

    it('should fail if a non-admin tries to mint tokens', async function () {
      let tx;
      try {
        tx = await colony.mintTokens(100, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
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
      await colony.makeTask('name', 'summary');
      const task = await colony.getTask(1);
      assert.equal(task[0], 'name');
      assert.equal(task[1], 'summary');
      assert.isFalse(task[2]);
      assert.equal(task[3].toNumber(), 0);
      assert.equal(task[4].toNumber(), 0);
      assert.equal(task[5].toNumber(), 0);
      assert.isFalse(task[6]);
    });

    it('should allow admins to make task with a 160 chars long title', async function () {
      const bigTitle = _.times(160, () => 'A').join('');
      await colony.makeTask(bigTitle, 'summary');
      const task = await colony.getTask(1);
      assert.equal(task[0], bigTitle, 'Wrong task name');
    });

    it('should fail if admin tries to make a task with empty title', async function () {
      let tx;
      try {
        tx = await colony.makeTask('', 'INTERESTING TASK SUMMARY', { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if a non-admin user tries to make a task', async function () {
      let tx;
      try {
        tx = await colony.makeTask('name', 'summary', { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });
  });

  describe('when updating existing tasks', () => {
    it('should allow admins to edit task title', async function () {
      await colony.makeTask('name', 'summary');
      await colony.updateTaskTitle(1, 'nameedit');
      const task = await colony.getTask(1);
      assert.equal(task[0], 'nameedit');
    });

    it('should allow admins to edit task summary', async function () {
      await colony.makeTask('name', 'summary');
      await colony.updateTaskSummary(1, 'summaryedit');
      const task = await colony.getTask(1);
      assert.equal(task[1], 'summaryedit');
    });

    it('should fail if a non-admin user tries to edit a task title', async function () {
      await colony.makeTask('name', 'summary');

      let tx;
      try {
        tx = await colony.updateTaskTitle(1, 'nameedit', { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if a non-admin user tries to edit a task summary', async function () {
      await colony.makeTask('name', 'summary');

      let tx;
      try {
        tx = await colony.updateTaskSummary(1, 'summary', { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if the task was already accepted', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.acceptTask(1);
      const task = await colony.getTask(1);
      assert.isTrue(task[2], 'Wrong accepted value');

      let tx;
      try {
        tx = await colony.updateTaskTitle(1, 'TASK B', { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if I give it an invalid title', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      let tx;
      try {
        tx = await colony.updateTaskTitle(1, '', { gas: GAS_TO_SPEND });
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

  describe('when accepting a task', () => {
    it('should the "accepted" prop be set as "true"', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.acceptTask(1);
      const task = await colony.getTask(1);
      assert.isTrue(task[2]);
    });

    it('should fail if a non-admin tried to accept the task', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      let tx;
      try {
        tx = await colony.acceptTask(1, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if I try to accept a task was accepted before', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.acceptTask(1);
      let tx;
      try {
        tx = await colony.acceptTask(1, { gas: GAS_TO_SPEND });
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

    it('should allow admin to close task', async function () {
      const prevBalance = web3.eth.getBalance(OTHER_ACCOUNT);
      await colony.makeTask('name', 'summary');
      await colony.mintTokens(100);
      await colony.setReservedTokensForTask(1, 80);
      await colony.contributeEthToTask(1, { value: 10000 });
      await colony.completeAndPayTask(1, OTHER_ACCOUNT);
      const task = await colony.getTask(1);
      assert.equal(task[0], 'name');
      assert.equal(task[1], 'summary');
      assert.isTrue(task[2]);
      assert.equal(task[3].toNumber(), 10000);
      assert.equal(task[4].toNumber(), 80);
      assert.equal(task[5].toNumber(), 0);

      assert.equal(web3.eth.getBalance(OTHER_ACCOUNT).minus(prevBalance).toNumber(), 10000);
    });

    it('should fail if a non-admin user tries to close task', async function () {
      await colony.makeTask('name', 'summary');
      await colony.contributeEthToTask(1, { value: 10000 });

      let tx;
      try {
        tx = await colony.completeAndPayTask(1, OTHER_ACCOUNT, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      const task = await colony.getTask(1);
      assert.equal(task[0], 'name');
      assert.equal(task[1], 'summary');
      assert.isFalse(task[2]);
    });

    it('should return the correct number of tasks', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.makeTask('TASK B', 'INTERESTING TASK SUMMARY');
      await colony.makeTask('TASK C', 'INTERESTING TASK SUMMARY');
      await colony.makeTask('TASK D', 'INTERESTING TASK SUMMARY');
      await colony.makeTask('TASK E', 'INTERESTING TASK SUMMARY');
      const taskCount = await colony.taskCount.call();
      assert.equal(taskCount, 5);
    });
  });

  describe('when funding tasks', () => {
    it('should "tokens" property be raised by the amount of tokens received', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.mintTokens(100);
      await colony.setReservedTokensForTask(1, 10);
      const task = await colony.getTask(1);
      assert.equal(task[4].toNumber(), 10);
    });

    it('should "eth" prop be raised by the amount of ether received', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.contributeEthToTask(1, { value: 10 });
      const task = await colony.getTask(1);
      assert.equal(task[3].toNumber(), 10);
    });

    it('should set the "funded" to "true" when the task is funded with ether', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.contributeEthToTask(1, { value: 10 });
      const task = await colony.getTask(1);
      assert.isTrue(task[6], '"setBudget" task property should be "true"');
    });

    it('should set the "funded" to "true" when the task is funded with tokens', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.mintTokens(100);
      await colony.setReservedTokensForTask(1, 10);
      const task = await colony.getTask(1);
      assert.isTrue(task[6], '"setBudget" task property should be "true"');
    });

    it('should set the "funded" to "true" when the task is funded with 0 tokens', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.mintTokens(100);
      await colony.setReservedTokensForTask(1, 0);
      const task = await colony.getTask(1);
      assert.isTrue(task[6]);
    });

    it('should fail if an admin tries to contribute to an accepted task', async function () {
      await colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY');
      await colony.acceptTask(1);

      let tx;
      try {
        tx = await colony.contributeEthToTask(1, { value: 10, gas: GAS_TO_SPEND });
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

    it('should allow admins to fund with ether', async function () {
      await colony.makeTask('name', 'summary');
      await colony.contributeEthToTask(1, { value: 100 });
      const task = await colony.getTask(1);
      assert.equal(task[3], 100);
    });

    it('should fail if a non-admin user funds task with ether', async function () {
      await colony.makeTask('name', 'summary');
      let tx;
      try {
        tx = await colony.contributeEthToTask(1, {
          value: 100,
          from: OTHER_ACCOUNT,
          gas: GAS_TO_SPEND,
        });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should allow admins to fund a task with own tokens', async function () {
      await colony.mintTokens(100);
      await colony.makeTask('name', 'summary');
      await colony.makeTask('name2', 'summary2');
      await colony.setReservedTokensForTask(1, 100);
      const task1 = await colony.getTask(1);
      assert.equal(task1[5].toNumber(), 100);
      await colony.completeAndPayTask(1, OTHER_ACCOUNT);
      const otherAccountTokenBalance = await token.balanceOf.call(OTHER_ACCOUNT);
      assert.equal(otherAccountTokenBalance.toNumber(), 100);
      await authority.setUserRole(OTHER_ACCOUNT, 1, true);
      await colony.contributeTokensToTask(2, 95, { from: OTHER_ACCOUNT });

      const task2 = await colony.getTask(2);
      assert.equal(task2[0], 'name2');
      assert.equal(task2[1], 'summary2');
      assert.isFalse(task2[2]);
      assert.equal(task2[3].toNumber(), 0);
      assert.equal(task2[4].toNumber(), 95);
      assert.equal(task2[5].toNumber(), 0);
      assert.isTrue(task2[6]);
    });

    it('should reserve the correct number of tokens when admins fund tasks with pool tokens', async function () {
      await colony.mintTokens(100);
      await colony.makeTask('name', 'summary');
      await colony.setReservedTokensForTask(1, 70);
      let reservedTokens = await colony.reservedTokens.call();
      assert.equal(reservedTokens.toNumber(), 70);
      let task = await colony.getTask(1);
      assert.equal(task[4].toNumber(), 70);
      assert.equal(task[5].toNumber(), 70);
      assert.isTrue(task[6]);
      await colony.setReservedTokensForTask(1, 100);
      reservedTokens = await colony.reservedTokens.call();
      assert.equal(reservedTokens.toNumber(), 100);
      task = await colony.getTask(1);
      assert.equal(task[4].toNumber(), 100);
      assert.equal(task[5].toNumber(), 100);
      assert.isTrue(task[6]);
    });

    it('should take into account number of tokens already assigned when reassigning task budget', async function () {
      await colony.mintTokens(100);
      await colony.makeTask('name1', 'summary1');
      await colony.setReservedTokensForTask(1, 20); // 20 reserved and 80 remaining available
      await colony.completeAndPayTask(1, MAIN_ACCOUNT); // MAIN_ACCOUNT earns 20 tokens
      await colony.makeTask('name2', 'summary2');
      await colony.setReservedTokensForTask(2, 40); // 40 reserved and 40 remaining available
      await colony.contributeTokensToTask(2, 20);
      let task = await colony.getTask(2);
      assert.equal(task[4].toNumber(), 60, 'Wrong tokens wei value');
      await colony.setReservedTokensForTask(2, 80); // 80 reserved and 0 remaining available
      let reservedTokens = await colony.reservedTokens.call();
      assert.equal(reservedTokens.toNumber(), 80, 'Has not reserved the right amount of colony tokens.');
      task = await colony.getTask(2);
      assert.equal(task[5].toNumber(), 80, 'Wrong tokens wei reserved value');
      assert.equal(task[4].toNumber(), 100, 'Wrong tokens wei value');
    });

    it('should fail if admins fund a task with more tokens than they have available in colony pool', async function () {
      await colony.mintTokens(100);
      await colony.makeTask('name', 'summary');
      await colony.makeTask('name2', 'summary2');
      await colony.setReservedTokensForTask(1, 100);
      await colony.completeAndPayTask(1, OTHER_ACCOUNT);
      await colony.mintTokens(100);
      await colony.makeTask('name3', 'summary3');

      let tx;
      try {
        tx = await colony.setReservedTokensForTask(3, 150, optionsToSpotTransactionFailure);
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if a non-admin user tries to contribute with tokens from the pool', async function () {
      await colony.mintTokens(100);
      await colony.makeTask('name', 'summary');

      let tx;
      try {
        tx = await colony.contributeTokensToTask(1, 100, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if a non-admin user try to contribute tokens', async function () {
      await colony.mintTokens(100);
      await colony.makeTask('name', 'summary');
      let tx;
      try {
        tx = await colony.setReservedTokensForTask(1, 100, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should allow an admin to refund task tokens', async function () {
      await colony.mintTokens(100);
      await colony.makeTask('name', 'summary');
      await colony.setReservedTokensForTask(1, 80);
      await colony.acceptTask(1);
      await colony.removeReservedTokensForTask(1);
      const reservedTokens = await colony.reservedTokens.call();
      assert.equal(reservedTokens.toNumber(), 0);
      const task = await colony.getTask(1);
      assert.equal(task[4].toNumber(), 80, 'Has not cleared the task token funds correctly');
    });

    it('should NOT allow admin to refund task tokens if task not accepted', async function () {
      await colony.mintTokens(100);
      await colony.makeTask('name', 'summary');
      await colony.setReservedTokensForTask(1, 80);
      let reservedTokens = await colony.reservedTokens.call();
      assert.equal(reservedTokens.toNumber(), 80);
      let task = await colony.getTask(1);
      assert.equal(task[4].toNumber(), 80);
      assert.equal(task[5].toNumber(), 80);
      let tx;
      try {
        tx = await colony.removeReservedTokensForTask(1, optionsToSpotTransactionFailure);
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      reservedTokens = await colony.reservedTokens.call();
      assert.equal(reservedTokens.toNumber(), 80);
      task = await colony.getTask(1);
      assert.equal(task[4].toNumber(), 80);
    });

    it.skip('should transfer 95% of tokens to task completor and 5% to colonyNetwork on completing a task', async function () {
      await colony.mint(100);
      await colony.makeTask('name', 'summary');
      await colony.setReservedTokensForTask(1, 100);
      await colony.completeAndPayTask(1, OTHER_ACCOUNT);
      const otherAccountTokenBalance = await colony.balanceOf.call(OTHER_ACCOUNT);
      assert.strictEqual(otherAccountTokenBalance.toNumber(), 95, 'Token balance is not 95% of task token value');
      const colonyNetworkTokenBalance = await colony.balanceOf.call(colonyNetwork.address);
      assert.strictEqual(colonyNetworkTokenBalance.toNumber(), 5, 'ColonyNetwork token balance is not 5% of task token value');
    });
  });
});
