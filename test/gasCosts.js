/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, before, describe, it, RootColony, Colony, RootColonyResolver, ColonyFactory, TaskDB, ColonyTokenLedger, assert */
var testHelper = require('../helpers/test-helper.js');

contract('all', function (accounts) {
  var _COLONY_KEY_ = 'COLONY_TEST';
  var _GAS_PRICE_ = 20e9;
  var _MAIN_ACCOUNT_ = accounts[0];
  var _OTHER_ACCOUNT_ = accounts[1];
  var colony;
  var colonyFactory;
  var rootColony;
  var rootColonyResolver;
  var taskDB;
  var colonyTokenLedger;

  before(function(done)
  {
    colonyFactory = ColonyFactory.deployed();
    rootColony = RootColony.deployed();
    rootColonyResolver = RootColonyResolver.deployed();
    taskDB = TaskDB.deployed();
    colonyTokenLedger = ColonyTokenLedger.deployed();

    console.log('RootColony : ', rootColony.address);
    console.log('ColonyFactory : ', colonyFactory.address);

    testHelper.waitAll([
      rootColonyResolver.registerRootColony(rootColony.address),
      colonyFactory.registerRootColonyResolver(rootColonyResolver.address),
      rootColony.registerColonyFactory(colonyFactory.address)
    ], done);
  });

  // We currently only print out gas costs and no assertions are made about what these should be.
  describe('Get gas costs ', function(){
    it('when creating a Colony', function () {

      var gasCostCreateColony = web3.eth.estimateGas({
          from: _MAIN_ACCOUNT_,
          to: rootColony.address,
          data: web3.sha3('createColony(bytes32)')
        });
      console.log('RootColony.createColony(bytes32) cost: ', gasCostCreateColony);

      var e = web3.eth.estimateGas({
        from: _MAIN_ACCOUNT_,
        to: colonyFactory.address,
        data: web3.sha3('createColony(bytes32, address, address)')//,
      });
      console.log('Experimental var is: ', e);

      var gasCostCreateColonyContract = web3.eth.estimateGas({
          data: Colony.bytecode,
          gasPrice: _GAS_PRICE_,
          gas: 400000000
        });
      console.log('CreateColony cost: ', gasCostCreateColonyContract);

      var gasCostCreateTaskDbContract = web3.eth.estimateGas({
          from: _MAIN_ACCOUNT_,
          data: taskDB.bytecode
        });
      console.log('TaskDB cost: ', gasCostCreateTaskDbContract);

      var gasCostCreateLedgerContract = web3.eth.estimateGas({
          from: _MAIN_ACCOUNT_,
          data: ColonyTokenLedger.bytecode
        });
      console.log('ColonyTokenLedger cost: ', gasCostCreateLedgerContract);
    });
  });
});
