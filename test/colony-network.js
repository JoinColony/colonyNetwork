/* globals artifacts */
import sha3 from 'solidity-sha3';
import testHelper from '../helpers/test-helper';

const ColonyNetwork = artifacts.require('ColonyNetwork');
const Colony = artifacts.require('Colony');
const IColony = artifacts.require('IColony');

contract('ColonyNetwork', function (accounts) {
  const COLONY_KEY = 'COLONY_TEST';
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];
  let colony;
  let colonyNetwork;
  let createColonyGas;

  before(async function () {
    createColonyGas = (web3.version.network == 'coverage') ? '0xfffffffffff' : 4e6;
  });

  beforeEach(async function () {
    colonyNetwork = await ColonyNetwork.new();
  });

  describe('when initialised', () => {
    it('should accept ether', async function () {
      await colonyNetwork.send(1);
      let colonyNetworkBalance = web3.eth.getBalance(colonyNetwork.address);
      assert.equal(colonyNetworkBalance.toNumber(), 1);
    });
  });

  describe('when creating new colonies', () => {
    it('should allow users to create new colonies', async function () {
      await colonyNetwork.createColony(COLONY_KEY);
      const address = await colonyNetwork.getColony(COLONY_KEY);
      colony = await Colony.at(address);
      const colonyName = await colony.name.call();
      assert.equal(testHelper.hexToUtf8(colonyName), COLONY_KEY);
    });

    it('should maintain correct count of colonies', async function () {
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      await colonyNetwork.createColony(testHelper.getRandomString(7));
      const countColonies = await colonyNetwork.countColonies.call();
      assert.equal(countColonies.toNumber(), 7, '# of colonies created is incorrect');
    });

    it('should allow users to get the address of a colony by its index', async function () {
      await colonyNetwork.createColony('Colony1');
      await colonyNetwork.createColony('Colony2');
      await colonyNetwork.createColony('Colony3');
      const colonyAddress = await colonyNetwork.getColonyAt.call(3);
      assert.notEqual(colonyAddress, '0x0000000000000000000000000000000000000000');
      const colony = await Colony.at(colonyAddress);
      const colonyName = await colony.name.call();
      assert.equal(testHelper.hexToUtf8(colonyName), 'Colony3');
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
      const version = await IColony.at(colony.address).version();
      assert.equal(version.toNumber(), actualColonyVersion.toNumber());
    });

    // TODO: Skipped because of https://github.com/ethereumjs/testrpc/issues/149
    it.skip('should be able to get the latest Colony version', async function () {
      await colonyNetwork.createColony(COLONY_KEY);
      const colonyAddress = await colonyNetwork.getColony.call(COLONY_KEY);
      colony = await Colony.at(colonyAddress);
      const actualColonyVersion = await colony.version.call();
      const version = await colonyNetwork.getLatestColonyVersion();
      assert.equal(version.toNumber(), actualColonyVersion.toNumber());
    });

    it('should fail if ETH is sent', async function () {
      try {
        await colonyNetwork.createColony(COLONY_KEY, { value: 1, gas: createColonyGas });
      } catch (err) {
        testHelper.checkErrorNonPayableFunction(err);
      }
    });
  });
});
