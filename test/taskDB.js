/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, TaskDB, assert, web3 */

var testHelper = require('./test-helper.js');
contract('TaskDB', function (accounts) {

  var _BIGGER_TASK_SUMMARY_ = 'Lorem ipsum dolor sit amet, consectetur adipiscing el';
  var _BIGGER_TASK_TITLE_ = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit';
  var _GAS_PRICE_ = 20e9;
  var _MAIN_ACCOUNT_ = accounts[0];
  var _OTHER_ACCOUNT_ = accounts[1];
  var taskDB;

  beforeEach(function(done){
    TaskDB.new(_MAIN_ACCOUNT_)
    .then(function(_taskDB){
      taskDB = _taskDB;
    })
    .then(done)
    .catch(done);
  });

  describe('when adding tasks', function(){
    it('should add an entry to tasks array', function (done) {
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return taskDB.getTask(0);
      })
      .then(function(args){
        assert.isDefined(args, 'task was not created');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if another user (not the owner) tries to add a new task', function (done) {
      var prevBalance = web3.eth.getBalance(_OTHER_ACCOUNT_);
      taskDB.makeTask('', 'INTERESTING TASK SUMMARY',
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
      taskDB.makeTask('', 'INTERESTING TASK SUMMARY',
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
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return taskDB.getTask(0);
      })
      .then(function(args){
        assert.isDefined(args, 'task was not created');
        return taskDB.updateTask(0, 'TASK B', 'ANOTHER INTERESTING TASK SUMMARY');
      })
      .then(function(){
        return taskDB.getTask(0);
      })
      .then(function(args){
        assert.equal(args[0], 'TASK B', 'task title is incorrect');
        assert.equal(args[1], 'ANOTHER INTERESTING TASK SUMMARY', 'task summary is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should not interfere in "accepted", "eth" or "shares" props', function (done) {
      var prevEthBalance, prevSharesBalance, prevAcceptedValue;
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return taskDB.getTask(0);
      })
      .then(function(args){
        assert.isDefined(args, 'task was not created');
        prevAcceptedValue = args[2];
        prevEthBalance = args[3].toNumber();
        prevSharesBalance = args[4].toNumber();
        return taskDB.updateTask(0, 'TASK B', 'ANOTHER INTERESTING TASK SUMMARY');
      })
      .then(function(){
        return taskDB.getTask(0);
      })
      .then(function(args){
        assert.equal(args[0], 'TASK B', 'task title is incorrect');
        assert.equal(args[1], 'ANOTHER INTERESTING TASK SUMMARY', 'task summary is incorrect');
        assert.equal(args[2], prevAcceptedValue, 'task "accepted" prop is incorrect');
        assert.equal(args[3].toNumber(), prevEthBalance, 'task "eth" is incorrect');
        assert.equal(args[4].toNumber(), prevSharesBalance, 'task "shares" prop is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the task was already accepted', function (done) {
      var prevBalance;
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return taskDB.acceptTask(0);
      })
      .then(function(){
        return taskDB.getTask(0);
      })
      .then(function(args){
        assert.isTrue(args[2], 'task "accepted" prop is incorrect');
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return taskDB.updateTask(0, 'TASK B', 'ANOTHER INTERESTING TASK SUMMARY',
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
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return taskDB.updateTask(0, '', 'INTERESTING TASK SUMMARY',
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
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        prevBalance = web3.eth.getBalance(_OTHER_ACCOUNT_);
        return taskDB.updateTask(0, 'TASK B', 'ANOTHER INTERESTING TASK SUMMARY',
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
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return taskDB.updateTask(10, '', 'INTERESTING TASK SUMMARY',
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
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return taskDB.getTask(0);
      })
      .then(function(args){
        assert.isDefined(args, 'task was not created');
        assert.equal(args[0], 'TASK A', 'task title is incorrect');
        assert.equal(args[1], 'INTERESTING TASK SUMMARY', 'task summary is incorrect');
        assert.equal(args[2], false, '"accepted" flag is "true" after creating a task');
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when accepting a task', function(){
    it('should the "accepted" prop be set as "true"', function (done) {
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return taskDB.acceptTask(0);
      })
      .then(function(){
        return taskDB.getTask(0);
      })
      .then(function(args){
        assert.isDefined(args, 'task was not created');
        assert.equal(args[2], true, '"accepted" flag is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if I try to accept a task when i\'m not the owner', function (done) {
      var prevBalance;
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        prevBalance = web3.eth.getBalance(_OTHER_ACCOUNT_);
        return taskDB.acceptTask(0,
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
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return taskDB.acceptTask(0);
      })
      .then(function(){
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return taskDB.acceptTask(0,
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
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return taskDB.acceptTask(10,
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
    it('should "shares" prop be raised by the amount of shares I send', function (done) {
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return taskDB.contributeShares(0, 10);
      })
      .then(function(){
        return taskDB.getTask(0);
      })
      .then(function(args){
        assert.isDefined(args, 'task was not created');
        assert.equal(args[4].toNumber(), 10, '"shares" value is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should "ETH" prop be raised by the amount of ETH I send', function (done) {
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return taskDB.contributeEth(0, 10);
      })
      .then(function(){
        return taskDB.getTask(0);
      })
      .then(function(args){
        assert.isDefined(args, 'task was not created');
        assert.equal(args[3].toNumber(), 10, '"eth" value is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should "ETH" and "shares" props be raised by the amount of ETH and shares I send', function (done) {
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return taskDB.contributeEth(0, 10);
      })
      .then(function(){
        return taskDB.contributeShares(0, 10);
      })
      .then(function(){
        return taskDB.getTask(0);
      })
      .then(function(args){
        assert.isDefined(args, 'task was not created');
        assert.equal(args[4].toNumber(), 10, '"shares" value is incorrect');
        assert.equal(args[3].toNumber(), 10, '"eth" value is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if I try to contribute to an accepted task', function (done) {
      var prevBalance;
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return taskDB.acceptTask(0);
      })
      .then(function(){
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return taskDB.contributeEth(0, 10,
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

    it('should fail if I try to contribute to a task using an invalid id', function (done) {
      var prevBalance;
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return taskDB.contributeEth(10, 10,
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

  describe('when verifying if a task exists', function(){
    it('should return true for a valid task id', function (done) {
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return taskDB.hasTask(0);
      })
      .then(function(_exists){
        assert.isTrue(_exists, '"hasTask" return is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should return false for an invalid task id', function (done) {
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return taskDB.hasTask(10);
      })
      .then(function(_exists){
        assert.isFalse(_exists, '"hasTask" return is incorrect');
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when verifying if a task is already accepted', function(){
    it('should return true for a valid task id', function (done) {
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return taskDB.acceptTask(0);
      })
      .then(function(){
        return taskDB.isTaskAccepted(0);
      })
      .then(function(_isAccepted){
        assert.isTrue(_isAccepted, '"isTaskAccepted" return is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should return false if a task wasn\'t accepted', function (done) {
      taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return taskDB.isTaskAccepted(0);
      })
      .then(function(_isAccepted){
        assert.isFalse(_isAccepted, '"isTaskAccepted" return is incorrect');
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when using count function', function(){
    it('should return zero if no task was added', function (done) {
      taskDB.count.call()
      .then(function(_count){
        assert.equal(_count.toNumber(), 0, '"count" return is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should return the number of tasks if tasks were added', function (done) {
      testHelper.Promise.all([
        taskDB.makeTask('TASK A', 'INTERESTING TASK SUMMARY'),
        taskDB.makeTask('TASK B', 'INTERESTING TASK SUMMARY'),
        taskDB.makeTask('TASK C', 'INTERESTING TASK SUMMARY'),
        taskDB.makeTask('TASK D', 'INTERESTING TASK SUMMARY'),
        taskDB.makeTask('TASK E', 'INTERESTING TASK SUMMARY'),
        taskDB.makeTask(_BIGGER_TASK_TITLE_, _BIGGER_TASK_SUMMARY_),
        taskDB.makeTask(_BIGGER_TASK_TITLE_, _BIGGER_TASK_SUMMARY_)
      ])
      .then(function(){
        return taskDB.count.call();
      })
      .then(function(_count){
        assert.equal(_count.toNumber(), 7, '"count" return is incorrect');
      })
      .then(done)
      .catch(done);
    });
  });
});
