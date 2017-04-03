/* globals artifacts */
import { solSha3 } from 'colony-utils';
import testHelper from '../../helpers/test-helper';

const RootColony = artifacts.require('RootColony');
const RootColonyResolver = artifacts.require('RootColonyResolver');
const ColonyFactory = artifacts.require('ColonyFactory');
const EternalStorage = artifacts.require('EternalStorage');
const Colony = artifacts.require('Colony');

contract('Colony', function (accounts) {
  const COLONY_KEY = 'COLONY_TEST';
  const GAS_TO_SPEND = 4700000;

  let colony;
  let colonyFactory;
  let rootColony;
  let rootColonyResolver;
  let eternalStorageRoot;

  before(function (done) {
    RootColony.deployed()
    .then(function (_rootColony) {
      rootColony = _rootColony;
      return RootColonyResolver.deployed();
    })
    .then(function (_rootColonyResolver) {
      rootColonyResolver = _rootColonyResolver;
      return rootColonyResolver.registerRootColony(rootColony.address);
    })
    .then(function () {
      return ColonyFactory.deployed();
    })
    .then(function (_colonyFactory) {
      colonyFactory = _colonyFactory;
      return colonyFactory.registerRootColonyResolver(rootColonyResolver.address);
    })
    .then(function () {
      rootColony.registerColonyFactory(colonyFactory.address);
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

  describe('when upgrading a colony', function () {
    it('should not allow admins to call upgrade on their colony directly', function (done) {
      rootColony.createColony(COLONY_KEY)
      .then(function () {
        return rootColony.getColony.call(COLONY_KEY);
      })
      .then(function (_address) {
        colony = Colony.at(_address);
        return colony.upgrade(accounts[1], { gas: GAS_TO_SPEND });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function (txid) {
        testHelper.checkAllGasSpent(GAS_TO_SPEND, txid);
      })
      .then(done)
      .catch(done);
    });

    it('should carry colony dependencies to the new colony', function (done) {
      let oldColonyAddress;
      let eternalStorage;
      rootColony.createColony(COLONY_KEY)
      .then(function () {
        return rootColony.getColony.call(COLONY_KEY);
      })
      .then(function (_address) {
        oldColonyAddress = _address;
        colony = Colony.at(_address);
        return colony.generateTokensWei(100);
      })
      .then(function () {
        return colony.makeTask('name', 'summary');
      })
      .then(function () {
        return colony.contributeEthToTask(0, { value: 100 });
      })
      .then(function () {
        return colony.setReservedTokensWeiForTask(0, 20);
      })
      .then(function () {
        const colonyBalance = web3.eth.getBalance(colony.address);
        assert.equal(colonyBalance.toNumber(), 100, 'Colony balance is incorrect');
      })
      .then(function () {
        return colony.addUserToRole('0x3cb0256160e49638e9aaa6c9df7f7c87d547c778', 0);
      })
      .then(function () {
        return rootColony.upgradeColony(COLONY_KEY);
      })
      .then(function () {
        return rootColony.getColony.call(COLONY_KEY);
      })
      .then(function (upgradedColonyAddress) {
        assert.notEqual(oldColonyAddress, upgradedColonyAddress);
        colony = Colony.at(upgradedColonyAddress);
        return colony.eternalStorage.call();
      })
      .then(function (etStorageAddress) {
        eternalStorage = EternalStorage.at(etStorageAddress);
      })
      .then(function () {
        return eternalStorage.getStringValue.call(solSha3('task_name', 0));
      })
      .then(function (name) {
        assert.equal(name, 'name', 'Incorrect task name');
        return eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      })
      .then(function (_summary) {
        assert.equal(_summary, 'summary', 'Wrong task summary');
        return eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      })
      .then(function (_accepted) {
        assert.equal(_accepted, false, 'Wrong accepted value');
        return eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      })
      .then(function (_eth) {
        assert.equal(_eth.toNumber(), 100, 'Wrong task ether value');
        return eternalStorage.getUIntValue.call(solSha3('task_tokensWei', 0));
      })
      .then(function (_tokensWei) {
        assert.equal(_tokensWei.toNumber(), 20, 'Wrong tokens wei value');
        return colony.updateTaskTitle(0, 'nameedit');
      })
      .then(function () {
        return eternalStorage.getStringValue.call(solSha3('task_name', 0));
      })
      .then(function (name) {
        assert.equal(name, 'nameedit', 'Incorrect task name');
        return eternalStorage.getBooleanValue.call(solSha3('task_accepted', 0));
      })
      .then(function (_accepted) {
        assert.equal(_accepted, false, 'Wrong accepted value');
        return eternalStorage.getUIntValue.call(solSha3('task_eth', 0));
      })
      .then(function (_eth) {
        assert.equal(_eth.toNumber(), 100, 'Wrong task ether value');
        return colony.reservedTokensWei();
      })
      .then(function (tokens) {
        assert.equal(tokens.toNumber(), 20, 'Incorrect amount of reserved tokens');
        return colony.userIsInRole.call('0x3cb0256160e49638e9aaa6c9df7f7c87d547c778', 0);
      })
      .then(function (userInfo) {
        assert.equal(userInfo, true, 'User added as admin is no longer admin');
        return colony.balanceOf.call(colony.address);
      })
      .then(function (colonyTokenBalance) {
        assert.equal(colonyTokenBalance.toNumber(), 100, 'Colony token balance is incorrect');
        const colonyBalance = web3.eth.getBalance(colony.address);
        assert.equal(colonyBalance.toNumber(), 100, 'Colony balance is incorrect');
      })
      .then(done)
      .catch(done);
    });
  });
});
