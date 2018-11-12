/* globals artifacts */
import { BN } from "bn.js";
import chai from "chai";
import bnChai from "bn-chai";

import { getTokenArgs, web3GetTransactionReceipt, web3GetCode, checkErrorRevert, forwardTime, getBlockTime } from "../helpers/test-helper";
import { ZERO_ADDRESS, WAD, SECONDS_PER_DAY } from "../helpers/constants";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, unlockCLNYToken } from "../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const DutchAuction = artifacts.require("DutchAuction");
const DSToken = artifacts.require("DSToken");

contract("Colony Network Auction", accounts => {
  const BIDDER_1 = accounts[1];
  const BIDDER_2 = accounts[2];
  const BIDDER_3 = accounts[3];
  const PATRON = accounts[4];

  let metaColony;
  let colonyNetwork;
  let tokenAuction;
  let quantity;
  let clnyNeededForMaxPriceAuctionSellout;
  let clnyToken;
  let token;
  let createAuctionTxReceipt;

  before(async () => {
    quantity = new BN(10).pow(new BN(36)).muln(3);
    clnyNeededForMaxPriceAuctionSellout = new BN(10).pow(new BN(54)).muln(3);
  });

  beforeEach(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

    // HACK: give some large amount (enough for the test) to this account before unlocking.
    await clnyToken.mint(clnyNeededForMaxPriceAuctionSellout.muln(2), { from: accounts[11] });
    await clnyToken.transfer(PATRON, clnyNeededForMaxPriceAuctionSellout.muln(2), { from: accounts[11] });

    await unlockCLNYToken(metaColony);

    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();

    const args = getTokenArgs();
    token = await DSToken.new(args[1]);
    await token.mint(quantity);
    await token.transfer(colonyNetwork.address, quantity);
    const { logs, receipt } = await colonyNetwork.startTokenAuction(token.address);
    createAuctionTxReceipt = receipt;
    const auctionAddress = logs[0].args.auction;
    tokenAuction = await DutchAuction.at(auctionAddress);
  });

  // HACK: transparently give out PATRON tokens instead of actually minting.
  async function giveUserCLNYTokens(_, user, amount) {
    await clnyToken.transfer(user, amount, { from: PATRON });
  }

  describe("when initialising an auction", async () => {
    it("should initialise auction with correct given parameters", async () => {
      const clnyAddress = await tokenAuction.clnyToken();
      expect(clnyAddress).to.equal(clnyToken.address);
      const tokenAddress = await tokenAuction.token();
      expect(tokenAddress).to.equal(token.address);
    });

    it("should fail with a zero address token", async () => {
      await checkErrorRevert(colonyNetwork.startTokenAuction(ZERO_ADDRESS), "colony-auction-invalid-token");
    });

    it("should burn tokens if auction is initialised for the CLNY token", async () => {
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, WAD);
      const supplyBefore = await clnyToken.totalSupply();
      const balanceBefore = await clnyToken.balanceOf(colonyNetwork.address);
      await colonyNetwork.startTokenAuction(clnyToken.address);

      const supplyAfter = await clnyToken.totalSupply();
      const balanceAfter = await clnyToken.balanceOf(colonyNetwork.address);
      expect(balanceAfter).to.be.zero;
      expect(supplyBefore.sub(balanceBefore)).to.eq.BN(supplyAfter);
    });

    it("should fail with zero quantity", async () => {
      const args = getTokenArgs();
      const otherToken = await DSToken.new(args[1]);
      await checkErrorRevert(colonyNetwork.startTokenAuction(otherToken.address));
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
      const otherToken = await DSToken.new(args[1]);
      await otherToken.mint(WAD.divn(10));
      await otherToken.transfer(colonyNetwork.address, WAD.divn(10));
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
      await token.mint(quantity);
      await token.transfer(colonyNetwork.address, quantity);
      await checkErrorRevert(colonyNetwork.startTokenAuction(token.address), "colony-auction-start-too-soon");
    });

    const auctionProps = [
      {
        duration: 1000,
        price: new BN("989583333333333333333333333333333333")
      },
      {
        duration: 72000,
        price: new BN("250000000000000000000000000000000000")
      },
      {
        duration: 86400,
        price: new BN(10).pow(new BN(35))
      },
      {
        duration: 144000,
        price: new BN("40000000000000000000000000000000000")
      },
      {
        duration: 172800,
        price: new BN(10).pow(new BN(34))
      },
      {
        duration: 259200,
        price: new BN(10).pow(new BN(33))
      },
      {
        duration: 345600,
        price: new BN(10).pow(new BN(32))
      },
      {
        duration: 432000,
        price: new BN(10).pow(new BN(31))
      },
      {
        duration: 518400,
        price: new BN(10).pow(new BN(30))
      },
      {
        duration: 1382400,
        price: new BN(10).pow(new BN(20))
      },
      {
        duration: 2937600,
        price: new BN(100)
      },
      {
        duration: 3110400,
        price: new BN(1)
      },
      {
        duration: 3193200, // Crosses the boundary where price of 1 is always returned (for quantity > 1e18)
        price: new BN(1)
      }
    ];

    auctionProps.forEach(async auctionProp => {
      it(`should correctly calculate price and remaining CLNY amount to end auction at duration ${auctionProp.duration}`, async () => {
        await forwardTime(auctionProp.duration, this);
        const currentPrice = await tokenAuction.price();
        // Expect up to 1% error margin because of forwarding block time inaccuracies
        const errorMarginPrice = auctionProp.price.divn(100);
        // Chai assert.closeTo does not work with Big Numbers so some manual comaring to error margin is required
        const differencePrices = auctionProp.price.sub(currentPrice);
        expect(differencePrices).to.be.lte.BN(errorMarginPrice);

        const totalToEndAuction = await tokenAuction.totalToEndAuction();
        const amount = currentPrice.mul(quantity).div(WAD);
        const errorMarginQuantity = amount.divn(100);
        const differenceQuantity = totalToEndAuction.sub(amount);
        expect(differenceQuantity).to.be.lte.BN(errorMarginQuantity);
      });
    });

    it("should succeed if the last auction for the same token was started at least 30 days ago", async () => {
      const previousAuctionStartTime = await tokenAuction.startTime();
      await forwardTime(SECONDS_PER_DAY * 30, this);

      await token.mint(quantity);
      await token.transfer(colonyNetwork.address, quantity);

      const { logs } = await colonyNetwork.startTokenAuction(token.address);
      const auctionAddress = logs[0].args.auction;
      const newTokenAuction = await DutchAuction.at(auctionAddress);
      const newAuctionStartTime = await newTokenAuction.startTime();
      expect(previousAuctionStartTime).to.not.eq.BN(newAuctionStartTime);
    });
  });

  describe("when bidding", async () => {
    it("can bid", async () => {
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, WAD);
      await clnyToken.approve(tokenAuction.address, WAD, { from: BIDDER_1 });
      await tokenAuction.bid(WAD, { from: BIDDER_1 });
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
      const totalToEndAuction = await tokenAuction.totalToEndAuction();
      await tokenAuction.bid(amount, { from: BIDDER_1 });
      const receivedTotal = await tokenAuction.receivedTotal();
      const bid = await tokenAuction.bids(BIDDER_1);
      expect(bid).to.be.lte.BN(totalToEndAuction);
      expect(receivedTotal).to.be.lte.BN(totalToEndAuction);
      expect(receivedTotal).to.eq.BN(bid.toString());
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

    it("auction closes when the receivedTotal goes over the total amount to end the auction", async () => {
      // Considers totalToEndAuction < receivedTotal as per colonyNetwork#416
      // mul(quantity, price()) / TOKEN_MULTIPLIER < receivedTotal
      // quantity * price() < receivedTotal * TOKEN_MULTIPLIER
      // price() < (receivedTotal * TOKEN_MULTIPLIER) / quantity
      // price() < (receivedTotal * 10^18) / quantity

      // Aim: receivedTotal > _totalToEndAuction
      const amount = clnyNeededForMaxPriceAuctionSellout.divn(3);
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, amount);
      await giveUserCLNYTokens(colonyNetwork, BIDDER_2, amount);
      await giveUserCLNYTokens(colonyNetwork, BIDDER_3, amount);
      await clnyToken.approve(tokenAuction.address, amount, { from: BIDDER_1 });
      await clnyToken.approve(tokenAuction.address, amount, { from: BIDDER_2 });
      await clnyToken.approve(tokenAuction.address, amount, { from: BIDDER_3 });

      let price = await tokenAuction.price();
      let totalToEndAuction = await tokenAuction.totalToEndAuction();
      let receivedTotal = await tokenAuction.receivedTotal();
      console.log("price", price.toString()); // 999937500000000000000000000000000000
      console.log("totalToEndAuction", totalToEndAuction.toString()); // 2999812500000000000000000000000000000000000000000000000
      console.log("receivedTotal", receivedTotal.toString()); // 0

      await tokenAuction.bid(amount.divn(10), { from: BIDDER_1 });
      await tokenAuction.bid(amount.divn(10), { from: BIDDER_2 });
      await tokenAuction.bid(amount.divn(10), { from: BIDDER_3 });

      await forwardTime(SECONDS_PER_DAY * 30, this);
      price = await tokenAuction.price();
      totalToEndAuction = await tokenAuction.totalToEndAuction();
      receivedTotal = await tokenAuction.receivedTotal();
      console.log("price", price.toString()); // 999937
      console.log("totalToEndAuction", totalToEndAuction.toString()); // 2999811000000000000000000
      console.log("receivedTotal", receivedTotal.toString()); // 300000000000000000000000000000000000000000000000000000

      await tokenAuction.bid("3000000000000000000000000", { from: BIDDER_1 });

      await tokenAuction.finalize();
      const receivedTotal = await tokenAuction.receivedTotal();
      const endPrice = new BN(10)
        .pow(new BN(18))
        .mul(new BN(receivedTotal.toString(10)))
        .div(quantity)
        .addn(1);
      const finalPrice = await tokenAuction.finalPrice();
      assert.equal(endPrice.toString(), finalPrice.toString(10));
    });

    it("functions correctly even when price is at minimum", async () => {
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, quantity);
      await clnyToken.approve(tokenAuction.address, quantity, { from: BIDDER_1 });

      await forwardTime(SECONDS_PER_DAY * 34, this);
      let endTime = await tokenAuction.endTime();
      const amount = new BN(10).pow(new BN(17));

      while (endTime.isZero()) {
        await forwardTime(SECONDS_PER_DAY, this);
        await tokenAuction.bid(amount, { from: BIDDER_1 });
        // const price = await tokenAuction.price();
        // const totalToEndAuction = await tokenAuction.totalToEndAuction();
        // const receivedTotal = await tokenAuction.receivedTotal();
        endTime = await tokenAuction.endTime();
        // console.log("price", price.toString());
        // console.log("totalToEndAuction", totalToEndAuction.toString());
        // console.log("receivedTotal", receivedTotal.toString());
      }

      await tokenAuction.finalize();
      // Check the final price is the minimum price
      const finalPrice = await tokenAuction.finalPrice();
      assert.equal(1, finalPrice.toString(10));
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
      const endPrice = WAD.mul(receivedTotal).div(quantity).addn(1); // eslint-disable-line prettier/prettier
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
      await checkErrorRevert(tokenAuction.claim({ from: BIDDER_1 }), "colony-auction-not-finalized");
    });
  });

  describe("when claiming tokens", async () => {
    it("should transfer to bidder correct number of tokens at finalPrice", async () => {
      const bidAmount1 = new BN(10).pow(new BN(36));
      const bidAmount2 = new BN(10).pow(new BN(38));
      const bidAmount3 = new BN(10).pow(new BN(36)).muln(199);

      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, bidAmount1);
      await giveUserCLNYTokens(colonyNetwork, BIDDER_2, bidAmount2);
      await giveUserCLNYTokens(colonyNetwork, BIDDER_3, bidAmount3);
      await clnyToken.approve(tokenAuction.address, bidAmount1, { from: BIDDER_1 });
      await clnyToken.approve(tokenAuction.address, bidAmount2, { from: BIDDER_2 });
      await clnyToken.approve(tokenAuction.address, bidAmount3, { from: BIDDER_3 });

      await tokenAuction.bid(bidAmount1, { from: BIDDER_1 }); // Bids at near max price of 1e36 CLNY per 1e18 Tokens
      await forwardTime(SECONDS_PER_DAY * 16, this); // Gets us near price of 1e20 CLNY per 1e18 Tokens
      await tokenAuction.bid(bidAmount2, { from: BIDDER_2 });
      await tokenAuction.bid(bidAmount3, { from: BIDDER_3 });

      await tokenAuction.finalize();
      const finalPrice = await tokenAuction.finalPrice();

      let claimCount;
      let tokenBidderBalance;
      let tokensToClaim;

      await tokenAuction.claim({ from: BIDDER_1 });
      claimCount = await tokenAuction.claimCount();
      expect(claimCount).to.eq.BN(1);

      tokenBidderBalance = await token.balanceOf(BIDDER_1);
      tokensToClaim = WAD.mul(bidAmount1).div(finalPrice);
      expect(tokenBidderBalance).to.eq.BN(tokensToClaim);

      await tokenAuction.claim({ from: BIDDER_2 });
      claimCount = await tokenAuction.claimCount();
      expect(claimCount).to.eq.BN(2);
      tokenBidderBalance = await token.balanceOf(BIDDER_2);
      tokensToClaim = WAD.mul(bidAmount2).div(finalPrice);
      expect(tokenBidderBalance).to.eq.BN(tokensToClaim);

      const bid3 = await tokenAuction.bids(BIDDER_3);
      await tokenAuction.claim({ from: BIDDER_3 });
      claimCount = await tokenAuction.claimCount();
      expect(claimCount).to.eq.BN(3);
      tokenBidderBalance = await token.balanceOf(BIDDER_3);
      const bid3BN = new BN(bid3.toString(10));
      tokensToClaim = WAD.mul(bid3BN).div(finalPrice);
      expect(tokenBidderBalance).to.eq.BN(tokensToClaim);
    });

    it("should set the bid amount to 0", async () => {
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, clnyNeededForMaxPriceAuctionSellout);
      await clnyToken.approve(tokenAuction.address, clnyNeededForMaxPriceAuctionSellout, { from: BIDDER_1 });
      await tokenAuction.bid(clnyNeededForMaxPriceAuctionSellout, { from: BIDDER_1 });

      await tokenAuction.finalize();
      await tokenAuction.claim({ from: BIDDER_1 });
      const bid = await tokenAuction.bids(BIDDER_1);
      expect(bid).to.be.zero;
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
      await tokenAuction.claim({ from: BIDDER_1 });
      await tokenAuction.destruct();
      const code = await web3GetCode(tokenAuction.address);
      const emptyCode = process.env.SOLIDITY_COVERAGE ? "0x0" : "0x";
      expect(code).to.equal(emptyCode);
    });

    it("should fail if auction not finalized", async () => {
      await checkErrorRevert(tokenAuction.destruct(), "colony-auction-not-finalized");
    });

    it("should fail if not all bids have been claimed", async () => {
      await tokenAuction.finalize();
      await checkErrorRevert(tokenAuction.destruct(), "colony-auction-not-all-bids-claimed");
    });

    it("should fail if there are CLNY tokens left owned by the auction", async () => {
      await tokenAuction.finalize();
      await tokenAuction.claim({ from: BIDDER_1 });
      await metaColony.mintTokens(100);
      await giveUserCLNYTokens(colonyNetwork, BIDDER_1, 100);
      await clnyToken.transfer(tokenAuction.address, 100, { from: BIDDER_1 });
      await checkErrorRevert(tokenAuction.destruct());
    });
  });
});
