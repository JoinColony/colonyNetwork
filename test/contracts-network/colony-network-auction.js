/* globals artifacts */
import BN from "bn.js";
import { ethers } from "ethers";
import chai from "chai";
import bnChai from "bn-chai";

import {
  getTokenArgs,
  web3GetTransactionReceipt,
  web3GetCode,
  checkErrorRevert,
  forwardTime,
  getBlockTime,
  getColonyEditable,
} from "../../helpers/test-helper";

import { WAD, SECONDS_PER_DAY } from "../../helpers/constants";
import {
  getMetaTransactionParameters,
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  unlockCLNYToken,
  giveUserCLNYTokens,
} from "../../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const DutchAuction = artifacts.require("DutchAuction");
const Token = artifacts.require("Token");

contract("Colony Network Auction", (accounts) => {
  const BIDDER_1 = accounts[1];
  const BIDDER_2 = accounts[2];
  const BIDDER_3 = accounts[3];

  let metaColony;
  let colonyNetwork;
  let tokenAuction;
  let quantity;
  let clnyNeededForMaxPriceAuctionSellout;
  let clnyToken;
  let token;
  let createAuctionTxReceipt;

  before(async () => {
    quantity = new BN(10).pow(new BN(18)).muln(3);
    clnyNeededForMaxPriceAuctionSellout = new BN(10).pow(new BN(36)).muln(3); // eslint-disable-line prettier/prettier
  });

  beforeEach(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));
    await unlockCLNYToken(metaColony);

    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();

    const args = getTokenArgs();
    token = await Token.new(...args);
    await token.unlock();
    await token.mint(colonyNetwork.address, quantity);
    const { logs, receipt } = await colonyNetwork.startTokenAuction(token.address);
    createAuctionTxReceipt = receipt;
    const auctionAddress = logs[0].args.auction;
    tokenAuction = await DutchAuction.at(auctionAddress);
  });

  describe("when initialising an auction", async () => {
    it("should initialise auction with correct given parameters", async () => {
      const clnyAddress = await tokenAuction.clnyToken();
      expect(clnyAddress).to.equal(clnyToken.address);
      const tokenAddress = await tokenAuction.token();
      expect(tokenAddress).to.equal(token.address);
    });

    it("should fail with a zero address token", async () => {
      await checkErrorRevert(colonyNetwork.startTokenAuction(ethers.constants.AddressZero), "colony-auction-invalid-token");
    });

    it("should fail with a zero clny token", async () => {
      const metaColonyUnderRecovery = await getColonyEditable(metaColony, colonyNetwork);
      await metaColonyUnderRecovery.setStorageSlot(7, ethers.constants.AddressZero);

      const args = getTokenArgs();
      token = await Token.new(...args);
      await token.unlock();
      await token.mint(colonyNetwork.address, quantity);
      await checkErrorRevert(colonyNetwork.startTokenAuction(token.address), "colony-auction-invalid-clny-token");
    });

    it("should burn tokens if auction is initialised for the CLNY token", async () => {
      await giveUserCLNYTokens(colonyNetwork, colonyNetwork.address, WAD);
      const supplyBefore = await clnyToken.totalSupply();
      expect(supplyBefore).to.eq.BN(WAD);
      const balanceBefore = await clnyToken.balanceOf(colonyNetwork.address);

      await colonyNetwork.startTokenAuction(clnyToken.address);

      const supplyAfter = await clnyToken.totalSupply();
      const balanceAfter = await clnyToken.balanceOf(colonyNetwork.address);
      expect(balanceAfter).to.be.zero;
      expect(supplyBefore.sub(balanceBefore)).to.eq.BN(supplyAfter);
    });

    it("should fail with zero quantity", async () => {
      const args = getTokenArgs();
      const otherToken = await Token.new(...args);
      await otherToken.unlock();
      await checkErrorRevert(colonyNetwork.startTokenAuction(otherToken.address));
    });

    it("cannot bid if not started", async () => {
      await token.mint(colonyNetwork.address, quantity);
      tokenAuction = await DutchAuction.new(clnyToken.address, token.address, metaColony.address);

      await checkErrorRevert(tokenAuction.bid(1000, { from: BIDDER_1 }), "colony-auction-not-started");
    });

    it("cannot initialise auction if not network owner", async () => {
      await checkErrorRevert(colonyNetwork.startTokenAuction(token.address, { from: accounts[10] }), "ds-auth-unauthorized");
    });
  });

  describe("when starting an auction", async () => {
    it("should set the `quantity` correctly and minPrice to 1", async () => {
      const quantityNow = await tokenAuction.quantity();
      expect(quantityNow).to.eq.BN(quantity);

      const minPrice = await tokenAuction.minPrice();
      expect(minPrice).to.eq.BN(1);
    });

    it("should set the minimum price correctly for quantity < 1e18", async () => {
      const args = getTokenArgs();
      const otherToken = await Token.new(...args);
      await otherToken.unlock();
      await otherToken.mint(colonyNetwork.address, WAD.divn(10));
      const { logs } = await colonyNetwork.startTokenAuction(otherToken.address);
      const auctionAddress = logs[0].args.auction;
      tokenAuction = await DutchAuction.at(auctionAddress);
      const minPrice = await tokenAuction.minPrice();
      expect(minPrice).to.eq.BN(10);
    });

    it("should set the `startTime` correctly", async () => {
      const createAuctionTxBlockNumber = createAuctionTxReceipt.blockNumber;
      const blockTime = await getBlockTime(createAuctionTxBlockNumber);

      const startTime = await tokenAuction.startTime();
      expect(startTime).to.eq.BN(blockTime);
    });

    it("should set the `started` property correctly", async () => {
      const started = await tokenAuction.started();
      expect(started).to.be.true;
    });

    it("should fail starting the auction twice", async () => {
      await checkErrorRevert(colonyNetwork.startTokenAuction(token.address), "colony-auction-start-too-soon");
    });

    it("should fail if the last auction for the same token started less than 30 days", async () => {
      await token.mint(colonyNetwork.address, quantity);
      await checkErrorRevert(colonyNetwork.startTokenAuction(token.address), "colony-auction-start-too-soon");
    });

    const auctionProps = [
      {
        duration: 1000,
        price: new BN("989583333333333333333333333333333333"),
      },
      {
        duration: 72000,
        price: new BN("250000000000000000000000000000000000"),
      },
      {
        duration: 86400,
        price: new BN(10).pow(new BN(35)),
      },
      {
        duration: 144000,
        price: new BN("40000000000000000000000000000000000"),
      },
      {
        duration: 172800,
        price: new BN(10).pow(new BN(34)),
      },
      {
        duration: 259200,
        price: new BN(10).pow(new BN(33)),
      },
      {
        duration: 345600,
        price: new BN(10).pow(new BN(32)),
      },
      {
        duration: 432000,
        price: new BN(10).pow(new BN(31)),
      },
      {
        duration: 518400,
        price: new BN(10).pow(new BN(30)),
      },
      {
        duration: 1382400,
        price: new BN(10).pow(new BN(20)),
      },
      {
        duration: 2937600,
        price: new BN(100),
      },
      {
        duration: 3110400,
        price: new BN(1),
      },
      {
        duration: 3193200, // Crosses the boundary where price of 1 is always returned (for quantity > 1e18)
        price: new BN(1),
      },
    ];

    auctionProps.forEach(async (auctionProp) => {
      it(`should correctly calculate price and remaining CLNY amount to end auction at duration ${auctionProp.duration}`, async () => {
        await forwardTime(auctionProp.duration, this);
        const currentPrice = await tokenAuction.price();

        // Expect up to 1% error margin because of forwarding block time inaccuracies
        const errorMarginPrice = auctionProp.price.divn(100);
        // Chai assert.closeTo does not work with Big Numbers so some manual comaring to error margin is required
        const differencePrices = auctionProp.price.sub(currentPrice);
        expect(differencePrices).to.be.lte.BN(errorMarginPrice);

        const remainingToEndAuction = await tokenAuction.remainingToEndAuction();
        const amount = currentPrice.mul(quantity).div(WAD);
        const errorMarginQuantity = amount.divn(100);
        const differenceQuantity = new BN(remainingToEndAuction).sub(amount);
        expect(differenceQuantity).to.be.lte.BN(errorMarginQuantity);
      });
    });

    it("should succeed if the last auction for the same token was started at least 30 days ago", async () => {
      const previousAuctionStartTime = await tokenAuction.startTime();
      await forwardTime(SECONDS_PER_DAY * 30, this);

      await token.mint(colonyNetwork.address, quantity);

      const { logs } = await colonyNetwork.startTokenAuction(token.address);
      const auctionAddress = logs[0].args.auction;
      const newTokenAuction = await DutchAuction.at(auctionAddress);
      const newAuctionStartTime = await newTokenAuction.startTime();
      expect(previousAuctionStartTime).to.not.eq.BN(newAuctionStartTime);
    });

    it("should fail to start auction twice", async () => {
      await checkErrorRevert(tokenAuction.start(), "colony-auction-already-started");
    });
  });

  describe("when bidding in a high quantity auction (quantity >= 1e18)", async () => {
    it("can bid", async () => {
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, WAD);
      await clnyToken.approve(tokenAuction.address, WAD, { from: BIDDER_1 });
      await tokenAuction.bid(WAD, { from: BIDDER_1 });
      const bid = await tokenAuction.bids(BIDDER_1);
      expect(bid).to.eq.BN(WAD);
      const bidCount = await tokenAuction.bidCount();
      expect(bidCount).to.eq.BN(1);
    });

    it("can bid via metatransaction", async () => {
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, WAD);
      await clnyToken.approve(tokenAuction.address, WAD, { from: BIDDER_1 });
      // await tokenAuction.bid(WAD, { from: BIDDER_1 });
      const txData = await tokenAuction.contract.methods.bid(WAD.toString()).encodeABI();

      const { r, s, v } = await getMetaTransactionParameters(txData, BIDDER_1, tokenAuction.address);

      await tokenAuction.executeMetaTransaction(BIDDER_1, txData, r, s, v, { from: accounts[0] });

      const bid = await tokenAuction.bids(BIDDER_1);
      expect(bid).to.eq.BN(WAD);
      const bidCount = await tokenAuction.bidCount();
      expect(bidCount).to.eq.BN(1);
    });

    it("bid tokens are locked", async () => {
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, WAD);
      await clnyToken.approve(tokenAuction.address, WAD, { from: BIDDER_1 });
      await tokenAuction.bid(WAD, { from: BIDDER_1 });
      const lockedTokens = await clnyToken.balanceOf(tokenAuction.address);
      expect(lockedTokens).to.eq.BN(WAD);
    });

    it("can bid more than once", async () => {
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, "2000000000000000000");
      await clnyToken.approve(tokenAuction.address, "2000000000000000000", { from: BIDDER_1 });
      await tokenAuction.bid("1100000000000000000", { from: BIDDER_1 });
      await tokenAuction.bid("900000000000000000", { from: BIDDER_1 });
      const bidCount = await tokenAuction.bidCount();
      expect(bidCount).to.eq.BN(1);
    });

    it("once target reached, endTime is set correctly", async () => {
      const amount = clnyNeededForMaxPriceAuctionSellout.divn(3);
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, amount);
      await giveUserCLNYTokens(colonyNetwork, BIDDER_2, amount);
      await giveUserCLNYTokens(colonyNetwork, BIDDER_3, amount);
      await clnyToken.approve(tokenAuction.address, amount, { from: BIDDER_1 });
      await clnyToken.approve(tokenAuction.address, amount, { from: BIDDER_2 });
      await clnyToken.approve(tokenAuction.address, amount, { from: BIDDER_3 });
      await tokenAuction.bid(amount, { from: BIDDER_1 });
      await tokenAuction.bid(amount, { from: BIDDER_2 });

      const { tx } = await tokenAuction.bid(amount, { from: BIDDER_3 });
      const receipt = await web3GetTransactionReceipt(tx);
      const bidReceiptBlock = receipt.blockNumber;
      const blockTime = await getBlockTime(bidReceiptBlock);
      const endTime = await tokenAuction.endTime();
      expect(endTime).to.eq.BN(blockTime);

      const bidCount = await tokenAuction.bidCount();
      expect(bidCount).to.eq.BN(3);
    });

    it("if bid overshoots the target quantity, it is only partially accepted", async () => {
      const amount = clnyNeededForMaxPriceAuctionSellout.addn(20);
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, amount);
      await clnyToken.approve(tokenAuction.address, amount, { from: BIDDER_1 });
      const remainingToEndAuction = await tokenAuction.remainingToEndAuction();
      await tokenAuction.bid(amount, { from: BIDDER_1 });
      const receivedTotal = await tokenAuction.receivedTotal();
      const bid = await tokenAuction.bids(BIDDER_1);
      expect(bid).to.be.lte.BN(remainingToEndAuction);
      expect(receivedTotal).to.be.lte.BN(remainingToEndAuction);
      expect(receivedTotal).to.eq.BN(bid);
    });

    it("after target is sold, bid is rejected", async () => {
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, clnyNeededForMaxPriceAuctionSellout.addn(1));
      await clnyToken.approve(tokenAuction.address, clnyNeededForMaxPriceAuctionSellout.addn(1), { from: BIDDER_1 });
      await tokenAuction.bid(clnyNeededForMaxPriceAuctionSellout, { from: BIDDER_1 });
      await checkErrorRevert(tokenAuction.bid(1, { from: BIDDER_1 }), "colony-auction-closed");
    });

    it("cannot finalize when target not reached", async () => {
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, "3000");
      await clnyToken.approve(tokenAuction.address, "3000", { from: BIDDER_1 });
      await tokenAuction.bid("3000", { from: BIDDER_1 });
      await checkErrorRevert(tokenAuction.finalize(), "colony-auction-not-closed");
    });

    it("cannot bid with 0 tokens", async () => {
      await checkErrorRevert(tokenAuction.bid(0), "colony-auction-invalid-bid");
    });

    it("cannot bid more tokens than have approved", async () => {
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, 100);
      await clnyToken.approve(tokenAuction.address, 99, { from: BIDDER_1 });
      await checkErrorRevert(tokenAuction.bid(100), "ds-token-insufficient-approval");
    });

    it("auction closes when the receivedTotal goes over the total amount to end the auction for quantity > 1e18", async () => {
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, quantity);
      await clnyToken.approve(tokenAuction.address, quantity, { from: BIDDER_1 });

      let endTime = await tokenAuction.endTime();
      const amount = new BN(10).pow(new BN(10));

      while (endTime.isZero()) {
        await forwardTime(SECONDS_PER_DAY * 3, this);

        await tokenAuction.bid(amount, { from: BIDDER_1 });
        endTime = await tokenAuction.endTime();
      }

      await tokenAuction.finalize();
      const receivedTotal = await tokenAuction.receivedTotal();
      const endPrice = WAD.mul(receivedTotal).div(quantity);
      const finalPrice = await tokenAuction.finalPrice();
      expect(endPrice).to.eq.BN(finalPrice);
    });

    it("functions correctly even when price has reached the minimum for quantity > 1e18", async () => {
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, quantity);
      await clnyToken.approve(tokenAuction.address, quantity, { from: BIDDER_1 });

      await forwardTime(SECONDS_PER_DAY * 37, this);
      let endTime = await tokenAuction.endTime();
      const amount = new BN(10).pow(new BN(17));

      while (endTime.isZero()) {
        await forwardTime(SECONDS_PER_DAY, this);
        await tokenAuction.bid(amount, { from: BIDDER_1 });
        endTime = await tokenAuction.endTime();
      }

      await tokenAuction.finalize();
      // Check the final price is the minimum price
      const finalPrice = await tokenAuction.finalPrice();
      expect(finalPrice).to.eq.BN(1);
      await tokenAuction.claim(BIDDER_1);
      const tokenBidderBalance = await token.balanceOf(BIDDER_1);
      expect(tokenBidderBalance).to.eq.BN(quantity);
    });
  });

  describe("when bidding in a low quantity auction (quantity < 1e18)", async () => {
    let otherToken;
    beforeEach(async () => {
      const args = getTokenArgs();
      otherToken = await Token.new(...args);
      await otherToken.unlock();
    });

    const auctionPropsLowQuantitiesLowPrice = [
      // Day 34
      {
        scenario: 1,
        daysOpen: 34,
        quantity: new BN(10).pow(new BN(18)).subn(1),
        remainingToEndAuction: 99,
      },
      {
        scenario: 2,
        daysOpen: 34,
        quantity: new BN(10).pow(new BN(18)).subn(10000),
        remainingToEndAuction: 98,
      },
      {
        scenario: 3,
        daysOpen: 34,
        quantity: new BN(10).pow(new BN(17)).addn(1),
        remainingToEndAuction: 10,
      },
      {
        scenario: 4,
        daysOpen: 34,
        quantity: new BN(10).pow(new BN(17)),
        remainingToEndAuction: 10,
      },
      {
        scenario: 5,
        daysOpen: 34,
        quantity: new BN(10).pow(new BN(15)),
        remainingToEndAuction: 1,
      },
      {
        scenario: 6,
        daysOpen: 34,
        quantity: new BN(10).pow(new BN(9)).addn(58),
        remainingToEndAuction: 1,
      },
      {
        scenario: 7,
        daysOpen: 34,
        quantity: new BN(1000),
        remainingToEndAuction: 1,
      },
      {
        scenario: 8,
        daysOpen: 34,
        quantity: new BN(777),
        remainingToEndAuction: 1,
      },
      // Day 35
      {
        scenario: 9,
        daysOpen: 35,
        quantity: new BN(10).pow(new BN(18)).subn(1),
        remainingToEndAuction: 8,
      },
      {
        scenario: 10,
        daysOpen: 35,
        quantity: new BN(10).pow(new BN(18)).subn(10000),
        remainingToEndAuction: 9,
      },
      {
        scenario: 11,
        daysOpen: 35,
        quantity: new BN(10).pow(new BN(17)).addn(1),
        remainingToEndAuction: 1,
      },
      {
        scenario: 12,
        daysOpen: 35,
        quantity: new BN(10).pow(new BN(17)),
        remainingToEndAuction: 1,
      },
      {
        scenario: 13,
        daysOpen: 35,
        quantity: new BN(10).pow(new BN(15)),
        remainingToEndAuction: 1,
      },
      {
        scenario: 14,
        daysOpen: 35,
        quantity: new BN(10).pow(new BN(9)).addn(58),
        remainingToEndAuction: 1,
      },
      {
        scenario: 15,
        daysOpen: 35,
        quantity: new BN(1000),
        remainingToEndAuction: 1,
      },
      {
        scenario: 16,
        daysOpen: 35,
        quantity: new BN(777),
        remainingToEndAuction: 1,
      },
      // Day 36
      {
        scenario: 17,
        daysOpen: 36,
        quantity: new BN(10).pow(new BN(18)).subn(1),
        remainingToEndAuction: 1,
      },
      {
        scenario: 18,
        daysOpen: 36,
        quantity: new BN(10).pow(new BN(18)).subn(10000),
        remainingToEndAuction: 1,
      },
      {
        scenario: 19,
        daysOpen: 36,
        quantity: new BN(10).pow(new BN(17)).addn(1),
        remainingToEndAuction: 1,
      },
      {
        scenario: 20,
        daysOpen: 36,
        quantity: new BN(10).pow(new BN(17)),
        remainingToEndAuction: 1,
      },
      {
        scenario: 21,
        daysOpen: 36,
        quantity: new BN(10).pow(new BN(15)),
        remainingToEndAuction: 1,
      },
      {
        scenario: 22,
        daysOpen: 36,
        quantity: new BN(10).pow(new BN(9)).addn(58),
        remainingToEndAuction: 1,
      },
      {
        scenario: 23,
        daysOpen: 36,
        quantity: new BN(1000),
        remainingToEndAuction: 1,
      },
      {
        scenario: 24,
        daysOpen: 36,
        quantity: new BN(777),
        remainingToEndAuction: 1,
      },
    ];

    auctionPropsLowQuantitiesLowPrice.forEach(async (auctionProp) => {
      it(`should correctly accept bids at low price and finalise auction for scenario ${auctionProp.scenario}`, async () => {
        const bidAmount = new BN(100000);
        await giveUserCLNYTokens(colonyNetwork, BIDDER_1, bidAmount);

        await otherToken.mint(colonyNetwork.address, auctionProp.quantity);

        const { logs } = await colonyNetwork.startTokenAuction(otherToken.address);
        const auctionAddress = logs[0].args.auction;
        tokenAuction = await DutchAuction.at(auctionAddress);
        await clnyToken.approve(tokenAuction.address, bidAmount, { from: BIDDER_1 });

        const duration = auctionProp.daysOpen * SECONDS_PER_DAY;
        await forwardTime(duration, this);
        await tokenAuction.bid(bidAmount, { from: BIDDER_1 });

        // Check only the amount required to end the auction was accepted
        const bid = await tokenAuction.bids(BIDDER_1);
        expect(bid.subn(auctionProp.remainingToEndAuction).toNumber()).to.be.closeTo(0, 1);

        await tokenAuction.finalize();

        await tokenAuction.claim(BIDDER_1);
        const otherTokenBidderBalance = await otherToken.balanceOf(BIDDER_1);
        expect(otherTokenBidderBalance).to.eq.BN(auctionProp.quantity);
      });
    });

    const auctionPropsLowQuantitiesHighPrice = [
      // Day 0
      {
        daysOpen: 0,
        quantity: new BN(1),
        remainingToEndAuction: WAD,
        finalPrice: WAD.mul(WAD),
        claimAmount: new BN(1),
      },
      {
        daysOpen: 0,
        quantity: new BN(2),
        remainingToEndAuction: WAD,
        finalPrice: WAD.mul(WAD),
        claimAmount: new BN(2),
      },
      {
        daysOpen: 0,
        quantity: new BN(200),
        remainingToEndAuction: WAD,
        finalPrice: WAD.mul(WAD),
        claimAmount: new BN(200),
      },
      {
        daysOpen: 0,
        quantity: new BN(20000000000),
        remainingToEndAuction: WAD.muln(2),
        finalPrice: WAD.mul(WAD),
        claimAmount: new BN(20000000000),
      },
    ];

    auctionPropsLowQuantitiesHighPrice.forEach(async (auctionProp) => {
      it(`should correctly accept bids at high price and finalise auction for quantity ${auctionProp.quantity}
      at day open ${auctionProp.daysOpen}`, async () => {
        await otherToken.mint(colonyNetwork.address, auctionProp.quantity);
        const { logs } = await colonyNetwork.startTokenAuction(otherToken.address);
        const auctionAddress = logs[0].args.auction;
        tokenAuction = await DutchAuction.at(auctionAddress);
        const duration = auctionProp.daysOpen * SECONDS_PER_DAY;
        await forwardTime(duration, this);

        const bidAmount = new BN(10).pow(new BN(30));
        await giveUserCLNYTokens(colonyNetwork, BIDDER_1, bidAmount);
        await clnyToken.approve(tokenAuction.address, bidAmount, { from: BIDDER_1 });
        await tokenAuction.bid(bidAmount, { from: BIDDER_1 });

        const bid = await tokenAuction.bids(BIDDER_1);
        // Expect up to 1% error margin because of forwarding block time inaccuracies
        const errorMarginRemainingToEndAuction = auctionProp.remainingToEndAuction.divn(100);
        // Chai assert.closeTo does not work with Big Numbers so some manual comaring to error margin is required
        const differenceRemainingToEndAuction = auctionProp.remainingToEndAuction.sub(bid);
        // Check only the amount required to end the auction was accepted
        expect(differenceRemainingToEndAuction).to.be.lte.BN(errorMarginRemainingToEndAuction);

        await tokenAuction.finalize();
        const finalPrice = await tokenAuction.finalPrice();
        // Expect up to 1% error margin because of forwarding block time inaccuracies
        const errorMarginFinalPrice = auctionProp.finalPrice.divn(100);
        const differenceFinalPrice = auctionProp.finalPrice.sub(finalPrice);
        // Check only the amount required to end the auction was accepted
        expect(differenceFinalPrice).to.be.lte.BN(errorMarginFinalPrice);

        await tokenAuction.claim(BIDDER_1);
        const otherTokenBidderBalance = await otherToken.balanceOf(BIDDER_1);
        expect(otherTokenBidderBalance, "the one bidder didn't receive all tokens").to.eq.BN(auctionProp.claimAmount);
      });
    });

    it("auction closes when the receivedTotal goes over the total amount to end the auction", async () => {
      const totalAmount = new BN(10).pow(new BN(16));
      await otherToken.mint(colonyNetwork.address, totalAmount);
      const { logs } = await colonyNetwork.startTokenAuction(otherToken.address);
      const auctionAddress = logs[0].args.auction;
      tokenAuction = await DutchAuction.at(auctionAddress);

      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, new BN(10).pow(new BN(36)).muln(3));
      await clnyToken.approve(tokenAuction.address, new BN(10).pow(new BN(36)).muln(3), { from: BIDDER_1 });

      let endTime = await tokenAuction.endTime();
      const amount = new BN(10).pow(new BN(20));

      while (endTime.isZero()) {
        await forwardTime(SECONDS_PER_DAY * 3, this);

        await tokenAuction.bid(amount, { from: BIDDER_1 });
        endTime = await tokenAuction.endTime();
      }

      await tokenAuction.finalize();
      const finalPrice = await tokenAuction.finalPrice();
      expect(finalPrice).to.eq.BN(new BN("40000000000000000000000"));
    });

    it("functions correctly even when price has reached the near minimum", async () => {
      const totalAmount = new BN(10).pow(new BN(16));
      await otherToken.mint(colonyNetwork.address, totalAmount);
      const { logs } = await colonyNetwork.startTokenAuction(otherToken.address);
      const auctionAddress = logs[0].args.auction;
      tokenAuction = await DutchAuction.at(auctionAddress);

      const bidAmount1 = new BN(300);
      const bidAmount2 = new BN(20);
      const bidAmount3 = new BN(900);

      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, bidAmount1);
      await giveUserCLNYTokens(colonyNetwork, BIDDER_2, bidAmount2);
      await giveUserCLNYTokens(colonyNetwork, BIDDER_3, bidAmount3);
      await clnyToken.approve(tokenAuction.address, bidAmount1, { from: BIDDER_1 });
      await clnyToken.approve(tokenAuction.address, bidAmount2, { from: BIDDER_2 });
      await clnyToken.approve(tokenAuction.address, bidAmount3, { from: BIDDER_3 });

      await forwardTime(SECONDS_PER_DAY * 31, this);

      await tokenAuction.bid(bidAmount1, { from: BIDDER_1 });
      await tokenAuction.bid(bidAmount2, { from: BIDDER_2 });
      await tokenAuction.bid(bidAmount3, { from: BIDDER_3 });

      await tokenAuction.finalize();

      const receivedTotal = await tokenAuction.receivedTotal();

      await tokenAuction.claim(BIDDER_1);
      const tokenBidder1Balance = await otherToken.balanceOf(BIDDER_1);
      expect(tokenBidder1Balance).to.eq.BN(bidAmount1.mul(totalAmount).div(receivedTotal));
      expect(tokenBidder1Balance.toNumber()).to.be.closeTo(3000000000000000, 3003003003003);

      await tokenAuction.claim(BIDDER_2);
      const tokenBidder2Balance = await otherToken.balanceOf(BIDDER_2);
      expect(tokenBidder2Balance).to.eq.BN(bidAmount2.mul(totalAmount).div(receivedTotal));
      expect(tokenBidder2Balance.toNumber()).to.be.closeTo(200000000000000, 200200200200);

      await tokenAuction.claim(BIDDER_3);
      const tokenBidder3Balance = await otherToken.balanceOf(BIDDER_3);
      expect(tokenBidder3Balance.toNumber()).to.be.closeTo(6700000000000000, 796796796796796);
    });

    // NOTE: Auction for 2 tokens where in the first day, when price is near maximum 1^36 someone bids 1 CLNY
    // after 17 days another bid comes in for 20 CLNY (18 of which are accepted) which closes the auction.
    // What's the fair distribution of these 2 tokens?
    // Here the second bidder gets 1 token and the first none
    // As the true distribution, if we had floats, should be 0.1 and 1.9
    it("functions correctly when there are two bids at the far ends of the price spectrum and one can't go over the claim threshold", async () => {
      const totalAmount = new BN(2);
      await otherToken.mint(colonyNetwork.address, totalAmount);
      const { logs } = await colonyNetwork.startTokenAuction(otherToken.address);
      const auctionAddress = logs[0].args.auction;
      tokenAuction = await DutchAuction.at(auctionAddress);

      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, new BN(1));
      await clnyToken.approve(tokenAuction.address, new BN(1), { from: BIDDER_1 });
      await tokenAuction.bid(new BN(1), { from: BIDDER_1 });

      await forwardTime(SECONDS_PER_DAY * 17, this);

      await giveUserCLNYTokens(colonyNetwork, BIDDER_2, 20);
      await clnyToken.approve(tokenAuction.address, 20, { from: BIDDER_2 });
      await tokenAuction.bid(20, { from: BIDDER_2 });

      await tokenAuction.finalize();

      await tokenAuction.claim(BIDDER_1);
      await tokenAuction.claim(BIDDER_2);

      const balanceBidder1 = await otherToken.balanceOf(BIDDER_1);
      expect(balanceBidder1).to.be.zero;

      const balanceBidder2 = await otherToken.balanceOf(BIDDER_2);
      expect(balanceBidder2).to.eq.BN(1);
    });

    // NOTE: Auction for 2 tokens where in the first day, when price is near maximum 1^36 someone bids 9 CLNY
    // after 17 days 1 bid for 9 CLNY and a third for 9 CLNY (1 of which is accepted) which closes the auction.
    // What's the fair distribution of these 2 tokens?
    // Here no bid gets any tokens
    it("functions correctly when there are three bids in a low quantity auction, and none gets over the claim threshold", async () => {
      const totalAmount = new BN(2);
      await otherToken.mint(colonyNetwork.address, totalAmount);
      const { logs } = await colonyNetwork.startTokenAuction(otherToken.address);
      const auctionAddress = logs[0].args.auction;
      tokenAuction = await DutchAuction.at(auctionAddress);

      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, 9);
      await clnyToken.approve(tokenAuction.address, 9, { from: BIDDER_1 });
      await tokenAuction.bid(9, { from: BIDDER_1 });

      await forwardTime(SECONDS_PER_DAY * 17, this);

      await giveUserCLNYTokens(colonyNetwork, BIDDER_2, 9);
      await clnyToken.approve(tokenAuction.address, 9, { from: BIDDER_2 });
      await tokenAuction.bid(9, { from: BIDDER_2 });

      await giveUserCLNYTokens(colonyNetwork, BIDDER_3, 9);
      await clnyToken.approve(tokenAuction.address, 9, { from: BIDDER_3 });
      await tokenAuction.bid(9, { from: BIDDER_3 }); // Only 1 CLNY gets accepted in the bid

      await tokenAuction.finalize();

      await tokenAuction.claim(BIDDER_1);
      await tokenAuction.claim(BIDDER_2);
      await tokenAuction.claim(BIDDER_3);

      const balanceBidder1 = await otherToken.balanceOf(BIDDER_1);
      expect(balanceBidder1).to.be.zero;

      const balanceBidder2 = await otherToken.balanceOf(BIDDER_2);
      expect(balanceBidder2).to.be.zero;

      const balanceBidder3 = await otherToken.balanceOf(BIDDER_3);
      expect(balanceBidder3).to.be.zero;
    });
  });

  describe("when finalizing auction", async () => {
    beforeEach(async () => {
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, clnyNeededForMaxPriceAuctionSellout);
      await clnyToken.approve(tokenAuction.address, clnyNeededForMaxPriceAuctionSellout, { from: BIDDER_1 });
      await tokenAuction.bid(clnyNeededForMaxPriceAuctionSellout, { from: BIDDER_1 });
    });

    it("sets correct final token price", async () => {
      await tokenAuction.finalize();
      const receivedTotal = await tokenAuction.receivedTotal();
      const endPrice = WAD.mul(receivedTotal).div(quantity); // eslint-disable-line prettier/prettier
      const finalPrice = await tokenAuction.finalPrice();
      expect(endPrice).to.eq.BN(finalPrice);
    });

    it("sets the finalized property", async () => {
      await tokenAuction.finalize();
      const finalized = await tokenAuction.finalized();
      expect(finalized).to.be.true;
    });

    it("all CLNY sent to the auction in bids is burned", async () => {
      const balanceBefore = await clnyToken.balanceOf(tokenAuction.address);
      const supplyBefore = await clnyToken.totalSupply();
      const receivedTotal = await tokenAuction.receivedTotal();
      expect(receivedTotal).to.not.be.zero;
      await tokenAuction.finalize();

      const balanceAfter = await clnyToken.balanceOf(tokenAuction.address);
      expect(balanceAfter).to.be.zero;
      const supplyAfter = await clnyToken.totalSupply();
      expect(supplyBefore.sub(supplyAfter)).to.eq.BN(balanceBefore);
    });

    it("cannot bid after finalized", async () => {
      await tokenAuction.finalize();
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, 1000);
      await clnyToken.approve(tokenAuction.address, 1000, { from: BIDDER_1 });
      await checkErrorRevert(tokenAuction.bid(1000, { from: BIDDER_1 }), "colony-auction-closed");
    });

    it("cannot finalize after finalized once", async () => {
      await tokenAuction.finalize();
      await checkErrorRevert(tokenAuction.finalize(), "colony-auction-already-finalized");
    });

    it("cannot claim if not finalized", async () => {
      await checkErrorRevert(tokenAuction.claim(BIDDER_1), "colony-auction-not-finalized");
    });
  });

  describe("when claiming tokens", async () => {
    it("should transfer to bidder correct number of tokens at finalPrice", async () => {
      const bidAmount1 = new BN(10).pow(new BN(18));
      const bidAmount2 = new BN(10).pow(new BN(18));
      const bidAmount3 = new BN(10).pow(new BN(18)).muln(199);

      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, bidAmount1);
      await giveUserCLNYTokens(colonyNetwork, BIDDER_2, bidAmount2);
      await giveUserCLNYTokens(colonyNetwork, BIDDER_3, bidAmount3);
      await clnyToken.approve(tokenAuction.address, bidAmount1, { from: BIDDER_1 });
      await clnyToken.approve(tokenAuction.address, bidAmount2, { from: BIDDER_2 });
      await clnyToken.approve(tokenAuction.address, bidAmount3, { from: BIDDER_3 });

      await tokenAuction.bid(bidAmount1, { from: BIDDER_1 }); // Bids at near max price of 1e36 CLNY per 1e18 Tokens
      await forwardTime(SECONDS_PER_DAY * 17, this); // Gets us near price of 1e20 CLNY per 1e18 Tokens
      await tokenAuction.bid(bidAmount2, { from: BIDDER_2 });
      await tokenAuction.bid(bidAmount3, { from: BIDDER_3 });

      await tokenAuction.finalize();

      let claimCount;
      let tokenBidderBalance;
      let tokensToClaim;

      await tokenAuction.claim(BIDDER_1);
      claimCount = await tokenAuction.claimCount();
      expect(claimCount).to.eq.BN(1);

      const finalPrice = await tokenAuction.finalPrice();
      tokenBidderBalance = await token.balanceOf(BIDDER_1);
      tokensToClaim = bidAmount1.mul(WAD).div(finalPrice);
      expect(tokenBidderBalance).to.eq.BN(tokensToClaim);

      await tokenAuction.claim(BIDDER_2);
      claimCount = await tokenAuction.claimCount();
      expect(claimCount).to.eq.BN(2);
      tokenBidderBalance = await token.balanceOf(BIDDER_2);
      tokensToClaim = bidAmount2.mul(WAD).div(finalPrice);
      expect(tokenBidderBalance).to.eq.BN(tokensToClaim);

      const bid3 = await tokenAuction.bids(BIDDER_3);
      await tokenAuction.claim(BIDDER_3);
      claimCount = await tokenAuction.claimCount();
      expect(claimCount).to.eq.BN(3);
      tokenBidderBalance = await token.balanceOf(BIDDER_3);
      tokensToClaim = bid3.mul(WAD).div(finalPrice);
      expect(tokenBidderBalance).to.eq.BN(tokensToClaim);
    });

    it("should set the bid amount to 0", async () => {
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, clnyNeededForMaxPriceAuctionSellout);
      await clnyToken.approve(tokenAuction.address, clnyNeededForMaxPriceAuctionSellout, { from: BIDDER_1 });
      await tokenAuction.bid(clnyNeededForMaxPriceAuctionSellout, { from: BIDDER_1 });
      await tokenAuction.finalize();
      await tokenAuction.claim(BIDDER_1);
      const bid = await tokenAuction.bids(BIDDER_1);
      expect(bid).to.be.zero;
    });

    it("should fail if bidder amount is 0", async () => {
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, clnyNeededForMaxPriceAuctionSellout);
      await clnyToken.approve(tokenAuction.address, clnyNeededForMaxPriceAuctionSellout, { from: BIDDER_1 });
      await tokenAuction.bid(clnyNeededForMaxPriceAuctionSellout, { from: BIDDER_1 });
      await tokenAuction.finalize();
      await checkErrorRevert(tokenAuction.claim(BIDDER_2), "colony-auction-zero-bid-total");
    });
  });

  describe("when destructing the auction", async () => {
    beforeEach(async () => {
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, clnyNeededForMaxPriceAuctionSellout);
      await clnyToken.approve(tokenAuction.address, clnyNeededForMaxPriceAuctionSellout, { from: BIDDER_1 });
      await tokenAuction.bid(clnyNeededForMaxPriceAuctionSellout, { from: BIDDER_1 });
    });

    it("should be able to destruct the auction and kill the auction contract", async () => {
      await tokenAuction.finalize();
      await tokenAuction.claim(BIDDER_1);
      await tokenAuction.destruct();
      const code = await web3GetCode(tokenAuction.address);
      expect(code).to.equal("0x");
    });

    it("should fail if auction not finalized", async () => {
      await checkErrorRevert(tokenAuction.destruct(), "colony-auction-not-finalized");
    });

    it("should fail if not all bids have been claimed", async () => {
      await tokenAuction.finalize();
      await checkErrorRevert(tokenAuction.destruct(), "colony-auction-not-all-bids-claimed");
    });

    it("should transfer any CLNY tokens left owned by the auction to the meta colony", async () => {
      await tokenAuction.finalize();
      await tokenAuction.claim(BIDDER_1);
      await metaColony.mintTokens(100);
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, 100);
      await clnyToken.transfer(tokenAuction.address, 100, { from: BIDDER_1 });

      const metaColonyBalanceBefore = await clnyToken.balanceOf(metaColony.address);
      await tokenAuction.destruct();
      const metaColonyBalanceAfter = await clnyToken.balanceOf(metaColony.address);
      expect(metaColonyBalanceAfter.sub(metaColonyBalanceBefore)).to.eq.BN(100);
    });
  });
});
