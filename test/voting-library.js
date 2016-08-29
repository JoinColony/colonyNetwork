/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, RootColony, Colony, EternalStorage, assert, web3*/
var testHelper = require('../helpers/test-helper.js');
import { solSha3 } from 'colony-utils';

contract('VotingLibrary', function (accounts) {
  var _COLONY_KEY_;
  var _MAIN_ACCOUNT_ = accounts[0];
  var _OTHER_ACCOUNT_ = accounts[1];
  var rootColony;
  var colony;
  var eternalStorage;
  var eternalStorageRoot;

  var pollLockTime;
  var _POLL_ID_1_ = 1;
  var _POLL_ID_2_ = 2;
  var _POLL_ID_3_ = 3;
  var _POLL_ID_4_ = 4;

  before(async function (done) {
    rootColony = RootColony.deployed();
    eternalStorageRoot = EternalStorage.deployed();

    var lastBlock = await web3.eth.getBlock('latest');
    var timestamp = lastBlock.timestamp;
    pollLockTime = timestamp + 2 * 7 * 24 * 3600;
    console.log('pollLockTime : ', pollLockTime);
    done();
  });

  beforeEach(function (done) {
    _COLONY_KEY_ = testHelper.getRandomString(7);

    eternalStorageRoot.owner.call()
      .then(function () {
        return rootColony.createColony(_COLONY_KEY_, { from: _MAIN_ACCOUNT_ });
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

  describe('when adding a vote entry', function () {

    it.skip('to the start of a list of existing votes at a pollLockTime that already exists, the linked list works as expected', async function(done){
      try {
        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_3_, solSha3('Yes'), 0, 0);

        //Add another one at the same timestamp
        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_2_, solSha3('Yes'), 0, 0);

        //Check it's been inserted correctly afterwards into the linked list
        var firstEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_2_, 'prevPollId'));
        assert.equal(firstEntryPrevKey.toNumber(), 0);
        var firstEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_2_, 'nextPollId'));
        assert.equal(firstEntryNextKey.toNumber(), _POLL_ID_3_);

        var newEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_3_, 'prevPollId'));
        assert.equal(newEntryPrevKey.toNumber(), _POLL_ID_2_);
        var newEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_3_, 'nextPollId'));
        assert.equal(newEntryNextKey.toNumber(), 0);
        done();

      } catch (err) {
        return done(err);
      }
    });

    it.skip('in the middle of a list of existing votes at a pollLockTime that already exists, the linked list works as expected', async function(done){
      try {
        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_1_, solSha3('Yes'), 0, 0);
        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_3_, solSha3('Yes'), 0, _POLL_ID_1_);

        //Add another one at the same timestamp
        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_2_, solSha3('Yes'), 0, _POLL_ID_1_);
        //Check it's been inserted correctly afterwards into the linked list
        var firstEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_1_, 'prevPollId'));
        assert.equal(firstEntryPrevKey.toNumber(), 0);
        var firstEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_1_, 'nextPollId'));
        assert.equal(firstEntryNextKey.toNumber(), _POLL_ID_2_);

        var newEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_2_, 'prevPollId'));
        assert.equal(newEntryPrevKey.toNumber(), _POLL_ID_1_);
        var newEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_2_, 'nextPollId'));
        assert.equal(newEntryNextKey.toNumber(), _POLL_ID_3_);

        var lastEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_3_, 'prevPollId'));
        assert.equal(lastEntryPrevKey.toNumber(), _POLL_ID_2_);
        var lastEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_3_, 'nextPollId'));
        assert.equal(lastEntryNextKey.toNumber(), 0);
        done();

      } catch (err) {
        return done(err);
      }
    });

    it.skip('to the end of list of existing votes at a pollLockTime that already exists, the linked list works as expected', async function (done) {
      try {
        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_2_, solSha3('Yes'), 0, 0);

        //Add another one at the same timestamp
        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_3_, solSha3('Yes'), 0, _POLL_ID_2_);
        //Check it's been inserted correctly afterwards into the linked list
        var firstEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_2_, 'prevPollId'));
        assert.equal(firstEntryPrevKey, 0);
        var firstEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_2_, 'nextPollId'));
        assert.equal(firstEntryNextKey, _POLL_ID_3_);

        var newEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_3_, 'prevPollId'));
        assert.equal(newEntryPrevKey, _POLL_ID_2_);
        var newEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_3_, 'nextPollId'));
        assert.equal(newEntryNextKey, 0);
        done();

      } catch (err) {
        return done(err);
      }
    });

    it.skip('if the supplied previous pollId does not exist, it should fail', async function(done){});
    it.skip('if the supplied previous pollId implies a next pollId that is too small, it should fail', async function(done){});
    it.skip('if the supplied previous pollId is too large, it should fail', async function(done){});
    it.skip('if the new secret is proposed to be at the start, but that is wrong, it should fail', async function(done){});

    it('for a poll at a pollLockTime as the first item in the list, should be added to linked list correctly', async function(done){
      try {
        var _VOTE_SECRET_1_ = testHelper.getRandomString(5);
        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_1_, solSha3(_VOTE_SECRET_1_), 0, 0);

        var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'prevTimestamp'));
        var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'nextTimestamp'));
        assert.equal(newEntryPrevKey, 0);
        assert.equal(newEntryNextKey, 0);

        // Check the '0' pollLockTime points to this pollLockTime correctly
        var zeroEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'prevTimestamp'));
        var zeroEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'nextTimestamp'));
        assert.equal(zeroEntryPrevKey.toNumber(), pollLockTime);
        assert.equal(zeroEntryNextKey.toNumber(), pollLockTime);
        done();
      }
      catch (err) {
        return done(err);
      }
    });

    it('for a poll at a new pollLockTime at the start of that list, should be added to linked list correctly', async function(done){
      try {
        var _VOTE_SECRET_1_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_2_ = testHelper.getRandomString(5);

        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_1_, solSha3(_VOTE_SECRET_1_), 0, 0);
        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime - 1, _POLL_ID_2_, solSha3(_VOTE_SECRET_2_), 0, 0);

        var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime - 1, 'prevTimestamp'));
        var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime - 1, 'nextTimestamp'));
        assert.equal(newEntryPrevKey.toNumber(), 0);
        assert.equal(newEntryNextKey.toNumber(), pollLockTime);

        // Check the '0' pollLockTime points to the correct pollLockTimes
        var zeroEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'prevTimestamp'));
        var zeroEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'nextTimestamp'));
        assert.equal(zeroEntryPrevKey.toNumber(), pollLockTime);
        assert.equal(zeroEntryNextKey.toNumber(), pollLockTime - 1);
        done();
      }
      catch (err) {
        return done(err);
      }
    });

    it('for a poll at a new pollLockTime in the middle of that list, should be added to linked list correctly', async function(done){
      var _VOTE_SECRET_1_ = testHelper.getRandomString(5);
      var _VOTE_SECRET_3_ = testHelper.getRandomString(5);
      var _VOTE_SECRET_4_ = testHelper.getRandomString(5);

      await colony.setLock(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_1_, solSha3(_VOTE_SECRET_1_), 0, 0);
      await colony.setLock(_OTHER_ACCOUNT_, pollLockTime + 4, _POLL_ID_4_, solSha3(_VOTE_SECRET_4_), pollLockTime, 0);
      await colony.setLock(_OTHER_ACCOUNT_, pollLockTime + 3, _POLL_ID_3_, solSha3(_VOTE_SECRET_3_), pollLockTime, 0);

      var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime + 3, 'prevTimestamp'));
      var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime + 3, 'nextTimestamp'));
      assert.equal(newEntryPrevKey.toNumber(), pollLockTime);
      assert.equal(newEntryNextKey.toNumber(), pollLockTime + 4);

      // Check the '0' pollLockTime points to the correct pollLockTimes
      var zeroEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'prevTimestamp'));
      var zeroEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'nextTimestamp'));
      assert.equal(zeroEntryPrevKey.toNumber(), pollLockTime + 4);
      assert.equal(zeroEntryNextKey.toNumber(), pollLockTime);
      done();
    });

    it('for a poll at a new pollLockTime at the end of that list, should be added to linked list correctly', async function(done) {
      try {
        var _VOTE_SECRET_1_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_2_ = testHelper.getRandomString(5);

        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_1_, solSha3(_VOTE_SECRET_1_), 0, 0);
        var firstUnrevealedPollIdAtPreviousTimestamp = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', 0, 'nextPollId'));
        console.log('pollLockTime, secrets, 0, nextPollId', firstUnrevealedPollIdAtPreviousTimestamp.toNumber());

        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime + 1, _POLL_ID_2_, solSha3(_VOTE_SECRET_2_), pollLockTime, 0);

        var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime + 1, 'prevTimestamp'));
        var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime + 1, 'nextTimestamp'));
        assert.equal(newEntryPrevKey.toNumber(), pollLockTime);
        assert.equal(newEntryNextKey.toNumber(), 0);

        // Check the '0' pollLockTime points to the correct pollLockTimes
        var zeroEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'prevTimestamp'));
        var zeroEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'nextTimestamp'));
        assert.equal(zeroEntryPrevKey.toNumber(), pollLockTime + 1);
        assert.equal(zeroEntryNextKey.toNumber(), pollLockTime);
        done();
      }
      catch (err) {
        return done(err);
      }
    });

    //TODO: This test fails because the check for existing prevTimestamp are not working :(
    it.skip('if the supplied previous locktime does not exist, it should fail', async function(done){
      try {
        var _VOTE_SECRET_1_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_2_ = testHelper.getRandomString(5);

        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_1_, solSha3(_VOTE_SECRET_1_), 0, 0);
        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime + 1, _POLL_ID_2_, solSha3(_VOTE_SECRET_2_), pollLockTime - 10, 0);

        var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'prevTimestamp'));
        var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'nextTimestamp'));
        assert.equal(newEntryPrevKey.toNumber(), 0);
        assert.equal(newEntryNextKey.toNumber(), 0);

        // Check the '0' pollLockTime points to the correct pollLockTimes
        var zeroEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'prevTimestamp'));
        var zeroEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'nextTimestamp'));
        assert.equal(zeroEntryPrevKey.toNumber(), pollLockTime);
        assert.equal(zeroEntryNextKey.toNumber(), pollLockTime);
        done();
      }
      catch (err) {
        return done(err);
      }
    });

    it('if the new lock is proposed to be at the start, but that is wrong, it should fail', async function(done){
      try {
        var _VOTE_SECRET_1_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_2_ = testHelper.getRandomString(5);

        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_1_, solSha3(_VOTE_SECRET_1_), 0, 0);
        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime + 1, _POLL_ID_2_, solSha3(_VOTE_SECRET_2_), 0, 0);

        var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'prevTimestamp'));
        var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'nextTimestamp'));
        assert.equal(newEntryPrevKey.toNumber(), 0);
        assert.equal(newEntryNextKey.toNumber(), 0);

        // Check the '0' pollLockTime points to the correct pollLockTimes
        var zeroEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'prevTimestamp'));
        var zeroEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'nextTimestamp'));
        assert.equal(zeroEntryPrevKey.toNumber(), pollLockTime);
        assert.equal(zeroEntryNextKey.toNumber(), pollLockTime);
        done();
      }
      catch (err) {
        return done(err);
      }
    });

    it('if the supplied previous locktime implies a next locktime that is too small, it should fail', async function(done){
      try {
        var _VOTE_SECRET_1_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_2_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_3_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_4_ = testHelper.getRandomString(5);

        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_1_, solSha3(_VOTE_SECRET_1_), 0, 0);
        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime + 2, _POLL_ID_2_, solSha3(_VOTE_SECRET_2_), pollLockTime, 0);
        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime + 4, _POLL_ID_4_, solSha3(_VOTE_SECRET_4_), pollLockTime + 2, 0);

        // Try inserting pollLockTime at a position lower than the correct one
        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime + 3, _POLL_ID_3_, solSha3(_VOTE_SECRET_3_), pollLockTime, 0);

        var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'prevTimestamp'));
        var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'nextTimestamp'));
        assert.equal(newEntryPrevKey.toNumber(), 0);
        assert.equal(newEntryNextKey.toNumber(), pollLockTime + 2);

        var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime + 2, 'prevTimestamp'));
        var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime + 2, 'nextTimestamp'));
        assert.equal(newEntryPrevKey.toNumber(), pollLockTime);
        assert.equal(newEntryNextKey.toNumber(), pollLockTime + 4);

        // Check the '0' pollLockTime points to the correct pollLockTimes
        var zeroEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'prevTimestamp'));
        var zeroEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'nextTimestamp'));
        assert.equal(zeroEntryPrevKey.toNumber(), pollLockTime + 4);
        assert.equal(zeroEntryNextKey.toNumber(), pollLockTime);
        done();
      }
      catch (err) {
        return done(err);
      }
    });

    it('if the supplied previous locktime is too large, it should fail', async function(done){
      try {
        var _VOTE_SECRET_1_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_2_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_3_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_4_ = testHelper.getRandomString(5);

        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_1_, solSha3(_VOTE_SECRET_1_), 0, 0);
        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime + 2, _POLL_ID_2_, solSha3(_VOTE_SECRET_2_), pollLockTime, 0);
        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime + 4, _POLL_ID_4_, solSha3(_VOTE_SECRET_4_), pollLockTime + 2, 0);

        // Try inserting pollLockTime at a position higher than the correct one
        await colony.setLock(_OTHER_ACCOUNT_, pollLockTime + 1, _POLL_ID_3_, solSha3(_VOTE_SECRET_3_), pollLockTime + 2, 0);

        var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'prevTimestamp'));
        var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'nextTimestamp'));
        assert.equal(newEntryPrevKey.toNumber(), 0);
        assert.equal(newEntryNextKey.toNumber(), pollLockTime + 2);

        var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime + 2, 'prevTimestamp'));
        var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime + 2, 'nextTimestamp'));
        assert.equal(newEntryPrevKey.toNumber(), pollLockTime);
        assert.equal(newEntryNextKey.toNumber(), pollLockTime + 4);

        // Check the '0' pollLockTime points to the correct pollLockTimes
        var zeroEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'prevTimestamp'));
        var zeroEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'nextTimestamp'));
        assert.equal(zeroEntryPrevKey.toNumber(), pollLockTime + 4);
        assert.equal(zeroEntryNextKey.toNumber(), pollLockTime);
        done();
      }
      catch (err) {
        return done(err);
      }
    });
  });
});
