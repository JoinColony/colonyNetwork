contract('ColonyNetwork', function(accounts) {

  it('deployed user should be admin', function(done) {
      var colonyNetwork = ColonyNetwork.deployed();
      colonyNetwork.owner.call(accounts[0])
        .then(function(owner) { assert.equal(owner, accounts[0], 'First user isn\'t an admin'); })
        .then(done)
        .catch(done);
  });

  it('the master network should allow users to create new colonies', function(done) {
    var colonyNetwork, newColony;
    ColonyNetwork.new({ from: accounts[0] })
      .then(function(instance) { colonyNetwork = instance;
          return colonyNetwork.createColony(accounts[0]); })
      .then(function(tx) { console.log("New Colony transaction hash is: ", tx);
          return colonyNetwork.getColony(0); })
      .then(function(address){
          console.log("Colony address is: ", address);
          newColony = Colony.at(address);
          return newColony; })
      .then(function(newColony){
          return newColony.getUserInfo.call(accounts[0]); })
      .then(function(isAdmin){ assert.equal(isAdmin, true, 'First user isn\'t an admin'); })
      .then(done)
      .catch(done);
   });
});
