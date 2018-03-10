/* globals artifacts */
import { getRandomString, getTokenArgs } from "../helpers/test-helper";

const Token = artifacts.require("Token");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");
const UpdatedColonyNetwork = artifacts.require("UpdatedColonyNetwork");

contract("ColonyNetwork contract upgrade", () => {
  let colonyKey1;
  let colonyKey2;
  let colonyAddress1;
  let colonyAddress2;
  let colonyNetwork;
  let updatedColonyNetwork;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    // Setup 2 test colonies
    colonyKey1 = getRandomString(7);
    const tokenArgs1 = getTokenArgs();
    const newToken = await Token.new(...tokenArgs1);
    await colonyNetwork.createColony(colonyKey1, newToken.address);
    colonyAddress1 = await colonyNetwork.getColony(colonyKey1);
    colonyKey2 = getRandomString(7);
    const tokenArgs2 = getTokenArgs();
    const newToken2 = await Token.new(...tokenArgs2);
    await colonyNetwork.createColony(colonyKey2, newToken2.address);
    colonyAddress2 = await colonyNetwork.getColony(colonyKey2);

    // Setup new Colony contract version on the Network
    const updatedColonyNetworkContract = await UpdatedColonyNetwork.new();
    const resolver = await Resolver.deployed();
    await resolver.register("isUpdated()", updatedColonyNetworkContract.address, 32);

    updatedColonyNetwork = await UpdatedColonyNetwork.at(etherRouter.address);
  });

  describe("when upgrading ColonyNetwork contract", () => {
    it("should return correct total number of colonies", async () => {
      const updatedColonyCount = await updatedColonyNetwork.getColonyCount.call();
      assert.equal(3, updatedColonyCount.toNumber());
    });

    it("should return correct colonies by name", async () => {
      const colony1 = await updatedColonyNetwork.getColony(colonyKey1);
      assert.equal(colony1, colonyAddress1);

      const colony2 = await updatedColonyNetwork.getColony(colonyKey2);
      assert.equal(colony2, colonyAddress2);
    });

    it("should return correct colonies by index", async () => {
      const colony1 = await updatedColonyNetwork.getColonyAt(2);
      assert.equal(colony1, colonyAddress1);

      const colony2 = await updatedColonyNetwork.getColonyAt(3);
      assert.equal(colony2, colonyAddress2);
    });
  });
});
