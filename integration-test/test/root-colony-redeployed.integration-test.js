/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, FakeNewRootColony, RootColony, Colony, RootColonyResolver,
    ColonyFactory, assert
*/
var testHelper = require('../../test/test-helper.js');

contract('RootColony', function () {
  var _COLONY_KEY_ = 'COLONY_TEST';
  var _NEW_COLONY_KEY_ = 'NEW_COLONY_TEST';
  var colonyFactory;
  var rootColony;
  var colony;
  var rootColonyResolver;
  var removeColony = testHelper.removeColony;

  before(function(done){
    rootColony = RootColony.deployed();
    rootColonyResolver = RootColonyResolver.deployed();
    colonyFactory = ColonyFactory.deployed();

    console.log('\r\n');
    console.log('\tRootColony address: [ ', rootColony.address, ' ]');
    console.log('\tColonyFactory address: [ ', colonyFactory.address, ' ]');

    rootColonyResolver.registerRootColony(rootColony.address)
    .then(function(){
      done();
    })
    .catch(done);
  });

  beforeEach(function(done){
    colonyFactory.registerRootColonyResolver(rootColonyResolver.address)
    .then(function(){
      console.log('\tRegistering ColonyFactory at RootColony...');
      return rootColony.registerColonyFactory(colonyFactory.address);
    })
    .then(function(){
      console.log('\tCreating Colony...');
      return rootColony.createColony(_COLONY_KEY_);
    })
    .then(function(){
      return rootColony.getColony.call(_COLONY_KEY_);
    })
    .then(function (address_) {
      console.log('\tColony address: [ ', address_, ' ]');
      colony = Colony.at(address_);
      return colony.getRootColony.call();
    })
    .then(function(rootColonyAddress_){
      console.log('\tColony RootColony address: [ ', rootColonyAddress_, ' ]');
      console.log('\tCreating FakeNewRootColony...');
      return FakeNewRootColony.new();
    })
    .then(function(rootColony_){
      rootColony = rootColony_;
      console.log('\tFakeNewRootColony address: [ ', rootColony.address, ' ]');
      console.log('\tUpdating ColonyFactory RootColonyResolver...');
      return rootColonyResolver.registerRootColony(rootColony.address);
    })
    .then(function() {
      console.log('\tRegistering ColonyFactory at FakeNewRootColony...');
      return rootColony.registerColonyFactory(colonyFactory.address);
    })
    .then(function(){
      done();
    })
    .catch(done);
  });

  afterEach(function(){
    removeColony(rootColony, _COLONY_KEY_);
    removeColony(rootColony, _NEW_COLONY_KEY_);
  });

  describe('when redeploying root colony contract', function () {
    it('should update RootColony address at ColonyFactory\'s RootColonyResolver', function (done) {
      rootColony.colonyFactory.call()
      .then(function(_newColonyFactoryAddress){
        console.log('\tFakeNewRootColony current colony factory address: [ ', _newColonyFactoryAddress, ' ]');
        assert.equal(colonyFactory.address, _newColonyFactoryAddress, 'FakeNewRootColony factory was not updated');

        console.log('\tCreating Colony...');
        return rootColony.createColony(_NEW_COLONY_KEY_);
      })
      .then(function(){
        return rootColony.getColony.call(_NEW_COLONY_KEY_);
      })
      .then(function (_address) {
        console.log('\tColony address: [ ', _address, ' ]');
        colony = Colony.at(_address);
        return colony.getRootColony.call();
      })
      .then(function(rootColonyAddress_){
        console.log('\tColony RootColony address: [ ', rootColonyAddress_,' ]');
        assert.equal(rootColonyAddress_, rootColony.address, 'root colony address is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should be able to replace existing Colony\'s RootColony address at RootColonyResolver', function (done) {

      console.log('\r\n');
      console.log('\tRootColony address: [ ', rootColony.address, ' ]');
      console.log('\tColonyFactory address: [ ', colonyFactory.address, ' ]');
      console.log('\tRegistering RootColonyResolver...');

      colonyFactory.registerRootColonyResolver(rootColonyResolver.address)
      .then(function(){
        console.log('\tRegistering ColonyFactory at RootColony...');
        return rootColony.registerColonyFactory(colonyFactory.address);
      })
      .then(function(){
        console.log('\tCreating Colony...');
        return rootColony.createColony(_OTHER_COLONY_KEY_);
      })
      .then(function(){
        return rootColony.getColony.call(_OTHER_COLONY_KEY_);
      })
      .then(function (address_) {
        console.log('\tColony address: [ ', address_, ' ]');
        colony = Colony.at(address_);
        return colony.getRootColony.call();
      })
      .then(function(rootColonyAddress_){
        console.log('\tColony RootColony address: [ ', rootColonyAddress_, ' ]');
        console.log('\tCreating FakeNewRootColony...');
        return FakeNewRootColony.new();
      })
      .then(function(rootColony_){
        rootColony = rootColony_;
        return colony.rootColonyResolver.call();
      })
      .then(function(rootColonyResolver_){
        rootColonyResolver = RootColonyResolver.at(rootColonyResolver_);
        return rootColonyResolver.registerRootColony(rootColony.address);
      })
      .then(function() {
        console.log('\tRegistering ColonyFactory at FakeNewRootColony...');
        return rootColony.registerColonyFactory(colonyFactory.address);
      })
      .then(function(){
        return rootColony.colonyFactory.call();
      })
      .then(function(_newColonyFactoryAddress){
        console.log('\tFakeNewRootColony current colony factory address: [ ', _newColonyFactoryAddress, ' ]');
        assert.equal(colonyFactory.address, _newColonyFactoryAddress, 'FakeNewRootColony factory was not updated');
        return colony.getRootColony.call();
      })
      .then(function(rootColonyAddress_){
        console.log('\tColony updated RootColony address: [ ', rootColonyAddress_, ' ]');
        assert.equal(rootColonyAddress_, rootColony.address, 'root colony address is incorrect');
      })
      .then(done)
      .catch(done);
    });
  });
});
