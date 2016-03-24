/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, Colony, web3, assert */

contract('Colony', function (accounts) {
  var mainaccount = accounts[0];
  var otheraccount = accounts[1];
  var rootColony, colony;

  beforeEach(function (done) {
    RootColony.new({from:mainaccount, value: 300000000})
    .then(function(rootColonyContract){
      rootColony = rootColonyContract;
      return rootColony;
    })
    .then(function(){
      return rootColony.createColony(100, { from: mainaccount, value: 300000000 })
    })
      .then(function() {
          return rootColony.getColony(0); })
      .then(function(address){
          colony = Colony.at(address);
          done();
    });
  });

describe('when created', function () {
  it('deployed user should be admin', function (done) {
    colony.getUserInfo.call(mainaccount).then(function (admin) {
      assert.equal(admin, true, 'First user isn\'t an admin');
    }).then(done).catch(done);
  });

  it('other user should not be admin', function (done) {
    colony.getUserInfo.call(otheraccount).then(function (admin) {
      assert.equal(admin, false, 'Other user is an admin');
    }).then(done).catch(done);
  });

  it('should be instantiated with 100 total shares when generateShares is called with 100', function(done){
    colony.shareLedger.call(0)
    .then(function(shareLedgerAddress) {
      var shareLedger = ColonyShareLedger.at(shareLedgerAddress);
      shareLedger.generateShares(100, {from: colony.address });
      return shareLedger.totalSupply.call(0);
    })
    .then(function(totalSupplyShares){
      console.log("Total supply of shares: ", totalSupplyShares.toNumber());
      assert.equal(totalSupplyShares.toNumber(), 100);
    })
    .then(done).catch(done)
    });

    it('should set colony as the share ledger owner', function (done) {
      colony.shareLedger.call(0)
        .then(function(shareLedgerAddress){
          return ColonyShareLedger.at(shareLedgerAddress); })
        .then(function(shareLedger){
          return shareLedger.owner.call(); })
        .then(function(shareLedgerOwner){
          assert.equal(shareLedgerOwner, colony.address, 'Colony admin should be set as the owner of its Share Ledger.');  })
        .then(done).catch(done);
      });
});

describe('when working with tasks', function () {
  it('should allow user to make task', function (done) {
    colony.makeTask('name', 'summary')
    .then(function () {
      return colony.getTask.call(0);
    })
    .then(function (value) {
      assert.equal(value[0], 'name', 'No task?');
      assert.equal(value[1], 'summary', 'No task?');
      assert.equal(value[2], false, 'No task?');
      assert.equal(value[3].toNumber(), 0, 'No task?');
    })
    .then(done).catch(done);
  });

  it('should allow user to edit task', function (done) {
    colony.makeTask('name', 'summary').then(function () {
      return colony.updateTask(0, 'nameedit', 'summary');
    }).then(function () {
      return colony.getTask.call(0);
    }).then(function (value) {
      assert.equal(value[0], 'nameedit', 'No task?');
      assert.equal(value[1], 'summary', 'No task?');
      assert.equal(value[2], false, 'No task?');
      assert.equal(value[3].toNumber(), 0, 'No task?');
    }).then(done).catch(done);
  });

  it('should allow user to contribute ETH to task', function (done) {
    colony.makeTask('name', 'summary').then(function () {
      return colony.updateTask(0, 'nameedit', 'summary');
    }).then(function () {
      return colony.contribute(0, {
        value: 10000
      });
    }).then(function () {
      return colony.getTask.call(0);
    }).then(function (value) {
      assert.equal(value[0], 'nameedit', 'No task?');
      assert.equal(value[1], 'summary', 'No task?');
      assert.equal(value[2], false, 'No task?');
      assert.equal(value[3].toNumber(), 10000, 'No task?');
    }).then(done).catch(done);
  });

  it('should allow user to contribute Shares to task', function (done) {
    colony.makeTask('name', 'summary')
      .then(function() {
        return colony.updateTask(0, 'nameedit', 'summary'); })
      .then(function() {
        return colony.contributeShares(0, 100, {from: mainaccount}); })
      .then(function() {
        return colony.getTask.call(0); })
      .then(function (value) {
        assert.equal(value[0], 'nameedit');
        assert.equal(value[1], 'summary');
        assert.equal(value[2], false);
        assert.equal(value[3].toNumber(), 0);
        assert.equal(value[4].toNumber(), 100); })
      .then(done).catch(done);
  });

  it('should not allow non-admin to close task', function (done) {
    var prevBalance = web3.eth.getBalance(otheraccount);
    var completeAndPayTaskFailed = false;
    colony.makeTask('name', 'summary')
    .then(function () {
      return colony.updateTask(0, 'nameedit', 'summary'); })
    .then(function () {
      return colony.contribute(0, {
        value: 10000 }); })
    .then(function () {
      return colony.completeAndPayTask(0, otheraccount, { from: otheraccount });
    }).catch(function () {
      completeAndPayTaskFailed = true;
      return colony.getTask.call(0);
    }).then(function (value) {
      assert.equal(completeAndPayTaskFailed, true,
        'The completeAndPayTask call succeeded when it should not');
      assert.equal(value[0], 'nameedit', 'No task?');
      assert.equal(value[1], 'summary', 'No task?');
      assert.equal(value[2], false, 'No task?');
      assert.equal(value[3].toNumber(), 10000, 'No task?');
      assert.equal(web3.eth.getBalance(otheraccount).lessThan(prevBalance), true);
    }).then(done).catch(done);
  });

  it('should allow admin to close task', function (done) {
    var prevBalance = web3.eth.getBalance(otheraccount);
    colony.makeTask('name', 'summary').then(function () {
      return colony.updateTask(0, 'nameedit', 'summary'); })
    .then(function () {
      return colony.contribute(0, { value: 10000 }); })
    .then(function () {
      return colony.completeAndPayTask(0, otheraccount, { from: mainaccount });
    }).then(function () {
      return colony.getTask.call(0);
    }).then(function (value) {
      assert.equal(value[0], 'nameedit', 'No task?');
      assert.equal(value[1], 'summary', 'No task?');
      assert.equal(value[2], true, 'No task?');
      assert.equal(value[3].toNumber(), 10000, 'No task?');
      assert.equal(value[4].toNumber(), 0, 'No task?');
      assert.equal(web3.eth.getBalance(otheraccount).minus(prevBalance).toNumber(), 9500);
    }).then(done).catch(done);
  });

    it('should transfer 95% of shares to task completor and 5% to rootColony on completing a task', function (done) {
      var shareLedger;

      colony.makeTask('name', 'summary').then(function () {
        return colony.updateTask(0, 'nameedit', 'summary');
      }).then(function () {
        return colony.contributeShares(0, 100);
      }).then(function () {
        return colony.completeAndPayTask(0, otheraccount, { from: mainaccount });
      })
      .then(function(){
        return colony.shareLedger.call();
      })
      .then(function(shareLedgerAddress){
        console.log("ShareLedger address is: ", shareLedgerAddress)
        shareLedger = ColonyShareLedger.at(shareLedgerAddress);
        return shareLedger; })
      .then(function(){
        return shareLedger.balanceOf.call(otheraccount);
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
