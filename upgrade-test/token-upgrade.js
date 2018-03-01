/* globals artifacts */

import { setupUpgradableToken } from "../helpers/upgradable-contracts";
import { getTokenArgs } from "../helpers/test-helper";

const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");
const Token = artifacts.require("Token");
const UpdatedToken = artifacts.require("UpdatedToken");

contract("Token contract upgrade", accounts => {
  const COINBASE_ACCOUNT = accounts[0];
  const ACCOUNT_TWO = accounts[1];
  const ACCOUNT_THREE = accounts[2];

  let tokenContract;
  let token;
  let resolver;
  let etherRouter;
  let updatedToken;

  beforeEach(async () => {
    const tokenArgs = getTokenArgs();
    tokenContract = await Token.new(...tokenArgs);
    resolver = await Resolver.new();
    // Instantiate a new EtherRouter to clear the data
    etherRouter = await EtherRouter.new();
    await setupUpgradableToken(tokenContract, resolver, etherRouter);
    token = await Token.at(etherRouter.address);
  });

  describe("when upgrading Token contract", () => {
    beforeEach("setup the Token contract with some data", async () => {
      await token.mint(100);
      const total = await token.totalSupply.call();
      assert.equal(100, total.toNumber());

      await token.transfer(ACCOUNT_TWO, 20);
      await token.transfer(ACCOUNT_THREE, 30);
      await token.approve(ACCOUNT_TWO, 15, { from: COINBASE_ACCOUNT });
      await token.approve(ACCOUNT_THREE, 5, { from: COINBASE_ACCOUNT });
      await token.approve(ACCOUNT_THREE, 10, { from: ACCOUNT_TWO });

      // Upgrade Token
      const tokenArgs = getTokenArgs();
      const updatedTokenContract = await UpdatedToken.new(...tokenArgs);
      await setupUpgradableToken(updatedTokenContract, resolver, etherRouter);
      await resolver.register("isUpdated()", updatedTokenContract.address, 32);
      updatedToken = await UpdatedToken.at(etherRouter.address);
    });

    it("should be able to lookup newly registered function on Token", async () => {
      const y = await updatedToken.isUpdated.call();
      assert.isTrue(y);
    });

    it("should return correct total supply of tokens", async () => {
      const updatedTokenTotal = await updatedToken.totalSupply.call();
      assert.equal(100, updatedTokenTotal.toNumber());
    });

    it("should return correct token balances", async () => {
      const totalAccount1 = await updatedToken.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(50, totalAccount1.toNumber());
      const totalAccount2 = await updatedToken.balanceOf.call(ACCOUNT_TWO);
      assert.equal(20, totalAccount2.toNumber());
      const totalAccount3 = await updatedToken.balanceOf.call(ACCOUNT_THREE);
      assert.equal(30, totalAccount3.toNumber());
    });

    it("should return correct token allowances", async () => {
      const allowance1 = await updatedToken.allowance.call(COINBASE_ACCOUNT, ACCOUNT_TWO);
      assert.equal(15, allowance1.toNumber());
      const allowance2 = await updatedToken.allowance.call(COINBASE_ACCOUNT, ACCOUNT_THREE);
      assert.equal(5, allowance2.toNumber());
      const allowance3 = await updatedToken.allowance.call(ACCOUNT_TWO, ACCOUNT_THREE);
      assert.equal(10, allowance3.toNumber());
    });
  });
});
