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
    pollLockTime = timestamp + 24 * 3600;
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

  describe('when adding a poll entry', function(){
    it('as the first poll, it should be added correctly', async function(done){
      try{
        var lastBlock = await web3.eth.getBlock('latest');
        await colony.createPoll(24, 'simple yes/no vote');

        //Check it's been inserted correctly
        var _pollLockTime = await eternalStorage.getUIntValue.call(solSha3('Poll', 1, 'lockTime'));
        assert.equal(_pollLockTime.toNumber(), lastBlock.timestamp + 24 * 3600);

        var pollDescription = await eternalStorage.getStringValue.call(solSha3('Poll', 1, 'description'));
        assert.equal(pollDescription, 'simple yes/no vote');

        var pollOption1 = await eternalStorage.getStringValue.call(solSha3('Poll', 1, 'option', 1));
        var pollOption2 = await eternalStorage.getStringValue.call(solSha3('Poll', 1, 'option', 2));
        assert.equal(pollOption1, 'Yes');
        assert.equal(pollOption2, 'No');

        var pollCount = await eternalStorage.getUIntValue.call(solSha3('PollCount'));
        assert.equal(pollCount.toNumber(), 1);

        done();
      } catch (err) {
        return done(err);
      }
    });

    it('when adding a new poll, should update the poll count correctly', async function(){
      await colony.createPoll(24, 'poll 1');
      await colony.createPoll(48, 'poll 2');
      await colony.createPoll(12, 'poll 3');
      await colony.createPoll(240, 'poll 4');
      await colony.createPoll(120, 'poll 5');
      await colony.createPoll(20, 'poll 6');

      var pollCount = await eternalStorage.getUIntValue.call(solSha3('PollCount'));
      assert.equal(pollCount.toNumber(), 6);
    });
  });

  describe('when adding a vote entry', function () {
    it('to the start of a list of existing votes at a pollLockTime that already exists, the linked list works as expected', async function(done){
      try {
        var _VOTE_SECRET_1_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_2_ = testHelper.getRandomString(5);

        await colony.createPoll(24, 'poll 1');
        await colony.createPoll(24, 'poll 2');
        await colony.createPoll(24, 'poll 3');

        // Adding 2 items to the list intially
        await colony.submitVote(pollLockTime, _POLL_ID_3_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(pollLockTime - 1, _POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});

        //Add another one at the same timestamp
        await colony.submitVote(pollLockTime, _POLL_ID_2_, _VOTE_SECRET_2_, pollLockTime - 1, 0, {from: _OTHER_ACCOUNT_});

        //Check it's been inserted correctly
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

    it('in the middle of a list of existing votes at a pollLockTime that already exists, the linked list works as expected', async function(done){
      try {
        var _VOTE_SECRET_1_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_2_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_3_ = testHelper.getRandomString(5);

        await colony.submitVote(pollLockTime, _POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(pollLockTime - 1, _POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(pollLockTime, _POLL_ID_3_, _VOTE_SECRET_3_, pollLockTime - 1, _POLL_ID_1_, {from: _OTHER_ACCOUNT_});

        //Add another one at the same timestamp
        await colony.submitVote(pollLockTime, _POLL_ID_2_, _VOTE_SECRET_2_, pollLockTime - 1, _POLL_ID_1_, {from: _OTHER_ACCOUNT_});

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

    it('to the end of list of existing votes at a pollLockTime that already exists, the linked list works as expected', async function (done) {
      try {
        var _VOTE_SECRET_2_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_3_ = testHelper.getRandomString(5);

        await colony.submitVote(pollLockTime, _POLL_ID_2_, _VOTE_SECRET_2_, 0, 0, {from: _OTHER_ACCOUNT_});

        //Add another one at the same timestamp
        await colony.submitVote(pollLockTime, _POLL_ID_3_, _VOTE_SECRET_3_, 0, _POLL_ID_2_, {from: _OTHER_ACCOUNT_});

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

    it('if the supplied previous pollId does not exist, it should fail', async function(done){
      try {
        var _VOTE_SECRET_1_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_2_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_3_ = testHelper.getRandomString(5);

        await colony.submitVote(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(_OTHER_ACCOUNT_, pollLockTime - 1, _POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_3_, _VOTE_SECRET_3_, pollLockTime - 1, _POLL_ID_1_, {from: _OTHER_ACCOUNT_});

        //Add another one at the same timestamp but with a nonexistent prevPollId
        await colony.submitVote(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_2_, _VOTE_SECRET_2_, pollLockTime - 1, _POLL_ID_4_, {from: _OTHER_ACCOUNT_});

        //Check the new item hasn't been inserted
        var firstEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_1_, 'prevPollId'));
        assert.equal(firstEntryPrevKey.toNumber(), 0);
        var firstEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_1_, 'nextPollId'));
        assert.equal(firstEntryNextKey.toNumber(), _POLL_ID_3_);

        var lastEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_3_, 'prevPollId'));
        assert.equal(lastEntryPrevKey.toNumber(), _POLL_ID_1_);
        var lastEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_3_, 'nextPollId'));
        assert.equal(lastEntryNextKey.toNumber(), 0);
        done();

      } catch (err) {
        return done(err);
      }
    });

    it('if the supplied previous pollId implies a next pollId that is too small, it should fail', async function(done){
      try {
        var _VOTE_SECRET_1_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_2_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_3_ = testHelper.getRandomString(5);

        await colony.submitVote(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(_OTHER_ACCOUNT_, pollLockTime - 1, _POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_3_, _VOTE_SECRET_3_, pollLockTime - 1, _POLL_ID_1_, {from: _OTHER_ACCOUNT_});

        // Add another one at the same timestamp but a prevPollId which is lower (1) than the correct one (3)
        await colony.submitVote(_OTHER_ACCOUNT_, pollLockTime, _POLL_ID_4_, _VOTE_SECRET_2_, pollLockTime - 1, _POLL_ID_1_, {from: _OTHER_ACCOUNT_});

        //Check the new item hasn't been inserted
        var firstEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_1_, 'prevPollId'));
        assert.equal(firstEntryPrevKey.toNumber(), 0);
        var firstEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_1_, 'nextPollId'));
        assert.equal(firstEntryNextKey.toNumber(), _POLL_ID_3_);

        var lastEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_3_, 'prevPollId'));
        assert.equal(lastEntryPrevKey.toNumber(), _POLL_ID_1_);
        var lastEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_3_, 'nextPollId'));
        assert.equal(lastEntryNextKey.toNumber(), 0);
        done();

      } catch (err) {
        return done(err);
      }
    });

    it('if the supplied previous pollId is too large, it should fail', async function(done){
      try {
        var _VOTE_SECRET_1_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_2_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_3_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_4_ = testHelper.getRandomString(5);

        await colony.submitVote(pollLockTime - 1, _POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(pollLockTime, _POLL_ID_3_, _VOTE_SECRET_3_, pollLockTime - 1, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(pollLockTime, _POLL_ID_1_, _VOTE_SECRET_1_, pollLockTime - 1, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(pollLockTime, _POLL_ID_4_, _VOTE_SECRET_4_, pollLockTime - 1, _POLL_ID_3_, {from: _OTHER_ACCOUNT_});

        // Add another one at the same timestamp but a prevPollId which is higher (3) than the correct one (1)
        await colony.submitVote(pollLockTime, _POLL_ID_2_, _VOTE_SECRET_2_, pollLockTime - 1, _POLL_ID_3_, {from: _OTHER_ACCOUNT_});

        //Check the new item hasn't been inserted
        var firstEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_1_, 'prevPollId'));
        assert.equal(firstEntryPrevKey.toNumber(), 0);
        var firstEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_1_, 'nextPollId'));
        assert.equal(firstEntryNextKey.toNumber(), _POLL_ID_3_);

        var midEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_3_, 'prevPollId'));
        assert.equal(midEntryPrevKey.toNumber(), _POLL_ID_1_);
        var midEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_3_, 'nextPollId'));
        assert.equal(midEntryNextKey.toNumber(), _POLL_ID_4_);

        var lastEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_4_, 'prevPollId'));
        assert.equal(lastEntryPrevKey.toNumber(), _POLL_ID_3_);
        var lastEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_4_, 'nextPollId'));
        assert.equal(lastEntryNextKey.toNumber(), 0);
        done();

      } catch (err) {
        return done(err);
      }
    });

    it('if the new secret is proposed to be at the start, but that is wrong, it should fail', async function(done){
      try {
        var _VOTE_SECRET_1_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_2_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_3_ = testHelper.getRandomString(5);

        await colony.submitVote(pollLockTime, _POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(pollLockTime - 1, _POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(pollLockTime, _POLL_ID_3_, _VOTE_SECRET_3_, pollLockTime - 1, _POLL_ID_1_, {from: _OTHER_ACCOUNT_});

        //Add another one at the same timestamp but with prevPollId=0, i.e. at the start where it doesn't order properly with other polls
        await colony.submitVote(pollLockTime, _POLL_ID_2_, _VOTE_SECRET_2_, pollLockTime - 1, 0, {from: _OTHER_ACCOUNT_});

        //Check the new item hasn't been inserted
        var firstEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_1_, 'prevPollId'));
        assert.equal(firstEntryPrevKey.toNumber(), 0);
        var firstEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_1_, 'nextPollId'));
        assert.equal(firstEntryNextKey.toNumber(), _POLL_ID_3_);

        var lastEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_3_, 'prevPollId'));
        assert.equal(lastEntryPrevKey.toNumber(), _POLL_ID_1_);
        var lastEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_3_, 'nextPollId'));
        assert.equal(lastEntryNextKey.toNumber(), 0);
        done();

      } catch (err) {
        return done(err);
      }
    });

    // todo: test when a user tries to update their vote secret

    it('for a poll at a pollLockTime nad its secret, as the first items in the 2 linked lists, should be added to linked lists correctly', async function(done){
      try {
        var _VOTE_SECRET_1_ = testHelper.getRandomString(5);
        await colony.submitVote(pollLockTime, _POLL_ID_1_, solSha3(_VOTE_SECRET_1_), 0, 0, {from: _OTHER_ACCOUNT_});

        // Check the pollLockTime is added correctly
        var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'prevTimestamp'));
        var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'nextTimestamp'));
        assert.equal(newEntryPrevKey, 0);
        assert.equal(newEntryNextKey, 0);

        // Check the secret is added correctly
        var newPollEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_1_, 'prevPollId'));
        var newPollEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_1_, 'nextPollId'));
        assert.equal(newPollEntryPrevKey, 0);
        assert.equal(newPollEntryNextKey, 0);
        var poll1Secret = await eternalStorage.getBytes32Value(solSha3('Voting', _OTHER_ACCOUNT_, pollLockTime, 'secrets', _POLL_ID_1_, 'secret'));
        assert.equal(solSha3(_VOTE_SECRET_1_), poll1Secret);

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

        await colony.submitVote(pollLockTime, _POLL_ID_1_, solSha3(_VOTE_SECRET_1_), 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(pollLockTime - 1, _POLL_ID_2_, solSha3(_VOTE_SECRET_2_), 0, 0, {from: _OTHER_ACCOUNT_});

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

      await colony.submitVote(pollLockTime, _POLL_ID_1_, solSha3(_VOTE_SECRET_1_), 0, 0, {from: _OTHER_ACCOUNT_});
      await colony.submitVote(pollLockTime + 4, _POLL_ID_4_, solSha3(_VOTE_SECRET_4_), pollLockTime, 0, {from: _OTHER_ACCOUNT_});
      await colony.submitVote(pollLockTime + 3, _POLL_ID_3_, solSha3(_VOTE_SECRET_3_), pollLockTime, 0, {from: _OTHER_ACCOUNT_});

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

        await colony.submitVote(pollLockTime, _POLL_ID_1_, solSha3(_VOTE_SECRET_1_), 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(pollLockTime + 1, _POLL_ID_2_, solSha3(_VOTE_SECRET_2_), pollLockTime, 0, {from: _OTHER_ACCOUNT_});

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

    it('if the supplied previous locktime does not exist, it should fail', async function(done){
      try {
        var _VOTE_SECRET_1_ = testHelper.getRandomString(5);
        var _VOTE_SECRET_2_ = testHelper.getRandomString(5);

        await colony.submitVote(pollLockTime, _POLL_ID_1_, solSha3(_VOTE_SECRET_1_), 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(pollLockTime + 1, _POLL_ID_2_, solSha3(_VOTE_SECRET_2_), pollLockTime - 10, 0, {from: _OTHER_ACCOUNT_});

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

        await colony.submitVote(pollLockTime, _POLL_ID_1_, solSha3(_VOTE_SECRET_1_), 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(pollLockTime + 1, _POLL_ID_2_, solSha3(_VOTE_SECRET_2_), 0, 0, {from: _OTHER_ACCOUNT_});

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

        await colony.submitVote(pollLockTime, _POLL_ID_1_, solSha3(_VOTE_SECRET_1_), 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(pollLockTime + 2, _POLL_ID_2_, solSha3(_VOTE_SECRET_2_), pollLockTime, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(pollLockTime + 4, _POLL_ID_4_, solSha3(_VOTE_SECRET_4_), pollLockTime + 2, 0, {from: _OTHER_ACCOUNT_});

        // Try inserting pollLockTime at a position lower than the correct one
        await colony.submitVote(pollLockTime + 3, _POLL_ID_3_, solSha3(_VOTE_SECRET_3_), pollLockTime, 0, {from: _OTHER_ACCOUNT_});

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

        await colony.submitVote(pollLockTime, _POLL_ID_1_, solSha3(_VOTE_SECRET_1_), 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(pollLockTime + 2, _POLL_ID_2_, solSha3(_VOTE_SECRET_2_), pollLockTime, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(pollLockTime + 4, _POLL_ID_4_, solSha3(_VOTE_SECRET_4_), pollLockTime + 2, 0, {from: _OTHER_ACCOUNT_});

        // Try inserting pollLockTime at a position higher than the correct one
        await colony.submitVote(pollLockTime + 1, _POLL_ID_3_, solSha3(_VOTE_SECRET_3_), pollLockTime + 2, 0, {from: _OTHER_ACCOUNT_});

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
