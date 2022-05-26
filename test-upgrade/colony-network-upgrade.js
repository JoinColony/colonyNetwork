/* globals artifacts */
const { setupRandomColony } = require("../helpers/test-data-generator");

const IColonyNetwork = artifacts.require("IColonyNetwork");
const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");
const UpdatedColonyNetwork = artifacts.require("UpdatedColonyNetwork");

contract("ColonyNetwork contract upgrade", function () {
  let colony1;
  let colony2;
  let colonyNetwork;
  let updatedColonyNetwork;

  before(async function () {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    // Setup 2 test colonies
    ({ colony: colony1 } = await setupRandomColony(colonyNetwork));
    ({ colony: colony2 } = await setupRandomColony(colonyNetwork));

    // Setup new Colony contract version on the Network
    const updatedColonyNetworkContract = await UpdatedColonyNetwork.new();
    const resolver = await Resolver.deployed();
    await resolver.register("isUpdated()", updatedColonyNetworkContract.address);

    updatedColonyNetwork = await UpdatedColonyNetwork.at(etherRouter.address);
  });

  describe("when upgrading ColonyNetwork contract", function () {
    it("should return correct total number of colonies", async function () {
      const updatedColonyCount = await updatedColonyNetwork.getColonyCount();
      assert.equal(3, updatedColonyCount.toNumber());
    });

    it("should return correct colonies by index", async function () {
      const colonyAddress1 = await updatedColonyNetwork.getColony(2);
      assert.equal(colony1.address, colonyAddress1);

      const colonyAddress2 = await updatedColonyNetwork.getColony(3);
      assert.equal(colony2.address, colonyAddress2);
    });
  });
});
