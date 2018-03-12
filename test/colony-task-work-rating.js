/* globals artifacts */
import web3Utils from "web3-utils";

import {
  EVALUATOR,
  WORKER,
  OTHER,
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
import { getRandomString, getTokenArgs, currentBlockTime, checkErrorRevert, forwardTime } from "../helpers/test-helper";
import { fundColonyWithTokens, setupAssignedTask, setupRatedTask } from "../helpers/test-data-generator";

const IColony = artifacts.require("IColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const EtherRouter = artifacts.require("EtherRouter");
const Token = artifacts.require("Token");

contract("Colony Task Work Rating", () => {
  let COLONY_KEY;
  let colony;
  let colonyNetwork;
  let token;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    COLONY_KEY = getRandomString(7);
    const tokenArgs = getTokenArgs();
    const colonyToken = await Token.new(...tokenArgs);
    await colonyNetwork.createColony(COLONY_KEY, colonyToken.address);
    const address = await colonyNetwork.getColony.call(COLONY_KEY);
    colony = await IColony.at(address);
    const otherTokenArgs = getTokenArgs();
    token = await Token.new(...otherTokenArgs);
  });

  describe("when rating task work", () => {
    it("should allow rating, before the due date but after the work has been submitted", async () => {
      const dueDate = currentBlockTime() + SECONDS_PER_DAY * 7;
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER });

      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });
      const currentTime1 = currentBlockTime();
      const rating1 = await colony.getTaskWorkRatings.call(taskId);
      assert.equal(rating1[0], 1);
      assert.closeTo(rating1[1].toNumber(), currentTime1, 2);
      const ratingSecret1 = await colony.getTaskWorkRatingSecret.call(taskId, WORKER_ROLE);
      assert.equal(ratingSecret1, RATING_2_SECRET);

      await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER });
      const currentTime2 = currentBlockTime();
      const rating2 = await colony.getTaskWorkRatings.call(taskId);
      assert.equal(rating2[0].toNumber(), 2);
      assert.closeTo(rating2[1].toNumber(), currentTime2, 2);
      const ratingSecret2 = await colony.getTaskWorkRatingSecret.call(taskId, MANAGER_ROLE);
      assert.equal(ratingSecret2, RATING_1_SECRET);
    });

    it("should allow rating, after the due date has passed, when no work has been submitted", async () => {
      const taskId = await setupAssignedTask({ colonyNetwork, colony });
      await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER });
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });

      const ratingSecret2 = await colony.getTaskWorkRatingSecret.call(taskId, MANAGER_ROLE);
      assert.equal(ratingSecret2, RATING_1_SECRET);
      const ratingSecret1 = await colony.getTaskWorkRatingSecret.call(taskId, WORKER_ROLE);
      assert.equal(ratingSecret1, RATING_2_SECRET);
    });

    it("should fail if I try to rate before task's due date has passed and work has not been submitted", async () => {
      const dueDate = currentBlockTime() + SECONDS_PER_DAY * 7;
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await checkErrorRevert(colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR }));
      const ratingSecrets = await colony.getTaskWorkRatings.call(taskId);
      assert.equal(ratingSecrets[0].toNumber(), 0);
    });

    it("should fail if I try to rate work on behalf of a worker", async () => {
      const taskId = await setupAssignedTask({ colonyNetwork, colony });
      await checkErrorRevert(colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: OTHER }));
      const ratingSecrets = await colony.getTaskWorkRatings.call(taskId);
      assert.equal(ratingSecrets[0], 0);
    });

    it("should fail if I try to rate work for a role that's not setup to be rated", async () => {
      const taskId = await setupAssignedTask({ colonyNetwork, colony });
      await checkErrorRevert(colony.submitTaskWorkRating(taskId, EVALUATOR_ROLE, RATING_2_SECRET, { from: EVALUATOR }));
      const ratingSecrets = await colony.getTaskWorkRatings.call(taskId);
      assert.equal(ratingSecrets[0].toNumber(), 0);
    });

    it("should fail, if I try to rate work twice", async () => {
      const taskId = await setupAssignedTask({ colonyNetwork, colony });
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });

      await checkErrorRevert(colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_1_SECRET, { from: EVALUATOR }));
      const ratingSecrets = await colony.getTaskWorkRatings.call(taskId);
      assert.equal(ratingSecrets[0], 1);
      const ratingSecret = await colony.getTaskWorkRatingSecret.call(taskId, WORKER_ROLE);
      assert.equal(ratingSecret, RATING_2_SECRET);
    });

    it("should fail if I try to rate a task too late", async () => {
      const taskId = await setupAssignedTask({ colonyNetwork, colony });

      await forwardTime(SECONDS_PER_DAY * 5 + 1, this);
      await checkErrorRevert(colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR }));
      const ratingSecrets = await colony.getTaskWorkRatings.call(taskId);
      assert.equal(ratingSecrets[0].toNumber(), 0);
    });

    it("should fail if I try to submit work for a task using an invalid id", async () => {
      const taskId = await setupAssignedTask({ colonyNetwork, colony });

      await checkErrorRevert(colony.submitTaskWorkRating(10, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR }));
      const ratingSecrets = await colony.getTaskWorkRatings.call(taskId);
      assert.equal(ratingSecrets[0], 0);
    });
  });

  describe("when revealing a task work rating", () => {
    it("should allow revealing a rating by evaluator and worker", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      const roleManager = await colony.getTaskRole.call(taskId, MANAGER_ROLE);
      assert.isTrue(roleManager[1]);
      assert.equal(roleManager[2].toNumber(), MANAGER_RATING);

      const roleWorker = await colony.getTaskRole.call(taskId, WORKER_ROLE);
      assert.isTrue(roleWorker[1]);
      assert.equal(roleWorker[2].toNumber(), WORKER_RATING);
    });

    it("should allow revealing a rating from the evaluator after the 5 days wait for rating commits expires", async () => {
      const dueDate = currentBlockTime() + SECONDS_PER_DAY * 8;
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.submitTaskDeliverable(1, DELIVERABLE_HASH, { from: WORKER });
      await colony.submitTaskWorkRating(1, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });

      await forwardTime(SECONDS_PER_DAY * 5 + 1, this);
      await colony.revealTaskWorkRating(1, WORKER_ROLE, WORKER_RATING, RATING_2_SALT, { from: EVALUATOR });
      const roleWorker = await colony.getTaskRole.call(taskId, WORKER_ROLE);
      assert.isTrue(roleWorker[1]);
      assert.equal(roleWorker[2].toNumber(), WORKER_RATING);
    });

    it("should fail if I try to reveal rating with an incorrect secret", async () => {
      const taskId = await setupAssignedTask({ colonyNetwork, colony });
      await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER });
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });
      await checkErrorRevert(colony.revealTaskWorkRating(taskId, MANAGER_ROLE, MANAGER_RATING, RATING_2_SALT, { from: WORKER }));
      const roleManager = await colony.getTaskRole.call(taskId, MANAGER_ROLE);
      assert.isFalse(roleManager[1]);
    });

    it("should fail if there are two rating secrets and I try to reveal the one from the evluator late", async () => {
      const taskId = await setupAssignedTask({ colonyNetwork, colony });
      await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER });
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });

      await forwardTime(SECONDS_PER_DAY * 5 + 2, this);
      await checkErrorRevert(colony.revealTaskWorkRating(taskId, WORKER_ROLE, WORKER_RATING, RATING_2_SALT, { from: EVALUATOR }));
      const roleWorker = await colony.getTaskRole.call(taskId, WORKER_ROLE);
      assert.isFalse(roleWorker[1]);
    });

    it("should fail if there are two rating secrets and I try to reveal the one from the worker late", async () => {
      const taskId = await setupAssignedTask({ colonyNetwork, colony });
      await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER });
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });

      await forwardTime(SECONDS_PER_DAY * 5 + 2, this);
      await checkErrorRevert(colony.revealTaskWorkRating(taskId, MANAGER_ROLE, MANAGER_RATING, RATING_1_SALT, { from: WORKER }));
      const roleManager = await colony.getTaskRole.call(1, MANAGER_ROLE);
      assert.isFalse(roleManager[1]);
    });

    it("should fail if evaluator tries to reveal rating before the 5 days wait for rating commits expires", async () => {
      const taskId = await setupAssignedTask({ colonyNetwork, colony });
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });
      await forwardTime(SECONDS_PER_DAY * 4, this);
      await checkErrorRevert(colony.revealTaskWorkRating(taskId, WORKER_ROLE, WORKER_RATING, RATING_2_SALT, { from: EVALUATOR }));
      const roleWorker = await colony.getTaskRole.call(taskId, WORKER_ROLE);
      assert.isFalse(roleWorker[1]);
    });

    it("should fail if evaluator tries to reveal rating after 5 days wait for rating reveal expires", async () => {
      const taskId = await setupAssignedTask({ colonyNetwork, colony });
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });

      await forwardTime(SECONDS_PER_DAY * 10, this);
      await checkErrorRevert(colony.revealTaskWorkRating(taskId, WORKER_ROLE, WORKER_RATING, RATING_2_SALT, { from: EVALUATOR }));
      const roleWorker = await colony.getTaskRole.call(taskId, WORKER_ROLE);
      assert.isFalse(roleWorker[1]);
    });
  });

  describe("when assigning work ratings after the user not commiting or revealing on time", () => {
    it("should assign rating 5 to manager and penalise worker by 0.5, when they haven't submitted rating on time", async () => {
      const taskId = await setupAssignedTask({ colonyNetwork, colony });
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });
      await forwardTime(SECONDS_PER_DAY * 5, this);
      await colony.revealTaskWorkRating(taskId, WORKER_ROLE, WORKER_RATING, RATING_2_SALT, { from: EVALUATOR });
      await forwardTime(SECONDS_PER_DAY * 5, this);

      await colony.assignWorkRating(taskId);

      const roleWorker = await colony.getTaskRole.call(taskId, WORKER_ROLE);
      assert.isTrue(roleWorker[1]);
      assert.equal(roleWorker[2].toNumber(), WORKER_RATING - 5);

      const roleManager = await colony.getTaskRole.call(1, MANAGER_ROLE);
      assert.isTrue(roleManager[1]);
      assert.equal(roleManager[2].toNumber(), 50);
    });

    it("should assign rating 5 to manager and 0 to worker, when ratings not submitted on time and their own rating is below 5", async () => {
      const taskId = await setupAssignedTask({ colonyNetwork, colony });

      const RATING_SECRET_2 = web3Utils.soliditySha3(RATING_2_SALT, 4);
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_SECRET_2, { from: EVALUATOR });
      await forwardTime(SECONDS_PER_DAY * 5 + 2, this);
      await colony.revealTaskWorkRating(taskId, WORKER_ROLE, 4, RATING_2_SALT, { from: EVALUATOR });
      await forwardTime(SECONDS_PER_DAY * 5 + 2, this);

      await colony.assignWorkRating(taskId);

      const roleWorker = await colony.getTaskRole.call(taskId, WORKER_ROLE);
      assert.isTrue(roleWorker[1]);
      assert.equal(roleWorker[2].toNumber(), 0);

      const roleManager = await colony.getTaskRole.call(taskId, MANAGER_ROLE);
      assert.isTrue(roleManager[1]);
      assert.equal(roleManager[2].toNumber(), 50);
    });

    it("should assign rating 5 to worker, when evaluator hasn't submitted rating on time", async () => {
      const taskId = await setupAssignedTask({ colonyNetwork, colony });
      await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER });
      await forwardTime(SECONDS_PER_DAY * 6, this);
      await colony.revealTaskWorkRating(taskId, MANAGER_ROLE, MANAGER_RATING, RATING_1_SALT, { from: WORKER });
      await forwardTime(SECONDS_PER_DAY * 6, this);

      await colony.assignWorkRating(taskId);

      const roleWorker = await colony.getTaskRole.call(taskId, WORKER_ROLE);
      assert.isTrue(roleWorker[1]);
      assert.equal(roleWorker[2].toNumber(), 50);

      const roleManager = await colony.getTaskRole.call(taskId, MANAGER_ROLE);
      assert.isTrue(roleManager[1]);
      assert.equal(roleManager[2].toNumber(), MANAGER_RATING);
    });

    it("should assign rating 5 to manager and 4.5 to worker when no one has submitted any ratings", async () => {
      const taskId = await setupAssignedTask({ colonyNetwork, colony });
      await forwardTime(SECONDS_PER_DAY * 10, this);
      await colony.assignWorkRating(taskId);

      const roleWorker = await colony.getTaskRole.call(taskId, WORKER_ROLE);
      assert.isTrue(roleWorker[1]);
      assert.equal(roleWorker[2].toNumber(), 45);

      const roleManager = await colony.getTaskRole.call(taskId, MANAGER_ROLE);
      assert.isTrue(roleManager[1]);
      assert.equal(roleManager[2].toNumber(), 50);
    });

    it("should revert if I try to assign ratings before the reveal period is over", async () => {
      await setupAssignedTask({ colonyNetwork, colony });
      await forwardTime(SECONDS_PER_DAY * 6, this);
      await checkErrorRevert(colony.assignWorkRating(1));
      const roleWorker = await colony.getTaskRole.call(1, WORKER_ROLE);
      assert.isFalse(roleWorker[1]);
    });
  });
});
