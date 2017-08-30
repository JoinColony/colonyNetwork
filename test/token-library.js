/* globals artifacts */
import sha3 from 'solidity-sha3';
import testHelper from '../helpers/test-helper';

const ColonyNetwork = artifacts.require('ColonyNetwork');
const Colony = artifacts.require('Colony');
const EternalStorage = artifacts.require('EternalStorage');

contract('TokenLibrary', function (accounts) {
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];
  const TOTAL_SUPPLY = 1000;
  let COLONY_KEY;
  let colony;
  let eternalStorage;
  const GAS_TO_SPEND = 4700000;

  beforeEach(async function () {
    const rootColony = await ColonyNetwork.new();
    COLONY_KEY = testHelper.getRandomString(7);
    await rootColony.createColony(COLONY_KEY);
    const colonyAddress = await rootColony.getColony.call(COLONY_KEY);
    colony = await Colony.at(colonyAddress);
    const eternalStorageAddress = await colony.eternalStorage.call();
    eternalStorage = await EternalStorage.at(eternalStorageAddress);
  });

  describe('when instantiated', () => {
    it('should have an initial supply of zero tokens', async function () {
      const totalSupply = await colony.totalSupply.call();
      assert.equal(totalSupply.toNumber(), 0, 'initial supply is different from 0');
    });
  });

  describe('when transferring funds directly to other parties', () => {
    it('should decrease the sender balance and increase the receiver balance by the same amount', async function () {
        await colony.generateTokensWei(TOTAL_SUPPLY);
        await colony.makeTask('name2', 'summary2');
        await colony.setReservedTokensWeiForTask(0, 100);
        await colony.completeAndPayTask(0, MAIN_ACCOUNT);
        let balance = await colony.balanceOf.call(MAIN_ACCOUNT);
        assert.equal(balance.toNumber(), 100, 'sender balance is incorrect');
        await colony.transfer(OTHER_ACCOUNT, 80);
        balance = await colony.balanceOf.call(MAIN_ACCOUNT);
        assert.equal(balance.toNumber(), 20, 'sender balance is incorrect');
        const receiverBalance = await colony.balanceOf.call(OTHER_ACCOUNT);
        assert.equal(receiverBalance.toNumber(), 80, 'receiver balance is incorrect');
      });

    it('should fail if ETHER is sent', async function () {
      await colony.generateTokensWei(TOTAL_SUPPLY);
      const previousBalance = await colony.balanceOf.call(MAIN_ACCOUNT);
      try {
        await colony.transfer(OTHER_ACCOUNT, 1, { value: 1, gas: GAS_TO_SPEND });
      } catch(err) {
        testHelper.checkErrorNonPayableFunction(err);
      }

      const balance = await colony.balanceOf.call(MAIN_ACCOUNT);
      assert.equal(previousBalance.toNumber(), balance.toNumber(), 'sender balance was modified.');
    });

    it('should fail if the sender does not have funds', async function () {
      await colony.generateTokensWei(TOTAL_SUPPLY);
      const previousBalance = await colony.balanceOf.call(MAIN_ACCOUNT);
      let tx;
      try {
        tx = await colony.transfer(OTHER_ACCOUNT, previousBalance.add(1).toNumber(), { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      const balance = await colony.balanceOf.call(MAIN_ACCOUNT);
      assert.equal(previousBalance.toNumber(), balance.toNumber(), 'sender balance was modified.');
    });

    it('should fail if the value is bigger than the upper limit', async function () {
      await colony.generateTokensWei(TOTAL_SUPPLY);
      const previousBalance = await colony.balanceOf.call(MAIN_ACCOUNT);
      try {
        await colony.transfer(OTHER_ACCOUNT, TOTAL_SUPPLY + 1, { gas: GAS_TO_SPEND });
      } catch(err) {
        testHelper.ifUsingTestRPC(err);
      }
      const balance = await colony.balanceOf.call(MAIN_ACCOUNT);
      assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
    });
  });

  describe('when transferring funds from a party to another', () => {
    it('should modify the balance and allowance', async function () {
      await colony.generateTokensWei(TOTAL_SUPPLY);
      await colony.makeTask('name2', 'summary2');
      await colony.setReservedTokensWeiForTask(0, 100);
      await colony.completeAndPayTask(0, MAIN_ACCOUNT);
      await colony.approve(OTHER_ACCOUNT, 90);
      const previousBalanceMainAccount = await colony.balanceOf.call(MAIN_ACCOUNT);
      assert.equal(previousBalanceMainAccount.toNumber(), 100, 'Main account balance is incorrect');
      const previousBalanceOtherAccount = await colony.balanceOf.call(OTHER_ACCOUNT);
      const previousAllowance = await colony.allowance.call(MAIN_ACCOUNT, OTHER_ACCOUNT);
      assert.equal(previousAllowance.toNumber(), 90, 'Allowance is incorrect');

      await colony.transferFrom(MAIN_ACCOUNT, OTHER_ACCOUNT, 80, { from: OTHER_ACCOUNT });
      const balance = await colony.balanceOf.call(MAIN_ACCOUNT);
      assert.equal(balance.toNumber(), (previousBalanceMainAccount - 80), 'balance is incorrect');
      const allowance = await colony.allowance.call(MAIN_ACCOUNT, OTHER_ACCOUNT);
      assert.equal(allowance.toNumber(), (previousAllowance - 80), 'allowance is incorrect');
      const balanceAfterTransference = await colony.balanceOf.call(OTHER_ACCOUNT);
      assert.equal(balanceAfterTransference.toNumber(), (previousBalanceOtherAccount + 80));
    });

    it('should fail if ETHER is sent', async function () {
      await colony.generateTokensWei(TOTAL_SUPPLY);
      await colony.approve(OTHER_ACCOUNT, 100);
      const previousBalance = await colony.balanceOf.call(MAIN_ACCOUNT);

      try {
        await colony.transferFrom(MAIN_ACCOUNT, OTHER_ACCOUNT, 100, { value: 1, gas: GAS_TO_SPEND });
      } catch(err) {
        testHelper.checkErrorNonPayableFunction(err);
      }

      const balance = await colony.balanceOf.call(MAIN_ACCOUNT);
      assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
    });

    it('should fail if the sender does not have funds', async function () {
      await colony.generateTokensWei(TOTAL_SUPPLY);
      await colony.approve(OTHER_ACCOUNT, 100);
      const previousBalance = await colony.balanceOf.call(MAIN_ACCOUNT);
      try {
        await colony.transferFrom(MAIN_ACCOUNT, OTHER_ACCOUNT, previousBalance + 1, { gas: GAS_TO_SPEND });
      } catch(err) {
        testHelper.ifUsingTestRPC(err);
      }

      const balance = await colony.balanceOf.call(MAIN_ACCOUNT);
      assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
    });

    it('should fail if the value is equal to zero', async function () {
      await colony.generateTokensWei(TOTAL_SUPPLY);
      await colony.approve(OTHER_ACCOUNT, 100);
      const previousBalance = await colony.balanceOf.call(MAIN_ACCOUNT);
      try {
        await colony.transferFrom(MAIN_ACCOUNT, OTHER_ACCOUNT, 0, { gas: GAS_TO_SPEND });
      } catch(err) {
        testHelper.ifUsingTestRPC(err);
      }

      const balance = await colony.balanceOf.call(MAIN_ACCOUNT);
      assert.equal(previousBalance.toNumber(), balance.toNumber(), 'sender balance was modified.');
    });

    it('should fail if the value is bigger than the upper limit', async function () {
      await colony.generateTokensWei(TOTAL_SUPPLY);
      await colony.approve(OTHER_ACCOUNT, 100);
      const previousBalance = await colony.balanceOf.call(MAIN_ACCOUNT);
      try {
        await colony.transferFrom(MAIN_ACCOUNT, OTHER_ACCOUNT, TOTAL_SUPPLY + 1, { gas: GAS_TO_SPEND });
      } catch(err) {
        testHelper.ifUsingTestRPC(err);
      }

      const balance = await colony.balanceOf.call(MAIN_ACCOUNT);
      assert.equal(previousBalance.toNumber(), balance.toNumber(), 'sender balance was modified.');
    });

    it('should fail if the sender does not have a high enough allowance', async function () {
      await colony.generateTokensWei(TOTAL_SUPPLY);
      await colony.approve(OTHER_ACCOUNT, 100);
      const previousBalance = await colony.balanceOf.call(MAIN_ACCOUNT);
      try {
        await colony.transferFrom(MAIN_ACCOUNT, OTHER_ACCOUNT, 500, { gas: GAS_TO_SPEND });
      } catch(err) {
        testHelper.ifUsingTestRPC(err);
      }
      const balance = await colony.balanceOf.call(MAIN_ACCOUNT);
      assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
    });
  });

  describe('when approving allowance to a third party', () => {
    it('should set the allowed value to be equal to the approved value', async function () {
      await colony.generateTokensWei(TOTAL_SUPPLY);
      await colony.approve(OTHER_ACCOUNT, 100);
      const allowance = await colony.allowance.call(MAIN_ACCOUNT, OTHER_ACCOUNT);
      assert.equal(allowance.toNumber(), 100, 'amount approved is incorrect.');
    });

    it('should fail if ETHER is sent', async function () {
      await colony.generateTokensWei(TOTAL_SUPPLY);
      try {
        await colony.approve(OTHER_ACCOUNT, 100, { value: 1, gas: GAS_TO_SPEND });
      } catch(err) {
        testHelper.checkErrorNonPayableFunction(err);
      }
    });

    it('should fail if the value is bigger than upper limit', async function () {
      await colony.generateTokensWei(TOTAL_SUPPLY);
      await colony.approve(OTHER_ACCOUNT, TOTAL_SUPPLY + 1);
      const allowance = await colony.allowance(MAIN_ACCOUNT, OTHER_ACCOUNT);
      assert.equal(0, allowance, 'approve of too many tokens succeeded when it should have failed');
    });

    it('should let a sender update the allowed value of another user', async function () {
      await colony.generateTokensWei(TOTAL_SUPPLY);
      await colony.approve(OTHER_ACCOUNT, 100);
      let allowance = await colony.allowance.call(MAIN_ACCOUNT, OTHER_ACCOUNT);
      assert.equal(allowance.toNumber(), 100, 'amount approved is incorrect.');
      await colony.approve(OTHER_ACCOUNT, 50);
      allowance = await colony.allowance.call(MAIN_ACCOUNT, OTHER_ACCOUNT);
      assert.equal(allowance.toNumber(), 50, 'amount approved was not updated correctly.');
    });
  });

  describe('when generating tokens', () => {
    it('should let the total supply be increased', async function () {
      await colony.generateTokensWei(TOTAL_SUPPLY);
      await colony.generateTokensWei(100);
      const totalSupply = await colony.totalSupply.call();
      assert.equal(TOTAL_SUPPLY + 100, totalSupply.toNumber(), 'total supply is incorrect.');
    });

    it('should increase the colony balance by the same amount of generated tokens', async function () {
      await colony.generateTokensWei(TOTAL_SUPPLY);
      const previousBalance = await colony.balanceOf.call(colony.address);
      await colony.generateTokensWei(100);
      const balance = await colony.balanceOf.call(colony.address);
      assert.equal(TOTAL_SUPPLY + 100, balance.toNumber(), 'owners balance is incorrect.');
    });

    it('should fail if ETHER is sent', async function () {
      try {
        await colony.generateTokensWei(OTHER_ACCOUNT, { value: 1, gas: GAS_TO_SPEND });
      } catch(err) {
        testHelper.checkErrorNonPayableFunction(err);
      }
    });

    it('should fail if the value is equal to zero', async function () {
      let tx;
      try {
        tx = await colony.generateTokensWei(0, { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if the value causes uint to wrap', async function () {
      await colony.generateTokensWei(TOTAL_SUPPLY);
      let tx;
      try {
        tx = await colony.generateTokensWei(web3.toBigNumber('115792089237316195423570985008687907853269984665640564039457584007913129639935'), { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });
  });

  describe('when setting default ledger attributes', () => {
    it('should be able to define a symbol', async function () {
      await colony.setTokensSymbol('CLNY');
      const symbol = await eternalStorage.getBytesValue.call(sha3('TokenSymbol'));
      assert.equal(testHelper.hexToUtf8(symbol), 'CLNY', 'tokens symbol is incorrect');
    });

    it('should be able to define a title', async function () {
      await colony.setTokensTitle('Colony Network Token');
      const title = await eternalStorage.getBytesValue.call(sha3('TokenTitle'));
      assert.equal(testHelper.hexToUtf8(title), 'Colony Network Token', 'tokens title is incorrect');
    });
  });
});
