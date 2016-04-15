/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, Colony, ColonyFactory, TaskDB, ColonyTokenLedger, RootColony, RootColonyResolver, web3, assert
*/
var testHelper = require('./test-helper.js');
contract('Colony', function (accounts) {
  var _COLONY_KEY_ = 'COLONY_TEST';
  var _MAIN_ACCOUNT_ = accounts[0];
  var _OTHER_ACCOUNT_ = accounts[1];
  var colony;
  var colonyFactory;
  var colonyTaskDb;
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
      return rootColony.registerColonyFactory(colonyFactory.address);
    })
    .then(function(){
      done();
    })
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
      return colony.taskDB.call();
    })
    .then(function(_taskDBAddress){
      colonyTaskDb = TaskDB.at(_taskDBAddress);
    })
    .then(done)
    .catch(done);
  });

  describe('when created', function () {
    it('deployed user should be admin', function (done) {
      colony.getUserInfo.call(_MAIN_ACCOUNT_)
      .then(function (admin) {
        assert.equal(admin, true, 'First user isn\'t an admin');
      })
      .then(done)
      .catch(done);
    });

    it('other user should not be admin', function (done) {
      colony.getUserInfo.call(_OTHER_ACCOUNT_)
      .then(function (admin) {
        assert.equal(admin, false, 'Other user is an admin');
      })
      .then(done)
      .catch(done);
    });

    it('should generate tokens and assign it to the colony', function(done){
      var tokenLedger;
      colony.tokenLedger.call()
      .then(function(tokenLedgerAddress) {
        tokenLedger = ColonyTokenLedger.at(tokenLedgerAddress);
        return colony.generateColonyTokens(100);
      })
      .then(function(){
        return tokenLedger.balanceOf.call(colony.address);
      })
      .then(function(totalSupplyTokens){
        assert.equal(totalSupplyTokens.toNumber(), 100);
      })
      .then(done)
      .catch(done);
    });

    it('should set colony as the token ledger owner', function (done) {
      var tokenLedger;
      colony.tokenLedger.call()
      .then(function(tokenLedgerAddress){
        tokenLedger = ColonyTokenLedger.at(tokenLedgerAddress);
        return tokenLedger.owner.call();
      })
      .then(function(_tokenLedgerOwner){
        assert.equal(_tokenLedgerOwner, colony.address, 'Colony admin should be set as the owner of its Token Ledger.');
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when working with tasks', function () {
    it('should allow user to make task', function (done) {
      colony.makeTask('name', 'summary')
      .then(function() {
        return colonyTaskDb.getTask.call(0);
      })
      .then(function (value) {
        assert.equal(value[0], 'name', 'No task?');
        assert.equal(value[1], 'summary', 'No task?');
        assert.equal(value[2], false, 'No task?');
        assert.equal(value[3].toNumber(), 0, 'No task?');
      })
      .then(done)
      .catch(done);
    });

    it('should allow user to edit task', function (done) {
      colony.makeTask('name', 'summary').then(function () {
        return colony.updateTask(0, 'nameedit', 'summary');
      })
      .then(function () {
        return colonyTaskDb.getTask.call(0);
      })
      .then(function (value) {
        assert.equal(value[0], 'nameedit', 'No task?');
        assert.equal(value[1], 'summary', 'No task?');
        assert.equal(value[2], false, 'No task?');
        assert.equal(value[3].toNumber(), 0, 'No task?');
      })
      .then(done)
      .catch(done);
    });

    it('should allow user to contribute ETH to task', function (done) {
      colony.makeTask('name', 'summary')
      .then(function() {
        return colony.updateTask(0, 'nameedit', 'summary');
      })
      .then(function () {
        return colony.contributeEth(0, {
          value: 10000
        });
      })
      .then(function () {
        return colonyTaskDb.getTask.call(0);
      })
      .then(function (value) {
        assert.equal(value[0], 'nameedit', 'No task?');
        assert.equal(value[1], 'summary', 'No task?');
        assert.equal(value[2], false, 'No task?');
        assert.equal(value[3].toNumber(), 10000, 'No task?');
      })
      .then(done)
      .catch(done);
    });

    it('should allow user to contribute tokens to task', function (done) {
      var tokenLedger;

      colony.generateColonyTokens(100, {from: _MAIN_ACCOUNT_})
      .then(function(){
        return colony.makeTask('name', 'summary');
      })
      .then(function(){
        return colony.makeTask('name2', 'summary2');
      })
      .then(function() {
        return colony.updateTask(0, 'nameedit', 'summary');
      })
      .then(function () {
        return colony.tokenLedger.call();
      })
      .then(function(tokenLedgerAddress){
        tokenLedger = ColonyTokenLedger.at(tokenLedgerAddress);
      })
      .then(function(){
        return tokenLedger.balanceOf.call(colony.address);
      })
      .then(function(colonyBalance){
        assert.equal(colonyBalance.toNumber(), 100, 'Colony address balance should be 100 tokens.');
        return colony.contributeTokens(0, 100);
      })
      .then(function(){
        return colony.completeAndPayTask(0, _OTHER_ACCOUNT_, {from: _MAIN_ACCOUNT_});
      })
      .then(function(){
        return tokenLedger.balanceOf.call(_OTHER_ACCOUNT_);
      })
      .then(function(otherAccountTokenBalance){
        assert.equal(otherAccountTokenBalance.toNumber(), 95, '_OTHER_ACCOUNT_ balance should be 95 tokens.');
        return tokenLedger.approve(colony.address, 95, {from: _OTHER_ACCOUNT_});
      })
      .then(function(){
        return colony.contributeTokens(1, 95, {from: _OTHER_ACCOUNT_});
      })
      .then(function() {
        return colonyTaskDb.getTask.call(1);
      })
      .then(function (value) {
        assert.equal(value[0], 'name2');
        assert.equal(value[1], 'summary2');
        assert.equal(value[2], false);
        assert.equal(value[3].toNumber(), 0);
        assert.equal(value[4].toNumber(), 95);
      })
      .then(done)
      .catch(done);
    });

    it('should not allow colonies to double spend tokens when funding tasks with tokens', function (done) {
      colony.generateColonyTokens(100, {from: _MAIN_ACCOUNT_})
      .then(function(){
        return colony.makeTask('name', 'summary');
      })
      .then(function(){
        return colony.contributeTokens(0, 70, {from:_MAIN_ACCOUNT_});
      })
      .then(function(){
        return colony.getReservedTokens.call(0);
      })
      .then(function(reservedTokens){
        assert.equal(reservedTokens.toNumber(), 70, 'Has not reserved the right amount of colony tokens.');
        return colony.contributeTokens(0, 100, {from:_MAIN_ACCOUNT_});
      })
      .catch(testHelper.ifUsingTestRPC)

      .then(function(){
        done();
      })
      .catch(done);
    });

    it('should not allow non-admin to close task', function (done) {
      var prevBalance;
      colony.makeTask('name', 'summary')
      .then(function() {
        return colony.updateTask(0, 'nameedit', 'summary');
      })
      .then(function () {
        return colony.contributeEth(0, {
          value: 10000
        });
      })
      .then(function () {
        prevBalance = web3.eth.getBalance(_OTHER_ACCOUNT_);
        return colony.completeAndPayTask(0, _OTHER_ACCOUNT_, { from: _OTHER_ACCOUNT_ });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function () {
        return colonyTaskDb.getTask.call(0);
      })
      .then(function (value) {
        assert.equal(value[0], 'nameedit', 'No task?');
        assert.equal(value[1], 'summary', 'No task?');
        assert.equal(value[2], false, 'No task?');
        assert.equal(web3.eth.getBalance(_OTHER_ACCOUNT_).lessThan(prevBalance), true);
      })
      .then(done)
      .catch(done);
    });

    it('should allow admin to close task', function (done) {
      var prevBalance = web3.eth.getBalance(_OTHER_ACCOUNT_);
      colony.makeTask('name', 'summary')
      .then(function() {
        return colony.updateTask(0, 'nameedit', 'summary');
      })
      .then(function () {
        return colony.contributeEth(0, {
          value: 10000
        });
      })
      .then(function () {
        return colony.completeAndPayTask(0, _OTHER_ACCOUNT_, { from: _MAIN_ACCOUNT_ });
      })
      .then(function () {
        return colonyTaskDb.getTask.call(0);
      })
      .then(function (value) {
        assert.equal(value[0], 'nameedit', 'No task?');
        assert.equal(value[1], 'summary', 'No task?');
        assert.equal(value[2], true, 'No task?');
        assert.equal(value[3].toNumber(), 10000, 'No task?');
        assert.equal(value[4].toNumber(), 0, 'No task?');
        assert.equal(web3.eth.getBalance(_OTHER_ACCOUNT_).minus(prevBalance).toNumber(), 9500);
      })
      .then(done)
      .catch(done);
    });

    it('should transfer 95% of tokens to task completor and 5% to rootColony on completing a task', function (done) {
      var tokenLedger;
      colony.generateColonyTokens(100)
      .then(function(){
        return colony.makeTask('name', 'summary');
      })
      .then(function() {
        return colony.updateTask(0, 'nameedit', 'summary');
      })
      .then(function () {
        return colony.contributeTokens(0, 100);
      })
      .then(function () {
        return colony.completeAndPayTask(0, _OTHER_ACCOUNT_, { from: _MAIN_ACCOUNT_ });
      })
      .then(function(){
        return colony.tokenLedger.call();
      })
      .then(function(tokenLedgerAddress){
        tokenLedger = ColonyTokenLedger.at(tokenLedgerAddress);
        return tokenLedger;
      })
      .then(function(){
        return tokenLedger.balanceOf.call(_OTHER_ACCOUNT_);
      })
      .then(function(otherAccountTokenBalance){
        assert.strictEqual(otherAccountTokenBalance.toNumber(), 95, 'Token balance is not 95% of task token value');
        return tokenLedger.balanceOf.call(rootColony.address);
      })
      .then(function(rootColonyTokenBalance){
        assert.strictEqual(rootColonyTokenBalance.toNumber(), 5, 'RootColony token balance is not 5% of task token value');
      })
      .then(done)
      .catch(done);
    });
  });
});
