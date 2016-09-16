// These globals are added by Truffle:
/* globals RootColony, Colony, RootColonyResolver, EternalStorage, ColonyFactory */
import { solSha3 } from 'colony-utils';
import testHelper from '../../helpers/test-helper';

contract('Colony', function (accounts) {
  const COLONY_KEY = 'COLONY_TEST';
  const MAIN_ACCOUNT = accounts[0];
  const GAS_PRICE = 20e9;
  // this value must be high enough to certify that the failure was not due to the amount of gas but due to a exception being thrown
  const GAS_TO_SPEND = 4700000;

  let colony;
  let colonyFactory;
  let rootColony;
  let rootColonyResolver;
  let eternalStorageRoot;

  before(function (done) {
    colonyFactory = ColonyFactory.deployed();
    rootColony = RootColony.deployed();
    rootColonyResolver = RootColonyResolver.deployed();

    testHelper.waitAll([
      rootColonyResolver.registerRootColony(rootColony.address),
      colonyFactory.registerRootColonyResolver(rootColonyResolver.address),
      rootColony.registerColonyFactory(colonyFactory.address),
    ], function () {
      done();
    });
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
      let prevBalance;
      rootColony.createColony(COLONY_KEY)
      .then(function () {
        return rootColony.getColony.call(COLONY_KEY);
      })
      .then(function (_address) {
        colony = Colony.at(_address);
        prevBalance = web3.eth.getBalance(MAIN_ACCOUNT);
        return colony.upgrade(accounts[1], { gasPrice: GAS_PRICE, gas: GAS_TO_SPEND });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function () {
        testHelper.checkAllGasSpent(GAS_TO_SPEND, GAS_PRICE, MAIN_ACCOUNT, prevBalance);
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
        return colony.contributeEthToTask(0, { from: MAIN_ACCOUNT, value: 100 });
      })
      .then(function () {
        return colony.contributeTokensWeiFromPool(0, 20, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        const colonyBalance = web3.eth.getBalance(colony.address);
        assert.equal(colonyBalance.toNumber(), 100, 'Colony balance is incorrect');
      })
      .then(function () {
        return colony.addUserToRole('0x3cb0256160e49638e9aaa6c9df7f7c87d547c778', 0, { from: MAIN_ACCOUNT });
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
        return colony.updateTask(0, 'nameedit', 'summaryedit');
      })
      .then(function () {
        return eternalStorage.getStringValue.call(solSha3('task_name', 0));
      })
      .then(function (name) {
        assert.equal(name, 'nameedit', 'Incorrect task name');
        return eternalStorage.getStringValue.call(solSha3('task_summary', 0));
      })
      .then(function (_summary) {
        assert.equal(_summary, 'summaryedit', 'Wrong task summary');
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
