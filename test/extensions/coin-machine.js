/* globals artifacts */

import BN from "bn.js";
import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";

import { UINT256_MAX, UINT128_MAX, WAD } from "../../helpers/constants";

import {
  checkErrorRevert,
  web3GetCode,
  forwardTime,
  web3GetBalance,
  makeTxAtTimestamp,
  currentBlockTime,
  forwardTimeTo,
  expectEvent,
} from "../../helpers/test-helper";

import { setupRandomToken, setupRandomColony, setupColony, getMetaTransactionParameters } from "../../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const EtherRouter = artifacts.require("EtherRouter");
const Token = artifacts.require("Token");
const TokenAuthority = artifacts.require("TokenAuthority");
const CoinMachine = artifacts.require("CoinMachine");
const Whitelist = artifacts.require("Whitelist");

const COIN_MACHINE = soliditySha3("CoinMachine");

contract("Coin Machine", (accounts) => {
  let colony;
  let token;
  let purchaseToken;
  let colonyNetwork;
  let coinMachine;
  let version;

  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const USER2 = accounts[2];

  const ADDRESS_ZERO = ethers.constants.AddressZero;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const extension = await CoinMachine.new();
    version = await extension.version();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    purchaseToken = await setupRandomToken();

    await colony.installExtension(COIN_MACHINE, version);

    const coinMachineAddress = await colonyNetwork.getExtensionInstallation(COIN_MACHINE, colony.address);
    coinMachine = await CoinMachine.at(coinMachineAddress);

    // Forward time to start of a Coin Machine period - so long a test doesn't take an hour to run, should be reproducible!
    // (I still don't like this functionality of CoinMachine though!)
    const time = await currentBlockTime();
    await forwardTimeTo(Math.ceil(time / 3600) * 3600);
  });

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      coinMachine = await CoinMachine.new();
      await coinMachine.install(colony.address);

      await checkErrorRevert(coinMachine.install(colony.address), "extension-already-installed");

      const identifier = await coinMachine.identifier();
      expect(identifier).to.equal(COIN_MACHINE);

      const capabilityRoles = await coinMachine.getCapabilityRoles("0x0");
      expect(capabilityRoles).to.equal(ethers.constants.HashZero);

      await coinMachine.finishUpgrade();
      await coinMachine.deprecate(true);
      await coinMachine.uninstall();

      const code = await web3GetCode(coinMachine.address);
      expect(code).to.equal("0x");
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(COIN_MACHINE, version, { from: USER0 });

      await checkErrorRevert(colony.installExtension(COIN_MACHINE, version, { from: USER0 }), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(COIN_MACHINE, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(COIN_MACHINE, { from: USER0 });
    });

    it("can send unsold tokens back to the colony", async () => {
      await token.mint(coinMachine.address, WAD, { from: USER0 });

      await coinMachine.initialise(token.address, ADDRESS_ZERO, 60 * 60, 10, WAD, WAD, WAD, WAD, ADDRESS_ZERO);

      await colony.uninstallExtension(COIN_MACHINE, { from: USER0 });

      const balance = await token.balanceOf(colony.address);
      expect(balance).to.eq.BN(WAD);
    });

    it("can initialise", async () => {
      await expectEvent(
        coinMachine.initialise(token.address, purchaseToken.address, 60, 511, 10, 10, WAD, 0, ADDRESS_ZERO),
        "ExtensionInitialised",
        []
      );
    });

    it("can handle a large windowSize", async () => {
      await coinMachine.initialise(token.address, purchaseToken.address, 60, 511, 10, 10, WAD, 0, ADDRESS_ZERO);

      // Advance an entire window
      await forwardTime(60 * 511 + 1, this);

      await coinMachine.updatePeriod();
    });

    it("cannot initialise with bad arguments", async () => {
      await checkErrorRevert(
        coinMachine.initialise(ADDRESS_ZERO, purchaseToken.address, 60, 511, 10, 10, WAD, 0, ADDRESS_ZERO),
        "coin-machine-invalid-token"
      );
      await checkErrorRevert(
        coinMachine.initialise(token.address, purchaseToken.address, 0, 511, 10, 10, WAD, 0, ADDRESS_ZERO),
        "coin-machine-period-too-small"
      );
      await checkErrorRevert(
        coinMachine.initialise(token.address, purchaseToken.address, 60, 0, 10, 10, WAD, 0, ADDRESS_ZERO),
        "coin-machine-window-too-small"
      );
      await checkErrorRevert(
        coinMachine.initialise(token.address, purchaseToken.address, 60, 512, 10, 10, WAD, 0, ADDRESS_ZERO),
        "coin-machine-window-too-large"
      );
      await checkErrorRevert(
        coinMachine.initialise(token.address, purchaseToken.address, 60, 511, 0, 10, WAD, 0, ADDRESS_ZERO),
        "coin-machine-target-too-small"
      );
      await checkErrorRevert(
        coinMachine.initialise(token.address, purchaseToken.address, 60, 511, 10, 9, WAD, 0, ADDRESS_ZERO),
        "coin-machine-max-too-small"
      );
      await checkErrorRevert(
        coinMachine.initialise(token.address, purchaseToken.address, 60, 511, 10, 10, WAD.addn(1), 0, ADDRESS_ZERO),
        "coin-machine-limit-too-large"
      );
      await checkErrorRevert(
        coinMachine.initialise(token.address, purchaseToken.address, 60, 511, 10, 10, 0, 0, ADDRESS_ZERO),
        "coin-machine-limit-too-small"
      );
    });

    it("cannot initialise twice", async () => {
      await coinMachine.initialise(token.address, purchaseToken.address, 60, 511, 10, 10, WAD, 0, ADDRESS_ZERO);

      await checkErrorRevert(
        coinMachine.initialise(token.address, purchaseToken.address, 60, 511, 10, 10, WAD, 0, ADDRESS_ZERO),
        "coin-machine-already-initialised"
      );
    });

    it("cannot initialise if not root", async () => {
      await checkErrorRevert(
        coinMachine.initialise(token.address, purchaseToken.address, 60, 511, 10, 10, WAD, 0, ADDRESS_ZERO, { from: USER1 }),
        "coin-machine-caller-not-root"
      );
    });
  });

  describe("buying tokens", async () => {
    beforeEach(async () => {
      await token.mint(coinMachine.address, UINT128_MAX);

      await coinMachine.initialise(
        token.address, // sale token
        purchaseToken.address, // purchase token
        60 * 60, // period length
        10, // number of periods for averaging
        WAD.muln(100), // tokens per period
        WAD.muln(200), // max per period
        WAD, // user limit percentage
        WAD, // starting price
        ADDRESS_ZERO // whitelist address
      );
    });

    it("can buy tokens", async () => {
      await purchaseToken.mint(USER0, WAD, { from: USER0 });
      await purchaseToken.approve(coinMachine.address, WAD, { from: USER0 });

      await coinMachine.buyTokens(WAD, { from: USER0 });

      const userBalance = await token.balanceOf(USER0);
      expect(userBalance).to.eq.BN(WAD);
      const colonyBalance = await purchaseToken.balanceOf(colony.address);
      expect(colonyBalance).to.eq.BN(WAD);

      // But not with insufficient funds
      await purchaseToken.approve(coinMachine.address, WAD, { from: USER0 });
      await checkErrorRevert(coinMachine.buyTokens(WAD, { from: USER0 }), "ds-token-insufficient-balance");
    });

    it("can buy tokens via metatransaction", async () => {
      await purchaseToken.mint(USER0, WAD, { from: USER0 });
      await purchaseToken.approve(coinMachine.address, WAD, { from: USER0 });

      const txData = await coinMachine.contract.methods.buyTokens(WAD.toString()).encodeABI();

      const { r, s, v } = await getMetaTransactionParameters(txData, USER0, coinMachine.address);

      await coinMachine.executeMetaTransaction(USER0, txData, r, s, v, { from: USER1 });

      const userBalance = await token.balanceOf(USER0);
      expect(userBalance).to.eq.BN(WAD);
      const colonyBalance = await purchaseToken.balanceOf(colony.address);
      expect(colonyBalance).to.eq.BN(WAD);

      // But not with insufficient funds
      await purchaseToken.approve(coinMachine.address, WAD, { from: USER0 });
      await checkErrorRevert(coinMachine.buyTokens(WAD, { from: USER0 }), "ds-token-insufficient-balance");
    });

    it("responds to getter functions correctly while running", async () => {
      await purchaseToken.mint(USER0, WAD, { from: USER0 });
      await purchaseToken.approve(coinMachine.address, WAD, { from: USER0 });

      await coinMachine.buyTokens(WAD, { from: USER0 });

      const reportedPurchaseToken = await coinMachine.getPurchaseToken();
      expect(reportedPurchaseToken).to.equal(purchaseToken.address);
      const tokenAddress = await coinMachine.getToken();
      expect(tokenAddress).to.equal(token.address);
      const activePeriod = await coinMachine.getActivePeriod();
      const activeSold = await coinMachine.getActiveSold();
      expect(activeSold).to.eq.BN(WAD);
      const activeIntake = await coinMachine.getActiveIntake();
      expect(activeIntake).to.eq.BN(WAD);

      const emaIntake = await coinMachine.getEMAIntake();
      expect(emaIntake).to.eq.BN(WAD.muln(100));

      const periodLength = await coinMachine.getPeriodLength();
      await forwardTime(periodLength.toNumber(), this);

      const activePeriod2 = await coinMachine.getActivePeriod();
      expect(activePeriod).to.eq.BN(activePeriod2);
      await coinMachine.updatePeriod();

      const activePeriod3 = await coinMachine.getActivePeriod();
      expect(activePeriod.addn(1)).to.eq.BN(activePeriod3);

      const emaIntake2 = await coinMachine.getEMAIntake();
      expect(emaIntake2).to.eq.BN(new BN("82000000000000000018"));
    });

    it("can buy tokens that are not the colony's internal token", async () => {
      const otherToken = await Token.new("", "", 18);
      await otherToken.unlock();

      await colony.uninstallExtension(COIN_MACHINE, { from: USER0 });
      await colony.installExtension(COIN_MACHINE, version, { from: USER0 });
      const coinMachineAddress = await colonyNetwork.getExtensionInstallation(COIN_MACHINE, colony.address);
      coinMachine = await CoinMachine.at(coinMachineAddress);

      await otherToken.mint(coinMachine.address, UINT128_MAX);

      await coinMachine.initialise(otherToken.address, purchaseToken.address, 60 * 60, 10, WAD.muln(100), WAD.muln(200), WAD, WAD, ADDRESS_ZERO);

      await purchaseToken.mint(USER0, WAD, { from: USER0 });
      await purchaseToken.approve(coinMachine.address, WAD, { from: USER0 });

      await coinMachine.buyTokens(WAD, { from: USER0 });

      const balance = await otherToken.balanceOf(USER0);
      expect(balance).to.eq.BN(WAD);
    });

    it("cannot buy more than the balance of tokens", async () => {
      await colony.uninstallExtension(COIN_MACHINE, { from: USER0 });
      await colony.installExtension(COIN_MACHINE, version, { from: USER0 });
      const coinMachineAddress = await colonyNetwork.getExtensionInstallation(COIN_MACHINE, colony.address);
      coinMachine = await CoinMachine.at(coinMachineAddress);

      await token.mint(coinMachine.address, WAD);

      await coinMachine.initialise(token.address, purchaseToken.address, 60 * 60, 10, WAD.muln(100), WAD.muln(200), WAD, WAD, ADDRESS_ZERO);

      await purchaseToken.mint(USER0, WAD.muln(2), { from: USER0 });
      await purchaseToken.approve(coinMachine.address, WAD.muln(2), { from: USER0 });

      await coinMachine.buyTokens(WAD, { from: USER0 });

      const tokensToSell = await token.balanceOf(coinMachine.address);
      expect(tokensToSell).to.be.zero;

      await coinMachine.buyTokens(WAD, { from: USER0 });

      const balance = await token.balanceOf(USER0);
      expect(balance).to.eq.BN(WAD);
    });

    it("can buy tokens if tokens being sold are locked but the coin machine can transfer them", async () => {
      token = await Token.new("", "", 18);
      const locked = await token.locked();
      expect(locked).to.equal(true);

      colony = await setupColony(colonyNetwork, token.address);
      await colony.installExtension(COIN_MACHINE, version);
      const coinMachineAddress = await colonyNetwork.getExtensionInstallation(COIN_MACHINE, colony.address);
      coinMachine = await CoinMachine.at(coinMachineAddress);

      const tokenAuthority = await TokenAuthority.new(token.address, colony.address, [coinMachine.address]);
      await token.setAuthority(tokenAuthority.address);

      await token.mint(coinMachine.address, WAD.muln(1000));

      await coinMachine.initialise(token.address, purchaseToken.address, 60 * 60, 10, WAD.muln(100), WAD.muln(200), WAD, WAD, ADDRESS_ZERO);

      await purchaseToken.mint(USER1, WAD, { from: USER0 });
      await purchaseToken.approve(coinMachine.address, WAD, { from: USER1 });

      await coinMachine.buyTokens(WAD, { from: USER1 });

      const balance = await token.balanceOf(USER1);
      expect(balance).to.eq.BN(WAD);

      // But the user can't transfer
      await checkErrorRevert(token.transfer(colony.address, WAD, { from: USER1 }), "colony-token-unauthorised");
    });

    it("cannot buy tokens if deprecated", async () => {
      let deprecated = await coinMachine.getDeprecated();
      expect(deprecated).to.equal(false);

      await colony.deprecateExtension(COIN_MACHINE, true);

      await checkErrorRevert(coinMachine.buyTokens(WAD, { from: USER0 }), "colony-extension-deprecated");
      deprecated = await coinMachine.getDeprecated();
      expect(deprecated).to.equal(true);
    });

    it("can buy tokens with eth", async () => {
      await colony.uninstallExtension(COIN_MACHINE, { from: USER0 });
      await colony.installExtension(COIN_MACHINE, version, { from: USER0 });
      const coinMachineAddress = await colonyNetwork.getExtensionInstallation(COIN_MACHINE, colony.address);
      coinMachine = await CoinMachine.at(coinMachineAddress);

      await token.mint(coinMachine.address, UINT128_MAX);

      await coinMachine.initialise(token.address, ADDRESS_ZERO, 60 * 60, 10, WAD.muln(100), WAD.muln(200), WAD, WAD, ADDRESS_ZERO);

      const currentPrice = await coinMachine.getCurrentPrice();

      // Check purchase functionality
      await coinMachine.buyTokens(WAD, { from: USER0, value: currentPrice });

      const userBalance = await token.balanceOf(USER0);
      expect(userBalance).to.eq.BN(WAD);
      const colonyBalance = await web3GetBalance(colony.address);
      expect(colonyBalance).to.eq.BN(WAD);

      // But not with insufficient funds
      await checkErrorRevert(coinMachine.buyTokens(WAD, { from: USER0, value: currentPrice.subn(1) }), "coin-machine-insufficient-funds");

      // Check refund functionality
      const balanceBefore = await web3GetBalance(colony.address);
      await coinMachine.buyTokens(WAD, { from: USER0, value: currentPrice.muln(2) });
      const balanceAfter = await web3GetBalance(colony.address);
      expect(new BN((balanceAfter - balanceBefore).toString())).to.eq.BN(currentPrice);
    });

    it("can refund eth if no tokens are purchased", async () => {
      await colony.uninstallExtension(COIN_MACHINE, { from: USER0 });
      await colony.installExtension(COIN_MACHINE, version, { from: USER0 });
      const coinMachineAddress = await colonyNetwork.getExtensionInstallation(COIN_MACHINE, colony.address);
      coinMachine = await CoinMachine.at(coinMachineAddress);

      await token.mint(coinMachine.address, UINT128_MAX);

      await coinMachine.initialise(token.address, ADDRESS_ZERO, 60 * 60, 10, WAD, WAD, WAD, WAD, ADDRESS_ZERO);

      await coinMachine.buyTokens(WAD, { from: USER0, value: WAD });

      const maxPurchase = await coinMachine.getMaxPurchase(USER1);
      expect(maxPurchase).to.be.zero;

      // Eth is returned to the user, not sent to the colony or held by the contract
      const coinMachinePre = await web3GetBalance(coinMachine.address);
      const colonyPre = await web3GetBalance(colony.address);
      await coinMachine.buyTokens(WAD, { from: USER1, value: WAD });
      const coinMachinePost = await web3GetBalance(coinMachine.address);
      const colonyPost = await web3GetBalance(colony.address);
      const tokenBalance = await token.balanceOf(USER1);

      expect(new BN((coinMachinePre - coinMachinePost).toString())).to.be.zero;
      expect(new BN((colonyPre - colonyPost).toString())).to.be.zero;
      expect(tokenBalance).to.be.zero;
    });

    it("can buy up to the maximum amount of tokens per period", async () => {
      const maxPerPeriod = await coinMachine.getMaxPerPeriod();
      const tokensToBuy = maxPerPeriod.add(WAD);

      await purchaseToken.mint(USER0, tokensToBuy, { from: USER0 });
      await purchaseToken.approve(coinMachine.address, tokensToBuy, { from: USER0 });

      await coinMachine.buyTokens(tokensToBuy, { from: USER0 });

      const balance = await token.balanceOf(USER0);
      expect(balance).to.eq.BN(maxPerPeriod);

      const purchaseBalance = await purchaseToken.balanceOf(USER0);
      expect(purchaseBalance).to.eq.BN(WAD);
    });

    it("can buy tokens over multiple periods", async () => {
      const windowSize = await coinMachine.getWindowSize();
      const periodLength = await coinMachine.getPeriodLength();
      const targetPerPeriod = await coinMachine.getTargetPerPeriod();
      const currentPrice = await coinMachine.getCurrentPrice();

      const numPurchases = windowSize.addn(1).toNumber();
      const totalCost = targetPerPeriod.mul(currentPrice).muln(numPurchases);

      await purchaseToken.mint(USER0, totalCost, { from: USER0 });
      await purchaseToken.approve(coinMachine.address, totalCost, { from: USER0 });

      for (let i = 0; i < numPurchases; i += 1) {
        await coinMachine.buyTokens(targetPerPeriod, { from: USER0 });
        await forwardTime(periodLength.toNumber(), this);
      }

      const balance = await token.balanceOf(USER0);
      expect(balance).to.eq.BN(targetPerPeriod.muln(numPurchases));
    });

    it("can adjust prices according to demand", async () => {
      const periodLength = await coinMachine.getPeriodLength();
      const maxPerPeriod = await coinMachine.getMaxPerPeriod();
      const windowSize = await coinMachine.getWindowSize();
      const alphaAsWad = new BN(2).mul(WAD).div(windowSize.addn(1));

      let currentPrice;

      await purchaseToken.mint(USER0, maxPerPeriod.muln(10), { from: USER0 });
      await purchaseToken.approve(coinMachine.address, maxPerPeriod.muln(10), { from: USER0 });

      currentPrice = await coinMachine.getCurrentPrice();
      expect(currentPrice).to.eq.BN(WAD);

      await coinMachine.buyTokens(maxPerPeriod, { from: USER0 });
      await forwardTime(periodLength.toNumber(), this);
      await coinMachine.updatePeriod();

      let emaIntake = WAD.muln(100).mul(WAD.sub(alphaAsWad)).add(maxPerPeriod.mul(alphaAsWad));

      let expectedPrice = emaIntake.div(WAD.muln(100));
      currentPrice = await coinMachine.getCurrentPrice();
      expect(currentPrice).to.eq.BN(expectedPrice);

      // We don't buy anything for a period
      await forwardTime(periodLength.toNumber(), this);
      await coinMachine.updatePeriod();

      emaIntake = emaIntake.mul(WAD.sub(alphaAsWad)).div(WAD);
      expectedPrice = emaIntake.div(WAD.muln(100));
      currentPrice = await coinMachine.getCurrentPrice();
      expect(currentPrice).to.eq.BN(expectedPrice);

      // And again, we don't buy anything for a period
      await forwardTime(periodLength.toNumber(), this);
      await coinMachine.updatePeriod();

      emaIntake = emaIntake.mul(WAD.sub(alphaAsWad)).div(WAD);
      expectedPrice = emaIntake.div(WAD.muln(100));
      currentPrice = await coinMachine.getCurrentPrice();
      expect(currentPrice).to.eq.BN(expectedPrice);
    });

    it("cannot adjust prices while the token balance is zero", async () => {
      await colony.uninstallExtension(COIN_MACHINE, { from: USER0 });
      await colony.installExtension(COIN_MACHINE, version, { from: USER0 });
      const coinMachineAddress = await colonyNetwork.getExtensionInstallation(COIN_MACHINE, colony.address);
      coinMachine = await CoinMachine.at(coinMachineAddress);

      await token.mint(coinMachine.address, WAD.muln(200));

      await coinMachine.initialise(token.address, purchaseToken.address, 60 * 60, 10, WAD.muln(100), WAD.muln(200), WAD, WAD, ADDRESS_ZERO);

      const periodLength = await coinMachine.getPeriodLength();
      const maxPerPeriod = await coinMachine.getMaxPerPeriod();
      const windowSize = await coinMachine.getWindowSize();
      const alphaAsWad = new BN(2).mul(WAD).div(windowSize.addn(1));

      let currentPrice;
      let evolvePrice;
      let tx;

      await purchaseToken.mint(USER0, maxPerPeriod.muln(10), { from: USER0 });
      await purchaseToken.approve(coinMachine.address, maxPerPeriod.muln(10), { from: USER0 });

      currentPrice = await coinMachine.getCurrentPrice();
      expect(currentPrice).to.eq.BN(WAD);

      tx = await coinMachine.buyTokens(maxPerPeriod, { from: USER0 });
      await expectEvent(tx, "PriceEvolutionSet", [false]);

      evolvePrice = await coinMachine.getEvolvePrice();
      expect(evolvePrice).to.be.false;

      // Next period, but no price update because we are out of tokens
      await forwardTime(periodLength.toNumber(), this);
      await coinMachine.updatePeriod();

      currentPrice = await coinMachine.getCurrentPrice();
      expect(currentPrice).to.eq.BN(WAD);

      // Now we reload the token balance (and advance a period)
      // Price doesn't adjust in the period you update
      await token.mint(coinMachine.address, WAD);

      await forwardTime(periodLength.toNumber(), this);
      tx = await coinMachine.updatePeriod();
      await expectEvent(tx, "PriceEvolutionSet", [true]);

      evolvePrice = await coinMachine.getEvolvePrice();
      expect(evolvePrice).to.be.true;

      currentPrice = await coinMachine.getCurrentPrice();
      expect(currentPrice).to.eq.BN(WAD);

      // But it does the next
      await forwardTime(periodLength.toNumber(), this);
      await coinMachine.updatePeriod();

      const emaIntake = WAD.muln(100).mul(WAD.sub(alphaAsWad)).add(maxPerPeriod.mul(alphaAsWad));
      const expectedPrice = emaIntake.div(WAD.muln(100));
      currentPrice = await coinMachine.getCurrentPrice();
      expect(currentPrice).to.eq.BN(expectedPrice);
    });

    it("cannot adjust prices while deprecated", async () => {
      const periodLength = await coinMachine.getPeriodLength();
      const maxPerPeriod = await coinMachine.getMaxPerPeriod();
      const windowSize = await coinMachine.getWindowSize();
      const alphaAsWad = new BN(2).mul(WAD).div(windowSize.addn(1));

      let currentPrice;
      let evolvePrice;
      let tx;

      await purchaseToken.mint(USER0, maxPerPeriod.muln(10), { from: USER0 });
      await purchaseToken.approve(coinMachine.address, maxPerPeriod.muln(10), { from: USER0 });

      currentPrice = await coinMachine.getCurrentPrice();
      expect(currentPrice).to.eq.BN(WAD);

      await coinMachine.buyTokens(maxPerPeriod, { from: USER0 });
      tx = await colony.deprecateExtension(COIN_MACHINE, true, { from: USER0 });
      // Full event signature because we bounce the call through the colony
      await expectEvent(tx, "PriceEvolutionSet(bool)", [false]);

      evolvePrice = await coinMachine.getEvolvePrice();
      expect(evolvePrice).to.be.false;

      // Next period, but no price update because we are out of tokens
      await forwardTime(periodLength.toNumber(), this);
      await coinMachine.updatePeriod();

      currentPrice = await coinMachine.getCurrentPrice();
      expect(currentPrice).to.eq.BN(WAD);

      // Now we undeprecate the extension (and advance a period)
      // Price doesn't adjust in the period you update
      await colony.deprecateExtension(COIN_MACHINE, false, { from: USER0 });

      await forwardTime(periodLength.toNumber(), this);
      tx = await coinMachine.updatePeriod();
      await expectEvent(tx, "PriceEvolutionSet", [true]);

      evolvePrice = await coinMachine.getEvolvePrice();
      expect(evolvePrice).to.be.true;

      currentPrice = await coinMachine.getCurrentPrice();
      expect(currentPrice).to.eq.BN(WAD);

      // But it does the next
      await forwardTime(periodLength.toNumber(), this);
      await coinMachine.updatePeriod();

      const emaIntake = WAD.muln(100).mul(WAD.sub(alphaAsWad)).add(maxPerPeriod.mul(alphaAsWad));
      const expectedPrice = emaIntake.div(WAD.muln(100));
      currentPrice = await coinMachine.getCurrentPrice();
      expect(currentPrice).to.eq.BN(expectedPrice);
    });

    it("it monotonically adjusts prices according to demand", async () => {
      const periodLength = await coinMachine.getPeriodLength();
      const maxPerPeriod = await coinMachine.getMaxPerPeriod();

      let currentPrice;

      await purchaseToken.mint(USER0, maxPerPeriod.muln(10000), { from: USER0 });
      await purchaseToken.approve(coinMachine.address, maxPerPeriod.muln(10000), { from: USER0 });

      let previousPrice = maxPerPeriod.muln(10000); // A very large number.
      for (let i = 0; i < 100; i += 1) {
        // There used to be a check for a 'steady state' price here, but
        // that only worked by chance.
        currentPrice = await coinMachine.getCurrentPrice();
        expect(currentPrice).to.be.lte.BN(previousPrice);
        previousPrice = currentPrice;
        const currentBlockTimestamp = await currentBlockTime();

        await makeTxAtTimestamp(
          coinMachine.buyTokens,
          [WAD.div(currentPrice).mul(WAD), { from: USER0 }],
          currentBlockTimestamp + periodLength.toNumber(),
          this
        );
      }
    });

    it("can handle long periods of inactivity", async () => {
      const windowSize = await coinMachine.getWindowSize();
      const periodLength = await coinMachine.getPeriodLength();

      let currentPrice = await coinMachine.getCurrentPrice();
      expect(currentPrice).to.eq.BN(WAD);

      await forwardTime(periodLength.mul(windowSize).muln(1000).toNumber(), this);

      // Check virtual price
      currentPrice = await coinMachine.getCurrentPrice();
      expect(currentPrice).to.be.zero;

      await coinMachine.updatePeriod();

      // Check actual price
      currentPrice = await coinMachine.getCurrentPrice();
      expect(currentPrice).to.be.zero;
    });

    it("can virtually update counters", async () => {
      const periodLength = await coinMachine.getPeriodLength();
      const targetPerPeriod = await coinMachine.getTargetPerPeriod();
      const maxPerPeriod = await coinMachine.getMaxPerPeriod();
      const windowSize = await coinMachine.getWindowSize();
      const alphaAsWad = new BN(2).mul(WAD).div(windowSize.addn(1));

      let currentPrice = await coinMachine.getCurrentPrice();
      let sellableTokens = await coinMachine.getSellableTokens();

      expect(currentPrice).to.eq.BN(WAD);
      expect(sellableTokens).to.eq.BN(maxPerPeriod);

      await purchaseToken.mint(USER0, maxPerPeriod.muln(2), { from: USER0 });
      await purchaseToken.approve(coinMachine.address, maxPerPeriod.muln(2), { from: USER0 });

      // Buy tokens during a period, watch counters adapt
      await coinMachine.buyTokens(targetPerPeriod.divn(2), { from: USER0 });

      currentPrice = await coinMachine.getCurrentPrice();
      sellableTokens = await coinMachine.getSellableTokens();

      expect(currentPrice).to.eq.BN(WAD);
      expect(sellableTokens).to.eq.BN(maxPerPeriod.sub(targetPerPeriod.divn(2)));

      await coinMachine.buyTokens(targetPerPeriod.divn(2), { from: USER0 });

      currentPrice = await coinMachine.getCurrentPrice();
      sellableTokens = await coinMachine.getSellableTokens();

      expect(currentPrice).to.eq.BN(WAD);
      expect(sellableTokens).to.eq.BN(maxPerPeriod.sub(targetPerPeriod));

      await coinMachine.buyTokens(targetPerPeriod, { from: USER0 });

      currentPrice = await coinMachine.getCurrentPrice();
      sellableTokens = await coinMachine.getSellableTokens();

      expect(currentPrice).to.eq.BN(WAD);
      expect(sellableTokens).to.be.zero;

      // Advance to next period without calling `updatePeriod`
      await forwardTime(periodLength.toNumber(), this);

      currentPrice = await coinMachine.getCurrentPrice();
      sellableTokens = await coinMachine.getSellableTokens();

      let emaIntake = WAD.muln(100).mul(WAD.sub(alphaAsWad)).add(maxPerPeriod.mul(alphaAsWad));
      let expectedPrice = emaIntake.div(WAD.muln(100));

      // Bought maxPerPeriod tokens so price should be up
      expect(currentPrice).to.eq.BN(expectedPrice);
      expect(sellableTokens).to.eq.BN(maxPerPeriod);

      // Advance to next period without calling `updatePeriod`
      // Now we are two periods advanced from `currentPeriod`
      await forwardTime(periodLength.toNumber(), this);

      currentPrice = await coinMachine.getCurrentPrice();
      sellableTokens = await coinMachine.getSellableTokens();
      emaIntake = emaIntake.mul(WAD.sub(alphaAsWad)).div(WAD);
      expectedPrice = emaIntake.div(WAD.muln(100));

      expect(currentPrice).to.eq.BN(expectedPrice);
      expect(sellableTokens).to.eq.BN(maxPerPeriod);

      // Now buy some tokens
      await coinMachine.buyTokens(maxPerPeriod, { from: USER0 });

      // Price should be the same, but no tokens available.
      currentPrice = await coinMachine.getCurrentPrice();
      sellableTokens = await coinMachine.getSellableTokens();

      expect(currentPrice).to.eq.BN(expectedPrice);
      expect(sellableTokens).to.be.zero;
    });

    it("can handle sales tokens with different decimals", async () => {
      token = await Token.new("Test Token", "TEST", 9);
      colony = await setupColony(colonyNetwork, token.address);
      await token.unlock();

      await colony.installExtension(COIN_MACHINE, version, { from: USER0 });
      const coinMachineAddress = await colonyNetwork.getExtensionInstallation(COIN_MACHINE, colony.address);
      coinMachine = await CoinMachine.at(coinMachineAddress);

      await token.mint(coinMachine.address, UINT128_MAX);

      await coinMachine.initialise(token.address, purchaseToken.address, 60 * 60, 10, WAD, WAD, WAD, WAD, ADDRESS_ZERO);

      await purchaseToken.mint(USER0, WAD, { from: USER0 });
      await purchaseToken.approve(coinMachine.address, WAD, { from: USER0 });

      await coinMachine.buyTokens(WAD, { from: USER0 });

      const balance = await token.balanceOf(USER0);
      expect(balance).to.eq.BN(WAD);
    });

    it("can handle purchase tokens with different decimals", async () => {
      purchaseToken = await Token.new("Test Token", "TEST", 9);
      await purchaseToken.unlock();

      await colony.uninstallExtension(COIN_MACHINE, { from: USER0 });
      await colony.installExtension(COIN_MACHINE, version, { from: USER0 });
      const coinMachineAddress = await colonyNetwork.getExtensionInstallation(COIN_MACHINE, colony.address);
      coinMachine = await CoinMachine.at(coinMachineAddress);

      await token.mint(coinMachine.address, UINT128_MAX);

      await coinMachine.initialise(token.address, purchaseToken.address, 60 * 60, 10, WAD, WAD, WAD, WAD, ADDRESS_ZERO);

      await purchaseToken.mint(USER0, WAD, { from: USER0 });
      await purchaseToken.approve(coinMachine.address, WAD, { from: USER0 });

      await coinMachine.buyTokens(WAD, { from: USER0 });

      const balance = await token.balanceOf(USER0);
      expect(balance).to.eq.BN(WAD);
    });
  });

  describe("using a whitelist", async () => {
    let whitelist;

    beforeEach(async () => {
      whitelist = await Whitelist.new();
      await whitelist.install(colony.address);
      await whitelist.initialise(true, "");

      await token.mint(coinMachine.address, UINT128_MAX);

      await coinMachine.initialise(token.address, purchaseToken.address, 60 * 60, 10, WAD, WAD, WAD, WAD, whitelist.address);

      await colony.setAdministrationRole(1, UINT256_MAX, USER1, 1, true);
    });

    it("can query for the whitelist address", async () => {
      const whitelistAddress = await coinMachine.getWhitelist();

      expect(whitelistAddress).to.equal(whitelist.address);
    });

    it("can buy tokens if on the whitelist", async () => {
      await purchaseToken.mint(USER0, WAD, { from: USER0 });
      await purchaseToken.approve(coinMachine.address, WAD, { from: USER0 });

      await whitelist.approveUsers([USER0], true, { from: USER1 });

      await coinMachine.buyTokens(WAD, { from: USER0 });

      const balance = await token.balanceOf(USER0);
      expect(balance).to.eq.BN(WAD);
    });

    it("cannot buy tokens if not on the whitelist", async () => {
      await checkErrorRevert(coinMachine.buyTokens(WAD, { from: USER0 }), "coin-machine-unauthorised");
    });

    it("cannot buy tokens if not on the whitelist", async () => {
      await checkErrorRevert(coinMachine.buyTokens(WAD, { from: USER0 }), "coin-machine-unauthorised");
    });

    it("can use setWhitelist to set the whitelist", async () => {
      let recordedAddress = await coinMachine.getWhitelist();
      expect(recordedAddress).to.equal(whitelist.address);
      const tx = await coinMachine.setWhitelist(ADDRESS_ZERO);
      await expectEvent(tx, "WhitelistSet", [ADDRESS_ZERO]);
      recordedAddress = await coinMachine.getWhitelist();
      expect(recordedAddress).to.equal(ADDRESS_ZERO);
    });

    it("cannot buy more than their user limit allows", async () => {
      await colony.uninstallExtension(COIN_MACHINE, { from: USER0 });
      await colony.installExtension(COIN_MACHINE, version, { from: USER0 });
      const coinMachineAddress = await colonyNetwork.getExtensionInstallation(COIN_MACHINE, colony.address);
      coinMachine = await CoinMachine.at(coinMachineAddress);

      await token.mint(coinMachine.address, WAD.muln(1000));

      await whitelist.approveUsers([USER0, USER1, USER2], true, { from: USER1 });

      await coinMachine.initialise(
        token.address,
        purchaseToken.address,
        60 * 60,
        10,
        WAD.muln(100),
        WAD.muln(1000),
        WAD.divn(4),
        WAD,
        whitelist.address
      );

      const periodLength = await coinMachine.getPeriodLength();

      await purchaseToken.mint(USER0, WAD.muln(5000), { from: USER0 });
      await purchaseToken.approve(coinMachine.address, WAD.muln(5000), { from: USER0 });

      await purchaseToken.mint(USER1, WAD.muln(5000), { from: USER0 });
      await purchaseToken.approve(coinMachine.address, WAD.muln(5000), { from: USER1 });

      await purchaseToken.mint(USER2, WAD.muln(5000), { from: USER0 });
      await purchaseToken.approve(coinMachine.address, WAD.muln(5000), { from: USER2 });

      let userLimit;
      let balance;

      // The user can buy 250 tokens, as the contract has 1000 tokens and the per user
      // limit is 25%
      userLimit = await coinMachine.getUserLimit(USER0);
      expect(userLimit).to.eq.BN(WAD.muln(250));

      await coinMachine.buyTokens(WAD.muln(300), { from: USER0 });
      await coinMachine.buyTokens(WAD.muln(300), { from: USER1 });

      // Only buys up to limit
      balance = await token.balanceOf(USER0);
      expect(balance).to.eq.BN(WAD.muln(250));
      balance = await token.balanceOf(USER1);
      expect(balance).to.eq.BN(WAD.muln(250));

      await forwardTime(periodLength.toNumber(), this);

      // Since each owns 25% of the total tokens already, neither can buy, only a new user can
      // The new user can buy 250 tokens, 25% of the full 1000, which is now split between the
      // first two users and the remainder still in coin machine
      userLimit = await coinMachine.getUserLimit(USER0);
      expect(userLimit).to.be.zero;
      userLimit = await coinMachine.getUserLimit(USER2);
      expect(userLimit).to.eq.BN(WAD.muln(250));

      await coinMachine.buyTokens(WAD.muln(500), { from: USER2 });

      // Only buys up to limit
      balance = await token.balanceOf(USER2);
      expect(balance).to.eq.BN(WAD.muln(250));

      await forwardTime(periodLength.toNumber(), this);

      // If more tokens are added, original users can buy again.
      await token.mint(coinMachine.address, WAD.muln(1000));

      // Original users can buy 250 more tokens, owning 25% of 2000
      userLimit = await coinMachine.getUserLimit(USER0);
      expect(userLimit).to.eq.BN(WAD.muln(250));
    });

    it("cannot set a user limit without a whitelist", async () => {
      await colony.uninstallExtension(COIN_MACHINE, { from: USER0 });
      await colony.installExtension(COIN_MACHINE, version, { from: USER0 });
      const coinMachineAddress = await colonyNetwork.getExtensionInstallation(COIN_MACHINE, colony.address);
      coinMachine = await CoinMachine.at(coinMachineAddress);

      await coinMachine.initialise(token.address, purchaseToken.address, 60 * 60, 10, WAD.muln(100), WAD.muln(200), WAD.divn(2), WAD, ADDRESS_ZERO);

      const userLimit = await coinMachine.getUserLimit(USER0);
      expect(userLimit).to.eq.BN(UINT256_MAX);
    });

    it("can calculate the max purchase at any given time", async () => {
      await colony.uninstallExtension(COIN_MACHINE, { from: USER0 });
      await colony.installExtension(COIN_MACHINE, version, { from: USER0 });
      const coinMachineAddress = await colonyNetwork.getExtensionInstallation(COIN_MACHINE, colony.address);
      coinMachine = await CoinMachine.at(coinMachineAddress);

      // Initial supply of 250 tokens
      await token.mint(coinMachine.address, WAD.muln(250));

      await whitelist.approveUsers([USER0, USER1, USER2], true, { from: USER1 });

      await coinMachine.initialise(
        token.address,
        purchaseToken.address,
        60 * 60,
        10,
        WAD.muln(100),
        WAD.muln(200),
        WAD.divn(2),
        WAD,
        whitelist.address
      );

      const periodLength = await coinMachine.getPeriodLength();

      await purchaseToken.mint(USER0, WAD.muln(500), { from: USER0 });
      await purchaseToken.mint(USER1, WAD.muln(500), { from: USER0 });
      await purchaseToken.mint(USER2, WAD.muln(500), { from: USER0 });
      await purchaseToken.approve(coinMachine.address, WAD.muln(500), { from: USER0 });
      await purchaseToken.approve(coinMachine.address, WAD.muln(500), { from: USER1 });
      await purchaseToken.approve(coinMachine.address, WAD.muln(500), { from: USER2 });

      let maxPurchase;

      // User0 limited by user limit (125)
      maxPurchase = await coinMachine.getMaxPurchase(USER0);
      expect(maxPurchase).to.eq.BN(WAD.muln(125));

      // 100 sold, 150 remaining
      await coinMachine.buyTokens(WAD.muln(100), { from: USER0 });

      await forwardTime(periodLength.toNumber(), this);
      await coinMachine.updatePeriod();

      // 200 sold, 50 remaining
      await coinMachine.buyTokens(WAD.muln(100), { from: USER1 });

      await forwardTime(periodLength.toNumber(), this);
      await coinMachine.updatePeriod();

      // User2 limited by token balance (50)
      maxPurchase = await coinMachine.getMaxPurchase(USER2);
      expect(maxPurchase).to.eq.BN(WAD.muln(50));

      // New supply of 250 tokens
      await token.mint(coinMachine.address, WAD.muln(250));

      // User2 limited by user limit
      maxPurchase = await coinMachine.getMaxPurchase(USER2);
      expect(maxPurchase).to.eq.BN(WAD.muln(200));

      // 350 sold, 150 remaining
      await coinMachine.buyTokens(WAD.muln(150), { from: USER2 });

      // User1 limited by max per period (50 / 200)
      maxPurchase = await coinMachine.getMaxPurchase(USER1);
      expect(maxPurchase).to.eq.BN(WAD.muln(50));
    });
  });
});
