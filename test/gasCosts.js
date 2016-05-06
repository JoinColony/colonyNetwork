/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, before, describe, it, web3, RootColony, Colony, RootColonyResolver, ColonyFactory */

var testHelper = require('../helpers/test-helper.js');

contract('all', function (accounts) {
  var _GAS_PRICE_ = 20e9;
  var _GAS_TO_SPEND_ = 1e10;
  var _MAIN_ACCOUNT_ = accounts[0];
  var _OTHER_ACCOUNT_ = accounts[1];
  var colony;
  var colonyFactory;
  var rootColony;
  var rootColonyResolver;

  before(function(done)
  {
    colonyFactory = ColonyFactory.deployed();
    rootColony = RootColony.deployed();
    rootColonyResolver = RootColonyResolver.deployed();

    testHelper.waitAll([
      rootColonyResolver.registerRootColony(rootColony.address),
      colonyFactory.registerRootColonyResolver(rootColonyResolver.address),
      rootColony.registerColonyFactory(colonyFactory.address)
    ], done);
  });


  // We currently only print out gas costs and no assertions are made about what these should be.
  describe('Get gas costs ', function(){
    it('when working with a Colony', function (done) {

      // Cost of creating a colony
      var gasCostCreateColony = web3.eth.estimateGas({
          from: _MAIN_ACCOUNT_,
          to: rootColony.address,
          gasPrice : _GAS_PRICE_,
          data: web3.sha3('createColony(bytes32)')
        });
      console.log('RootColony.createColony(bytes32) : ', gasCostCreateColony);

      rootColony.createColony('Antz', {from: _MAIN_ACCOUNT_})
      .then(function(){
        return rootColony.getColony.call('Antz');
      })
      .then(function(colony_){
        colony = Colony.at(colony_);
        return;
      })
      .then(function(){
        // When working with tasks
        return colony.makeTask.estimateGas('My new task', 'QmTDMoVqvyBkNMRhzvukTDznntByUNDwyNdSfV8dZ3VKRC01', { });
      })
      .then(function(cost){
        console.log('makeTask : ', cost);
        return colony.makeTask('My new task', 'QmTDMoVqvyBkNMRhzvukTDznntByUNDwyNdSfV8dZ3VKRC01', { from: _MAIN_ACCOUNT_ });
      })
      .then(function(){
        return colony.updateTask.estimateGas(0, 'My updated task', 'QmTDMoVqvyBkNMRhzvukTDznntByUNDwyNdSfV8dZ3VKRC02', { from: _MAIN_ACCOUNT_ });
      })
      .then(function(cost){
        console.log('updateTask : ', cost);
        return colony.acceptTask.estimateGas(0, { });
      })
      .then(function(cost){
        console.log('acceptTask : ', cost);
        colony.generateColonyTokens(100, {from: _MAIN_ACCOUNT_});
      // When working with tokens
        return colony.generateColonyTokens.estimateGas(100, _OTHER_ACCOUNT_, { });
      })
      .then(function(cost){
        console.log('generateColonyTokens : ', cost);
        return colony.contributeEth.estimateGas(0, { value: 5, gasPrice: _GAS_PRICE_, gas: _GAS_TO_SPEND_ });
      })
      .then(function(cost){
        console.log('contributeEth : ', cost);
        return colony.contributeTokens.estimateGas(0, 100, { gasPrice: _GAS_PRICE_, gas: _GAS_TO_SPEND_ });
      })
      .then(function(cost){
        console.log('contributeTokens : ', cost);
        return colony.contributeTokensFromPool.estimateGas(0, 50, { gasPrice: _GAS_PRICE_, gas: _GAS_TO_SPEND_ });
      })
      .then(function(cost){
        console.log('contributeTokensFromPool : ', cost);
      })
      .then(function(){
        colony.contributeEth(0, { value: 500 });
        colony.contributeTokensFromPool(0, 100, {from: _MAIN_ACCOUNT_});
        return;
      })
      .then(function(){
        return colony.completeAndPayTask.estimateGas(0, _OTHER_ACCOUNT_, { from: _MAIN_ACCOUNT_ });
      })
      .then(function(cost){
        console.log('completeAndPayTask : ', cost);
      })
      .then(done)
      .catch(done);
    });
  });
});
