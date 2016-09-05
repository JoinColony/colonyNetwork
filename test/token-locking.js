/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, RootColony, Colony, EternalStorage, assert, web3 */
var testHelper = require('../helpers/test-helper.js');
import { solSha3 } from 'colony-utils';

contract('TokenLibrary, VotingLibrary and Colony', function (accounts) {
  var _COLONY_KEY_;
  var _MAIN_ACCOUNT_ = accounts[0];
  var _OTHER_ACCOUNT_ = accounts[1];
  var rootColony;
  var colony;
  var eternalStorage;
  var eternalStorageRoot;

  var _POLL_ID_1_ = 1;
  var _POLL_ID_2_ = 2;
  var _VOTE_SECRET_1_;

  before(async function (done) {
    rootColony = RootColony.deployed();
    eternalStorageRoot = EternalStorage.deployed();
    done();
  });

  beforeEach(function (done) {
    _VOTE_SECRET_1_ = solSha3(testHelper.getRandomString(5));

    _COLONY_KEY_ = testHelper.getRandomString(7);

    eternalStorageRoot.owner.call()
      .then(function () {
        rootColony.createColony(_COLONY_KEY_, { from: _MAIN_ACCOUNT_ });
        testHelper.mineTransaction();
      })
      .then(function () {
        return rootColony.getColony.call(_COLONY_KEY_);
      })
      .then(function (colony_) {
        colony = Colony.at(colony_);
        return;
      })
      .then(function () {
        return colony.eternalStorage.call();
      })
      .then(function (extStorageAddress) {
        eternalStorage = EternalStorage.at(extStorageAddress);
        return;
      })
      .then(done)
      .catch(done);
  });

  describe('when sending tokens, after having voted in a poll', function(){
    it('while the poll is still open, should succeed', async function(done){
      try{
        await colony.createPoll('My poll');
        await colony.addPollOption(1, 'Yes');
        await colony.addPollOption(1, 'No');
        await colony.openPoll(1, 1);
        await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});

        // Earn some tokens!
        await colony.generateTokensWei(100);
        await colony.makeTask('name2', 'summary2');
        await colony.contributeTokensWeiFromPool(0, 100);
        await colony.completeAndPayTask(0, _OTHER_ACCOUNT_);

        // Spend some tokens
        await colony.transfer(_MAIN_ACCOUNT_, 50, {from: _OTHER_ACCOUNT_});

        var balanceSender = await colony.balanceOf.call(_OTHER_ACCOUNT_);
        assert.equal(45, balanceSender.toNumber());
        var balanceRecipient = await colony.balanceOf.call(_MAIN_ACCOUNT_);
        assert.equal(50, balanceRecipient);

        done();
      } catch (err) {
        return done(err);
      }
    });

    it('after the poll closes, should fail', async function(done){
      try{
        await colony.createPoll('My poll');
        await colony.addPollOption(1, 'Yes');
        await colony.addPollOption(1, 'No');
        await colony.openPoll(1, 1);
        await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});

        // Earn some tokens!
        await colony.generateTokensWei(100);
        await colony.makeTask('name2', 'summary2');
        await colony.contributeTokensWeiFromPool(0, 100);
        await colony.completeAndPayTask(0, _OTHER_ACCOUNT_);

        testHelper.forwardTime(3600 + 10);
        // Transfer should fail as the account is locked
        var result = await colony.transfer.call(_MAIN_ACCOUNT_, 50, {from: _OTHER_ACCOUNT_});
        assert.isFalse(result);
        await colony.transfer(_MAIN_ACCOUNT_, 50, {from: _OTHER_ACCOUNT_});

        var balanceSender = await colony.balanceOf.call(_OTHER_ACCOUNT_);
        assert.equal(95, balanceSender.toNumber());
        var balanceRecipient = await colony.balanceOf.call(_MAIN_ACCOUNT_);
        assert.equal(0, balanceRecipient);
        done();
      } catch (err) {
        return done(err);
      }
    });

    it('after the poll closes and the vote is resolved, should succeed', async function(done){
      try{
        await colony.createPoll('My poll');
        await colony.addPollOption(1, 'Yes');
        await colony.addPollOption(1, 'No');
        await colony.openPoll(1, 1);
        await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});

        // Earn some tokens!
        await colony.generateTokensWei(100);
        await colony.makeTask('name2', 'summary2');
        await colony.contributeTokensWeiFromPool(0, 100);
        await colony.completeAndPayTask(0, _OTHER_ACCOUNT_);

        testHelper.forwardTime(3600 + 10);

        await colony.revealVote(1, 1, {from: _OTHER_ACCOUNT_});

        // Transfer should succeed as the account is unlocked when vote is revealed
        await colony.transfer(_MAIN_ACCOUNT_, 50, {from: _OTHER_ACCOUNT_});

        var balanceSender = await colony.balanceOf.call(_OTHER_ACCOUNT_);
        assert.equal(45, balanceSender.toNumber());
        var balanceRecipient = await colony.balanceOf.call(_MAIN_ACCOUNT_);
        assert.equal(50, balanceRecipient);
        done();
      } catch (err) {
        return done(err);
      }
    });

    it.only('after the poll closes and the vote is resolved but another unresolved vote remains, should fail', async function(done){
      try{
        await colony.createPoll('My poll 1');
        await colony.createPoll('My poll 2');
        await colony.addPollOption(1, 'Yes');
        await colony.addPollOption(1, 'No');
        await colony.addPollOption(2, 'Yes');
        await colony.addPollOption(2, 'No');
        await colony.openPoll(1, 1);
        await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});

        await colony.openPoll(2, 3);
        await colony.submitVote(_POLL_ID_2_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});

        // Earn some tokens!
        await colony.generateTokensWei(100);
        await colony.makeTask('name2', 'summary2');
        await colony.contributeTokensWeiFromPool(0, 100);
        await colony.completeAndPayTask(0, _OTHER_ACCOUNT_);

        testHelper.forwardTime(3*3600 + 10);

        await colony.revealVote(1, 1, {from: _OTHER_ACCOUNT_});

        var result = await colony.transfer.call(_MAIN_ACCOUNT_, 50, {from: _OTHER_ACCOUNT_});
        assert.isFalse(result);
        // Transfer should fail as the account is still locked since one more unrevealed vote remains
        await colony.transfer(_MAIN_ACCOUNT_, 50, {from: _OTHER_ACCOUNT_});

        var balanceSender = await colony.balanceOf.call(_OTHER_ACCOUNT_);
        assert.equal(95, balanceSender.toNumber());
        var balanceRecipient = await colony.balanceOf.call(_MAIN_ACCOUNT_);
        assert.equal(10, balanceRecipient);
        done();
      } catch (err) {
        return done(err);
      }
    });

    it('after the poll is resolved, should succeed', async function(done){
      try{
        done();
      } catch (err) {
        return done(err);
      }
    });
  });

  describe.skip('when receiving tokens, after having voted in a poll', function(){
    it('while the poll is still open, should succeed', async function(done){
      try{
        done();
      } catch (err) {
        return done(err);
      }
    });

    it('after the poll closes, should succeed and hold the tokens locked', async function(done){
      try{
        done();
      } catch (err) {
        return done(err);
      }
    });

    it('after the poll closes and the vote is resolved, should succeed', async function(done){
      try{
        done();
      } catch (err) {
        return done(err);
      }
    });

    it('after the poll is resolved, should succeed', async function(done){
      try{
        done();
      } catch (err) {
        return done(err);
      }
    });
  });

  describe.skip('when getting tokens for completing a task, after having voted in a poll', function(){
    it('while the poll is still open, should succeed', async function(done){
      try{
        done();
      } catch (err) {
        return done(err);
      }
    });

    it('after the poll closes, should succeed and hold the tokens locked', async function(done){
      try{
        done();
      } catch (err) {
        return done(err);
      }
    });

    it('after the poll closes and the vote is resolved, should succeed', async function(done){
      try{
        done();
      } catch (err) {
        return done(err);
      }
    });

    it('after the poll is resolved, should succeed', async function(done){
      try{
        done();
      } catch (err) {
        return done(err);
      }
    });
  });

  //todo: define behaviour of balanceOf and transfer functions
});
