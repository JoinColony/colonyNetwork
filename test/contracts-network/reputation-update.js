/* globals artifacts */
const { BN } = require("bn.js");
const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");

const {
  UINT256_MAX,
  INT128_MAX,
  INT128_MIN,
  WAD,
  DEFAULT_STAKE,
  INITIAL_FUNDING,
  MANAGER_PAYOUT,
  EVALUATOR_PAYOUT,
  WORKER_PAYOUT,
} = require("../../helpers/constants");

const { fundColonyWithTokens, setupClaimedExpenditure, giveUserCLNYTokensAndStake } = require("../../helpers/test-data-generator");
const { checkErrorRevert, advanceMiningCycleNoContest, getTokenArgs, removeSubdomainLimit } = require("../../helpers/test-helper");

const ADDRESS_ZERO = ethers.constants.AddressZero;

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IMetaColony = artifacts.require("IMetaColony");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const Token = artifacts.require("Token");

contract("Reputation Updates", (accounts) => {
  const MANAGER = accounts[0];
  const EVALUATOR = MANAGER;
  const WORKER = accounts[2];
  const OTHER = accounts[3];
  const MINER1 = accounts[5];

  let colonyNetwork;
  let metaColony;
  let clnyToken;
  let inactiveReputationMiningCycle;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);

    await metaColony.setArbitrationRole(1, UINT256_MAX, MANAGER, 1, true);

    const clnyTokenAddress = await metaColony.getToken();
    clnyToken = await Token.at(clnyTokenAddress);
  });

  beforeEach(async function () {
    const amount = WAD.mul(new BN(1000));
    await fundColonyWithTokens(metaColony, clnyToken, amount);

    await advanceMiningCycleNoContest({ colonyNetwork, test: this });
    await advanceMiningCycleNoContest({ colonyNetwork, test: this });

    // Burn MAIN_ACCOUNTS accumulated mining rewards.
    const userBalance = await clnyToken.balanceOf(MINER1);
    await clnyToken.burn(userBalance, { from: MINER1 });

    await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);
    const inactiveReputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
    inactiveReputationMiningCycle = await IReputationMiningCycle.at(inactiveReputationMiningCycleAddress);
  });

  describe("when added", () => {
    it("should be readable", async () => {
      await setupClaimedExpenditure({ colonyNetwork, colony: metaColony });

      const repLogEntryManager = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(1);
      expect(repLogEntryManager.user).to.equal(MANAGER);
      expect(repLogEntryManager.amount).to.eq.BN(MANAGER_PAYOUT);
      expect(repLogEntryManager.skillId).to.eq.BN(1);
      expect(repLogEntryManager.colony).to.equal(metaColony.address);
      expect(repLogEntryManager.nUpdates).to.eq.BN(2);
      expect(repLogEntryManager.nPreviousUpdates).to.eq.BN(4); // There are 4 reputation miner updates

      const repLogEntryEvaluator = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(2);
      expect(repLogEntryEvaluator.user).to.equal(EVALUATOR);
      expect(repLogEntryEvaluator.amount).to.eq.BN(EVALUATOR_PAYOUT);
      expect(repLogEntryEvaluator.skillId).to.eq.BN(1);
      expect(repLogEntryEvaluator.colony).to.equal(metaColony.address);
      expect(repLogEntryEvaluator.nUpdates).to.eq.BN(2);
      expect(repLogEntryEvaluator.nPreviousUpdates).to.eq.BN(6);

      const repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(3);
      expect(repLogEntryWorker.user).to.equal(WORKER);
      expect(repLogEntryWorker.amount).to.eq.BN(WORKER_PAYOUT);
      expect(repLogEntryWorker.skillId).to.eq.BN(1);
      expect(repLogEntryWorker.colony).to.equal(metaColony.address);
      expect(repLogEntryWorker.nUpdates).to.eq.BN(2);
      expect(repLogEntryWorker.nPreviousUpdates).to.eq.BN(8);
    });

    it("should not be able to be appended by an account that is not a colony", async () => {
      const lengthBefore = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      await checkErrorRevert(colonyNetwork.appendReputationUpdateLog(OTHER, 1, 2), "colony-caller-must-be-colony");
      const lengthAfter = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      expect(lengthBefore).to.eq.BN(lengthAfter);
    });

    it("should populate nPreviousUpdates correctly", async () => {
      const initialRepLogLength = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      await setupClaimedExpenditure({ colonyNetwork, colony: metaColony });

      let repLogEntry = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(initialRepLogLength.addn(1));
      const nPrevious = new BN(repLogEntry.nPreviousUpdates);
      repLogEntry = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(initialRepLogLength.addn(2));
      expect(repLogEntry.nPreviousUpdates).to.eq.BN(nPrevious.addn(2));

      await setupClaimedExpenditure({ colonyNetwork, colony: metaColony });
      repLogEntry = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(initialRepLogLength.addn(3));
      expect(repLogEntry.nPreviousUpdates).to.eq.BN(nPrevious.addn(4));
    });

    it("should calculate nUpdates correctly when making a log", async () => {
      await removeSubdomainLimit(colonyNetwork); // Temporary for tests until we allow subdomain depth > 1
      await metaColony.addDomain(1, UINT256_MAX, 1);
      await metaColony.addDomain(1, 1, 2);
      await metaColony.addDomain(1, 2, 3);
      await metaColony.addDomain(1, 3, 4);
      // 1 => 2 => 3 => 4 => 5

      await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, domainId: 3 });

      let repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(1);
      expect(repLogEntryWorker.amount).to.eq.BN(MANAGER_PAYOUT);
      expect(repLogEntryWorker.nUpdates).to.eq.BN(6);

      await metaColony.emitDomainReputationPenalty(1, 3, 4, WORKER, WORKER_PAYOUT.neg(), { from: MANAGER });

      // (Parents + 1) * 2 + Children * 2 updates
      repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(5);
      expect(repLogEntryWorker.amount).to.eq.BN(WORKER_PAYOUT.neg());
      expect(repLogEntryWorker.nUpdates).to.eq.BN(10); // Negative reputation change means children change as well.
    });

    it("should correctly make large positive reputation updates", async () => {
      await metaColony.emitDomainReputationReward(1, WORKER, INT128_MAX, { from: MANAGER });

      const repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(1);
      expect(repLogEntryWorker.user).to.equal(WORKER);
      expect(repLogEntryWorker.amount).to.eq.BN(INT128_MAX);
    });

    it("should correctly make large negative reputation updates", async function () {
      await metaColony.emitDomainReputationPenalty(1, UINT256_MAX, 1, WORKER, INT128_MIN, { from: MANAGER });

      const repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(1);
      expect(repLogEntryWorker.user).to.equal(WORKER);
      expect(repLogEntryWorker.amount).to.eq.BN(INT128_MIN);
    });

    it("should not make zero-valued reputation updates", async () => {
      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING);
      await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, workerPayout: 0 });

      // Entries for manager and evaluator only + 1 for miner reward
      const numUpdates = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      expect(numUpdates).to.eq.BN(3);
    });

    it("should not make reputation updates to the zero address", async () => {
      // Entry for miner reward only
      let numUpdates = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      expect(numUpdates).to.eq.BN(1);

      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING);
      const RECIPIENT = ADDRESS_ZERO;
      await metaColony.makeExpenditure(1, UINT256_MAX, 1);
      const expenditureId = await metaColony.getExpenditureCount();

      const SLOT0 = 0;

      await metaColony.setExpenditureRecipient(expenditureId, SLOT0, RECIPIENT);
      await metaColony.setExpenditurePayout(expenditureId, SLOT0, clnyToken.address, WAD);

      const domain1 = await metaColony.getDomain(1);

      const expenditure = await metaColony.getExpenditure(expenditureId);
      await metaColony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        WAD,
        clnyToken.address,
      );
      await metaColony.finalizeExpenditure(expenditureId);
      await metaColony.claimExpenditurePayout(expenditureId, SLOT0, clnyToken.address);

      // Entry for miner reward only still
      numUpdates = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      expect(numUpdates).to.eq.BN(1);
    });

    it("should not add entries to the reputation log for expenditures that are not in the colony home token", async () => {
      const otherToken = await Token.new(...getTokenArgs());
      await otherToken.unlock();
      await fundColonyWithTokens(metaColony, otherToken, WAD.muln(500));

      await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, tokenAddress: otherToken.address });

      const reputationUpdateLogLength = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      expect(reputationUpdateLogLength).to.eq.BN(1); // Just the miner reward
    });
  });
});
