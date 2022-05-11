/* global artifacts */
const chai = require("chai");
const bnChai = require("bn-chai");
const { BN } = require("bn.js");
const { ethers } = require("ethers");
const { soliditySha3 } = require("web3-utils");

const {
  UINT256_MAX,
  INT128_MAX,
  WAD,
  SECONDS_PER_DAY,
  MAX_PAYOUT,
  GLOBAL_SKILL_ID,
  IPFS_HASH,
  ADDRESS_ZERO,
  HASHZERO,
} = require("../../helpers/constants");
const { checkErrorRevert, expectEvent, getTokenArgs, forwardTime, getBlockTime, bn2bytes32 } = require("../../helpers/test-helper");
const { fundColonyWithTokens, setupRandomColony } = require("../../helpers/test-data-generator");
const { setupEtherRouter } = require("../../helpers/upgradable-contracts");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const IMetaColony = artifacts.require("IMetaColony");
const Token = artifacts.require("Token");
const TestExtension0 = artifacts.require("TestExtension0");
const Resolver = artifacts.require("Resolver");

contract("Colony Expenditure", (accounts) => {
  const SLOT0 = 0;
  const SLOT1 = 1;
  const SLOT2 = 2;

  const DRAFT = 0;
  const CANCELLED = 1;
  const FINALIZED = 2;
  const LOCKED = 3;

  const MAPPING = false;
  const ARRAY = true;

  const ROOT = accounts[0];
  const RECIPIENT = accounts[3];
  const ADMIN = accounts[4];
  const ARBITRATOR = accounts[5];
  const USER = accounts[10];

  const EXPENDITURES_SLOT = 25;
  const EXPENDITURESLOTS_SLOT = 26;

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
      expect(expenditure.status).to.eq.BN(DRAFT);

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

    it("a non-root user cannot setDefaultGlobalClaimDelay", async () => {
      await checkErrorRevert(colony.setDefaultGlobalClaimDelay(0, { from: ADMIN }), "ds-auth-unauthorized");
    });

    it("should set the default global claim delay", async () => {
      await expectEvent(colony.setDefaultGlobalClaimDelay(SECONDS_PER_DAY, { from: ROOT }), "ExpenditureGlobalClaimDelaySet", [
        ROOT,
        SECONDS_PER_DAY,
      ]);

      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: ADMIN });
      const expenditureId = await colony.getExpenditureCount();

      const expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.globalClaimDelay).to.eq.BN(SECONDS_PER_DAY);

      // Cleanup
      await colony.setDefaultGlobalClaimDelay(0);
    });
  });

  describe("when updating expenditures", () => {
    let expenditureId;
    let expenditureSlot;

    beforeEach(async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: ADMIN });
      expenditureId = await colony.getExpenditureCount();
    });

    it("should error if the expenditure does not exist", async () => {
      await checkErrorRevert(colony.setExpenditureSkill(100, SLOT0, GLOBAL_SKILL_ID, { from: ADMIN }), "colony-expenditure-does-not-exist");
      await checkErrorRevert(colony.transferExpenditure(100, USER), "colony-expenditure-does-not-exist");
      await checkErrorRevert(
        colony.transferExpenditureViaArbitration(0, UINT256_MAX, 100, USER, { from: ADMIN }),
        "colony-expenditure-does-not-exist"
      );
      await checkErrorRevert(colony.cancelExpenditure(100), "colony-expenditure-does-not-exist");
      await checkErrorRevert(colony.lockExpenditure(100), "colony-expenditure-does-not-exist");
      await checkErrorRevert(colony.finalizeExpenditure(100), "colony-expenditure-does-not-exist");
      await checkErrorRevert(colony.setExpenditureMetadata(100, ""), "colony-expenditure-does-not-exist");
      await checkErrorRevert(
        colony.methods["setExpenditureMetadata(uint256,uint256,uint256,string)"](0, 0, 100, ""),
        "colony-expenditure-does-not-exist"
      );
      await checkErrorRevert(colony.setExpenditureRecipients(100, [], []), "colony-expenditure-does-not-exist");
      await checkErrorRevert(colony.setExpenditureClaimDelays(100, [], []), "colony-expenditure-does-not-exist");
      await checkErrorRevert(colony.setExpenditurePayoutModifiers(100, [], []), "colony-expenditure-does-not-exist");
      await checkErrorRevert(colony.claimExpenditurePayout(100, 0, ADDRESS_ZERO), "colony-expenditure-does-not-exist");
      await checkErrorRevert(colony.setExpenditurePayouts(100, [], ADDRESS_ZERO, []), "colony-expenditure-does-not-exist");
    });

    it("should only allow owners to update the metadata", async () => {
      const setExpenditureMetadata = colony.methods["setExpenditureMetadata(uint256,string)"];
      const tx = await setExpenditureMetadata(expenditureId, IPFS_HASH, { from: ADMIN });

      await expectEvent(tx, "ExpenditureMetadataSet", [ADMIN, expenditureId, IPFS_HASH]);

      await checkErrorRevert(setExpenditureMetadata(expenditureId, IPFS_HASH, { from: USER }), "colony-expenditure-not-owner");
    });

    it("should allow arbitrators to update the metadata", async () => {
      const setExpenditureMetadata = colony.methods["setExpenditureMetadata(uint256,uint256,uint256,string)"];
      const tx = await setExpenditureMetadata(1, UINT256_MAX, expenditureId, IPFS_HASH, { from: ARBITRATOR });

      await expectEvent(tx, "ExpenditureMetadataSet", [ARBITRATOR, expenditureId, IPFS_HASH]);
    });

    it("metadata can only be updated while in draft state", async () => {
      const setExpenditureMetadata = colony.methods["setExpenditureMetadata(uint256,string)"];

      await colony.cancelExpenditure(expenditureId, { from: ADMIN });
      await checkErrorRevert(setExpenditureMetadata(expenditureId, IPFS_HASH, { from: ADMIN }), "colony-expenditure-not-draft");
    });

    it("should allow owners to update a slot recipient", async () => {
      await colony.setExpenditureRecipient(expenditureId, SLOT0, USER, { from: ADMIN });

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, SLOT0);
      expect(expenditureSlot.recipient).to.equal(USER);
    });

    it("should allow only owners to update many slot recipients at once", async () => {
      await checkErrorRevert(
        colony.setExpenditureRecipients(expenditureId, [SLOT1, SLOT2], [RECIPIENT, USER], { from: USER }),
        "colony-expenditure-not-owner"
      );

      await colony.setExpenditureRecipients(expenditureId, [SLOT1, SLOT2], [RECIPIENT, USER], { from: ADMIN });

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, SLOT0);
      expect(expenditureSlot.recipient).to.equal(ethers.constants.AddressZero);
      expenditureSlot = await colony.getExpenditureSlot(expenditureId, SLOT1);
      expect(expenditureSlot.recipient).to.equal(RECIPIENT);
      expenditureSlot = await colony.getExpenditureSlot(expenditureId, SLOT2);
      expect(expenditureSlot.recipient).to.equal(USER);
    });

    it("should not allow owners to update many slot recipients with mismatched arguments", async () => {
      await checkErrorRevert(colony.setExpenditureRecipients(expenditureId, [SLOT0, SLOT1], [USER], { from: ADMIN }), "colony-expenditure-bad-slots");
    });

    it("should allow owners to update a slot skill", async () => {
      await colony.setExpenditureSkill(expenditureId, SLOT0, GLOBAL_SKILL_ID, { from: ADMIN });

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, SLOT0);
      expect(expenditureSlot.skills[0]).to.eq.BN(GLOBAL_SKILL_ID);
    });

    it("should allow owners to update many slot skills at once", async () => {
      await colony.setExpenditureSkills(expenditureId, [SLOT1, SLOT2], [GLOBAL_SKILL_ID, GLOBAL_SKILL_ID], { from: ADMIN });

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, SLOT0);
      expect(expenditureSlot.skills[0]).to.be.zero;
      expenditureSlot = await colony.getExpenditureSlot(expenditureId, SLOT1);
      expect(expenditureSlot.skills[0]).to.eq.BN(GLOBAL_SKILL_ID);
      expenditureSlot = await colony.getExpenditureSlot(expenditureId, SLOT2);
      expect(expenditureSlot.skills[0]).to.eq.BN(GLOBAL_SKILL_ID);
    });

    it("should not allow owners to update many slot skills with mismatched arguments", async () => {
      await checkErrorRevert(
        colony.setExpenditureSkills(expenditureId, [SLOT0, SLOT1], [GLOBAL_SKILL_ID], { from: ADMIN }),
        "colony-expenditure-bad-slots"
      );
    });

    it("should allow owners to update a slot skill with a local skill", async () => {
      await colony.addLocalSkill();
      const localSkillId = await colonyNetwork.getSkillCount();

      await colony.setExpenditureSkill(expenditureId, SLOT0, localSkillId, { from: ADMIN });

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, SLOT0);
      expect(expenditureSlot.skills[0]).to.eq.BN(localSkillId);
    });

    it("should not allow owners to update a slot skill with a local skill from a different colony", async () => {
      const { colony: otherColony } = await setupRandomColony(colonyNetwork);
      await otherColony.addLocalSkill();
      const localSkillId = await colonyNetwork.getSkillCount();

      await checkErrorRevert(
        colony.setExpenditureSkill(expenditureId, SLOT0, localSkillId, { from: ADMIN }),
        "colony-not-valid-global-or-local-skill"
      );
    });

    it("should not allow owners to update a slot skill with a deprecated local skill", async () => {
      await colony.addLocalSkill();
      const localSkillId = await colonyNetwork.getSkillCount();
      await colony.deprecateLocalSkill(localSkillId, true);

      await checkErrorRevert(
        colony.setExpenditureSkill(expenditureId, SLOT0, localSkillId, { from: ADMIN }),
        "colony-not-valid-global-or-local-skill"
      );
    });

    it("should not allow owners to update many slot skills with nonexistent skills", async () => {
      await checkErrorRevert(colony.setExpenditureSkills(expenditureId, [SLOT0], [100], { from: ADMIN }), "colony-not-valid-global-or-local-skill");
    });

    it("should allow only owners to update a slot claim delay", async () => {
      await checkErrorRevert(colony.setExpenditureClaimDelay(expenditureId, SLOT0, SECONDS_PER_DAY, { from: USER }), "colony-expenditure-not-owner");

      await colony.setExpenditureClaimDelay(expenditureId, SLOT0, SECONDS_PER_DAY, { from: ADMIN });

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, SLOT0);
      expect(expenditureSlot.claimDelay).to.eq.BN(SECONDS_PER_DAY);
    });

    it("should allow owners to update many slot claim delays at once", async () => {
      await colony.setExpenditureClaimDelays(expenditureId, [SLOT1, SLOT2], [10, 20], { from: ADMIN });

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, SLOT0);
      expect(expenditureSlot.claimDelay).to.be.zero;
      expenditureSlot = await colony.getExpenditureSlot(expenditureId, SLOT1);
      expect(expenditureSlot.claimDelay).to.eq.BN(10);
      expenditureSlot = await colony.getExpenditureSlot(expenditureId, SLOT2);
      expect(expenditureSlot.claimDelay).to.eq.BN(20);
    });

    it("should not allow owners to update many slot claim delays with mismatched arguments", async () => {
      await checkErrorRevert(colony.setExpenditureClaimDelays(expenditureId, [SLOT0, SLOT1], [10], { from: ADMIN }), "colony-expenditure-bad-slots");
    });

    it("should allow only owners to update many slot payout modifiers at once", async () => {
      await checkErrorRevert(
        colony.setExpenditurePayoutModifiers(expenditureId, [SLOT1, SLOT2], [WAD.divn(2), WAD], { from: USER }),
        "colony-expenditure-not-owner"
      );

      await colony.setExpenditurePayoutModifiers(expenditureId, [SLOT1, SLOT2], [WAD.divn(2), WAD], { from: ADMIN });

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, SLOT0);
      expect(expenditureSlot.payoutModifier).to.be.zero;
      expenditureSlot = await colony.getExpenditureSlot(expenditureId, SLOT1);
      expect(expenditureSlot.payoutModifier).to.eq.BN(WAD.divn(2));
      expenditureSlot = await colony.getExpenditureSlot(expenditureId, SLOT2);
      expect(expenditureSlot.payoutModifier).to.eq.BN(WAD);
    });

    it("should not allow owners to update many slot payout modifiers with mismatched arguments", async () => {
      await checkErrorRevert(
        colony.setExpenditurePayoutModifiers(expenditureId, [SLOT0, SLOT1], [WAD], { from: ADMIN }),
        "colony-expenditure-bad-slots"
      );
    });

    it("should allow owners to update many slot payouts at once", async () => {
      await colony.setExpenditurePayouts(expenditureId, [SLOT1, SLOT2], token.address, [10, 20], { from: ADMIN });

      let payout;
      payout = await colony.getExpenditureSlotPayout(expenditureId, SLOT0, token.address);
      expect(payout).to.be.zero;
      payout = await colony.getExpenditureSlotPayout(expenditureId, SLOT1, token.address);
      expect(payout).to.eq.BN(10);
      payout = await colony.getExpenditureSlotPayout(expenditureId, SLOT2, token.address);
      expect(payout).to.eq.BN(20);
    });

    it("should not allow owners to update many slot payouts with mismatched arguments", async () => {
      await checkErrorRevert(
        colony.setExpenditurePayouts(expenditureId, [SLOT0, SLOT1], token.address, [WAD], { from: ADMIN }),
        "colony-expenditure-bad-slots"
      );
    });

    it("should not allow owners to set a non-global/local skill or a deprecated global skill", async () => {
      await checkErrorRevert(colony.setExpenditureSkill(expenditureId, SLOT0, 2, { from: ADMIN }), "colony-not-valid-global-or-local-skill");

      await metaColony.addGlobalSkill();
      const skillId = await colonyNetwork.getSkillCount();
      await metaColony.deprecateGlobalSkill(skillId);

      await checkErrorRevert(colony.setExpenditureSkill(expenditureId, SLOT0, skillId, { from: ADMIN }), "colony-not-valid-global-or-local-skill");
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
  });

  describe("when locking expenditures", () => {
    let expenditureId;

    beforeEach(async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: ADMIN });
      expenditureId = await colony.getExpenditureCount();

      await colony.lockExpenditure(expenditureId, { from: ADMIN });
    });

    it("should allow owners to lock expenditures", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: ADMIN });
      expenditureId = await colony.getExpenditureCount();

      let expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.status).to.eq.BN(DRAFT);

      await checkErrorRevert(colony.lockExpenditure(expenditureId, { from: USER }), "colony-expenditure-not-owner");
      await colony.lockExpenditure(expenditureId, { from: ADMIN });

      expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.status).to.eq.BN(LOCKED);
    });

    it("should not allow the owner to cancel the expenditure", async () => {
      await checkErrorRevert(colony.cancelExpenditure(expenditureId, { from: ADMIN }), "colony-expenditure-not-draft");
    });

    it("should not allow the owner to lock the expenditure again", async () => {
      await checkErrorRevert(colony.lockExpenditure(expenditureId, { from: ADMIN }), "colony-expenditure-not-draft");
    });

    it("should not allow the owner to set recipients", async () => {
      await checkErrorRevert(colony.setExpenditureRecipients(expenditureId, [SLOT0], [USER], { from: ADMIN }), "colony-expenditure-not-draft");
    });

    it("should not allow the owner to set skills", async () => {
      await checkErrorRevert(colony.setExpenditureSkills(expenditureId, [SLOT0], [GLOBAL_SKILL_ID], { from: ADMIN }), "colony-expenditure-not-draft");
    });

    it("should not allow the owner to set claim delays", async () => {
      await checkErrorRevert(
        colony.setExpenditureClaimDelays(expenditureId, [SLOT0], [SECONDS_PER_DAY], { from: ADMIN }),
        "colony-expenditure-not-draft"
      );
    });

    it("should not allow the owner to set payout modifiers", async () => {
      await checkErrorRevert(colony.setExpenditurePayoutModifiers(expenditureId, [SLOT0], [WAD], { from: ADMIN }), "colony-expenditure-not-draft");
    });

    it("should not allow the owner to set payouts", async () => {
      await checkErrorRevert(
        colony.setExpenditurePayouts(expenditureId, [SLOT0], token.address, [WAD], { from: ADMIN }),
        "colony-expenditure-not-draft"
      );
    });
  });

  describe("when finalizing expenditures", () => {
    let expenditureId;

    beforeEach(async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: ADMIN });
      expenditureId = await colony.getExpenditureCount();
    });

    it("should allow owners to finalize expenditures from draft state", async () => {
      let expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.status).to.eq.BN(DRAFT);

      await checkErrorRevert(colony.finalizeExpenditure(expenditureId, { from: USER }), "colony-expenditure-not-owner");
      const tx = await colony.finalizeExpenditure(expenditureId, { from: ADMIN });
      const currTime = await getBlockTime(tx.receipt.blockNumber);

      expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.status).to.eq.BN(FINALIZED);
      expect(expenditure.finalizedTimestamp).to.eq.BN(currTime);
    });

    it("should not allow an expenditure to be finalized twice", async () => {
      const expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.status).to.eq.BN(DRAFT);

      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });
      await checkErrorRevert(colony.finalizeExpenditure(expenditureId, { from: ADMIN }), "colony-expenditure-not-draft-or-locked");
    });

    it("should allow owners to finalize expenditures from locked state", async () => {
      await colony.lockExpenditure(expenditureId, { from: ADMIN });

      let expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.status).to.eq.BN(LOCKED);

      const tx = await colony.finalizeExpenditure(expenditureId, { from: ADMIN });
      const currTime = await getBlockTime(tx.receipt.blockNumber);

      expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.status).to.eq.BN(FINALIZED);
      expect(expenditure.finalizedTimestamp).to.eq.BN(currTime);
    });

    it("should not allow the owner to transfer the expenditure", async () => {
      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });

      await checkErrorRevert(colony.transferExpenditure(expenditureId, USER, { from: ADMIN }), "colony-expenditure-not-draft-or-locked");
    });

    it("cannot finalize expenditure if it is not fully funded", async () => {
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });

      await checkErrorRevert(colony.finalizeExpenditure(expenditureId, { from: ADMIN }), "colony-expenditure-not-funded");

      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        WAD,
        token.address
      );

      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });
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
      await colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        WAD,
        token.address
      );
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
      await colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        WAD,
        token.address
      );
      await colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        WAD,
        otherToken.address
      );
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
      await colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        WAD,
        token.address
      );
      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });
      await colony.claimExpenditurePayout(expenditureId, SLOT0, token.address);

      const payout = await colony.getExpenditureSlotPayout(expenditureId, SLOT0, token.address);
      expect(payout).to.be.zero;
    });

    it("should automatically reclaim funds for payoutModifiers of -1", async () => {
      await colony.setExpenditureRecipient(expenditureId, SLOT0, RECIPIENT, { from: ADMIN });
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });

      const mask = [MAPPING, ARRAY];
      const keys = ["0x0", bn2bytes32(new BN(2))];
      const value = bn2bytes32(WAD.neg().toTwos(256));
      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, value, { from: ARBITRATOR });

      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        WAD,
        token.address
      );
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

      const mask = [MAPPING, ARRAY];
      const keys = ["0x0", bn2bytes32(new BN(2))];
      const value = bn2bytes32(WAD.divn(3).neg().toTwos(256)); // 2/3 payout
      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, value, { from: ARBITRATOR });

      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        WAD,
        token.address
      );
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
      await colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        WAD,
        token.address
      );
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

    it("should delay claims by claimDelay", async () => {
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });

      const day32 = bn2bytes32(new BN(SECONDS_PER_DAY));
      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURES_SLOT, [ARRAY], [bn2bytes32(new BN(4))], day32);
      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, [MAPPING, ARRAY], ["0x0", bn2bytes32(new BN(1))], day32);

      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        WAD,
        token.address
      );
      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });

      await checkErrorRevert(colony.claimExpenditurePayout(expenditureId, SLOT0, token.address), "colony-expenditure-cannot-claim");
      await forwardTime(SECONDS_PER_DAY, this);
      await checkErrorRevert(colony.claimExpenditurePayout(expenditureId, SLOT0, token.address), "colony-expenditure-cannot-claim");
      await forwardTime(SECONDS_PER_DAY, this);
      await colony.claimExpenditurePayout(expenditureId, SLOT0, token.address);
    });

    it("should error when expenditure is not finalized", async () => {
      await checkErrorRevert(colony.claimExpenditurePayout(expenditureId, SLOT0, token.address), "colony-expenditure-not-finalized");
    });
  });

  describe("when claiming expenditures for extension contracts", () => {
    let expenditureId;
    let extensionAddress;
    const TEST_EXTENSION = soliditySha3("TestExtension");
    const extensionVersion = 0;

    before(async () => {
      // Install an extension

      const extensionImplementation = await TestExtension0.new();
      const resolver = await Resolver.new();
      await setupEtherRouter("TestExtension0", { TestExtension0: extensionImplementation.address }, resolver);

      await metaColony.addExtensionToNetwork(TEST_EXTENSION, resolver.address);

      await colony.installExtension(TEST_EXTENSION, extensionVersion);
      extensionAddress = await colonyNetwork.getExtensionInstallation(TEST_EXTENSION, colony.address);
    });

    beforeEach(async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: ADMIN });
      expenditureId = await colony.getExpenditureCount();
    });

    it("if recipient is own extension, should not award reputation or pay network fee", async () => {
      await colony.setExpenditureRecipient(expenditureId, SLOT0, extensionAddress, { from: ADMIN });
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });
      await colony.setExpenditureSkill(expenditureId, SLOT0, GLOBAL_SKILL_ID, { from: ADMIN });

      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        WAD,
        token.address
      );
      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });
      await colony.claimExpenditurePayout(expenditureId, SLOT0, token.address);

      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      const numEntries = await repCycle.getReputationUpdateLogLength();

      // No entry in the log should be for this address
      for (let i = new BN(0); i.lt(numEntries); i = i.addn(1)) {
        const skillEntry = await repCycle.getReputationUpdateLogEntry(i);
        expect(skillEntry.user).to.not.equal(extensionAddress);
      }

      // Balance should be whole payout
      const balance = await token.balanceOf(extensionAddress);
      expect(balance).to.eq.BN(WAD);
    });

    it("if recipient is an extension for another colony, should not award reputation but should pay fee", async () => {
      const { colony: otherColony } = await setupRandomColony(colonyNetwork);

      await otherColony.installExtension(TEST_EXTENSION, 0);
      const otherExtensionAddress = await colonyNetwork.getExtensionInstallation(TEST_EXTENSION, otherColony.address);

      await colony.setExpenditureRecipient(expenditureId, SLOT0, otherExtensionAddress, { from: ADMIN });
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });
      await colony.setExpenditureSkill(expenditureId, SLOT0, GLOBAL_SKILL_ID, { from: ADMIN });

      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        WAD,
        token.address
      );
      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });
      await colony.claimExpenditurePayout(expenditureId, SLOT0, token.address);

      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      const numEntries = await repCycle.getReputationUpdateLogLength();

      // No entry in the log should be for this address
      for (let i = new BN(0); i.lt(numEntries); i = i.addn(1)) {
        const skillEntry = await repCycle.getReputationUpdateLogEntry(i);
        expect(skillEntry.user).to.not.equal(otherExtensionAddress);
      }

      // But the balance should have the fee deducted
      const balance = await token.balanceOf(otherExtensionAddress);
      expect(balance).to.be.lt.BN(WAD);
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
      await colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        WAD,
        token.address
      );

      // Try to move funds back
      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, expenditure.fundingPotId, domain1.fundingPotId, WAD, token.address),
        "colony-funding-expenditure-bad-state"
      );

      await colony.cancelExpenditure(expenditureId, { from: ADMIN });
      await colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        expenditure.fundingPotId,
        domain1.fundingPotId,
        WAD,
        token.address
      );
    });
  });

  describe("when arbitrating expenditures", () => {
    let expenditureId;

    beforeEach(async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: ADMIN });
      expenditureId = await colony.getExpenditureCount();
    });

    it("should allow arbitration users to update expenditure status/owner", async () => {
      const mask = [ARRAY];
      const keys = [bn2bytes32(new BN(0))];
      const value = bn2bytes32(new BN(USER.slice(2), 16), 62) + new BN(CANCELLED).toString(16, 2);

      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURES_SLOT, mask, keys, value, { from: ARBITRATOR });

      const expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.status).to.eq.BN(CANCELLED);
      expect(expenditure.owner).to.equal(USER);
    });

    it("should not allow arbitration users to update expenditure fundingPotId", async () => {
      const mask = [ARRAY];
      const keys = [bn2bytes32(new BN(1))];
      const value = "0x0";

      await checkErrorRevert(
        colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURES_SLOT, mask, keys, value, { from: ARBITRATOR }),
        "colony-expenditure-bad-offset"
      );
    });

    it("should not allow arbitration users to update expenditure domainId", async () => {
      const mask = [ARRAY];
      const keys = [bn2bytes32(new BN(2))];
      const value = "0x0";

      await checkErrorRevert(
        colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURES_SLOT, mask, keys, value, { from: ARBITRATOR }),
        "colony-expenditure-bad-offset"
      );
    });

    it("should allow arbitration users to update expenditure finalizedTimestamp", async () => {
      const mask = [ARRAY];
      const keys = [bn2bytes32(new BN(3))];
      const value = bn2bytes32(new BN(100));

      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURES_SLOT, mask, keys, value, { from: ARBITRATOR });

      const expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.finalizedTimestamp).to.eq.BN(100);
    });

    it("should allow arbitration users to update expenditure slot recipient", async () => {
      const mask = [MAPPING, ARRAY];
      const keys = ["0x0", "0x0"];
      const value = bn2bytes32(new BN(USER.slice(2), 16));

      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, value, { from: ARBITRATOR });

      const expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.recipient).to.equal(USER);
    });

    it("should allow arbitration users to update expenditure slot claimDelay", async () => {
      const mask = [MAPPING, ARRAY];
      const keys = ["0x0", bn2bytes32(new BN(1))];
      const value = bn2bytes32(new BN(100));

      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, value, { from: ARBITRATOR });

      const expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.eq.BN(100);
    });

    it("should allow arbitration users to update expenditure slot payoutModifier", async () => {
      const mask = [MAPPING, ARRAY];
      const keys = ["0x0", bn2bytes32(new BN(2))];
      const value = bn2bytes32(new BN(100));

      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, value, { from: ARBITRATOR });

      const expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.payoutModifier).to.eq.BN(100);
    });

    it("should not allow arbitration users to pass an invalid payoutModifier", async () => {
      const mask = [MAPPING, ARRAY];
      const keys = ["0x0", bn2bytes32(new BN(2))];
      const value = bn2bytes32(WAD.muln(2));

      await checkErrorRevert(
        colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, value, { from: ARBITRATOR }),
        "colony-expenditure-bad-payout-modifier"
      );
    });

    it("should allow arbitration users to update expenditure slot skills", async () => {
      await colony.setExpenditureSkill(expenditureId, 0, GLOBAL_SKILL_ID, { from: ADMIN });

      const mask = [MAPPING, ARRAY, ARRAY];
      const keys = ["0x0", bn2bytes32(new BN(3)), bn2bytes32(new BN(0))];
      const value = bn2bytes32(new BN(100));

      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, value, { from: ARBITRATOR });

      const expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.skills[0]).to.eq.BN(100);
    });

    it("should allow arbitration users to add or remove expenditure slot skills", async () => {
      await colony.setExpenditureSkill(expenditureId, 0, GLOBAL_SKILL_ID, { from: ADMIN });

      let expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.skills.length).to.eq.BN(1);
      expect(expenditureSlot.skills[0]).to.eq.BN(GLOBAL_SKILL_ID);

      // Lengthen the array
      let mask = [MAPPING, ARRAY];
      let keys = ["0x0", bn2bytes32(new BN(3))];
      let value = bn2bytes32(new BN(2));

      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, value, { from: ARBITRATOR });

      // Set the new skillId
      mask = [MAPPING, ARRAY, ARRAY];
      keys = ["0x0", bn2bytes32(new BN(3)), bn2bytes32(new BN(1))];
      value = bn2bytes32(new BN(100));

      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, value, { from: ARBITRATOR });

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.skills.length).to.eq.BN(2);
      expect(expenditureSlot.skills[0]).to.eq.BN(GLOBAL_SKILL_ID);
      expect(expenditureSlot.skills[1]).to.eq.BN(100);

      // Shrink the array
      mask = [MAPPING, ARRAY];
      keys = ["0x0", bn2bytes32(new BN(3))];
      value = bn2bytes32(new BN(1));

      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, value, { from: ARBITRATOR });

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.skills.length).to.eq.BN(1);
      expect(expenditureSlot.skills[0]).to.eq.BN(GLOBAL_SKILL_ID);
    });

    it("should allow arbitration users to update expenditure slot payouts", async () => {
      const setExpenditurePayouts = colony.methods["setExpenditurePayouts(uint256,uint256,uint256,uint256[],address,uint256[])"];
      await setExpenditurePayouts(1, UINT256_MAX, expenditureId, [0], token.address, [100], { from: ARBITRATOR });

      const expenditureSlotPayout = await colony.getExpenditureSlotPayout(expenditureId, 0, token.address);
      expect(expenditureSlotPayout).to.eq.BN(100);
    });

    it("should not allow arbitration users to pass invalid slots", async () => {
      const mask = [ARRAY];
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
      const mask = [MAPPING, ARRAY, ARRAY];
      const keys = ["0x0", bn2bytes32(new BN(3)), bn2bytes32(new BN(1025))];
      const value = bn2bytes32(new BN(100));

      await checkErrorRevert(
        colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, value, { from: ARBITRATOR }),
        "colony-expenditure-large-offset"
      );
    });

    it("should not allow arbitration users to pass bad sets of keys for what they're trying to change", async () => {
      const mask = [MAPPING, ARRAY, ARRAY];
      let keys = ["0x0", bn2bytes32(new BN(10)), bn2bytes32(new BN(10))];

      await checkErrorRevert(
        colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURES_SLOT, mask, keys, HASHZERO, { from: ARBITRATOR }),
        "colony-expenditure-bad-keys"
      );

      await checkErrorRevert(
        colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, HASHZERO, { from: ARBITRATOR }),
        "colony-expenditure-bad-offset"
      );

      keys = [bn2bytes32(new BN(10))];

      await checkErrorRevert(
        colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, HASHZERO, { from: ARBITRATOR }),
        "colony-expenditure-bad-keys"
      );

      await checkErrorRevert(
        colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTPAYOUTS_SLOT, mask, keys, HASHZERO, { from: ARBITRATOR }),
        "colony-expenditure-bad-keys"
      );

      await checkErrorRevert(
        colony.setExpenditureState(1, UINT256_MAX, expenditureId, 1000000, mask, keys, HASHZERO, { from: ARBITRATOR }),
        "colony-expenditure-bad-slot"
      );
    });

    it("should scale down payout by payoutScalar", async () => {
      await colony.setExpenditureRecipient(expenditureId, SLOT0, RECIPIENT, { from: ADMIN });
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });

      // Modifier of -0.5 WAD translates to scalar of 0.5 WAD
      const mask = [MAPPING, ARRAY];
      const keys = ["0x0", bn2bytes32(new BN(2))];
      const value = bn2bytes32(WAD.divn(2).neg().toTwos(256));
      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, value, { from: ARBITRATOR });

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
      const mask = [MAPPING, ARRAY];
      const keys = ["0x0", bn2bytes32(new BN(2))];
      const value = bn2bytes32(WAD);
      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, value, { from: ARBITRATOR });

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

      const mask = [MAPPING, ARRAY];
      const keys = ["0x0", bn2bytes32(new BN(2))];
      const value = bn2bytes32(WAD);
      await colony.setExpenditureState(1, UINT256_MAX, expenditureId, EXPENDITURESLOTS_SLOT, mask, keys, value, { from: ARBITRATOR });

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
  });
});
