/* globals artifacts */
import { setupReputationMiningCycleResolver } from "../helpers/upgradable-contracts";
import { advanceMiningCycleNoContest } from "../helpers/test-helper";

const IColonyNetwork = artifacts.require("IColonyNetwork");
const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");
const UpdatedReputationMiningCycle = artifacts.require("./UpdatedReputationMiningCycle");
const ReputationMiningCycleRespond = artifacts.require("./ReputationMiningCycleRespond");
const ReputationMiningCycleBinarySearch = artifacts.require("./ReputationMiningCycleBinarySearch");

contract("ReputationMiningCycle contract upgrade", function () {
  let colonyNetwork;
  let reputationMiningResolverBefore;

  before(async function () {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    reputationMiningResolverBefore = await colonyNetwork.getMiningResolver();

    // Register a new version of the ReputationMiningCycleResolver on the ColonyNetwork
    const reputationMiningCycle = await UpdatedReputationMiningCycle.new();
    const reputationMiningCycleRespond = await ReputationMiningCycleRespond.deployed();
    const reputationMiningCycleBinarySearch = await ReputationMiningCycleBinarySearch.deployed();

    const resolver = await Resolver.new();
    await resolver.register("isUpdated()", reputationMiningCycle.address);
    await setupReputationMiningCycleResolver(
      reputationMiningCycle,
      reputationMiningCycleRespond,
      reputationMiningCycleBinarySearch,
      resolver,
      colonyNetwork
    );
  });

  describe("when upgrading ReputationMiningCycle contract", function () {
    it("should change the ReputationMiningCycle resolver on the Network", async function () {
      const reputationMiningResolverAfter = await colonyNetwork.getMiningResolver();
      assert.notEqual(reputationMiningResolverBefore, reputationMiningResolverAfter);
    });

    it("should pick up the new ReputationMiningCycle contract", async function () {
      // Cycle through the mining process once to get the newly created inactive cycles on the updated mining contract
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });
      const reputationMiningCycleInactiveAddress = await colonyNetwork.getReputationMiningCycle(false);
      const reputationMiningCycleInactive = await UpdatedReputationMiningCycle.at(reputationMiningCycleInactiveAddress);

      const isInactiveCycleUpdated = await reputationMiningCycleInactive.isUpdated();
      assert.isTrue(isInactiveCycleUpdated);
    });
  });
});
