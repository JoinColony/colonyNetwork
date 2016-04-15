/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, ColonyShareLedger, assert, web3*/
var testHelper = require('../helpers/test-helper.js');
contract('ColonyShareLedger', function (accounts) {
  var _GAS_PRICE_ = 20e9;
  var _MAIN_ACCOUNT_ = accounts[0];
  var _OTHER_ACCOUNT_ = accounts[1];
  var _TOTAL_SUPPLY_ = 1000;
  var colonyShare;

  beforeEach(function (done) {
    ColonyShareLedger.new()
    .then(function (contract) {
      colonyShare = contract;
      done();
    });
  });

  describe('when created', function () {
    it('should have an initial supply of zero shares', function (done) {
      colonyShare.totalSupply.call()
      .then(function (total_supply) {
        assert.equal(total_supply, 0, 'initial supply is different from  1000');
        done();
      })
      .catch(done);
    });

    it('should fail if ETHER is sent', function (done) {
      var prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
      ColonyShareLedger.new({
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
  });

  describe('when transferring funds directly to other parties', function () {
    it('should decrease the sender balance and increase the receiver balance by the same amount',
      function (done) {
        var previousBalance;
        colonyShare.generateShares(_TOTAL_SUPPLY_)
        .then(function(){
          return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
        })
        .then(function (prevBalance) {
          previousBalance = prevBalance;
          return colonyShare.transfer(_OTHER_ACCOUNT_, 100);
        })
        .then(function () {
          return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
        })
        .then(function (balance) {
          assert.equal(balance.toNumber(), (previousBalance - 100), 'sender balance is incorrect');
          return colonyShare.balanceOf.call(_OTHER_ACCOUNT_);
        })
        .then(function (receiverBalance) {
          assert.equal(receiverBalance.toNumber(), 100, 'receiver balance is incorrect');
          done();
        })
        .catch(done);
      });

    it('should fail if ETHER is sent',  function (done) {
      var previousBalance;
      colonyShare.generateShares(_TOTAL_SUPPLY_)
      .then(function(){
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transfer(_OTHER_ACCOUNT_, 1, {
          value: 1,
          gas:1e6,
          gasPrice: _GAS_PRICE_
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function () {
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the sender does not have funds', function (done) {
      var previousBalance;
      colonyShare.generateShares(_TOTAL_SUPPLY_)
      .then(function(){
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transfer(_OTHER_ACCOUNT_, previousBalance + 1);
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the payload is equal to zero', function (done) {
      var previousBalance;
      colonyShare.generateShares(_TOTAL_SUPPLY_)
      .then(function(){
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transfer(_OTHER_ACCOUNT_, 0);
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value is bigger than the upper limit', function (done) {
      var previousBalance;
      colonyShare.generateShares(_TOTAL_SUPPLY_)
      .then(function(){
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transfer(_OTHER_ACCOUNT_, _TOTAL_SUPPLY_ + 1);
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
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
      colonyShare.generateShares(_TOTAL_SUPPLY_)
      .then(function(){
        return colonyShare.approve(_OTHER_ACCOUNT_, 100);
      })
      .then(function () {
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance;
        return colonyShare.balanceOf.call(_OTHER_ACCOUNT_);
      })
      .then(function (prevBalance) {
        otherAccountPreviousBalance = prevBalance;
        return colonyShare.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function (prevAllowance) {
        previousAllowance = prevAllowance;
        return colonyShare.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, 100, {
          from: _OTHER_ACCOUNT_
        });
      })
      .then(function () {
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(balance.toNumber(), (previousBalance - 100), 'balance is incorrect');
        return colonyShare.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function (allowance) {
        assert.equal(allowance.toNumber(), (previousAllowance - 100), 'allowance is incorrect');
        return colonyShare.balanceOf.call(_OTHER_ACCOUNT_);
      })
      .then(function (balanceAfterTransference) {
        assert.equal(balanceAfterTransference.toNumber(), (otherAccountPreviousBalance + 100),
          'transferred value does not match');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if ETHER is sent', function (done) {
      var previousBalance;

      colonyShare.generateShares(_TOTAL_SUPPLY_)
      .then(function(){
        return colonyShare.approve(_OTHER_ACCOUNT_, 100);
      })
      .then(function () {
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, 100, {
          value: 1
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the sender does not have funds', function (done) {
      var previousBalance;
      colonyShare.generateShares(_TOTAL_SUPPLY_)
      .then(function(){
        return colonyShare.approve(_OTHER_ACCOUNT_, 100);
      })
      .then(function () {
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, previousBalance + 1);
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function () {
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value is equal to zero', function (done) {
      var previousBalance;
      colonyShare.generateShares(_TOTAL_SUPPLY_)
      .then(function(){
        return colonyShare.approve(_OTHER_ACCOUNT_, 100);
      })
      .then(function () {
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, 0);
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function () {
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value is bigger than the upper limit', function (done) {
      var previousBalance;

      colonyShare.generateShares(_TOTAL_SUPPLY_)
      .then(function(){
        return colonyShare.approve(_OTHER_ACCOUNT_, 100);
      })
      .then(function () {
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, _TOTAL_SUPPLY_ + 1);
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function () {
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the sender does not have a high enough allowance', function (done) {
      var previousBalance;

      colonyShare.generateShares(_TOTAL_SUPPLY_)
      .then(function(){
        return colonyShare.approve(_OTHER_ACCOUNT_, 100);
      })
      .then(function () {
        return colonyShare.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function () {
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, 500);
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function () {
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
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

      colonyShare.generateShares(_TOTAL_SUPPLY_)
      .then(function(){
        return colonyShare.approve(_OTHER_ACCOUNT_, 100);
      })
      .then(function () {
        return colonyShare.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function (allowed) {
        assert.equal(allowed.toNumber(), 100, 'amount approved is incorrect.');
        done();
      }).catch(done);
    });

    it('should fail if ETHER is sent', function (done) {
      var prevBalance;
      colonyShare.generateShares(_TOTAL_SUPPLY_)
      .then(function(){
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return colonyShare.approve(_OTHER_ACCOUNT_, 100, {
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
      var prevBalance;
      colonyShare.generateShares(_TOTAL_SUPPLY_)
      .then(function(){
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return colonyShare.approve(_OTHER_ACCOUNT_, _TOTAL_SUPPLY_ + 1,
        {
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

    it('should let a sender update the allowed value of another user', function (done) {
      colonyShare.generateShares(_TOTAL_SUPPLY_)
      .then(function(){
        return colonyShare.approve(_OTHER_ACCOUNT_, 100);
      })
      .then(function () {
        return colonyShare.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function (allowed) {
        assert.equal(allowed.toNumber(), 100, 'amount approved is incorrect.');
        return colonyShare.approve(_OTHER_ACCOUNT_, 50);
      })
      .then(function () {
        return colonyShare.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function (allowed) {
        assert.equal(allowed.toNumber(), 50, 'amount approved was not updated correctly.');
        done();
      }).catch(done);
    });
  });

  describe('when generating shares', function () {
    it('should let the total supply be increased', function (done) {
      var previousSupply = 0;
      colonyShare.generateShares(_TOTAL_SUPPLY_)
      .then(function(){
        return colonyShare.totalSupply.call();
      })
      .then(function (total_supply) {
        previousSupply = total_supply.toNumber();
        return colonyShare.generateShares(100);
      })
      .then(function () {
        return colonyShare.totalSupply.call();
      })
      .then(function (_totalSupply) {
        assert.equal(previousSupply + 100, _totalSupply.toNumber(), 'total supply is incorrect.');
        done();
      })
      .catch(done);
    });

    it('should increase the owners balance by the same amount of generated shares', function (done) {
      var previousBalance = 0;
      colonyShare.generateShares(_TOTAL_SUPPLY_)
      .then(function(){
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (_prevBalance) {
        previousBalance = _prevBalance.toNumber();
        return colonyShare.generateShares(100);
      })
      .then(function(){
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (_currentBalance) {
        assert.equal(previousBalance + 100, _currentBalance.toNumber(), 'owners balance is incorrect.');
        done();
      })
      .catch(done);
    });

    it('should fail if ETHER is sent', function (done) {
      var prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
      colonyShare.generateShares(_OTHER_ACCOUNT_, 100, {
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
      colonyShare.generateShares(0, {
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
      colonyShare.generateShares(_TOTAL_SUPPLY_)
      .then(function(){
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return colonyShare.generateShares(web3.toBigNumber('115792089237316195423570985008687907853269984665640564039457584007913129639935'), {
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
      colonyShare.setSharesSymbol('CNY')
      .then(function(){
        return colonyShare.symbol.call();
      })
      .then(function(_symbol){
        assert.equal(testHelper.hexToUtf8(_symbol), 'CNY', 'shares symbol is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should be able to define a title', function(done){
      colonyShare.setSharesTitle('COLONY')
      .then(function(){
        return colonyShare.title.call();
      })
      .then(function(_title){
        assert.equal(testHelper.hexToUtf8(_title), 'COLONY', 'shares title is incorrect');
      })
      .then(done)
      .catch(done);
    });
  });
});
