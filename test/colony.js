/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, Colony, ColonyFactory, TaskDB, ColonyShareLedger, RootColony, RootColonyResolver, web3, assert
*/

var testHelper = require('./test-helper.js');
contract('Colony', function (accounts) {
  var _MAIN_ACCOUNT_ = accounts[0];
  var _OTHER_ACCOUNT_ = accounts[1];
  var _COLONY_KEY_ = 'COLONY_TEST';
  var _TOTAL_SUPPLY_ = 100;
  var colonyFactory;
  var rootColony;
  var rootColonyResolver;
  var ifUsingTestRPC = testHelper.ifUsingTestRPC;
  var removeColony = testHelper.removeColony;
  var colony;
  var colonyTaskDb;

  before(function(done){
    rootColony = RootColony.deployed();
    console.log("RootColony deployed: ", rootColony.address);
    rootColonyResolver = RootColonyResolver.deployed();
    colonyFactory = ColonyFactory.deployed();

    rootColonyResolver.registerRootColony(rootColony.address)
    .then(function(){
      return colonyFactory.registerRootColonyResolver(rootColonyResolver.address);
    })
    .then(function(){
      return colonyFactory.registerRootColonyResolver(rootColonyResolver.address);
    })
    .then(function(){
      done();
    })
    .catch(done);
  });

  beforeEach(function(done){
    rootColony.createColony(_COLONY_KEY_, {from: _MAIN_ACCOUNT_})
    .then(function(){
      return rootColony.getColony(_COLONY_KEY_);
    })
    .then(function(colony_){
      console.log("Colony address: ", colony_);
      colony = Colony.at(colony_);
      return colony.taskDB.call();
    })
    .then(function(colonyTaskDbAddress_){
      console.log("TaskDb address:", colonyTaskDbAddress_);
      colonyTaskDb = TaskDB.at(colonyTaskDbAddress_);
      done();
    });
  });

  afterEach(function(done){
    rootColony.removeColony(_COLONY_KEY_);
    done();
  });

  afterEach(function(){
    removeColony(rootColony, _COLONY_KEY_);
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

    it('should generate shares and assign it to the colony', function(done){
      var shareLedger;
      colony.shareLedger.call()
      .then(function(shareLedgerAddress) {
        shareLedger = ColonyShareLedger.at(shareLedgerAddress);
        return colony.generateColonyShares(100);
      })
      .then(function(){
        return shareLedger.balanceOf.call(colony.address);
      })
      .then(function(totalSupplyShares){
        console.log('\ttotal supply of shares: ', totalSupplyShares.toNumber());
        assert.equal(totalSupplyShares.toNumber(), 100);
      })
      .then(done)
      .catch(done);
    });

    it('should set colony as the share ledger owner', function (done) {
      var shareLedger;
      colony.shareLedger.call()
      .then(function(shareLedgerAddress){
        shareLedger = ColonyShareLedger.at(shareLedgerAddress);
        return shareLedger.owner.call();
      })
      .then(function(_shareLedgerOwner){
        assert.equal(_shareLedgerOwner, colony.address, 'Colony admin should be set as the owner of its Share Ledger.');
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

    it('should allow user to contribute shares to task', function (done) {

      colony.generateColonyShares(100)
      .then(function(){
        return colony.makeTask('name', 'summary');
      })
      .then(function() {
        return colony.updateTask(0, 'nameedit', 'summary');
      })
      .then(function () {
        return colony.contributeShares(0, 100);
      })
      .then(function () {
        return colonyTaskDb.getTask.call(0);
      })
      .then(function (value) {
        assert.equal(value[0], 'nameedit');
        assert.equal(value[1], 'summary');
        assert.equal(value[2], false);
        assert.equal(value[3].toNumber(), 0);
        assert.equal(value[4].toNumber(), 100);
      })
      .then(done)
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
      .catch(ifUsingTestRPC)
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

    it('should transfer 95% of shares to task completor and 5% to rootColony on completing a task', function (done) {
      var shareLedger;
      colony.generateColonyShares(100)
      .then(function(){
        return colony.makeTask('name', 'summary');
      })
      .then(function() {
        return colony.updateTask(0, 'nameedit', 'summary');
      })
      .then(function () {
        return colony.contributeShares(0, 100);
      })
      .then(function () {
        return colony.completeAndPayTask(0, _OTHER_ACCOUNT_, { from: _MAIN_ACCOUNT_ });
      })
      .then(function(){
        return colony.shareLedger.call();
      })
      .then(function(shareLedgerAddress){
        console.log('ShareLedger address is: [ ', shareLedgerAddress, ']');
        shareLedger = ColonyShareLedger.at(shareLedgerAddress);
        return shareLedger;
      })
      .then(function(){
        return shareLedger.balanceOf.call(_OTHER_ACCOUNT_);
      })
      .then(function(otherAccountShareBalance){
        assert.strictEqual(otherAccountShareBalance.toNumber(), 95, 'Share balance is not 95% of task share value');
        return shareLedger.balanceOf.call(rootColony.address);
      })
      .then(function(rootColonyShareBalance){
        assert.strictEqual(rootColonyShareBalance.toNumber(), 5, 'RootColony share balance is not 5% of task share value');
      })
      .then(done)
      .catch(done);
    });
  });
});
