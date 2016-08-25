/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, RootColony, Colony, EternalStorage, assert, web3*/
var testHelper = require('../helpers/test-helper.js');
import { solSha3 } from 'colony-utils';

contract('VotingLibrary', function (accounts) {
  var _COLONY_KEY_;
  var _GAS_PRICE_ = 20e9;
  var _MAIN_ACCOUNT_ = accounts[0];
  var _OTHER_ACCOUNT_ = accounts[1];
  var _TOTAL_SUPPLY_ = 1000;
  var rootColony;
  var colony;
  var eternalStorage;
  var eternalStorageRoot;

  before(function(done) {
    rootColony = RootColony.deployed();
    eternalStorageRoot = EternalStorage.deployed();
    done();
  });

  beforeEach(function (done) {
    _COLONY_KEY_ = testHelper.getRandomString(7);

    eternalStorageRoot.owner.call()
    .then(function(){
      return rootColony.createColony(_COLONY_KEY_, {from: _MAIN_ACCOUNT_});
    })
    .then(function(){
      return rootColony.getColony.call(_COLONY_KEY_);
    })
    .then(function(colony_){
      colony = Colony.at(colony_);
      return;
    })
    .then(function(){
      return colony.eternalStorage.call();
    })
    .then(function(extStorageAddress){
      eternalStorage = EternalStorage.at(extStorageAddress);
      return;
    })
    .then(done)
    .catch(done);
  });

  describe('when instantiated', function () {
    it('', function (done) {});
  });
});
