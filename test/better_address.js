contract('BetterAddress', function(accounts) {

  it("should be able to make a call to a void function", function(done) {
    var fake_colonyShareLedger = ColonyShareLedger.at(BetterAddress.deployed().address);
      fake_colonyShareLedger.transfer.call(RootColony.deployed().address, 100)
      .then(function(result) {
      //  assert.equal(result, true);
      })
      .then(done)
      .catch(done);
  });
  //TODO: it("should be able to get back a return value", function(done) {

  it("should be able to pass the ipfs hash parameter in", function(done) {
    var fake_TaskDb = TaskDB.at(BetterAddress.deployed().address);
      fake_TaskDb.makeTask(RootColony.deployed().address, 'my new task', 'QmTkzDwWqPbnAh5YiV5')
      .then(function(result) {
        return fake_TaskDb.getTask(0);
      })
      .then(function(result){
        //TODO: https://github.com/ethereum/web3.js/issues/337
        //assert.equal(result[1], web3.toAscii('my new task'));
      })
      .then(done)
      .catch(done);
  });
});
