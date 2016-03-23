/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, Colony, web3, assert */

contract('Colony', function (accounts) {
  var mainaccount = accounts[0];
  var otheraccount = accounts[1];
  var rootColony, colony;

  beforeEach(function (done) {
    // Test colony has an endowment of 3 ETH and 100 Shares
    Colony.new(100, 'CNY', 'COLONY', {
      from: mainaccount,
      value: 3000000000000000000
      })
      .then(function (contract) {
        colony = contract;
        done();
      })});
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

  it('should be instantiated with 100 total shares', function(done){
    colony.shareLedger.call()
    .then(function(shareLedgerAddress) {
      var shareLedger = ColonyShareLedger.at(shareLedgerAddress);
      return shareLedger.totalSupply.call(0); })
    .then(function(totalSupplyShares){
      assert.equal(totalSupplyShares, 100); })
    .then(done).catch(done)
    });

    it('should set colony owner as its share ledger owner', function (done) {
      colony.shareLedger.call(0)
        .then(function(shareLedgerAddress){
          return ColonyShareLedger.at(shareLedgerAddress); })
        .then(function(shareLedger){
          return shareLedger.owner.call(); })
        .then(function(shareLedgerOwner){
          assert.equal(shareLedgerOwner, colony, 'Colony admin should be set as the owner of its Share Ledger.');  })
        .then(done).catch(done);
      });
});

describe('when working with tasks', function () {
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
    var shareLedger;
    colony.shareLedger.call(0)
      .then(function(shareLedgerAddress){
        shareLedger = ColonyShareLedger.at(shareLedgerAddress);
        return shareLedger; })
      .then(function(){
      //  console.log("Generate 100 shares..");
      //  return shareLedger.generateShares.call(100, {from: mainaccount}); })
      //.then(function(){
      //  console.log("balanceOf called", );
        return shareLedger.totalSupply.call(); })
      .then(function(balance){
        assert.equal(1000, balance.toNumber(), 'share ledger did not get the 1000 generated shares.');
      })
      //.then(function(){
      ///  console.log("..and transfer them to otheraccount");
//shareLedger.approve.call(otheraccount, 100, {from: mainaccount});
    //    return shareLedger.transferFrom.call(mainaccount, otheraccount, 100, {from: otheraccount});
    //  })
    //  .then(function(){
    //    return shareLedger.allowance.call(mainaccount, otheraccount);
    //  })
    //  .then(function(allowance){
    //    return console.log("allowance is : ", allowance);
    //  })
      .then(function(){
        return colony.makeTask('name', 'summary'); })
      .then(function() {
        return colony.updateTask(0, 'nameedit', 'summary'); })
      .then(function() {
        console.log("calling contribute shares");
        shareLedger.transfer.call(otheraccount, 100, {from: mainaccount});
        return colony.contributeShares(0, 100, {from: otheraccount});})
      .then(function() {
          console.log("calling getTask");
        return colony.getTask.call(0); })
      .then(function (value) {
        assert.equal(value[0], 'nameedit');
        assert.equal(value[1], 'summary');
        assert.equal(value[2], false);
        assert.equal(value[3].toNumber(), 0);
        assert.equal(value[4].toNumber(), 100); })
      .then(function() {
        return shareLedger.balanceOf.call(mainaccount); })
      .then(function(colonyOwnerBalance){
          console.log("Share balance for Colony: ", colonyOwnerBalance.toNumber());
          assert.strictEqual(colonyOwnerBalance.toNumber(), 1100, 'The colony share balance does not match the contributed shares to task');
return shareLedger.balanceOf.call(otheraccount);
        })
        .then(function(taskcontributorShares){
          console.log("Share balance for Colony: ", colonyOwnerBalance.toNumber());
          assert.strictEqual(taskcontributorShares.toNumber(), 0, 'The colony share balance does not match the contributed shares to task');

        })
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

    it('should transfer 95% of shares to task completor on completing a task', function (done) {
      colony.makeTask('name', 'summary').then(function () {
        return colony.updateTask(0, 'nameedit', 'summary');
      }).then(function () {
        return colony.contributeShares(0, 100);
      }).then(function () {
        return colony.completeAndPayTask(0, otheraccount, {
          from: mainaccount
        });
      }).then(function () {
        return colony.getTask.call(0);
      }).then(function (value) {
        assert.equal(value[0], 'nameedit');
        assert.equal(value[1], 'summary');
        assert.equal(value[2], true);
        assert.equal(value[3].toNumber(), 0);
        assert.equal(value[4].toNumber(), 100);
        return colony.shareLedger.call();
      })
      .then(function(shareLedgerAddress){
        console.log("ShareLedgerAddress is: ", shareLedgerAddress);
        return ColonyShareLedger.at(shareLedgerAddress); })
      .then(function(shareLedger){
        return shareLedger.balanceOf.call(otheraccount); })
      .then(function(balance){
        console.log("Otheraccount balance is: ", balance);
        assert.strictEqual(balance.c[0], 95, 'Share balance is not 95% of task share value'); })
      .then(done)
      .catch(done);
    });
});
});
