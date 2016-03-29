/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, RootColony, Colony, web3, assert */

contract('RootColony', function(accounts) {
  var mainaccount = accounts[0];
  var otheraccount = accounts[1];
  var rootColony;

  beforeEach(function (done) {
    RootColony.new({
      from: mainaccount,
      value: 3000000000000000000 // START CONTRACT WITH AN ENDOWMENT OF 3 ETH
      })
      .then(function (contract) {
        rootColony = contract;
        done();
      });
  });

  it('deployed user should be admin', function(done) {
      rootColony.owner.call({ from: mainaccount })
        .then(function(owner) { assert.equal(owner, mainaccount, 'First user isn\'t an admin'); })
        .then(done)
        .catch(done);
  });

  it('the root network should allow users to create new colonies', function(done) {
    rootColony.createColony(0, { from: mainaccount })
      .then(function(){
          return rootColony.getNColonies(); })
      .then(function(nColonies) {
          assert.equal(nColonies, 1, 'nColonies is wrong');
          return rootColony.getColony.call(0); })
      .then(function(address){
          return Colony.at(address); })
      .then(function(colony){
          return colony.getUserInfo.call(mainaccount); })
      .then(function(admin){
        assert.equal(admin, true, 'First user isn\'t an admin'); })
      .then(done)
      .catch(done);
   });

   it('when creating a new colony should set its rootColony property to itself', function(done) {
     rootColony.createColony(100, { from: otheraccount })
       .then(function() {
           return rootColony.getColony(0); })
       .then(function(address){
           return Colony.at(address); })
       .then(function(colony){
           return colony.rootColony.call(otheraccount); })
       .then(function(rootColonyAddress){
          assert.equal(rootColony.address, rootColonyAddress);})
       .then(done)
       .catch(done);
    });

   it('should pay root colony 5% fee of a completed task value', function (done) {
     var colony;
     var startingBalance = web3.eth.getBalance(rootColony.address);
     console.log('Starting rootColony balance: ', startingBalance.toNumber());

     rootColony.createColony(100, { from: mainaccount })
       .then(function() {
           return rootColony.getColony(0); })
       .then(function(address){
           console.log('Colony address is: ', address);
           colony = Colony.at(address);
           return colony; })
        .then(function (colony) {
            return colony.makeTask('name', 'summary'); })
        .then(function() {
            return colony.updateTask(0, 'nameedit', 'summary'); })
        .then(function () {
           return colony.contribute(0, {value: 1000}); })
        .then(function () {
           return colony.completeAndPayTask(0, otheraccount, { from: mainaccount }); })
        .then(function () {
          console.log('Updated rootColony balance: ', web3.eth.getBalance(rootColony.address).toNumber());
          var balance = web3.eth.getBalance(rootColony.address).minus(startingBalance).toNumber();
          console.log('Balance is: ', balance);
          assert.equal(balance, 50);
        })
        .then(done)
        .catch(done);
   });
 });
