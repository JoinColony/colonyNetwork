/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, Colony, ColonyFactory, RootColony, RootColonyResolver, web3, assert */

var testHelper = require('../helpers/test-helper.js');
contract('TaskDB', function (accounts) {
  var _COLONY_KEY_ = 'COLONY_TEST';
  var _BIGGER_TASK_SUMMARY_ = 'Lorem ipsum dolor sit amet, consectetur adipiscing el';
  var _BIGGER_TASK_TITLE_ = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit';
  var _GAS_PRICE_ = 20e9;
  var _MAIN_ACCOUNT_ = accounts[0];
  var _OTHER_ACCOUNT_ = accounts[1];
  var colony;
  var colonyFactory;
  var rootColony;
  var rootColonyResolver;

  before(function(done)
  {
    colonyFactory = ColonyFactory.deployed();
    rootColony = RootColony.deployed();
    rootColonyResolver = RootColonyResolver.deployed();

    rootColonyResolver.registerRootColony(rootColony.address)
    .then(function(){
      return colonyFactory.registerRootColonyResolver(rootColonyResolver.address);
    })
    .then(function(){
      rootColony.registerColonyFactory(colonyFactory.address);
    })
    .then(done)
    .catch(done);
  });

  afterEach(function(done){
    rootColony.removeColony(_COLONY_KEY_).then(function(){ done(); }).catch(done);
  });

  beforeEach(function(done){
    rootColony.createColony(_COLONY_KEY_, {from: _MAIN_ACCOUNT_})
    .then(function(){
      return rootColony.getColony.call(_COLONY_KEY_);
    })
    .then(function(colony_){
      colony = Colony.at(colony_);
    })
    .then(done)
    .catch(done);
  });

    describe('when adding tasks', function(){
      it('should add an entry to tasks array', function (done) {
        colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY', { from: _MAIN_ACCOUNT_ })
        .then(function(){
          return colony.taskDB.call(0);
        })
        .then(function(args){
          assert.isDefined(args, 'task was not created');
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
        return colony.taskDB.call(0);
      })
      .then(function(args){
        assert.isDefined(args, 'task was not created');
        return colony.updateTask(0, 'TASK B', 'ANOTHER INTERESTING TASK SUMMARY');
      })
      .then(function(){
        return colony.taskDB.call(0);
      })
      .then(function(args){
        assert.equal(args[0], 'TASK B', 'task title is incorrect');
        assert.equal(args[1], 'ANOTHER INTERESTING TASK SUMMARY', 'task summary is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should not interfere in "accepted", "eth" or "tokens" props', function (done) {
      var prevEthBalance, prevTokensBalance, prevAcceptedValue;

      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return colony.taskDB.call(0);
      })
      .then(function(args){
        assert.isDefined(args, 'task was not created');
        prevAcceptedValue = args[2];
        prevEthBalance = args[3].toNumber();
        prevTokensBalance = args[4].toNumber();
        return colony.updateTask(0, 'TASK B', 'ANOTHER INTERESTING TASK SUMMARY');
      })
      .then(function(){
        return colony.taskDB.call(0);
      })
      .then(function(args){
        assert.equal(args[0], 'TASK B', 'task title is incorrect');
        assert.equal(args[1], 'ANOTHER INTERESTING TASK SUMMARY', 'task summary is incorrect');
        assert.equal(args[2], prevAcceptedValue, 'task "accepted" prop is incorrect');
        assert.equal(args[3].toNumber(), prevEthBalance, 'task "eth" is incorrect');
        assert.equal(args[4].toNumber(), prevTokensBalance, 'task "tokens" prop is incorrect');
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
        return colony.taskDB.call(0);
      })
      .then(function(args){
        assert.isTrue(args[2], 'task "accepted" prop is incorrect');
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
      .then(function(){
        return colony.taskDB.call(0);
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
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return colony.acceptTask(0);
      })
      .then(function(){
        return colony.taskDB.call(0);
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
        return colony.generateColonyTokens(100);
      })
      .then(function(){
        return colony.contributeTokensFromPool(0, 10);
      })
      .then(function(){
        return colony.taskDB.call(0);
      })
      .then(function(args){
        assert.isDefined(args, 'task was not created');
        assert.equal(args[4].toNumber(), 10*1e18, '"tokens" value is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should "ETH" prop be raised by the amount of ETH I send', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return colony.contributeEth(0, {value: 10});
      })
      .then(function(){
        return colony.taskDB.call(0);
      })
      .then(function(args){
        assert.isDefined(args, 'task was not created');
        assert.equal(args[3].toNumber(), 10, '"eth" value is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should "ETH" and "tokens" props be raised by the amount of ETH and tokens I send', function (done) {
      colony.makeTask('TASK A', 'INTERESTING TASK SUMMARY')
      .then(function(){
        return colony.generateColonyTokens(100);
      })
      .then(function(){
        return colony.contributeEth(0, {value: 10});
      })
      .then(function(){
        return colony.contributeTokensFromPool(0, 100);
      })
      .then(function(){
        return colony.taskDB.call(0);
      })
      .then(function(args){
        assert.isDefined(args, 'task was not created');
        assert.equal(args[3].toNumber(), 10, '"eth" value is incorrect');
        assert.equal(args[4].toNumber(), 100*1e18, '"tokens" value is incorrect');
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
        return colony.contributeEth(0, 10,
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
        return colony.contributeEth(10, 10,
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
