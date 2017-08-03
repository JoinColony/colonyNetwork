/* globals artifacts */
import { solSha3 } from 'colony-utils';
import testHelper from '../helpers/test-helper';

const RootColony = artifacts.require('RootColony');
const Colony = artifacts.require('Colony');
const IColony = artifacts.require('IColony');
const RootColonyResolver = artifacts.require('RootColonyResolver');
const EternalStorage = artifacts.require('EternalStorage');
const Ownable = artifacts.require('Ownable');

contract('RootColony', function (accounts) {
  const COLONY_KEY = 'COLONY_TEST';
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];
  let colony;
  let rootColony;
  let eternalStorageRoot;

  before(function (done) {
    RootColony.deployed()
    .then(function (instance) {
      rootColony = instance;
    })
    .then(done);
  });

  beforeEach(function (done) {
    EternalStorage.new()
    .then(function (contract) {
      eternalStorageRoot = contract;
      return eternalStorageRoot.changeOwner(rootColony.address);
    })
    .then(function () {
      return rootColony.registerEternalStorage(eternalStorageRoot.address);
    })
    .then(function () {
      done();
    })
    .catch(done);
  });

  describe('when spawning new colonies', function () {
    it('should allow users to create new colonies', function (done) {
      rootColony.createColony(COLONY_KEY, { from: MAIN_ACCOUNT })
      .then(function () {
        return rootColony.getColony(COLONY_KEY);
      })
      .then(function (_address) {
        colony = Colony.at(_address);
        return colony.countUsersInRole.call(0);
      })
      .then(function (count) {
        assert.equal(count.toNumber(), 1, 'Owners count should be 1');
        return colony.userIsInRole.call(MAIN_ACCOUNT, 0);
      })
      .then(function (_isUserOwner) {
        assert.isTrue(_isUserOwner, 'creator user is not an owner');
        return colony.rootColonyResolver.call();
      })
      .then(function (_rootColonyResolverAddress) {
        return RootColonyResolver.at(_rootColonyResolverAddress).rootColonyAddress.call();
      })
      .then(function (_rootColonyAddress) {
        assert.equal(rootColony.address, _rootColonyAddress, 'root colony address is incorrect');
      })
      .then(function () {
        return eternalStorageRoot.owner.call();
      })
      .then(function (owner) {
        assert.equal(rootColony.address, owner, 'EternalStorage for Factory does not have the ColonyFactory as its owner');
      })
      .then(done)
      .catch(done);
    });

    it('should allow users to iterate over colonies', function (done) {
      testHelper.Promise.all([
        rootColony.createColony(testHelper.getRandomString(7)),
        rootColony.createColony(testHelper.getRandomString(7)),
        rootColony.createColony(testHelper.getRandomString(7)),
        rootColony.createColony(testHelper.getRandomString(7)),
        rootColony.createColony(testHelper.getRandomString(7)),
        rootColony.createColony(testHelper.getRandomString(7)),
        rootColony.createColony(testHelper.getRandomString(7)),
      ])
      .then(function () {
        return rootColony.countColonies.call();
      })
      .then(function (_coloniesCount) {
        assert.equal(_coloniesCount.toNumber(), 7, '# of colonies created is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should allow users to get the index of a colony by its index', function (done) {
      let colony3Address;

      rootColony.createColony('Colony1')
      .then(function() {
        return rootColony.createColony('Colony2')
      })
      .then(function() {
        return rootColony.createColony('Colony3')
      })
      .then(function() {
        return rootColony.getColony.call('Colony3');
      })
      .then(function (_colony3Address) {
        colony3Address = _colony3Address;
        return rootColony.getColonyAt.call(3);
      })
      .then(function (_colonyAddress) {
        assert.equal(_colonyAddress, colony3Address, 'Colony address is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should allow users to get the index of a colony by its key', function (done) {
      testHelper.Promise.all([
        rootColony.createColony('Colony1'),
        rootColony.createColony('Colony2'),
        rootColony.createColony('Colony3'),
      ])
      .then(function () {
        return rootColony.createColony('Colony4');
      })
      .then(function () {
        return rootColony.createColony('Colony5');
      })
      .then(function () {
        return rootColony.createColony('Colony6');
      })
      .then(function () {
        return rootColony.getColonyIndex.call('Colony4');
      })
      .then(function (_colonyIdx) {
        assert.equal(_colonyIdx.toNumber(), 4, 'Colony index is incorrect');
        return rootColony.getColonyIndex.call('Colony5');
      })
      .then(function (_colonyIdx) {
        assert.equal(_colonyIdx.toNumber(), 5, 'Colony index is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should return an empty address if there is no colony for the key provided', function (done) {
      rootColony.getColony.call('DOESNT-EXIST')
      .then(function (_address) {
        assert.equal(_address, '0x0000000000000000000000000000000000000000', 'address returned is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the key provided is empty', function (done) {
      rootColony.createColony('', {
        from: MAIN_ACCOUNT,
        gas: 3e6,
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(3e6, tx);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the key provided is already in use', function (done) {
      rootColony.createColony(COLONY_KEY, {
        from: MAIN_ACCOUNT,
        gas: 3e6,
      })
      .then(function () {
        return rootColony.createColony(COLONY_KEY, {
          from: MAIN_ACCOUNT,
          gas: 3e6,
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(3e6, tx);
      })
      .then(done)
      .catch(done);
    });

    it.skip('should pay root colony 5% fee of a completed task value', function (done) {
      const startingBalance = web3.eth.getBalance(rootColony.address);
      const startingBalanceUser = web3.eth.getBalance(OTHER_ACCOUNT);
      let eternalStorage;

      rootColony.createColony(COLONY_KEY)
      .then(function () {
        return rootColony.getColony.call(COLONY_KEY);
      })
      .then(function (_address) {
        colony = Colony.at(_address);
        return colony.makeTask('name', 'summary', { from: MAIN_ACCOUNT });
      })
      .then(function () {
        return colony.updateTaskTitle(0, 'nameedit');
      })
      .then(function () {
        return colony.contributeEthToTask(0, { from: MAIN_ACCOUNT, value: 1000 });
      })
      .then(function () {
        return colony.eternalStorage.call();
      })
      .then(function (extStorageAddress) {
        eternalStorage = EternalStorage.at(extStorageAddress);
      })
      .then(function () {
        return eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      })
      .then(function (balance) {
        assert.equal(balance, 1000, 'Task ether balance is incorrect');
        return colony.completeAndPayTask(0, OTHER_ACCOUNT, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        const currentBalance = web3.eth.getBalance(rootColony.address).minus(startingBalance).toNumber();
        assert.equal(currentBalance, 50, 'RootColony balance is incorrect');
      })
      .then(function () {
        const currentBalanceUser = web3.eth.getBalance(OTHER_ACCOUNT).minus(startingBalanceUser).toNumber();
        assert.equal(currentBalanceUser, 950, 'User balance is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should be able to upgrade colonies', function (done) {
      let oldColonyAddress;
      rootColony.createColony(COLONY_KEY)
      .then(function () {
        return rootColony.getColony.call(COLONY_KEY);
      })
      .then(function (_address) {
        oldColonyAddress = _address;
        colony = Colony.at(_address);
        return rootColony.upgradeColony(COLONY_KEY);
      })
      .then(function () {
        return rootColony.getColony.call(COLONY_KEY);
      })
      .then(function (upgradedColonyAddress) {
        assert.notEqual(oldColonyAddress, upgradedColonyAddress);
      })
      .then(done)
      .catch(done);
    });

    it('should be able to get the Colony version', function (done) {
      let actualColonyVersion;
      rootColony.createColony(COLONY_KEY)
      .then(function () {
        return rootColony.getColony.call(COLONY_KEY);
      })
      .then(function (_address) {
        colony = Colony.at(_address);
        return colony.version.call();
      })
      .then(function (version) {
        actualColonyVersion = version.toNumber();
        return IColony.at(colony.address).version();
      })
      .then(function (version) {
        assert.equal(version.toNumber(), actualColonyVersion);
      })
      .then(done)
      .catch(done);
    });

    // TODO: Skipped because of https://github.com/ethereumjs/testrpc/issues/149
    it.skip('should be able to get the latest Colony version', function (done) {
      let actualColonyVersion;
      rootColony.createColony(COLONY_KEY)
      .then(function () {
        return rootColony.getColony.call(COLONY_KEY);
      })
      .then(function (_address) {
        colony = Colony.at(_address);
        return colony.version.call();
      })
      .then(function (version) {
        actualColonyVersion = version.toNumber();
        return rootColony.getLatestColonyVersion();
      })
      .then(function (version) {
        assert.equal(version.toNumber(), actualColonyVersion);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if ETH is sent', function (done) {
      rootColony.createColony(COLONY_KEY, {
        from: MAIN_ACCOUNT,
        gas: 3e6,
        value: 1,
      })
      .catch(function (tx) {
        testHelper.checkErrorNonPayableFunction(tx);
      })
      .then(done)
      .catch(done);
    });

    it('should be able to move EternalStorage to another RootColony', function (done) {
     // Just picking any known address for this test.
     // In reality the address who owns the Storage will be that of a RootColony
      rootColony.changeEternalStorageOwner(OTHER_ACCOUNT)
      .then(function () {
        return rootColony.eternalStorageRoot.call();
      })
      .then(function (storageAddress) {
        const eternalStorage = Ownable.at(storageAddress);
        return eternalStorage.owner.call();
      })
      .then(function (owner) {
        assert.equal(owner, OTHER_ACCOUNT, 'Was not able to change the owner of the EternalStorage in RootColony');
      })
      .then(done)
      .catch(done);
    });

    it('should NOT be able to move EternalStorage to another RootColony if called with invalid address', function (done) {
     rootColony.changeEternalStorageOwner(0x0, {
       from: MAIN_ACCOUNT,
       gas: 3e6,
     })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (tx) {
        testHelper.checkAllGasSpent(3e6, tx);
      })
      .then(done)
      .catch(done);
    });
  });
});
