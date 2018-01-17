/* globals artifacts */
import BigNumber from 'bignumber.js';

import { MANAGER,
  WORKER,
  OTHER,
  WORKER_PAYOUT } from '../helpers/constants';
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
    beforeEach(async () => {
      await testDataGenerator.fundColonyWithTokens(commonColony, colonyToken, 600 * 1e18);
    });

    it('should be readable', async () => {
      const taskId = await testDataGenerator.setupRatedTask(commonColony);
      await commonColony.finalizeTask(taskId);
      const repLogEntryManager = await colonyNetwork.getReputationUpdateLogEntry.call(0);
      assert.equal(repLogEntryManager[0], MANAGER);
      assert.equal(repLogEntryManager[1].toNumber(), ((1000 * 1e18) / 50));
      assert.equal(repLogEntryManager[2].toNumber(), 0);
      assert.equal(repLogEntryManager[3], commonColony.address);
      assert.equal(repLogEntryManager[4].toNumber(), 2);
      assert.equal(repLogEntryManager[5].toNumber(), 0);

      const repLogEntryWorker = await colonyNetwork.getReputationUpdateLogEntry.call(1);
      assert.equal(repLogEntryWorker[0], WORKER);
      assert.equal(repLogEntryWorker[1].toNumber(), 200000000000000000000);
      assert.equal(repLogEntryWorker[2].toNumber(), 0);
      assert.equal(repLogEntryWorker[3], commonColony.address);
      assert.equal(repLogEntryWorker[4].toNumber(), 2);
      assert.equal(repLogEntryWorker[5].toNumber(), 2);
    });

    const ratings = [
      {
        manager: 0,
        reputationChangeFactorManager: new BigNumber('-1000000000000000000'),
        worker: 0,
        reputationChangeFactorWorker: new BigNumber('-1666666666666666666'),
      },
      {
        manager: 10,
        reputationChangeFactorManager: new BigNumber('-600000000000000000'),
        worker: 10,
        reputationChangeFactorWorker: new BigNumber('-1000000000000000000'),
      },
      {
        manager: 20,
        reputationChangeFactorManager: new BigNumber('-200000000000000000'),
        worker: 20,
        reputationChangeFactorWorker: new BigNumber('-333333333333333333'),
      },
      {
        manager: 25,
        reputationChangeFactorManager: new BigNumber('0'),
        worker: 25,
        reputationChangeFactorWorker: new BigNumber('0'),
      },
      {
        manager: 30,
        reputationChangeFactorManager: new BigNumber('200000000000000000'),
        worker: 30,
        reputationChangeFactorWorker: new BigNumber('333333333333333333'),
      },
      {
        manager: 40,
        reputationChangeFactorManager: new BigNumber('600000000000000000'),
        worker: 40,
        reputationChangeFactorWorker: new BigNumber('1000000000000000000'),
      },
      {
        manager: 50,
        reputationChangeFactorManager: new BigNumber('1000000000000000000'),
        worker: 50,
        reputationChangeFactorWorker: new BigNumber('1666666666666666666'),
      },
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
          rating.manager,
          undefined,
          rating.worker,
          undefined,
        );
        await commonColony.finalizeTask(taskId);

        const repLogEntryManager = await colonyNetwork.getReputationUpdateLogEntry.call(0);
        assert.equal(repLogEntryManager[0], MANAGER);
        assert.equal(repLogEntryManager[1].toNumber(), rating.reputationChangeFactorManager.mul(100).toNumber());
        assert.equal(repLogEntryManager[2].toNumber(), 0);
        assert.equal(repLogEntryManager[3], commonColony.address);
        assert.equal(repLogEntryManager[4].toNumber(), 2);
        assert.equal(repLogEntryManager[5].toNumber(), 0);

        const repLogEntryWorker = await colonyNetwork.getReputationUpdateLogEntry.call(1);
        assert.equal(repLogEntryWorker[0], WORKER);
        assert.equal(repLogEntryWorker[1].toNumber(), rating.reputationChangeFactorWorker.mul(200).toNumber());
        assert.equal(repLogEntryWorker[2].toNumber(), 0);
        assert.equal(repLogEntryWorker[3], commonColony.address);
        assert.equal(repLogEntryWorker[4].toNumber(), 2);
        assert.equal(repLogEntryWorker[5].toNumber(), 2);
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
      let repLogEntry = await colonyNetwork.getReputationUpdateLogEntry.call(initialRepLogLength);
      const nPrevious = repLogEntry[5].toNumber();
      repLogEntry = await colonyNetwork.getReputationUpdateLogEntry.call(initialRepLogLength + 1);
      assert.equal(repLogEntry[5].toNumber(), 2 + nPrevious);

      const taskId2 = await testDataGenerator.setupRatedTask(commonColony);
      await commonColony.finalizeTask(taskId2);
      repLogEntry = await colonyNetwork.getReputationUpdateLogEntry.call(initialRepLogLength + 2);
      assert.equal(repLogEntry[5].toNumber(), 4 + nPrevious);
    });

    it('should calculate nUpdates correctly when making a log', async () => {
      await commonColony.addSkill(0);
      await commonColony.addSkill(1);
      await commonColony.addSkill(2);
      await commonColony.addSkill(3);
      const taskId1 = await testDataGenerator.setupRatedTask(commonColony);
      await commonColony.setTaskSkill(taskId1, 2);
      await commonColony.finalizeTask(taskId1);

      let repLogEntryWorker = await colonyNetwork.getReputationUpdateLogEntry.call(1);
      const result = new BigNumber('1').mul(WORKER_PAYOUT);
      assert.equal(repLogEntryWorker[1].toNumber(), result.toNumber());
      assert.equal(repLogEntryWorker[4].toNumber(), 6);

      const taskId2 = await testDataGenerator.setupRatedTask(commonColony);
      await commonColony.setTaskSkill(taskId2, 3);
      await commonColony.finalizeTask(taskId2);
      repLogEntryWorker = await colonyNetwork.getReputationUpdateLogEntry.call(3);
      assert.equal(repLogEntryWorker[1].toNumber(), result.toNumber());
      assert.equal(repLogEntryWorker[4].toNumber(), 8); // Negative reputation change means children change as well.
    });

    it('should revert on reputation amount overflow', async () => {
      // Fund colony with maximum possible int number of tokens
      const maxIntNumber = new BigNumber(2).pow(255).sub(1);
      await testDataGenerator.fundColonyWithTokens(commonColony, colonyToken, maxIntNumber);
      const colonyTokenBalance = await colonyToken.balanceOf.call(commonColony.address);

      // Split the max tokens number as payouts between the manager and worker
      const managerPayout = 1;
      const workerPayout = colonyTokenBalance.sub(1);
      const taskId = await testDataGenerator.setupRatedTask(
        commonColony,
        colonyToken,
        undefined,
        undefined,
        undefined,
        managerPayout,
        workerPayout,
        undefined,
        undefined,
        20,
      );

      // Check the task pot is correctly funded with the max amount
      const taskPotBalance = await commonColony.getPotBalance.call(2, colonyToken.address);
      assert.isTrue(taskPotBalance.equals(colonyTokenBalance));

      await testHelper.checkErrorRevert(commonColony.finalizeTask(taskId));
    });
  });
});
