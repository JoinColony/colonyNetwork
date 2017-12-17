/* globals artifacts */

const EtherRouter = artifacts.require('EtherRouter');
const Resolver = artifacts.require('Resolver');
const Token = artifacts.require('Token');

import testHelper from '../helpers/test-helper';
import upgradableContracts from '../helpers/upgradable-contracts';

contract('Token', function (accounts) {
  const COINBASE_ACCOUNT = accounts[0];
  const ACCOUNT_TWO = accounts[1];
  const ACCOUNT_THREE = accounts[2];

  let etherRouter;
  let resolver;
  let token;
  let etherRouterToken;

  before(async function () {
    token = await Token.new();
    resolver = await Resolver.new();
  });

  beforeEach(async function () {
    etherRouter = await EtherRouter.new();
    await upgradableContracts.setupUpgradableToken(token, resolver, etherRouter);
    etherRouterToken = await Token.at(etherRouter.address);
  });

  describe.skip('when working with ERC20 properties', function () {
    it('token `symbol` property is correct', async() => {
      const tokenSymbol = await etherRouterToken.symbol();
      assert.equal(web3.toUtf8(tokenSymbol), 'CLNY');
    });

    it('token `decimals` property is correct', async() => {
      const tokenDecimals = await etherRouterToken.decimals.call();
      assert.equal(tokenDecimals.toString(), '18');
    });

    it('token `name` property is correct', async() => {
      const tokenName = await etherRouterToken.name.call();
      assert.equal(web3.toUtf8(tokenName), 'Colony Network Token');
    });
  });

  describe('when working with ERC20 functions', function () {
    beforeEach('mint 1500000 tokens', async() => {
      await etherRouterToken.mint(1500000);
    });

    it('should be able to get total supply', async function () {
      var total = await etherRouterToken.totalSupply.call();
      assert.equal(1500000, total.toNumber());
    });

    it('should be able to get token balance', async function () {
      var balance = await etherRouterToken.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(1500000, balance.toNumber());
    });

    it('should be able to get allowance for address', async function () {
      await etherRouterToken.approve(ACCOUNT_TWO, 200000);
      var allowance = await etherRouterToken.allowance.call(COINBASE_ACCOUNT, ACCOUNT_TWO);
      assert.equal(200000, allowance.toNumber());
    });

    it('should be able to transfer tokens from own address', async function () {
      const success = await etherRouterToken.transfer.call(ACCOUNT_TWO, 300000);
      assert.equal(true, success);

      testHelper.expectEvent(etherRouterToken.transfer(ACCOUNT_TWO, 300000), 'Transfer');
      const balanceAccount1 = await etherRouterToken.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(1200000, balanceAccount1.toNumber());
      const balanceAccount2 = await etherRouterToken.balanceOf.call(ACCOUNT_TWO);
      assert.equal(300000, balanceAccount2.toNumber());
    });

    it('should NOT be able to transfer more tokens than they have', async function () {
      await testHelper.checkErrorAssert(etherRouterToken.transfer(ACCOUNT_TWO, 1500001));
      const balanceAccount2 = await etherRouterToken.balanceOf.call(ACCOUNT_TWO);
      assert.equal(0, balanceAccount2.toNumber());
    });

    it('should be able to transfer pre-approved tokens from address different than own', async function () {
      await etherRouterToken.approve(ACCOUNT_TWO, 300000);
      const success = await etherRouterToken.transferFrom.call(COINBASE_ACCOUNT, ACCOUNT_TWO, 300000, { from: ACCOUNT_TWO });
      assert.equal(true, success);

      testHelper.expectEvent(etherRouterToken.transferFrom(COINBASE_ACCOUNT, ACCOUNT_TWO, 300000, { from: ACCOUNT_TWO }), 'Transfer');
      const balanceAccount1 = await etherRouterToken.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(1200000, balanceAccount1.toNumber());
      const balanceAccount2 = await etherRouterToken.balanceOf.call(ACCOUNT_TWO);
      assert.equal(300000, balanceAccount2.toNumber());
      var allowance = await etherRouterToken.allowance.call(COINBASE_ACCOUNT, ACCOUNT_TWO);
      assert.equal(0, allowance.toNumber());
    });

    it('should NOT be able to transfer tokens from another address if NOT pre-approved', async function () {
      await testHelper.checkErrorAssert(etherRouterToken.transferFrom(COINBASE_ACCOUNT, ACCOUNT_TWO, 300000, { from: ACCOUNT_TWO }));
      const balanceAccount2 = await etherRouterToken.balanceOf.call(ACCOUNT_TWO);
      assert.equal(0, balanceAccount2.toNumber());
    });

    it('should NOT be able to transfer from another address more tokens than pre-approved', async function () {
      await etherRouterToken.approve(ACCOUNT_TWO, 300000);
      await testHelper.checkErrorAssert(etherRouterToken.transferFrom(COINBASE_ACCOUNT, ACCOUNT_TWO, 300001, { from: ACCOUNT_TWO }));
      
      const balanceAccount2 = await etherRouterToken.balanceOf.call(ACCOUNT_TWO);
      assert.equal(0, balanceAccount2.toNumber());
    });

    it('should NOT be able to transfer from another address more tokens than the source balance', async function () {
      await etherRouterToken.approve(ACCOUNT_TWO, 300000);
      await etherRouterToken.transfer(ACCOUNT_THREE, 1500000);

      await testHelper.checkErrorAssert(etherRouterToken.transferFrom(COINBASE_ACCOUNT, ACCOUNT_TWO, 300000, { from: ACCOUNT_TWO }));
      const balanceAccount2 = await etherRouterToken.balanceOf.call(ACCOUNT_TWO);
      assert.equal(0, balanceAccount2.toNumber());
    });

    it('should be able to approve token transfer for other accounts', async function () {
      const success = await etherRouterToken.approve.call(ACCOUNT_TWO, 200000);
      assert.equal(true, success);

      testHelper.expectEvent(etherRouterToken.approve(ACCOUNT_TWO, 200000), 'Approval');
      var allowance = await etherRouterToken.allowance.call(COINBASE_ACCOUNT, ACCOUNT_TWO);
      assert.equal(200000, allowance.toNumber());
    });
  });

  describe('when working with additional functions', function () {
    it('should be able to mint new tokens, when called by the Token owner', async function () {
      await etherRouterToken.mint(1500000, { from: COINBASE_ACCOUNT });
      var totalSupply = await etherRouterToken.totalSupply.call();
      assert.equal(1500000, totalSupply.toNumber());

      var balance = await etherRouterToken.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(1500000, balance.toNumber());

      // Mint some more tokens
      await etherRouterToken.mint(1);
      totalSupply = await etherRouterToken.totalSupply.call();
      assert.equal(1500001, totalSupply.toNumber());

      balance = await etherRouterToken.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(1500001, balance.toNumber());
    });

    it('should NOT be able to mint new tokens, when called by anyone NOT the Token owner', async function () {
      await testHelper.checkErrorRevert(etherRouterToken.mint(1500000, { from: ACCOUNT_THREE }));
      var totalSupply = await etherRouterToken.totalSupply.call();
      assert.equal(0, totalSupply.toNumber());
    });
  });

  describe('when working with ether transfers', function () {
    it('should NOT accept eth', async function () {
      await testHelper.checkErrorRevert(token.send(2));
      let tokenBalance = await testHelper.web3GetBalance(etherRouterToken.address);
      assert.equal(0, tokenBalance.toNumber());
    });

    it.skip('should NOT accept eth via etherRouter transfer', async function () {
      await testHelper.checkErrorRevert(await etherRouterToken.send(2));
      let tokenBalance = await testHelper.web3GetBalance(etherRouterToken.address);
      assert.equal(0, tokenBalance.toNumber());
    });

    it('should NOT accept eth via etherRouter call to function', async function () {
      var tx;
      try {
        tx = await etherRouterToken.mint(200, { value: 2 });
      } catch(err) {
        tx = testHelper.checkErrorNonPayableFunction(err);
      }

      var totalSupply = await etherRouterToken.totalSupply.call();
      assert.equal(0, totalSupply.toNumber());

      let tokenBalance = await testHelper.web3GetBalance(etherRouterToken.address);
      assert.equal(0, tokenBalance.toNumber());
    });
  });
});
