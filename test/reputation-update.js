/* globals artifacts */
import BigNumber from 'bignumber.js';
import { RATING_1, 
  RATING_2, 
  RATING_1_SALT, 
  RATING_2_SALT, 
  MANAGER_ROLE, 
  EVALUATOR_ROLE, 
  WORKER_ROLE, 
  SPECIFICATION_HASH,
  SECONDS_PER_DAY } from '../helpers/constants';
import testHelper from '../helpers/test-helper';
import testDataGenerator from '../helpers/test-data-generator';

const upgradableContracts = require('../helpers/upgradable-contracts');
const EtherRouter = artifacts.require('EtherRouter');
const IColony = artifacts.require('IColony');
const IColonyNetwork = artifacts.require('IColonyNetwork');
const Resolver = artifacts.require('Resolver');
const Colony = artifacts.require('Colony');
const ColonyFunding = artifacts.require('ColonyFunding');
const ColonyTask = artifacts.require('ColonyTask');
const ColonyTransactionReviewer = artifacts.require('ColonyTransactionReviewer');
const Token = artifacts.require('Token');

contract('Colony Reputation Updates', function (accounts) {
  let COLONY_KEY;
  const MANAGER = accounts[0];
  const EVALUATOR = accounts[1];
  const WORKER = accounts[2];
  const OTHER_ACCOUNT = accounts[3];
  
  let colonyNetwork;
  let commonColony;
  let resolverColonyNetworkDeployed;;
  let dueDate;
  let colonyToken;

  before(async function () {
    resolverColonyNetworkDeployed = await Resolver.deployed();
  });

  beforeEach(async function () {
    let colony = await Colony.new();
    let colonyFunding = await ColonyFunding.new();
    let colonyTask = await ColonyTask.new();
    let colonyTransactionReviewer = await ColonyTransactionReviewer.new();
    let resolver = await Resolver.new();
    const etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolverColonyNetworkDeployed.address);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    await upgradableContracts.setupColonyVersionResolver(colony, colonyTask, colonyFunding, colonyTransactionReviewer, resolver, colonyNetwork);
    await colonyNetwork.createColony("Common Colony");
    let commonColonyAddress = await colonyNetwork.getColony.call("Common Colony");
    commonColony = await IColony.at(commonColonyAddress);
    dueDate = testHelper.currentBlockTime() - 1;
    let tokenAddress = await commonColony.getToken.call();
    colonyToken = await Token.at(tokenAddress);
    await testDataGenerator.fundColonyWithTokens(commonColony, colonyToken, 50);
  });

  describe('when added', () => {
    it('should be readable', async function () {
      const taskId = await testDataGenerator.setupRatedTask(commonColony, EVALUATOR, WORKER, dueDate, colonyToken, 30, 20, RATING_1, RATING_1_SALT, RATING_2, RATING_2_SALT);
      await commonColony.acceptTask(taskId);
      let x = await colonyNetwork.getReputationUpdateLogEntry.call(0);
      assert.equal(x[0], WORKER);
      assert.equal(x[1].toNumber(), 20000000000000000000);
      assert.equal(x[2].toNumber(), 0);
      assert.equal(x[3], commonColony.address);
      assert.equal(x[4].toNumber(), 2);
      assert.equal(x[5].toNumber(), 0);
    });

    var ratings = [
      {worker: 0,  reputationChangeFactor: new BigNumber('-1666666666666666666')},
      {worker: 10, reputationChangeFactor: new BigNumber('-1000000000000000000')},
      {worker: 20, reputationChangeFactor: new BigNumber('-333333333333333333')},
      {worker: 30, reputationChangeFactor: new BigNumber('333333333333333333')},
      {worker: 40, reputationChangeFactor: new BigNumber('1000000000000000000')},
      {worker: 50, reputationChangeFactor: new BigNumber('1666666666666666666')}
    ];

    ratings.forEach(async function(rating) {
      it('should set the correct reputation change amount in log for rating ' + rating.worker, async function () {
        const taskId = await testDataGenerator.setupRatedTask(commonColony, EVALUATOR, WORKER, dueDate, colonyToken, 40, 10, RATING_1, RATING_1_SALT, rating.worker, RATING_2_SALT);
        await commonColony.acceptTask(taskId);

        let reputationLogIndex = await colonyNetwork.getReputationUpdateLogLength.call();
        reputationLogIndex = reputationLogIndex.toNumber() - 1;
        let x = await colonyNetwork.getReputationUpdateLogEntry.call(reputationLogIndex);
        assert.equal(x[0], WORKER);
        assert.isTrue(x[1].equals(rating.reputationChangeFactor.mul(10)));
        assert.equal(x[2].toNumber(), 0);
        assert.equal(x[3], commonColony.address);
        assert.equal(x[4].toNumber(), 2);
        //TODO: assert.equal(x[5].toNumber(), 0);
      });
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
      const taskId1 = await testDataGenerator.setupRatedTask(commonColony, EVALUATOR, WORKER, dueDate, colonyToken, 5, 10, RATING_1, RATING_1_SALT, RATING_2, RATING_2_SALT);
      await commonColony.acceptTask(taskId1);
      let x = await colonyNetwork.getReputationUpdateLogEntry.call(initialRepLogLength);
      let nPrevious = x[5].toNumber();
      
      const taskId2 = await testDataGenerator.setupRatedTask(commonColony, EVALUATOR, WORKER, dueDate, colonyToken, 5, 30, RATING_1, RATING_1_SALT, RATING_2, RATING_2_SALT);
      await commonColony.acceptTask(taskId2);
      x = await colonyNetwork.getReputationUpdateLogEntry.call(initialRepLogLength + 1);
      assert.equal(x[5].toNumber(), 2+nPrevious);
    });

    it('should calculate nUpdates correctly when making a log', async function (){
      await commonColony.addSkill(0);
      await commonColony.addSkill(1);
      await commonColony.addSkill(2);
      await commonColony.addSkill(3);
      const taskId1 = await testDataGenerator.setupRatedTask(commonColony, EVALUATOR, WORKER, dueDate, colonyToken, 5, 10, RATING_1, RATING_1_SALT, RATING_2, RATING_2_SALT);
      await commonColony.setTaskSkill(taskId1, 2);
      await commonColony.acceptTask(taskId1);
      let x = await colonyNetwork.getReputationUpdateLogEntry.call(0);
      const result = new BigNumber('1000000000000000000');
      assert.isTrue(x[1].equals(result.mul(10)));
      assert.equal(x[4].toNumber(), 6);

      const taskId2 = await testDataGenerator.setupRatedTask(commonColony, EVALUATOR, WORKER, dueDate, colonyToken, 5, 30, RATING_1, RATING_1_SALT, RATING_2, RATING_2_SALT);
      await commonColony.setTaskSkill(taskId2, 3);
      await commonColony.acceptTask(taskId2);
      x = await colonyNetwork.getReputationUpdateLogEntry.call(1);
      assert.isTrue(x[1].equals(result.mul(30)));
      assert.equal(x[4].toNumber(), 8); // Negative reputation change means children change as well.
    });
  });
});
