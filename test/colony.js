/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, Colony, web3, assert */

contract('Colony', function (accounts) {
  var mainaccount = accounts[0];
  var otheraccount = accounts[1];
  var rootColony, colony;

  beforeEach(function (done) {
    Colony.new({from:mainaccount})
      .then(function (contract) {
        colony = contract;
        done();
      });
  });

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

  it('should allow user to make task', function (done) {
    colony.makeTask('name', 'summary').then(function () {
      return colony.getTask.call(0);
    }).then(function (value) {
      assert.equal(value[0], 'name', 'No task?');
      assert.equal(value[1], 'summary', 'No task?');
      assert.equal(value[2], false, 'No task?');
      assert.equal(value[3].toNumber(), 0, 'No task?');
    }).then(done).catch(done);
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
    colony.makeTask('name', 'summary').then(function () {
      return colony.updateTask(0, 'nameedit', 'summary');
    }).then(function () {
      return colony.contributeShares(0, 10);
    }).then(function () {
      return colony.getTask.call(0);
    }).then(function (value) {
      assert.equal(value[0], 'nameedit', 'No task?');
      assert.equal(value[1], 'summary', 'No task?');
      assert.equal(value[2], false, 'No task?');
      assert.equal(value[3].toNumber(), 0, 'No task?');
      assert.equal(value[4].toNumber(), 10, 'No task?');
    }).then(done).catch(done);
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
      return colony.completeAndPayTask(0, otheraccount, {
        from: otheraccount
      });
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
      return colony.updateTask(0, 'nameedit', 'summary');
    }).then(function () {
      return colony.contribute(0, {
        value: 10000
      });
    }).then(function () {
      return colony.completeAndPayTask(0, otheraccount, {
        from: mainaccount
      });
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

  it('should be instantiated with 0 total shares', function(done){
    colony.shareLedger.call(0)
    .then(function(shareLedgerAddress) {
      var shareLedger = ColonyShareLedger.at(shareLedgerAddress);
      return shareLedger.totalSupply.call();
    })
    .then(function(totalSupplyShares){
      assert.equal(totalSupplyShares, 0);
    })
    .then(done).catch(done)
    });
});
