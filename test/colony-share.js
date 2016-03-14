/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, ColonyShare, assert */

contract('ColonyShare', function (accounts) {
  var _MAIN_ACCOUNT_ = accounts[0];
  var _OTHER_ACCOUNT_ = accounts[1];
  var _TOTAL_SUPPLY_ = 1000;
  var colonyShare;

  beforeEach(function (done) {
    ColonyShare.new(_TOTAL_SUPPLY_, 'CNY', 'COLONY')
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
      var creationFailed = false;
      ColonyShare.new(_TOTAL_SUPPLY_, 'CNY', 'COLONY', {
        value: 1
      })
      .catch(function () {
        creationFailed = true;
      })
      .then(function () {
        assert.equal(creationFailed, true, 'creation didnt fail');
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

    it('should fail if ETHER is sent', function (done) {
      var previousBalance;
      var shouldFailIfEtherWasSentInTransference;

      colonyShare.balanceOf.call(_MAIN_ACCOUNT_)
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transfer(_OTHER_ACCOUNT_, 1, {
          value: 1
        });
      })
      .catch(function () {
        shouldFailIfEtherWasSentInTransference = true;
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(shouldFailIfEtherWasSentInTransference, true, 'transference did not fail');
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the sender does not have funds', function (done) {
      var previousBalance;
      var transferenceWithNoFundsFailed;

      colonyShare.balanceOf.call(_MAIN_ACCOUNT_)
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transfer(_OTHER_ACCOUNT_, previousBalance + 1);
      })
      .catch(function () {
        transferenceWithNoFundsFailed = true;
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(transferenceWithNoFundsFailed, true, 'transference did not fail');
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the payload is equal to zero', function (done) {
      var previousBalance;
      var transferenceOfZeroValue;

      colonyShare.balanceOf.call(_MAIN_ACCOUNT_)
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transfer(_OTHER_ACCOUNT_, 0);
      })
      .catch(function () {
        transferenceOfZeroValue = true;
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(transferenceOfZeroValue, true, 'transference did not fail');
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value is bigger than the upper limit', function (done) {
      var previousBalance;
      var payloadBiggerThanUpperLimit = false;

      colonyShare.balanceOf.call(_MAIN_ACCOUNT_)
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transfer(_OTHER_ACCOUNT_, _TOTAL_SUPPLY_ + 1);
      })
      .catch(function () {
        payloadBiggerThanUpperLimit = true;
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(payloadBiggerThanUpperLimit, true, 'transference did not fail');
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
      var shouldFailIfEtherWasSent;

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
      .catch(function () {
        shouldFailIfEtherWasSent = true;
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(shouldFailIfEtherWasSent, true, 'transference did not fail');
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the sender does not have funds', function (done) {
      var previousBalance;
      var transferenceFromAnotherAddressWithNoFundsFailed;

      colonyShare.approve(_OTHER_ACCOUNT_, 100)
      .then(function () {
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, previousBalance + 1);
      })
      .catch(function () {
        transferenceFromAnotherAddressWithNoFundsFailed = true;
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(transferenceFromAnotherAddressWithNoFundsFailed, true,
          'transference did not fail');
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value is equal to zero', function (done) {
      var previousBalance;
      var transferenceFromAnotherAddressWithValueEqualsToZero;

      colonyShare.approve(_OTHER_ACCOUNT_, 100)
      .then(function () {
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, 0);
      })
      .catch(function () {
        transferenceFromAnotherAddressWithValueEqualsToZero = true;
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(transferenceFromAnotherAddressWithValueEqualsToZero, true,
          'transference did not fail');
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value is bigger than the upper limit', function (done) {
      var previousBalance;
      var transferenceOfValueBiggerThanTheUpperLimit;

      colonyShare.approve(_OTHER_ACCOUNT_, 100)
      .then(function () {
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colonyShare.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, _TOTAL_SUPPLY_ + 1);
      })
      .catch(function () {
        transferenceOfValueBiggerThanTheUpperLimit = true;
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(transferenceOfValueBiggerThanTheUpperLimit, true,
          'transference did not fail');
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the sender does not have a high enough allowance', function (done) {
      var previousBalance;
      var transferenceFromAnotherAddressWithInvalidValueFailed;

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
      .catch(function () {
        transferenceFromAnotherAddressWithInvalidValueFailed = true;
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (balance) {
        assert.equal(transferenceFromAnotherAddressWithInvalidValueFailed, true,
          'transference did not fail');
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
      var shouldFailEtherWasSentInApproval = false;
      colonyShare.approve(_OTHER_ACCOUNT_, 100, {
        value: 1
      })
      .catch(function () {
        shouldFailEtherWasSentInApproval = true;
      })
      .then(function () {
        assert.equal(shouldFailEtherWasSentInApproval, true, 'approval didnt fail.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value is bigger than upper limit', function (done) {
      var shoudFailIfValueIsBiggerThanUpperLimit = false;
      colonyShare.approve(_OTHER_ACCOUNT_, _TOTAL_SUPPLY_ + 1)
      .catch(function () {
        shoudFailIfValueIsBiggerThanUpperLimit = true;
      })
      .then(function () {
        assert.equal(shoudFailIfValueIsBiggerThanUpperLimit, true, 'approval didnt fail.');
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
        colonyShare.generateShares(100);
        return colonyShare.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function (_currentBalance) {
        assert.equal(previousBalance + 100, _currentBalance.toNumber(), 'owners balance is incorrect.');
        done();
      })
      .catch(done);
    });

    it('should fail if ETHER is sent', function (done) {
      var shouldFailEtherWasSentWhileGeneratingShares = false;
      colonyShare.generateShares(_OTHER_ACCOUNT_, 100, {
        value: 1
      })
      .catch(function () {
        shouldFailEtherWasSentWhileGeneratingShares = true;
      })
      .then(function () {
        assert.equal(shouldFailEtherWasSentWhileGeneratingShares, true,
          'shares generation did not fail.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value is equal to zero', function (done) {
      var shouldFailIfSharesGenerationValueIsZero = false;
      colonyShare.generateShares(0)
      .catch(function () {
        shouldFailIfSharesGenerationValueIsZero = true;
      })
      .then(function () {
        assert.equal(shouldFailIfSharesGenerationValueIsZero, true,
          'shares generation did not fail.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value causes uint to wrap', function (done) {
      var shouldFailIfUintWrap = false;
      colonyShare.generateShares(2e255)
      .catch(function () {
        shouldFailIfUintWrap = true;
      })
      .then(function () {
        assert.equal(shouldFailIfUintWrap, true, 'shares generation did not fail.');
      })
      .then(done)
      .catch(done);
    });
  });
});
