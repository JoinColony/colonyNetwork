/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, RootColony, Colony, RootColonyResolver, web3, ColonyFactory, assert */

var testHelper = require('./test-helper.js');
contract('RootColony', function (accounts) {
  var _COLONY_KEY_ = 'COLONY_TEST';
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

    testHelper.waitAll([
      rootColonyResolver.registerRootColony(rootColony.address),
      colonyFactory.registerRootColonyResolver(rootColonyResolver.address),
      rootColony.registerColonyFactory(colonyFactory.address)
    ], done);
  });

  afterEach(function(done){
    testHelper.waitAll([rootColony.removeColony(_COLONY_KEY_)], done);
  });

  describe('when spawning new colonies', function(){
    it('should allow users to create new colonies', function (done) {
      rootColony.createColony(_COLONY_KEY_)
      .then(function(){
        return rootColony.getColony.call(_COLONY_KEY_);
      })
      .then(function (_address){
        colony = Colony.at(_address);
        return colony.getUserInfo.call(_MAIN_ACCOUNT_);
      })
      .then(function(_isAdmin){
        assert.isTrue(_isAdmin, 'creator user is an admin');
        return colony.getRootColony.call();
      })
      .then(function (_rootColonyAddress) {
        assert.equal(rootColony.address, _rootColonyAddress, 'root colony address is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should allow users to iterate over colonies', function (done) {
      testHelper.Promise.all([
        rootColony.createColony(testHelper.getRandomString(7)),
        rootColony.createColony(testHelper.getRandomString(7)),
        rootColony.createColony(testHelper.getRandomString(7)),
        rootColony.createColony(testHelper.getRandomString(7)),
        rootColony.createColony(testHelper.getRandomString(7)),
        rootColony.createColony(testHelper.getRandomString(7)),
        rootColony.createColony(testHelper.getRandomString(7))
      ])
      .then(function(){
        return rootColony.countColonies.call();
      })
      .then(function(_coloniesCount){
        assert.equal(_coloniesCount, 7, '# of colonies created is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the key provided is empty', function (done) {
      var prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
      rootColony.createColony('',
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

    it('should fail if ETH is sent', function (done) {
      var prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
      rootColony.createColony(_COLONY_KEY_,
      {
        from: _MAIN_ACCOUNT_,
        gasPrice : _GAS_PRICE_,
        gas: 1e6,
        value: 1
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should pay root colony 5% fee of a completed task value', function (done) {
      var startingBalance = web3.eth.getBalance(rootColony.address);
      rootColony.createColony(_COLONY_KEY_)
      .then(function(){
        return rootColony.getColony.call(_COLONY_KEY_);
      })
      .then(function (_address){
        colony = Colony.at(_address);
        return colony.makeTask('name', 'summary', {from:_MAIN_ACCOUNT_});
      })
      .then(function() {
        return colony.updateTask(0, 'nameedit', 'summary');
      })
      .then(function () {
        return colony.contributeEth(0, {from: _MAIN_ACCOUNT_, value: 1000});
      })
      .then(function () {
        return colony.completeAndPayTask(0, _OTHER_ACCOUNT_, { from: _MAIN_ACCOUNT_ });
      })
      .then(function () {
        var currentBalance = web3.eth.getBalance(rootColony.address).minus(startingBalance).toNumber();
        assert.equal(currentBalance, 50, 'balance is incorrect or has a unexpected value');
      })
      .then(done)
      .catch(done);
    });

    it('should be able to upgrade colonies', function(done) {
      var oldColonyAddress;
      var upgradedColony;
      rootColony.createColony(_COLONY_KEY_)
      .then(function(){
        return rootColony.getColony.call(_COLONY_KEY_);
      })
      .then(function (_address){
        oldColonyAddress = _address;
        colony = Colony.at(_address);
        return colony.makeTask('name', 'summary', {from:_MAIN_ACCOUNT_});
      })
      .then(function(){
        return rootColony.upgradeColony(_COLONY_KEY_);
      })
      .then(function(){
        return rootColony.getColony.call(_COLONY_KEY_);
      })
      .then(function(upgradedColonyAddress){
        assert.notEqual(oldColonyAddress, upgradedColonyAddress);
      })      
      .then(done)
      .catch(done);
    });
  });
});
