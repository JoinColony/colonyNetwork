/* globals artifacts */

import BN from "bn.js";
import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";

import { UINT256_MAX, WAD, SECONDS_PER_DAY } from "../../helpers/constants";
import { setupColonyNetwork, setupRandomColony, setupMetaColonyWithLockedCLNYToken } from "../../helpers/test-data-generator";
import { setupEtherRouter } from "../../helpers/upgradable-contracts";

import {
  checkErrorRevert,
  currentBlockTime,
  makeTxAtTimestamp,
  getBlockTime,
  forwardTime,
  getExtensionAddressFromTx,
} from "../../helpers/test-helper";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const TokenSupplier = artifacts.require("TokenSupplier");
const ColonyExtension = artifacts.require("ColonyExtension");
const Resolver = artifacts.require("Resolver");

const TOKEN_SUPPLIER = soliditySha3("TokenSupplier");

contract("Token Supplier", (accounts) => {
  let colony;
  let token;
  let colonyNetwork;

  let tokenSupplier;
  let tokenSupplierVersion;

  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const USER2 = accounts[2];

  const SUPPLY_CEILING = WAD.muln(10);

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    const { metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork);

    const tokenSupplierImplementation = await TokenSupplier.new();
    const resolver = await Resolver.new();
    await setupEtherRouter("TokenSupplier", { TokenSupplier: tokenSupplierImplementation.address }, resolver);
    await metaColony.addExtensionToNetwork(TOKEN_SUPPLIER, resolver.address);
    const versionSig = await resolver.stringToSig("version()");
    const target = await resolver.lookup(versionSig);
    const extensionImplementation = await ColonyExtension.at(target);
    tokenSupplierVersion = await extensionImplementation.version();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.addDomain(1, UINT256_MAX, 1);

    const tx = await colony.installExtension(TOKEN_SUPPLIER, tokenSupplierVersion);
    const tokenSupplierAddress = getExtensionAddressFromTx(tx);
    tokenSupplier = await TokenSupplier.at(tokenSupplierAddress);

    await colony.setRootRole(tokenSupplier.address, true);
  });

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      tokenSupplier = await TokenSupplier.new();
      await tokenSupplier.install(colony.address);

      await checkErrorRevert(tokenSupplier.install(colony.address), "extension-already-installed");

      const capabilityRoles = await tokenSupplier.getCapabilityRoles("0x0");
      expect(capabilityRoles).to.equal(ethers.constants.HashZero);

      await tokenSupplier.finishUpgrade();
      await tokenSupplier.deprecate(true);
      await tokenSupplier.uninstall();
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      const tx = await colony.installExtension(TOKEN_SUPPLIER, tokenSupplierVersion, { from: USER0 });

      const tokenSupplierAddress = getExtensionAddressFromTx(tx);
      await checkErrorRevert(colony.methods["uninstallExtension(address)"](tokenSupplierAddress, { from: USER1 }), "ds-auth-unauthorized");

      await colony.methods["uninstallExtension(address)"](tokenSupplierAddress, { from: USER0 });
    });

    it("can initialise", async () => {
      await tokenSupplier.initialise(SUPPLY_CEILING, WAD);
    });

    it("cannot initialise twice", async () => {
      await tokenSupplier.initialise(SUPPLY_CEILING, WAD);
      await checkErrorRevert(tokenSupplier.initialise(SUPPLY_CEILING, WAD), "token-supplier-already-initialised");
    });

    it("cannot initialise if not owner", async () => {
      await checkErrorRevert(tokenSupplier.initialise(SUPPLY_CEILING, WAD, { from: USER1 }), "token-supplier-caller-not-root");
    });

    it("cannot initialise with ceiling smaller than totalSupply", async () => {
      token.mint(SUPPLY_CEILING.addn(1));

      await checkErrorRevert(tokenSupplier.initialise(SUPPLY_CEILING, WAD), "token-supplier-ceiling-too-low");
    });

    it("cannot issues tokens if not initialised", async () => {
      await checkErrorRevert(tokenSupplier.issueTokens(), "token-supplier-not-initialised");
    });

    it("can update the tokenSupplyCeiling if root", async () => {
      await tokenSupplier.initialise(SUPPLY_CEILING, WAD);

      await tokenSupplier.setTokenSupplyCeiling(SUPPLY_CEILING.muln(2));

      const tokenSupplyCeiling = await tokenSupplier.getTokenSupplyCeiling();
      expect(tokenSupplyCeiling).to.eq.BN(SUPPLY_CEILING.muln(2));

      await checkErrorRevert(tokenSupplier.setTokenSupplyCeiling(SUPPLY_CEILING, { from: USER1 }), "token-supplier-caller-not-root");
    });

    it("cannot update the tokenSupplyCeiling if less than totalSupply", async () => {
      await tokenSupplier.initialise(SUPPLY_CEILING, WAD);

      token.mint(SUPPLY_CEILING.muln(3));

      await checkErrorRevert(tokenSupplier.setTokenSupplyCeiling(SUPPLY_CEILING.muln(2)), "token-supplier-ceiling-too-low");
    });

    it("can update the tokenIssuanceRate if root", async () => {
      await tokenSupplier.initialise(SUPPLY_CEILING, WAD);

      await tokenSupplier.setTokenIssuanceRate(WAD.muln(2));

      const tokenIssuanceRate = await tokenSupplier.getTokenIssuanceRate();
      expect(tokenIssuanceRate).to.eq.BN(WAD.muln(2));

      await checkErrorRevert(tokenSupplier.setTokenIssuanceRate(WAD, { from: USER1 }), "token-supplier-caller-not-authorized");
    });

    it("can update the tokenIssuanceRate if root funding, by <=10% once every 4 weeks", async () => {
      await colony.setFundingRole(1, UINT256_MAX, USER1, 1, true);
      await colony.setFundingRole(1, 0, USER2, 2, true);

      await tokenSupplier.initialise(SUPPLY_CEILING, WAD);

      const smallChange = WAD.add(WAD.divn(10));
      const bigChange = WAD.add(WAD.divn(9));

      // Cannot change more than once in 4 weeks
      await checkErrorRevert(tokenSupplier.setTokenIssuanceRate(smallChange, { from: USER1 }), "token-supplier-caller-not-authorized");

      await forwardTime(SECONDS_PER_DAY * 28, this);

      // Cannot change more than 10%
      await checkErrorRevert(tokenSupplier.setTokenIssuanceRate(bigChange, { from: USER1 }), "token-supplier-caller-not-authorized");

      await tokenSupplier.setTokenIssuanceRate(smallChange, { from: USER1 });

      const tokenIssuanceRate = await tokenSupplier.getTokenIssuanceRate();
      expect(tokenIssuanceRate).to.eq.BN(smallChange);

      await forwardTime(SECONDS_PER_DAY * 28, this);

      // The bigChange is now within the acceptable range
      await tokenSupplier.setTokenIssuanceRate(bigChange, { from: USER1 });
    });

    it("can issue tokens before updating the tokenIssuanceRate", async () => {
      await tokenSupplier.initialise(SUPPLY_CEILING, WAD);

      const tx = await tokenSupplier.issueTokens();
      const blockTime = await getBlockTime(tx.receipt.blockNumber);

      const balancePre = await token.balanceOf(colony.address);

      await makeTxAtTimestamp(tokenSupplier.setTokenIssuanceRate, [WAD.muln(2)], blockTime + SECONDS_PER_DAY, this);

      const balancePost = await token.balanceOf(colony.address);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD);
    });

    it("can view the storage variables", async () => {
      const tx = await tokenSupplier.initialise(SUPPLY_CEILING, WAD);
      const blockTime = await getBlockTime(tx.receipt.blockNumber);

      const tokenSupplyCeiling = await tokenSupplier.getTokenSupplyCeiling();
      const tokenIssuanceRate = await tokenSupplier.getTokenIssuanceRate();
      const lastPinged = await tokenSupplier.getLastPinged();
      const lastRateUpdate = await tokenSupplier.getLastRateUpdate();

      expect(tokenSupplyCeiling).to.eq.BN(SUPPLY_CEILING);
      expect(tokenIssuanceRate).to.eq.BN(WAD);
      expect(lastPinged).to.eq.BN(blockTime);
      expect(lastRateUpdate).to.eq.BN(blockTime);
    });
  });

  describe("issuing tokens", async () => {
    beforeEach(async () => {
      await tokenSupplier.initialise(SUPPLY_CEILING, WAD);
    });

    it("can claim tokenIssuanceRate tokens per day", async () => {
      const balancePre = await token.balanceOf(colony.address);

      let time = await currentBlockTime();
      time = new BN(time).addn(SECONDS_PER_DAY);

      await makeTxAtTimestamp(tokenSupplier.issueTokens, [], time.toNumber(), this);

      const balancePost = await token.balanceOf(colony.address);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD);

      const tokenSupply = await token.totalSupply();
      expect(tokenSupply).to.eq.BN(WAD);
    });

    it("can claim tokenIssuanceRate at high frequencies", async () => {
      const balancePre = await token.balanceOf(colony.address);

      let time = await currentBlockTime();
      time = new BN(time).addn(SECONDS_PER_DAY / 2);

      await makeTxAtTimestamp(tokenSupplier.issueTokens, [], time.toNumber(), this);

      const balancePost = await token.balanceOf(colony.address);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD.divn(2));
    });

    it("can claim up to the tokenSupplyCeiling", async () => {
      const balancePre = await token.balanceOf(colony.address);

      let time = await currentBlockTime();
      time = new BN(time).addn(SECONDS_PER_DAY * 10);

      await makeTxAtTimestamp(tokenSupplier.issueTokens, [], time.toNumber(), this);

      const balancePost = await token.balanceOf(colony.address);
      expect(balancePost.sub(balancePre)).to.eq.BN(SUPPLY_CEILING);

      await forwardTime(SECONDS_PER_DAY, this);
      await tokenSupplier.issueTokens();

      const tokenSupply = await token.totalSupply();
      expect(tokenSupply).to.eq.BN(SUPPLY_CEILING);
    });

    it("can claim no tokens if the supply is larger than the ceiling", async () => {
      token.mint(SUPPLY_CEILING.addn(1));

      const balancePre = await token.balanceOf(colony.address);

      await forwardTime(SECONDS_PER_DAY, this);

      await tokenSupplier.issueTokens();

      const balancePost = await token.balanceOf(colony.address);
      expect(balancePost.sub(balancePre)).to.be.zero;
    });
  });
});
