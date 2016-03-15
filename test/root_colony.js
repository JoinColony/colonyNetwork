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
      rootColony.owner.call(mainaccount)
        .then(function(owner) { assert.equal(owner, mainaccount, 'First user isn\'t an admin'); })
        .then(done)
        .catch(done);
  });

  it('the root network should allow users to create new colonies', function(done) {
    var colony;
    rootColony.createColony({ from: otheraccount })
      .then(function() {
          return rootColony.getColony(0); })
      .then(function(address){
          colony = Colony.at(address);
          return colony; })
      .then(function(colony){
          return colony.getUserInfo.call(otheraccount); })
      .then(function(isAdmin){ assert.equal(isAdmin, true, 'First user isn\'t an admin'); })
      .then(done)
      .catch(done);
   });

   it('when creating a new colony should set its rootColony property to itself', function(done) {
     var colony;
     rootColony.createColony({ from: otheraccount })
       .then(function() {
           return rootColony.getColony(0); })
       .then(function(address){
           colony = Colony.at(address);
           return colony; })
       .then(function(colony){
           return colony.rootColony.call(otheraccount); })
       .then(function(rootColonyAddress){
          console.log("RootColonyAddress is ", rootColony.address);
          console.log("Colony.rootColony address is ", rootColonyAddress);
          assert.equal(rootColony.address, rootColonyAddress);})
       .then(done)
       .catch(done);
    });

   it('should pay root colony 5% fee of a completed task value', function (done) {
     var colony;
     var startingBalance = web3.eth.getBalance(rootColony.address);
     console.log("Starting rootColony balance: ", startingBalance.toNumber());

     rootColony.createColony({ from: mainaccount })
       .then(function() {
           return rootColony.getColony(0); })
       .then(function(address){
           console.log("Colony address is: ", address);
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
        .then(function (value) {
          console.log("Updated rootColony balance: ", web3.eth.getBalance(rootColony.address).toNumber());
          var balance = web3.eth.getBalance(rootColony.address).minus(startingBalance).toNumber();
          assert.equal(balance, 500);
        })
        .then(done)
        .catch(done);
   });
 });
