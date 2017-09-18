/* globals artifacts */
import testHelper from '../helpers/test-helper';
import upgradableContracts from '../helpers/upgradable-contracts';

const ColonyNetwork = artifacts.require('ColonyNetwork');
const EtherRouter = artifacts.require('EtherRouter');
const Resolver = artifacts.require('Resolver');
const UpdatedColonyNetwork = artifacts.require('UpdatedColonyNetwork');

contract('ColonyNetwork contract upgrade', function (accounts) {
  const COINBASE_ACCOUNT = accounts[0];
  const ACCOUNT_TWO = accounts[1];
  const ACCOUNT_THREE = accounts[2];

  let colonyKey1;
  let colonyKey2;
  let colonyAddress1;
  let colonyAddress2;
  let colonyNetwork;
  let resolver;
  let etherRouter;
  let updatedColonyNetwork;

  before(async function () {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await ColonyNetwork.at(etherRouter.address);

    // Setup 2 test colonies
    colonyKey1 = testHelper.getRandomString(7);
    await colonyNetwork.createColony(colonyKey1);
    colonyAddress1 = await colonyNetwork.getColony(colonyKey1);
    colonyKey2 = testHelper.getRandomString(7);
    await colonyNetwork.createColony(colonyKey2);
    colonyAddress2 = await colonyNetwork.getColony(colonyKey2);

    // Setup new Colony contract version on the Network
    const updatedColonyNetworkContract = await UpdatedColonyNetwork.new();
    const resolver = await Resolver.deployed();
    await resolver.register("isUpdated()", updatedColonyNetworkContract.address, 32);

    updatedColonyNetwork = await UpdatedColonyNetwork.at(etherRouter.address);
  });

  describe('when upgrading ColonyNetwork contract', function () {
    it('should return correct total number of colonies', async function () {
      const updatedColonyCount = await updatedColonyNetwork.colonyCount.call();
      assert.equal(2, updatedColonyCount.toNumber());
    });

    it('should return correct colonies by name', async function () {
      const colony1 = await updatedColonyNetwork.getColony(colonyKey1);
      assert.equal(colony1, colonyAddress1);

      const colony2 = await updatedColonyNetwork.getColony(colonyKey2);
      assert.equal(colony2, colonyAddress2);
    });

    it('should return correct colonies by index', async function () {
      const colony1 = await updatedColonyNetwork.getColonyAt(1);
      assert.equal(colony1, colonyAddress1);

      const colony2 = await updatedColonyNetwork.getColonyAt(2);
      assert.equal(colony2, colonyAddress2);
    });
  });
});
