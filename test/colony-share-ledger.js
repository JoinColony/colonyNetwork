/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, ColonyShareLedger, assert, web3*/

function ifUsingTestRPC() {
  //Okay, so, there is a discrepancy between how testrpc handles
  //OOG errors (throwing an exception all the way up to these tests) and
  //how geth handles them (still making a valid transaction and returning
  //a txid). For the explanation of why, see
  //
  //See https://github.com/ethereumjs/testrpc/issues/39
  //
  //Obviously, we want our tests to pass on both, so this is a
  //bit of a problem. We have to have this special function that we use to catch
  //the error. I've named it so that it reads well in the tests below - i.e.
  //.catch(ifUsingTestRPC)
  //Note that it just swallows the error - open to debate on whether this is
  //the best thing to do, or it should log it even though it's expected, in
  //case we get an error that is unexpected...
  // console.log('Error:',err)
  return;
}

function checkAllGasSpent(gasAmount, gasPrice, account, prevBalance){
  var newBalance = web3.eth.getBalance(account);
  //When a transaction throws, all the gas sent is spent. So let's check that
  //we spent all the gas that we sent.
  assert.equal(prevBalance.minus(newBalance).toNumber(), gasAmount*gasPrice, 'creation didnt fail - didn\'t throw and use all gas');
}

contract('ColonyShareLedger', function (accounts) {
  var _MAIN_ACCOUNT_ = accounts[0];
  var _OTHER_ACCOUNT_ = accounts[1];
  var _TOTAL_SUPPLY_ = 1000;
  var _GAS_PRICE_ = 20e9;
  var colonyShare;

  beforeEach(function (done) {
    ColonyShareLedger.new(_TOTAL_SUPPLY_, 'CNY', 'COLONY',{from:_MAIN_ACCOUNT_})
    .then(function (contract) {
      colonyShare = contract;
      done();
    });
  });

  describe('when created', function () {
    it('should have an initial supply', function (done) {
      colonyShare.totalSupply.call()
      .then(function (total_supply) {
        assert.equal(total_supply, 1000, 'initial supply is different from  1000');
        done();
      })
      .catch(done);
    });

    it('should have an owner', function (done) {
      colonyShare.owner.call()
      .then(function (owner) {
        assert.equal(_MAIN_ACCOUNT_, owner, 'owner does not match');
        done();
      })
      .catch(done);
    });

    it('should give the owner an initial supply', function (done) {
      colonyShare.balanceOf.call(_MAIN_ACCOUNT_)
      .then(function (owner_initial_supply) {
        assert.equal(owner_initial_supply, 1000, 'owner initial supply is different from  1000');
        done();
      })
      .catch(done);
    });

    it('should have a symbol', function (done) {
      colonyShare.symbol.call()
      .then(function (symbol) {
        assert.equal('CNY', symbol, 'symbol does not match');
        done();
      })
      .catch(done);
    });

    it('should have a name', function (done) {
      colonyShare.name.call()
      .then(function (name) {
        assert.equal('COLONY', name, 'name does not match');
        done();
      })
      .catch(done);
    });

    it('should fail if ETHER is sent', function (done) {
      var prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
      ColonyShareLedger.new(_TOTAL_SUPPLY_, 'CNY', 'COLONY', {
        value: 1,
        gas: 1e6,
        gasPrice: _GAS_PRICE_
      })
      .catch(ifUsingTestRPC)
      .then(function(){
        checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when transferring funds directly to other parties', function () {
    it('should decrease the sender balance and increase the receiver balance by the same amount',
      function (done) {
        var previousBalance;

        colonyShare.balanceOf.call(_MAIN_ACCOUNT_)
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

      colonyShare.balanceOf.call(_MAIN_ACCOUNT_)
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transfer(_OTHER_ACCOUNT_, 1, {
          value: 1,
          gas:1e6,
          gasPrice: _GAS_PRICE_
        });
      })
      .catch(ifUsingTestRPC)
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

      colonyShare.balanceOf.call(_MAIN_ACCOUNT_)
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transfer(_OTHER_ACCOUNT_, previousBalance + 1);
      })
      .catch(ifUsingTestRPC)
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

      colonyShare.balanceOf.call(_MAIN_ACCOUNT_)
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transfer(_OTHER_ACCOUNT_, 0);
      })
      .catch(ifUsingTestRPC)
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

      colonyShare.balanceOf.call(_MAIN_ACCOUNT_)
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transfer(_OTHER_ACCOUNT_, _TOTAL_SUPPLY_ + 1);
      })
      .catch(ifUsingTestRPC)
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

      colonyShare.approve(_OTHER_ACCOUNT_, 100)
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

      colonyShare.approve(_OTHER_ACCOUNT_, 100)
      .then(function () {
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, 100, {
          value: 1
        });
      })
      .catch(ifUsingTestRPC)
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

      colonyShare.approve(_OTHER_ACCOUNT_, 100)
      .then(function () {
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, previousBalance + 1);
      })
      .catch(ifUsingTestRPC)
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

      colonyShare.approve(_OTHER_ACCOUNT_, 100)
      .then(function () {
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, 0);
      })
      .catch(ifUsingTestRPC)
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

      colonyShare.approve(_OTHER_ACCOUNT_, 100)
      .then(function () {
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, _TOTAL_SUPPLY_ + 1);
      })
      .catch(ifUsingTestRPC)
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

      colonyShare.approve(_OTHER_ACCOUNT_, 100)
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
      .catch(ifUsingTestRPC)
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
      colonyShare.approve(_OTHER_ACCOUNT_, 100)
      .then(function () {
        return colonyShare.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function (allowed) {
        assert.equal(allowed.toNumber(), 100, 'amount approved is incorrect.');
        done();
      }).catch(done);
    });

    it('should fail if ETHER is sent', function (done) {
      var prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);

      colonyShare.approve(_OTHER_ACCOUNT_, 100, {
        value: 1,
        gas: 1e6,
        gasPrice: _GAS_PRICE_
      })
      .catch(ifUsingTestRPC)
      .then(function(){
        checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value is bigger than upper limit', function (done) {
      var prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
      colonyShare.approve(_OTHER_ACCOUNT_, _TOTAL_SUPPLY_ + 1,
      {
        gas: 1e6,
        gasPrice: _GAS_PRICE_
      })
      .catch(ifUsingTestRPC)
      .then(function(){
        checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should let a sender update the allowed value of another user', function (done) {
      colonyShare.approve(_OTHER_ACCOUNT_, 100)
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
      colonyShare.totalSupply.call()
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

      colonyShare.balanceOf.call(_MAIN_ACCOUNT_)
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
      .catch(ifUsingTestRPC)
      .then(function(){
        checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
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
      .catch(ifUsingTestRPC)
      .then(function(){
        checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value causes uint to wrap', function (done) {
      var prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
      colonyShare.generateShares(web3.toBigNumber('115792089237316195423570985008687907853269984665640564039457584007913129639935'), {
        gas: 1e6,
        gasPrice: _GAS_PRICE_
      })
      .catch(ifUsingTestRPC)
      .then(function(){
        checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });
  });
});
