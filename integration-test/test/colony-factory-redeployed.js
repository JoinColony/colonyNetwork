// These globals are added by Truffle:
/* globals RootColony, RootColonyResolver, ColonyFactory, FakeNewColonyFactory, FakeUpdatedColony, EternalStorage */
import testHelper from '../../helpers/test-helper';

contract('ColonyFactory', function (accounts) {
  const MAIN_ACCOUNT = accounts[0];
  const COLONY_KEY = 'COLONY_TEST';
  const NEW_COLONY_KEY = 'NEW_COLONY_TEST';
  let colonyFactory;
  let colonyFactoryNew;
  let rootColony;
  let rootColonyResolver;
  let eternalStorageRoot;

  before(function (done) {
    rootColony = RootColony.deployed();
    rootColonyResolver = RootColonyResolver.deployed();
    colonyFactory = ColonyFactory.deployed();

    rootColonyResolver.registerRootColony(rootColony.address)
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
        return rootColony.createColony(NEW_COLONY_KEY, { from: MAIN_ACCOUNT });
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
  });
});
