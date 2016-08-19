/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, RootColony, Colony, EternalStorage, assert, web3*/
var testHelper = require('../helpers/test-helper.js');
import { solSha3 } from 'colony-utils';

contract('ColonyTokenLedger', function (accounts) {
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
    it('should have an initial supply of zero tokens', function (done) {
      colony.totalSupply.call()
      .then(function (totalSupply) {
        assert.equal(totalSupply.toNumber(), 0, 'initial supply is different from 0');
        done();
      })
      .catch(done);
    });
  });

  describe('when transferring funds directly to other parties', function () {
    it('should decrease the sender balance and increase the receiver balance by the same amount',
      function (done) {
        colony.generateTokensWei(_TOTAL_SUPPLY_)
        .then(function(){
          return colony.makeTask('name2', 'summary2');
        })
        .then(function(){
          return colony.contributeTokensWeiFromPool(0, 100, {from: _MAIN_ACCOUNT_});
        })
        .then(function(){
          return colony.completeAndPayTask(0, _MAIN_ACCOUNT_, {from: _MAIN_ACCOUNT_});
        })
        .then(function (){
          return colony.balanceOf.call(_MAIN_ACCOUNT_);
        })
        .then(function (balance) {
          assert.equal(balance.toNumber(), 95, 'sender balance is incorrect');
          return colony.transfer(_OTHER_ACCOUNT_, 80, {from: _MAIN_ACCOUNT_});
        })
        .then(function (){
          return colony.balanceOf.call(_MAIN_ACCOUNT_);
        })
        .then(function (balance) {
          assert.equal(balance.toNumber(), 15, 'sender balance is incorrect');
          return colony.balanceOf.call(_OTHER_ACCOUNT_);
        })
        .then(function (receiverBalance) {
          assert.equal(receiverBalance.toNumber(), 80, 'receiver balance is incorrect');
          done();
        })
        .catch(done);
      });

    it('should fail if ETHER is sent', function (done) {
      var previousBalance;
      colony.generateTokensWei(_TOTAL_SUPPLY_)
      .then(function(){
        return colony.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colony.transfer(_OTHER_ACCOUNT_, 1, {
          value: 1,
          gas:1e6,
          gasPrice: _GAS_PRICE_
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function () {
        return colony.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the sender does not have funds', function (done) {
      var previousBalance;
      colony.generateTokensWei(_TOTAL_SUPPLY_)
      .then(function(){
        return colony.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colony.transfer(_OTHER_ACCOUNT_, previousBalance + 1);
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        return colony.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value is bigger than the upper limit', function (done) {
      var previousBalance;
      colony.generateTokensWei(_TOTAL_SUPPLY_)
      .then(function(){
        return colony.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colony.transfer(_OTHER_ACCOUNT_, _TOTAL_SUPPLY_ + 1);
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        return colony.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when transferring funds from a party to another', function () {
    it('should modify the balance and allowance', function (done) {
      var previousBalance;
      var otherAccountPreviousBalance;
      var previousAllowance;
      colony.generateTokensWei(_TOTAL_SUPPLY_)
      .then(function(){
        return colony.makeTask('name2', 'summary2');
      })
      .then(function(){
        return colony.contributeTokensWeiFromPool(0, 100, {from: _MAIN_ACCOUNT_});
      })
      .then(function(){
        return colony.completeAndPayTask(0, _MAIN_ACCOUNT_, {from: _MAIN_ACCOUNT_});
      })
      .then(function(){
        return colony.approve(_OTHER_ACCOUNT_, 90, {from: _MAIN_ACCOUNT_});
      })
      .then(function(){
        return colony.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance;
        assert.equal(prevBalance.toNumber(), 95, 'Main account balance is incorrect');
        return colony.balanceOf.call(_OTHER_ACCOUNT_);
      })
      .then(function (prevBalance) {
        otherAccountPreviousBalance = prevBalance;
        return colony.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function (prevAllowance) {
        previousAllowance = prevAllowance;
        assert.equal(prevAllowance.toNumber(), 90, 'Allowance is incorrect');
        return colony.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, 80, {
          from: _OTHER_ACCOUNT_
        });
      })
      .then(function () {
        return colony.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(balance.toNumber(), (previousBalance - 80), 'balance is incorrect');
        return colony.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function (allowance) {
        assert.equal(allowance.toNumber(), (previousAllowance - 80), 'allowance is incorrect');
        return colony.balanceOf.call(_OTHER_ACCOUNT_);
      })
      .then(function (balanceAfterTransference) {
        assert.equal(balanceAfterTransference.toNumber(), (otherAccountPreviousBalance + 80),
          'transferred value does not match');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if ETHER is sent', function (done) {
      var previousBalance;

      colony.generateTokensWei(_TOTAL_SUPPLY_)
      .then(function(){
        return colony.approve(_OTHER_ACCOUNT_, 100);
      })
      .then(function () {
        return colony.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colony.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, 100, {
          value: 1
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        return colony.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the sender does not have funds', function (done) {
      var previousBalance;
      colony.generateTokensWei(_TOTAL_SUPPLY_)
      .then(function(){
        return colony.approve(_OTHER_ACCOUNT_, 100);
      })
      .then(function () {
        return colony.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colony.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, previousBalance + 1);
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function () {
        return colony.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value is equal to zero', function (done) {
      var previousBalance;
      colony.generateTokensWei(_TOTAL_SUPPLY_)
      .then(function(){
        return colony.approve(_OTHER_ACCOUNT_, 100);
      })
      .then(function () {
        return colony.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colony.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, 0);
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function () {
        return colony.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value is bigger than the upper limit', function (done) {
      var previousBalance;

      colony.generateTokensWei(_TOTAL_SUPPLY_)
      .then(function(){
        return colony.approve(_OTHER_ACCOUNT_, 100);
      })
      .then(function () {
        return colony.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colony.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, _TOTAL_SUPPLY_ + 1);
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function () {
        return colony.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the sender does not have a high enough allowance', function (done) {
      var previousBalance;

      colony.generateTokensWei(_TOTAL_SUPPLY_)
      .then(function(){
        return colony.approve(_OTHER_ACCOUNT_, 100);
      })
      .then(function () {
        return colony.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function () {
        return colony.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colony.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, 500);
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function () {
        return colony.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when approving allowance to a third party', function () {
    it('should set the allowed value to be equal to the approved value', function (done) {

      colony.generateTokensWei(_TOTAL_SUPPLY_)
      .then(function(){
        return colony.approve(_OTHER_ACCOUNT_, 100);
      })
      .then(function () {
        return colony.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function (allowed) {
        assert.equal(allowed.toNumber(), 100, 'amount approved is incorrect.');
        done();
      }).catch(done);
    });

    it('should fail if ETHER is sent', function (done) {
      var prevBalance;
      colony.generateTokensWei(_TOTAL_SUPPLY_)
      .then(function(){
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return colony.approve(_OTHER_ACCOUNT_, 100, {
          value: 1,
          gas: 1e6,
          gasPrice: _GAS_PRICE_
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value is bigger than upper limit', function (done) {
      colony.generateTokensWei(_TOTAL_SUPPLY_)
      .then(function(){
        return colony.approve(_OTHER_ACCOUNT_, _TOTAL_SUPPLY_ + 1);
      })
      .then(function(){
        return colony.allowance(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function(allowance){
        assert.equal(0, allowance, 'approve of too many tokens succeeded when it should have failed');
      })
      .then(done)
      .catch(done);
    });

    it('should let a sender update the allowed value of another user', function (done) {
      colony.generateTokensWei(_TOTAL_SUPPLY_)
      .then(function(){
        return colony.approve(_OTHER_ACCOUNT_, 100);
      })
      .then(function () {
        return colony.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function (allowed) {
        assert.equal(allowed.toNumber(), 100, 'amount approved is incorrect.');
        return colony.approve(_OTHER_ACCOUNT_, 50);
      })
      .then(function () {
        return colony.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function (allowed) {
        assert.equal(allowed.toNumber(), 50, 'amount approved was not updated correctly.');
        done();
      }).catch(done);
    });
  });

  describe('when generating tokens', function () {
    it('should let the total supply be increased', function (done) {
      var previousSupply = 0;
      colony.generateTokensWei(_TOTAL_SUPPLY_)
      .then(function(){
        return colony.totalSupply.call();
      })
      .then(function (totalSupply) {
        previousSupply = totalSupply.toNumber();
        return colony.generateTokensWei(100);
      })
      .then(function () {
        return colony.totalSupply.call();
      })
      .then(function (_totalSupply) {
        assert.equal(previousSupply + 100, _totalSupply.toNumber(), 'total supply is incorrect.');
        done();
      })
      .catch(done);
    });

    it('should increase the colony balance by the same amount of generated tokens', function (done) {
      var previousBalance = 0;
      colony.generateTokensWei(_TOTAL_SUPPLY_)
      .then(function(){
        return colony.balanceOf.call(colony.address);
      })
      .then(function (_prevBalance) {
        previousBalance = _prevBalance.toNumber();
        return colony.generateTokensWei(100);
      })
      .then(function(){
        return colony.balanceOf.call(colony.address);
      })
      .then(function (_currentBalance) {
        assert.equal(previousBalance + 100, _currentBalance.toNumber(), 'owners balance is incorrect.');
        done();
      })
      .catch(done);
    });

    it('should fail if ETHER is sent', function (done) {
      var prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
      colony.generateTokensWei(_OTHER_ACCOUNT_, 100, {
          value: 1,
          gas: 1e6,
          gasPrice: _GAS_PRICE_
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value is equal to zero', function (done) {
      var prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
      colony.generateTokensWei(0, {
        gas: 1e6,
        gasPrice: _GAS_PRICE_
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value causes uint to wrap', function (done) {
      var prevBalance;
      colony.generateTokensWei(_TOTAL_SUPPLY_)
      .then(function(){
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return colony.generateTokensWei(web3.toBigNumber('115792089237316195423570985008687907853269984665640564039457584007913129639935'), {
          gas: 1e6,
          gasPrice: _GAS_PRICE_
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when setting default ledger attributes', function(){
    it('should be able to define a symbol', function(done){
      colony.setTokensSymbol('CNY')
      .then(function(){
        return eternalStorage.getBytesValue.call(solSha3('TokenSymbol'));
      })
      .then(function(_symbol){
        assert.equal(testHelper.hexToUtf8(_symbol), 'CNY', 'tokens symbol is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should be able to define a title', function(done){
      colony.setTokensTitle('COLONY')
      .then(function(){
        return eternalStorage.getBytesValue.call(solSha3('TokenTitle'));
      })
      .then(function(_title){
        assert.equal(testHelper.hexToUtf8(_title), 'COLONY', 'tokens title is incorrect');
      })
      .then(done)
      .catch(done);
    });
  });
});
