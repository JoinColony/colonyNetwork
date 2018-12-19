/* globals artifacts */

import {
  MANAGER_RATING,
  WORKER_RATING,
  RATING_1_SALT,
  RATING_2_SALT,
  RATING_1_SECRET,
  RATING_2_SECRET,
  MANAGER_ROLE,
  EVALUATOR_ROLE,
  WORKER_ROLE,
  DELIVERABLE_HASH,
  INITIAL_FUNDING,
  SECONDS_PER_DAY
} from "../helpers/constants";
import { currentBlockTime, checkErrorRevert, forwardTime, expectEvent } from "../helpers/test-helper";
import { fundColonyWithTokens, setupAssignedTask, setupRatedTask, setupRandomColony } from "../helpers/test-data-generator";

const IColonyNetwork = artifacts.require("IColonyNetwork");
const EtherRouter = artifacts.require("EtherRouter");

contract("Colony Task Work Rating", accounts => {
  const MANAGER = accounts[0];
  const EVALUATOR = MANAGER;
  const WORKER = accounts[2];
  const OTHER = accounts[3];

  let colony;
  let colonyNetwork;
  let token;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
  });

  describe("when rating task work", () => {
    it("should allow rating, before the due date but after the work has been submitted", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 7;
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER });

      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });
      const currentTime1 = await currentBlockTime();
      const rating1 = await colony.getTaskWorkRatings(taskId);
      assert.equal(rating1[0], 1);
      assert.closeTo(rating1[1].toNumber(), currentTime1, 2);
      const ratingSecret1 = await colony.getTaskWorkRatingSecret(taskId, WORKER_ROLE);
      assert.equal(ratingSecret1, RATING_2_SECRET);

      await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER });
      const currentTime2 = await currentBlockTime();
      const rating2 = await colony.getTaskWorkRatings(taskId);
      assert.equal(rating2[0].toNumber(), 2);
      assert.closeTo(rating2[1].toNumber(), currentTime2, 2);
      const ratingSecret2 = await colony.getTaskWorkRatingSecret(taskId, MANAGER_ROLE);
      assert.equal(ratingSecret2, RATING_1_SECRET);
    });

    it("should allow combined submission and rating, before the due date", async () => {
      const currentTime = await currentBlockTime();
      const dueDate = currentTime + SECONDS_PER_DAY * 7;
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });

      await colony.submitTaskDeliverableAndRating(taskId, DELIVERABLE_HASH, RATING_1_SECRET, { from: WORKER });
      const ratings = await colony.getTaskWorkRatings(taskId);
      assert.equal(ratings[0].toNumber(), 1);
      assert.closeTo(ratings[1].toNumber(), currentTime, 2);
      const ratingSecret = await colony.getTaskWorkRatingSecret(taskId, MANAGER_ROLE);
      assert.equal(ratingSecret, RATING_1_SECRET);
    });

    it("should allow rating after the due date has passed when no work has been submitted and the manager has marked the task complete", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER });
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });

      const ratingSecret2 = await colony.getTaskWorkRatingSecret(taskId, MANAGER_ROLE);
      assert.equal(ratingSecret2, RATING_1_SECRET);
      const ratingSecret1 = await colony.getTaskWorkRatingSecret(taskId, WORKER_ROLE);
      assert.equal(ratingSecret1, RATING_2_SECRET);
    });

    it("should fail if I try to rate before task's due date has passed and work has not been submitted", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 7;
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await checkErrorRevert(colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR }), "colony-task-not-complete");
      const ratingSecrets = await colony.getTaskWorkRatings(taskId);
      assert.equal(ratingSecrets[0].toNumber(), 0);
    });

    it.skip("should not allow the manager to mark a task as complete if no due date is set", async () => {
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate: 0 });
      await checkErrorRevert(colony.completeTask(taskId), "colony-task-due-date-not-set");
    });

    it("should not allow the manager to mark a task as complete if before the due date and work has not been submitted", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 7;
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await checkErrorRevert(colony.completeTask(taskId), "colony-task-due-date-in-future");
    });

    it("should not allow the manager to (re-)mark a task as complete if work has already been submitted", async () => {
      const taskId = await setupAssignedTask({ colonyNetwork, colony });
      await colony.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER });
      await checkErrorRevert(colony.completeTask(taskId), "colony-task-complete");
    });

    it("should allow the manager to mark a task as complete if after the due date and no work has been submitted", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
    });

    it("should not allow ratings to be submitted after the due date if no work is submitted and task not marked complete", async () => {
      const taskId = await setupAssignedTask({ colonyNetwork, colony });
      await checkErrorRevert(colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER }), "colony-task-not-complete");
      await checkErrorRevert(colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR }), "colony-task-not-complete");
    });

    it("should fail if I try to rate work on behalf of a worker", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await checkErrorRevert(
        colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: OTHER }),
        "colony-user-cannot-rate-task-manager"
      );
      const ratingSecrets = await colony.getTaskWorkRatings(taskId);
      assert.equal(ratingSecrets[0], 0);
    });

    it("should fail if I try to rate work for a role that's not setup to be rated", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await checkErrorRevert(
        colony.submitTaskWorkRating(taskId, EVALUATOR_ROLE, RATING_2_SECRET, { from: EVALUATOR }),
        "colony-unsupported-role-to-rate"
      );
      const ratingSecrets = await colony.getTaskWorkRatings(taskId);
      assert.equal(ratingSecrets[0].toNumber(), 0);
    });

    it("should fail, if I try to rate work twice", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });

      await checkErrorRevert(
        colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_1_SECRET, { from: EVALUATOR }),
        "colony-task-rating-secret-already-exists"
      );
      const ratingSecrets = await colony.getTaskWorkRatings(taskId);
      assert.equal(ratingSecrets[0], 1);
      const ratingSecret = await colony.getTaskWorkRatingSecret(taskId, WORKER_ROLE);
      assert.equal(ratingSecret, RATING_2_SECRET);
    });

    it("should fail if I try to rate a task too late", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);

      await forwardTime(SECONDS_PER_DAY * 5 + 1, this);
      await checkErrorRevert(
        colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR }),
        "colony-task-rating-secret-submit-period-closed"
      );
      const ratingSecrets = await colony.getTaskWorkRatings(taskId);
      assert.equal(ratingSecrets[0].toNumber(), 0);
    });

    it("should fail if I try to rate task using an invalid id", async () => {
      const taskId = await setupAssignedTask({ colonyNetwork, colony });

      await checkErrorRevert(colony.submitTaskWorkRating(10, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR }), "colony-task-not-complete");
      const ratingSecrets = await colony.getTaskWorkRatings(taskId);
      assert.equal(ratingSecrets[0], 0);
    });

    it("should fail if I try to submit an empty rating", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);

      const EMPTY_RATING_SECRET = web3.utils.fromAscii("");
      await checkErrorRevert(
        colony.submitTaskWorkRating(taskId, WORKER_ROLE, EMPTY_RATING_SECRET, { from: EVALUATOR }),
        "colony-task-rating-secret-missing"
      );

      const ratingSecrets = await colony.getTaskWorkRatings(taskId);
      // No rating was accepted. Ratings count is 0
      assert.equal(ratingSecrets[0], 0);
    });
  });

  describe("when revealing a task work rating", () => {
    it("should allow revealing a rating by evaluator and worker", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });

      const roleManager = await colony.getTaskRole(taskId, MANAGER_ROLE);
      assert.equal(parseInt(roleManager.rating, 10), MANAGER_RATING);

      const roleWorker = await colony.getTaskRole(taskId, WORKER_ROLE);
      assert.isFalse(roleWorker.rateFail);
      assert.equal(parseInt(roleWorker.rating, 10), WORKER_RATING);

      const roleEvaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      assert.isFalse(roleEvaluator.rateFail);
    });

    it("should allow revealing a rating from the evaluator after the 5 days wait for rating commits expires", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 8;
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.submitTaskDeliverable(1, DELIVERABLE_HASH, { from: WORKER });
      await colony.submitTaskWorkRating(1, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });

      await forwardTime(SECONDS_PER_DAY * 5 + 1, this);
      await colony.revealTaskWorkRating(1, WORKER_ROLE, WORKER_RATING, RATING_2_SALT, { from: EVALUATOR });

      const roleWorker = await colony.getTaskRole(taskId, WORKER_ROLE);
      assert.equal(parseInt(roleWorker.rating, 10), WORKER_RATING);

      const roleEvaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      assert.isFalse(roleEvaluator.rateFail);
    });

    it("should fail if I try to reveal rating with an incorrect secret", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER });
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });
      await checkErrorRevert(
        colony.revealTaskWorkRating(taskId, MANAGER_ROLE, MANAGER_RATING, RATING_2_SALT, { from: WORKER }),
        "colony-task-rating-secret-mismatch"
      );

      const roleManager = await colony.getTaskRole(taskId, MANAGER_ROLE);
      assert.equal(parseInt(roleManager.rating, 10), 0);
    });

    it("should fail if there are two rating secrets and I try to reveal the one from the evaluator late", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER });
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });

      await forwardTime(SECONDS_PER_DAY * 5 + 2, this);
      await checkErrorRevert(
        colony.revealTaskWorkRating(taskId, WORKER_ROLE, WORKER_RATING, RATING_2_SALT, { from: EVALUATOR }),
        "colony-task-rating-secret-reveal-period-closed"
      );

      const roleWorker = await colony.getTaskRole(taskId, WORKER_ROLE);
      assert.equal(parseInt(roleWorker.rating, 10), 0);
    });

    it("should fail if there are two rating secrets and I try to reveal the one from the worker late", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER });
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });

      await forwardTime(SECONDS_PER_DAY * 5 + 2, this);
      await checkErrorRevert(
        colony.revealTaskWorkRating(taskId, MANAGER_ROLE, MANAGER_RATING, RATING_1_SALT, { from: WORKER }),
        "colony-task-rating-secret-reveal-period-closed"
      );

      const roleManager = await colony.getTaskRole(1, MANAGER_ROLE);
      assert.equal(parseInt(roleManager.rating, 10), 0);
    });

    it("should fail if evaluator tries to reveal rating before the 5 days wait for rating commits expires", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });
      await forwardTime(SECONDS_PER_DAY * 4, this);
      await checkErrorRevert(
        colony.revealTaskWorkRating(taskId, WORKER_ROLE, WORKER_RATING, RATING_2_SALT, { from: EVALUATOR }),
        "colony-task-rating-secret-reveal-period-not-open"
      );

      const roleWorker = await colony.getTaskRole(taskId, WORKER_ROLE);
      assert.equal(parseInt(roleWorker.rating, 10), 0);
    });

    it("should fail if evaluator tries to reveal rating after 5 days wait for rating reveal expires", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });

      await forwardTime(SECONDS_PER_DAY * 10 + 1, this);
      await checkErrorRevert(
        colony.revealTaskWorkRating(taskId, WORKER_ROLE, WORKER_RATING, RATING_2_SALT, { from: EVALUATOR }),
        "colony-task-rating-secret-reveal-period-closed"
      );

      const roleWorker = await colony.getTaskRole(taskId, WORKER_ROLE);
      assert.equal(parseInt(roleWorker.rating, 10), 0);
    });

    it("should log a TaskWorkRatingRevealed event", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 8;

      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.submitTaskDeliverable(1, DELIVERABLE_HASH, { from: WORKER });
      await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER });
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });

      await expectEvent(
        colony.revealTaskWorkRating(taskId, WORKER_ROLE, WORKER_RATING, RATING_2_SALT, { from: EVALUATOR }),
        "TaskWorkRatingRevealed"
      );
    });
  });

  describe("when assigning work ratings after the user not commiting or revealing on time", () => {
    it("should assign rating 3 to manager and penalise worker, when they haven't submitted rating on time", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });
      await forwardTime(SECONDS_PER_DAY * 5 + 1, this);
      await colony.revealTaskWorkRating(taskId, WORKER_ROLE, WORKER_RATING, RATING_2_SALT, { from: EVALUATOR });
      await forwardTime(SECONDS_PER_DAY * 5 + 1, this);
      await colony.finalizeTask(taskId);

      const roleWorker = await colony.getTaskRole(taskId, WORKER_ROLE);
      assert.isTrue(roleWorker.rateFail);
      assert.equal(parseInt(roleWorker.rating, 10), WORKER_RATING);

      const roleManager = await colony.getTaskRole(taskId, MANAGER_ROLE);
      assert.equal(parseInt(roleManager.rating, 10), 3);

      const roleEvaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      assert.isFalse(roleEvaluator.rateFail);
    });

    it("should assign rating 3 to worker and 1 to evaluator if evaluator hasn't submitted rating on time", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER });
      await forwardTime(SECONDS_PER_DAY * 5 + 1, this);
      await colony.revealTaskWorkRating(taskId, MANAGER_ROLE, MANAGER_RATING, RATING_1_SALT, { from: WORKER });
      await forwardTime(SECONDS_PER_DAY * 5 + 1, this);
      await colony.finalizeTask(taskId);

      const roleWorker = await colony.getTaskRole(taskId, WORKER_ROLE);
      assert.isFalse(roleWorker.rateFail);
      assert.equal(parseInt(roleWorker.rating, 10), 3);

      const roleManager = await colony.getTaskRole(taskId, MANAGER_ROLE);
      assert.isFalse(roleManager.rateFail);
      assert.equal(parseInt(roleManager.rating, 10), MANAGER_RATING);

      const roleEvaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      assert.isTrue(roleEvaluator.rateFail);
      assert.equal(parseInt(roleEvaluator.rating, 10), 1);
    });

    it("should assign rating 3 to manager and 3 to worker, with penalties, when no one has submitted any ratings", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await forwardTime(SECONDS_PER_DAY * 10 + 1, this);
      await colony.finalizeTask(taskId);

      const roleWorker = await colony.getTaskRole(taskId, WORKER_ROLE);
      assert.isTrue(roleWorker.rateFail);
      assert.equal(parseInt(roleWorker.rating, 10), 3);

      const roleManager = await colony.getTaskRole(taskId, MANAGER_ROLE);
      assert.isFalse(roleManager.rateFail);
      assert.equal(parseInt(roleManager.rating, 10), 3);

      const roleEvaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      assert.isTrue(roleEvaluator.rateFail);
      assert.equal(parseInt(roleEvaluator.rating, 10), 1);
    });

    it("should revert if I try to assign ratings before the reveal period is over", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await forwardTime(SECONDS_PER_DAY * 6, this);
      await checkErrorRevert(colony.finalizeTask(1), "colony-task-ratings-incomplete");
      const roleWorker = await colony.getTaskRole(1, WORKER_ROLE);
      assert.isFalse(roleWorker.rateFail);
    });
  });
});
