// These globals are added by Truffle:
/* globals Colony, RootColony, EternalStorage */
import { solSha3 } from 'colony-utils';
import testHelper from '../helpers/test-helper';

contract('TaskLibrary', function (accounts) {
  let COLONY_KEY = 'COLONY_TEST';
  const BIGGER_TASK_SUMMARY = 'Lorem ipsum dolor sit amet, consectetur adipiscing el';
  const BIGGER_TASK_TITLE = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit';
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];
  let colony;
  let rootColony;
  let eternalStorage;
  let eternalStorageRoot;

  before(function (done) {
    rootColony = RootColony.deployed();
    eternalStorageRoot = EternalStorage.deployed();
    done();
  });

  beforeEach(function (done) {
    COLONY_KEY = testHelper.getRandomString(7);
    eternalStorageRoot.owner.call()
    .then(function () {
      return rootColony.createColony(COLONY_KEY, { from: MAIN_ACCOUNT });
    })
    .then(function () {
      return rootColony.getColony.call(COLONY_KEY);
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

  describe('when adding tasks', function () {
    it('should add an entry to tasks array', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY', { from: MAIN_ACCOUNT })
      .then(function () {
        return eternalStorage.getStringValue.call(solSha3('task_name', 0));
      })
      .then(function (_name) {
        assert.equal(_name, 'TASK A', 'Wrong task name');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if another user (not the owner) tries to add a new task', function (done) {
      colony.makeTask('', 'INTERESTING TASK SUMMARY', {
        from: OTHER_ACCOUNT,
        gas: 1e6,
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (txid) {
        testHelper.checkAllGasSpent(1e6, txid);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if I give it an invalid title', function (done) {
      colony.makeTask('', 'INTERESTING TASK SUMMARY', {
        from: MAIN_ACCOUNT,
        gas: 1e6,
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (txid) {
        testHelper.checkAllGasSpent(1e6, txid);
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when updating existing tasks', function () {
    it('should update data to tasks array', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function () {
        return colony.updateTaskTitle(0, 'TASK B');
      })
      .then(function () {
        return eternalStorage.getStringValue.call(solSha3('task_name', 0));
      })
      .then(function (_name) {
        assert.equal(_name, 'TASK B', 'Wrong task name');
        return eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      })
      .then(function (_summary) {
        assert.equal(_summary, 'INTERESTING TASK SUMMARY', 'Wrong task summary');
      })
      .then(done)
      .catch(done);
    });

    it('should not interfere in "accepted", "eth" or "tokens" props', function (done) {
      let prevEthBalance;
      let prevTokensBalance;
      let prevAcceptedValue;

      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function () {
        return eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      })
      .then(function (_accepted) {
        prevAcceptedValue = _accepted;
        return eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      })
      .then(function (_eth) {
        prevEthBalance = _eth;
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      })
      .then(function (_tokensWei) {
        prevTokensBalance = _tokensWei;
        return colony.updateTaskTitle(0, 'TASK B');
      })
      .then(function () {
        return eternalStorage.getStringValue.call(solSha3('task_name', 0));
      })
      .then(function (name) {
        assert.equal(name, 'TASK B', 'Incorrect task name');
        return eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      })
      .then(function (_summary) {
        assert.equal(_summary, 'INTERESTING TASK SUMMARY', 'Wrong task summary');
        return eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      })
      .then(function (_accepted) {
        assert.equal(_accepted, prevAcceptedValue, 'Wrong accepted value');
        return eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      })
      .then(function (_eth) {
        assert.equal(_eth.toNumber(), prevEthBalance, 'Wrong task ether value');
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      })
      .then(function (_tokensWei) {
        assert.equal(_tokensWei.toNumber(), prevTokensBalance, 'Wrong tokens wei value');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the task was already accepted', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function () {
        return colony.acceptTask(0);
      })
      .then(function () {
        return eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      })
      .then(function (_accepted) {
        assert.isTrue(_accepted, 'Wrong accepted value');
        return colony.updateTaskTitle(0, 'TASK B', {
          from: MAIN_ACCOUNT,
          gas: 1e6,
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (txid) {
        testHelper.checkAllGasSpent(1e6, txid);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if I give it an invalid title', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function () {
        return colony.updateTaskTitle(0, '', {
          from: MAIN_ACCOUNT,
          gas: 1e6,
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (txid) {
        testHelper.checkAllGasSpent(1e6, txid);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if I try to update a task when i\'m not the owner', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function () {
        return colony.updateTaskTitle(0, 'TASK B', {
          from: OTHER_ACCOUNT,
          gas: 1e6,
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (txid) {
        testHelper.checkAllGasSpent(1e6, txid);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if I try to update a task using an invalid id', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function () {
        return colony.updateTaskTitle(10, 'New title', {
          from: MAIN_ACCOUNT,
          gas: 1e6,
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (txid) {
        testHelper.checkAllGasSpent(1e6, txid);
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when retrieving task data', function () {
    it('should return every task attribute for a valid id', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function () {
        return eternalStorage.getStringValue.call(solSha3('task_name', 0));
      })
      .then(function (_name) {
        assert.equal(_name, 'TASK A', 'Wrong task name');
        return eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      })
      .then(function (_summary) {
        assert.equal(_summary, 'INTERESTING TASK SUMMARY', 'Wrong task summary');
        return eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      })
      .then(function (_accepted) {
        assert.equal(_accepted, false, '"accepted" flag is "true" after creating a task');
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when accepting a task', function () {
    it('should the "accepted" prop be set as "true"', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function () {
        return colony.acceptTask(0);
      })
      .then(function () {
        return eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      })
      .then(function (accepted) {
        assert.equal(accepted, true, '"accepted" flag is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if I try to accept a task when i\'m not the owner', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function () {
        return colony.acceptTask(0, {
          from: OTHER_ACCOUNT,
          gas: 1e6,
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (txid) {
        testHelper.checkAllGasSpent(1e6, txid);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if I try to accept a task was accepted before', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function () {
        return colony.acceptTask(0);
      })
      .then(function () {
        return colony.acceptTask(0, {
          from: MAIN_ACCOUNT,
          gas: 1e6,
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (txid) {
        testHelper.checkAllGasSpent(1e6, txid);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if I try to accept a task using an invalid id', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function () {
        return colony.acceptTask(10, {
          from: MAIN_ACCOUNT,
          gas: 1e6,
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (txid) {
        testHelper.checkAllGasSpent(1e6, txid);
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when contributing to a task', function () {
    it('should "tokens" prop be raised by the amount of tokens I send', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function () {
        return colony.generateTokensWei(100);
      })
      .then(function () {
        return colony.setReservedTokensWeiForTask(0, 10);
      })
      .then(function () {
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      })
      .then(function (tokensWei) {
        assert.equal(tokensWei.toNumber(), 10, '"tokens" value is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should "ETH" prop be raised by the amount of ETH I send', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function () {
        return colony.contributeEthToTask(0, { value: 10 });
      })
      .then(function () {
        return eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      })
      .then(function (_eth) {
        assert.equal(_eth.toNumber(), 10, '"eth" value is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should "ETH" and "tokens" props be raised by the amount of ETH and tokens I send', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function () {
        return colony.generateTokensWei(100);
      })
      .then(function () {
        return colony.contributeEthToTask(0, { value: 10 });
      })
      .then(function () {
        return colony.setReservedTokensWeiForTask(0, 100);
      })
      .then(function () {
        return eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      })
      .then(function (eth) {
        assert.equal(eth.toNumber(), 10, '"eth" value is incorrect');
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      })
      .then(function (_tokensWei) {
        assert.equal(_tokensWei.toNumber(), 100, '"tokens" value is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should set the "setBudget" to "true" when the task is funded with ETH', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function () {
        return colony.contributeEthToTask(0, { value: 10 });
      })
      .then(function () {
        return eternalStorage.getBooleanValue.call(solSha3('task_funded', 0));
      })
      .then(function (_setBudget) {
        assert.equal(_setBudget, true, '"setBudget" task property should be "true"');
      })
      .then(done)
      .catch(done);
    });

    it('should set the "setBudget" to "true" when the task is funded with tokens', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function () {
        return colony.generateTokensWei(100);
      })
      .then(function () {
        return colony.setReservedTokensWeiForTask(0, 10);
      })
      .then(function () {
        return eternalStorage.getBooleanValue.call(solSha3('task_funded', 0));
      })
      .then(function (_setBudget) {
        assert.equal(_setBudget, true, '"setBudget" task property should be "true"');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if I try to contribute to an accepted task', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function () {
        return colony.acceptTask(0);
      })
      .then(function () {
        return colony.contributeEthToTask(0, 10, {
          from: MAIN_ACCOUNT,
          gas: 1e6,
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (txid) {
        testHelper.checkAllGasSpent(1e6, txid);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if I try to contribute to a nonexistent task', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function () {
        return colony.contributeEthToTask(10, 10, {
          from: MAIN_ACCOUNT,
          gas: 1e6,
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (txid) {
        testHelper.checkAllGasSpent(1e6, txid);
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when using count function', function () {
    it('should return zero if no task was added', function (done) {
      colony.getTaskCount.call()
      .then(function (_count) {
        assert.equal(_count, 0, '"count" return is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should return the number of tasks if tasks were added', function (done) {
      testHelper.Promise.all([
        colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY'),
        colony.makeTask('TASK B', 'INTERESTING TASK SUMMARY'),
        colony.makeTask('TASK C', 'INTERESTING TASK SUMMARY'),
        colony.makeTask('TASK D', 'INTERESTING TASK SUMMARY'),
        colony.makeTask('TASK E', 'INTERESTING TASK SUMMARY'),
        colony.makeTask(BIGGER_TASK_TITLE, BIGGER_TASK_SUMMARY),
        colony.makeTask(BIGGER_TASK_TITLE, BIGGER_TASK_SUMMARY),
      ])
      .then(function () {
        return colony.getTaskCount.call();
      })
      .then(function (count) {
        assert.equal(count, 7, '"count" return is incorrect');
      })
      .then(done)
      .catch(done);
    });
  });
});
