/* globals artifacts */
import { solSha3 } from 'colony-utils';
import testHelper from '../helpers/test-helper';

const RootColony = artifacts.require('RootColony');
const Colony = artifacts.require('Colony');
const EternalStorage = artifacts.require('EternalStorage');

contract('TokenLibrary', function (accounts) {
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];
  const TOTAL_SUPPLY = 1000;
  let COLONY_KEY;
  let colony;
  let eternalStorage;

  beforeEach(function (done) {
    let rootColony;
    let eternalStorageRoot;

    RootColony.deployed()
    .then(function (_rootColony) {
      rootColony = _rootColony;
      return EternalStorage.new();
    })
    .then(function (contract) {
      eternalStorageRoot = contract;
      return eternalStorageRoot.changeOwner(rootColony.address);
    })
    .then(function () {
      return rootColony.registerEternalStorage(eternalStorageRoot.address);
    })
    .then(function () {
      return eternalStorageRoot.owner.call();
    })
    .then(function (eternalStorageRootOwner) {
      assert.equal(eternalStorageRootOwner, rootColony.address);
      return testHelper.getRandomString(7);
    })
    .then(function (colonyKey) {
      COLONY_KEY = colonyKey;
      return rootColony.createColony(COLONY_KEY);
    })
    .then(function () {
      return rootColony.getColony.call(COLONY_KEY);
    })
    .then(function (colony_) {
      return Colony.at(colony_);
    })
    .then(function (_colony) {
      colony = _colony;
      return colony.eternalStorage.call();
    })
    .then(function (extStorageAddress) {
      eternalStorage = EternalStorage.at(extStorageAddress);
    })
    .then(done);
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
        colony.generateTokensWei(TOTAL_SUPPLY)
        .then(function () {
          return colony.makeTask('name2', 'summary2');
        })
        .then(function () {
          return colony.setReservedTokensWeiForTask(0, 100, { from: MAIN_ACCOUNT });
        })
        .then(function () {
          return colony.completeAndPayTask(0, MAIN_ACCOUNT, { from: MAIN_ACCOUNT });
        })
        .then(function () {
          return colony.balanceOf.call(MAIN_ACCOUNT);
        })
        .then(function (balance) {
          assert.equal(balance.toNumber(), 100, 'sender balance is incorrect');
          return colony.transfer(OTHER_ACCOUNT, 80, { from: MAIN_ACCOUNT });
        })
        .then(function () {
          return colony.balanceOf.call(MAIN_ACCOUNT);
        })
        .then(function (balance) {
          assert.equal(balance.toNumber(), 20, 'sender balance is incorrect');
          return colony.balanceOf.call(OTHER_ACCOUNT);
        })
        .then(function (receiverBalance) {
          assert.equal(receiverBalance.toNumber(), 80, 'receiver balance is incorrect');
          done();
        })
        .catch(done);
      });

    it('should fail if ETHER is sent', function (done) {
      let previousBalance;
      colony.generateTokensWei(TOTAL_SUPPLY)
      .then(function () {
        return colony.balanceOf.call(MAIN_ACCOUNT);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colony.transfer(OTHER_ACCOUNT, 1, {
          value: 1,
          gas: 1e6,
        });
      })
      .catch(function (tx) {
        testHelper.checkErrorNonPayableFunction(tx);
      })
      .then(function () {
        return colony.balanceOf.call(MAIN_ACCOUNT);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the sender does not have funds', function (done) {
      let previousBalance;
      colony.generateTokensWei(TOTAL_SUPPLY)
      .then(function () {
        return colony.balanceOf.call(MAIN_ACCOUNT);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colony.transfer(OTHER_ACCOUNT, previousBalance + 1);
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function () {
        return colony.balanceOf.call(MAIN_ACCOUNT);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value is bigger than the upper limit', function (done) {
      let previousBalance;
      colony.generateTokensWei(TOTAL_SUPPLY)
      .then(function () {
        return colony.balanceOf.call(MAIN_ACCOUNT);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colony.transfer(OTHER_ACCOUNT, TOTAL_SUPPLY + 1);
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function () {
        return colony.balanceOf.call(MAIN_ACCOUNT);
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
      let previousBalance;
      let otherAccountPreviousBalance;
      let previousAllowance;
      colony.generateTokensWei(TOTAL_SUPPLY)
      .then(function () {
        return colony.makeTask('name2', 'summary2');
      })
      .then(function () {
        return colony.setReservedTokensWeiForTask(0, 100, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        return colony.completeAndPayTask(0, MAIN_ACCOUNT, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        return colony.approve(OTHER_ACCOUNT, 90, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        return colony.balanceOf.call(MAIN_ACCOUNT);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance;
        assert.equal(prevBalance.toNumber(), 100, 'Main account balance is incorrect');
        return colony.balanceOf.call(OTHER_ACCOUNT);
      })
      .then(function (prevBalance) {
        otherAccountPreviousBalance = prevBalance;
        return colony.allowance.call(MAIN_ACCOUNT, OTHER_ACCOUNT);
      })
      .then(function (prevAllowance) {
        previousAllowance = prevAllowance;
        assert.equal(prevAllowance.toNumber(), 90, 'Allowance is incorrect');
        return colony.transferFrom(MAIN_ACCOUNT, OTHER_ACCOUNT, 80, {
          from: OTHER_ACCOUNT,
        });
      })
      .then(function () {
        return colony.balanceOf.call(MAIN_ACCOUNT);
      })
      .then(function (balance) {
        assert.equal(balance.toNumber(), (previousBalance - 80), 'balance is incorrect');
        return colony.allowance.call(MAIN_ACCOUNT, OTHER_ACCOUNT);
      })
      .then(function (allowance) {
        assert.equal(allowance.toNumber(), (previousAllowance - 80), 'allowance is incorrect');
        return colony.balanceOf.call(OTHER_ACCOUNT);
      })
      .then(function (balanceAfterTransference) {
        assert.equal(balanceAfterTransference.toNumber(), (otherAccountPreviousBalance + 80),
          'transferred value does not match');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if ETHER is sent', function (done) {
      let previousBalance;

      colony.generateTokensWei(TOTAL_SUPPLY)
      .then(function () {
        return colony.approve(OTHER_ACCOUNT, 100);
      })
      .then(function () {
        return colony.balanceOf.call(MAIN_ACCOUNT);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colony.transferFrom(MAIN_ACCOUNT, OTHER_ACCOUNT, 100, {
          value: 1,
        });
      })
      .catch(function (tx) {
        testHelper.checkErrorNonPayableFunction(tx);
      })
      .then(function () {
        return colony.balanceOf.call(MAIN_ACCOUNT);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the sender does not have funds', function (done) {
      let previousBalance;
      colony.generateTokensWei(TOTAL_SUPPLY)
      .then(function () {
        return colony.approve(OTHER_ACCOUNT, 100);
      })
      .then(function () {
        return colony.balanceOf.call(MAIN_ACCOUNT);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colony.transferFrom(MAIN_ACCOUNT, OTHER_ACCOUNT, previousBalance + 1);
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function () {
        return colony.balanceOf.call(MAIN_ACCOUNT);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value is equal to zero', function (done) {
      let previousBalance;
      colony.generateTokensWei(TOTAL_SUPPLY)
      .then(function () {
        return colony.approve(OTHER_ACCOUNT, 100);
      })
      .then(function () {
        return colony.balanceOf.call(MAIN_ACCOUNT);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colony.transferFrom(MAIN_ACCOUNT, OTHER_ACCOUNT, 0);
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function () {
        return colony.balanceOf.call(MAIN_ACCOUNT);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value is bigger than the upper limit', function (done) {
      let previousBalance;

      colony.generateTokensWei(TOTAL_SUPPLY)
      .then(function () {
        return colony.approve(OTHER_ACCOUNT, 100);
      })
      .then(function () {
        return colony.balanceOf.call(MAIN_ACCOUNT);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colony.transferFrom(MAIN_ACCOUNT, OTHER_ACCOUNT, TOTAL_SUPPLY + 1);
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function () {
        return colony.balanceOf.call(MAIN_ACCOUNT);
      })
      .then(function (balance) {
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the sender does not have a high enough allowance', function (done) {
      let previousBalance;

      colony.generateTokensWei(TOTAL_SUPPLY)
      .then(function () {
        return colony.approve(OTHER_ACCOUNT, 100);
      })
      .then(function () {
        return colony.allowance.call(MAIN_ACCOUNT, OTHER_ACCOUNT);
      })
      .then(function () {
        return colony.balanceOf.call(MAIN_ACCOUNT);
      })
      .then(function (prevBalance) {
        previousBalance = prevBalance.toNumber();
        return colony.transferFrom(MAIN_ACCOUNT, OTHER_ACCOUNT, 500);
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function () {
        return colony.balanceOf.call(MAIN_ACCOUNT);
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
      colony.generateTokensWei(TOTAL_SUPPLY)
      .then(function () {
        return colony.approve(OTHER_ACCOUNT, 100);
      })
      .then(function () {
        return colony.allowance.call(MAIN_ACCOUNT, OTHER_ACCOUNT);
      })
      .then(function (allowed) {
        assert.equal(allowed.toNumber(), 100, 'amount approved is incorrect.');
        done();
      })
      .catch(done);
    });

    it('should fail if ETHER is sent', function (done) {
      colony.generateTokensWei(TOTAL_SUPPLY)
      .then(function () {
        return colony.approve(OTHER_ACCOUNT, 100, {
          value: 1,
          gas: 1e6,
        });
      })
      .catch(function (tx) {
        testHelper.checkErrorNonPayableFunction(tx);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value is bigger than upper limit', function (done) {
      colony.generateTokensWei(TOTAL_SUPPLY)
      .then(function () {
        return colony.approve(OTHER_ACCOUNT, TOTAL_SUPPLY + 1);
      })
      .then(function () {
        return colony.allowance(MAIN_ACCOUNT, OTHER_ACCOUNT);
      })
      .then(function (allowance) {
        assert.equal(0, allowance, 'approve of too many tokens succeeded when it should have failed');
      })
      .then(done)
      .catch(done);
    });

    it('should let a sender update the allowed value of another user', function (done) {
      colony.generateTokensWei(TOTAL_SUPPLY)
      .then(function () {
        return colony.approve(OTHER_ACCOUNT, 100);
      })
      .then(function () {
        return colony.allowance.call(MAIN_ACCOUNT, OTHER_ACCOUNT);
      })
      .then(function (allowed) {
        assert.equal(allowed.toNumber(), 100, 'amount approved is incorrect.');
        return colony.approve(OTHER_ACCOUNT, 50);
      })
      .then(function () {
        return colony.allowance.call(MAIN_ACCOUNT, OTHER_ACCOUNT);
      })
      .then(function (allowed) {
        assert.equal(allowed.toNumber(), 50, 'amount approved was not updated correctly.');
        done();
      })
      .catch(done);
    });
  });

  describe('when generating tokens', function () {
    it('should let the total supply be increased', function (done) {
      let previousSupply = 0;
      colony.generateTokensWei(TOTAL_SUPPLY)
      .then(function () {
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
      let previousBalance = 0;
      colony.generateTokensWei(TOTAL_SUPPLY)
      .then(function () {
        return colony.balanceOf.call(colony.address);
      })
      .then(function (_prevBalance) {
        previousBalance = _prevBalance.toNumber();
        return colony.generateTokensWei(100);
      })
      .then(function () {
        return colony.balanceOf.call(colony.address);
      })
      .then(function (_currentBalance) {
        assert.equal(previousBalance + 100, _currentBalance.toNumber(), 'owners balance is incorrect.');
        done();
      })
      .catch(done);
    });

    it('should fail if ETHER is sent', function (done) {
      colony.generateTokensWei(OTHER_ACCOUNT, 100, {
        value: 1,
        gas: 1e6,
      })
      .catch(function (tx) {
        testHelper.checkErrorNonPayableFunction(tx);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value is equal to zero', function (done) {
      colony.generateTokensWei(0, {
        gas: 1e6,
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (txid) {
        testHelper.checkAllGasSpent(1e6, txid);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the value causes uint to wrap', function (done) {
      colony.generateTokensWei(TOTAL_SUPPLY)
      .then(function () {
        return colony.generateTokensWei(web3.toBigNumber('115792089237316195423570985008687907853269984665640564039457584007913129639935'), {
          gas: 1e6,
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (txid) {
        testHelper.checkAllGasSpent(1e6, txid);
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when setting default ledger attributes', function () {
    it('should be able to define a symbol', function (done) {
      colony.setTokensSymbol('CNY')
      .then(function () {
        return eternalStorage.getBytesValue.call(solSha3('TokenSymbol'));
      })
      .then(function (_symbol) {
        assert.equal(testHelper.hexToUtf8(_symbol), 'CNY', 'tokens symbol is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should be able to define a title', function (done) {
      colony.setTokensTitle('COLONY')
      .then(function () {
        return eternalStorage.getBytesValue.call(solSha3('TokenTitle'));
      })
      .then(function (_title) {
        assert.equal(testHelper.hexToUtf8(_title), 'COLONY', 'tokens title is incorrect');
      })
      .then(done)
      .catch(done);
    });
  });
});
