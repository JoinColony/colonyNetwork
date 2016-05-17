/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, RootColony, Colony, ColonyTokenLedger, RootColonyResolver, web3, ColonyFactory, assert */
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
    ], function(){

      done();
    });
  });

  afterEach(function(done){
    testHelper.waitAll([rootColony.removeColony(_COLONY_KEY_)], done);
  });

  describe('when upgrading a colony', function(){
    it('should carry colony dependencies to the new colony', function(done) {
      var oldColonyAddress;
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
        return colony.contributeTokensFromPool(0, 20, {from: _MAIN_ACCOUNT_});
      })
      .then(function(){
        var colonyBalance = web3.eth.getBalance(colony.address);
        assert.equal(colonyBalance.toNumber(), 100, 'Colony balance is incorrect');
      })
      .then(function(){
        return colony.addAdmin('0x3cb0256160e49638e9aaa6c9df7f7c87d547c778', {from: _MAIN_ACCOUNT_});
      })
      .then(function(){
        return rootColony.upgradeColony(_COLONY_KEY_);
      })
      .then(function(){
        return rootColony.getColony.call(_COLONY_KEY_);
      })
      .then(function(upgradedColonyAddress){
        assert.notEqual(oldColonyAddress, upgradedColonyAddress);
        colony = Colony.at(upgradedColonyAddress);
        return colony.taskDB.call(0);
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
        return colony.taskDB.call(0);
      })
      .then(function(value){
        assert.isDefined(value, 'Task doesn\'t exists');
        assert.equal(value[0], 'nameedit', 'Task name is incorrect');
        assert.equal(value[1], 'summary', 'Task summary is incorrect');
        assert.equal(value[2], false, 'Task "accepted" flag is incorrect');
        assert.equal(value[3].toNumber(), 100, 'Task funds are incorrect');
        return colony.reservedTokensWei();
      })
      .then(function(tokens){
        assert.equal(tokens.toNumber(),20e18,'Incorrect amount of reserved tokens');
        return colony.getUserInfo('0x3cb0256160e49638e9aaa6c9df7f7c87d547c778');
      })
      .then(function(userInfo){
        assert.equal(userInfo, true, 'User added as admin is no longer admin');
        return colony.tokenLedger.call();
      })
      .then(function(tokenLedgerAddress){
        tokenLedger = ColonyTokenLedger.at(tokenLedgerAddress);
        return tokenLedger.balanceOf.call(colony.address);
      })
      .then(function(colonyTokenBalance){
        assert.equal(colonyTokenBalance.toNumber(), 100000000000000000000, 'Colony token balance is incorrect');

        var colonyBalance = web3.eth.getBalance(colony.address);
        assert.equal(colonyBalance.toNumber(), 100, 'Colony balance is incorrect');
      })
      .then(done)
      .catch(done);
    });
  });
});
