/* globals artifacts ColonyNetwork, Colony, IColony, Resolver */
import sha3 from 'solidity-sha3';
import testHelper from '../helpers/test-helper';
const upgradableContracts = require('../helpers/upgradable-contracts');

const EtherRouter = artifacts.require('EtherRouter');
const ColonyNetwork = artifacts.require('ColonyNetwork');
const Colony = artifacts.require('Colony');
const IColony = artifacts.require('IColony');
const Resolver = artifacts.require('Resolver');

contract('ColonyNetwork', function (accounts) {
  const COLONY_KEY = 'COLONY_TEST';
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];
  const GAS_TO_SPEND = 4700000;
  let colony;
  let resolver;
  let resolverColonyNetworkDeployed;
  let colonyNetwork;
  let createColonyGas;
  let version;

  before(async function () {
    const network = await testHelper.web3GetNetwork();
    createColonyGas = (network == 'coverage') ? '0xfffffffffff' : 4e6;
    resolverColonyNetworkDeployed = await Resolver.deployed();
  });

  beforeEach(async function () {
    colony = await Colony.new();
    version = await colony.version.call();
    resolver = await Resolver.new();

    const etherRouter = await EtherRouter.new();
    etherRouter.setResolver(resolverColonyNetworkDeployed.address);
    colonyNetwork = await ColonyNetwork.at(etherRouter.address);
    await upgradableContracts.setupColonyVersionResolver(colony, resolver, colonyNetwork);
  });

  describe('when initialised', () => {
    it('should accept ether', async function () {
      await colonyNetwork.send(1);
      let colonyNetworkBalance = await testHelper.web3GetBalance(colonyNetwork.address);
      assert.equal(colonyNetworkBalance.toNumber(), 1);
    });

    it('should have the correct current Colony version set', async function () {
      const currentColonyVersion = await colonyNetwork.currentColonyVersion.call();
      assert.equal(version.toNumber(), currentColonyVersion.toNumber());
    });

    it('should have the Resolver for current Colony version set', async function () {
      const currentResolver = await colonyNetwork.colonyVersionResolver.call(version.toNumber());
      assert.equal(currentResolver, resolver.address);
    });

    it('should be able to register a higher Colony contract version', async function () {
      const sampleResolver = '0x65a760e7441cf435086ae45e14a0c8fc1080f54c';
      const currentColonyVersion = await colonyNetwork.currentColonyVersion.call();
      const updatedVersion = currentColonyVersion.add(1).toNumber();
      await colonyNetwork.addColonyVersion(updatedVersion, sampleResolver);

      const updatedColonyVersion = await colonyNetwork.currentColonyVersion.call();
      assert.equal(updatedColonyVersion.toNumber(), updatedVersion);
      const currentResolver = await colonyNetwork.colonyVersionResolver.call(updatedVersion);
      assert.equal(currentResolver, sampleResolver);
    });

    it('when registering a lower version of the Colony contract, should NOT update the current (latest) colony version', async function () {
      const sampleResolver = '0x65a760e7441cf435086ae45e14a0c8fc1080f54c';
      const currentColonyVersion = await colonyNetwork.currentColonyVersion.call();
      await colonyNetwork.addColonyVersion(currentColonyVersion.sub(1).toNumber(), sampleResolver);

      const updatedColonyVersion = await colonyNetwork.currentColonyVersion.call();
      assert.equal(updatedColonyVersion.toNumber(), currentColonyVersion.toNumber());
    });
  });

  describe('when creating new colonies', () => {
    it('should allow users to create new colonies', async function () {
      await colonyNetwork.createColony(COLONY_KEY);
      const address = await colonyNetwork.getColony.call(COLONY_KEY);
      const colonyCount = await colonyNetwork.colonyCount.call();
      assert.notEqual(address, 0x0);
      assert.equal(colonyCount.toNumber(), 1);
    });

    it('should maintain correct count of colonies', async function () {
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      const colonyCount = await colonyNetwork.colonyCount.call();
      assert.equal(colonyCount.toNumber(), 7);
    });

    it('should fail if ETH is sent', async function () {
      let tx;
      try {
        tx = await colonyNetwork.createColony(COLONY_KEY, { value: 1, gas: createColonyGas });
      } catch (err) {
        tx = testHelper.checkErrorNonPayableFunction(err);
      }
      let colonyNetworkBalance = await testHelper.web3GetBalance(colonyNetwork.address);
      assert.equal(0, colonyNetworkBalance.toNumber());
    });
  })

  describe('when getting existing colonies', () => {
    it('should allow users to get the address of a colony by its index', async function () {
      await colonyNetwork.createColony('Colony1');
      await colonyNetwork.createColony('Colony2');
      await colonyNetwork.createColony('Colony3');
      const colonyAddress = await colonyNetwork.getColonyAt.call(3);
      assert.notEqual(colonyAddress, '0x0000000000000000000000000000000000000000');
    });

    it('should return an empty address if there is no colony for the index provided', async function () {
      const colonyAddress = await colonyNetwork.getColonyAt.call(15);
      assert.equal(colonyAddress, '0x0000000000000000000000000000000000000000');
    });

    it('should be able to get the Colony version', async function () {
      await colonyNetwork.createColony(COLONY_KEY);
      const colonyAddress = await colonyNetwork.getColony.call(COLONY_KEY);
      colony = await Colony.at(colonyAddress);
      const actualColonyVersion = await colony.version.call();
      assert.equal(version.toNumber(), actualColonyVersion.toNumber());
    });
  });

  describe('when upgrading a colony', () => {
    it('should be able to upgrade a colony, if a colony owner', async function () {
      await colonyNetwork.createColony(COLONY_KEY);
      let colonyAddress = await colonyNetwork.getColony.call(COLONY_KEY);
      let colony = await EtherRouter.at(colonyAddress);

      const sampleResolver = '0x65a760e7441cf435086ae45e14a0c8fc1080f54c';
      const currentColonyVersion = await colonyNetwork.currentColonyVersion.call();
      const newVersion = currentColonyVersion.add(1).toNumber();
      await colonyNetwork.addColonyVersion(newVersion, sampleResolver);

      await colonyNetwork.upgradeColony(COLONY_KEY, newVersion);
      let resolver = await colony.resolver.call();
      assert.equal(resolver, sampleResolver);
    });

    it('should NOT be able to upgrade a colony to a lower version', async function () {
      await colonyNetwork.createColony(COLONY_KEY);
      let colonyAddress = await colonyNetwork.getColony.call(COLONY_KEY);
      let colony = await Colony.at(colonyAddress);

      const sampleResolver = '0x65a760e7441cf435086ae45e14a0c8fc1080f54c';
      const currentColonyVersion = await colonyNetwork.currentColonyVersion.call();
      const newVersion = currentColonyVersion.sub(1).toNumber();
      await colonyNetwork.addColonyVersion(newVersion, sampleResolver);

      let tx;
      try {
        tx = await colonyNetwork.upgradeColony(COLONY_KEY, newVersion, { gas: GAS_TO_SPEND });
      } catch (err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      let version = await colony.version.call();
      assert.equal(version.toNumber(), currentColonyVersion.toNumber());
    });

    it('should NOT be able to upgrade a colony to a nonexistent version', async function () {
      await colonyNetwork.createColony(COLONY_KEY);
      let colonyAddress = await colonyNetwork.getColony.call(COLONY_KEY);
      let colony = await Colony.at(colonyAddress);

      const currentColonyVersion = await colonyNetwork.currentColonyVersion.call();
      const newVersion = currentColonyVersion.add(1).toNumber();

      let tx;
      try {
        tx = await colonyNetwork.upgradeColony(COLONY_KEY, newVersion, { gas: GAS_TO_SPEND });
      } catch (err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      let version = await colony.version.call();
      assert.equal(version.toNumber(), currentColonyVersion.toNumber());
    });

    it('should NOT be able to upgrade a colony if not a colony owner', async function () {
      await colonyNetwork.createColony(COLONY_KEY);
      const colonyAddress = await colonyNetwork.getColony.call(COLONY_KEY);
      colony = await EtherRouter.at(colonyAddress);
      let resolver = await colony.resolver.call();

      const sampleResolver = '0x65a760e7441cf435086ae45e14a0c8fc1080f54c';
      const currentColonyVersion = await colonyNetwork.currentColonyVersion.call();
      const newVersion = currentColonyVersion.add(1).toNumber();
      await colonyNetwork.addColonyVersion(newVersion, sampleResolver);

      let tx;
      try {
        tx = await colonyNetwork.upgradeColony(COLONY_KEY, newVersion, { from: OTHER_ACCOUNT, gas: GAS_TO_SPEND });
      } catch (err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      assert.notEqual(resolver, sampleResolver);
    });
  });
});
