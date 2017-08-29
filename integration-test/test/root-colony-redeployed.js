/* globals artifacts */

const ColonyNetwork = artifacts.require('ColonyNetwork');
const RootColonyResolver = artifacts.require('RootColonyResolver');
const ColonyFactory = artifacts.require('ColonyFactory');
const EternalStorage = artifacts.require('EternalStorage');
const Colony = artifacts.require('Colony');
const FakeNewRootColony = artifacts.require('FakeNewRootColony');

contract('ColonyNetwork', function () {
  const COLONY_KEY = 'COLONY_TEST';
  const NEW_COLONY_KEY = 'NEW_COLONY_TEST';
  let colonyFactory;
  let rootColony;
  let rootColonyNew;
  let rootColonyResolver;
  let eternalStorageRoot;

  before(function (done) {
    ColonyNetwork.deployed()
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
    })
    .then(done);
  });

  // Instantiate and register the new ColonyNetwork contract
  beforeEach(function (done) {
    EternalStorage.new()
    .then(function (contract) {
      eternalStorageRoot = contract;
    })
    .then(function () {
      return colonyFactory.registerRootColonyResolver(rootColonyResolver.address);
    })
    .then(function () {
      return rootColonyResolver.registerRootColony(rootColony.address);
    })
    .then(function () {
      return rootColony.registerColonyFactory(colonyFactory.address);
    })
    .then(function () {
      return eternalStorageRoot.changeOwner(rootColony.address);
    })
    .then(function () {
      return rootColony.registerEternalStorage(eternalStorageRoot.address);
    })
    .then(function () {
      return rootColony.createColony(COLONY_KEY);
    })
    .then(function () {
      return FakeNewRootColony.new();
    })
    .then(function (newRootContract) {
      rootColonyNew = newRootContract;
      return rootColonyResolver.registerRootColony(rootColonyNew.address);
    })
    .then(function () {
      return rootColonyNew.registerColonyFactory(colonyFactory.address);
    })
    .then(function () {
      return rootColony.changeEternalStorageOwner(rootColonyNew.address);
    })
    .then(function () {
      return rootColonyNew.registerEternalStorage(eternalStorageRoot.address);
    })
    .then(function () {
      done();
    })
    .catch(done);
  });

  describe('when redeploying root colony contract', function () {
    it('should update ColonyNetwork address at RootColonyResolver', function (done) {
      rootColonyNew.colonyFactory.call()
      .then(function (_newColonyFactoryAddress) {
        assert.equal(colonyFactory.address, _newColonyFactoryAddress, 'FakeNewRootColony factory was not updated');
        return rootColonyNew.createColony(NEW_COLONY_KEY);
      })
      .then(function () {
        return rootColonyNew.getColony.call(NEW_COLONY_KEY);
      })
      .then(function (_address) {
        const colonyNew = Colony.at(_address);
        return colonyNew.rootColonyResolver.call();
      })
      .then(function (_rootColonyResolverAddress) {
        return RootColonyResolver.at(_rootColonyResolverAddress).rootColonyAddress.call();
      })
      .then(function (rootColonyAddress_) {
        assert.equal(rootColonyAddress_, rootColonyNew.address, 'Root colony address is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should be able to replace existing Colony\'s ColonyNetwork address at RootColonyResolver', function (done) {
      rootColonyNew.getColony.call(COLONY_KEY)
      .then(function (colonyAddress) {
        const oldColony = Colony.at(colonyAddress);
        return oldColony.rootColonyResolver.call();
      })
      .then(function (_rootColonyResolverAddress) {
        return RootColonyResolver.at(_rootColonyResolverAddress).rootColonyAddress.call();
      })
      .then(function (rootColonyAddress_) {
        assert.equal(rootColonyAddress_, rootColonyNew.address, 'Root colony address is incorrect');
      })
      .then(done)
      .catch(done);
    });
  });
});
