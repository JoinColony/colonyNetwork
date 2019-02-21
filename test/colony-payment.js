/* global artifacts */
import chai from "chai";
import bnChai from "bn-chai";
import { BN } from "bn.js";

import { WAD } from "../helpers/constants";
import { checkErrorRevert } from "../helpers/test-helper";
import { fundColonyWithTokens, setupRandomColony } from "../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");

contract.skip("Colony Payment", accounts => {
  const RECIPIENT = accounts[3];
  const COLONY_ADMIN = accounts[4];

  let colony;
  let token;
  let colonyNetwork;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.setRewardInverse(100);
    await colony.setAdminRole(COLONY_ADMIN);
    await fundColonyWithTokens(colony, token, WAD.muln(2));
  });

  describe("when adding payments", () => {
    it("should allow admins to add payment", async () => {
      const paymentsCountBefore = await colony.getPaymentCount();
      await colony.addPayment(RECIPIENT, token.address, WAD, 1, 0);

      const paymentsCountAfter = await colony.getPaymentCount();
      expect(paymentsCountAfter.sub(paymentsCountBefore)).to.eq.BN(1);

      const fundingPotId = await colony.getFundingPotCount();
      const payment = await colony.getPayment(paymentsCountAfter);

      expect(payment.recipient).to.equal(RECIPIENT);
      expect(payment.token).to.equal(token.address);
      expect(payment.amount).to.eq.BN(WAD);
      expect(payment.fundingPotId).to.eq.BN(fundingPotId);
      expect(payment.domainId).to.eq.BN(1);
    });

    it("should not allow admins to add payment with no domain set", async () => {
      await checkErrorRevert(colony.addPayment(RECIPIENT, token.address, WAD, 0, 0), "colony-domain-does-not-exist");
    });
  });

  describe("when funding payments", () => {
    it("should allow admins to fund a payment", async () => {
      await colony.addPayment(RECIPIENT, token.address, WAD, 1, 0);
      const paymentId = await colony.getPaymentCount();
      const payment = await colony.getPayment(paymentId);

      await colony.moveFundsBetweenPots(1, payment.fundingPotId, 40, token.address);
    });
  });

  describe("when claiming payments", () => {
    it("should allow recipient to claim their payment and network fee is deducated", async () => {
      await colony.addPayment(RECIPIENT, token.address, WAD, 1, 0);
      const paymentId = await colony.getPaymentCount();
      const payment = await colony.getPayment(paymentId);

      await colony.moveFundsBetweenPots(1, payment.fundingPotId, WAD.add(WAD.divn(10)), token.address);

      const recipientBalanceBefore = await token.balanceOf(RECIPIENT);
      const networkBalanceBefore = await token.balanceOf(colonyNetwork.address);
      await colony.claimPayment(paymentId, { from: RECIPIENT });

      const recipientBalanceAfter = await token.balanceOf(RECIPIENT);
      const networkBalanceAfter = await token.balanceOf(colonyNetwork.address);
      expect(recipientBalanceAfter.sub(recipientBalanceBefore)).to.eq.BN(new BN("989999999999999999"));
      expect(networkBalanceAfter.sub(networkBalanceBefore)).to.eq.BN(new BN("10000000000000001"));
    });

    it("should error when payment is insufficiently funded", async () => {
      await colony.addPayment(RECIPIENT, token.address, 10000, 1, 0);
      const paymentId = await colony.getPaymentCount();
      const payment = await colony.getPayment(paymentId);

      await colony.moveFundsBetweenPots(1, payment.fundingPotId, 9999, token.address);
      await checkErrorRevert(colony.claimPayment(paymentId), "colony-payment-insufficient-funding");
    });
  });
});
