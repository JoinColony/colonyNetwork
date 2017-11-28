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
  const _RATING_SECRET_1_ = sha3(testHelper.getRandomString(5));
  const _RATING_SECRET_2_ = sha3(testHelper.getRandomString(5));
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
  });

  const setupTask = async function (dueDate) {
    await colony.makeTask(specificationHash);
    await colony.setTaskEvaluator(1, EVALUATOR);
    await colony.setTaskWorker(1, WORKER);    
    const txData = await colony.contract.setTaskDueDate.getData(1, dueDate);
    await colony.proposeTaskChange(txData, 0, 0);
    await colony.approveTaskChange(1, 2, { from: WORKER });
  };

  describe('when rating a task deliverable', () => {
    it('should allow rating, before the due date but after the work has been submitted', async function () {
      var dueDate = new Date();
      dueDate = (dueDate.getTime() + secondsPerDay*7);
      await setupTask(dueDate);
      await colony.setTaskDeliverable(1, deliverableHash, { from: WORKER });

      await colony.submitTaskWorkRating(1, 1, _RATING_SECRET_1_, { from: EVALUATOR });
      await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_2_, { from: WORKER });
      let rating1 = await colony.getTaskWorkRating.call(1, 1);
      assert.equal(rating1, _RATING_SECRET_1_);
      let rating2 = await colony.getTaskWorkRating.call(1, 2);
      assert.equal(rating2, _RATING_SECRET_2_);
    });

    it('should allow rating, after the due date has passed, when no work has been submitted', async function () {
      var dueDate = new Date();
      dueDate = (dueDate.getTime() - 1);
      await setupTask(dueDate);

      await colony.submitTaskWorkRating(1, 1, _RATING_SECRET_1_, { from: EVALUATOR });
      await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_2_, { from: WORKER });
      let rating1 = await colony.getTaskWorkRating.call(1, 1);
      assert.equal(rating1, _RATING_SECRET_1_);
      let rating2 = await colony.getTaskWorkRating.call(1, 2);
      assert.equal(rating2, _RATING_SECRET_2_);
    });

    it('should fail if I try to submit work for a task before its due date has passed and work has not been submitted', async function () {
      var dueDate = new Date();
      dueDate = (dueDate.getTime() + secondsPerDay*7);
      await setupTask(dueDate);  
  
      let tx;
      try {
        tx = await colony.submitTaskWorkRating(1, 1, _RATING_SECRET_1_, { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      let rating = await colony.getTaskWorkRating.call(1, 1);
      assert.notEqual(rating, _RATING_SECRET_1_);    
    });

    it('should fail if I try to rate work on behalf of a worker', async function () {
      var dueDate = new Date();
      dueDate = (dueDate.getTime() -1);
      await setupTask(dueDate); 

      let tx;
      try {
        tx = await colony.submitTaskWorkRating(1, 1, _RATING_SECRET_1_, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      let rating = await colony.getTaskWorkRating.call(1, 1);
      assert.notEqual(rating, _RATING_SECRET_1_);
    });

    it('should fail if I try to submit work for a task using an invalid id', async function () {
      var dueDate = new Date();
      dueDate = (dueDate.getTime() -1);
      await setupTask(dueDate); 

      let tx;
      try {
        tx = await colony.submitTaskWorkRating(1, 1, _RATING_SECRET_1_, { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });
  });
});