/* globals artifacts */

const BN = require("bn.js");
const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");
const { soliditySha3 } = require("web3-utils");

const { UINT256_MAX, WAD, SECONDS_PER_DAY } = require("../../helpers/constants");
const { setupRandomColony, getMetaTransactionParameters } = require("../../helpers/test-data-generator");
const { checkErrorRevert, currentBlockTime, makeTxAtTimestamp, getBlockTime, forwardTime } = require("../../helpers/test-helper");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const EtherRouter = artifacts.require("EtherRouter");
const TokenSupplier = artifacts.require("TokenSupplier");

const TOKEN_SUPPLIER = soliditySha3("TokenSupplier");

const ISSUETOKENS_GAS_LIMIT = 200000;

contract("Token Supplier", (accounts) => {
  let colony;
  let token;
  let colonyNetwork;
  let tokenSupplier;
  let version;

  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const USER2 = accounts[2];

  const SUPPLY_CEILING = WAD.muln(10);

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const extension = await TokenSupplier.new();
    version = await extension.version();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.installExtension(TOKEN_SUPPLIER, version);
    await colony.addDomain(1, UINT256_MAX, 1);

    const tokenSupplierAddress = await colonyNetwork.getExtensionInstallation(TOKEN_SUPPLIER, colony.address);
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
      await colony.installExtension(TOKEN_SUPPLIER, version, { from: USER0 });

      await checkErrorRevert(colony.installExtension(TOKEN_SUPPLIER, version, { from: USER0 }), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(TOKEN_SUPPLIER, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(TOKEN_SUPPLIER, { from: USER0 });
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
      await token.mint(SUPPLY_CEILING.addn(1));

      await checkErrorRevert(tokenSupplier.initialise(SUPPLY_CEILING, WAD), "token-supplier-ceiling-too-low");
    });

    it("cannot issues tokens if not initialised", async () => {
      await checkErrorRevert(tokenSupplier.issueTokens({ gas: ISSUETOKENS_GAS_LIMIT }), "token-supplier-not-initialised");
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

      await token.mint(SUPPLY_CEILING.muln(3));

      await checkErrorRevert(tokenSupplier.setTokenSupplyCeiling(SUPPLY_CEILING.muln(2)), "token-supplier-ceiling-too-low");
    });

    it("can update the tokenIssuanceRate if root", async () => {
      await tokenSupplier.initialise(SUPPLY_CEILING, WAD);

      await tokenSupplier.setTokenIssuanceRate(WAD.muln(2), { gas: ISSUETOKENS_GAS_LIMIT });

      const tokenIssuanceRate = await tokenSupplier.getTokenIssuanceRate();
      expect(tokenIssuanceRate).to.eq.BN(WAD.muln(2));

      await checkErrorRevert(
        tokenSupplier.setTokenIssuanceRate(WAD, { from: USER1, gas: ISSUETOKENS_GAS_LIMIT }),
        "token-supplier-caller-not-authorized"
      );
    });

    it("can update the tokenIssuanceRate if root funding, by <=10% once every 4 weeks", async () => {
      await colony.setFundingRole(1, UINT256_MAX, USER1, 1, true);
      await colony.setFundingRole(1, 0, USER2, 2, true);

      await tokenSupplier.initialise(SUPPLY_CEILING, WAD);

      const smallChange = WAD.add(WAD.divn(10));
      const bigChange = WAD.add(WAD.divn(9));

      // Cannot change more than once in 4 weeks
      await checkErrorRevert(
        tokenSupplier.setTokenIssuanceRate(smallChange, { from: USER1, gas: ISSUETOKENS_GAS_LIMIT }),
        "token-supplier-caller-not-authorized"
      );

      await forwardTime(SECONDS_PER_DAY * 28, this);

      // Cannot change more than 10%
      await checkErrorRevert(
        tokenSupplier.setTokenIssuanceRate(bigChange, { from: USER1, gas: ISSUETOKENS_GAS_LIMIT }),
        "token-supplier-caller-not-authorized"
      );

      await tokenSupplier.setTokenIssuanceRate(smallChange, { from: USER1, gas: ISSUETOKENS_GAS_LIMIT });

      const tokenIssuanceRate = await tokenSupplier.getTokenIssuanceRate();
      expect(tokenIssuanceRate).to.eq.BN(smallChange);

      await forwardTime(SECONDS_PER_DAY * 28, this);

      // The bigChange is now within the acceptable range
      await tokenSupplier.setTokenIssuanceRate(bigChange, { from: USER1, gas: ISSUETOKENS_GAS_LIMIT });
    });

    it("can issue tokens before updating the tokenIssuanceRate", async () => {
      await tokenSupplier.initialise(SUPPLY_CEILING, WAD);

      const tx = await tokenSupplier.issueTokens({ gas: ISSUETOKENS_GAS_LIMIT });
      const blockTime = await getBlockTime(tx.receipt.blockNumber);

      const balancePre = await token.balanceOf(colony.address);

      await makeTxAtTimestamp(tokenSupplier.setTokenIssuanceRate, [WAD.muln(2), { gas: ISSUETOKENS_GAS_LIMIT }], blockTime + SECONDS_PER_DAY, this);

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

      await makeTxAtTimestamp(tokenSupplier.issueTokens, [{ gas: ISSUETOKENS_GAS_LIMIT }], time.toNumber(), this);

      const balancePost = await token.balanceOf(colony.address);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD);

      const tokenSupply = await token.totalSupply();
      expect(tokenSupply).to.eq.BN(WAD);
    });

    it("can claim tokenIssuanceRate tokens per day via metatransaction", async () => {
      const balancePre = await token.balanceOf(colony.address);

      let time = await currentBlockTime();
      time = new BN(time).addn(SECONDS_PER_DAY);

      const txData = await tokenSupplier.contract.methods.issueTokens().encodeABI();
      const { r, s, v } = await getMetaTransactionParameters(txData, accounts[0], tokenSupplier.address);

      await makeTxAtTimestamp(tokenSupplier.executeMetaTransaction, [accounts[0], txData, r, s, v], time.toNumber(), this);

      const balancePost = await token.balanceOf(colony.address);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD);

      const tokenSupply = await token.totalSupply();
      expect(tokenSupply).to.eq.BN(WAD);
    });

    it("can claim tokenIssuanceRate at high frequencies", async () => {
      const balancePre = await token.balanceOf(colony.address);

      let time = await currentBlockTime();
      time = new BN(time).addn(SECONDS_PER_DAY / 2);

      await makeTxAtTimestamp(tokenSupplier.issueTokens, [{ gas: ISSUETOKENS_GAS_LIMIT }], time.toNumber(), this);

      const balancePost = await token.balanceOf(colony.address);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD.divn(2));
    });

    it("can claim up to the tokenSupplyCeiling", async () => {
      const balancePre = await token.balanceOf(colony.address);

      let time = await currentBlockTime();
      time = new BN(time).addn(SECONDS_PER_DAY * 10);

      await makeTxAtTimestamp(tokenSupplier.issueTokens, [{ gas: ISSUETOKENS_GAS_LIMIT }], time.toNumber(), this);

      const balancePost = await token.balanceOf(colony.address);
      expect(balancePost.sub(balancePre)).to.eq.BN(SUPPLY_CEILING);

      await forwardTime(SECONDS_PER_DAY, this);
      await tokenSupplier.issueTokens({ gas: ISSUETOKENS_GAS_LIMIT });

      const tokenSupply = await token.totalSupply();
      expect(tokenSupply).to.eq.BN(SUPPLY_CEILING);
    });

    it("can claim no tokens if the supply is larger than the ceiling", async () => {
      await token.mint(SUPPLY_CEILING.addn(1));

      const balancePre = await token.balanceOf(colony.address);

      await forwardTime(SECONDS_PER_DAY, this);

      await tokenSupplier.issueTokens({ gas: ISSUETOKENS_GAS_LIMIT });

      const balancePost = await token.balanceOf(colony.address);
      expect(balancePost.sub(balancePre)).to.be.zero;
    });
  });
});
