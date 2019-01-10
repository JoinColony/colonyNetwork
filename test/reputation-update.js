/* globals artifacts */
import { BN } from "bn.js";
import web3Utils from "web3-utils";
import chai from "chai";
import bnChai from "bn-chai";

import {
  fundColonyWithTokens,
  setupFundedTask,
  setupFinalizedTask,
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken
} from "../helpers/test-data-generator";

import {
  INT256_MAX,
  INT128_MAX,
  INT128_MIN,
  WAD,
  DELIVERABLE_HASH,
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

import { checkErrorRevert, forwardTime } from "../helpers/test-helper";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");

contract("Reputation Updates", accounts => {
  const MANAGER = accounts[0];
  const EVALUATOR = MANAGER;
  const WORKER = accounts[2];
  const OTHER = accounts[3];

  let colonyNetwork;
  let metaColony;
  let clnyToken;
  let inactiveReputationMiningCycle;

  beforeEach(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

    const amount = WAD.mul(new BN(1000));
    await fundColonyWithTokens(metaColony, clnyToken, amount);

    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
    const inactiveReputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
    inactiveReputationMiningCycle = await IReputationMiningCycle.at(inactiveReputationMiningCycleAddress);
  });

  describe("when added", () => {
    it("should be readable", async () => {
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });

      const repLogEntryManager = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(0);
      assert.strictEqual(repLogEntryManager.user, MANAGER);
      expect(new BN(repLogEntryManager.amount)).to.eq.BN(MANAGER_PAYOUT);
      assert.strictEqual(repLogEntryManager.skillId, "2");
      assert.strictEqual(repLogEntryManager.colony, metaColony.address);
      assert.strictEqual(repLogEntryManager.nUpdates, "2");
      assert.strictEqual(repLogEntryManager.nPreviousUpdates, "0");

      const repLogEntryEvaluator = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(1);
      assert.strictEqual(repLogEntryEvaluator.user, EVALUATOR);
      expect(new BN(repLogEntryEvaluator.amount)).to.eq.BN(EVALUATOR_PAYOUT);
      assert.strictEqual(repLogEntryEvaluator.skillId, "2");
      assert.strictEqual(repLogEntryEvaluator.colony, metaColony.address);
      assert.strictEqual(repLogEntryEvaluator.nUpdates, "2");
      assert.strictEqual(repLogEntryEvaluator.nPreviousUpdates, "2");

      const repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(2);
      assert.strictEqual(repLogEntryWorker.user, WORKER);
      expect(new BN(repLogEntryWorker.amount)).to.eq.BN(WORKER_PAYOUT);
      assert.strictEqual(repLogEntryWorker.skillId, "2");
      assert.strictEqual(repLogEntryWorker.colony, metaColony.address);
      assert.strictEqual(repLogEntryWorker.nUpdates, "2");
      assert.strictEqual(repLogEntryWorker.nPreviousUpdates, "4");
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

        const repLogEntryManager = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(0);
        assert.strictEqual(repLogEntryManager.user, MANAGER);
        assert.strictEqual(repLogEntryManager.amount, rating.reputationChangeManager.toString());
        assert.strictEqual(repLogEntryManager.skillId, "2");
        assert.strictEqual(repLogEntryManager.colony, metaColony.address);
        // If the rating is less than 2, then we also subtract reputation from all child skills. In the case
        // of the metaColony here, the task was created in the root domain of the metaColony, and a child of the
        // root skill is the mining skill. So the number we expect here differs depending on whether it's a reputation
        // gain or loss that we're logging.
        if (rating.manager >= 2) {
          assert.strictEqual(repLogEntryManager.nUpdates, "2");
        } else {
          assert.strictEqual(repLogEntryManager.nUpdates, "4");
        }
        assert.strictEqual(repLogEntryManager.nPreviousUpdates, "0");

        const repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(2);
        assert.strictEqual(repLogEntryWorker.user, WORKER);
        assert.strictEqual(repLogEntryWorker.amount, rating.reputationChangeWorker.toString());
        assert.strictEqual(repLogEntryWorker.skillId, "2");
        assert.strictEqual(repLogEntryWorker.colony, metaColony.address);
        if (rating.worker >= 2) {
          assert.strictEqual(repLogEntryWorker.nUpdates, "2");
        } else {
          assert.strictEqual(repLogEntryWorker.nUpdates, "4");
        }
        // This last entry in the log entry is nPreviousUpdates, which depends on whether the manager was given a reputation
        // gain or loss.
        if (rating.manager >= 2) {
          assert.strictEqual(repLogEntryWorker.nPreviousUpdates, "4");
        } else {
          assert.strictEqual(repLogEntryWorker.nPreviousUpdates, "6");
        }
      });
    });

    it("should set the correct reputation change amount in log when all users have failed to rate", async () => {
      const taskId = await setupFundedTask({ colonyNetwork, colony: metaColony, evaluator: accounts[1] });
      await metaColony.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER });
      await forwardTime(SECONDS_PER_DAY * 11, this);
      await metaColony.finalizeTask(taskId);

      const repLogEntryManager = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(0);
      assert.strictEqual(repLogEntryManager.user, MANAGER);
      assert.strictEqual(
        repLogEntryManager.amount,
        MANAGER_PAYOUT.muln(3)
          .divn(2)
          .toString()
      );

      const repLogEntryEvaluator = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(1);
      assert.strictEqual(repLogEntryEvaluator.user, accounts[1]);
      assert.strictEqual(
        repLogEntryEvaluator.amount,
        EVALUATOR_PAYOUT.muln(3)
          .divn(2)
          .mul(new BN(-1))
          .toString()
      );

      const repLogEntryWorker1 = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(2);
      assert.strictEqual(repLogEntryWorker1.user, WORKER);
      assert.strictEqual(repLogEntryWorker1.amount, WORKER_PAYOUT.toString());

      const repLogEntryWorker2 = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(3);
      assert.strictEqual(repLogEntryWorker2.user, WORKER);
      assert.strictEqual(repLogEntryWorker2.amount, WORKER_PAYOUT.toString());
    });

    it("should set the correct reputation change amount in log when evaluator has failed to rate", async () => {
      const taskId = await setupFundedTask({ colonyNetwork, colony: metaColony, evaluator: accounts[1] });
      await metaColony.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER });
      await metaColony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_2_SECRET, { from: WORKER });
      await forwardTime(SECONDS_PER_DAY * 6, this);
      await metaColony.revealTaskWorkRating(taskId, MANAGER_ROLE, 2, RATING_2_SALT, { from: WORKER });
      await forwardTime(SECONDS_PER_DAY * 6, this);
      await metaColony.finalizeTask(taskId);

      const repLogEntryManager = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(0);
      assert.strictEqual(repLogEntryManager.user, MANAGER);
      assert.strictEqual(repLogEntryManager.amount, MANAGER_PAYOUT.toString());

      const repLogEntryEvaluator = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(1);
      assert.strictEqual(repLogEntryEvaluator.user, accounts[1]);
      assert.strictEqual(
        repLogEntryEvaluator.amount,
        EVALUATOR_PAYOUT.muln(3)
          .divn(2)
          .mul(new BN(-1))
          .toString()
      );

      const repLogEntryWorker1 = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(2);
      assert.strictEqual(repLogEntryWorker1.user, WORKER);
      assert.strictEqual(
        repLogEntryWorker1.amount,
        WORKER_PAYOUT.muln(3)
          .divn(2)
          .toString()
      );

      const repLogEntryWorker2 = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(3);
      assert.strictEqual(repLogEntryWorker2.user, WORKER);
      assert.strictEqual(
        repLogEntryWorker2.amount,
        WORKER_PAYOUT.muln(3)
          .divn(2)
          .toString()
      );
    });

    it("should set the correct reputation change amount in log when worker has failed to rate", async () => {
      const taskId = await setupFundedTask({ colonyNetwork, colony: metaColony, evaluator: accounts[1] });
      await metaColony.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER });
      await metaColony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_1_SECRET, { from: accounts[1] });
      await forwardTime(SECONDS_PER_DAY * 6, this);
      await metaColony.revealTaskWorkRating(taskId, WORKER_ROLE, 2, RATING_1_SALT, { from: accounts[1] });
      await forwardTime(SECONDS_PER_DAY * 6, this);
      await metaColony.finalizeTask(taskId);

      const repLogEntryManager = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(0);
      assert.strictEqual(repLogEntryManager.user, MANAGER);
      assert.strictEqual(
        repLogEntryManager.amount,
        MANAGER_PAYOUT.muln(3)
          .divn(2)
          .toString()
      );

      const repLogEntryEvaluator = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(1);
      assert.strictEqual(repLogEntryEvaluator.user, accounts[1]);
      assert.strictEqual(repLogEntryEvaluator.amount, EVALUATOR_PAYOUT.toString());

      const repLogEntryWorker1 = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(2);
      assert.strictEqual(repLogEntryWorker1.user, WORKER);
      assert.strictEqual(repLogEntryWorker1.amount, WORKER_PAYOUT.divn(2).toString());

      const repLogEntryWorker2 = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(3);
      assert.strictEqual(repLogEntryWorker2.user, WORKER);
      assert.strictEqual(repLogEntryWorker2.amount, WORKER_PAYOUT.divn(2).toString());
    });

    it("should not be able to be appended by an account that is not a colony", async () => {
      const lengthBefore = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      await checkErrorRevert(colonyNetwork.appendReputationUpdateLog(OTHER, 1, 2), "colony-caller-must-be-colony");
      const lengthAfter = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      assert.equal(lengthBefore.toNumber(), lengthAfter.toNumber());
    });

    it("should populate nPreviousUpdates correctly", async () => {
      const initialRepLogLength = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      let repLogEntry = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(initialRepLogLength);
      const nPrevious = new BN(repLogEntry.nPreviousUpdates);
      repLogEntry = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(initialRepLogLength + 1);
      assert.equal(repLogEntry.nPreviousUpdates, nPrevious.addn(2).toNumber());

      await setupFinalizedTask({ colonyNetwork, colony: metaColony });
      repLogEntry = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(initialRepLogLength + 2);
      assert.equal(repLogEntry.nPreviousUpdates, nPrevious.addn(4).toNumber());
    });

    it("should calculate nUpdates correctly when making a log", async () => {
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(4);
      await metaColony.addGlobalSkill(5);
      await metaColony.addGlobalSkill(6);

      await setupFinalizedTask({ colonyNetwork, colony: metaColony, skillId: 5 });
      let repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(3);
      assert.strictEqual(repLogEntryWorker.amount, WORKER_PAYOUT.toString());
      assert.strictEqual(repLogEntryWorker.nUpdates, "6");

      await setupFinalizedTask({ colonyNetwork, colony: metaColony, skillId: 6 });
      repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(7);
      assert.strictEqual(repLogEntryWorker.amount, WORKER_PAYOUT.toString());
      assert.strictEqual(repLogEntryWorker.nUpdates, "8"); // Negative reputation change means children change as well.
    });

    it("should correctly make large positive reputation updates", async () => {
      await fundColonyWithTokens(metaColony, clnyToken, INT256_MAX);
      await setupFinalizedTask({ colonyNetwork, colony: metaColony, workerPayout: MAX_PAYOUT, workerRating: 3 });

      const repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(3);
      assert.strictEqual(repLogEntryWorker.user, WORKER);
      assert.strictEqual(repLogEntryWorker.amount, INT128_MAX.toString()); // eslint-disable-line prettier/prettier
    });

    it("should correctly make large negative reputation updates", async () => {
      const workerRating = 1;
      const workerRatingSecret = web3Utils.soliditySha3(RATING_2_SALT, workerRating);

      await fundColonyWithTokens(metaColony, clnyToken, INT256_MAX);
      const taskId = await setupFundedTask({ colonyNetwork, colony: metaColony, workerPayout: MAX_PAYOUT });
      await metaColony.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER });
      await metaColony.submitTaskWorkRating(taskId, WORKER_ROLE, workerRatingSecret, { from: EVALUATOR });

      await forwardTime(SECONDS_PER_DAY * 5 + 1, this);
      await metaColony.revealTaskWorkRating(taskId, WORKER_ROLE, workerRating, RATING_2_SALT, { from: EVALUATOR });

      // Run out the submissions window to get the no-rate penalty for the worker.
      await forwardTime(SECONDS_PER_DAY * 5, this);
      await metaColony.finalizeTask(taskId);

      const roleWorker = await metaColony.getTaskRole(taskId, WORKER_ROLE);
      assert.isTrue(roleWorker.rateFail);
      assert.equal(roleWorker.rating, workerRating);

      const repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(3);
      assert.strictEqual(repLogEntryWorker.user, WORKER);
      assert.strictEqual(repLogEntryWorker.amount, INT128_MIN.toString()); // eslint-disable-line prettier/prettier
    });
  });
});
