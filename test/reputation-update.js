/* globals artifacts */
import { toBN } from "web3-utils";
import { BN } from "bn.js";
import chai from "chai";
import bnChai from "bn-chai";

import { MANAGER_PAYOUT, WORKER_PAYOUT, WAD } from "../helpers/constants";
import { getTokenArgs, checkErrorRevert } from "../helpers/test-helper";
import { fundColonyWithTokens, setupRatedTask } from "../helpers/test-data-generator";

import { setupColonyVersionResolver } from "../helpers/upgradable-contracts";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IMetaColony = artifacts.require("IMetaColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const Resolver = artifacts.require("Resolver");
const Colony = artifacts.require("Colony");
const ColonyFunding = artifacts.require("ColonyFunding");
const ColonyTask = artifacts.require("ColonyTask");
const Token = artifacts.require("Token");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const ContractRecovery = artifacts.require("ContractRecovery");

contract("Colony Reputation Updates", accounts => {
  const MANAGER = accounts[0];
  const EVALUATOR = MANAGER;
  const WORKER = accounts[2];
  const OTHER = accounts[3];

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
    const contractRecovery = await ContractRecovery.new();
    const etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolverColonyNetworkDeployed.address);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    await setupColonyVersionResolver(colony, colonyTask, colonyFunding, contractRecovery, resolver);
    await colonyNetwork.initialise(resolver.address);

    const tokenArgs = getTokenArgs();
    colonyToken = await Token.new(...tokenArgs);
    await colonyNetwork.createMetaColony(colonyToken.address);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    await colonyToken.setOwner(metaColonyAddress);
    metaColony = await IMetaColony.at(metaColonyAddress);
    const amount = WAD.mul(new BN(1000));
    await fundColonyWithTokens(metaColony, colonyToken, amount);

    // Jumping through these hoops to avoid the need to rewire ReputationMiningCycleResolver.
    const deployedColonyNetwork = await IColonyNetwork.at(EtherRouter.address);
    const reputationMiningCycleResolverAddress = await deployedColonyNetwork.getMiningResolver();
    await colonyNetwork.setMiningResolver(reputationMiningCycleResolverAddress);

    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
    const inactiveReputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
    inactiveReputationMiningCycle = await IReputationMiningCycle.at(inactiveReputationMiningCycleAddress);
  });

  describe("when added", () => {
    it("should be readable", async () => {
      const taskId = await setupRatedTask({ colonyNetwork, colony: metaColony });
      await metaColony.finalizeTask(taskId);

      const repLogEntryManager = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(0);
      assert.equal(repLogEntryManager[0], MANAGER);
      expect(repLogEntryManager[1]).to.eq.BN(toBN(100 * 1e18));
      assert.equal(repLogEntryManager[2].toNumber(), 2);
      assert.equal(repLogEntryManager[3], metaColony.address);
      assert.equal(repLogEntryManager[4].toNumber(), 2);
      assert.equal(repLogEntryManager[5].toNumber(), 0);

      const repLogEntryEvaluator = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(1);
      assert.equal(repLogEntryEvaluator[0], EVALUATOR);
      expect(repLogEntryEvaluator[1]).to.eq.BN(toBN(50 * 1e18));
      assert.equal(repLogEntryEvaluator[2].toNumber(), 2);
      assert.equal(repLogEntryEvaluator[3], metaColony.address);
      assert.equal(repLogEntryEvaluator[4].toNumber(), 2);
      assert.equal(repLogEntryEvaluator[5].toNumber(), 2);

      const repLogEntryWorker = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(2);
      assert.equal(repLogEntryWorker[0], WORKER);
      expect(repLogEntryWorker[1]).to.eq.BN(toBN(300 * 1e18));
      assert.equal(repLogEntryWorker[2].toNumber(), 2);
      assert.equal(repLogEntryWorker[3], metaColony.address);
      assert.equal(repLogEntryWorker[4].toNumber(), 2);
      assert.equal(repLogEntryWorker[5].toNumber(), 4);
    });

    const ratings = [
      {
        manager: 1,
        reputationChangeManager: MANAGER_PAYOUT.neg(),
        worker: 1,
        reputationChangeWorker: WORKER_PAYOUT.neg()
      },
      {
        manager: 2,
        reputationChangeManager: MANAGER_PAYOUT,
        worker: 2,
        reputationChangeWorker: WORKER_PAYOUT
      },
      {
        manager: 3,
        reputationChangeManager: MANAGER_PAYOUT.muln(3).divn(2),
        worker: 3,
        reputationChangeWorker: WORKER_PAYOUT.muln(3).divn(2)
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
        // If the rating is less than 2, then we also subtract reputation from all child skills. In the case
        // of the metaColony here, the task was created in the root domain of the metaColony, and a child of the
        // root skill is the mining skill. So the number we expect here differs depending on whether it's a reputation
        // gain or loss that we're logging.
        if (rating.manager >= 2) {
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
        if (rating.worker >= 2) {
          assert.equal(repLogEntryWorker[4].toNumber(), 2);
        } else {
          assert.equal(repLogEntryWorker[4].toNumber(), 4);
        }
        // This last entry in the log entry is nPreviousUpdates, which depends on whether the manager was given a reputation
        // gain or loss.
        if (rating.manager >= 2) {
          assert.equal(repLogEntryWorker[5].toNumber(), 4);
        } else {
          assert.equal(repLogEntryWorker[5].toNumber(), 6);
        }
      });
    });

    it("should not be able to be appended by an account that is not a colony", async () => {
      const lengthBefore = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      await checkErrorRevert(colonyNetwork.appendReputationUpdateLog(OTHER, 1, 2), "colony-caller-must-be-colony");
      const lengthAfter = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      assert.equal(lengthBefore.toNumber(), lengthAfter.toNumber());
    });

    it("should populate nPreviousUpdates correctly", async () => {
      const initialRepLogLength = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      const taskId1 = await setupRatedTask({ colonyNetwork, colony: metaColony });
      await metaColony.finalizeTask(taskId1);
      let repLogEntry = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(initialRepLogLength);
      const nPrevious = repLogEntry[5];
      repLogEntry = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(initialRepLogLength + 1);
      assert.equal(repLogEntry[5].toNumber(), nPrevious.addn(2).toNumber());

      const taskId2 = await setupRatedTask({ colonyNetwork, colony: metaColony });
      await metaColony.finalizeTask(taskId2);
      repLogEntry = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(initialRepLogLength + 2);
      assert.equal(repLogEntry[5].toNumber(), nPrevious.addn(4).toNumber());
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
      const result = toBN(WORKER_PAYOUT)
        .muln(3)
        .divn(2);
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
      const maxUIntNumber = new BN(2).pow(new BN(255)).sub(new BN(1));
      await fundColonyWithTokens(metaColony, colonyToken, maxUIntNumber);
      // Split the tokens as payouts between the manager and worker
      const managerPayout = new BN("2");
      const evaluatorPayout = new BN("1");
      const workerPayout = maxUIntNumber.sub(managerPayout).sub(evaluatorPayout);
      const taskId = await setupRatedTask({
        colonyNetwork,
        colony: metaColony,
        token: colonyToken,
        managerPayout,
        evaluatorPayout,
        workerPayout,
        workerRating: 1
      });

      // Check the task pot is correctly funded with the max amount
      const taskPotBalance = await metaColony.getPotBalance(2, colonyToken.address);
      expect(taskPotBalance).to.eq.BN(maxUIntNumber);

      await checkErrorRevert(metaColony.finalizeTask(taskId), "colony-math-unsafe-int-mul");
    });
  });
});
