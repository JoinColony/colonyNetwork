/* globals artifacts */
import testHelper from '../helpers/test-helper';
import upgradableContracts from '../helpers/upgradable-contracts';

const ColonyNetwork = artifacts.require('ColonyNetwork');
const EtherRouter = artifacts.require('EtherRouter');
const Resolver = artifacts.require('Resolver');
const IColony = artifacts.require('IColony');
const ColonyTask = artifacts.require('ColonyTask');
const ColonyFunding = artifacts.require('ColonyFunding');
const ColonyTransactionReviewer = artifacts.require('ColonyTransactionReviewer');
const UpdatedColony = artifacts.require('UpdatedColony');
const Authority = artifacts.require('Authority');
const Token = artifacts.require('Token');

contract('Colony contract upgrade', function (accounts) {
  const COINBASE_ACCOUNT = accounts[0];
  const ACCOUNT_TWO = accounts[1];
  const ACCOUNT_THREE = accounts[2];
  // The base58 decoded, bytes32 converted value of the task ipfsHash
  const ipfsDecodedHash = '9bb76d8e6c89b524d34a454b3140df28';
  const newIpfsDecodedHash = '9bb76d8e6c89b524d34a454b3140df29';

  let COLONY_KEY;
  let colony;
  let colonyTask;
  let colonyFunding;
  let colonyTransactionReviewer;
  let authority;
  let token;
  let colonyNetwork;
  let resolver;
  let etherRouter;
  let updatedColony;
  let updatedColonyVersion;

  before(async function () {
    const etherRouterColonyNetwork = await EtherRouter.deployed();
    colonyNetwork = await ColonyNetwork.at(etherRouterColonyNetwork.address);

    COLONY_KEY = testHelper.getRandomString(7);
    await colonyNetwork.createColony(COLONY_KEY);
    etherRouter = await colonyNetwork.getColony(COLONY_KEY);
    colony = await IColony.at(etherRouter);
    colonyTask = await ColonyTask.new();
    colonyFunding = await ColonyFunding.new();
    colonyTransactionReviewer = await ColonyTransactionReviewer.new();
    let authorityAddress = await colony.authority.call();
    authority = await Authority.at(authorityAddress);
    let tokenAddress = await colony.token.call();
    token = await Token.at(tokenAddress);

    await authority.setUserRole(ACCOUNT_TWO, 0, true);
    await colony.makeTask(ipfsDecodedHash);
    await colony.makeTask(newIpfsDecodedHash);
    // Setup new Colony contract version on the Network
    const updatedColonyContract = await UpdatedColony.new();
    const resolver = await Resolver.new();
    await resolver.register("isUpdated()", updatedColonyContract.address, 32);
    await upgradableContracts.setupColonyVersionResolver(updatedColonyContract, colonyTask, colonyFunding, colonyTransactionReviewer, resolver, colonyNetwork);
    // Check new Colony contract version is registered successfully
    updatedColonyVersion = await colonyNetwork.currentColonyVersion.call();

    // Upgrade our existing colony
    await colonyNetwork.upgradeColony(COLONY_KEY, updatedColonyVersion.toNumber());
    updatedColony = await UpdatedColony.at(etherRouter);
  });

  describe('when upgrading Colony contract', function () {
    it('should have updated the version number', async function() {
      const newVersion = await updatedColony.version.call();
      assert.equal(newVersion.toNumber(), updatedColonyVersion.toNumber());
    });

    it('should be able to lookup newly registered function on Colony', async function () {
      const y = await updatedColony.isUpdated.call();
      assert.isTrue(y);
    });

    it('should return correct total number of tasks', async function () {
      const updatedTaskCount = await updatedColony.taskCount.call();
      assert.equal(2, updatedTaskCount.toNumber());
    });

    it('should return correct tasks', async function () {
      const task1 = await updatedColony.tasks.call(1);
      assert.equal(testHelper.hexToUtf8(task1[0]), ipfsDecodedHash);
      assert.isFalse(task1[1]);
      assert.isFalse(task1[2]);
      assert.equal(task1[3].toNumber(), 0);
      assert.equal(task1[4].toNumber(), 0);

      const task2 = await updatedColony.tasks.call(2);
      assert.equal(testHelper.hexToUtf8(task2[0]), newIpfsDecodedHash);
      assert.isFalse(task2[1]);
      assert.isFalse(task2[2]);
      assert.equal(task2[3].toNumber(), 0);
      assert.equal(task2[4].toNumber(), 0);
    });

    it('should return correct permissions', async function () {
      const owner = await authority.hasUserRole.call(ACCOUNT_TWO, 0);
      assert.isTrue(owner);
    });

    it('should return correct token address', async function () {
      const tokenAddress = await updatedColony.token.call();
      assert.equal(token.address, tokenAddress);
    });
  });
});
