/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, RootColony, ContractLocator, ColonyFactory, Colony, assert */

contract('RootColony', function (accounts) {
  var _MAIN_ACCOUNT_ = accounts[0];
  var _OTHER_ACCOUNT_ = accounts[1];
  var _COLONY_KEY_ = 'TEST_COLONY';

  var rootColony;
  var contractLocator;

  before(function(done){

    ContractLocator.new()
    .then(function (_locator) {
      console.log(`locator: [ ${_locator.address} ]`);
      contractLocator = _locator;
      return ColonyFactory.new(contractLocator.address);
    })
    .then(function (_colonyFactory) {
      console.log(`colony factory: [ ${_colonyFactory.address} ]`);
    })
    .then(done)
    .catch(done);
  });

  it('deployed user should be admin', function (done) {
    var rootColony = RootColony.deployed();
    rootColony.owner.call(_MAIN_ACCOUNT_)
    .then(function (owner) {
      assert.equal(owner, _MAIN_ACCOUNT_, 'First user isn\'t an admin');
    })
    .then(done)
    .catch(done);
  });

  it('the root network should allow users to create new colonies', function (done) {
    RootColony.new(contractLocator.address)
    .then(function(_rootColony){
      console.log(`root colony address: [ ${_rootColony.address} ]`);
      rootColony = _rootColony;
      return rootColony.createColony(_COLONY_KEY_, {from: _OTHER_ACCOUNT_});
    })
    .then(function (tx) {
      console.log('New colony transaction hash is: ', tx);
      return contractLocator.resolve(_COLONY_KEY_);
    })
    .then(function (address) {
      console.log('Colony address is: ', '[ ', address, ' ]');
      return rootColony.getColony(_COLONY_KEY_);
    })
    .then(function(address){
      let colony = Colony.at(address);
      return colony.getUserInfo.call(_OTHER_ACCOUNT_);
    })
    .then(function(isAdmin){
      assert.isTrue(isAdmin, 'admin user is incorrect');
    })
    .then(done)
    .catch(done);
  });
});
