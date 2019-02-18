/* globals artifacts */
import { BN } from "bn.js";
import { soliditySha3 } from "web3-utils";
import chai from "chai";
import bnChai from "bn-chai";

import {
  fundColonyWithTokens,
  makePayment,
  setupFundedTask,
  setupFinalizedTask,
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  giveUserCLNYTokensAndStake
} from "../helpers/test-data-generator";

import {
  INT256_MAX,
  INT128_MAX,
  INT128_MIN,
  WAD,
  DEFAULT_STAKE,
  DELIVERABLE_HASH,
  INITIAL_FUNDING,
  MANAGER_PAYOUT,
  EVALUATOR_PAYOUT,
  WORKER_PAYOUT,
  MAX_PAYOUT,
  SECONDS_PER_DAY,
  MANAGER_ROLE,
  WORKER_ROLE,
  RATING_1_SALT,
  RATING_2_SALT,
  RATING_1_SECRET,
  RATING_2_SECRET
} from "../helpers/constants";

import { checkErrorRevert, forwardTime, advanceMiningCycleNoContest } from "../helpers/test-helper";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");

contract("Reputation Updates", accounts => {
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
    // Setup a new network instance as we'll be modifying the global skills tree
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

    await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);
    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
  });

  beforeEach(async function() {
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
    it("should be readable for payments", async () => {
      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING);
      const paymentId = await makePayment({ colony: metaColony, domainId: 1 });

      await metaColony.setTaskWorkerPayout(paymentId, clnyToken.address, WAD);
      await metaColony.setTaskWorkerRole(paymentId, WORKER);

      const payment = await metaColony.getPayment(paymentId);
      const domain = await metaColony.getDomain(1);
      await metaColony.moveFundsBetweenPots(domain.fundingPotId, payment.fundingPotId, WAD, clnyToken.address);

      await metaColony.finalizePayment(paymentId);

      const repLogEntryManager = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(1);
      expect(repLogEntryManager.user).to.equal(WORKER);
      expect(repLogEntryManager.amount).to.eq.BN(WAD);
      expect(repLogEntryManager.skillId).to.eq.BN(2);
      expect(repLogEntryManager.colony).to.equal(metaColony.address);
      expect(repLogEntryManager.nUpdates).to.eq.BN(2);
      expect(repLogEntryManager.nPreviousUpdates).to.eq.BN(4); // There are 4 reputation miner updates
    });

    it("should be readable for tasks", async () => {
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      const repLogEntryManager = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(1);
      expect(repLogEntryManager.user).to.equal(MANAGER);
      expect(repLogEntryManager.amount).to.eq.BN(MANAGER_PAYOUT);
      expect(repLogEntryManager.skillId).to.eq.BN(2);
      expect(repLogEntryManager.colony).to.equal(metaColony.address);
      expect(repLogEntryManager.nUpdates).to.eq.BN(2);
      expect(repLogEntryManager.nPreviousUpdates).to.eq.BN(4); // There are 4 reputation miner updates

      const repLogEntryEvaluator = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(2);
      expect(repLogEntryEvaluator.user).to.equal(EVALUATOR);
      expect(repLogEntryEvaluator.amount).to.eq.BN(EVALUATOR_PAYOUT);
      expect(repLogEntryEvaluator.skillId).to.eq.BN(2);
      expect(repLogEntryEvaluator.colony).to.equal(metaColony.address);
      expect(repLogEntryEvaluator.nUpdates).to.eq.BN(2);
      expect(repLogEntryEvaluator.nPreviousUpdates).to.eq.BN(6);

      const repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(3);
      expect(repLogEntryWorker.user).to.equal(WORKER);
      expect(repLogEntryWorker.amount).to.eq.BN(WORKER_PAYOUT);
      expect(repLogEntryWorker.skillId).to.eq.BN(2);
      expect(repLogEntryWorker.colony).to.equal(metaColony.address);
      expect(repLogEntryWorker.nUpdates).to.eq.BN(2);
      expect(repLogEntryWorker.nPreviousUpdates).to.eq.BN(8);
    });

    const ratings = [
      {
        manager: 1,
        reputationChangeManager: MANAGER_PAYOUT.neg(),
        worker: 1,
        reputationChangeWorker: WORKER_PAYOUT.neg()
      },
      {
        manager: 2,
        reputationChangeManager: MANAGER_PAYOUT,
        worker: 2,
        reputationChangeWorker: WORKER_PAYOUT
      },
      {
        manager: 3,
        reputationChangeManager: MANAGER_PAYOUT.muln(3).divn(2),
        worker: 3,
        reputationChangeWorker: WORKER_PAYOUT.muln(3).divn(2)
      }
    ];

    ratings.forEach(async rating => {
      it(`should set the correct reputation change amount in log for rating ${rating.worker}`, async () => {
        await setupFinalizedTask({
          colonyNetwork,
          colony: metaColony,
          managerRating: rating.manager,
          workerRating: rating.worker
        });

        const repLogEntryManager = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(1);
        expect(repLogEntryManager.user).to.equal(MANAGER);
        expect(repLogEntryManager.amount).to.eq.BN(rating.reputationChangeManager);
        expect(repLogEntryManager.skillId).to.eq.BN(2);
        expect(repLogEntryManager.colony).to.equal(metaColony.address);

        // If the rating is less than 2, then we also subtract reputation from all child skills. In the case
        // of the metaColony here, the task was created in the root domain of the metaColony, and a child of the
        // root skill is the mining skill. So the number we expect here differs depending on whether it's a reputation
        // gain or loss that we're logging.
        if (rating.manager >= 2) {
          expect(repLogEntryManager.nUpdates).to.eq.BN(2);
        } else {
          expect(repLogEntryManager.nUpdates).to.eq.BN(4);
        }
        expect(repLogEntryManager.nPreviousUpdates).to.eq.BN(4); // Miner reward updates

        const repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(3);
        expect(repLogEntryWorker.user).to.equal(WORKER);
        expect(repLogEntryWorker.amount).to.eq.BN(rating.reputationChangeWorker);
        expect(repLogEntryWorker.skillId).to.eq.BN(2);
        expect(repLogEntryWorker.colony).to.equal(metaColony.address);
        if (rating.worker >= 2) {
          expect(repLogEntryWorker.nUpdates).to.eq.BN(2);
        } else {
          expect(repLogEntryWorker.nUpdates).to.eq.BN(4);
        }
        // This last entry in the log entry is nPreviousUpdates, which depends on whether the manager was given a reputation
        // gain or loss. It includes 4 miner reward updates
        if (rating.manager >= 2) {
          expect(repLogEntryWorker.nPreviousUpdates).to.eq.BN(8);
        } else {
          expect(repLogEntryWorker.nPreviousUpdates).to.eq.BN(10);
        }
      });
    });

    it("should set the correct reputation change amount in log when all users have failed to rate", async function() {
      const taskId = await setupFundedTask({ colonyNetwork, colony: metaColony, evaluator: accounts[1] });
      await metaColony.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER });
      await forwardTime(SECONDS_PER_DAY * 11, this);
      await metaColony.finalizeTask(taskId);

      const repLogEntryManager = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(1);
      expect(repLogEntryManager.user).to.equal(MANAGER);
      expect(repLogEntryManager.amount).to.eq.BN(MANAGER_PAYOUT.muln(3).divn(2));

      const repLogEntryEvaluator = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(2);
      expect(repLogEntryEvaluator.user).to.equal(accounts[1]);
      expect(repLogEntryEvaluator.amount).to.eq.BN(EVALUATOR_PAYOUT.muln(3).divn(2).neg()); // eslint-disable-line prettier/prettier

      const repLogEntryWorker1 = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(3);
      expect(repLogEntryWorker1.user).to.equal(WORKER);
      expect(repLogEntryWorker1.amount).to.eq.BN(WORKER_PAYOUT);

      const repLogEntryWorker2 = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(4);
      expect(repLogEntryWorker2.user).to.equal(WORKER);
      expect(repLogEntryWorker2.amount).to.eq.BN(WORKER_PAYOUT);
    });

    it("should set the correct reputation change amount in log when evaluator has failed to rate", async function() {
      const taskId = await setupFundedTask({ colonyNetwork, colony: metaColony, evaluator: accounts[1] });
      await metaColony.submitTaskDeliverableAndRating(taskId, DELIVERABLE_HASH, RATING_2_SECRET, { from: WORKER });
      await forwardTime(SECONDS_PER_DAY * 6, this);
      await metaColony.revealTaskWorkRating(taskId, MANAGER_ROLE, 2, RATING_2_SALT, { from: WORKER });
      await forwardTime(SECONDS_PER_DAY * 6, this);
      await metaColony.finalizeTask(taskId);

      const repLogEntryManager = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(1);
      expect(repLogEntryManager.user).to.equal(MANAGER);
      expect(repLogEntryManager.amount).to.eq.BN(MANAGER_PAYOUT);

      const repLogEntryEvaluator = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(2);
      expect(repLogEntryEvaluator.user).to.equal(accounts[1]);
      expect(repLogEntryEvaluator.amount).to.eq.BN(EVALUATOR_PAYOUT.muln(3).divn(2).neg()); // eslint-disable-line prettier/prettier

      const repLogEntryWorker1 = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(3);
      expect(repLogEntryWorker1.user).to.equal(WORKER);
      expect(repLogEntryWorker1.amount).to.eq.BN(WORKER_PAYOUT.muln(3).divn(2));

      const repLogEntryWorker2 = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(4);
      expect(repLogEntryWorker2.user).to.equal(WORKER);
      expect(repLogEntryWorker2.amount).to.eq.BN(WORKER_PAYOUT.muln(3).divn(2));
    });

    it("should set the correct reputation change amount in log when worker has failed to rate", async function() {
      const taskId = await setupFundedTask({ colonyNetwork, colony: metaColony, evaluator: accounts[1] });
      await metaColony.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER });
      await metaColony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_1_SECRET, { from: accounts[1] });
      await forwardTime(SECONDS_PER_DAY * 6, this);
      await metaColony.revealTaskWorkRating(taskId, WORKER_ROLE, 2, RATING_1_SALT, { from: accounts[1] });
      await forwardTime(SECONDS_PER_DAY * 6, this);
      await metaColony.finalizeTask(taskId);

      const repLogEntryManager = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(1);
      expect(repLogEntryManager.user).to.equal(MANAGER);
      expect(repLogEntryManager.amount).to.eq.BN(MANAGER_PAYOUT.muln(3).divn(2));

      const repLogEntryEvaluator = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(2);
      expect(repLogEntryEvaluator.user).to.equal(accounts[1]);
      expect(repLogEntryEvaluator.amount).to.eq.BN(EVALUATOR_PAYOUT);

      const repLogEntryWorker1 = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(3);
      expect(repLogEntryWorker1.user).to.equal(WORKER);
      expect(repLogEntryWorker1.amount).to.eq.BN(WORKER_PAYOUT.divn(2));

      const repLogEntryWorker2 = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(4);
      expect(repLogEntryWorker2.user).to.equal(WORKER);
      expect(repLogEntryWorker2.amount).to.eq.BN(WORKER_PAYOUT.divn(2));
    });

    it("should not be able to be appended by an account that is not a colony", async () => {
      const lengthBefore = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      await checkErrorRevert(colonyNetwork.appendReputationUpdateLog(OTHER, 1, 2), "colony-caller-must-be-colony");
      const lengthAfter = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      expect(lengthBefore).to.eq.BN(lengthAfter);
    });

    it("should populate nPreviousUpdates correctly", async () => {
      const initialRepLogLength = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      let repLogEntry = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(initialRepLogLength.addn(1));
      const nPrevious = new BN(repLogEntry.nPreviousUpdates);
      repLogEntry = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(initialRepLogLength.addn(2));
      expect(repLogEntry.nPreviousUpdates).to.eq.BN(nPrevious.addn(2));

      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      repLogEntry = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(initialRepLogLength.addn(3));
      expect(repLogEntry.nPreviousUpdates).to.eq.BN(nPrevious.addn(4));
    });

    it("should calculate nUpdates correctly when making a log", async () => {
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(4);
      await metaColony.addGlobalSkill(5);
      await metaColony.addGlobalSkill(6);

      await setupFinalizedTask({ colonyNetwork, colony: metaColony, skillId: 5 });
      let repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(4);
      expect(repLogEntryWorker.amount).to.eq.BN(WORKER_PAYOUT);
      expect(repLogEntryWorker.nUpdates).to.eq.BN(6);

      await setupFinalizedTask({ colonyNetwork, colony: metaColony, skillId: 6 });
      repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(8);
      expect(repLogEntryWorker.amount).to.eq.BN(WORKER_PAYOUT);
      expect(repLogEntryWorker.nUpdates).to.eq.BN(8); // Negative reputation change means children change as well.
    });

    it("should correctly make large positive reputation updates", async () => {
      await fundColonyWithTokens(metaColony, clnyToken, INT256_MAX);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony, workerPayout: MAX_PAYOUT, workerRating: 3 });

      const repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(4);
      expect(repLogEntryWorker.user).to.equal(WORKER);
      expect(repLogEntryWorker.amount).to.eq.BN(INT128_MAX);
    });

    it("should correctly make large negative reputation updates", async function() {
      const workerRating = 1;
      const workerRatingSecret = soliditySha3(RATING_2_SALT, workerRating);

      await fundColonyWithTokens(metaColony, clnyToken, MAX_PAYOUT);
      const taskId = await setupFundedTask({ colonyNetwork, colony: metaColony, workerPayout: MAX_PAYOUT });
      await metaColony.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER });
      await metaColony.submitTaskWorkRating(taskId, WORKER_ROLE, workerRatingSecret, { from: EVALUATOR });
      await forwardTime(SECONDS_PER_DAY * 5 + 1, this);
      await metaColony.revealTaskWorkRating(taskId, WORKER_ROLE, workerRating, RATING_2_SALT, { from: EVALUATOR });
      // Run out the submissions window to get the no-rate penalty for the worker.
      await forwardTime(SECONDS_PER_DAY * 5, this);
      await metaColony.finalizeTask(taskId);

      const roleWorker = await metaColony.getTaskRole(taskId, WORKER_ROLE);
      expect(roleWorker.rateFail).to.be.true;
      expect(roleWorker.rating).to.eq.BN(workerRating);

      const repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(4);
      expect(repLogEntryWorker.user).to.equal(WORKER);
      expect(repLogEntryWorker.amount).to.eq.BN(INT128_MIN);
    });

    it("should not make zero-valued reputation updates", async () => {
      await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony, workerPayout: 0 });

      // Entries for manager and evaluator only + 1 for miner reward
      const numUpdates = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      expect(numUpdates).to.eq.BN(3);
    });
  });
});
