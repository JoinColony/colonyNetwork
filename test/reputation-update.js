/* globals artifacts */
import web3Utils from "web3-utils";
import { BN } from "bn.js";

import { MANAGER, WORKER, EVALUATOR, OTHER, MANAGER_PAYOUT, WORKER_PAYOUT } from "../helpers/constants";
import { getTokenArgs, checkErrorRevert } from "../helpers/test-helper";
import { fundColonyWithTokens, setupRatedTask } from "../helpers/test-data-generator";

import { setupColonyVersionResolver } from "../helpers/upgradable-contracts";

const EtherRouter = artifacts.require("EtherRouter");
const IColony = artifacts.require("IColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const Resolver = artifacts.require("Resolver");
const Colony = artifacts.require("Colony");
const ColonyFunding = artifacts.require("ColonyFunding");
const ColonyTask = artifacts.require("ColonyTask");
const Token = artifacts.require("Token");
const ReputationMiningCycle = artifacts.require("ReputationMiningCycle");

contract("Colony Reputation Updates", () => {
  let colonyNetwork;
  let metaColony;
  let resolverColonyNetworkDeployed;
  let colonyToken;
  let inactiveReputationMiningCycle;

  before(async () => {
    resolverColonyNetworkDeployed = await Resolver.deployed();
  });

  beforeEach(async () => {
    const colony = await Colony.new();
    const colonyFunding = await ColonyFunding.new();
    const colonyTask = await ColonyTask.new();
    const resolver = await Resolver.new();
    const etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolverColonyNetworkDeployed.address);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    await setupColonyVersionResolver(colony, colonyTask, colonyFunding, resolver, colonyNetwork);
    await colonyNetwork.startNextCycle();
    const tokenArgs = getTokenArgs();
    colonyToken = await Token.new(...tokenArgs);
    await colonyNetwork.createMetaColony(colonyToken.address);
    const metaColonyAddress = await colonyNetwork.getMetaColony.call();
    await colonyToken.setOwner(metaColonyAddress);
    metaColony = await IColony.at(metaColonyAddress);
    const amount = new BN(10)
      .pow(new BN(18))
      .mul(new BN(1000))
      .toString();
    await fundColonyWithTokens(metaColony, colonyToken, amount);
    const inactiveReputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
    inactiveReputationMiningCycle = ReputationMiningCycle.at(inactiveReputationMiningCycleAddress);
  });

  describe("when added", () => {
    it("should be readable", async () => {
      const taskId = await setupRatedTask({ colonyNetwork, colony: metaColony });
      await metaColony.finalizeTask(taskId);

      const repLogEntryManager = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(0);
      assert.equal(repLogEntryManager[0], MANAGER);
      assert.equal(repLogEntryManager[1].toNumber(), 1000 * 1e18 / 50);
      assert.equal(repLogEntryManager[2].toNumber(), 2);
      assert.equal(repLogEntryManager[3], metaColony.address);
      assert.equal(repLogEntryManager[4].toNumber(), 2);
      assert.equal(repLogEntryManager[5].toNumber(), 0);

      const repLogEntryEvaluator = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(1);
      assert.equal(repLogEntryEvaluator[0], EVALUATOR);
      assert.equal(repLogEntryEvaluator[1].toNumber(), 50 * 1e18);
      assert.equal(repLogEntryEvaluator[2].toNumber(), 2);
      assert.equal(repLogEntryEvaluator[3], metaColony.address);
      assert.equal(repLogEntryEvaluator[4].toNumber(), 2);
      assert.equal(repLogEntryEvaluator[5].toNumber(), 2);

      const repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(2);
      assert.equal(repLogEntryWorker[0], WORKER);
      assert.equal(repLogEntryWorker[1].toNumber(), 200 * 1e18);
      assert.equal(repLogEntryWorker[2].toNumber(), 2);
      assert.equal(repLogEntryWorker[3], metaColony.address);
      assert.equal(repLogEntryWorker[4].toNumber(), 2);
      assert.equal(repLogEntryWorker[5].toNumber(), 4);
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
        const taskId = await setupRatedTask({
          colonyNetwork,
          colony: metaColony,
          managerRating: rating.manager,
          workerRating: rating.worker
        });
        await metaColony.finalizeTask(taskId);

        const repLogEntryManager = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(0);
        assert.equal(repLogEntryManager[0], MANAGER);
        assert.equal(repLogEntryManager[1].toString(), rating.reputationChangeManager.toString());
        assert.equal(repLogEntryManager[2].toNumber(), 2);
        assert.equal(repLogEntryManager[3], metaColony.address);
        // If the rating is less than 25, then we also subtract reputation from all child skills. In the case
        // of the metaColony here, the task was created in the root domain of the metaColony, and a child of the
        // root skill is the mining skill. So the number we expect here differs depending on whether it's a reputation
        // gain or loss that we're logging.
        if (rating.manager >= 25) {
          assert.equal(repLogEntryManager[4].toNumber(), 2);
        } else {
          assert.equal(repLogEntryManager[4].toNumber(), 4);
        }
        assert.equal(repLogEntryManager[5].toNumber(), 0);

        const repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(2);
        assert.equal(repLogEntryWorker[0], WORKER);
        assert.equal(repLogEntryWorker[1].toString(), rating.reputationChangeWorker.toString());
        assert.equal(repLogEntryWorker[2].toNumber(), 2);
        assert.equal(repLogEntryWorker[3], metaColony.address);
        if (rating.worker >= 25) {
          assert.equal(repLogEntryWorker[4].toNumber(), 2);
        } else {
          assert.equal(repLogEntryWorker[4].toNumber(), 4);
        }
        // This last entry in the log entry is nPreviousUpdates, which depends on whether the manager was given a reputation
        // gain or loss.
        if (rating.manager >= 25) {
          assert.equal(repLogEntryWorker[5].toNumber(), 4);
        } else {
          assert.equal(repLogEntryWorker[5].toNumber(), 6);
        }
      });
    });

    it("should not be able to be appended by an account that is not a colony", async () => {
      const lengthBefore = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      await checkErrorRevert(colonyNetwork.appendReputationUpdateLog(OTHER, 1, 2));
      const lengthAfter = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      assert.equal(lengthBefore.toNumber(), lengthAfter.toNumber());
    });

    it("should populate nPreviousUpdates correctly", async () => {
      let initialRepLogLength = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      initialRepLogLength = initialRepLogLength.toNumber();
      const taskId1 = await setupRatedTask({ colonyNetwork, colony: metaColony });
      await metaColony.finalizeTask(taskId1);
      let repLogEntry = await inactiveReputationMiningCycle.getReputationUpdateLogEntry.call(initialRepLogLength);
      const nPrevious = repLogEntry[5].toNumber();
      repLogEntry = await inactiveReputationMiningCycle.getReputationUpdateLogEntry.call(initialRepLogLength + 1);
      assert.equal(repLogEntry[5].toNumber(), 2 + nPrevious);

      const taskId2 = await setupRatedTask({ colonyNetwork, colony: metaColony });
      await metaColony.finalizeTask(taskId2);
      repLogEntry = await inactiveReputationMiningCycle.getReputationUpdateLogEntry.call(initialRepLogLength + 2);
      assert.equal(repLogEntry[5].toNumber(), 4 + nPrevious);
    });

    it("should calculate nUpdates correctly when making a log", async () => {
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(4);
      await metaColony.addGlobalSkill(5);
      await metaColony.addGlobalSkill(6);
      const taskId1 = await setupRatedTask({
        colonyNetwork,
        colony: metaColony,
        skill: 5
      });
      await metaColony.finalizeTask(taskId1);
      let repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(3);
      const result = web3Utils.toBN("1").mul(WORKER_PAYOUT);
      assert.equal(repLogEntryWorker[1].toString(), result.toString());
      assert.equal(repLogEntryWorker[4].toNumber(), 6);

      const taskId2 = await setupRatedTask({
        colonyNetwork,
        colony: metaColony,
        skill: 6
      });
      await metaColony.finalizeTask(taskId2);
      repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(7);
      assert.equal(repLogEntryWorker[1].toString(), result.toString());
      assert.equal(repLogEntryWorker[4].toNumber(), 8); // Negative reputation change means children change as well.
    });

    it("should revert on reputation amount overflow", async () => {
      // Fund colony with maximum possible int number of tokens
      const maxUIntNumber = new BN(2)
        .pow(new BN(255))
        .sub(new BN(1))
        .toString(10);
      await fundColonyWithTokens(metaColony, colonyToken, maxUIntNumber);
      // Split the tokens as payouts between the manager and worker
      const managerPayout = new BN("2");
      const evaluatorPayout = new BN("1");
      const workerPayout = new BN(maxUIntNumber).sub(managerPayout).sub(evaluatorPayout);
      const taskId = await setupRatedTask({
        colonyNetwork,
        colony: metaColony,
        token: colonyToken,
        managerPayout,
        evaluatorPayout,
        workerPayout,
        workerRating: 20
      });

      // Check the task pot is correctly funded with the max amount
      const taskPotBalance = await metaColony.getPotBalance.call(2, colonyToken.address);
      assert.isTrue(taskPotBalance.equals(maxUIntNumber));

      await checkErrorRevert(metaColony.finalizeTask(taskId));
    });
  });
});
