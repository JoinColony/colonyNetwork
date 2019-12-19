/* global artifacts */
import chai from "chai";
import bnChai from "bn-chai";
import { BN } from "bn.js";

import { UINT256_MAX, INT128_MAX, WAD, SECONDS_PER_DAY, MAX_PAYOUT, GLOBAL_SKILL_ID } from "../../helpers/constants";
import { checkErrorRevert, getTokenArgs, forwardTime, getBlockTime } from "../../helpers/test-helper";
import { fundColonyWithTokens, setupRandomColony } from "../../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const IMetaColony = artifacts.require("IMetaColony");
const Token = artifacts.require("Token");

contract("Colony Expenditure", (accounts) => {
  const MAX_PAYOUT_MODIFIER = WAD;
  const MIN_PAYOUT_MODIFIER = WAD.neg();

  const SLOT0 = 0;
  const SLOT1 = 1;

  const ACTIVE = 0;
  const CANCELLED = 1;
  const FINALIZED = 2;

  const RECIPIENT = accounts[3];
  const ADMIN = accounts[4];
  const ARBITRATOR = accounts[5];
  const USER = accounts[10];

  const EXPENDITURES_SLOT = 25;
  const EXPENDITURESLOTS_SLOT = 26;
  const EXPENDITURESLOTPAYOUTS_SLOT = 27;

  let colony;
  let token;
  let otherToken;
  let colonyNetwork;
  let metaColony;
  let domain1;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);

    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.setRewardInverse(100);
    await colony.setAdministrationRole(1, UINT256_MAX, ADMIN, 1, true);
    await colony.setArbitrationRole(1, UINT256_MAX, ARBITRATOR, 1, true);
    await fundColonyWithTokens(colony, token, UINT256_MAX);
    domain1 = await colony.getDomain(1);

    const tokenArgs = getTokenArgs();
    otherToken = await Token.new(...tokenArgs);
    await otherToken.unlock();
    await fundColonyWithTokens(colony, otherToken, UINT256_MAX);
  });

  describe("when adding expenditures", () => {
    it("should allow admins to add expenditure", async () => {
      const expendituresCountBefore = await colony.getExpenditureCount();
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: ADMIN });

      const expendituresCountAfter = await colony.getExpenditureCount();
      expect(expendituresCountAfter.sub(expendituresCountBefore)).to.eq.BN(1);

      const fundingPotId = await colony.getFundingPotCount();
      const expenditure = await colony.getExpenditure(expendituresCountAfter);

      expect(expenditure.fundingPotId).to.eq.BN(fundingPotId);
      expect(expenditure.domainId).to.eq.BN(1);

      const fundingPot = await colony.getFundingPot(fundingPotId);
      expect(fundingPot.associatedType).to.eq.BN(4); // 4 = FundingPotAssociatedType.Expenditure
      expect(fundingPot.associatedTypeId).to.eq.BN(expendituresCountAfter);
    });

    it("should not allow non-admins to add expenditure", async () => {
      await checkErrorRevert(colony.makeExpenditure(1, UINT256_MAX, 1, { from: USER }), "ds-auth-unauthorized");
    });

    it("should allow owners to cancel expenditures", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: ADMIN });
      const expenditureId = await colony.getExpenditureCount();

      let expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.status).to.eq.BN(ACTIVE);

      await checkErrorRevert(colony.cancelExpenditure(expenditureId, { from: USER }), "colony-expenditure-not-owner");
      await colony.cancelExpenditure(expenditureId, { from: ADMIN });

      expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.status).to.eq.BN(CANCELLED);
      expect(expenditure.finalizedTimestamp).to.be.zero;
    });

    it("should allow owners to transfer expenditures", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: ADMIN });
      const expenditureId = await colony.getExpenditureCount();

      let expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.owner).to.equal(ADMIN);

      await checkErrorRevert(colony.transferExpenditure(expenditureId, USER), "colony-expenditure-not-owner");
      await colony.transferExpenditure(expenditureId, USER, { from: ADMIN });

      expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.owner).to.equal(USER);
    });

    it("should allow arbitration users to transfer expenditures", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: ADMIN });
      const expenditureId = await colony.getExpenditureCount();

      let expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.owner).to.equal(ADMIN);

      await checkErrorRevert(colony.transferExpenditureViaArbitration(1, UINT256_MAX, expenditureId, USER, { from: ADMIN }), "ds-auth-unauthorized");
      await colony.transferExpenditureViaArbitration(1, UINT256_MAX, expenditureId, USER, { from: ARBITRATOR });

      expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.owner).to.equal(USER);
    });
  });

  describe("when updating expenditures", () => {
    let expenditureId;

    beforeEach(async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: ADMIN });
      expenditureId = await colony.getExpenditureCount();
    });

    it("should error if the expenditure does not exist", async () => {
      await checkErrorRevert(colony.setExpenditureSkill(100, SLOT0, GLOBAL_SKILL_ID, { from: ADMIN }), "colony-expenditure-does-not-exist");
    });

    it("should allow owners to update a slot skill", async () => {
      let expenditureSlot = await colony.getExpenditureSlot(expenditureId, SLOT0);
      expect(expenditureSlot.skills.length).to.be.zero;

      await colony.setExpenditureSkill(expenditureId, SLOT0, GLOBAL_SKILL_ID, { from: ADMIN });
      expenditureSlot = await colony.getExpenditureSlot(expenditureId, SLOT0);
      expect(expenditureSlot.skills[0]).to.eq.BN(GLOBAL_SKILL_ID);
    });

    it("should not allow owners to set a non-global skill or a deprecated global skill", async () => {
      await checkErrorRevert(colony.setExpenditureSkill(expenditureId, SLOT0, 2, { from: ADMIN }), "colony-not-global-skill");

      await metaColony.addGlobalSkill();
      const skillId = await colonyNetwork.getSkillCount();
      await metaColony.deprecateGlobalSkill(skillId);

      await checkErrorRevert(colony.setExpenditureSkill(expenditureId, SLOT0, skillId, { from: ADMIN }), "colony-deprecated-global-skill");
    });

    it("should not allow non-owners to update skills or payouts", async () => {
      await checkErrorRevert(colony.setExpenditureSkill(expenditureId, SLOT0, GLOBAL_SKILL_ID), "colony-expenditure-not-owner");
      await checkErrorRevert(colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD), "colony-expenditure-not-owner");
    });

    it("should allow owners to add a slot payout", async () => {
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });

      const payout = await colony.getExpenditureSlotPayout(expenditureId, SLOT0, token.address);
      expect(payout).to.eq.BN(WAD);
    });

    it("should be able to add multiple payouts in different tokens", async () => {
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, 100, { from: ADMIN });
      await colony.setExpenditurePayout(expenditureId, SLOT0, otherToken.address, 200, { from: ADMIN });

      const payoutForToken = await colony.getExpenditureSlotPayout(expenditureId, SLOT0, token.address);
      const payoutForOtherToken = await colony.getExpenditureSlotPayout(expenditureId, SLOT0, otherToken.address);
      expect(payoutForToken).to.eq.BN(100);
      expect(payoutForOtherToken).to.eq.BN(200);
    });

    it("should not allow owners to set a payout above the maximum", async () => {
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, MAX_PAYOUT, { from: ADMIN });

      await checkErrorRevert(
        colony.setExpenditurePayout(expenditureId, SLOT0, token.address, MAX_PAYOUT.addn(1), { from: ADMIN }),
        "colony-payout-too-large"
      );
    });

    it("should allow owner to set token payout to zero", async () => {
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });

      let payout = await colony.getExpenditureSlotPayout(expenditureId, SLOT0, token.address);
      expect(payout).to.eq.BN(WAD);

      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, 0, { from: ADMIN });

      payout = await colony.getExpenditureSlotPayout(expenditureId, SLOT0, token.address);
      expect(payout).to.be.zero;
    });

    it("should correctly account for multiple payouts in the same token", async () => {
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });
      await colony.setExpenditurePayout(expenditureId, SLOT1, token.address, WAD, { from: ADMIN });

      const expenditure = await colony.getExpenditure(expenditureId);
      let totalPayout = await colony.getFundingPotPayout(expenditure.fundingPotId, token.address);
      expect(totalPayout).to.eq.BN(WAD.muln(2));

      await colony.setExpenditurePayout(expenditureId, SLOT1, token.address, 0, { from: ADMIN });

      totalPayout = await colony.getFundingPotPayout(expenditure.fundingPotId, token.address);
      expect(totalPayout).to.eq.BN(WAD);
    });

    it("should allow arbitration users to set the payoutModifier", async () => {
      await checkErrorRevert(
        colony.setExpenditurePayoutModifier(1, UINT256_MAX, expenditureId, SLOT0, WAD.divn(2), { from: ADMIN }),
        "ds-auth-unauthorized"
      );

      await colony.setExpenditurePayoutModifier(1, UINT256_MAX, expenditureId, SLOT0, WAD.divn(2));

      const expenditureSlot = await colony.getExpenditureSlot(expenditureId, SLOT0);
      expect(expenditureSlot.payoutModifier).to.eq.BN(WAD.divn(2));
    });

    it("should not allow arbitration users to set the payoutModifier above the maximum", async () => {
      await colony.setExpenditurePayoutModifier(1, UINT256_MAX, expenditureId, SLOT0, MAX_PAYOUT_MODIFIER);

      await checkErrorRevert(
        colony.setExpenditurePayoutModifier(1, UINT256_MAX, expenditureId, SLOT0, MAX_PAYOUT_MODIFIER.addn(1)),
        "colony-expenditure-payout-modifier-too-large"
      );
    });

    it("should not allow arbitration users to set the payoutModifier below the minimum", async () => {
      await colony.setExpenditurePayoutModifier(1, UINT256_MAX, expenditureId, SLOT0, MIN_PAYOUT_MODIFIER);

      await checkErrorRevert(
        colony.setExpenditurePayoutModifier(1, UINT256_MAX, expenditureId, SLOT0, MIN_PAYOUT_MODIFIER.subn(1)),
        "colony-expenditure-payout-modifier-too-small"
      );
    });

    it("should allow arbitration users to set the claimDelay", async () => {
      await checkErrorRevert(
        colony.setExpenditureClaimDelay(1, UINT256_MAX, expenditureId, SLOT0, SECONDS_PER_DAY, { from: ADMIN }),
        "ds-auth-unauthorized"
      );

      await colony.setExpenditureClaimDelay(1, UINT256_MAX, expenditureId, SLOT0, SECONDS_PER_DAY);

      const expenditureSlot = await colony.getExpenditureSlot(expenditureId, SLOT0);
      expect(expenditureSlot.claimDelay).to.eq.BN(SECONDS_PER_DAY);
    });
  });

  describe("when finalizing expenditures", () => {
    let expenditureId;

    beforeEach(async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: ADMIN });
      expenditureId = await colony.getExpenditureCount();
    });

    it("should allow owners to finalize expenditures", async () => {
      let expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.status).to.eq.BN(ACTIVE);

      await checkErrorRevert(colony.finalizeExpenditure(expenditureId, { from: USER }), "colony-expenditure-not-owner");
      const tx = await colony.finalizeExpenditure(expenditureId, { from: ADMIN });
      const currTime = await getBlockTime(tx.receipt.blockNumber);

      expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.status).to.eq.BN(FINALIZED);
      expect(expenditure.finalizedTimestamp).to.eq.BN(currTime);
    });

    it("cannot finalize expenditure if it is not fully funded", async () => {
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });

      await checkErrorRevert(colony.finalizeExpenditure(expenditureId, { from: ADMIN }), "colony-expenditure-not-funded");

      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, domain1.fundingPotId, expenditure.fundingPotId, WAD, token.address);

      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });
    });

    it("should not allow admins to update payouts", async () => {
      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });
      await checkErrorRevert(colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN }), "colony-expenditure-not-active");
    });

    it("should not allow admins to update skills", async () => {
      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });
      await checkErrorRevert(colony.setExpenditureSkill(expenditureId, SLOT0, 1, { from: ADMIN }), "colony-expenditure-not-active");
    });
  });

  describe("when claiming expenditures", () => {
    let expenditureId;

    beforeEach(async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: ADMIN });
      expenditureId = await colony.getExpenditureCount();
    });

    it("should allow anyone to claim on behalf of the recipient, with network fee deducted", async () => {
      await colony.setExpenditureRecipient(expenditureId, SLOT0, RECIPIENT, { from: ADMIN });
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });

      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, domain1.fundingPotId, expenditure.fundingPotId, WAD, token.address);
      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });

      const recipientBalanceBefore = await token.balanceOf(RECIPIENT);
      const networkBalanceBefore = await token.balanceOf(colonyNetwork.address);
      await colony.claimExpenditurePayout(expenditureId, SLOT0, token.address);

      const recipientBalanceAfter = await token.balanceOf(RECIPIENT);
      const networkBalanceAfter = await token.balanceOf(colonyNetwork.address);
      expect(recipientBalanceAfter.sub(recipientBalanceBefore)).to.eq.BN(WAD.divn(100).muln(99).subn(1)); // eslint-disable-line prettier/prettier
      expect(networkBalanceAfter.sub(networkBalanceBefore)).to.eq.BN(WAD.divn(100).addn(1)); // eslint-disable-line prettier/prettier
    });

    it("should allow anyone to claim on behalf of the slot, in multiple tokens", async () => {
      await colony.setExpenditureRecipient(expenditureId, SLOT0, RECIPIENT, { from: ADMIN });
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });
      await colony.setExpenditurePayout(expenditureId, SLOT0, otherToken.address, WAD, { from: ADMIN });

      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, domain1.fundingPotId, expenditure.fundingPotId, WAD, token.address);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, domain1.fundingPotId, expenditure.fundingPotId, WAD, otherToken.address);
      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });

      const tokenBalanceBefore = await token.balanceOf(RECIPIENT);
      const otherTokenBalanceBefore = await otherToken.balanceOf(RECIPIENT);
      await colony.claimExpenditurePayout(expenditureId, SLOT0, token.address);
      await colony.claimExpenditurePayout(expenditureId, SLOT0, otherToken.address);

      const tokenBalanceAfter = await token.balanceOf(RECIPIENT);
      const otherTokenBalanceAfter = await otherToken.balanceOf(RECIPIENT);
      expect(tokenBalanceAfter.sub(tokenBalanceBefore)).to.eq.BN(WAD.divn(100).muln(99).subn(1)); // eslint-disable-line prettier/prettier
      expect(otherTokenBalanceAfter.sub(otherTokenBalanceBefore)).to.eq.BN(WAD.divn(100).muln(99).subn(1)); // eslint-disable-line prettier/prettier
    });

    it("after expenditure is claimed it should set the payout to 0", async () => {
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });

      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, domain1.fundingPotId, expenditure.fundingPotId, WAD, token.address);
      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });
      await colony.claimExpenditurePayout(expenditureId, SLOT0, token.address);

      const payout = await colony.getExpenditureSlotPayout(expenditureId, SLOT0, token.address);
      expect(payout).to.be.zero;
    });

    it("should automatically reclaim funds for payoutModifiers of -1", async () => {
      await colony.setExpenditureRecipient(expenditureId, SLOT0, RECIPIENT, { from: ADMIN });
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });
      await colony.setExpenditurePayoutModifier(1, UINT256_MAX, expenditureId, SLOT0, WAD.neg());

      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, domain1.fundingPotId, expenditure.fundingPotId, WAD, token.address);
      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });

      const balanceBefore = await colony.getFundingPotBalance(domain1.fundingPotId, token.address);
      await colony.claimExpenditurePayout(expenditureId, SLOT0, token.address);
      const balanceAfter = await colony.getFundingPotBalance(domain1.fundingPotId, token.address);
      expect(balanceAfter.sub(balanceBefore)).to.eq.BN(WAD);

      const potBalance = await colony.getFundingPotBalance(expenditure.fundingPotId, token.address);
      const potPayout = await colony.getFundingPotPayout(expenditure.fundingPotId, token.address);
      expect(potBalance).to.be.zero;
      expect(potPayout).to.be.zero;
    });

    it("should automatically reclaim funds for payoutModifiers between -1 and 0", async () => {
      await colony.setExpenditureRecipient(expenditureId, SLOT0, RECIPIENT, { from: ADMIN });
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });
      await colony.setExpenditurePayoutModifier(1, UINT256_MAX, expenditureId, SLOT0, WAD.divn(3).neg()); // 2/3 payout

      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, domain1.fundingPotId, expenditure.fundingPotId, WAD, token.address);
      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });

      const balanceBefore = await colony.getFundingPotBalance(domain1.fundingPotId, token.address);
      await colony.claimExpenditurePayout(expenditureId, SLOT0, token.address);
      const balanceAfter = await colony.getFundingPotBalance(domain1.fundingPotId, token.address);
      expect(balanceAfter.sub(balanceBefore)).to.eq.BN(WAD.divn(3));

      const potBalance = await colony.getFundingPotBalance(expenditure.fundingPotId, token.address);
      const potPayout = await colony.getFundingPotPayout(expenditure.fundingPotId, token.address);
      expect(potBalance).to.be.zero;
      expect(potPayout).to.be.zero;
    });

    it("if skill is set, should emit two reputation updates", async () => {
      await colony.setExpenditureRecipient(expenditureId, SLOT0, RECIPIENT, { from: ADMIN });
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });
      await colony.setExpenditureSkill(expenditureId, SLOT0, GLOBAL_SKILL_ID, { from: ADMIN });

      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, domain1.fundingPotId, expenditure.fundingPotId, WAD, token.address);
      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });
      await colony.claimExpenditurePayout(expenditureId, SLOT0, token.address);

      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      const numEntries = await repCycle.getReputationUpdateLogLength();

      const skillEntry = await repCycle.getReputationUpdateLogEntry(numEntries.subn(1));
      expect(skillEntry.user).to.equal(RECIPIENT);
      expect(skillEntry.skillId).to.eq.BN(GLOBAL_SKILL_ID);
      expect(skillEntry.amount).to.eq.BN(WAD);

      const domainEntry = await repCycle.getReputationUpdateLogEntry(numEntries.subn(2));
      expect(domainEntry.user).to.equal(RECIPIENT);
      expect(domainEntry.skillId).to.equal(domain1.skillId);
      expect(domainEntry.amount).to.eq.BN(WAD);
    });

    it("should scale down payout by payoutScalar", async () => {
      await colony.setExpenditureRecipient(expenditureId, SLOT0, RECIPIENT, { from: ADMIN });
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });

      // Modifier of -0.5 WAD translates to scalar of 0.5 WAD
      await colony.setExpenditurePayoutModifier(1, UINT256_MAX, expenditureId, SLOT0, WAD.divn(2).neg());

      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, domain1.fundingPotId, expenditure.fundingPotId, WAD, token.address);
      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });

      const recipientBalanceBefore = await token.balanceOf(RECIPIENT);
      await colony.claimExpenditurePayout(expenditureId, SLOT0, token.address);

      // Cash payout scaled down
      const recipientBalanceAfter = await token.balanceOf(RECIPIENT);
      expect(recipientBalanceAfter.sub(recipientBalanceBefore)).to.eq.BN(WAD.divn(2).divn(100).muln(99).subn(1)); // eslint-disable-line prettier/prettier

      // Reputation is scaled down the same amount
      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      const numEntries = await repCycle.getReputationUpdateLogLength();
      const entry = await repCycle.getReputationUpdateLogEntry(numEntries.subn(1));
      expect(entry.user).to.equal(RECIPIENT);
      expect(entry.amount).to.eq.BN(WAD.divn(2));
    });

    it("should scale up payout by payoutScalar", async () => {
      await colony.setExpenditureRecipient(expenditureId, SLOT0, RECIPIENT, { from: ADMIN });
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });

      // Modifier of 1 WAD translates to scalar of 2 WAD
      await colony.setExpenditurePayoutModifier(1, UINT256_MAX, expenditureId, SLOT0, WAD);

      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, domain1.fundingPotId, expenditure.fundingPotId, WAD, token.address);
      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });

      const recipientBalanceBefore = await token.balanceOf(RECIPIENT);
      await colony.claimExpenditurePayout(expenditureId, SLOT0, token.address);

      // Cash payout maxes out at payout
      const recipientBalanceAfter = await token.balanceOf(RECIPIENT);
      expect(recipientBalanceAfter.sub(recipientBalanceBefore)).to.eq.BN(WAD.divn(100).muln(99).subn(1)); // eslint-disable-line prettier/prettier

      // But reputation gets a boost
      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      const numEntries = await repCycle.getReputationUpdateLogLength();
      const entry = await repCycle.getReputationUpdateLogEntry(numEntries.subn(1));
      expect(entry.user).to.equal(RECIPIENT);
      expect(entry.amount).to.eq.BN(WAD.muln(2));
    });

    it("should not overflow when using the maximum payout * modifier", async () => {
      await colony.setExpenditureRecipient(expenditureId, SLOT0, RECIPIENT, { from: ADMIN });
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, MAX_PAYOUT, { from: ADMIN });
      await colony.setExpenditurePayoutModifier(1, UINT256_MAX, expenditureId, SLOT0, MAX_PAYOUT_MODIFIER);

      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, domain1.fundingPotId, expenditure.fundingPotId, MAX_PAYOUT, token.address);
      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });
      await colony.claimExpenditurePayout(expenditureId, SLOT0, token.address);

      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      const numEntries = await repCycle.getReputationUpdateLogLength();

      const entry = await repCycle.getReputationUpdateLogEntry(numEntries.subn(1));
      expect(entry.user).to.equal(RECIPIENT);
      expect(entry.amount).to.eq.BN(INT128_MAX); // Reputation is capped at INT128_MAX
    });

    it("should delay claims by claimDelay", async () => {
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });
      await colony.setExpenditureClaimDelay(1, UINT256_MAX, expenditureId, SLOT0, SECONDS_PER_DAY);

      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, domain1.fundingPotId, expenditure.fundingPotId, WAD, token.address);
      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });

      await checkErrorRevert(colony.claimExpenditurePayout(expenditureId, SLOT0, token.address), "colony-expenditure-cannot-claim");

      await forwardTime(SECONDS_PER_DAY, this);
      await colony.claimExpenditurePayout(expenditureId, SLOT0, token.address);
    });

    it("should error when expenditure is not finalized", async () => {
      await checkErrorRevert(colony.claimExpenditurePayout(expenditureId, SLOT0, token.address), "colony-expenditure-not-finalized");
    });
  });

  describe("when cancelling expenditures", () => {
    let expenditureId;

    beforeEach(async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: ADMIN });
      expenditureId = await colony.getExpenditureCount();
    });

    it("should not be claimable", async () => {
      await colony.cancelExpenditure(expenditureId, { from: ADMIN });
      await checkErrorRevert(colony.claimExpenditurePayout(expenditureId, SLOT0, token.address), "colony-expenditure-not-finalized");
    });

    it("should let funds be reclaimed", async () => {
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });

      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, domain1.fundingPotId, expenditure.fundingPotId, WAD, token.address);

      // Try to move funds back
      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, expenditure.fundingPotId, domain1.fundingPotId, WAD, token.address),
        "colony-funding-expenditure-bad-state"
      );

      await colony.cancelExpenditure(expenditureId, { from: ADMIN });
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, expenditure.fundingPotId, domain1.fundingPotId, WAD, token.address);
    });
  });

  describe("when arbitrating expenditures", () => {
    let expenditureId;

    const MAPPING = false;
    const OFFSET = true;

    function bn2bytes32(x, size = 64) {
      return `0x${x.toString(16, size)}`;
    }

    beforeEach(async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: ADMIN });
      expenditureId = await colony.getExpenditureCount();
    });

    it("should allow arbitration users to update expenditure status/owner", async () => {
      const mask = [OFFSET];
      const keys = [bn2bytes32(new BN(0))];
      const value = bn2bytes32(new BN(USER.slice(2), 16), 62) + new BN(CANCELLED).toString(16, 2);

      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURES_SLOT, mask, keys, value, { from: ARBITRATOR });

      const expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.status).to.eq.BN(CANCELLED);
      expect(expenditure.owner).to.equal(USER);
    });

    it("should not allow arbitration users to update expenditure fundingPotId", async () => {
      const mask = [OFFSET];
      const keys = [bn2bytes32(new BN(1))];
      const value = "0x0";

      await checkErrorRevert(
        colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURES_SLOT, mask, keys, value, { from: ARBITRATOR }),
        "colony-expenditure-bad-offset"
      );
    });

    it("should not allow arbitration users to update expenditure domainId", async () => {
      const mask = [OFFSET];
      const keys = [bn2bytes32(new BN(2))];
      const value = "0x0";

      await checkErrorRevert(
        colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURES_SLOT, mask, keys, value, { from: ARBITRATOR }),
        "colony-expenditure-bad-offset"
      );
    });

    it("should allow arbitration users to update expenditure finalizedTimestamp", async () => {
      const mask = [OFFSET];
      const keys = [bn2bytes32(new BN(3))];
      const value = bn2bytes32(new BN(100));

      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURES_SLOT, mask, keys, value, { from: ARBITRATOR });

      const expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.finalizedTimestamp).to.eq.BN(100);
    });

    it("should allow arbitration users to update expenditure slot recipient", async () => {
      const mask = [MAPPING];
      const keys = ["0x0"];
      const value = bn2bytes32(new BN(USER.slice(2), 16));

      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, value, { from: ARBITRATOR });

      const expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.recipient).to.equal(USER);
    });

    it("should allow arbitration users to update expenditure slot claimDelay", async () => {
      const mask = [MAPPING, OFFSET];
      const keys = ["0x0", bn2bytes32(new BN(1))];
      const value = bn2bytes32(new BN(100));

      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, value, { from: ARBITRATOR });

      const expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.eq.BN(100);
    });

    it("should allow arbitration users to update expenditure slot payoutModifier", async () => {
      const mask = [MAPPING, OFFSET];
      const keys = ["0x0", bn2bytes32(new BN(2))];
      const value = bn2bytes32(new BN(100));

      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, value, { from: ARBITRATOR });

      const expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.payoutModifier).to.eq.BN(100);
    });

    it("should allow arbitration users to update expenditure slot skills", async () => {
      await colony.setExpenditureSkill(expenditureId, 0, GLOBAL_SKILL_ID, { from: ADMIN });

      const mask = [MAPPING, OFFSET, OFFSET];
      const keys = ["0x0", bn2bytes32(new BN(3)), bn2bytes32(new BN(0))];
      const value = bn2bytes32(new BN(100));

      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, value, { from: ARBITRATOR });

      const expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.skills[0]).to.eq.BN(100);
    });

    it("should allow arbitration users to update expenditure slot payouts", async () => {
      const mask = [MAPPING, MAPPING];
      const keys = ["0x0", bn2bytes32(new BN(token.address.slice(2), 16))];
      const value = bn2bytes32(new BN(100));

      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTPAYOUTS_SLOT, mask, keys, value, { from: ARBITRATOR });

      const expenditureSlotPayout = await colony.getExpenditureSlotPayout(expenditureId, 0, token.address);
      expect(expenditureSlotPayout).to.eq.BN(100);
    });

    it("should not allow arbitration users to pass empty keys", async () => {
      const mask = [];
      const keys = [];
      const value = "0x0";

      await checkErrorRevert(
        colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURES_SLOT, mask, keys, value, { from: ARBITRATOR }),
        "colony-expenditure-no-keys"
      );
    });

    it("should not allow arbitration users to pass invalid slots", async () => {
      const mask = [OFFSET];
      const keys = ["0x0"];
      const value = "0x0";
      const invalidSlot = 10;

      await checkErrorRevert(
        colony.setExpenditureState(1, UINT256_MAX, expenditureId, invalidSlot, mask, keys, value, { from: ARBITRATOR }),
        "colony-expenditure-bad-slot"
      );
    });

    it("should not allow arbitration users to pass an inconsistent mask", async () => {
      const mask = [];
      const keys = ["0x0"];
      const value = "0x0";

      await checkErrorRevert(
        colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURES_SLOT, mask, keys, value, { from: ARBITRATOR }),
        "colony-expenditure-bad-mask"
      );
    });

    it("should not allow arbitration users to pass offsets greater than 1024", async () => {
      const mask = [OFFSET];
      const keys = [bn2bytes32(new BN(1025))];
      const value = bn2bytes32(new BN(100));

      await checkErrorRevert(
        colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, value, { from: ARBITRATOR }),
        "colony-expenditure-large-offset"
      );
    });
  });
});
