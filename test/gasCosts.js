/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, before, describe, it, web3, assert, RootColony, Colony, RootColonyResolver, ColonyFactory, EternalStorage, ColonyTokenLedger */

var testHelper = require('../helpers/test-helper.js');

contract('all', function (accounts) {
  var _GAS_PRICE_ = 20e9;
  //var _GAS_TO_SPEND_ = 1e6;
  var _MAIN_ACCOUNT_ = accounts[0];
  var _OTHER_ACCOUNT_ = accounts[1];
  var colony;
  var tokenLedger;
  var colonyFactory;
  var rootColony;
  var rootColonyResolver;
  var eternalStorage;

  var makeTaskCost;
  var updateTaskCost;
  var acceptTaskCost;
  var generateColonyTokensCost;
  var contributeEthToTaskCost;
  var contributeTokensToTaskCost;
  var completeAndPayTaskCost;

  before(function(done)
  {
    rootColony = RootColony.deployed();
    colonyFactory = ColonyFactory.deployed();
    rootColonyResolver = RootColonyResolver.deployed();

    testHelper.waitAll([
      rootColony.registerColonyFactory(colonyFactory.address),
      colonyFactory.registerRootColonyResolver(rootColonyResolver.address),
      rootColonyResolver.registerRootColony(rootColony.address)
    ], done);
  });

  beforeEach(function(done){
    var prevBalance;
    EternalStorage.new()
    .then(function(contract){
      eternalStorage = contract;
      return eternalStorage.changeOwner(colonyFactory.address);
    })
    .then(function(){
      return colonyFactory.registerEternalStorage(eternalStorage.address);
    })
    .then(function(){
      prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
      return rootColony.createColony('Antz', {from: _MAIN_ACCOUNT_});
    })
    .then(function(){
      var currentBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
      // Cost of creating a colony
      console.log('RootColony.createColony(bytes32) : ', prevBalance.minus(currentBalance).toNumber());
    })
    .then(function(){
      return rootColony.getColony.call('Antz');
    })
    .then(function(colony_){
      colony = Colony.at(colony_);
      return colony.tokenLedger.call();
    })
    .then(function(ledgerAddress){
      console.log('tokenLedger address : ', ledgerAddress);
      tokenLedger = ColonyTokenLedger.at(ledgerAddress);
      return;
    })
    .then(done)
    .catch(done);
  });

  // We currently only print out gas costs and no assertions are made about what these should be.
  describe('Gas costs ', function(){
    it('when working with a Colony', function (done) {
      // When working with tasks
      colony.makeTask.estimateGas('My new task', 'QmTDMoVqvyBkNMRhzvukTDznntByUNDwyNdSfV8dZ3VKRC01', { })
      .then(function(cost){
        makeTaskCost = cost;
        console.log('makeTask : ', cost);
        return colony.makeTask('My new task', 'QmTDMoVqvyBkNMRhzvukTDznntByUNDwyNdSfV8dZ3VKRC01', { from: _MAIN_ACCOUNT_ });
      })
      .then(function(){
        return colony.updateTask.estimateGas(0, 'My updated task', 'QmTDMoVqvyBkNMRhzvukTDznntByUNDwyNdSfV8dZ3VKRC02', { from: _MAIN_ACCOUNT_ });
      })
      .then(function(cost){
        updateTaskCost = cost;
        console.log('updateTask : ', cost);
        return colony.acceptTask.estimateGas(0, { });
      })
      .then(function(cost){
        acceptTaskCost = cost;
        console.log('acceptTask : ', cost);
        return colony.generateColonyTokensWei(200, { from: _MAIN_ACCOUNT_ });
      })
      .then(function(){
      // When working with tokens
        return colony.generateColonyTokensWei.estimateGas(200, { from: _MAIN_ACCOUNT_ });
      })
      .then(function(cost){
        generateColonyTokensCost = cost;
        console.log('generateColonyTokensWei : ', cost);
        return colony.contributeEthToTask.estimateGas(0, { value: 50 });
      })
      .then(function(cost){
        contributeEthToTaskCost = cost;
        console.log('contributeEthToTask : ', cost);
        return colony.contributeEthToTask(0, { value: 50 });
      })
      .then(function(){
        return colony.contributeTokensWeiFromPool.estimateGas(0, 50, { from:_MAIN_ACCOUNT_ });
      })
      .then(function(cost){
        contributeTokensToTaskCost = cost;
        console.log('contributeTokensWeiFromPool : ', cost);
        return colony.contributeTokensWeiFromPool(0, 50, { from:_MAIN_ACCOUNT_ });
      })
      .then(function(){
        return colony.completeAndPayTask.estimateGas(0, _OTHER_ACCOUNT_, { from: _MAIN_ACCOUNT_ });
      })
      .then(function(cost){
        completeAndPayTaskCost = cost;
        console.log('completeAndPayTask : ', cost);
        return colony.completeAndPayTask(0, _OTHER_ACCOUNT_, {from: _MAIN_ACCOUNT_});
      })
      .then(function(){
        return tokenLedger.transfer.estimateGas(_MAIN_ACCOUNT_, 1, { from: _OTHER_ACCOUNT_ });
      })
      .then(function(cost){
        console.log('ColonyTokenLedger.transfer 1 token : ', cost);
        done();
      })
      .catch(done);
    });

    it('Average gas costs for customers should not exceed 0.77 ETH per month', function(done){
      var totalGasCost = makeTaskCost * 50 // assume 100 tasks per month are created
      + updateTaskCost * 200 // assume each task is updated 5 times
      + acceptTaskCost * 50 // all 100 opened tasks are accepted
      + contributeEthToTaskCost * 50 // only colony admins are allowed to contribute eth adn tokens
      + contributeTokensToTaskCost * 50
      + completeAndPayTaskCost * 50 // all tasks are closed and paid out
      + generateColonyTokensCost * 1; // only once per month are new colony tokens generated

      var totalEtherCost = web3.fromWei(totalGasCost * _GAS_PRICE_, 'ether');
      console.log('Average monthly cost per customer is : ');
      console.log(' Gas : ', totalGasCost);
      console.log(' Ether : ', totalEtherCost);

      //Only do this assert if we're using testrpc. There's discrepancy between TestRPC estimategas
      //and geth estimateGas; the former is too high.
      if(web3.version.node.indexOf('TestRPC')===-1){
        assert.isBelow(totalEtherCost, 0.77, 'Monthly average costs exceed target');
      }else{
        console.log('IGNORING THE RESULT DUE TO TESTRPC INACCURICIES IN ESTIMATEGAS');
      }
      done();
    });
  });
});
