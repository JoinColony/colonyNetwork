/* global artifacts */
import chai from "chai";
import bnChai from "bn-chai";
import BN from "bn.js";
import { ethers } from "ethers";

import { UINT256_MAX, WAD, MAX_PAYOUT } from "../../helpers/constants";
import { checkErrorRevert, getTokenArgs, expectEvent } from "../../helpers/test-helper";
import { fundColonyWithTokens, setupRandomColony } from "../../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IMetaColony = artifacts.require("IMetaColony");
const Token = artifacts.require("Token");

contract("Colony Payment", (accounts) => {
  const RECIPIENT = accounts[3];
  const COLONY_ADMIN = accounts[4];

  let colony;
  let token;
  let otherToken;
  let colonyNetwork;
  let metaColony;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);

    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.setRewardInverse(100);
    await colony.setAdministrationRole(1, UINT256_MAX, COLONY_ADMIN, 1, true);
    await fundColonyWithTokens(colony, token, WAD.muln(20));

    const tokenArgs = getTokenArgs();
    otherToken = await Token.new(...tokenArgs);
    await otherToken.unlock();
  });

  describe("when adding payments", () => {
    it("should allow admins to add payment", async () => {
      const paymentsCountBefore = await colony.getPaymentCount();
      const tx = await colony.addPayment(1, UINT256_MAX, RECIPIENT, token.address, WAD, 1, 0, { from: COLONY_ADMIN });

      const paymentsCountAfter = await colony.getPaymentCount();
      await expectEvent(tx, "PaymentAdded", [COLONY_ADMIN, paymentsCountAfter]);
      await expectEvent(tx, "PaymentRecipientSet", [COLONY_ADMIN, paymentsCountAfter, RECIPIENT]);
      // console.log(JSON.stringify(tx))
      await expectEvent(tx, "PaymentPayoutSet", [COLONY_ADMIN, paymentsCountAfter, token.address, WAD]);
      expect(paymentsCountAfter.sub(paymentsCountBefore)).to.eq.BN(1);

      const fundingPotId = await colony.getFundingPotCount();
      const payment = await colony.getPayment(paymentsCountAfter);

      expect(payment.recipient).to.equal(RECIPIENT);
      expect(payment.fundingPotId).to.eq.BN(fundingPotId);
      expect(payment.domainId).to.eq.BN(1);

      const fundingPot = await colony.getFundingPot(fundingPotId);
      expect(fundingPot.associatedType).to.eq.BN(3); // 3 = FundingPotAssociatedType.Payment
      expect(fundingPot.associatedTypeId).to.eq.BN(paymentsCountAfter);
      expect(fundingPot.payoutsWeCannotMake).to.eq.BN(1);

      const payout = await colony.getFundingPotPayout(fundingPotId, token.address);
      expect(payout).to.eq.BN(WAD);
    });

    it("should not allow admins to add payment with no domain set", async () => {
      await checkErrorRevert(
        colony.addPayment(1, UINT256_MAX, RECIPIENT, token.address, WAD, 0, 0, { from: COLONY_ADMIN }),
        "ds-auth-child-domain-does-not-exist"
      );
    });

    it("should not allow admins to add payment with no recipient set", async () => {
      await checkErrorRevert(
        colony.addPayment(1, UINT256_MAX, ethers.constants.AddressZero, token.address, WAD, 1, 0, { from: COLONY_ADMIN }),
        "colony-payment-invalid-recipient"
      );
    });

    it("should allow admins to add payment with zero token amount", async () => {
      await colony.addPayment(1, UINT256_MAX, RECIPIENT, token.address, 0, 1, 0, { from: COLONY_ADMIN });

      const fundingPotId = await colony.getFundingPotCount();
      const fundingPotBalance = await colony.getFundingPotBalance(fundingPotId, token.address);
      expect(fundingPotBalance).to.be.zero;
    });

    it("should not allow admins to add payment with deprecated global skill", async () => {
      await metaColony.addGlobalSkill();
      const skillId = await colonyNetwork.getSkillCount();
      await metaColony.deprecateGlobalSkill(skillId);

      await checkErrorRevert(
        colony.addPayment(1, UINT256_MAX, RECIPIENT, token.address, 0, 1, skillId, { from: COLONY_ADMIN }),
        "colony-deprecated-global-skill"
      );
    });

    it("should not allow non-admins to add payment", async () => {
      await checkErrorRevert(colony.addPayment(1, UINT256_MAX, RECIPIENT, token.address, WAD, 1, 0, { from: accounts[10] }), "ds-auth-unauthorized");
    });

    it("should not be able to set a payout above the limit", async () => {
      await checkErrorRevert(
        colony.addPayment(1, UINT256_MAX, RECIPIENT, token.address, MAX_PAYOUT.addn(1), 1, 0, { from: COLONY_ADMIN }),
        "colony-payout-too-large"
      );
    });
  });

  describe("when updating payments", () => {
    it("should allow admins to update recipient", async () => {
      await colony.addPayment(1, UINT256_MAX, RECIPIENT, token.address, WAD, 1, 0, { from: COLONY_ADMIN });
      const paymentId = await colony.getPaymentCount();

      await colony.setPaymentRecipient(1, UINT256_MAX, paymentId, accounts[10], { from: COLONY_ADMIN });
      const payment = await colony.getPayment(paymentId);
      expect(payment.recipient).to.equal(accounts[10]);
    });

    it("should not allow admins to update to empty recipient", async () => {
      await colony.addPayment(1, UINT256_MAX, RECIPIENT, token.address, WAD, 1, 0, { from: COLONY_ADMIN });
      const paymentId = await colony.getPaymentCount();

      await checkErrorRevert(
        colony.setPaymentRecipient(1, UINT256_MAX, paymentId, ethers.constants.AddressZero, { from: COLONY_ADMIN }),
        "colony-payment-invalid-recipient"
      );
    });

    it("should allow admins to update skill", async () => {
      await colony.addPayment(1, UINT256_MAX, RECIPIENT, token.address, WAD, 1, 0, { from: COLONY_ADMIN });
      const paymentId = await colony.getPaymentCount();

      let payment = await colony.getPayment(paymentId);
      expect(payment.skills[0]).to.eq.BN(0);
      const tx = await colony.setPaymentSkill(1, UINT256_MAX, paymentId, 3, { from: COLONY_ADMIN });
      payment = await colony.getPayment(paymentId);
      expect(payment.skills[0]).to.eq.BN(3);
      await expectEvent(tx, "PaymentSkillSet", [COLONY_ADMIN, paymentId, 3]);
    });

    it("should not allow admins to update payment with deprecated global skill", async () => {
      await colony.addPayment(1, UINT256_MAX, RECIPIENT, token.address, WAD, 1, 0, { from: COLONY_ADMIN });
      const paymentId = await colony.getPaymentCount();

      await metaColony.addGlobalSkill();
      const skillId = await colonyNetwork.getSkillCount();
      await metaColony.deprecateGlobalSkill(skillId);

      await checkErrorRevert(colony.setPaymentSkill(1, UINT256_MAX, paymentId, skillId, { from: COLONY_ADMIN }), "colony-deprecated-global-skill");
    });

    it("should not allow non-admins to update recipient", async () => {
      await colony.addPayment(1, UINT256_MAX, RECIPIENT, token.address, WAD, 1, 0, { from: COLONY_ADMIN });
      const paymentId = await colony.getPaymentCount();

      await checkErrorRevert(colony.setPaymentRecipient(1, UINT256_MAX, paymentId, accounts[7], { from: accounts[10] }), "ds-auth-unauthorized");
    });

    it("should be able to add multiple payouts", async () => {
      await colony.addPayment(1, UINT256_MAX, RECIPIENT, token.address, WAD, 1, 0, { from: COLONY_ADMIN });
      const paymentId = await colony.getPaymentCount();

      const tx = await colony.setPaymentPayout(1, UINT256_MAX, paymentId, otherToken.address, 100);
      const payment = await colony.getPayment(paymentId);
      const fundingPotPayoutForToken = await colony.getFundingPotPayout(payment.fundingPotId, token.address);
      const fundingPotPayoutForOtherToken = await colony.getFundingPotPayout(payment.fundingPotId, otherToken.address);
      expect(fundingPotPayoutForToken).to.eq.BN(WAD);
      expect(fundingPotPayoutForOtherToken).to.eq.BN(100);
      await expectEvent(tx, "PaymentPayoutSet", [accounts[0], paymentId, otherToken.address, 100]);
    });

    it("should allow admins to fund a payment", async () => {
      await colony.addPayment(1, UINT256_MAX, RECIPIENT, token.address, WAD, 1, 0);
      const paymentId = await colony.getPaymentCount();
      const payment = await colony.getPayment(paymentId);
      const fundingPotPayoutForToken = await colony.getFundingPotPayout(payment.fundingPotId, token.address);
      expect(fundingPotPayoutForToken).to.eq.BN(WAD);

      await fundColonyWithTokens(colony, token, 40);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, payment.fundingPotId, 40, token.address);
      const fundingPotBalanceForToken = await colony.getFundingPotBalance(payment.fundingPotId, token.address);
      expect(fundingPotBalanceForToken).to.eq.BN(40);
    });

    it("should allow admins to set token payment to zero", async () => {
      await colony.addPayment(1, UINT256_MAX, RECIPIENT, token.address, WAD, 1, 0, { from: COLONY_ADMIN });
      const paymentId = await colony.getPaymentCount();

      const fundingPotId = await colony.getFundingPotCount();
      let fundingPotPayout = await colony.getFundingPotPayout(paymentId, token.address);
      expect(fundingPotPayout).to.eq.BN(WAD);

      await colony.setPaymentPayout(1, UINT256_MAX, paymentId, token.address, 0);
      fundingPotPayout = await colony.getFundingPotPayout(fundingPotId, token.address);
      expect(fundingPotPayout).to.be.zero;
    });
  });

  describe("when finalizing payments", () => {
    let paymentId;

    beforeEach(async () => {
      await colony.addPayment(1, UINT256_MAX, RECIPIENT, token.address, 40, 1, 0);
      paymentId = await colony.getPaymentCount();
      const payment = await colony.getPayment(paymentId);
      await fundColonyWithTokens(colony, token, 40);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, payment.fundingPotId, 40, token.address);
    });

    it("can finalize payment when it is fully funded", async () => {
      let payment = await colony.getPayment(paymentId);
      expect(payment.finalized).to.be.false;

      const tx = await colony.finalizePayment(1, UINT256_MAX, paymentId);

      payment = await colony.getPayment(paymentId);
      expect(payment.finalized).to.be.true;
      await expectEvent(tx, "PaymentFinalized", [accounts[0], paymentId]);
    });

    it("cannnot finalize payment if it is NOT fully funded", async () => {
      const payment = await colony.getPayment(paymentId);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, payment.fundingPotId, 1, 1, token.address);
      expect(payment.finalized).to.be.false;

      await checkErrorRevert(colony.finalizePayment(1, UINT256_MAX, paymentId), "colony-payment-not-funded");
    });

    it("cannot finalize payment not authorised", async () => {
      const payment = await colony.getPayment(paymentId);
      expect(payment.finalized).to.be.false;

      await checkErrorRevert(colony.finalizePayment(1, UINT256_MAX, paymentId, { from: accounts[10] }), "ds-auth-unauthorized");
    });

    it("should not allow admins to update recipient", async () => {
      await colony.finalizePayment(1, UINT256_MAX, paymentId);
      await checkErrorRevert(colony.setPaymentRecipient(1, UINT256_MAX, paymentId, accounts[6], { from: COLONY_ADMIN }), "colony-payment-finalized");
    });

    it("should not allow admins to update skill", async () => {
      await colony.finalizePayment(1, UINT256_MAX, paymentId);
      await checkErrorRevert(colony.setPaymentSkill(1, UINT256_MAX, paymentId, 1, { from: COLONY_ADMIN }), "colony-payment-finalized");
    });

    it("should not allow admins to update payment", async () => {
      await colony.finalizePayment(1, UINT256_MAX, paymentId);
      await checkErrorRevert(
        colony.setPaymentPayout(1, UINT256_MAX, paymentId, token.address, 1, { from: COLONY_ADMIN }),
        "colony-payment-finalized"
      );
    });

    it("should not be able to set a payout above the limit", async () => {
      await colony.finalizePayment(1, UINT256_MAX, paymentId);
      await checkErrorRevert(
        colony.setPaymentPayout(1, UINT256_MAX, paymentId, token.address, MAX_PAYOUT.addn(1), { from: COLONY_ADMIN }),
        "colony-payout-too-large"
      );
    });
  });

  describe("when claiming payments", () => {
    it("should allow recipient to claim their payment and network fee is deducated", async () => {
      await colony.addPayment(1, UINT256_MAX, RECIPIENT, token.address, WAD, 1, 0);
      const paymentId = await colony.getPaymentCount();
      const payment = await colony.getPayment(paymentId);

      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, payment.fundingPotId, WAD.add(WAD.divn(10)), token.address);
      await colony.finalizePayment(1, UINT256_MAX, paymentId);

      const recipientBalanceBefore = await token.balanceOf(RECIPIENT);
      const networkBalanceBefore = await token.balanceOf(colonyNetwork.address);
      await colony.claimPayment(paymentId, token.address, { from: RECIPIENT });

      const recipientBalanceAfter = await token.balanceOf(RECIPIENT);
      const networkBalanceAfter = await token.balanceOf(colonyNetwork.address);
      expect(recipientBalanceAfter.sub(recipientBalanceBefore)).to.eq.BN(new BN("989999999999999999"));
      expect(networkBalanceAfter.sub(networkBalanceBefore)).to.eq.BN(new BN("10000000000000001"));
    });

    it("should allow anyone to claim on behalf of the recipient", async () => {
      await colony.addPayment(1, UINT256_MAX, RECIPIENT, token.address, WAD, 1, 0);
      const paymentId = await colony.getPaymentCount();
      const payment = await colony.getPayment(paymentId);

      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, payment.fundingPotId, WAD.add(WAD.divn(10)), token.address);
      await colony.finalizePayment(1, UINT256_MAX, paymentId);

      const recipientBalanceBefore = await token.balanceOf(RECIPIENT);
      const networkBalanceBefore = await token.balanceOf(colonyNetwork.address);
      await colony.claimPayment(paymentId, token.address, { from: accounts[10] });

      const recipientBalanceAfter = await token.balanceOf(RECIPIENT);
      const networkBalanceAfter = await token.balanceOf(colonyNetwork.address);
      expect(recipientBalanceAfter.sub(recipientBalanceBefore)).to.eq.BN(new BN("989999999999999999"));
      expect(networkBalanceAfter.sub(networkBalanceBefore)).to.eq.BN(new BN("10000000000000001"));
    });

    it("after payment is claimed it should set the payout to 0", async () => {
      await colony.addPayment(1, UINT256_MAX, RECIPIENT, token.address, WAD, 1, 0);
      const paymentId = await colony.getPaymentCount();
      const payment = await colony.getPayment(paymentId);

      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, payment.fundingPotId, WAD.add(WAD.divn(10)), token.address);
      await colony.finalizePayment(1, UINT256_MAX, paymentId);
      await colony.claimPayment(paymentId, token.address);

      const tokenPayout = await colony.getFundingPotPayout(payment.fundingPotId, token.address);
      expect(tokenPayout).to.be.zero;
    });

    it("should error when payment is not funded and finalized", async () => {
      await colony.addPayment(1, UINT256_MAX, RECIPIENT, token.address, 10000, 1, 0);
      const paymentId = await colony.getPaymentCount();
      const payment = await colony.getPayment(paymentId);

      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, payment.fundingPotId, 9999, token.address);
      await checkErrorRevert(colony.claimPayment(paymentId, token.address), "colony-payment-not-finalized");
    });

    it("should allow multiple payouts to be claimed", async () => {
      await colony.addPayment(1, UINT256_MAX, RECIPIENT, token.address, 200, 1, 0, { from: COLONY_ADMIN });
      const paymentId = await colony.getPaymentCount();
      let payment = await colony.getPayment(paymentId);

      await colony.setPaymentPayout(1, UINT256_MAX, paymentId, otherToken.address, 100);
      await fundColonyWithTokens(colony, otherToken, 101);
      let fundingPot = await colony.getFundingPot(payment.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.eq.BN(2);

      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, payment.fundingPotId, 199, token.address);
      fundingPot = await colony.getFundingPot(payment.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.eq.BN(2);

      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, payment.fundingPotId, 100, otherToken.address);
      fundingPot = await colony.getFundingPot(payment.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.eq.BN(1);

      await colony.setPaymentPayout(1, UINT256_MAX, paymentId, token.address, 199);
      fundingPot = await colony.getFundingPot(payment.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      await colony.finalizePayment(1, UINT256_MAX, paymentId);
      payment = await colony.getPayment(paymentId);
      expect(payment.finalized).to.be.true;

      const recipientBalanceBefore1 = await token.balanceOf(RECIPIENT);
      const networkBalanceBefore1 = await token.balanceOf(colonyNetwork.address);
      await colony.claimPayment(paymentId, token.address);

      const recipientBalanceAfter1 = await token.balanceOf(RECIPIENT);
      const networkBalanceAfter1 = await token.balanceOf(colonyNetwork.address);
      expect(recipientBalanceAfter1.sub(recipientBalanceBefore1)).to.eq.BN(new BN("197"));
      expect(networkBalanceAfter1.sub(networkBalanceBefore1)).to.eq.BN(new BN("2"));

      const recipientBalanceBefore2 = await otherToken.balanceOf(RECIPIENT);
      const networkBalanceBefore2 = await otherToken.balanceOf(colonyNetwork.address);
      await colony.claimPayment(paymentId, otherToken.address);

      const recipientBalanceAfter2 = await otherToken.balanceOf(RECIPIENT);
      const networkBalanceAfter2 = await otherToken.balanceOf(colonyNetwork.address);
      expect(recipientBalanceAfter2.sub(recipientBalanceBefore2)).to.eq.BN(new BN("98"));
      expect(networkBalanceAfter2.sub(networkBalanceBefore2)).to.eq.BN(new BN("2"));
    });
  });
});
