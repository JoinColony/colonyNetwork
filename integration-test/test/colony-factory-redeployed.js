/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, RootColony, RootColonyResolver, ColonyFactory, FakeNewColonyFactory, assert */

contract('ColonyFactory', function (accounts) {
  var _COLONY_KEY_ = 'COLONY_TEST';
  var _NEW_COLONY_KEY_ = 'NEW_COLONY_TEST';
  var colonyFactory;
  var colonyFactoryNew;
  var rootColony;
  var rootColonyResolver;
  var eternalStorageRoot;
  var _MAIN_ACCOUNT_ = accounts[0];

  before(function(done){
    rootColony = RootColony.deployed();
    rootColonyResolver = RootColonyResolver.deployed();
    colonyFactory = ColonyFactory.deployed();

    rootColonyResolver.registerRootColony(rootColony.address)
    .then(function(){
      return rootColony.registerColonyFactory(colonyFactory.address);
    })
    .then(function(){
      return colonyFactory.registerRootColonyResolver(rootColonyResolver.address);
    })
    .then(function(){
      return EternalStorage.new();
    })
    .then(function(contract){
      eternalStorageRoot = contract;
      return eternalStorageRoot.changeOwner(colonyFactory.address);
    })
    .then(function(){
      return colonyFactory.registerEternalStorage(eternalStorageRoot.address);
    })
    .then(function(){
      return rootColony.createColony(_COLONY_KEY_);
    })
    .then(function(){
      return rootColony.countColonies.call();
    })
    .then(function(count){
      assert.equal(1, count.toNumber(), 'There should be 1 colony in the network.');
    })
    .then(done)
    .catch(done);
  });

  beforeEach(function(done){
    // Create the new Colony Factory and upgrade all references
    FakeNewColonyFactory.new({gas: 4e6, gasPrice: 20e9})
    .then(function(contract){
      colonyFactoryNew = contract;
      return colonyFactoryNew.registerRootColonyResolver(rootColonyResolver.address);
    })
    .then(function(){
      return rootColony.registerColonyFactory(colonyFactoryNew.address);
    })
    .then(function(){
      return colonyFactoryNew.registerEternalStorage(eternalStorageRoot.address);
    })
    .then(function(){
      return rootColony.moveColonyFactoryStorage(colonyFactoryNew.address, {from: _MAIN_ACCOUNT_});
    })
    .then(function(){
      done();
    })
    .catch(done);
  });

  describe('when redeploying colony factory contract', function () {
    it('should adopt the existing EternalStorage', function (done) {
      rootColony.colonyFactory.call()
      .then(function(colonyFactoryAddress){
        assert.equal(colonyFactoryAddress, colonyFactoryNew.address, 'ColonyFactoryAddress on RootColony is not updated.')
      })
      .then(function(){
        return colonyFactoryNew.eternalStorageRoot.call();
      })
      .then(function(_eternalStorageAddress){
        assert.equal(_eternalStorageAddress, eternalStorageRoot.address, 'ColonyFactory.eternalStorage address is incorrect');
        return eternalStorage.owner.call();
      })
      .then(function(owner){
        assert.equal(owner, colonyFactoryNew.address, 'EternalStorage owner not updated to new ColonyFactory');
        return rootColony.createColony(_NEW_COLONY_KEY_, {from: _MAIN_ACCOUNT_});
      })
      .then(function(){
        return rootColony.countColonies.call();
      })
      .then(function(count){
        assert.equal(count.toNumber(), 2, 'There should be 2 colonies.');
      })
      .then(done)
      .catch(done);
    });
  });
});
