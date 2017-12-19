/* globals artifacts */
import { MANAGER,
  EVALUATOR, 
  WORKER,
  OTHER,
  RATING_1, 
  RATING_2, 
  RATING_1_SALT, 
  RATING_2_SALT, 
  MANAGER_ROLE, 
  EVALUATOR_ROLE, 
  WORKER_ROLE, 
  SPECIFICATION_HASH, 
  DELIVERABLE_HASH,
  SECONDS_PER_DAY } from '../helpers/constants';
import testHelper from '../helpers/test-helper';
import testDataGenerator from '../helpers/test-data-generator';

const IColony = artifacts.require('IColony');
const IColonyNetwork = artifacts.require('IColonyNetwork');
const EtherRouter = artifacts.require('EtherRouter');
const Token = artifacts.require('Token');

contract('Colony Task Work Rating', function (accounts) {
  let COLONY_KEY;
  let _RATING_SECRET_1_;
  let _RATING_SECRET_2_;
  let colony;
  let colonyNetwork;
  let token;

  before(async function () {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async function () {
    COLONY_KEY = testHelper.getRandomString(7);
    await colonyNetwork.createColony(COLONY_KEY);
    let address = await colonyNetwork.getColony.call(COLONY_KEY);
    colony = await IColony.at(address);
    _RATING_SECRET_1_ = await colony.generateSecret.call(RATING_1_SALT, RATING_1);
    _RATING_SECRET_2_ = await colony.generateSecret.call(RATING_2_SALT, RATING_2);
    token = await Token.new();
  });

  describe('when rating task work', () => {
    it('should allow rating, before the due date but after the work has been submitted', async function () {
      var dueDate = testHelper.currentBlockTime() + SECONDS_PER_DAY*7;
      await testDataGenerator.setupAssignedTask(colony, EVALUATOR, WORKER, dueDate);
      await colony.submitTaskDeliverable(1, DELIVERABLE_HASH, { from: WORKER });

      await colony.submitTaskWorkRating(1, WORKER_ROLE, _RATING_SECRET_1_, { from: EVALUATOR });
      let currentTime1 = testHelper.currentBlockTime();
      let rating1 = await colony.getTaskWorkRatings.call(1);
      assert.equal(rating1[0], 1);
      assert.closeTo(rating1[1].toNumber(), currentTime1, 2);
      const ratingSecret1 = await colony.getTaskWorkRatingSecret.call(1, WORKER_ROLE);
      assert.equal(ratingSecret1, _RATING_SECRET_1_);

      await colony.submitTaskWorkRating(1, 0, _RATING_SECRET_2_, { from: WORKER });
      let currentTime2 = testHelper.currentBlockTime();
      let rating2 = await colony.getTaskWorkRatings.call(1);
      assert.equal(rating2[0].toNumber(), 2);
      assert.closeTo(rating2[1].toNumber(), currentTime2, 2);
      const ratingSecret2 = await colony.getTaskWorkRatingSecret.call(1, MANAGER_ROLE);
      assert.equal(ratingSecret2, _RATING_SECRET_2_);
    });

    it('should allow rating, after the due date has passed, when no work has been submitted', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await testDataGenerator.setupAssignedTask(colony, EVALUATOR, WORKER, dueDate);

      await colony.submitTaskWorkRating(1, WORKER_ROLE, _RATING_SECRET_1_, { from: EVALUATOR });
      await colony.submitTaskWorkRating(1, MANAGER_ROLE, _RATING_SECRET_2_, { from: WORKER });

      const ratingSecret1 = await colony.getTaskWorkRatingSecret.call(1, WORKER_ROLE);
      assert.equal(ratingSecret1, _RATING_SECRET_1_);
      const ratingSecret2 = await colony.getTaskWorkRatingSecret.call(1, MANAGER_ROLE);
      assert.equal(ratingSecret2, _RATING_SECRET_2_);
    });

    it('should fail if I try to rate before task\'s due date has passed and work has not been submitted', async function () {
      var dueDate = testHelper.currentBlockTime() + SECONDS_PER_DAY*7;
      await testDataGenerator.setupAssignedTask(colony, EVALUATOR, WORKER, dueDate);  
  
      await testHelper.checkErrorRevert(colony.submitTaskWorkRating(1, WORKER_ROLE, _RATING_SECRET_1_, { from:EVALUATOR }));
      const ratingSecrets = await colony.getTaskWorkRatings.call(1);
      assert.equal(ratingSecrets[0].toNumber(), 0);  
    });

    it('should fail if I try to rate work on behalf of a worker', async function () {
      var dueDate = testHelper.currentBlockTime() -1;
      await testDataGenerator.setupAssignedTask(colony, EVALUATOR, WORKER, dueDate); 

      await testHelper.checkErrorRevert(colony.submitTaskWorkRating(1, MANAGER_ROLE, _RATING_SECRET_1_, { from: OTHER }));
      const ratingSecrets = await colony.getTaskWorkRatings.call(1);
      assert.equal(ratingSecrets[0], 0);
    });

    it('should fail if I try to rate work for a role that\'s not setup to be rated', async function () {
      var dueDate = testHelper.currentBlockTime();
      await testDataGenerator.setupAssignedTask(colony, EVALUATOR, WORKER, dueDate - 1); 

      await testHelper.checkErrorRevert(colony.submitTaskWorkRating(1, EVALUATOR_ROLE, _RATING_SECRET_1_, { from: EVALUATOR }));
      const ratingSecrets = await colony.getTaskWorkRatings.call(1);
      assert.equal(ratingSecrets[0].toNumber(), 0);  
    });

    it('should fail, if I try to rate work twice', async function () {
      var dueDate = testHelper.currentBlockTime();
      await testDataGenerator.setupAssignedTask(colony, EVALUATOR, WORKER, dueDate - 1);
      await colony.submitTaskWorkRating(1, WORKER_ROLE, _RATING_SECRET_1_, { from: EVALUATOR });

      await testHelper.checkErrorRevert(colony.submitTaskWorkRating(1, WORKER_ROLE, _RATING_SECRET_2_, { from: EVALUATOR }));
      const ratingSecrets = await colony.getTaskWorkRatings.call(1);
      assert.equal(ratingSecrets[0], 1);
      const ratingSecret = await colony.getTaskWorkRatingSecret.call(1, WORKER_ROLE);
      assert.equal(ratingSecret, _RATING_SECRET_1_);  
    });

    it('should fail if I try to rate a task too late', async function () {
      var dueDate = testHelper.currentBlockTime();
      await testDataGenerator.setupAssignedTask(colony, EVALUATOR, WORKER, dueDate);  
      
      await testHelper.forwardTime(SECONDS_PER_DAY*5+1, this);
      await testHelper.checkErrorRevert(colony.submitTaskWorkRating(1, WORKER_ROLE, _RATING_SECRET_1_, { from:EVALUATOR }));
      const ratingSecrets = await colony.getTaskWorkRatings.call(1);
      assert.equal(ratingSecrets[0].toNumber(), 0);  
    });

    it('should fail if I try to submit work for a task using an invalid id', async function () {
      var dueDate = testHelper.currentBlockTime() -1;
      await testDataGenerator.setupAssignedTask(colony, EVALUATOR, WORKER, dueDate); 

      await testHelper.checkErrorRevert(colony.submitTaskWorkRating(10, WORKER_ROLE, _RATING_SECRET_1_, { from: EVALUATOR }));
      const ratingSecrets = await colony.getTaskWorkRatings.call(1);
      assert.equal(ratingSecrets[0], 0);  
    });
  });

  describe('when revealing a task work rating', () => {
    it('should allow revealing a rating by evaluator and worker', async function () {
      await testDataGenerator.fundColonyWithTokens(colony, token, 20);
      var dueDate = testHelper.currentBlockTime() - 1;
      const taskId = await testDataGenerator.setupRatedTask(colony, EVALUATOR, WORKER, dueDate, token, 10, 10, RATING_1, RATING_1_SALT, RATING_2, RATING_2_SALT);
      
      let roleManager = await colony.getTaskRole.call(taskId, MANAGER_ROLE);
      assert.isTrue(roleManager[1]);
      assert.equal(roleManager[2].toNumber(), RATING_1);

      let roleWorker = await colony.getTaskRole.call(taskId, WORKER_ROLE);
      assert.isTrue(roleWorker[1]);
      assert.equal(roleWorker[2].toNumber(), RATING_2);
    });

    it('should allow revealing a rating from the evaluator after the 5 days wait for rating commits expires', async function () {
      var dueDate = testHelper.currentBlockTime() + SECONDS_PER_DAY*8;
      await testDataGenerator.setupAssignedTask(colony, EVALUATOR, WORKER, dueDate);
      await colony.submitTaskDeliverable(1, DELIVERABLE_HASH, { from: WORKER });
      await colony.submitTaskWorkRating(1, WORKER_ROLE, _RATING_SECRET_1_, { from: EVALUATOR });

      await testHelper.forwardTime(SECONDS_PER_DAY*5+1, this);
      await colony.revealTaskWorkRating(1, WORKER_ROLE, RATING_1, RATING_1_SALT, { from: EVALUATOR });
      let roleWorker = await colony.getTaskRole.call(1, WORKER_ROLE);
      assert.isTrue(roleWorker[1]);
      assert.equal(roleWorker[2].toNumber(), RATING_1);
    });

    it('should fail if I try to reveal rating with an incorrect secret', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await testDataGenerator.setupAssignedTask(colony, EVALUATOR, WORKER, dueDate);

      await colony.submitTaskWorkRating(1, WORKER_ROLE, _RATING_SECRET_1_, { from: EVALUATOR });
      await colony.submitTaskWorkRating(1, MANAGER_ROLE, _RATING_SECRET_2_, { from: WORKER });
      await testHelper.checkErrorRevert(colony.revealTaskWorkRating(1, MANAGER_ROLE, RATING_2, RATING_1_SALT, { from: WORKER }));
      let roleManager = await colony.getTaskRole.call(1, MANAGER_ROLE);
      assert.isFalse(roleManager[1]);
    });

    it('should fail if there are two rating secrets and I try to reveal the one from the evluator late', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await testDataGenerator.setupAssignedTask(colony, EVALUATOR, WORKER, dueDate);

      await colony.submitTaskWorkRating(1, WORKER_ROLE, _RATING_SECRET_1_, { from: EVALUATOR });
      await colony.submitTaskWorkRating(1, MANAGER_ROLE, _RATING_SECRET_2_, { from: WORKER });

      await testHelper.forwardTime(SECONDS_PER_DAY*5+2, this);
      await testHelper.checkErrorRevert(colony.revealTaskWorkRating(1, WORKER_ROLE, RATING_1, RATING_1_SALT, { from: EVALUATOR }));
      let roleWorker = await colony.getTaskRole.call(1, WORKER_ROLE);
      assert.isFalse(roleWorker[1]);
    });

    it('should fail if there are two rating secrets and I try to reveal the one from the worker late', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await testDataGenerator.setupAssignedTask(colony, EVALUATOR, WORKER, dueDate);

      await colony.submitTaskWorkRating(1, WORKER_ROLE, _RATING_SECRET_1_, { from: EVALUATOR });
      await colony.submitTaskWorkRating(1, MANAGER_ROLE, _RATING_SECRET_2_, { from: WORKER });

      await testHelper.forwardTime(SECONDS_PER_DAY*5+2, this);
      await testHelper.checkErrorRevert(colony.revealTaskWorkRating(1, MANAGER_ROLE, RATING_2, RATING_2_SALT, { from: WORKER }));
      let roleManager = await colony.getTaskRole.call(1, MANAGER_ROLE);
      assert.isFalse(roleManager[1]);
    });

    it('should fail if there is one rating secret from the evaluator and I try to reveal it before the 5 days wait for rating commits expires', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await testDataGenerator.setupAssignedTask(colony, EVALUATOR, WORKER, dueDate);

      await colony.submitTaskWorkRating(1, WORKER_ROLE, _RATING_SECRET_1_, { from: EVALUATOR });

      await testHelper.forwardTime(SECONDS_PER_DAY*4, this);
      await testHelper.checkErrorRevert(colony.revealTaskWorkRating(1, WORKER_ROLE, RATING_1, RATING_1_SALT, { from: EVALUATOR }));
      let roleWorker = await colony.getTaskRole.call(1, WORKER_ROLE);
      assert.isFalse(roleWorker[1]);
    });

    it('should fail if there is one rating secret from the evaluator and I try to reveal it after 5 days wait for rating reveal expires', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await testDataGenerator.setupAssignedTask(colony, EVALUATOR, WORKER, dueDate);

      await colony.submitTaskWorkRating(1, WORKER_ROLE, _RATING_SECRET_1_, { from: EVALUATOR });

      await testHelper.forwardTime(SECONDS_PER_DAY*10, this);
      await testHelper.checkErrorRevert(colony.revealTaskWorkRating(1, WORKER_ROLE, RATING_1, RATING_1_SALT, { from: EVALUATOR }));
      let roleWorker = await colony.getTaskRole.call(1, WORKER_ROLE);
      assert.isFalse(roleWorker[1]);
    });
  });

  describe('when assigning work ratings after the user not commiting or revealing on time', () => {
    it('should assign rating 5 to manager and penalise worker by 0.5, when they haven\'t submitted rating on time', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await testDataGenerator.setupAssignedTask(colony, EVALUATOR, WORKER, dueDate);
      await colony.submitTaskWorkRating(1, WORKER_ROLE, _RATING_SECRET_1_, { from: EVALUATOR });
      await testHelper.forwardTime(SECONDS_PER_DAY*5, this);
      await colony.revealTaskWorkRating(1, WORKER_ROLE, RATING_1, RATING_1_SALT, { from: EVALUATOR });
      await testHelper.forwardTime(SECONDS_PER_DAY*5, this);

      await colony.assignWorkRating(1);
      
      let roleWorker = await colony.getTaskRole.call(1, WORKER_ROLE);
      assert.isTrue(roleWorker[1]);
      assert.equal(roleWorker[2].toNumber(), RATING_1 - 5);

      let roleManager = await colony.getTaskRole.call(1, MANAGER_ROLE);
      assert.isTrue(roleManager[1]);
      assert.equal(roleManager[2].toNumber(), 50);
    });

    it('should assign rating 5 to manager and 0 to worker, when they haven\'t submitted rating on time and their own rating is below 5', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await testDataGenerator.setupAssignedTask(colony, EVALUATOR, WORKER, dueDate);

      _RATING_SECRET_1_ = await colony.generateSecret.call(RATING_1_SALT, 4);
      await colony.submitTaskWorkRating(1, WORKER_ROLE, _RATING_SECRET_1_, { from: EVALUATOR });
      await testHelper.forwardTime(SECONDS_PER_DAY*5, this);
      await colony.revealTaskWorkRating(1, WORKER_ROLE, 4, RATING_1_SALT, { from: EVALUATOR });
      await testHelper.forwardTime(SECONDS_PER_DAY*5, this);

      await colony.assignWorkRating(1);
      
      let roleWorker = await colony.getTaskRole.call(1, WORKER_ROLE);
      assert.isTrue(roleWorker[1]);
      assert.equal(roleWorker[2].toNumber(), 0);

      let roleManager = await colony.getTaskRole.call(1, MANAGER_ROLE);
      assert.isTrue(roleManager[1]);
      assert.equal(roleManager[2].toNumber(), 50);
    });

    it('should assign rating 5 to worker, when evaluator hasn\'t submitted rating on time', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await testDataGenerator.setupAssignedTask(colony, EVALUATOR, WORKER, dueDate);
      await colony.submitTaskWorkRating(1, MANAGER_ROLE, _RATING_SECRET_1_, { from: WORKER });
      await testHelper.forwardTime(SECONDS_PER_DAY*5, this);
      await colony.revealTaskWorkRating(1, MANAGER_ROLE, RATING_1, RATING_1_SALT, { from: WORKER });
      await testHelper.forwardTime(SECONDS_PER_DAY*5, this);

      await colony.assignWorkRating(1);
      
      let roleWorker = await colony.getTaskRole.call(1, WORKER_ROLE);
      assert.isTrue(roleWorker[1]);
      assert.equal(roleWorker[2].toNumber(), 50);

      let roleManager = await colony.getTaskRole.call(1, MANAGER_ROLE);
      assert.isTrue(roleManager[1]);
      assert.equal(roleManager[2].toNumber(), RATING_1);
    });

    it('should assign rating 5 to manager and 4.5 to worker when no one has submitted any ratings', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      const taskId = await testDataGenerator.setupAssignedTask(colony, EVALUATOR, WORKER, dueDate);
      await testHelper.forwardTime(SECONDS_PER_DAY*10, this);
      await colony.assignWorkRating(taskId);
      
      let roleWorker = await colony.getTaskRole.call(taskId, WORKER_ROLE);
      assert.isTrue(roleWorker[1]);
      assert.equal(roleWorker[2].toNumber(), 45);

      let roleManager = await colony.getTaskRole.call(taskId, MANAGER_ROLE);
      assert.isTrue(roleManager[1]);
      assert.equal(roleManager[2].toNumber(), 50);
    });

    it('should revert if I try to assign ratings before the reveal period is over', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await testDataGenerator.setupAssignedTask(colony, EVALUATOR, WORKER, dueDate);
      await testHelper.forwardTime(SECONDS_PER_DAY*6, this);
      testHelper.checkErrorRevert(colony.assignWorkRating(1));
      let roleWorker = await colony.getTaskRole.call(1, WORKER_ROLE);
      assert.isFalse(roleWorker[1]);
    });
  });
});