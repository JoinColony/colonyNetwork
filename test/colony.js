/* globals artifacts */
import { solSha3 } from 'colony-utils';
import _ from 'lodash';
import testHelper from '../helpers/test-helper';

const RootColony = artifacts.require('RootColony');
const Colony = artifacts.require('Colony');
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
  let eternalStorage;
  let rootColony;

  before(function (done) {
    RootColony.deployed()
    .then(function (instance) {
      rootColony = instance;
    })
    .then(done);
  });

  beforeEach(function (done) {
    COLONY_KEY = testHelper.getRandomString(7);

    rootColony.createColony(COLONY_KEY, { from: MAIN_ACCOUNT })
    .then(function () {
      return rootColony.getColony(COLONY_KEY);
    })
    .then(function (colony_) {
      colony = Colony.at(colony_);
    })
    .then(function () {
      return colony.eternalStorage.call();
    })
    .then(function (extStorageAddress) {
      eternalStorage = EternalStorage.at(extStorageAddress);
    })
    .then(done)
    .catch(done);
  });

  describe('when created', function () {
    it('should take deploying user as an owner', function (done) {
      colony.userIsInRole.call(MAIN_ACCOUNT, 0)
      .then(function (owner) {
        assert.equal(owner, true, 'First user isn\'t an owner');
      })
      .then(done)
      .catch(done);
    });

    it('should users not be an admin until I add s/he', function (done) {
      colony.userIsInRole.call(OTHER_ACCOUNT, 1)
      .then(function (admin) {
        assert.equal(admin, false, 'Other user is an admin');
      })
      .then(done)
      .catch(done);
    });

    it('should other users not be an owner until I add s/he', function (done) {
      colony.userIsInRole.call(OTHER_ACCOUNT, 0)
      .then(function (owner) {
        assert.equal(owner, false, 'Other user is an owner');
      })
      .then(done)
      .catch(done);
    });

    it('should keep a count of the number of admins', function (done) {
      colony.addUserToRole(OTHER_ACCOUNT, 1)
      .then(function () {
        return colony.countUsersInRole.call(0);
      })
      .then(function (_adminsCount) {
        assert.equal(_adminsCount.toNumber(), 1, 'Admin count is different from 1');
      })
      .then(done)
      .catch(done);
    });

    it('should keep a count of the number of owners', function (done) {
      colony.countUsersInRole.call(0)
      .then(function (_ownersCount) {
        assert.equal(_ownersCount.toNumber(), 1, 'Owners count is different from 1');
      })
      .then(done)
      .catch(done);
    });

    it('should increase owner count by the number of owners added', function (done) {
      colony.addUserToRole(OTHER_ACCOUNT, 0)
      .then(function () {
        return colony.countUsersInRole.call(0);
      })
      .then(function (_ownersCount) {
        assert.equal(_ownersCount.toNumber(), 2, 'Owners count is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should decrease owner count by the number of owners removed', function (done) {
      colony.addUserToRole(OTHER_ACCOUNT, 0)
      .then(function () {
        return colony.removeUserFromRole(OTHER_ACCOUNT, 0);
      })
      .then(function () {
        return colony.countUsersInRole.call(0);
      })
      .then(function (_ownersCount) {
        assert.equal(_ownersCount.toNumber(), 1, 'Owners count is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should increase admin count by the number of admins added', function (done) {
      colony.addUserToRole(OTHER_ACCOUNT, 1)
      .then(function () {
        return colony.countUsersInRole.call(1);
      })
      .then(function (_adminsCount) {
        assert.equal(_adminsCount.toNumber(), 1, 'Admin count is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should decrease admin count by the number of admins removed', function (done) {
      colony.addUserToRole(OTHER_ACCOUNT, 1)
      .then(function () {
        return colony.removeUserFromRole(OTHER_ACCOUNT, 1);
      })
      .then(function () {
        return colony.countUsersInRole.call(1);
      })
      .then(function (_adminsCount) {
        assert.equal(_adminsCount.toNumber(), 0, 'Admin count is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should allow admins to leave the colony at their own will', function (done) {
      colony.addUserToRole(OTHER_ACCOUNT, 1)
      .then(function () {
        return colony.removeUserFromRole(OTHER_ACCOUNT, 1, { from: OTHER_ACCOUNT });
      })
      .then(function () {
        return colony.userIsInRole.call(OTHER_ACCOUNT, 1);
      })
      .then(function (_adminsCount) {
        assert.equal(_adminsCount, false, 'Admins cannot leave at their own will');
      })
      .then(done)
      .catch(done);
    });

    it('should allow a revoked owner to be set as an owner again', function (done) {
      colony.addUserToRole(OTHER_ACCOUNT, 0)
      .then(function () {
        return colony.removeUserFromRole(OTHER_ACCOUNT, 0);
      })
      .then(function () {
        return colony.addUserToRole(OTHER_ACCOUNT, 0);
      })
      .then(function () {
        return colony.userIsInRole.call(OTHER_ACCOUNT, 0);
      })
      .then(function (_isOwner) {
        assert.isTrue(_isOwner, 'previously revoked owners cannot be set as owners again');
      })
      .then(function () {
        return colony.countUsersInRole.call(0);
      })
      .then(function (_ownersCount) {
        assert.equal(_ownersCount.toNumber(), 2, 'owners count is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should allow a revoked admin to be promoted to admin again', function (done) {
      colony.addUserToRole(OTHER_ACCOUNT, 1)
      .then(function () {
        return colony.removeUserFromRole(OTHER_ACCOUNT, 1);
      })
      .then(function () {
        return colony.addUserToRole(OTHER_ACCOUNT, 1);
      })
      .then(function () {
        return colony.userIsInRole.call(OTHER_ACCOUNT, 1);
      })
      .then(function (_isAdmin) {
        assert.isTrue(_isAdmin, 'previously revoked admins cannot be promoted to admin again');
      })
      .then(function () {
        return colony.countUsersInRole.call(0);
      })
      .then(function (_adminsCount) {
        assert.equal(_adminsCount.toNumber(), 1, 'admins count is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should fail to remove the last owner', function (done) {
      colony.removeUserFromRole(MAIN_ACCOUNT, 0, optionsToSpotTransactionFailure)
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
      })
      .then(done)
      .catch(done);
    });

    it('should fail to remove owner if not an owner themself', function (done) {
      colony.addUserToRole(OTHER_ACCOUNT, 0)
      .then(function () {
        return colony.addUserToRole(THIRD_ACCOUNT, 1)
      })
      .then(function () {
        return colony.removeUserFromRole(OTHER_ACCOUNT, 0, { from: THIRD_ACCOUNT, gas: GAS_TO_SPEND });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
      })
      .then(function () {
        return colony.userIsInRole.call(OTHER_ACCOUNT, 0);
      })
      .then(function (_isOwner) {
        assert.isTrue(_isOwner);
        done();
      })
      .catch(done);
    });

    it('should fail to add the same owner address multiple times', function (done) {
      colony.addUserToRole(MAIN_ACCOUNT, 0, optionsToSpotTransactionFailure)
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
      })
      .then(done)
      .catch(done);
    });

    it('should fail to add the same admin address multiple times', function (done) {
      colony.addUserToRole(MAIN_ACCOUNT, 1, optionsToSpotTransactionFailure)
      .then(function () {
        return colony.addUserToRole(MAIN_ACCOUNT, 1, optionsToSpotTransactionFailure);
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
      })
      .then(done)
      .catch(done);
    });

    it('should fail to remove an address that is currently not an admin', function (done) {
      colony.addUserToRole(OTHER_ACCOUNT, 1)
      .then(function () {
        return colony.removeUserFromRole(OTHER_ACCOUNT, 1);
      })
      .then(function () {
        return colony.removeUserFromRole(OTHER_ACCOUNT, 1, {
          from: MAIN_ACCOUNT,
          gas: GAS_TO_SPEND,
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
      })
      .then(done)
      .catch(done);
    });

    it('should fail to remove an address that was never an admin', function (done) {
      colony.removeUserFromRole(OTHER_ACCOUNT, 1, optionsToSpotTransactionFailure)
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
      })
      .then(done)
      .catch(done);
    });

    it('should fail to add the same owner address multiple times', function (done) {
      colony.addUserToRole(MAIN_ACCOUNT, 0, optionsToSpotTransactionFailure)
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
      })
      .then(done)
      .catch(done);
    });

    it('should fail to remove an address that is currently not an owner', function (done) {
      colony.addUserToRole(OTHER_ACCOUNT, 0)
      .then(function () {
        return colony.removeUserFromRole(OTHER_ACCOUNT, 0);
      })
      .then(function () {
        return colony.removeUserFromRole(OTHER_ACCOUNT, 0, {
          from: MAIN_ACCOUNT,
          gas: GAS_TO_SPEND,
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
      })
      .then(done)
      .catch(done);
    });

    it('should fail to remove an address that was never an owner', function (done) {
      colony.removeUserFromRole(OTHER_ACCOUNT, 0, optionsToSpotTransactionFailure)
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
      })
      .then(done)
      .catch(done);
    });

    it('should generate tokens and assign it to the colony', function (done) {
      colony.generateTokensWei(100, { from: MAIN_ACCOUNT })
      .then(function () {
        return colony.totalSupply.call();
      })
      .then(function (_totalSupply) {
        assert.equal(_totalSupply.toNumber(), 100, 'Token total is incorrect');
        return colony.balanceOf.call(colony.address);
      })
      .then(function (colonyBalance) {
        assert.equal(colonyBalance.toNumber(), 100, 'Colony balance is incorrect');
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when creating/updating tasks', function () {
    it('should allow admins to make task', function (done) {
      colony.makeTask('name', 'summary')
      .then(function () {
        return eternalStorage.getStringValue.call(solSha3('task_name', 0));
      })
      .then(function (_name) {
        assert.equal(_name, 'name', 'Wrong task name');
        return eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      })
      .then(function (_summary) {
        assert.equal(_summary, 'summary', 'Wrong task summary');
        return eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      })
      .then(function (accepted) {
        assert.equal(accepted, false, 'Wrong accepted value');
        return eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      })
      .then(function (eth) {
        assert.equal(eth.toNumber(), 0, 'Wrong task ether value');
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      })
      .then(function (_tokensWei) {
        assert.equal(_tokensWei.toNumber(), 0, 'Wrong tokens wei value');
        return eternalStorage.getBooleanValue.call(solSha3('task_funded', 0));
      })
      .then(function (_budgetSet) {
        assert.equal(_budgetSet, false, 'Wrong initial budgetSet value');
      })
      .then(done)
      .catch(done);
    });

    it('should allow admins to make task with a 160 chars long title', function (done) {
      const bigTitle = _.times(160, () => 'A').join('');
      colony.makeTask(bigTitle, 'summary', {
        from: MAIN_ACCOUNT,
        gas: 314159,
      })
      .then(function () {
        return eternalStorage.getStringValue.call(solSha3('task_name', 0));
      })
      .then(function (_name) {
        assert.equal(_name, bigTitle, 'Wrong task name');
      })
      .then(done)
      .catch(done);
    });

    it('should allow admins to edit task title', function (done) {
      colony.makeTask('name', 'summary')
      .then(function () {
        return colony.updateTaskTitle(0, 'nameedit');
      })
      .then(function () {
        return eternalStorage.getStringValue.call(solSha3('task_name', 0));
      })
      .then(function (_name) {
        assert.equal(_name, 'nameedit', 'Wrong task name');
        return eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      })
      .then(function (summary) {
        assert.equal(summary, 'summary', 'Wrong task summary');
        return eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      })
      .then(function (taskaccepted) {
        assert.equal(taskaccepted, false, 'Wrong accepted value');
        return eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      })
      .then(function (eth) {
        assert.equal(eth.toNumber(), 0, 'Wrong task ether value');
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      })
      .then(function (tokensWei) {
        assert.equal(tokensWei.toNumber(), 0, 'Wrong tokens wei value');
      })
      .then(done)
      .catch(done);
    });

    it('should allow admins to edit task summary', function (done) {
      colony.makeTask('name', 'summary')
      .then(function () {
        return colony.updateTaskSummary(0, 'summaryedit');
      })
      .then(function () {
        return eternalStorage.getStringValue.call(solSha3('task_name', 0));
      })
      .then(function (_name) {
        assert.equal(_name, 'name', 'Wrong task name');
        return eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      })
      .then(function (summary) {
        assert.equal(summary, 'summaryedit', 'Wrong task summary');
        return eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      })
      .then(function (taskaccepted) {
        assert.equal(taskaccepted, false, 'Wrong accepted value');
        return eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      })
      .then(function (eth) {
        assert.equal(eth.toNumber(), 0, 'Wrong task ether value');
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      })
      .then(function (tokensWei) {
        assert.equal(tokensWei.toNumber(), 0, 'Wrong tokens wei value');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if other users non-admins try to edit a task title', function (done) {
      colony.makeTask('name', 'summary').then(function () {
        return colony.updateTaskTitle(0, 'nameedit', {
          from: OTHER_ACCOUNT,
          gas: GAS_TO_SPEND,
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if other users non-admins try to edit a task summary', function (done) {
      colony.makeTask('name', 'summary').then(function () {
        return colony.updateTaskSummary(0, 'summary', {
          from: OTHER_ACCOUNT,
          gas: GAS_TO_SPEND,
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if other users non-admins try to make a task', function (done) {
      colony.makeTask('name', 'summary', {
        from: OTHER_ACCOUNT,
        gas: GAS_TO_SPEND,
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when funding tasks', function () {
    it('should allow admins to fund task with ETH', function (done) {
      colony.makeTask('name', 'summary')
      .then(function () {
        return colony.updateTaskTitle(0, 'nameedit');
      })
      .then(function () {
        return colony.contributeEthToTask(0, {
          value: 10000,
        });
      })
      .then(function () {
        return eternalStorage.getStringValue.call(solSha3('task_name', 0));
      })
      .then(function (name) {
        assert.equal(name, 'nameedit', 'Wrong task name');
        return eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      })
      .then(function (_summary) {
        assert.equal(_summary, 'summary', 'Wrong task summary');
        return eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      })
      .then(function (a) {
        assert.equal(a, false, 'Wrong accepted value');
        return eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      })
      .then(function (_eth) {
        assert.equal(_eth.toNumber(), 10000, 'Wrong task ether value');
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      })
      .then(function (_tokensWei) {
        assert.equal(_tokensWei.toNumber(), 0, 'Wrong tokens wei value');
        return eternalStorage.getBooleanValue.call(solSha3('task_funded', 0));
      })
      .then(function (_budgetSet) {
        assert.equal(_budgetSet, true, 'Wrong tokens wei value');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if non-admins fund task with ETH', function (done) {
      colony.makeTask('name', 'summary')
      .then(function () {
        return colony.contributeEthToTask(0, {
          value: 10000,
          from: OTHER_ACCOUNT,
          gas: GAS_TO_SPEND,
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
      })
      .then(done)
      .catch(done);
    });

    it('should allow admins to fund task with own tokens', function (done) {
      colony.generateTokensWei(100, { from: MAIN_ACCOUNT })
      .then(function () {
        return colony.makeTask('name', 'summary');
      })
      .then(function () {
        return colony.makeTask('name2', 'summary2');
      })
      .then(function () {
        return colony.updateTaskTitle(0, 'nameedit');
      })
      .then(function () {
        return colony.reservedTokensWei.call();
      })
      .then(function (reservedTokensWei) {
        assert.equal(0, reservedTokensWei.toNumber(), 'Colony reserved tokens should be set to initially 0 count.');
        return colony.balanceOf.call(colony.address);
      })
      .then(function (colonyBalance) {
        assert.equal(colonyBalance.toNumber(), 100, 'Colony address balance should be 100 tokens.');
        return colony.setReservedTokensWeiForTask(0, 100, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        return colony.reservedTokensWei.call();
      })
      .then(function (reservedTokensWei) {
        assert.equal(100, reservedTokensWei.toNumber(), 'Colony tokens were not reserved for task');
        return eternalStorage.getBooleanValue.call(solSha3('task_funded', 0));
      })
      .then(function (_budgetSet) {
        assert.equal(_budgetSet, true, 'Wrong tokens wei value');
        return colony.completeAndPayTask(0, OTHER_ACCOUNT, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        return colony.balanceOf.call(OTHER_ACCOUNT);
      })
      .then(function (otherAccountTokenBalance) {
        assert.equal(otherAccountTokenBalance.toNumber(), 100, 'OTHER_ACCOUNT balance should be 100 tokens.');
        return colony.addUserToRole(OTHER_ACCOUNT, 1);
      })
      .then(function () {
        return colony.contributeTokensWeiToTask(1, 95, { from: OTHER_ACCOUNT });
      })
      .then(function () {
        return eternalStorage.getStringValue.call(solSha3('task_name', 1));
      })
      .then(function (_name) {
        assert.equal(_name, 'name2', 'Wrong task name');
        return eternalStorage.getStringValue.call(solSha3('task_summary', 1));
      })
      .then(function (_summary) {
        assert.equal(_summary, 'summary2', 'Wrong task summary');
        return eternalStorage.getBooleanValue.call(solSha3('task_accepted', 1));
      })
      .then(function (_accepted) {
        assert.equal(_accepted, false, 'Wrong accepted value');
        return eternalStorage.getUIntValue.call(solSha3('task_eth', 1));
      })
      .then(function (_eth) {
        assert.equal(_eth.toNumber(), 0, 'Wrong task ether value');
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 1));
      })
      .then(function (_tokensWei) {
        assert.equal(_tokensWei.toNumber(), 95, 'Wrong tokens wei value');
      })
      .then(done)
      .catch(done);
    });

    it('should reserve the correct number of tokens when admins fund tasks with pool tokens', function (done) {
      colony.generateTokensWei(100, { from: MAIN_ACCOUNT })
      .then(function () {
        return colony.makeTask('name', 'summary');
      })
      .then(function () {
        return colony.setReservedTokensWeiForTask(0, 70, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        return colony.reservedTokensWei.call();
      })
      .then(function (reservedTokensWei) {
        assert.equal(reservedTokensWei.toNumber(), 70, 'Has not reserved the right amount of colony tokens.');
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      })
      .then(function (_tokensWei) {
        assert.equal(_tokensWei.toNumber(), 70, 'Wrong tokens wei value');
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWeiReserved', 0));
      })
      .then(function (_tokensWeiReserved) {
        assert.equal(_tokensWeiReserved.toNumber(), 70, 'Wrong tokens wei reserved value');
        return eternalStorage.getBooleanValue.call(solSha3('task_funded', 0));
      })
      .then(function (_budgetSet) {
        assert.equal(_budgetSet, true, 'Wrong budgetSet value');
      })
      .then(function () {
        return colony.setReservedTokensWeiForTask(0, 100, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        return colony.reservedTokensWei.call();
      })
      .then(function (reservedTokensWei) {
        assert.equal(reservedTokensWei.toNumber(), 100, 'Has not reserved the right amount of colony tokens.');
        return eternalStorage.getBooleanValue.call(solSha3('task_funded', 0));
      })
      .then(function (_budgetSet) {
        assert.equal(_budgetSet, true, 'Wrong tokens wei value');
        return colony.setReservedTokensWeiForTask(0, 150, {
          from: MAIN_ACCOUNT,
          gas: GAS_TO_SPEND,
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
      })
      .then(function () {
        done();
      })
      .catch(done);
    });

    it('should fail if admins fund tasks with more pool tokens than they have available', function (done) {
      colony.generateTokensWei(100, { from: MAIN_ACCOUNT })
      .then(function () {
        return colony.makeTask('name', 'summary');
      })
      .then(function () {
        return colony.makeTask('name2', 'summary2');
      })
      .then(function () {
        return colony.updateTaskTitle(0, 'nameedit');
      })
      .then(function () {
        return colony.setReservedTokensWeiForTask(0, 100, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        return colony.completeAndPayTask(0, OTHER_ACCOUNT, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        return colony.generateTokensWei(100, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        return colony.makeTask('name', 'summary');
      })
      .then(function () {
        // More than the pool, less than totalsupply
        return colony.setReservedTokensWeiForTask(1, 150, {
          from: MAIN_ACCOUNT,
          gas: GAS_TO_SPEND,
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
      })
      .then(function () {
        done();
      })
      .catch(done);
    });

    it('should take into account number of tokens already assigned when reassigning task budget', function (done) {
      colony.generateTokensWei(100, { from: MAIN_ACCOUNT })
      .then(function () {
        return colony.makeTask('name', 'summary');
      })
      .then(function () {
        return colony.setReservedTokensWeiForTask(0, 20); // 20 reserved and 80 remaining available
      })
      .then(function () {
        return colony.completeAndPayTask(0, MAIN_ACCOUNT); // MAIN_ACCOUNT earns 20 tokens
      })
      .then(function () {
        return colony.makeTask('name1', 'summary1');
      })
      .then(function () {
        return colony.setReservedTokensWeiForTask(1, 40); // 40 reserved and 40 remaining available
      })
      .then(function () {
        return colony.contributeTokensWeiToTask(1, 20);
      })
      .then(function () {
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 1));
      })
      .then(function (_tokensWei) {
        assert.equal(_tokensWei.toNumber(), 60, 'Wrong tokens wei value');
        return colony.setReservedTokensWeiForTask(1, 80); // 80 reserved and 0 remaining available
      })
      .then(function () {
        return colony.reservedTokensWei.call();
      })
      .then(function (reservedTokensWei) {
        assert.equal(reservedTokensWei.toNumber(), 80, 'Has not reserved the right amount of colony tokens.');
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWeiReserved', 1));
      })
      .then(function (_tokensWei) {
        assert.equal(_tokensWei.toNumber(), 80, 'Wrong tokens wei reserved value');
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 1));
      })
      .then(function (_tokensWei) {
        assert.equal(_tokensWei.toNumber(), 100, 'Wrong tokens wei value');
      })
      .then(function () {
        done();
      })
      .catch(done);
    });

    it('should not allow non-admin to close task', function (done) {
      colony.makeTask('name', 'summary')
      .then(function () {
        return colony.updateTaskTitle(0, 'nameedit');
      })
      .then(function () {
        return colony.contributeEthToTask(0, {
          value: 10000,
        });
      })
      .then(function () {
        return colony.completeAndPayTask(0, OTHER_ACCOUNT, { from: OTHER_ACCOUNT, gas: 3e6 });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(3e6, tx);
        return eternalStorage.getStringValue.call(solSha3('task_name', 0));
      })
      .then(function (taskName) {
        assert.equal(taskName, 'nameedit', 'Wrong task name');
        return eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      })
      .then(function (summary) {
        assert.equal(summary, 'summary', 'Wrong task summary');
        return eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      })
      .then(function (_accepted) {
        assert.equal(_accepted, false, 'Wrong accepted value');
      })
      .then(done)
      .catch(done);
    });

    it('should allow admin to close task', function (done) {
      const prevBalance = web3.eth.getBalance(OTHER_ACCOUNT);
      colony.makeTask('name', 'summary')
      .then(function () {
        return colony.updateTaskTitle(0, 'nameedit');
      })
      .then(function () {
        return colony.generateTokensWei(100);
      })
      .then(function () {
        return colony.setReservedTokensWeiForTask(0, 80);
      })
      .then(function () {
        return colony.contributeEthToTask(0, {
          value: 10000,
        });
      })
      .then(function () {
        return colony.completeAndPayTask(0, OTHER_ACCOUNT, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        return eternalStorage.getStringValue.call(solSha3('task_name', 0));
      })
      .then(function (n) {
        assert.equal(n, 'nameedit', 'Wrong task name');
        return eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      })
      .then(function (s) {
        assert.equal(s, 'summary', 'Wrong task summary');
        return eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      })
      .then(function (_accepted) {
        assert.equal(_accepted, true, 'Wrong accepted value');
        return eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      })
      .then(function (eth) {
        assert.equal(eth.toNumber(), 10000, 'Wrong task ether value');
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      })
      .then(function (_tokensWei) {
        assert.equal(_tokensWei.toNumber(), 80, 'Wrong tokens wei value');
        assert.equal(web3.eth.getBalance(OTHER_ACCOUNT).minus(prevBalance).toNumber(), 10000);
      })
      .then(done)
      .catch(done);
    });

    it('should allow admin to refund task tokens', function (done) {
      colony.generateTokensWei(100, { from: MAIN_ACCOUNT })
      .then(function () {
        return colony.makeTask('name', 'summary');
      })
      .then(function () {
        return colony.setReservedTokensWeiForTask(0, 80, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        return colony.reservedTokensWei.call();
      })
      .then(function (reservedTokensWei) {
        assert.equal(reservedTokensWei.toNumber(), 80, 'Has not reserved the right amount of colony tokens.');
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      })
      .then(function (taskTokensWei) {
        assert.equal(taskTokensWei.toNumber(), 80, 'Has not set the task token funds correctly');
        return colony.acceptTask(0);
      })
      .then(function () {
        return colony.removeReservedTokensWeiForTask(0);
      })
      .then(function () {
        return colony.reservedTokensWei.call();
      })
      .then(function (reservedTokensWei) {
        assert.equal(reservedTokensWei.toNumber(), 0, 'Has not released the task colony tokens.');
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      })
      .then(function (taskTokensWei) {
        assert.equal(taskTokensWei.toNumber(), 80, 'Has not cleared the task token funds correctly');
      })
      .then(done)
      .catch(done);
    });

    it.skip('should transfer 95% of tokens to task completor and 5% to rootColony on completing a task', function (done) {
      colony.generateTokensWei(100)
      .then(function () {
        return colony.makeTask('name', 'summary');
      })
      .then(function () {
        return colony.updateTaskTitle(0, 'nameedit');
      })
      .then(function () {
        return colony.setReservedTokensWeiForTask(0, 100);
      })
      .then(function () {
        return colony.completeAndPayTask(0, OTHER_ACCOUNT, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        return colony.balanceOf.call(OTHER_ACCOUNT);
      })
      .then(function (otherAccountTokenBalance) {
        assert.strictEqual(otherAccountTokenBalance.toNumber(), 95, 'Token balance is not 95% of task token value');
        return colony.balanceOf.call(rootColony.address);
      })
      .then(function (rootColonyTokenBalance) {
        assert.strictEqual(rootColonyTokenBalance.toNumber(), 5, 'RootColony token balance is not 5% of task token value');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if non-admins try to contribute with tokens from the pool', function (done) {
      colony.generateTokensWei(100)
      .then(function () {
        return colony.makeTask('name', 'summary');
      })
      .then(function () {
        return colony.contributeTokensWeiToTask(0, 100, {
          from: OTHER_ACCOUNT,
          gas: GAS_TO_SPEND,
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if non-admins try to contribute with tokens', function (done) {
      colony.generateTokensWei(100)
      .then(function () {
        return colony.makeTask('name', 'summary');
      })
      .then(function () {
        return colony.setReservedTokensWeiForTask(0, 100, {
          from: OTHER_ACCOUNT,
          gas: GAS_TO_SPEND,
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
      })
      .then(done)
      .catch(done);
    });
  });
});
