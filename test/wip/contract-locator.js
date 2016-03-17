/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, ContractLocator, web3, assert */

contract('ContractLocator', function (accounts) {
  var _MAIN_ACCOUNT_ = accounts[0];
  var _TEST_CONTRACT_         = 'TEST_CONTRACT';
  var _TEST_CONTRACT_ADDRESS_ = accounts[0];
  var _NEW_TEST_CONTRACT_ADDRESS_ = accounts[1];
  var contractLocator;
  var itFailed = false;

  function ifUsingTestRPC(err){ // eslint-disable-line no-unused-vars

    return;
  }

  beforeEach(function (done) {
    itFailed = false;
    ContractLocator.new()
    .then(function (contract) {
      contractLocator = contract;
    })
    .then(done)
    .catch(done);
  });

  describe('when registering a new contract', function () {
    it('should add a new entry for a new contract key', function (done) {
      contractLocator.register(_TEST_CONTRACT_, _TEST_CONTRACT_ADDRESS_, _MAIN_ACCOUNT_, 0, 0, 1)
      .then(function () {
        return contractLocator.resolve(_TEST_CONTRACT_);
      })
      .then(function (args) {
        assert.equal(args, _TEST_CONTRACT_ADDRESS_, 'contract address is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the contract key already exists', function (done) {
      contractLocator.register(_TEST_CONTRACT_, _TEST_CONTRACT_ADDRESS_, _MAIN_ACCOUNT_, 0, 0, 1)
      .then(function () {
        return contractLocator.register(_TEST_CONTRACT_, _TEST_CONTRACT_ADDRESS_, _MAIN_ACCOUNT_, 0, 0, 1);
      })
      .catch(function () {
        itFailed = true;
      })
      .then(function() {
        assert.isTrue(itFailed, 'registration did not fail');
      })
      .then(done)
      .catch(done);
    });

    it('should fail when ETH is sent', function (done) {
      contractLocator.register(_TEST_CONTRACT_, _TEST_CONTRACT_ADDRESS_, _MAIN_ACCOUNT_, 0, 0, 1, {value: 100})
      .catch(function () {
        itFailed = true;
      })
      .then(function() {
        assert.isTrue(itFailed, 'did not fail when ETH was sent');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the contract key is empty', function (done) {
      contractLocator.register('', _TEST_CONTRACT_ADDRESS_, _MAIN_ACCOUNT_, 0, 0, 1)
      .catch(function () {
        itFailed = true;
      })
      .then(function() {
        assert.isTrue(itFailed, 'registration didnt fail with an empty key');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the contract address is invalid', function (done) {
      contractLocator.register(_TEST_CONTRACT_, 0x0, _MAIN_ACCOUNT_, 0, 0, 1)
      .catch(function () {
        itFailed = true;
      })
      .then(function() {
        assert.isTrue(itFailed, 'registration didnt fail with an invalid address');
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when retrieving contract address', function () {
    it('should return contract record address for an existing key', function (done) {
      contractLocator.register(_TEST_CONTRACT_, _TEST_CONTRACT_ADDRESS_, _MAIN_ACCOUNT_, 0, 0, 1)
      .then(function () {
        return contractLocator.resolve(_TEST_CONTRACT_);
      })
      .then(function (args) {
        assert.equal(args, _TEST_CONTRACT_ADDRESS_, 'contract address is incorrect');
        done();
      })
      .catch(done);
    });

    it('should not fail for an non existing key', function (done) {
      contractLocator.register(_TEST_CONTRACT_, _TEST_CONTRACT_ADDRESS_, _MAIN_ACCOUNT_, 0, 0, 1)
      .then(function () {
        return contractLocator.resolve('FAKE_CONTRACT_KEY');
      })
      .catch(function() {
        itFailed = true;
      })
      .then(function() {
        assert.isFalse(itFailed, 'did throw for a non-existing key');
      })
      .then(done)
      .catch(done);
    });

    it('should fail for an empty key', function (done) {
      contractLocator.resolve('')
      .catch(function () {
        itFailed = true;
      })
      .then(function() {
        assert.isTrue(itFailed, 'didnt throw with an empty key');
      })
      .then(done)
      .catch(done);
    });


    it('should fail when ETH is sent', function (done) {
      contractLocator.register(_TEST_CONTRACT_, _TEST_CONTRACT_ADDRESS_, _MAIN_ACCOUNT_, 0, 0, 1)
      .then(function () {
        return contractLocator.resolve(_TEST_CONTRACT_, {value: 100});
      })
      .catch(function() {
        itFailed = true;
      })
      .then(function() {
        assert.isTrue(itFailed, 'didnt throw when ETH was sent');
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when updating contract record', function () {
    it('should update the entry for an existing contract key', function (done) {
      contractLocator.register(_TEST_CONTRACT_, _TEST_CONTRACT_ADDRESS_, _MAIN_ACCOUNT_, 0, 0, 1)
      .then(function(){
        return contractLocator.getContractInfo(_TEST_CONTRACT_);
      })
      .then(function(args) {
        assert.equal(args[0], _TEST_CONTRACT_ADDRESS_, 'contract address is incorrect');
        assert.equal(args[1], _MAIN_ACCOUNT_, 'owner address is incorrect');
        assert.isTrue((args[3]).toNumber() > 0, 'contract creation date is incorrect');
        assert.isTrue((args[4]).toNumber() > 0, 'contract last modified date incorrect');
        assert.isTrue((args[5]).toNumber() >= 0, 'major version is invalid');
        assert.isTrue((args[6]).toNumber() >= 0, 'minor version is invalid');
        assert.isTrue((args[7]).toNumber() >= 0, 'patch version is invalid');
        return contractLocator.update(_TEST_CONTRACT_, _NEW_TEST_CONTRACT_ADDRESS_, _MAIN_ACCOUNT_, 0, 0, 1);
      })
      .then(function () {
        return contractLocator.resolve(_TEST_CONTRACT_);
      })
      .then(function (_updatedAddress) {
        assert.equal(_updatedAddress, _NEW_TEST_CONTRACT_ADDRESS_, 'contract address is incorrect');
        return contractLocator.getContractInfo(_TEST_CONTRACT_);
      })
      .then(function(args) {
        assert.equal(args[0], _NEW_TEST_CONTRACT_ADDRESS_, 'contract address is incorrect');
        assert.equal(args[1], _MAIN_ACCOUNT_, 'owner address is incorrect');
        assert.isTrue((args[3]).toNumber() > 0, 'contract creation date is incorrect');
        assert.isTrue((args[4]).toNumber() > 0, 'contract last modified date incorrect');
        assert.isTrue((args[5]).toNumber() >= 0, 'major version is invalid');
        assert.isTrue((args[6]).toNumber() >= 0, 'minor version is invalid');
        assert.isTrue((args[7]).toNumber() >= 0, 'patch version is invalid');
        done();
      })
      .catch(done);
    });

    it('should register a new address if the contract key wasnt registered yet', function (done) {
      contractLocator.update(_TEST_CONTRACT_, _TEST_CONTRACT_ADDRESS_, _MAIN_ACCOUNT_, 0, 0, 1)
      .then(function () {
        return contractLocator.resolve(_TEST_CONTRACT_);
      })
      .then(function (args) {
        assert.equal(args, _TEST_CONTRACT_ADDRESS_, 'contract address is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the contract key is empty', function (done) {
      contractLocator.update('', _TEST_CONTRACT_ADDRESS_, _MAIN_ACCOUNT_, 0, 0, 1)
      .catch(function () {
        itFailed = true;
      })
      .then(function() {
        assert.isTrue(itFailed, 'update didnt fail with an empty key');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the contract address is invalid', function (done) {
      contractLocator.update(_TEST_CONTRACT_, 0x0, _MAIN_ACCOUNT_, 0, 0, 1)
      .catch(function () {
        itFailed = true;
      })
      .then(function() {
        assert.isTrue(itFailed, 'update didnt fail with an invalid address');
      })
      .then(done)
      .catch(done);
    });

    it('should fail when ETH is sent', function (done) {
      contractLocator.update(_TEST_CONTRACT_, _TEST_CONTRACT_ADDRESS_, _MAIN_ACCOUNT_, 0, 0, 1, {value: 100})
      .catch(function () {
        itFailed = true;
      })
      .then(function() {
        assert.isTrue(itFailed, 'did not fail when ETH is sent');
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when removing a contract record', function () {
    it('should remove address from contracts catalog', function (done) {
      contractLocator.register(_TEST_CONTRACT_, _TEST_CONTRACT_ADDRESS_, _MAIN_ACCOUNT_, 0, 0, 1)
      .then(function () {
        return contractLocator.resolve(_TEST_CONTRACT_);
      })
      .then(function () {
        return contractLocator.unregister(_TEST_CONTRACT_);
      })
      .then(function () {
        return contractLocator.resolve(_TEST_CONTRACT_);
      })
      .then(function(address){
        assert.isTrue(web3.isAddress(address), 'address is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should fail for an non existing key', function (done) {
      contractLocator.unregister(_TEST_CONTRACT_)
      .catch(function () {
        itFailed = true;
      })
      .then(function() {
        assert.isTrue(itFailed, 'didnt throw with an non-existing key');
      })
      .then(done)
      .catch(done);
    });

    it('should fail for an empty key', function (done) {
      contractLocator.unregister('')
      .catch(function () {
        itFailed = true;
      })
      .then(function() {
        assert.isTrue(itFailed, 'didnt throw with an empty key');
      })
      .then(done)
      .catch(done);
    });

    it('should fail when ETH is sent', function (done) {
      contractLocator.register(_TEST_CONTRACT_, _TEST_CONTRACT_ADDRESS_, _MAIN_ACCOUNT_, 0, 0, 1)
      .then(function () {
        return contractLocator.resolve(_TEST_CONTRACT_);
      })
      .then(function () {
        return contractLocator.unregister(_TEST_CONTRACT_, {value: 100});
      })
      .catch(function(){
        itFailed = true;
      })
      .then(function() {
        assert.isTrue(itFailed, 'did not fail when ETH was sent');
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when retrieving contract info', function () {
    it('should return info for an existing key', function (done) {
      contractLocator.register(_TEST_CONTRACT_, _TEST_CONTRACT_ADDRESS_, _MAIN_ACCOUNT_, 0, 0, 1)
      .then(function () {
        return contractLocator.getContractInfo(_TEST_CONTRACT_);
      })
      .then(function (args) {
        assert.equal(args[0], _TEST_CONTRACT_ADDRESS_, 'contract address is incorrect');
        assert.equal(args[1], _MAIN_ACCOUNT_, 'owner address is incorrect');
        assert.isTrue((args[3]).toNumber() > 0, 'contract creation date is incorrect');
        assert.isTrue((args[4]).toNumber() > 0, 'contract last modified date incorrect');
        assert.isTrue((args[5]).toNumber() >= 0, 'major version is invalid');
        assert.isTrue((args[6]).toNumber() >= 0, 'minor version is invalid');
        assert.isTrue((args[7]).toNumber() >= 0, 'patch version is invalid');
      })
      .then(done)
      .catch(done);
    });

    it('should fail for an non existing key', function (done) {

      contractLocator.getContractInfo('FAKE_CONTRACT_KEY')
      .catch(function() {
        itFailed = true;
        assert.isTrue(true, 'didnt throw with an non-existing key');
      })
      .then(done)
      .catch(done);
    });

    it('should fail for an empty key', function (done) {
      contractLocator.getContractInfo('')
      .catch(function () {
        itFailed = true;
      })
      .then(function() {
        assert.isTrue(itFailed, 'didnt throw with an empty key');
      })
      .then(done)
      .catch(done);
    });

    it('should fail when ETH is sent', function (done) {
      contractLocator.register(_TEST_CONTRACT_, _TEST_CONTRACT_ADDRESS_, _MAIN_ACCOUNT_, 0, 0, 1)
      .then(function () {
        return contractLocator.getContractInfo(_TEST_CONTRACT_, {value: 100});
      })
      .catch(function () {
        itFailed = true;
      })
      .then(function(){
        assert.isTrue(itFailed, 'did not fail when ETH was sent');
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when handling reference counting', function () {
    it('should increase reference counting for an existing key', function (done) {
      contractLocator.register(_TEST_CONTRACT_, _TEST_CONTRACT_ADDRESS_, _MAIN_ACCOUNT_, 0, 0, 1)
      .then(function () {
        return contractLocator.use(_TEST_CONTRACT_);
      })
      .then(function () {
        return contractLocator.use(_TEST_CONTRACT_);
      })
      .then(function () {
        return contractLocator.use(_TEST_CONTRACT_);
      })
      .then(function () {
        return contractLocator.getReferenceCount.call(_TEST_CONTRACT_);
      })
      .then(function (args) {
        assert.equal(args.toNumber(), 3, 'reference count is wrong');
      })
      .then(done)
      .catch(done);
    });

    it('should decrease reference counting by one after calling release for a contract in use', function (done) {
      contractLocator.register(_TEST_CONTRACT_, _TEST_CONTRACT_ADDRESS_, _MAIN_ACCOUNT_, 0, 0, 1)
      .then(function () {
        return contractLocator.use(_TEST_CONTRACT_);
      })
      .then(function () {
        return contractLocator.use(_TEST_CONTRACT_);
      })
      .then(function () {
        return contractLocator.use(_TEST_CONTRACT_);
      })
      .then(function () {
        return contractLocator.release(_TEST_CONTRACT_);
      })
      .then(function () {
        return contractLocator.getReferenceCount.call(_TEST_CONTRACT_);
      })
      .then(function (args) {
        assert.equal(args.toNumber(), 2, 'reference count is wrong');
      })
      .then(done)
      .catch(done);
    });

    it('should fail to increase reference count for a contract not registered', function (done) {
      contractLocator.use(_TEST_CONTRACT_)
      .catch(function () {
        itFailed = true;
      })
      .then(function () {
        assert.isTrue(itFailed, 'did not fail when contract doesnt exists');
      })
      .then(done)
      .catch(done);
    });

    it('should fail when trying to release a contract not registered', function (done) {
      contractLocator.release(_TEST_CONTRACT_)
      .catch(function () {
        itFailed = true;
      })
      .then(function () {
        assert.isTrue(itFailed, 'did not fail when contract doesnt exists');
      })
      .then(done)
      .catch(done);
    });

    it('should fail when trying to release a contract not being used', function (done) {
      contractLocator.register(_TEST_CONTRACT_, _TEST_CONTRACT_ADDRESS_, _MAIN_ACCOUNT_, 0, 0, 1)
      .then(function () {
        return contractLocator.getReferenceCount.call(_TEST_CONTRACT_);
      })
      .then(function (args) {
        assert.equal(args.toNumber(), 0, 'reference count is incorrect');
      })
      .then(function(){
        return contractLocator.release(_TEST_CONTRACT_);
      })
      .catch(function () {
        itFailed = true;
      })
      .then(function () {
        assert.isTrue(itFailed, 'did not fail when contract doesnt exists');
      })
      .then(done)
      .catch(done);
    });

    it('should fail with an empty key', function (done) {
      contractLocator.use('')
      .catch(function () {
        itFailed = true;
      })
      .then(function () {
        assert.isTrue(itFailed, 'did not fail with an empty key');
      })
      .then(done)
      .catch(done);
    });

    it('should fail when ETH is sent', function (done) {
      contractLocator.use(_TEST_CONTRACT_, {value: 1})
      .catch(function () {
        itFailed = true;
      })
      .then(function () {
        assert.isTrue(itFailed, 'did not fail when ETH was sent');
      })
      .then(done)
      .catch(done);
    });
  });
});
