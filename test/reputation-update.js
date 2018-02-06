/* globals artifacts */
import web3Utils from "web3-utils";
import { BN } from "bn.js";

import { MANAGER, WORKER, OTHER, MANAGER_PAYOUT, WORKER_PAYOUT } from "../helpers/constants";
import testHelper from "../helpers/test-helper";
import testDataGenerator from "../helpers/test-data-generator";

const upgradableContracts = require("../helpers/upgradable-contracts");

const EtherRouter = artifacts.require("EtherRouter");
const IColony = artifacts.require("IColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const Resolver = artifacts.require("Resolver");
const Colony = artifacts.require("Colony");
const ColonyFunding = artifacts.require("ColonyFunding");
const ColonyTask = artifacts.require("ColonyTask");
const ColonyTransactionReviewer = artifacts.require("ColonyTransactionReviewer");
const Token = artifacts.require("Token");

contract("Colony Reputation Updates", () => {
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
    await colonyNetwork.createColony("Common Colony");
    const commonColonyAddress = await colonyNetwork.getColony.call("Common Colony");
    commonColony = await IColony.at(commonColonyAddress);
    const tokenAddress = await commonColony.getToken.call();
    colonyToken = await Token.at(tokenAddress);
    const amount = new BN(10)
      .pow(new BN(18))
      .mul(new BN(600))
      .toString();
    await testDataGenerator.fundColonyWithTokens(commonColony, colonyToken, amount);
  });

  describe("when added", () => {
    it("should be readable", async () => {
      const taskId = await testDataGenerator.setupRatedTask(colonyNetwork, commonColony);
      await commonColony.finalizeTask(taskId);
      const repLogEntryManager = await colonyNetwork.getReputationUpdateLogEntry.call(0);
      assert.equal(repLogEntryManager[0], MANAGER);
      assert.equal(repLogEntryManager[1].toNumber(), 1000 * 1e18 / 50);
      assert.equal(repLogEntryManager[2].toNumber(), 1);
      assert.equal(repLogEntryManager[3], commonColony.address);
      assert.equal(repLogEntryManager[4].toNumber(), 2);
      assert.equal(repLogEntryManager[5].toNumber(), 0);

      const repLogEntryWorker = await colonyNetwork.getReputationUpdateLogEntry.call(1);
      assert.equal(repLogEntryWorker[0], WORKER);
      assert.equal(repLogEntryWorker[1].toNumber(), 200 * 1e18);
      assert.equal(repLogEntryWorker[2].toNumber(), 1);
      assert.equal(repLogEntryWorker[3], commonColony.address);
      assert.equal(repLogEntryWorker[4].toNumber(), 2);
      assert.equal(repLogEntryWorker[5].toNumber(), 2);
    });

    const ratings = [
      {
        manager: 0,
        reputationChangeManager: MANAGER_PAYOUT.muln(50)
          .neg()
          .divn(50),
        worker: 0,
        reputationChangeWorker: WORKER_PAYOUT.muln(50)
          .neg()
          .divn(30)
      },
      {
        manager: 10,
        reputationChangeManager: MANAGER_PAYOUT.muln(30)
          .neg()
          .divn(50),
        worker: 10,
        reputationChangeWorker: WORKER_PAYOUT.muln(30)
          .neg()
          .divn(30)
      },
      {
        manager: 20,
        reputationChangeManager: MANAGER_PAYOUT.muln(10)
          .neg()
          .divn(50),
        worker: 20,
        reputationChangeWorker: WORKER_PAYOUT.muln(10)
          .neg()
          .divn(30)
      },
      {
        manager: 25,
        reputationChangeManager: MANAGER_PAYOUT.muln(0).divn(50),
        worker: 25,
        reputationChangeWorker: WORKER_PAYOUT.muln(0).divn(30)
      },
      {
        manager: 30,
        reputationChangeManager: MANAGER_PAYOUT.muln(10).divn(50),
        worker: 30,
        reputationChangeWorker: WORKER_PAYOUT.muln(10).divn(30)
      },
      {
        manager: 40,
        reputationChangeManager: MANAGER_PAYOUT.muln(30).divn(50),
        worker: 40,
        reputationChangeWorker: WORKER_PAYOUT.muln(30).divn(30)
      },
      {
        manager: 50,
        reputationChangeManager: MANAGER_PAYOUT.muln(50).divn(50),
        worker: 50,
        reputationChangeWorker: WORKER_PAYOUT.muln(50).divn(30)
      }
    ];

    ratings.forEach(async rating => {
      it(`should set the correct reputation change amount in log for rating ${rating.worker}`, async () => {
        const taskId = await testDataGenerator.setupRatedTask(
          colonyNetwork,
          commonColony,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          rating.manager,
          undefined,
          rating.worker,
          undefined
        );
        await commonColony.finalizeTask(taskId);

        const repLogEntryManager = await colonyNetwork.getReputationUpdateLogEntry.call(0);
        assert.equal(repLogEntryManager[0], MANAGER);
        assert.equal(repLogEntryManager[1].toString(), rating.reputationChangeManager.toString());
        assert.equal(repLogEntryManager[2].toNumber(), 1);
        assert.equal(repLogEntryManager[3], commonColony.address);
        assert.equal(repLogEntryManager[4].toNumber(), 2);
        assert.equal(repLogEntryManager[5].toNumber(), 0);

        const repLogEntryWorker = await colonyNetwork.getReputationUpdateLogEntry.call(1);
        assert.equal(repLogEntryWorker[0], WORKER);
        assert.equal(repLogEntryWorker[1].toString(), rating.reputationChangeWorker.toString());
        assert.equal(repLogEntryWorker[2].toNumber(), 1);
        assert.equal(repLogEntryWorker[3], commonColony.address);
        assert.equal(repLogEntryWorker[4].toNumber(), 2);
        assert.equal(repLogEntryWorker[5].toNumber(), 2);
      });
    });

    it("should not be able to be appended by an account that is not a colony", async () => {
      const lengthBefore = await colonyNetwork.getReputationUpdateLogLength.call();
      await testHelper.checkErrorRevert(colonyNetwork.appendReputationUpdateLog(OTHER, 1, 2));
      const lengthAfter = await colonyNetwork.getReputationUpdateLogLength.call();
      assert.equal(lengthBefore.toNumber(), lengthAfter.toNumber());
    });

    it("should populate nPreviousUpdates correctly", async () => {
      let initialRepLogLength = await colonyNetwork.getReputationUpdateLogLength.call();
      initialRepLogLength = initialRepLogLength.toNumber();
      const taskId1 = await testDataGenerator.setupRatedTask(colonyNetwork, commonColony);
      await commonColony.finalizeTask(taskId1);
      let repLogEntry = await colonyNetwork.getReputationUpdateLogEntry.call(initialRepLogLength);
      const nPrevious = repLogEntry[5].toNumber();
      repLogEntry = await colonyNetwork.getReputationUpdateLogEntry.call(initialRepLogLength + 1);
      assert.equal(repLogEntry[5].toNumber(), 2 + nPrevious);

      const taskId2 = await testDataGenerator.setupRatedTask(colonyNetwork, commonColony);
      await commonColony.finalizeTask(taskId2);
      repLogEntry = await colonyNetwork.getReputationUpdateLogEntry.call(initialRepLogLength + 2);
      assert.equal(repLogEntry[5].toNumber(), 4 + nPrevious);
    });

    it("should calculate nUpdates correctly when making a log", async () => {
      await commonColony.addGlobalSkill(1);
      await commonColony.addGlobalSkill(3);
      await commonColony.addGlobalSkill(4);
      await commonColony.addGlobalSkill(5);
      const taskId1 = await testDataGenerator.setupRatedTask(colonyNetwork, commonColony, undefined, undefined, undefined, 4);
      await commonColony.finalizeTask(taskId1);

      let repLogEntryWorker = await colonyNetwork.getReputationUpdateLogEntry.call(1);
      const result = web3Utils.toBN("1").mul(WORKER_PAYOUT);
      assert.equal(repLogEntryWorker[1].toString(), result.toString());
      assert.equal(repLogEntryWorker[4].toNumber(), 6);

      const taskId2 = await testDataGenerator.setupRatedTask(colonyNetwork, commonColony, undefined, undefined, undefined, 5);
      await commonColony.finalizeTask(taskId2);
      repLogEntryWorker = await colonyNetwork.getReputationUpdateLogEntry.call(3);
      assert.equal(repLogEntryWorker[1].toString(), result.toString());
      assert.equal(repLogEntryWorker[4].toNumber(), 8); // Negative reputation change means children change as well.
    });

    it("should revert on reputation amount overflow", async () => {
      // Fund colony with maximum possible int number of tokens
      const maxUIntNumber = new BN(2)
        .pow(new BN(255))
        .sub(new BN(1))
        .toString(10);
      await testDataGenerator.fundColonyWithTokens(commonColony, colonyToken, maxUIntNumber);
      // Split the tokens as payouts between the manager and worker
      const managerPayout = new BN("1");
      const workerPayout = new BN(maxUIntNumber).sub(managerPayout);
      const taskId = await testDataGenerator.setupRatedTask(
        colonyNetwork,
        commonColony,
        colonyToken,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        managerPayout,
        workerPayout,
        undefined,
        undefined,
        20
      );

      // Check the task pot is correctly funded with the max amount
      const taskPotBalance = await commonColony.getPotBalance.call(2, colonyToken.address);
      assert.isTrue(taskPotBalance.equals(maxUIntNumber));

      await testHelper.checkErrorRevert(commonColony.finalizeTask(taskId));
    });
  });
});
