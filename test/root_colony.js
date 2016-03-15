/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, RootColony, Colony, assert */

contract('RootColony', function (accounts) {

  it('deployed user should be admin', function (done) {
    var rootColony = RootColony.deployed();
    rootColony.owner.call(accounts[0])
      .then(function (owner) {
        assert.equal(owner, accounts[0], 'First user isn\'t an admin');
      })
      .then(done)
      .catch(done);
  });

  it('the root network should allow users to create new colonies', function (done) {
    var rootColony, newColony;
    var mainaccount = accounts[0];
    var otheraccount = accounts[1];

    RootColony.new({
        from: mainaccount
      })
      .then(function (instance) {
        rootColony = instance;
        return rootColony.createColony({
          from: otheraccount
        });
      })
      .then(function (tx) {
        console.log('New Colony transaction hash is: ', tx);
        return rootColony.getColony(0);
      })
      .then(function (address) {
        console.log('Colony address is: ', address);
        newColony = Colony.at(address);
        return newColony;
      })
      .then(function (newColony) {
        return newColony.getUserInfo.call(otheraccount);
      })
      .then(function (isAdmin) {
        assert.equal(isAdmin, true, 'First user isn\'t an admin');
      })
      .then(done)
      .catch(done);
  });
});
