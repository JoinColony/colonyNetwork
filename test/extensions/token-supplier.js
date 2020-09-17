/* globals artifacts */

import BN from "bn.js";
import chai from "chai";
import bnChai from "bn-chai";

import { WAD, SECONDS_PER_DAY } from "../../helpers/constants";
import { checkErrorRevert, currentBlockTime, makeTxAtTimestamp } from "../../helpers/test-helper";
import { setupColonyNetwork, setupRandomColony } from "../../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const TokenSupplier = artifacts.require("TokenSupplier");

contract("Token Supplier", (accounts) => {
  let colony;
  let token;
  let colonyNetwork;

  let tokenSupplier;

  const USER0 = accounts[0];
  const USER1 = accounts[1];

  const SUPPLY_CEILING = WAD.muln(10);

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));

    tokenSupplier = await TokenSupplier.new(colony.address);
    await colony.setRootRole(tokenSupplier.address, true);
  });

  describe("managing the extension", async () => {
    it("can initialise", async () => {
      await tokenSupplier.initialise(SUPPLY_CEILING, WAD, { from: USER0 });
    });

    it("cannot initialise twice", async () => {
      await tokenSupplier.initialise(SUPPLY_CEILING, WAD, { from: USER0 });
      await checkErrorRevert(tokenSupplier.initialise(SUPPLY_CEILING, WAD), "token-supplier-already-initialised");
    });

    it("cannot initialise if not owner", async () => {
      await checkErrorRevert(tokenSupplier.initialise(SUPPLY_CEILING, WAD, { from: USER1 }), "ds-auth-unauthorized");
    });

    it("can update the tokenSupplyCeiling if root", async () => {
      await tokenSupplier.setTokenSupplyCeiling(SUPPLY_CEILING.muln(2), { from: USER0 });

      const tokenSupplyCeiling = await tokenSupplier.tokenSupplyCeiling();
      expect(tokenSupplyCeiling).to.eq.BN(SUPPLY_CEILING.muln(2));

      await checkErrorRevert(tokenSupplier.setTokenSupplyCeiling(SUPPLY_CEILING, { from: USER1 }), "token-supplier-not-root");
    });

    it("can update the tokenIssuanceRate if root", async () => {
      await tokenSupplier.setTokenIssuanceRate(WAD.muln(2), { from: USER0 });

      const tokenIssuanceRate = await tokenSupplier.tokenIssuanceRate();
      expect(tokenIssuanceRate).to.eq.BN(WAD.muln(2));

      await checkErrorRevert(tokenSupplier.setTokenIssuanceRate(WAD, { from: USER1 }), "token-supplier-not-root");
    });
  });

  describe("issuing tokens", async () => {
    beforeEach(async () => {
      await tokenSupplier.initialise(SUPPLY_CEILING, WAD, { from: USER0 });
    });

    it("can claim tokenIssuanceRate tokens per day", async () => {
      const balancePre = await token.balanceOf(colony.address);

      let time = await currentBlockTime();
      time = new BN(time).addn(SECONDS_PER_DAY);

      await makeTxAtTimestamp(tokenSupplier.issueTokens, [], time.toNumber(), this);

      const balancePost = await token.balanceOf(colony.address);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD);

      const tokenSupply = await tokenSupplier.tokenSupply();
      expect(tokenSupply).to.eq.BN(WAD);
    });

    it("can claim up to the tokenSupplyCeiling", async () => {
      const balancePre = await token.balanceOf(colony.address);

      let time = await currentBlockTime();
      time = new BN(time).addn(SECONDS_PER_DAY * 10);

      await makeTxAtTimestamp(tokenSupplier.issueTokens, [], time.toNumber(), this);

      const balancePost = await token.balanceOf(colony.address);
      expect(balancePost.sub(balancePre)).to.eq.BN(SUPPLY_CEILING);

      const tokenSupply = await tokenSupplier.tokenSupply();
      expect(tokenSupply).to.eq.BN(SUPPLY_CEILING);

      await checkErrorRevert(tokenSupplier.issueTokens(), "token-supplier-nothing-to-issue");
    });
  });
});
