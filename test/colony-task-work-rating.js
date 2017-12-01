/* globals artifacts */
import sha3 from 'solidity-sha3';
import testHelper from '../helpers/test-helper';

const IColony = artifacts.require('IColony');
const ColonyNetwork = artifacts.require('ColonyNetwork');
const EtherRouter = artifacts.require('EtherRouter');

contract('Colony', function (accounts) {
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
  const _RATING_1_ = 3;
  const _RATING_1_SALT = sha3(testHelper.getRandomString(5));
  let _RATING_SECRET_1_;

  const _RATING_2_ = 4;
  const _RATING_2_SALT = '0xb77d57f4959eafa0339424b83fcfaf9c15407461';
  let _RATING_SECRET_2_;

  const secondsPerDay = 86400;

  let colony;
  let colonyNetwork;

  before(async function () {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await ColonyNetwork.at(etherRouter.address);
    await colonyNetwork.createColony("Common Colony");
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
      var dueDate = testHelper.secondsSinceEpoch() + secondsPerDay*7;
      await setupTask(dueDate);
      await colony.submitTaskDeliverable(1, deliverableHash, { from: WORKER });

      await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_1_, { from: EVALUATOR });
      let currentTime1 = testHelper.secondsSinceEpoch();
      let rating1 = await colony.getTaskWorkRatings.call(1);
      assert.equal(rating1[0], 1);
      assert.equal(rating1[1].toNumber(), currentTime1);
      const ratingSecret1 = await colony.getTaskWorkRatingSecret.call(1, 2);
      assert.equal(ratingSecret1, _RATING_SECRET_1_);

      await colony.submitTaskWorkRating(1, 0, _RATING_SECRET_2_, { from: WORKER });
      let currentTime2 = testHelper.secondsSinceEpoch();
      let rating2 = await colony.getTaskWorkRatings.call(1);
      assert.equal(rating2[0], 2);
      assert.equal(rating2[1].toNumber(), currentTime2);
      const ratingSecret2 = await colony.getTaskWorkRatingSecret.call(1, 0);
      assert.equal(ratingSecret2, _RATING_SECRET_2_);
    });

    it('should allow rating, after the due date has passed, when no work has been submitted', async function () {
      var dueDate = testHelper.secondsSinceEpoch() - 1;
      await setupTask(dueDate);

      await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_1_, { from: EVALUATOR });
      await colony.submitTaskWorkRating(1, 0, _RATING_SECRET_2_, { from: WORKER });
      const ratingSecret1 = await colony.getTaskWorkRatingSecret.call(1, 2);
      assert.equal(ratingSecret1, _RATING_SECRET_1_);

      const ratingSecret2 = await colony.getTaskWorkRatingSecret.call(1, 0);
      assert.equal(ratingSecret2, _RATING_SECRET_2_);
    });

    it('should fail if I try to rate before task\'s due date has passed and work has not been submitted', async function () {
      var dueDate = testHelper.secondsSinceEpoch() + secondsPerDay*7;
      await setupTask(dueDate);  
  
      let tx;
      try {
        tx = await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_1_, { from:EVALUATOR, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      const ratingSecrets = await colony.getTaskWorkRatings.call(1);
      assert.equal(ratingSecrets[0], 0);  

      let rating = await colony.getTaskWorkRatingSecret.call(1, 2);
      assert.notEqual(rating, _RATING_SECRET_1_);    
    });

    it('should fail, if I try to rate work twice', async function () {
      var dueDate = testHelper.secondsSinceEpoch();
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

    it('should fail if I try to rate work on behalf of a worker', async function () {
      var dueDate = testHelper.secondsSinceEpoch() -1;
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
      let rating = await colony.getTaskWorkRatingSecret.call(1, 0);
      assert.notEqual(rating, _RATING_SECRET_1_);
    });

    it('should fail if I try to submit work for a task using an invalid id', async function () {
      var dueDate = testHelper.secondsSinceEpoch() -1;
      await setupTask(dueDate); 

      let tx;
      try {
        tx = await colony.submitTaskWorkRating(10, 2, _RATING_SECRET_1_, { from: EVALUATOR, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });

    it('should fail if I try to rate work for a role that\'s not setup to be rated', async function () {
      var dueDate = testHelper.secondsSinceEpoch();
      await setupTask(dueDate - 1); 

      let tx;
      try {
        tx = await colony.submitTaskWorkRating(1, 1, _RATING_SECRET_1_, { from: EVALUATOR, gas: GAS_TO_SPEND });
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
      var dueDate = testHelper.secondsSinceEpoch() - 1;
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

    it('should fail if I try to reveal rating with an incorrect secret', async function () {
      var dueDate = testHelper.secondsSinceEpoch() - 1;
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
  });
});