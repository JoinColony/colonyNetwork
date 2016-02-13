'use strict';
/* globals ColonyToken, web3 */

contract('ColonyToken', function(accounts) {

  var _MAIN_ACCOUNT_ = accounts[0];
  var _OTHER_ACCOUNT_ = accounts[1];
  var colonyToken;

  beforeEach(function(done){
    ColonyToken.new(1000, 1000, 'CNY', 'COLONY', { from : _MAIN_ACCOUNT_ , value: 1000})
    .then(function(contract){
      colonyToken = contract;
      done();
    });
  });

  describe('when created', function(){

    it('should have an initial ETH balance of 1000', function() {
      var initialBalance = web3.eth.getBalance(colonyToken.address).toNumber();
      assert.equal(initialBalance, 1000, 'initial balance is incorrect');
    });

    it('should have an initial supply', function(done) {
      colonyToken.totalSupply.call()
      .then(function(total_supply){
        assert.equal(total_supply, 1000, 'initial supply is different from  1000');
        done();
      })
      .catch(done);
    });

    it('should have an owner initial supply', function(done) {
      colonyToken.balanceOf.call(_MAIN_ACCOUNT_)
      .then(function(owner_initial_supply){
        assert.equal(owner_initial_supply, 1000, 'owner initial supply is different from  1000');
        done();
      })
      .catch(done);
    });

    it('should have an owner', function(done) {
      colonyToken.owner.call()
      .then(function(owner){
        assert.equal(_MAIN_ACCOUNT_, owner, 'owner does not match');
        done();
      })
      .catch(done);
    });

    it('should have a symbol', function(done) {
      colonyToken.symbol.call()
      .then(function(symbol){
        assert.equal('CNY', symbol, 'symbol does not match');
        done();
      })
      .catch(done);
    });

    it('should have a name', function(done) {
      colonyToken.name.call()
      .then(function(name){
        assert.equal('COLONY', name, 'name does not match');
        done();
      })
      .catch(done);
    });

  });

  describe('when transferring funds directly to third parties', function (){

    it('should sender balance be decreased and receiver balance should increase by the same amount',
    function(done){

      var previousBalance;

      colonyToken.balanceOf.call(_MAIN_ACCOUNT_)
      .then(function(prevBalance){
        previousBalance = prevBalance;
        return colonyToken.transfer(_OTHER_ACCOUNT_, 100);
      })
      .then(function(){
        return colonyToken.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function(balance){
        assert.equal(balance.toNumber(), (previousBalance-100), 'sender balance is incorrect');
        return colonyToken.balanceOf.call(_OTHER_ACCOUNT_);
      })
      .then(function(receiverBalance){
        assert.equal(receiverBalance.toNumber(), 100, 'receiver balance is incorrect');
        done();
      })
      .catch(done);
    });

    it('should fail if the sender does not has funds', function(done){

      var previousBalance;
      var transferenceWithNoFundsFailed;

      colonyToken.balanceOf.call(_MAIN_ACCOUNT_)
      .then(function(prevBalance){

        previousBalance = prevBalance.toNumber();
        return colonyToken.transfer(_OTHER_ACCOUNT_, 100000000000000,
          {from: _MAIN_ACCOUNT_, value: 1000});
      })
      .catch(function(){
        transferenceWithNoFundsFailed = true;
        return colonyToken.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function(balance){
        assert.equal(transferenceWithNoFundsFailed, true, 'transference did not failed');
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the payload is either equal or less than zero (0)', function(done){

      var previousBalance;
      var transferenceWithInvalidValueFailed;

      colonyToken.balanceOf.call(_MAIN_ACCOUNT_)
      .then(function(prevBalance){
        previousBalance = prevBalance.toNumber();
        return colonyToken.transfer(_OTHER_ACCOUNT_, -1, {from: _MAIN_ACCOUNT_, value: 1000});
      })
      .catch(function(){
        transferenceWithInvalidValueFailed = true;
        return colonyToken.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function(balance){
        assert.equal(transferenceWithInvalidValueFailed, true, 'transference did not failed');
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when transferring funds from a party to another', function (){

    it('should modify the balance and allowance', function(done){

      var previousBalance;
      var otherAccountPreviousBalance;
      var previousAllowance;

      colonyToken.approve(_OTHER_ACCOUNT_, 100)
      .then(function(){
        return colonyToken.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function(prevBalance){
        previousBalance = prevBalance;
        return colonyToken.balanceOf.call(_OTHER_ACCOUNT_);
      })
      .then(function(prevBalance){
        otherAccountPreviousBalance = prevBalance;
        return colonyToken.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function(prevAllowance){
        previousAllowance = prevAllowance;
        colonyToken.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, 100);
      })
      .then(function(){
        return colonyToken.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function(balance){
        assert.equal(balance.toNumber(), (previousBalance-100), 'balance is incorrect');
        return colonyToken.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function(allowance){
        assert.equal(allowance.toNumber(), (previousAllowance-100), 'allowance is incorrect');
        return colonyToken.balanceOf.call(_OTHER_ACCOUNT_);
      })
      .then(function(balanceAfterTransference){

        assert.equal(balanceAfterTransference.toNumber(),(otherAccountPreviousBalance+100),
        'transferred value does not match');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the sender does not has funds', function(done){

      var previousBalance;
      var transferenceFromAnotherAddressWithNoFundsFailed;

      colonyToken.approve(_OTHER_ACCOUNT_, 100000000)
      .then(function(){
        return colonyToken.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function(prevBalance){
        previousBalance = prevBalance.toNumber();
        return colonyToken.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, 100000000);
      })
      .catch(function(){
        transferenceFromAnotherAddressWithNoFundsFailed = true;
        return colonyToken.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function(balance){
        assert.equal(transferenceFromAnotherAddressWithNoFundsFailed, true,
          'transference did not failed');
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the sender does not has allowance value enough', function(done){

      var previousBalance;
      var previousAllowance;
      var transferenceFromAnotherAddressWithInvalidValueFailed;

      colonyToken.approve(_OTHER_ACCOUNT_, 100)
      .then(function(){
        return colonyToken.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function(prevAllowance){
        previousAllowance = prevAllowance;
        return colonyToken.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function(prevBalance){
        previousBalance = prevBalance.toNumber();
        return colonyToken.transferFrom(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_, 500);
      })
      .catch(function(){
        transferenceFromAnotherAddressWithInvalidValueFailed = true;
        return colonyToken.balanceOf.call(_MAIN_ACCOUNT_);
      })
      .then(function(balance){
        assert.equal(transferenceFromAnotherAddressWithInvalidValueFailed, true,
          'transference did not failed');
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when approving allowance to a third party', function(){

    it('should allowed value be equal to the approved value', function(done){
      colonyToken.approve(_OTHER_ACCOUNT_, 100)
      .then(function(){
        return colonyToken.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function(allowed){
        assert.equal(allowed.toNumber(), 100, 'amount approved is incorrect.');
        done();
      }).catch(done);
    });

    it('should a sender be able to update the allowed value to another user', function(done){
      colonyToken.approve(_OTHER_ACCOUNT_, 100)
      .then(function(){
        return colonyToken.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function(allowed){
        assert.equal(allowed.toNumber(), 100, 'amount approved is incorrect.');
        return colonyToken.approve(_OTHER_ACCOUNT_, 50);
      })
      .then(function(){
        return colonyToken.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function(allowed){
        assert.equal(allowed.toNumber(), 50, 'amount approved was not updated correctly.');
        done();
      }).catch(done);
    });

    it('should fail when approving a value equal or less than zero', function(done){

      var previousBalance;
      var approvalNotEnoughFundsFailed;

      colonyToken.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_)
      .then(function(prevBalance){
        previousBalance = prevBalance.toNumber();
        return colonyToken.approve(_OTHER_ACCOUNT_, 0);
      })
      .catch(function(){
        approvalNotEnoughFundsFailed = true;
        return colonyToken.allowance.call(_MAIN_ACCOUNT_, _OTHER_ACCOUNT_);
      })
      .then(function(balance){
        assert.equal(approvalNotEnoughFundsFailed, true, 'transference did not failed');
        assert.equal(previousBalance, balance.toNumber(), 'sender balance was modified.');
      })
      .then(done)
      .catch(done);
    });
  });

});
