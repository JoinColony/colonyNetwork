/* globals artifacts */

const EtherRouter = artifacts.require('EtherRouter');
const Resolver = artifacts.require('Resolver');
const Token = artifacts.require('Token');

import testHelper from '../helpers/test-helper';

contract('Token', function (accounts) {
  const COINBASE_ACCOUNT = accounts[0];
  const ACCOUNT_TWO = accounts[1];
  const ACCOUNT_THREE = accounts[2];

  let etherRouter;
  let resolver;
  let token;
  let tokenDeployed;

  before(async function () {
    tokenDeployed = await Token.deployed();
    resolver = await Resolver.new(tokenDeployed.address);
  });

  beforeEach(async function () {
    etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolver.address);
    token = await Token.at(etherRouter.address);
    console.log()
  });

  describe('when working with ERC20 properties', function () {
    it('token `symbol` property is correct', async() => {
      const tokenSymbol = await token.symbol();
      assert.equal(web3.toUtf8(tokenSymbol), 'CLNY');
    });

    it('token `decimals` property is correct', async() => {
      const tokenDecimals = await token.decimals.call();
      assert.equal(tokenDecimals.toString(), '18');
    });

    it('token `name` property is correct', async() => {
      const tokenName = await token.name.call();
      assert.equal(web3.toUtf8(tokenName), 'Colony Network Token');
    });
  });

  describe('when working with ERC20 functions', function () {
    beforeEach('mint 1500000 tokens', async() => {
      await token.mint(1500000);
    });

    it('should be able to get total supply', async function () {
      var total = await token.totalSupply.call();
      assert.equal(1500000, total.toNumber());
    });

    it('should be able to get token balance', async function () {
      var balance = await token.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(1500000, balance.toNumber());
    });

    it('should be able to get allowance for address', async function () {
      await token.approve(ACCOUNT_TWO, 200000);
      var allowance = await token.allowance.call(COINBASE_ACCOUNT, ACCOUNT_TWO);
      assert.equal(200000, allowance.toNumber());
    });

    it('should be able to transfer tokens from own address', async function () {
      const success = await token.transfer.call(ACCOUNT_TWO, 300000);
      assert.equal(true, success);

      var tx = await token.transfer(ACCOUNT_TWO, 300000);
      assert.equal(tx.logs[0].event, 'Transfer');
      const balanceAccount1 = await token.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(1200000, balanceAccount1.toNumber());
      const balanceAccount2 = await token.balanceOf.call(ACCOUNT_TWO);
      assert.equal(300000, balanceAccount2.toNumber());
    });

    it('should NOT be able to transfer more tokens than they have', async function () {
      try {
        await token.transfer(ACCOUNT_TWO, 1500001);
      } catch (err) {
        testHelper.ifUsingTestRPC(err);
      }

      const balanceAccount2 = await token.balanceOf.call(ACCOUNT_TWO);
      assert.equal(0, balanceAccount2.toNumber());
    });

    it('should be able to transfer pre-approved tokens from address different than own', async function () {
      await token.approve(ACCOUNT_TWO, 300000);
      const success = await token.transferFrom.call(COINBASE_ACCOUNT, ACCOUNT_TWO, 300000, { from: ACCOUNT_TWO });
      assert.equal(true, success);

      var tx = await token.transferFrom(COINBASE_ACCOUNT, ACCOUNT_TWO, 300000, { from: ACCOUNT_TWO });
      assert.equal(tx.logs[0].event, 'Transfer');
      const balanceAccount1 = await token.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(1200000, balanceAccount1.toNumber());
      const balanceAccount2 = await token.balanceOf.call(ACCOUNT_TWO);
      assert.equal(300000, balanceAccount2.toNumber());
      var allowance = await token.allowance.call(COINBASE_ACCOUNT, ACCOUNT_TWO);
      assert.equal(0, allowance.toNumber());
    });

    it('should NOT be able to transfer tokens from another address if NOT pre-approved', async function () {
      try {
        await token.transferFrom.call(COINBASE_ACCOUNT, ACCOUNT_TWO, 300000, { from: ACCOUNT_TWO });
      } catch(err) {
        testHelper.ifUsingTestRPC(err);
      }
      const balanceAccount2 = await token.balanceOf.call(ACCOUNT_TWO);
      assert.equal(0, balanceAccount2.toNumber());
    });

    it('should NOT be able to transfer from another address more tokens than pre-approved', async function () {
      await token.approve(ACCOUNT_TWO, 300000);

      try {
        await token.transferFrom.call(COINBASE_ACCOUNT, ACCOUNT_TWO, 300001, { from: ACCOUNT_TWO });
      } catch(err) {
        testHelper.ifUsingTestRPC(err);
      }
      const balanceAccount2 = await token.balanceOf.call(ACCOUNT_TWO);
      assert.equal(0, balanceAccount2.toNumber());
    });

    it('should NOT be able to transfer from another address more tokens than the source balance', async function () {
      await token.approve(ACCOUNT_TWO, 300000);
      await token.transfer(ACCOUNT_THREE, 1500000);

      try {
        await token.transferFrom.call(COINBASE_ACCOUNT, ACCOUNT_TWO, 300000, { from: ACCOUNT_TWO });
      } catch(err) {
        testHelper.ifUsingTestRPC(err);
      }
      const balanceAccount2 = await token.balanceOf.call(ACCOUNT_TWO);
      assert.equal(0, balanceAccount2.toNumber());
    });

    it('should be able to approve token transfer for other accounts', async function () {
      const success = await token.approve.call(ACCOUNT_TWO, 200000);
      assert.equal(true, success);

      const tx = await token.approve(ACCOUNT_TWO, 200000);
      assert.equal(tx.logs[0].event, 'Approval');

      var allowance = await token.allowance.call(COINBASE_ACCOUNT, ACCOUNT_TWO);
      assert.equal(200000, allowance.toNumber());
    });
  });

  describe('when working with additional functions', function () {
    it('should be able to mint new tokens, when called by the Token owner', async function () {
      await token.mint(1500000, { from: COINBASE_ACCOUNT });
      var totalSupply = await token.totalSupply.call();
      assert.equal(1500000, totalSupply.toNumber());

      var balance = await token.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(1500000, balance.toNumber());

      // Mint some more tokens
      await token.mint(1);
      totalSupply = await token.totalSupply.call();
      assert.equal(1500001, totalSupply.toNumber());

      balance = await token.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(1500001, balance.toNumber());
    });

    it('should NOT be able to mint new tokens, when called by anyone NOT the Token owner', async function () {
      try {
        await token.mint(1500000, { from: ACCOUNT_THREE });
      } catch(err) {
        testHelper.ifUsingTestRPC(err);
      }

      var totalSupply = await token.totalSupply.call();
      assert.equal(0, totalSupply.toNumber());
    });
  });
});
