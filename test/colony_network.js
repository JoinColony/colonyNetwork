contract('ColonyNetwork', function(accounts) {

  it('deployed user should be admin', function(done) {
      var colonyNetwork = ColonyNetwork.deployed();
      colonyNetwork.owner.call(accounts[0])
      .then(function(owner) { assert.equal(owner, accounts[0], 'First user isn\'t an admin'); })
      .then(done)
      .catch(done);
  });

  it('the master network should allow users to create new colonies', function(done) {
       //var colonyNetwork = ColonyNetwork.deployed();
       ColonyNetwork.new({ from: accounts[0] })
       .then(function(colonyNetwork) { return colonyNetwork.createColony();})
       .then(function(newColonyAddress){ return Colony.at(newColonyAddress);})
       //.then(function(newColony) { newColony.getUserInfo.call(accounts[0]); })
       .then(function(colony){console.log(colony);})
       //.then(function(admin) { assert.equal(admin, true, 'First user isn\'t an admin'); })
       .then(done)
       .catch(done);
   });
});
