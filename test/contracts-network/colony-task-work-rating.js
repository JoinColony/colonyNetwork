/* globals artifacts */
import chai from "chai";
import bnChai from "bn-chai";
import { soliditySha3 } from "web3-utils";

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
  SECONDS_PER_DAY,
} from "../../helpers/constants";
import { currentBlockTime, checkErrorRevert, forwardTime, expectEvent } from "../../helpers/test-helper";
import { fundColonyWithTokens, setupAssignedTask, setupRatedTask, setupRandomColony } from "../../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const EtherRouter = artifacts.require("EtherRouter");

contract("Colony Task Work Rating", (accounts) => {
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
      const rating1 = await colony.getTaskWorkRatingSecretsInfo(taskId);
      expect(rating1.nSecrets).to.eq.BN(1);
      expect(rating1.lastSubmittedAt.toNumber()).to.be.closeTo(currentTime1, 2);
      const ratingSecret1 = await colony.getTaskWorkRatingSecret(taskId, WORKER_ROLE);
      expect(ratingSecret1).to.eq.BN(RATING_2_SECRET);

      await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER });
      const currentTime2 = await currentBlockTime();
      const rating2 = await colony.getTaskWorkRatingSecretsInfo(taskId);
      expect(rating2.nSecrets).to.eq.BN(2);
      expect(rating2.lastSubmittedAt.toNumber()).to.be.closeTo(currentTime2, 2);
      const ratingSecret2 = await colony.getTaskWorkRatingSecret(taskId, MANAGER_ROLE);
      expect(ratingSecret2).to.eq.BN(RATING_1_SECRET);
    });

    it("should allow combined submission and rating, before the due date", async () => {
      const currentTime = await currentBlockTime();
      const dueDate = currentTime + SECONDS_PER_DAY * 7;
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });

      await colony.submitTaskDeliverableAndRating(taskId, DELIVERABLE_HASH, RATING_1_SECRET, { from: WORKER });
      const currentTime2 = await currentBlockTime();
      const ratings = await colony.getTaskWorkRatingSecretsInfo(taskId);
      expect(ratings.nSecrets).to.eq.BN(1);
      expect(ratings.lastSubmittedAt.toNumber()).to.be.closeTo(currentTime2, 2);
      const ratingSecret = await colony.getTaskWorkRatingSecret(taskId, MANAGER_ROLE);
      expect(ratingSecret).to.eq.BN(RATING_1_SECRET);
    });

    it("should allow rating after the due date has passed when no work has been submitted and the manager has marked the task complete", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER });
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });

      const ratingSecret1 = await colony.getTaskWorkRatingSecret(taskId, MANAGER_ROLE);
      const ratingSecret2 = await colony.getTaskWorkRatingSecret(taskId, WORKER_ROLE);
      expect(ratingSecret1).to.eq.BN(RATING_1_SECRET);
      expect(ratingSecret2).to.eq.BN(RATING_2_SECRET);
    });

    it("should fail if I try to rate before task's due date has passed and work has not been submitted", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 7;
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await checkErrorRevert(colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR }), "colony-task-not-complete");
      const ratingSecrets = await colony.getTaskWorkRatingSecretsInfo(taskId);
      expect(ratingSecrets.nSecrets).to.be.zero;
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

    it("should fail if user rates worker on behalf of the evaluator", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await checkErrorRevert(
        colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: OTHER }),
        "colony-user-cannot-rate-task-worker"
      );
      const ratingSecrets = await colony.getTaskWorkRatingSecretsInfo(taskId);
      expect(ratingSecrets[1]).to.be.zero;
    });

    it("should fail if user rates manager on behalf of the worker", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await checkErrorRevert(
        colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: OTHER }),
        "colony-user-cannot-rate-task-manager"
      );
      const ratingSecrets = await colony.getTaskWorkRatingSecretsInfo(taskId);
      expect(ratingSecrets.nSecrets).to.be.zero;
    });

    it("should fail if I try to rate work for a role that's not setup to be rated", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await checkErrorRevert(
        colony.submitTaskWorkRating(taskId, EVALUATOR_ROLE, RATING_2_SECRET, { from: EVALUATOR }),
        "colony-unsupported-role-to-rate"
      );
      const ratingSecrets = await colony.getTaskWorkRatingSecretsInfo(taskId);
      expect(ratingSecrets.nSecrets).to.be.zero;
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
      const ratingSecrets = await colony.getTaskWorkRatingSecretsInfo(taskId);
      expect(ratingSecrets.nSecrets).to.eq.BN(1);
      const ratingSecret = await colony.getTaskWorkRatingSecret(taskId, WORKER_ROLE);
      expect(ratingSecret).to.eq.BN(RATING_2_SECRET);
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
      const ratingSecrets = await colony.getTaskWorkRatingSecretsInfo(taskId);
      expect(ratingSecrets.nSecrets).to.be.zero;
    });

    it("should fail if I try to rate task using an invalid id", async () => {
      const taskId = await setupAssignedTask({ colonyNetwork, colony });

      await checkErrorRevert(colony.submitTaskWorkRating(10, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR }), "colony-task-not-complete");
      const ratingSecrets = await colony.getTaskWorkRatingSecretsInfo(taskId);
      expect(ratingSecrets.nSecrets).to.be.zero;
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

      const ratingSecrets = await colony.getTaskWorkRatingSecretsInfo(taskId);
      // No rating was accepted. Ratings count is 0
      expect(ratingSecrets.nSecrets).to.be.zero;
    });
  });

  describe("when revealing a task work rating", () => {
    it("should allow revealing a rating by evaluator and worker", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });

      const roleManager = await colony.getTaskRole(taskId, MANAGER_ROLE);
      expect(roleManager.rating).to.eq.BN(MANAGER_RATING);

      const roleWorker = await colony.getTaskRole(taskId, WORKER_ROLE);
      expect(roleWorker.rateFail).to.be.false;
      expect(roleWorker.rating).to.eq.BN(WORKER_RATING);

      const roleEvaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      expect(roleEvaluator.rateFail).to.be.false;
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
      expect(roleWorker.rating).to.eq.BN(WORKER_RATING);

      const roleEvaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      expect(roleEvaluator.rateFail).to.be.false;
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
      expect(roleManager.rating).to.be.zero;
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
      expect(roleWorker.rating).to.be.zero;
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
      expect(roleManager.rating).to.be.zero;
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
      expect(roleWorker.rating).to.be.zero;
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
      expect(roleWorker.rating).to.be.zero;
    });

    it("should fail if the submitted rating was None", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      const badWorkerRating = 0;
      const ratingSecret = soliditySha3(RATING_2_SALT, badWorkerRating);
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, ratingSecret, { from: EVALUATOR });

      await forwardTime(SECONDS_PER_DAY * 5 + 1, this);
      await checkErrorRevert(
        colony.revealTaskWorkRating(taskId, WORKER_ROLE, badWorkerRating, RATING_2_SALT, { from: EVALUATOR }),
        "colony-task-rating-missing"
      );
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
        "TaskWorkRatingRevealed",
        [EVALUATOR, taskId, WORKER_ROLE, WORKER_RATING]
      );
    });
  });

  describe("when assigning work ratings after the user not commiting or revealing on time", () => {
    it("should assign rating 2 to manager and penalise worker, when they haven't submitted rating on time", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });
      await forwardTime(SECONDS_PER_DAY * 5 + 1, this);
      await colony.revealTaskWorkRating(taskId, WORKER_ROLE, WORKER_RATING, RATING_2_SALT, { from: EVALUATOR });
      await forwardTime(SECONDS_PER_DAY * 5 + 1, this);
      await colony.finalizeTask(taskId);

      const roleWorker = await colony.getTaskRole(taskId, WORKER_ROLE);
      expect(roleWorker.rateFail).to.be.true;
      expect(roleWorker.rating).to.eq.BN(WORKER_RATING);

      const roleManager = await colony.getTaskRole(taskId, MANAGER_ROLE);
      expect(roleManager.rating).to.eq.BN(2);

      const roleEvaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      expect(roleEvaluator.rateFail).to.be.false;
    });

    it("should assign rating 2 to worker and 1 to evaluator if evaluator hasn't submitted rating on time", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER });
      await forwardTime(SECONDS_PER_DAY * 5 + 1, this);
      await colony.revealTaskWorkRating(taskId, MANAGER_ROLE, MANAGER_RATING, RATING_1_SALT, { from: WORKER });
      await forwardTime(SECONDS_PER_DAY * 5 + 1, this);
      await colony.finalizeTask(taskId);

      const roleWorker = await colony.getTaskRole(taskId, WORKER_ROLE);
      expect(roleWorker.rateFail).to.be.false;
      expect(roleWorker.rating).to.eq.BN(2);

      const roleManager = await colony.getTaskRole(taskId, MANAGER_ROLE);
      expect(roleManager.rateFail).to.be.false;
      expect(roleManager.rating).to.eq.BN(MANAGER_RATING);

      const roleEvaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      expect(roleEvaluator.rateFail).to.be.true;
      expect(roleEvaluator.rating).to.eq.BN(1);
    });

    it("should assign rating 2 to manager and 2 to worker, with penalties, when no one has submitted any ratings", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await forwardTime(SECONDS_PER_DAY * 10 + 1, this);
      await colony.finalizeTask(taskId);

      const roleWorker = await colony.getTaskRole(taskId, WORKER_ROLE);
      expect(roleWorker.rateFail).to.be.true;
      expect(roleWorker.rating).to.eq.BN(2);

      const roleManager = await colony.getTaskRole(taskId, MANAGER_ROLE);
      expect(roleManager.rateFail).to.be.false;
      expect(roleManager.rating).to.eq.BN(2);

      const roleEvaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      expect(roleEvaluator.rateFail).to.be.true;
      expect(roleEvaluator.rating).to.eq.BN(1);
    });

    it("should revert if I try to assign ratings before the reveal period is over", async () => {
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.completeTask(taskId);
      await forwardTime(SECONDS_PER_DAY * 6, this);
      await checkErrorRevert(colony.finalizeTask(1), "colony-task-ratings-incomplete");
      const roleWorker = await colony.getTaskRole(1, WORKER_ROLE);
      expect(roleWorker.rateFail).to.be.false;
    });
  });
});
