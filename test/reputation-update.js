/* globals artifacts */
import sha3 from 'solidity-sha3';
import CONST from '../helpers/constants';
import testHelper from '../helpers/test-helper';
import testDataGenerator from '../helpers/test-data-generator';

const upgradableContracts = require('../helpers/upgradable-contracts');
const EtherRouter = artifacts.require('EtherRouter');
const IColony = artifacts.require('IColony');
const IColonyNetwork = artifacts.require('IColonyNetwork');

contract('Colony Reputation Updates', function (accounts) {
  let COLONY_KEY;
  const MANAGER = accounts[0];
  const EVALUATOR = accounts[1];
  const WORKER = accounts[2];
  const OTHER_ACCOUNT = accounts[3];
  const MANAGER_ROLE = CONST.MANAGER_ROLE;
  const EVALUATOR_ROLE = CONST.EVALUATOR_ROLE;
  const WORKER_ROLE = CONST.WORKER_ROLE;
  const specificationHash = CONST.SPECIFICATION_HASH;
  const _RATING_MANAGER_ = 30;
  const _RATING_1_SALT = sha3(testHelper.getRandomString(5));
  const _RATING_WORKER_ = 40;
  const _RATING_2_SALT = sha3(testHelper.getRandomString(5));
  const dueDate = testHelper.currentBlockTime() - 1;

  let colonyNetwork;
  let commonColony;
  let colony;

  before(async function () {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async function () {
    COLONY_KEY = testHelper.getRandomString(7);
    await colonyNetwork.createColony(COLONY_KEY);
    let address = await colonyNetwork.getColony.call(COLONY_KEY);
    colony = await IColony.at(address);
    let commonColonyAddress = await colonyNetwork.getColony.call("Common Colony");
    commonColony = await IColony.at(commonColonyAddress);
  });

  describe('when update added', () => {
    it('should be readable', async function () {
      const taskId = await testDataGenerator.setupRatedTask(commonColony, EVALUATOR, WORKER, dueDate, _RATING_MANAGER_, _RATING_1_SALT, _RATING_WORKER_, _RATING_2_SALT);
      await commonColony.acceptTask(taskId);
      let x = await colonyNetwork.getReputationUpdateLogEntry.call(0);
      assert.equal(x[0], WORKER);
      assert.equal(x[1].toNumber(), 100000000000000000000);
      assert.equal(x[2].toNumber(), 0);
      assert.equal(x[3], commonColony.address);
      assert.equal(x[4].toNumber(), 2);
      assert.equal(x[5].toNumber(), 0);
    });

    it('should not be able to be appended by an account that is not a colony', async function () {
      let lengthBefore = await colonyNetwork.getReputationUpdateLogLength.call();
      await testHelper.checkErrorRevert(colonyNetwork.appendReputationUpdateLog(OTHER_ACCOUNT, 1, 2));
      let lengthAfter = await colonyNetwork.getReputationUpdateLogLength.call();
      assert.equal(lengthBefore.toNumber(), lengthAfter.toNumber());
    });

    it('should populate nPreviousUpdates correctly', async function () {
      let initialRepLogLength = await colonyNetwork.getReputationUpdateLogLength.call();
      initialRepLogLength = initialRepLogLength.toNumber();
      
      const taskId1 = await testDataGenerator.setupRatedTask(commonColony, EVALUATOR, WORKER, dueDate, _RATING_MANAGER_, _RATING_1_SALT, _RATING_WORKER_, _RATING_2_SALT);
      await commonColony.acceptTask(taskId1);
      let x = await colonyNetwork.getReputationUpdateLogEntry.call(initialRepLogLength);
      let nPrevious = x[5].toNumber();
      
      const taskId2 = await testDataGenerator.setupRatedTask(commonColony, EVALUATOR, WORKER, dueDate, _RATING_MANAGER_, _RATING_1_SALT, _RATING_WORKER_, _RATING_2_SALT);
      await commonColony.acceptTask(taskId2);
      x = await colonyNetwork.getReputationUpdateLogEntry.call(initialRepLogLength + 1);
      assert.equal(x[5].toNumber(), 2+nPrevious);
    });

    it('should calculate nUpdates correctly when making a log', async function (){
      await commonColony.addSkill(0);
      await commonColony.addSkill(1);
      await commonColony.addSkill(2);
      await commonColony.addSkill(3);
      const taskId1 = await testDataGenerator.setupRatedTask(commonColony, EVALUATOR, WORKER, dueDate, _RATING_MANAGER_, _RATING_1_SALT, _RATING_WORKER_, _RATING_2_SALT);
      await commonColony.setTaskSkill(taskId1, 2);
      await commonColony.acceptTask(taskId1);
      let x = await colonyNetwork.getReputationUpdateLogEntry.call(0);
      assert.equal(x[1].toNumber(), 100000000000000000000);
      assert.equal(x[4].toNumber(), 2);

      const taskId2 = await testDataGenerator.setupRatedTask(commonColony, EVALUATOR, WORKER, dueDate, _RATING_MANAGER_, _RATING_1_SALT, _RATING_WORKER_, _RATING_2_SALT);
      await commonColony.setTaskSkill(taskId2, 3);
      await commonColony.acceptTask(taskId2);
      x = await colonyNetwork.getReputationUpdateLogEntry.call(1);
      assert.equal(x[1].toNumber(), 100000000000000000000);
      assert.equal(x[4].toNumber(), 2); // Negative reputation change means children change as well.
    });
  });
});
