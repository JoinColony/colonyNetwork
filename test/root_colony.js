/* globals artifacts */
import sha3 from 'solidity-sha3';
import testHelper from '../helpers/test-helper';

const RootColony = artifacts.require('RootColony');
const Colony = artifacts.require('Colony');
const IColony = artifacts.require('IColony');
const RootColonyResolver = artifacts.require('RootColonyResolver');
const EternalStorage = artifacts.require('EternalStorage');
const Ownable = artifacts.require('Ownable');
const ColonyFactory = artifacts.require('ColonyFactory');
const Destructible = artifacts.require('Destructible');

contract('RootColony', function (accounts) {
  const COLONY_KEY = 'COLONY_TEST';
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];
  let colony;
  let rootColony;
  let eternalStorageRoot;
  let createColonyGas;

  before(async function () {
    rootColony = await RootColony.deployed();
    createColonyGas = (web3.version.network == 'coverage') ? '0xfffffffffff' : 4e6;
  });

  beforeEach(async function () {
    eternalStorageRoot = await EternalStorage.new();
    await eternalStorageRoot.changeOwner(rootColony.address);
    await rootColony.registerEternalStorage(eternalStorageRoot.address);
  });

  describe('when spawning new colonies', () => {
    it('should allow users to create new colonies', async function () {
      await rootColony.createColony(COLONY_KEY);
      const address = await rootColony.getColony(COLONY_KEY);
      colony = await Colony.at(address);
      const countColonies = await colony.countUsersInRole.call(0);
      assert.equal(countColonies.toNumber(), 1, 'Owners count should be 1');
      const isUserOwner = await colony.userIsInRole.call(MAIN_ACCOUNT, 0);
      assert.isTrue(isUserOwner, 'creator user is not an owner');
      const rootColonyResolverAddress = await colony.rootColonyResolver.call();
      const rootColonyAddress = await RootColonyResolver.at(rootColonyResolverAddress).rootColonyAddress.call();
      assert.equal(rootColony.address, rootColonyAddress, 'root colony address is incorrect');
      const owner = await eternalStorageRoot.owner.call();
      assert.equal(rootColony.address, owner, 'EternalStorage for Factory does not have the ColonyFactory as its owner');
    });

    it('should allow users to iterate over colonies', async function () {
      await rootColony.createColony(testHelper.getRandomString(7));
      await rootColony.createColony(testHelper.getRandomString(7));
      await rootColony.createColony(testHelper.getRandomString(7));
      await rootColony.createColony(testHelper.getRandomString(7));
      await rootColony.createColony(testHelper.getRandomString(7));
      await rootColony.createColony(testHelper.getRandomString(7));
      await rootColony.createColony(testHelper.getRandomString(7));
      const countColonies = await rootColony.countColonies.call();
      assert.equal(countColonies.toNumber(), 7, '# of colonies created is incorrect');
    });

    it('should allow users to get the address of a colony by its index', async function () {
      await rootColony.createColony('Colony1');
      await rootColony.createColony('Colony2');
      await rootColony.createColony('Colony3');
      const colony3AddressA = await rootColony.getColony.call('Colony3');
      const colony3AddressB = await rootColony.getColonyAt.call(3);
      assert.equal(colony3AddressA, colony3AddressB, 'Colony address is incorrect');
    });

    it('should allow users to get the index of a colony by its key', async function () {
      await rootColony.createColony('Colony1');
      await rootColony.createColony('Colony2');
      await rootColony.createColony('Colony3');
      await rootColony.createColony('Colony4');
      await rootColony.createColony('Colony5');
      await rootColony.createColony('Colony6');
      let colonyIdx = await rootColony.getColonyIndex.call('Colony4');
      assert.equal(colonyIdx.toNumber(), 4, 'Colony index is incorrect');
      colonyIdx = await rootColony.getColonyIndex.call('Colony5');
      assert.equal(colonyIdx.toNumber(), 5, 'Colony index is incorrect');
    });

    it('should return an empty address if there is no colony for the key provided', async function () {
      const address = await rootColony.getColony.call('DOESNT-EXIST');
      assert.equal(address, '0x0000000000000000000000000000000000000000', 'address returned is incorrect');
    });

    it('should fail if the key provided is empty', async function () {
      let tx;
      try {
        tx = await rootColony.createColony('', { gas: createColonyGas });
      } catch (err) {
        tx = testHelper.ifUsingTestRPC(err);
        testHelper.checkAllGasSpent(createColonyGas, tx);
      }
    });

    it('should fail if the key provided is already in use', async function () {
      await rootColony.createColony(COLONY_KEY);

      let tx;
      try {
        await rootColony.createColony(COLONY_KEY, { gas: createColonyGas });
      } catch (err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(createColonyGas, tx);

      let count = await rootColony.countColonies.call();
      assert.equal(count.toNumber(), 1);
    });

    it.skip('should pay root colony 5% fee of a completed task value', async function () {
      const startingBalance = web3.eth.getBalance(rootColony.address);
      const startingBalanceUser = web3.eth.getBalance(OTHER_ACCOUNT);

      await rootColony.createColony(COLONY_KEY);
      const address = await rootColony.getColony.call(COLONY_KEY);
      colony = Colony.at(_address);
      await colony.makeTask('name', 'summary');
      await colony.updateTaskTitle(0, 'nameedit');
      await colony.contributeEthToTask(0, { value: 1000 });
      const extStorageAddress = await colony.eternalStorage.call();
      let eternalStorage = EternalStorage.at(extStorageAddress);
      const balance = await eternalStorage.getUIntValue.call(sha3('task_eth', 0));
      assert.equal(balance, 1000, 'Task ether balance is incorrect');
      await colony.completeAndPayTask(0, OTHER_ACCOUNT);
      const currentBalance = web3.eth.getBalance(rootColony.address).minus(startingBalance).toNumber();
      assert.equal(currentBalance, 50, 'RootColony balance is incorrect');
      const currentBalanceUser = web3.eth.getBalance(OTHER_ACCOUNT).minus(startingBalanceUser).toNumber();
      assert.equal(currentBalanceUser, 950, 'User balance is incorrect');
    });

    it('should be able to upgrade colonies, if colony owner', async function () {
      await rootColony.createColony(COLONY_KEY);
      let oldColonyAddress = await rootColony.getColony.call(COLONY_KEY);
      colony = await Colony.at(oldColonyAddress);
      await rootColony.upgradeColony(COLONY_KEY);
      let upgradedColonyAddress = await rootColony.getColony.call(COLONY_KEY);
      assert.notEqual(oldColonyAddress, upgradedColonyAddress);
    });

    it('should NOT be able to upgrade colonies if not colony owner', async function () {
      await rootColony.createColony(COLONY_KEY);
      const oldColonyAddress = await rootColony.getColony.call(COLONY_KEY);

      let tx;
      try {
        tx = await rootColony.upgradeColony(COLONY_KEY, { from: OTHER_ACCOUNT, gas: createColonyGas });
      } catch (err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(createColonyGas, tx);
    });

    it('should NOT be able to upgrade colonies if not called via root colony', async function () {
      await rootColony.createColony(COLONY_KEY);
      const colonyAddress = await rootColony.getColony.call(COLONY_KEY);
      colony = await Colony.at(colonyAddress);
      const ownable = await Ownable.new();

      let tx;
      try {
        tx = await colony.upgrade(ownable.address, { gas: createColonyGas });
      } catch (err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(createColonyGas, tx);
    });

    it('should be able to get the Colony version', async function () {
      await rootColony.createColony(COLONY_KEY);
      const colonyAddress = await rootColony.getColony.call(COLONY_KEY);
      colony = await Colony.at(colonyAddress);
      const actualColonyVersion = await colony.version.call();
      const version = await IColony.at(colony.address).version();
      assert.equal(version.toNumber(), actualColonyVersion.toNumber());
    });

    // TODO: Skipped because of https://github.com/ethereumjs/testrpc/issues/149
    it.skip('should be able to get the latest Colony version', async function () {
      await rootColony.createColony(COLONY_KEY)
      const colonyAddress = await rootColony.getColony.call(COLONY_KEY);
      colony = await Colony.at(colonyAddress);
      const actualColonyVersion = await colony.version.call();
      const version = await rootColony.getLatestColonyVersion();
      assert.equal(version.toNumber(), actualColonyVersion.toNumber());
    });

    it('should fail if ETH is sent', async function () {
      try {
        await rootColony.createColony(COLONY_KEY, { value: 1, gas: createColonyGas });
      } catch (err) {
        testHelper.checkErrorNonPayableFunction(err);
      }
    });

    it('should be able to move EternalStorage to another RootColony', async function () {
     // Just picking any known address for this test.
     // In reality the address who owns the Storage will be that of a RootColony
      await rootColony.changeEternalStorageOwner(OTHER_ACCOUNT)
      const storageAddress = await rootColony.eternalStorageRoot.call();
      const eternalStorage = await Ownable.at(storageAddress);
      const owner = await eternalStorage.owner.call();
      assert.equal(owner, OTHER_ACCOUNT, 'Was not able to change the owner of the EternalStorage in RootColony');
    });

    it('should NOT be able to move EternalStorage to another RootColony if called with invalid address', async function () {
      let tx;
      try {
        tx = await rootColony.changeEternalStorageOwner(0x0, { gas: createColonyGas });
      } catch (err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(createColonyGas, tx);
    });

    it('should NOT allow anyone but RootColony to create new colonies', async function () {
      const colonyFactoryAddress = await rootColony.colonyFactory.call();
      const colonyFactory = await ColonyFactory.at(colonyFactoryAddress);
      const _eternalStorage = await EternalStorage.new();
      let tx;
      try {
        tx = await colonyFactory.createColony(_eternalStorage.address, { from:OTHER_ACCOUNT, gas: createColonyGas });
      } catch (err) {
        tx = testHelper.ifUsingTestRPC(err);
      }
      testHelper.checkAllGasSpent(createColonyGas, tx);
    });
  });

  describe('when working with Destructible', () => {
    it('should allow it to be killed in favour of a replacement contract', async function () {
      let destructible = await Destructible.new();
      await destructible.kill(OTHER_ACCOUNT)

      let contractCode = web3.eth.getCode(destructible.address);
      assert.isTrue(contractCode == '0x0' || contractCode == '0x');
    });
  });
});
