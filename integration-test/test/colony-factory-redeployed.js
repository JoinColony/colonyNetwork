/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, RootColony, RootColonyResolver, ColonyFactory, FakeNewColonyFactory, FakeUpdatedColony, EternalStorage, Ownable, assert */
var testHelper = require('../../helpers/test-helper.js');

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
    testHelper.setDefaultGas();
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
    .then(function(eternalStorageRoot_){
      eternalStorageRoot = eternalStorageRoot_;
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
      return FakeNewColonyFactory.new({gas: 4e6, gasPrice: 20e9});
    })
    .then(function(contract){
      colonyFactoryNew = contract;
    })
    .then(done)
    .catch(done);
  });

  beforeEach(function(done){
    testHelper.waitAll([
      colonyFactoryNew.registerRootColonyResolver(rootColonyResolver.address),
      colonyFactoryNew.registerEternalStorage(eternalStorageRoot.address),
      rootColony.moveColonyFactoryStorage(colonyFactoryNew.address)
    ], function(){
      rootColony.registerColonyFactory(colonyFactoryNew.address)
      .then(function(){
        done();
      }).catch(done);
    });
  });

  describe('when redeploying colony factory and colony contracts', function () {
    it('should adopt the existing EternalStorage and use upgraded Colony contract', function (done) {
      rootColony.colonyFactory.call()
      .then(function(colonyFactoryAddress){
        assert.equal(colonyFactoryAddress, colonyFactoryNew.address, 'ColonyFactoryAddress on RootColony is not updated.');
      })
      .then(function(){
        return colonyFactoryNew.eternalStorageRoot.call();
      })
      .then(function(_eternalStorageAddress){
        assert.equal(_eternalStorageAddress, eternalStorageRoot.address, 'ColonyFactory.eternalStorage address is incorrect');
        return rootColony.createColony(_NEW_COLONY_KEY_, {from: _MAIN_ACCOUNT_});
      })
      .then(function(){
        return colonyFactoryNew.eternalStorageRoot.call();
      })
      .then(function(_eternalStorageAddress){
        var eternalStorage = Ownable.at(_eternalStorageAddress);
        return eternalStorage.owner.call();
      })
      .then(function(owner){
        console.log('Old ColonyFactory address : ', colonyFactory.address);
        assert.equal(owner, colonyFactoryNew.address, 'Was not able to change the owner of the EternalStorage in ColonyFactory');
        return rootColony.getColony.call(_NEW_COLONY_KEY_);
      })
      .then(function(colonyAddress){
        var colony = FakeUpdatedColony.at(colonyAddress);
        return colony.isUpdated.call();
      })
      .then(function(isUpdated){
        assert.equal(true, isUpdated, 'Colony was not updated together with ColonyFactory update');
      })
      .then(done)
      .catch(done);
    });
  });
});
