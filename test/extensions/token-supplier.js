/* globals artifacts */

import BN from "bn.js";
import chai from "chai";
import bnChai from "bn-chai";
import { soliditySha3 } from "web3-utils";

import { WAD, SECONDS_PER_DAY } from "../../helpers/constants";
import { checkErrorRevert, currentBlockTime, makeTxAtTimestamp } from "../../helpers/test-helper";
import { setupColonyNetwork, setupRandomColony, setupMetaColonyWithLockedCLNYToken } from "../../helpers/test-data-generator";
import { setupEtherRouter } from "../../helpers/upgradable-contracts";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const TokenSupplier = artifacts.require("TokenSupplier");
const Resolver = artifacts.require("Resolver");

const TOKEN_SUPPLIER = soliditySha3("TokenSupplier");

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
    const { metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork);

    const tokenSupplierImplementation = await TokenSupplier.new();
    const resolver = await Resolver.new();
    await setupEtherRouter("TokenSupplier", { TokenSupplier: tokenSupplierImplementation.address }, resolver);
    await metaColony.addExtensionToNetwork(TOKEN_SUPPLIER, resolver.address);
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.installExtension(TOKEN_SUPPLIER, 1);

    const tokenSupplierAddress = await colonyNetwork.getExtensionInstallation(TOKEN_SUPPLIER, colony.address);
    tokenSupplier = await TokenSupplier.at(tokenSupplierAddress);

    await colony.setRootRole(tokenSupplier.address, true);
  });

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      tokenSupplier = await TokenSupplier.new();
      await tokenSupplier.install(colony.address);

      await checkErrorRevert(tokenSupplier.install(colony.address), "extension-already-installed");

      await tokenSupplier.finishUpgrade();
      await tokenSupplier.deprecate(true);
      await tokenSupplier.uninstall();
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(TOKEN_SUPPLIER, 1, { from: USER0 });

      await checkErrorRevert(colony.installExtension(TOKEN_SUPPLIER, 1, { from: USER0 }), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(TOKEN_SUPPLIER, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(TOKEN_SUPPLIER, { from: USER0 });
    });

    it("can initialise", async () => {
      await tokenSupplier.initialise(SUPPLY_CEILING, WAD, { from: USER0 });
    });

    it("cannot initialise twice", async () => {
      await tokenSupplier.initialise(SUPPLY_CEILING, WAD, { from: USER0 });
      await checkErrorRevert(tokenSupplier.initialise(SUPPLY_CEILING, WAD), "token-supplier-already-initialised");
    });

    it("cannot initialise if not owner", async () => {
      await checkErrorRevert(tokenSupplier.initialise(SUPPLY_CEILING, WAD, { from: USER1 }), "token-supplier-not-root");
    });

    it("cannot issues tokens if not initialised", async () => {
      await checkErrorRevert(tokenSupplier.issueTokens(), "token-supplier-not-initialised");
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
