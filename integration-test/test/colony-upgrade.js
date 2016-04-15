/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, RootColony, Colony, TaskDB, ColonyTokenLedger, RootColonyResolver, web3, ColonyFactory, assert */

var testHelper = require('../../helpers/test-helper.js');
contract('RootColony', function (accounts) {
  var _COLONY_KEY_ = 'COLONY_TEST';
  var _MAIN_ACCOUNT_ = accounts[0];
  var colony;
  var colonyFactory;
  var rootColony;
  var rootColonyResolver;

  before(function(done)
  {
    colonyFactory = ColonyFactory.deployed();
    rootColony = RootColony.deployed();
    rootColonyResolver = RootColonyResolver.deployed();

    testHelper.waitAll([
      rootColonyResolver.registerRootColony(rootColony.address),
      colonyFactory.registerRootColonyResolver(rootColonyResolver.address),
      rootColony.registerColonyFactory(colonyFactory.address)
    ], done);
  });

  afterEach(function(done){
    testHelper.waitAll([rootColony.removeColony(_COLONY_KEY_)], done);
  });

  describe('when upgrading a colony', function(){
    it('should carry colony dependencies to the new colony', function(done) {
      var oldColonyAddress;
      var taskDB;
      var tokenLedger;
      rootColony.createColony(_COLONY_KEY_)
      .then(function(){
        return rootColony.getColony.call(_COLONY_KEY_);
      })
      .then(function (_address){
        oldColonyAddress = _address;
        colony = Colony.at(_address);
        return colony.generateColonyTokens(100);
      })
      .then(function(){
        return colony.makeTask('name', 'summary');
      })
      .then(function(){
        return colony.contributeEth(0, {from: _MAIN_ACCOUNT_, value: 100});
      })
      .then(function(){
        var colonyBalance = web3.eth.getBalance(colony.address);
        assert.equal(colonyBalance, 100, 'Colony balance is incorrect');

        return rootColony.upgradeColony(_COLONY_KEY_);
      })
      .then(function(){
        return rootColony.getColony.call(_COLONY_KEY_);
      })
      .then(function(upgradedColonyAddress){
        assert.notEqual(oldColonyAddress, upgradedColonyAddress);

        colony = Colony.at(upgradedColonyAddress);
        return colony.taskDB.call();
      })
      .then(function(taskDBAddress){
        taskDB = TaskDB.at(taskDBAddress);
        return taskDB.getTask.call(0);
      })
      .then(function(value){
        assert.isDefined(value, 'Task doesn\'t exists');
        assert.equal(value[0], 'name', 'Task name is incorrect');
        assert.equal(value[1], 'summary', 'Task summary is incorrect');
        assert.equal(value[2], false, 'Task "accepted" flag is incorrect');
        assert.equal(value[3].toNumber(), 100, 'Task funds are incorrect');

        return colony.updateTask(0, 'nameedit', 'summary');
      })
      .then(function(){
        return taskDB.getTask.call(0);
      })
      .then(function(value){
        assert.isDefined(value, 'Task doesn\'t exists');
        assert.equal(value[0], 'nameedit', 'Task name is incorrect');
        assert.equal(value[1], 'summary', 'Task summary is incorrect');
        assert.equal(value[2], false, 'Task "accepted" flag is incorrect');
        assert.equal(value[3].toNumber(), 100, 'Task funds are incorrect');

        return colony.tokenLedger.call();
      })
      .then(function(tokenLedgerAddress){
        tokenLedger = ColonyTokenLedger.at(tokenLedgerAddress);
        return tokenLedger.balanceOf.call(colony.address);
      })
      .then(function(colonyTokenBalance){
        assert.equal(colonyTokenBalance, 100, 'Colony token balance is incorrect');

        var colonyBalance = web3.eth.getBalance(colony.address);
        assert.equal(colonyBalance, 100, 'Colony balance is incorrect');
      })
      .then(done)
      .catch(done);
    });
  });
});
