/* globals artifacts */
import testHelper from '../../helpers/test-helper';

const RootColony = artifacts.require('RootColony');
const IColony = artifacts.require('IColony');
const RootColonyResolver = artifacts.require('RootColonyResolver');
const ColonyFactory = artifacts.require('ColonyFactory');
const FakeNewColonyFactory = artifacts.require('FakeNewColonyFactory');
const FakeUpdatedColony = artifacts.require('FakeUpdatedColony');
const EternalStorage = artifacts.require('EternalStorage');

contract('ColonyFactory', function () {
  const COLONY_KEY = 'COLONY_TEST';
  const NEW_COLONY_KEY = 'NEW_COLONY_TEST';
  let colonyFactory;
  let colonyFactoryNew;
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
      return ColonyFactory.deployed();
    })
    .then(function (_colonyFactory) {
      colonyFactory = _colonyFactory;
      return rootColonyResolver.registerRootColony(rootColony.address);
    })
    .then(function () {
      return rootColony.registerColonyFactory(colonyFactory.address);
    })
    .then(function () {
      return colonyFactory.registerRootColonyResolver(rootColonyResolver.address);
    })
    .then(function () {
      return EternalStorage.new();
    })
    .then(function (eternalStorageRoot_) {
      eternalStorageRoot = eternalStorageRoot_;
      return eternalStorageRoot.changeOwner(rootColony.address);
    })
    .then(function () {
      return rootColony.registerEternalStorage(eternalStorageRoot.address);
    })
    .then(function () {
      return rootColony.createColony(COLONY_KEY);
    })
    .then(function () {
      return rootColony.countColonies.call();
    })
    .then(function (count) {
      assert.equal(1, count.toNumber(), 'There should be 1 colony in the network.');
      return FakeNewColonyFactory.new();
    })
    .then(function (contract) {
      colonyFactoryNew = contract;
    })
    .then(done)
    .catch(done);
  });

  beforeEach(function (done) {
    testHelper.waitAll([
      rootColony.registerColonyFactory(colonyFactoryNew.address),
      rootColony.registerEternalStorage(eternalStorageRoot.address),
    ], function () {
      colonyFactoryNew.registerRootColonyResolver(rootColonyResolver.address)
      .then(function () {
        done();
      }).catch(done);
    });
  });

  describe('when redeploying colony factory and colony contracts', function () {
    it('should adopt the existing EternalStorage and use upgraded Colony contract', function (done) {
      rootColony.colonyFactory.call()
      .then(function (colonyFactoryAddress) {
        assert.equal(colonyFactoryAddress, colonyFactoryNew.address, 'ColonyFactoryAddress on RootColony is not updated.');
        return rootColony.createColony(NEW_COLONY_KEY);
      })
      .then(function () {
        return rootColony.getColony.call(NEW_COLONY_KEY);
      })
      .then(function (colonyAddress) {
        const colony = FakeUpdatedColony.at(colonyAddress);
        return colony.isUpdated.call();
      })
      .then(function (isUpdated) {
        assert.equal(true, isUpdated, 'Colony was not updated together with ColonyFactory update');
      })
      .then(done)
      .catch(done);
    });

    it('should report the correct updated version on Colony contract', function (done) {
      let oldColonyVersion;
      let updatedVersion;

      rootColony.getColony.call(COLONY_KEY)
      .then(function (_address) {
        return IColony.at(_address).version();
      })
      .then(function (_version) {
        oldColonyVersion = _version.toNumber();
        return rootColony.upgradeColony(COLONY_KEY);
      })
      .then(function () {
        return rootColony.getColony.call(COLONY_KEY);
      })
      .then(function (_address) {
        return IColony.at(_address).version();
      })
      .then(function (_version) {
        updatedVersion = _version.toNumber();
        return rootColony.getLatestColonyVersion.call();
      })
      .then(function (latestVersion) {
        latestVersion = latestVersion.toNumber();
        assert.notEqual(oldColonyVersion, latestVersion);
        assert.equal(latestVersion, updatedVersion);
      })
      .then(done)
      .catch(done);
    });
  });
});
