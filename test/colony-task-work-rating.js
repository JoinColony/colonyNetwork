/* globals artifacts */
import sha3 from 'solidity-sha3';
import testHelper from '../helpers/test-helper';

const IColony = artifacts.require('IColony');
const ColonyNetwork = artifacts.require('ColonyNetwork');
const EtherRouter = artifacts.require('EtherRouter');

contract('Colony Task Work Rating', function (accounts) {
  let COLONY_KEY;
  const MANAGER = accounts[0];
  const EVALUATOR = accounts[1];
  const WORKER = accounts[2];
  const OTHER_ACCOUNT = accounts[3];
  // This value must be high enough to certify that the failure was not due to the amount of gas but due to a exception being thrown
  const GAS_TO_SPEND = 4700000;
  // The base58 decoded, bytes32 converted value of the task ipfsHash
  const specificationHash = '9bb76d8e6c89b524d34a454b3140df28';
  const deliverableHash = '9cc89e3e3d12a672d67a424b3640ce34';
  const _RATING_1_ = 30;
  const _RATING_1_SALT = sha3(testHelper.getRandomString(5));
  let _RATING_SECRET_1_;

  const _RATING_2_ = 40;
  const _RATING_2_SALT = '0xb77d57f4959eafa0339424b83fcfaf9c15407461';
  let _RATING_SECRET_2_;

  const secondsPerDay = 86400;

  let colony;
  let colonyNetwork;

  before(async function () {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await ColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async function () {
    COLONY_KEY = testHelper.getRandomString(7);
    await colonyNetwork.createColony(COLONY_KEY);
    let address = await colonyNetwork.getColony.call(COLONY_KEY);
    colony = await IColony.at(address);
    _RATING_SECRET_1_ = await colony.generateSecret.call(_RATING_1_SALT, _RATING_1_);
    _RATING_SECRET_2_ = await colony.generateSecret.call(_RATING_2_SALT, _RATING_2_);
  });

  const setupTask = async function (dueDate) {
    await colony.makeTask(specificationHash);
    await colony.setTaskRoleUser(1, 1, EVALUATOR);
    await colony.setTaskRoleUser(1, 2, WORKER);    
    const txData = await colony.contract.setTaskDueDate.getData(1, dueDate);
    await colony.proposeTaskChange(txData, 0, 0);
    await colony.approveTaskChange(1, 2, { from: WORKER });
  };

  describe('when rating task work', () => {
    it('should allow rating, before the due date but after the work has been submitted', async function () {
      var dueDate = testHelper.currentBlockTime() + secondsPerDay*7;
      await setupTask(dueDate);
      await colony.submitTaskDeliverable(1, deliverableHash, { from: WORKER });

      await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_1_, { from: EVALUATOR });
      let currentTime1 = testHelper.currentBlockTime();
      let rating1 = await colony.getTaskWorkRatings.call(1);
      assert.equal(rating1[0], 1);
      assert.closeTo(rating1[1].toNumber(), currentTime1, 2);
      const ratingSecret1 = await colony.getTaskWorkRatingSecret.call(1, 2);
      assert.equal(ratingSecret1, _RATING_SECRET_1_);

      await colony.submitTaskWorkRating(1, 0, _RATING_SECRET_2_, { from: WORKER });
      let currentTime2 = testHelper.currentBlockTime();
      let rating2 = await colony.getTaskWorkRatings.call(1);
      assert.equal(rating2[0].toNumber(), 2);
      assert.closeTo(rating2[1].toNumber(), currentTime2, 2);
      const ratingSecret2 = await colony.getTaskWorkRatingSecret.call(1, 0);
      assert.equal(ratingSecret2, _RATING_SECRET_2_);
    });

    it('should allow rating, after the due date has passed, when no work has been submitted', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await setupTask(dueDate);

      await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_1_, { from: EVALUATOR });
      await colony.submitTaskWorkRating(1, 0, _RATING_SECRET_2_, { from: WORKER });
      const ratingSecret1 = await colony.getTaskWorkRatingSecret.call(1, 2);
      assert.equal(ratingSecret1, _RATING_SECRET_1_);

      const ratingSecret2 = await colony.getTaskWorkRatingSecret.call(1, 0);
      assert.equal(ratingSecret2, _RATING_SECRET_2_);
    });

    it('should fail if I try to rate before task\'s due date has passed and work has not been submitted', async function () {
      var dueDate = testHelper.currentBlockTime() + secondsPerDay*7;
      await setupTask(dueDate);  
  
      let tx;
      try {
        tx = await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_1_, { from:EVALUATOR, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      const ratingSecrets = await colony.getTaskWorkRatings.call(1);
      assert.equal(ratingSecrets[0].toNumber(), 0);  
    });

    it('should fail if I try to rate work on behalf of a worker', async function () {
      var dueDate = testHelper.currentBlockTime() -1;
      await setupTask(dueDate); 

      let tx;
      try {
        tx = await colony.submitTaskWorkRating(1, 0, _RATING_SECRET_1_, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      const ratingSecrets = await colony.getTaskWorkRatings.call(1);
      assert.equal(ratingSecrets[0], 0);
    });

    it('should fail if I try to rate work for a role that\'s not setup to be rated', async function () {
      var dueDate = testHelper.currentBlockTime();
      await setupTask(dueDate - 1); 

      let tx;
      try {
        tx = await colony.submitTaskWorkRating(1, 1, _RATING_SECRET_1_, { from: EVALUATOR, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      const ratingSecrets = await colony.getTaskWorkRatings.call(1);
      assert.equal(ratingSecrets[0].toNumber(), 0);  
    });

    it('should fail, if I try to rate work twice', async function () {
      var dueDate = testHelper.currentBlockTime();
      await setupTask(dueDate - 1);

      await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_1_, { from: EVALUATOR });
      let tx;
      try {
        tx = await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_2_, { from: EVALUATOR, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      const ratingSecrets = await colony.getTaskWorkRatings.call(1);
      assert.equal(ratingSecrets[0], 1);
      const ratingSecret = await colony.getTaskWorkRatingSecret.call(1, 2);
      assert.equal(ratingSecret, _RATING_SECRET_1_);  
    });

    it('should fail if I try to rate a task too late', async function () {
      var dueDate = testHelper.currentBlockTime();
      await setupTask(dueDate);  
      
      await testHelper.forwardTime(secondsPerDay*5+1);
      let tx;
      try {
        tx = await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_1_, { from:EVALUATOR, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      const ratingSecrets = await colony.getTaskWorkRatings.call(1);
      assert.equal(ratingSecrets[0].toNumber(), 0);  
    });

    it('should fail if I try to submit work for a task using an invalid id', async function () {
      var dueDate = testHelper.currentBlockTime() -1;
      await setupTask(dueDate); 

      let tx;
      try {
        tx = await colony.submitTaskWorkRating(10, 2, _RATING_SECRET_1_, { from: EVALUATOR, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      const ratingSecrets = await colony.getTaskWorkRatings.call(1);
      assert.equal(ratingSecrets[0], 0);  
    });
  });

  describe('when revealing a task work rating', () => {
    it('should allow revealing a rating by evaluator and worker', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await setupTask(dueDate);
      await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_1_, { from: EVALUATOR });
      await colony.submitTaskWorkRating(1, 0, _RATING_SECRET_2_, { from: WORKER });
      
      await colony.revealTaskWorkRating(1, 2, _RATING_1_, _RATING_1_SALT, { from: EVALUATOR });
      await colony.revealTaskWorkRating(1, 0, _RATING_2_, _RATING_2_SALT, { from: WORKER });
      
      let roleManager = await colony.getTaskRole.call(1, 0);
      assert.isTrue(roleManager[1]);
      assert.equal(roleManager[2].toNumber(), _RATING_2_);

      let roleWorker = await colony.getTaskRole.call(1, 2);
      assert.isTrue(roleWorker[1]);
      assert.equal(roleWorker[2].toNumber(), _RATING_1_);
    });

    it('should allow revealing a rating from the evaluator after the 5 days wait for rating commits expires', async function () {
      var dueDate = testHelper.currentBlockTime() + secondsPerDay*8;
      await setupTask(dueDate);
      await colony.submitTaskDeliverable(1, deliverableHash, { from: WORKER });
      await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_1_, { from: EVALUATOR });

      await testHelper.forwardTime(secondsPerDay*5+1);
      await colony.revealTaskWorkRating(1, 2, _RATING_1_, _RATING_1_SALT, { from: EVALUATOR, gas: GAS_TO_SPEND });
      let roleWorker = await colony.getTaskRole.call(1, 2);
      assert.isTrue(roleWorker[1]);
      assert.equal(roleWorker[2].toNumber(), _RATING_1_);
    });

    it('should fail if I try to reveal rating with an incorrect secret', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await setupTask(dueDate);

      await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_1_, { from: EVALUATOR });
      await colony.submitTaskWorkRating(1, 0, _RATING_SECRET_2_, { from: WORKER });
      let tx;
      try {
        tx = await colony.revealTaskWorkRating(1, 0, _RATING_2_, _RATING_1_SALT, { from: WORKER, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      let roleManager = await colony.getTaskRole.call(1, 0);
      assert.isFalse(roleManager[1]);
    });

    it('should fail if there are two rating secrets and I try to reveal the one from the evluator late', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await setupTask(dueDate);

      await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_1_, { from: EVALUATOR });
      await colony.submitTaskWorkRating(1, 0, _RATING_SECRET_2_, { from: WORKER });

      await testHelper.forwardTime(secondsPerDay*5+2);
      let tx;
      try {
        tx = await colony.revealTaskWorkRating(1, 2, _RATING_1_, _RATING_1_SALT, { from: EVALUATOR, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      let roleWorker = await colony.getTaskRole.call(1, 2);
      assert.isFalse(roleWorker[1]);
    });

    it('should fail if there are two rating secrets and I try to reveal the one from the worker late', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await setupTask(dueDate);

      await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_1_, { from: EVALUATOR });
      await colony.submitTaskWorkRating(1, 0, _RATING_SECRET_2_, { from: WORKER });

      await testHelper.forwardTime(secondsPerDay*5+2);
      let tx;
      try {
        tx = await colony.revealTaskWorkRating(1, 0, _RATING_2_, _RATING_2_SALT, { from: WORKER, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      let roleManager = await colony.getTaskRole.call(1, 0);
      assert.isFalse(roleManager[1]);
    });

    it('should fail if there is one rating secret from the evaluator and I try to reveal it before the 5 days wait for rating commits expires', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await setupTask(dueDate);

      await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_1_, { from: EVALUATOR });

      await testHelper.forwardTime(secondsPerDay*4);
      let tx;
      try {
        tx = await colony.revealTaskWorkRating(1, 2, _RATING_1_, _RATING_1_SALT, { from: EVALUATOR, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      let roleWorker = await colony.getTaskRole.call(1, 2);
      assert.isFalse(roleWorker[1]);
    });

    it('should fail if there is one rating secret from the evaluator and I try to reveal it after 5 days wait for rating reveal expires', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await setupTask(dueDate);

      await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_1_, { from: EVALUATOR });

      await testHelper.forwardTime(secondsPerDay*10);
      let tx;
      try {
        tx = await colony.revealTaskWorkRating(1, 2, _RATING_1_, _RATING_1_SALT, { from: EVALUATOR, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      let roleWorker = await colony.getTaskRole.call(1, 2);
      assert.isFalse(roleWorker[1]);
    });
  });

  describe('when assigning work ratings after the user not commiting or revealing on time', () => {
    it('should assign the highest rating to manager and penalise worker, when they haven\'t submitted rating on time', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await setupTask(dueDate);
      await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_1_, { from: EVALUATOR });
      await testHelper.forwardTime(secondsPerDay*5);
      await colony.revealTaskWorkRating(1, 2, _RATING_1_, _RATING_1_SALT, { from: EVALUATOR, gas: GAS_TO_SPEND });
      await testHelper.forwardTime(secondsPerDay*5);

      await colony.assignWorkRating(1, 0);
      
      let roleWorker = await colony.getTaskRole.call(1, 2);
      assert.isTrue(roleWorker[1]);
      assert.equal(roleWorker[2].toNumber(), _RATING_1_ - 5);

      let roleManager = await colony.getTaskRole.call(1, 0);
      assert.isTrue(roleManager[1]);
      assert.equal(roleManager[2].toNumber(), 50);
    });

    it('should assign the highest rating to manager and lowest to worker, when they haven\'t submitted rating on time and their own rating is below 5', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await setupTask(dueDate);

      _RATING_SECRET_1_ = await colony.generateSecret.call(_RATING_1_SALT, 4);
      await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_1_, { from: EVALUATOR });
      await testHelper.forwardTime(secondsPerDay*5);
      await colony.revealTaskWorkRating(1, 2, 4, _RATING_1_SALT, { from: EVALUATOR, gas: GAS_TO_SPEND });
      await testHelper.forwardTime(secondsPerDay*5);

      await colony.assignWorkRating(1, 0);
      
      let roleWorker = await colony.getTaskRole.call(1, 2);
      assert.isTrue(roleWorker[1]);
      assert.equal(roleWorker[2].toNumber(),0);

      let roleManager = await colony.getTaskRole.call(1, 0);
      assert.isTrue(roleManager[1]);
      assert.equal(roleManager[2].toNumber(), 50);
    });

    it('should assign the highest rating to worker, when evaluator hasn\'t submitted rating on time', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await setupTask(dueDate);
      await colony.submitTaskWorkRating(1, 0, _RATING_SECRET_1_, { from: WORKER });
      await testHelper.forwardTime(secondsPerDay*5);
      await colony.revealTaskWorkRating(1, 0, _RATING_1_, _RATING_1_SALT, { from: WORKER, gas: GAS_TO_SPEND });
      await testHelper.forwardTime(secondsPerDay*5);

      await colony.assignWorkRating(1, 2);
      
      let roleWorker = await colony.getTaskRole.call(1, 2);
      assert.isTrue(roleWorker[1]);
      assert.equal(roleWorker[2].toNumber(), 50);

      let roleManager = await colony.getTaskRole.call(1, 0);
      assert.isTrue(roleManager[1]);
      assert.equal(roleManager[2].toNumber(), _RATING_1_);
    });


    it('should assign the highest rating to manager when no one has submitted any ratings', async function () {
      var dueDate = testHelper.currentBlockTime();
      await setupTask(dueDate);
      await testHelper.forwardTime(secondsPerDay*10);
      await colony.assignWorkRating(1, 0);
      
      let roleWorker = await colony.getTaskRole.call(1, 2);
      assert.isFalse(roleWorker[1]);

      let roleManager = await colony.getTaskRole.call(1, 0);
      assert.isTrue(roleManager[1]);
      assert.equal(roleManager[2].toNumber(), 50);
    });

    it('should throw if I try to assign a rating, when a rating has already been submitted', async function () {
      var dueDate = testHelper.currentBlockTime() + secondsPerDay*6;
      await setupTask(dueDate);
      await colony.submitTaskDeliverable(1, deliverableHash, { from: WORKER });
      await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_1_, { from: EVALUATOR });
      await colony.submitTaskWorkRating(1, 0, _RATING_SECRET_2_, { from: WORKER });
      
      await colony.revealTaskWorkRating(1, 2, _RATING_1_, _RATING_1_SALT, { from: EVALUATOR });
      await colony.revealTaskWorkRating(1, 0, _RATING_2_, _RATING_2_SALT, { from: WORKER });


      await testHelper.forwardTime(secondsPerDay*10);
      let tx;
      try {
        tx = await await colony.assignWorkRating(1, 0, { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);    
      
      let roleWorker = await colony.getTaskRole.call(1, 2);
      assert.isTrue(roleWorker[1]);
      assert.equal(roleWorker[2].toNumber(), _RATING_1_);

      let roleManager = await colony.getTaskRole.call(1, 0);
      assert.isTrue(roleManager[1]);
      assert.equal(roleManager[2].toNumber(), _RATING_2_);
    });

    it('should revert if I try to assign a rating to evaluator', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await setupTask(dueDate);

      await testHelper.forwardTime(secondsPerDay*10);
      let tx;
      try {
        tx = await await colony.assignWorkRating(1, 1, { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);    
      
      let roleEvaluator = await colony.getTaskRole.call(1, 1);
      assert.isFalse(roleEvaluator[1]);
    });

    it('should revert if I try to assign ratings before the reveal period is over', async function () {
      var dueDate = testHelper.currentBlockTime() - 1;
      await setupTask(dueDate);

      await testHelper.forwardTime(secondsPerDay*6);
      let tx;
      try {
        tx = await await colony.assignWorkRating(1, 2, { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);    
      
      let roleWorker = await colony.getTaskRole.call(1, 2);
      assert.isFalse(roleWorker[1]);
    });
  });
});