/* globals artifacts */
import { getTokenArgs, expectEvent, checkErrorAssert, checkErrorRevert, web3GetBalance, checkErrorNonPayableFunction } from "../helpers/test-helper";
import { setupUpgradableToken } from "../helpers/upgradable-contracts";

const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");
const Token = artifacts.require("Token");

contract("Token", accounts => {
  const COINBASE_ACCOUNT = accounts[0];
  const ACCOUNT_TWO = accounts[1];
  const ACCOUNT_THREE = accounts[2];

  let etherRouter;
  let resolver;
  let token;
  let etherRouterToken;

  before(async () => {
    const tokenArgs = getTokenArgs();
    token = await Token.new(...tokenArgs);
    resolver = await Resolver.new();
  });

  beforeEach(async () => {
    etherRouter = await EtherRouter.new();
    await setupUpgradableToken(token, resolver, etherRouter);
    etherRouterToken = await Token.at(etherRouter.address);
  });

  describe("when working with ERC20 functions", () => {
    beforeEach("mint 1500000 tokens", async () => {
      await etherRouterToken.mint(1500000);
    });

    it("should be able to get total supply", async () => {
      const total = await etherRouterToken.totalSupply.call();
      assert.equal(1500000, total.toNumber());
    });

    it("should be able to get token balance", async () => {
      const balance = await etherRouterToken.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(1500000, balance.toNumber());
    });

    it("should be able to get allowance for address", async () => {
      await etherRouterToken.approve(ACCOUNT_TWO, 200000);
      const allowance = await etherRouterToken.allowance.call(COINBASE_ACCOUNT, ACCOUNT_TWO);
      assert.equal(200000, allowance.toNumber());
    });

    it("should be able to transfer tokens from own address", async () => {
      const success = await etherRouterToken.transfer.call(ACCOUNT_TWO, 300000);
      assert.equal(true, success);

      await expectEvent(etherRouterToken.transfer(ACCOUNT_TWO, 300000), "Transfer");
      const balanceAccount1 = await etherRouterToken.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(1200000, balanceAccount1.toNumber());
      const balanceAccount2 = await etherRouterToken.balanceOf.call(ACCOUNT_TWO);
      assert.equal(300000, balanceAccount2.toNumber());
    });

    it("should NOT be able to transfer more tokens than they have", async () => {
      await checkErrorAssert(etherRouterToken.transfer(ACCOUNT_TWO, 1500001));
      const balanceAccount2 = await etherRouterToken.balanceOf.call(ACCOUNT_TWO);
      assert.equal(0, balanceAccount2.toNumber());
    });

    it("should be able to transfer pre-approved tokens from address different than own", async () => {
      await etherRouterToken.approve(ACCOUNT_TWO, 300000);
      const success = await etherRouterToken.transferFrom.call(COINBASE_ACCOUNT, ACCOUNT_TWO, 300000, { from: ACCOUNT_TWO });
      assert.equal(true, success);

      await expectEvent(etherRouterToken.transferFrom(COINBASE_ACCOUNT, ACCOUNT_TWO, 300000, { from: ACCOUNT_TWO }), "Transfer");
      const balanceAccount1 = await etherRouterToken.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(1200000, balanceAccount1.toNumber());
      const balanceAccount2 = await etherRouterToken.balanceOf.call(ACCOUNT_TWO);
      assert.equal(300000, balanceAccount2.toNumber());
      const allowance = await etherRouterToken.allowance.call(COINBASE_ACCOUNT, ACCOUNT_TWO);
      assert.equal(0, allowance.toNumber());
    });

    it("should NOT be able to transfer tokens from another address if NOT pre-approved", async () => {
      await checkErrorAssert(etherRouterToken.transferFrom(COINBASE_ACCOUNT, ACCOUNT_TWO, 300000, { from: ACCOUNT_TWO }));
      const balanceAccount2 = await etherRouterToken.balanceOf.call(ACCOUNT_TWO);
      assert.equal(0, balanceAccount2.toNumber());
    });

    it("should NOT be able to transfer from another address more tokens than pre-approved", async () => {
      await etherRouterToken.approve(ACCOUNT_TWO, 300000);
      await checkErrorAssert(etherRouterToken.transferFrom(COINBASE_ACCOUNT, ACCOUNT_TWO, 300001, { from: ACCOUNT_TWO }));

      const balanceAccount2 = await etherRouterToken.balanceOf.call(ACCOUNT_TWO);
      assert.equal(0, balanceAccount2.toNumber());
    });

    it("should NOT be able to transfer from another address more tokens than the source balance", async () => {
      await etherRouterToken.approve(ACCOUNT_TWO, 300000);
      await etherRouterToken.transfer(ACCOUNT_THREE, 1500000);

      await checkErrorAssert(etherRouterToken.transferFrom(COINBASE_ACCOUNT, ACCOUNT_TWO, 300000, { from: ACCOUNT_TWO }));
      const balanceAccount2 = await etherRouterToken.balanceOf.call(ACCOUNT_TWO);
      assert.equal(0, balanceAccount2.toNumber());
    });

    it("should be able to approve token transfer for other accounts", async () => {
      const success = await etherRouterToken.approve.call(ACCOUNT_TWO, 200000);
      assert.equal(true, success);

      await expectEvent(etherRouterToken.approve(ACCOUNT_TWO, 200000), "Approval");
      const allowance = await etherRouterToken.allowance.call(COINBASE_ACCOUNT, ACCOUNT_TWO);
      assert.equal(200000, allowance.toNumber());
    });
  });

  describe("when working with additional functions", () => {
    it("should be able to mint new tokens, when called by the Token owner", async () => {
      await etherRouterToken.mint(1500000, { from: COINBASE_ACCOUNT });
      let totalSupply = await etherRouterToken.totalSupply.call();
      assert.equal(1500000, totalSupply.toNumber());

      let balance = await etherRouterToken.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(1500000, balance.toNumber());

      // Mint some more tokens
      await etherRouterToken.mint(1);
      totalSupply = await etherRouterToken.totalSupply.call();
      assert.equal(1500001, totalSupply.toNumber());

      balance = await etherRouterToken.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(1500001, balance.toNumber());
    });

    it("should NOT be able to mint new tokens, when called by anyone NOT the Token owner", async () => {
      await checkErrorRevert(etherRouterToken.mint(1500000, { from: ACCOUNT_THREE }));
      const totalSupply = await etherRouterToken.totalSupply.call();
      assert.equal(0, totalSupply.toNumber());
    });
  });

  describe("when working with ether transfers", () => {
    it("should NOT accept eth", async () => {
      await checkErrorRevert(token.send(2));
      const tokenBalance = await web3GetBalance(etherRouterToken.address);
      assert.equal(0, tokenBalance.toNumber());
    });

    it.skip("should NOT accept eth via etherRouter transfer", async () => {
      await checkErrorRevert(await etherRouterToken.send(2));
      const tokenBalance = await web3GetBalance(etherRouterToken.address);
      assert.equal(0, tokenBalance.toNumber());
    });

    it("should NOT accept eth via etherRouter call to function", async () => {
      try {
        await etherRouterToken.mint(200, { value: 2 });
      } catch (err) {
        checkErrorNonPayableFunction(err);
      }

      const totalSupply = await etherRouterToken.totalSupply.call();
      assert.equal(0, totalSupply.toNumber());

      const tokenBalance = await web3GetBalance(etherRouterToken.address);
      assert.equal(0, tokenBalance.toNumber());
    });
  });
});
