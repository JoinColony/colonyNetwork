/* globals artifacts */
import BigNumber from 'bignumber.js';

import { WORKER,
  OTHER,
  MANAGER_RATING, 
  WORKER_RATING, 
  RATING_1_SALT, 
  RATING_2_SALT, 
  MANAGER_ROLE, 
  EVALUATOR_ROLE, 
  WORKER_ROLE, 
  MANAGER_PAYOUT,
  WORKER_PAYOUT,
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

contract('Colony Reputation Updates', () => {
  let colonyNetwork;
  let commonColony;
  let resolverColonyNetworkDeployed;
  let colonyToken;

  before(async () => {
    resolverColonyNetworkDeployed = await Resolver.deployed();
  });

  beforeEach(async () => {
    const colony = await Colony.new();
    const colonyFunding = await ColonyFunding.new();
    const colonyTask = await ColonyTask.new();
    const colonyTransactionReviewer = await ColonyTransactionReviewer.new();
    const resolver = await Resolver.new();
    const etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolverColonyNetworkDeployed.address);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    await upgradableContracts.setupColonyVersionResolver(colony, colonyTask, colonyFunding, colonyTransactionReviewer, resolver, colonyNetwork);
    await colonyNetwork.createColony('Common Colony');
    const commonColonyAddress = await colonyNetwork.getColony.call('Common Colony');
    commonColony = await IColony.at(commonColonyAddress);
    const tokenAddress = await commonColony.getToken.call();
    colonyToken = await Token.at(tokenAddress);
  });

  describe('when added', () => {
    beforeEach(async function () {
      await testDataGenerator.fundColonyWithTokens(commonColony, colonyToken, 600 * 1e18);
    });

    it('should be readable', async function () {
      const taskId = await testDataGenerator.setupRatedTask(commonColony);
      await commonColony.finalizeTask(taskId);
      const x = await colonyNetwork.getReputationUpdateLogEntry.call(0);
      assert.equal(x[0], WORKER);
      assert.equal(x[1].toNumber(), 200000000000000000000);
      assert.equal(x[2].toNumber(), 0);
      assert.equal(x[3], commonColony.address);
      assert.equal(x[4].toNumber(), 2);
      assert.equal(x[5].toNumber(), 0);
    });

    const ratings = [
      { worker: 0, reputationChangeFactor: new BigNumber('-1666666666666666666') },
      { worker: 10, reputationChangeFactor: new BigNumber('-1000000000000000000') },
      { worker: 20, reputationChangeFactor: new BigNumber('-333333333333333333') },
      { worker: 30, reputationChangeFactor: new BigNumber('333333333333333333') },
      { worker: 40, reputationChangeFactor: new BigNumber('1000000000000000000') },
      { worker: 50, reputationChangeFactor: new BigNumber('1666666666666666666') },
    ];

    ratings.forEach(async (rating) => {
      it(`should set the correct reputation change amount in log for rating ${rating.worker}`, async () => {
        const taskId = await testDataGenerator.setupRatedTask(
          commonColony,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          rating.worker,
          RATING_2_SALT,
        );
        await commonColony.finalizeTask(taskId);

        let reputationLogIndex = await colonyNetwork.getReputationUpdateLogLength.call();
        reputationLogIndex = reputationLogIndex.toNumber() - 1;
        const x = await colonyNetwork.getReputationUpdateLogEntry.call(reputationLogIndex);
        assert.equal(x[0], WORKER);
        assert.equal(x[1].toNumber(), rating.reputationChangeFactor.mul(200).toNumber());
        assert.equal(x[2].toNumber(), 0);
        assert.equal(x[3], commonColony.address);
        assert.equal(x[4].toNumber(), 2);
        assert.equal(x[5].toNumber(), 0);
      });
    });

    it('should not be able to be appended by an account that is not a colony', async () => {
      const lengthBefore = await colonyNetwork.getReputationUpdateLogLength.call();
      await testHelper.checkErrorRevert(colonyNetwork.appendReputationUpdateLog(OTHER, 1, 2));
      const lengthAfter = await colonyNetwork.getReputationUpdateLogLength.call();
      assert.equal(lengthBefore.toNumber(), lengthAfter.toNumber());
    });

    it('should populate nPreviousUpdates correctly', async () => {
      let initialRepLogLength = await colonyNetwork.getReputationUpdateLogLength.call();
      initialRepLogLength = initialRepLogLength.toNumber();
      const taskId1 = await testDataGenerator.setupRatedTask(commonColony);
      await commonColony.finalizeTask(taskId1);
      let x = await colonyNetwork.getReputationUpdateLogEntry.call(initialRepLogLength);
      const nPrevious = x[5].toNumber();

      const taskId2 = await testDataGenerator.setupRatedTask(commonColony);
      await commonColony.finalizeTask(taskId2);
      x = await colonyNetwork.getReputationUpdateLogEntry.call(initialRepLogLength + 1);
      assert.equal(x[5].toNumber(), 2 + nPrevious);
    });

    it('should calculate nUpdates correctly when making a log', async () => {
      await commonColony.addSkill(0);
      await commonColony.addSkill(1);
      await commonColony.addSkill(2);
      await commonColony.addSkill(3);
      const taskId1 = await testDataGenerator.setupRatedTask(commonColony);
      await commonColony.setTaskSkill(taskId1, 2);
      await commonColony.finalizeTask(taskId1);

      let x = await colonyNetwork.getReputationUpdateLogEntry.call(0);
      const result = new BigNumber('1').mul(WORKER_PAYOUT);
      assert.equal(x[1].toNumber(), result.toNumber());
      assert.equal(x[4].toNumber(), 6);

      const taskId2 = await testDataGenerator.setupRatedTask(commonColony);
      await commonColony.setTaskSkill(taskId2, 3);
      await commonColony.finalizeTask(taskId2);
      x = await colonyNetwork.getReputationUpdateLogEntry.call(1);
      assert.equal(x[1].toNumber(), result.toNumber());
      assert.equal(x[4].toNumber(), 8); // Negative reputation change means children change as well.
    });

    it('should revert on reputation amount overflow', async function () {
      // Fund colony with maximum possible int number of tokens
      const maxIntNumber = new BigNumber(2).pow(255).sub(1);
      await testDataGenerator.fundColonyWithTokens(commonColony, colonyToken, maxIntNumber);
      let colonyTokenBalance = await colonyToken.balanceOf.call(commonColony.address);

      // Split the max tokens number as payouts between the manager and worker
      const managerPayout = 1;
      const workerPayout = colonyTokenBalance.sub(1);
      const taskId = await testDataGenerator.setupRatedTask(commonColony, colonyToken, undefined, undefined, undefined, managerPayout, workerPayout, undefined, undefined, 20);

      // Check the task pot is correctly funded with the max amount
      let taskPotBalance= await commonColony.getPotBalance.call(2, colonyToken.address);
      assert.isTrue(taskPotBalance.equals(colonyTokenBalance));

      testHelper.checkErrorRevert(commonColony.finalizeTask(taskId));
    });
  });
});
