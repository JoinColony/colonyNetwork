/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, RootColony, Colony, FakeUpdatedColony, RootColonyResolver,
  ColonyFactory, ColonyTokenLedger, FakeNewColonyFactory, assert
*/

contract('ColonyFactory', function () {
  var _COLONY_KEY_ = 'COLONY_TEST';
  var colonyFactory;
  var rootColony;
  var rootColonyResolver;

  before(function(done){
    rootColony = RootColony.deployed();
    rootColonyResolver = RootColonyResolver.deployed();

    rootColonyResolver.registerRootColony(rootColony.address)
    .then(function(){
      done();
    })
    .catch(done);
  });

  describe('when redeploying colony contract and colony factory', function () {
    it('should be replaced at RootColony', function (done) {

      var colony;
      colonyFactory = ColonyFactory.deployed();
      console.log('\r\n');
      console.log('\tColonyFactory address: [ ', colonyFactory.address, ' ]');
      console.log('\tRegistering RootColonyResolver...');
      colonyFactory.registerRootColonyResolver(rootColonyResolver.address)
      .then(function(){
        console.log('\tRegistering RootColony\'s ColonyFactory...');
        return rootColony.registerColonyFactory(colonyFactory.address);
      })
      .then(function(){
        return rootColony.colonyFactory.call();
      })
      .then(function(_colonyFactoryAddress){
        console.log('\tRootColony\'s colony factory address: [ ', _colonyFactoryAddress, ' ]');
        console.log('\tCreating Colony...');
        return rootColony.createColony(_COLONY_KEY_);
      })
      .then(function(){
        return rootColony.getColony.call(_COLONY_KEY_);
      })
      .then(function (_address) {
        console.log('\tColony address: [ ', _address, ' ]');
        colony = Colony.at(_address);

        console.log('\t"isUpdated" function NOT available in old ColonyFactory colonies: [ ', !!colony.isUpdated, ' ]');
        assert.isUndefined(colony.isUpdated, 'function exists on the old contract version');

        return colony.setTokensSymbol('CNY');
      })
      .then(function(){
        return colony.tokenLedger.call();
      })
      .then(function(_tokenLedgerAddress){
        var tokenLedger = ColonyTokenLedger.at(_tokenLedgerAddress);
        return tokenLedger.symbol.call();
      })
      .then(function(symbol_){
        console.log('\tColony symbol is: [ ', symbol_, ' ]');
        return colony.rootColonyResolver.call();
      })
      .then(function(_rootColonyResolverAddress){
        var rootColonyResolver = RootColonyResolver.at(_rootColonyResolverAddress);
        return rootColonyResolver.rootColonyAddress.call();
      })
      .then(function(rootColonyAddress_){
        console.log('\tColony RootColony address: [ ', rootColonyAddress_, ' ]');
        console.log('\tCreating FakeNewColonyFactory...');
        return FakeNewColonyFactory.new();
      })
      .then(function(colonyFactory_){
        colonyFactory = colonyFactory_;
        console.log('\tFakeNewColonyFactory address: [ ', colonyFactory.address, ' ]');
        console.log('\tUpdating RootColonyResolver...');
        return colonyFactory.registerRootColonyResolver(rootColonyResolver.address);
      })
      .then(function() {
        console.log('\tRegistering ColonyFactory at new RootColony...');
        return rootColony.registerColonyFactory(colonyFactory.address);
      })
      .then(function(){
        return rootColony.colonyFactory.call();
      })
      .then(function(_newColonyFactoryAddress){
        console.log('\tRootColony current colony factory address: [ ', _newColonyFactoryAddress, ' ]');
        assert.equal(colonyFactory.address, _newColonyFactoryAddress, 'RootColony factory was not updated');

        console.log('\tCreating FakeUpdatedColony...');
        return rootColony.createColony(_COLONY_KEY_);
      })
      .then(function(){
        return rootColony.getColony.call(_COLONY_KEY_);
      })
      .then(function (_address) {
        console.log('\tFakeUpdatedColony address: [ ', _address, ' ]');
        colony = FakeUpdatedColony.at(_address);
        return colony.setTokensSymbol('UPD');
      })
      .then(function(){
        return colony.tokenLedger.call();
      })
      .then(function(_tokenLedgerAddress){
        var colonyTokenLedger = ColonyTokenLedger.at(_tokenLedgerAddress);
        return colonyTokenLedger.symbol.call();
      })
      .then(function(symbol_){
        console.log('\tFakeUpdatedColony symbol is: [ ', symbol_, ' ]');
        console.log('\t"isUpdated" function available in FakeNewColonyFactory colonies: [ ', !!colony.isUpdated, ' ]');
        assert.isDefined(colony.isUpdated, 'function doesnt exists on the new contract version');

        return colony.isUpdated.call();
      })
      .then(function(_result){
        console.log('\t"isUpdated" function returns: [ ', _result, ' ]');
        assert.isTrue(_result, 'colony implementation was not updated');
      })
      .then(function(){
        return colony.rootColonyResolver.call();
      })
      .then(function(_rootColonyResolverAddress){
        var rootColonyResolver = RootColonyResolver.at(_rootColonyResolverAddress);
        return rootColonyResolver.rootColonyAddress.call();
      })
      .then(function(rootColonyAddress_){
        console.log('\tFakeUpdatedColony RootColony address: [ ', rootColonyAddress_, ' ]');
        assert.equal(rootColonyAddress_, rootColony.address, 'root colony address is incorrect');
      })
      .then(done)
      .catch(done);
    });
  });
});
