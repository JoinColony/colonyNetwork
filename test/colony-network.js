/* globals artifacts */
import testHelper from '../helpers/test-helper';

const upgradableContracts = require('../helpers/upgradable-contracts');

const EtherRouter = artifacts.require('EtherRouter');
const Colony = artifacts.require('Colony');
const ColonyFunding = artifacts.require('ColonyFunding');
const ColonyTask = artifacts.require('ColonyTask');
const ColonyTransactionReviewer = artifacts.require('ColonyTransactionReviewer');
const IColonyNetwork = artifacts.require('IColonyNetwork');
const Resolver = artifacts.require('Resolver');

contract('ColonyNetwork', (accounts) => {
  const COLONY_KEY = 'COLONY_TEST';
  const OTHER_ACCOUNT = accounts[1];
  let colonyFunding;
  let colonyTransactionReviewer;
  let colonyTask;
  let resolver;
  let resolverColonyNetworkDeployed;
  let colonyNetwork;
  let createColonyGas;
  let version;

  before(async () => {
    const network = await testHelper.web3GetNetwork();
    createColonyGas = (network === 'coverage') ? '0xfffffffffff' : 4e6;
    resolverColonyNetworkDeployed = await Resolver.deployed();
  });

  beforeEach(async () => {
    const colony = await Colony.new();
    version = await colony.version.call();
    resolver = await Resolver.new();
    colonyFunding = await ColonyFunding.new();
    colonyTask = await ColonyTask.new();
    colonyTransactionReviewer = await ColonyTransactionReviewer.new();

    const etherRouter = await EtherRouter.new();
    etherRouter.setResolver(resolverColonyNetworkDeployed.address);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    await upgradableContracts.setupColonyVersionResolver(colony, colonyFunding, colonyTask, colonyTransactionReviewer, resolver, colonyNetwork);
  });

  describe('when initialised', () => {
    it('should accept ether', async () => {
      await colonyNetwork.send(1);
      const colonyNetworkBalance = await testHelper.web3GetBalance(colonyNetwork.address);
      assert.equal(colonyNetworkBalance.toNumber(), 1);
    });

    it('should have the correct current Colony version set', async () => {
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      assert.equal(version.toNumber(), currentColonyVersion.toNumber());
    });

    it('should have the Resolver for current Colony version set', async () => {
      const currentResolver = await colonyNetwork.getColonyVersionResolver.call(version.toNumber());
      assert.equal(currentResolver, resolver.address);
    });

    it('should be able to register a higher Colony contract version', async () => {
      const sampleResolver = '0x65a760e7441cf435086ae45e14a0c8fc1080f54c';
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      const updatedVersion = currentColonyVersion.add(1).toNumber();
      await colonyNetwork.addColonyVersion(updatedVersion, sampleResolver);

      const updatedColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      assert.equal(updatedColonyVersion.toNumber(), updatedVersion);
      const currentResolver = await colonyNetwork.getColonyVersionResolver.call(updatedVersion);
      assert.equal(currentResolver, sampleResolver);
    });

    it('when registering a lower version of the Colony contract, should NOT update the current (latest) colony version', async () => {
      const sampleResolver = '0x65a760e7441cf435086ae45e14a0c8fc1080f54c';
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      await colonyNetwork.addColonyVersion(currentColonyVersion.sub(1).toNumber(), sampleResolver);

      const updatedColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      assert.equal(updatedColonyVersion.toNumber(), currentColonyVersion.toNumber());
    });
  });

  describe('when creating new colonies', () => {
    it('should allow users to create new colonies', async () => {
      await colonyNetwork.createColony(COLONY_KEY);
      const address = await colonyNetwork.getColony.call(COLONY_KEY);
      const colonyCount = await colonyNetwork.getColonyCount.call();
      assert.notEqual(address, 0x0);
      assert.equal(colonyCount.toNumber(), 1);
    });

    it('should revert if colony key is not unique', async () => {
      await colonyNetwork.createColony(COLONY_KEY);
      const colonyAddress1 = await colonyNetwork.getColony.call(COLONY_KEY);

      await testHelper.checkErrorRevert(colonyNetwork.createColony(COLONY_KEY, { gas: createColonyGas }));
      const colonyCount = await colonyNetwork.getColonyCount.call();
      assert.equal(colonyCount.toNumber(), 1);
      const colonyAddress2 = await colonyNetwork.getColony.call(COLONY_KEY);
      assert.equal(colonyAddress2, colonyAddress1);
    });

    it('should maintain correct count of colonies', async () => {
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      const colonyCount = await colonyNetwork.getColonyCount.call();
      assert.equal(colonyCount.toNumber(), 7);
    });

    it('when common colony is created, should have the root skill initialised', async () => {
      await colonyNetwork.createColony('Common Colony');
      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 1);
      const rootSkill = await colonyNetwork.getSkill.call(1);
      assert.equal(rootSkill[0].toNumber(), 0);
      assert.equal(rootSkill[1].toNumber(), 0);
    });

    // TODO: Add token initialisation for the common colony

    it('should fail if ETH is sent', async () => {
      try {
        await colonyNetwork.createColony(COLONY_KEY, { value: 1, gas: createColonyGas });
      } catch (err) {
        testHelper.checkErrorNonPayableFunction(err);
      }
      const colonyNetworkBalance = await testHelper.web3GetBalance(colonyNetwork.address);
      assert.equal(0, colonyNetworkBalance.toNumber());
    });

    it('should log a ColonyAdded event', async () => {
      await testHelper.expectEvent(colonyNetwork.createColony(COLONY_KEY), 'ColonyAdded');
    });
  });

  describe('when getting existing colonies', () => {
    it('should allow users to get the address of a colony by its index', async () => {
      await colonyNetwork.createColony('Colony1');
      await colonyNetwork.createColony('Colony2');
      await colonyNetwork.createColony('Colony3');
      const colonyAddress = await colonyNetwork.getColonyAt.call(3);
      assert.notEqual(colonyAddress, '0x0000000000000000000000000000000000000000');
    });

    it('should return an empty address if there is no colony for the index provided', async () => {
      const colonyAddress = await colonyNetwork.getColonyAt.call(15);
      assert.equal(colonyAddress, '0x0000000000000000000000000000000000000000');
    });

    it('should be able to get the Colony version', async () => {
      await colonyNetwork.createColony(COLONY_KEY);
      const colonyAddress = await colonyNetwork.getColony.call(COLONY_KEY);
      const colony = await Colony.at(colonyAddress);
      const actualColonyVersion = await colony.version.call();
      assert.equal(version.toNumber(), actualColonyVersion.toNumber());
    });
  });

  describe('when upgrading a colony', () => {
    it('should be able to upgrade a colony, if a colony owner', async () => {
      await colonyNetwork.createColony(COLONY_KEY);
      const colonyAddress = await colonyNetwork.getColony.call(COLONY_KEY);
      const colony = await EtherRouter.at(colonyAddress);

      const sampleResolver = '0x65a760e7441cf435086ae45e14a0c8fc1080f54c';
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      const newVersion = currentColonyVersion.add(1).toNumber();
      await colonyNetwork.addColonyVersion(newVersion, sampleResolver);

      await colonyNetwork.upgradeColony(COLONY_KEY, newVersion);
      const colonyResolver = await colony.resolver.call();
      assert.equal(colonyResolver, sampleResolver);
    });

    it('should NOT be able to upgrade a colony to a lower version', async () => {
      await colonyNetwork.createColony(COLONY_KEY);
      const colonyAddress = await colonyNetwork.getColony.call(COLONY_KEY);
      await Colony.at(colonyAddress);

      const sampleResolver = '0x65a760e7441cf435086ae45e14a0c8fc1080f54c';
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      const newVersion = currentColonyVersion.sub(1).toNumber();
      await colonyNetwork.addColonyVersion(newVersion, sampleResolver);

      await testHelper.checkErrorRevert(colonyNetwork.upgradeColony(COLONY_KEY, newVersion));
      assert.equal(version.toNumber(), currentColonyVersion.toNumber());
    });

    it('should NOT be able to upgrade a colony to a nonexistent version', async () => {
      await colonyNetwork.createColony(COLONY_KEY);
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      const newVersion = currentColonyVersion.add(1).toNumber();

      await testHelper.checkErrorRevert(colonyNetwork.upgradeColony(COLONY_KEY, newVersion));
      assert.equal(version.toNumber(), currentColonyVersion.toNumber());
    });

    it('should NOT be able to upgrade a colony if not a colony owner', async () => {
      await colonyNetwork.createColony(COLONY_KEY);
      const colonyAddress = await colonyNetwork.getColony.call(COLONY_KEY);
      const colony = await EtherRouter.at(colonyAddress);
      const colonyResolver = await colony.resolver.call();

      const sampleResolver = '0x65a760e7441cf435086ae45e14a0c8fc1080f54c';
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      const newVersion = currentColonyVersion.add(1).toNumber();
      await colonyNetwork.addColonyVersion(newVersion, sampleResolver);

      await testHelper.checkErrorRevert(colonyNetwork.upgradeColony(COLONY_KEY, newVersion, { from: OTHER_ACCOUNT }));
      assert.notEqual(colonyResolver, sampleResolver);
    });
  });
});
