/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, Colony, RootColony, EternalStorage, web3, assert */

var testHelper = require('../helpers/test-helper.js');
import { solSha3 } from 'colony-utils';

contract('TaskLibrary', function (accounts) {
  var _COLONY_KEY_ = 'COLONY_TEST';
  var _BIGGER_TASK_SUMMARY_ = 'Lorem ipsum dolor sit amet, consectetur adipiscing el';
  var _BIGGER_TASK_TITLE_ = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit';
  var _GAS_PRICE_ = 20e9;
  var _MAIN_ACCOUNT_ = accounts[0];
  var _OTHER_ACCOUNT_ = accounts[1];
  var colony;
  var rootColony;
  var eternalStorage;
  var eternalStorageRoot;

  before(function(done) {
    rootColony = RootColony.deployed();
    eternalStorageRoot = EternalStorage.deployed();
    done();
  });

  beforeEach(function(done){
    _COLONY_KEY_ = testHelper.getRandomString(7);

    eternalStorageRoot.owner.call()
    .then(function(){
      return rootColony.createColony(_COLONY_KEY_, {from: _MAIN_ACCOUNT_});
    })
    .then(function(){
      return rootColony.getColony.call(_COLONY_KEY_);
    })
    .then(function(colony_){
      colony = Colony.at(colony_);
      return;
    })
    .then(function(){
      return colony.eternalStorage.call();
    })
    .then(function(extStorageAddress){
      eternalStorage = EternalStorage.at(extStorageAddress);
      return;
    })
    .then(done)
    .catch(done);
  });

    describe('when adding tasks', function(){
      it('should add an entry to tasks array', function (done) {
        colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY', { from: _MAIN_ACCOUNT_ })
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
        var prevBalance = web3.eth.getBalance(_OTHER_ACCOUNT_);
        colony.makeTask('', 'INTERESTING TASK SUMMARY',
        {
          from: _OTHER_ACCOUNT_,
          gasPrice : _GAS_PRICE_,
          gas: 1e6
        })
        .catch(testHelper.ifUsingTestRPC)
        .then(function(){
          testHelper.checkAllGasSpent(1e6, _GAS_PRICE_, _OTHER_ACCOUNT_, prevBalance);
        })
        .then(done)
        .catch(done);
      });

      it('should fail if I give it an invalid title', function (done) {
        var prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        colony.makeTask('', 'INTERESTING TASK SUMMARY',
        {
          from: _MAIN_ACCOUNT_,
          gasPrice : _GAS_PRICE_,
          gas: 1e6
        })
        .catch(testHelper.ifUsingTestRPC)
        .then(function(){
          testHelper.checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
        })
        .then(done)
        .catch(done);
      });
    });

  describe('when updating existing tasks', function(){
    it('should update data to tasks array', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return colony.updateTask(0, 'TASK B', 'ANOTHER INTERESTING TASK SUMMARY');
      })
      .then(function () {
        return eternalStorage.getStringValue.call(solSha3('task_name', 0));
      })
      .then(function (_name) {
        assert.equal(_name, 'TASK B', 'Wrong task name');
        return eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      })
      .then(function(_summary){
        assert.equal(_summary, 'ANOTHER INTERESTING TASK SUMMARY', 'Wrong task summary');
      })
      .then(done)
      .catch(done);
    });

    it('should not interfere in "accepted", "eth" or "tokens" props', function (done) {
      var prevEthBalance, prevTokensBalance, prevAcceptedValue;

      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      })
      .then(function(_accepted){
        prevAcceptedValue = _accepted;
        return eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      })
      .then(function(_eth){
        prevEthBalance = _eth;
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      })
      .then(function(_tokensWei){
        prevTokensBalance = _tokensWei;
        return colony.updateTask(0, 'TASK B', 'ANOTHER INTERESTING TASK SUMMARY');
      })
      .then(function () {
        return eternalStorage.getStringValue.call(solSha3('task_name', 0));
      })
      .then(function (name) {
        assert.equal(name, 'TASK B', 'Incorrect task name');
        return eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      })
      .then(function(_summary){
        assert.equal(_summary, 'ANOTHER INTERESTING TASK SUMMARY', 'Wrong task summary');
        return eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      })
      .then(function(_accepted){
        assert.equal(_accepted, prevAcceptedValue, 'Wrong accepted value');
        return eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      })
      .then(function(_eth){
        assert.equal(_eth.toNumber(), prevEthBalance, 'Wrong task ether value');
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      })
      .then(function(_tokensWei){
        assert.equal(_tokensWei.toNumber(), prevTokensBalance, 'Wrong tokens wei value');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the task was already accepted', function (done) {
      var prevBalance;
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return colony.acceptTask(0);
      })
      .then(function(){
        return eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      })
      .then(function(_accepted){
        assert.isTrue(_accepted, 'Wrong accepted value');
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return colony.updateTask(0, 'TASK B', 'ANOTHER INTERESTING TASK SUMMARY',
        {
          from: _MAIN_ACCOUNT_,
          gasPrice : _GAS_PRICE_,
          gas: 1e6
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if I give it an invalid title', function (done) {
      var prevBalance;
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return colony.updateTask(0, '', 'INTERESTING TASK SUMMARY',
        {
          from: _MAIN_ACCOUNT_,
          gasPrice : _GAS_PRICE_,
          gas: 1e6
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if I try to update a task when i\'m not the owner', function (done) {
      var prevBalance;
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        prevBalance = web3.eth.getBalance(_OTHER_ACCOUNT_);
        return colony.updateTask(0, 'TASK B', 'ANOTHER INTERESTING TASK SUMMARY',
        {
          from: _OTHER_ACCOUNT_,
          gasPrice : _GAS_PRICE_,
          gas: 1e6
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(1e6, _GAS_PRICE_, _OTHER_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if I try to update a task using an invalid id', function (done) {
      var prevBalance;
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return colony.updateTask(10, '', 'INTERESTING TASK SUMMARY',
        {
          from: _MAIN_ACCOUNT_,
          gasPrice : _GAS_PRICE_,
          gas: 1e6
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when retrieving task data', function(){
    it('should return every task attribute for a valid id', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function () {
        return eternalStorage.getStringValue.call(solSha3('task_name', 0));
      })
      .then(function (_name) {
        assert.equal(_name, 'TASK A', 'Wrong task name');
        return eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      })
      .then(function(_summary){
        assert.equal(_summary, 'INTERESTING TASK SUMMARY', 'Wrong task summary');
        return eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      })
      .then(function(_accepted){
        assert.equal(_accepted, false, '"accepted" flag is "true" after creating a task');
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when accepting a task', function(){
    it('should the "accepted" prop be set as "true"', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return colony.acceptTask(0);
      })
      .then(function(){
        return eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      })
      .then(function(accepted){
        assert.equal(accepted, true, '"accepted" flag is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if I try to accept a task when i\'m not the owner', function (done) {
      var prevBalance;
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        prevBalance = web3.eth.getBalance(_OTHER_ACCOUNT_);
        return colony.acceptTask(0,
        {
          from: _OTHER_ACCOUNT_,
          gasPrice : _GAS_PRICE_,
          gas: 1e6
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(1e6, _GAS_PRICE_, _OTHER_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if I try to accept a task was accepted before', function (done) {
      var prevBalance;
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return colony.acceptTask(0);
      })
      .then(function(){
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return colony.acceptTask(0,
        {
          from: _MAIN_ACCOUNT_,
          gasPrice : _GAS_PRICE_,
          gas: 1e6
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if I try to accept a task using an invalid id', function (done) {
      var prevBalance;
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return colony.acceptTask(10,
        {
          from: _MAIN_ACCOUNT_,
          gasPrice : _GAS_PRICE_,
          gas: 1e6
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when contributing to a task', function(){
    it('should "tokens" prop be raised by the amount of tokens I send', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return colony.generateTokensWei(100);
      })
      .then(function(){
        return colony.contributeTokensWeiFromPool(0, 10);
      })
      .then(function () {
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      })
      .then(function(tokensWei){
        assert.equal(tokensWei.toNumber(), 10, '"tokens" value is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should "ETH" prop be raised by the amount of ETH I send', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return colony.contributeEthToTask(0, {value: 10});
      })
      .then(function(){
        return eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      })
      .then(function(_eth){
        assert.equal(_eth.toNumber(), 10, '"eth" value is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should "ETH" and "tokens" props be raised by the amount of ETH and tokens I send', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return colony.generateTokensWei(100);
      })
      .then(function(){
        return colony.contributeEthToTask(0, {value: 10});
      })
      .then(function(){
        return colony.contributeTokensWeiFromPool(0, 100);
      })
      .then(function () {
        return eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      })
      .then(function(eth){
        assert.equal(eth.toNumber(), 10, '"eth" value is incorrect');
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      })
      .then(function(_tokensWei){
        assert.equal(_tokensWei.toNumber(), 100, '"tokens" value is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if I try to contribute to an accepted task', function (done) {
      var prevBalance;
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return colony.acceptTask(0);
      })
      .then(function(){
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return colony.contributeEthToTask(0, 10,
        {
          from: _MAIN_ACCOUNT_,
          gasPrice : _GAS_PRICE_,
          gas: 1e6
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if I try to contribute to a nonexistent task', function (done) {
      var prevBalance;
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return colony.contributeEthToTask(10, 10,
        {
          from: _MAIN_ACCOUNT_,
          gasPrice : _GAS_PRICE_,
          gas: 1e6
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when using count function', function(){
    it('should return zero if no task was added', function (done) {
      colony.getTaskCount.call()
      .then(function(_count){
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
        colony.makeTask(_BIGGER_TASK_TITLE_, _BIGGER_TASK_SUMMARY_),
        colony.makeTask(_BIGGER_TASK_TITLE_, _BIGGER_TASK_SUMMARY_)
      ])
      .then(function(){
        return colony.getTaskCount.call();
      })
      .then(function(count){
        assert.equal(count, 7, '"count" return is incorrect');
      })
      .then(done)
      .catch(done);
    });
  });
});
