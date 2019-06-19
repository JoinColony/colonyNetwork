/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";
import shortid from "shortid";
import { soliditySha3 } from "web3-utils";

import { WAD, MINING_CYCLE_DURATION, SECONDS_PER_DAY, DEFAULT_STAKE } from "../../helpers/constants";
import { checkErrorRevert, makeReputationKey, makeReputationValue, getActiveRepCycle, forwardTime, encodeTxData } from "../../helpers/test-helper";

import {
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  setupRandomColony,
  giveUserCLNYTokensAndStake
} from "../../helpers/test-data-generator";

import PatriciaTree from "../../packages/reputation-miner/patricia";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const VotingReputation = artifacts.require("VotingReputation");

contract("Voting Reputation", accounts => {
  let colony;
  let metaColony;
  let colonyNetwork;
  let voting;
  let reputationTree;

  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const MINER = accounts[5];

  const SALT = soliditySha3(shortid.generate());
  const FAKE = soliditySha3(shortid.generate());
  const WAD2 = WAD.muln(2);

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));
    await giveUserCLNYTokensAndStake(colonyNetwork, MINER, DEFAULT_STAKE);
    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
  });

  beforeEach(async () => {
    ({ colony } = await setupRandomColony(colonyNetwork));
    voting = await VotingReputation.new(colony.address);

    reputationTree = new PatriciaTree();
    await reputationTree.insert(
      makeReputationKey(colony.address, 1, USER0), // All good
      makeReputationValue(WAD, 1)
    );
    await reputationTree.insert(
      makeReputationKey(metaColony.address, 1, USER0), // Wrong colony
      makeReputationValue(WAD, 2)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, 2, USER0), // Wrong skill
      makeReputationValue(WAD, 3)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, 1, USER1), // Wrong user (and 2x value)
      makeReputationValue(WAD2, 4)
    );

    const rootHash = await reputationTree.getRootHash();
    const repCycle = await getActiveRepCycle(colonyNetwork);
    await forwardTime(MINING_CYCLE_DURATION, this);
    await repCycle.submitRootHash(rootHash, 0, "0x00", 10, { from: MINER });
    await repCycle.confirmNewHash(0);
  });

  describe.only("creating and editing polls", async () => {
    it("can create a new poll", async () => {
      let pollId = await voting.getPollCount();
      expect(pollId).to.be.zero;

      await voting.createPoll();
      pollId = await voting.getPollCount();
      expect(pollId).to.eq.BN(1);

      await voting.setPollRepInfo(pollId, 1);
      await voting.addPollAction(pollId, FAKE);
      await voting.addPollAction(pollId, FAKE);
      await voting.openPoll(pollId, SECONDS_PER_DAY);
    });

    it("cannot open a poll with fewer than two actions", async () => {
      await voting.createPoll();
      const pollId = await voting.getPollCount();
      await voting.setPollRepInfo(pollId, 1);
      await checkErrorRevert(voting.openPoll(pollId, SECONDS_PER_DAY), "voting-base-insufficient-poll-actions");

      await voting.addPollAction(pollId, FAKE);
      await checkErrorRevert(voting.openPoll(pollId, SECONDS_PER_DAY), "voting-base-insufficient-poll-actions");

      await voting.addPollAction(pollId, FAKE);
      await voting.openPoll(pollId, SECONDS_PER_DAY);
    });

    it("cannot add an option once a poll is open", async () => {
      await voting.createPoll();
      const pollId = await voting.getPollCount();

      await voting.setPollRepInfo(pollId, 1);
      await voting.addPollAction(pollId, FAKE);
      await voting.addPollAction(pollId, FAKE);
      await voting.openPoll(pollId, SECONDS_PER_DAY);

      await checkErrorRevert(voting.addPollAction(pollId, FAKE), "voting-base-poll-not-pending");
    });

    it("cannot edit a poll unless creator", async () => {
      await voting.createPoll();
      const pollId = await voting.getPollCount();

      await checkErrorRevert(voting.addPollAction(pollId, FAKE, { from: USER1 }), "voting-base-only-creator");
      await checkErrorRevert(voting.setPollRepInfo(pollId, 1, { from: USER1 }), "voting-base-only-creator");
      await checkErrorRevert(voting.openPoll(pollId, SECONDS_PER_DAY, { from: USER1 }), "voting-base-only-creator");
    });

    // VotingReputation specific
    it("cannot open a reputation poll without a root hash", async () => {
      await voting.createPoll();
      const pollId = await voting.getPollCount();
      await checkErrorRevert(voting.openPoll(pollId, SECONDS_PER_DAY), "voting-rep-poll-no-root-hash");
    });

    // VotingReputation specific
    it("cannot set the root hash on an open reputation poll", async () => {
      await voting.createPoll();
      const pollId = await voting.getPollCount();
      await voting.setPollRepInfo(pollId, 1);
      await voting.addPollAction(pollId, FAKE);
      await voting.addPollAction(pollId, FAKE);
      await voting.openPoll(pollId, SECONDS_PER_DAY);

      await checkErrorRevert(voting.setPollRepInfo(pollId, 1), "voting-base-poll-not-pending");
    });
  });

  describe.only("voting on polls", async () => {
    let key, value, mask, siblings, pollId; // eslint-disable-line one-var

    beforeEach(async () => {
      await voting.createPoll();
      pollId = await voting.getPollCount();

      await voting.setPollRepInfo(pollId, 1);
      await voting.addPollAction(pollId, FAKE);
      await voting.addPollAction(pollId, FAKE);
      await voting.addPollAction(pollId, FAKE);
      await voting.openPoll(pollId, SECONDS_PER_DAY);

      key = makeReputationKey(colony.address, 1, USER0);
      value = makeReputationValue(WAD, 1);
      [mask, siblings] = await reputationTree.getProof(key);
    });

    it("can rate and reveal for a poll", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, 0), { from: USER0 });
      await forwardTime(SECONDS_PER_DAY, this);
      await voting.revealVote(pollId, SALT, 0, key, value, mask, siblings, { from: USER0 });
    });

    it("can tally votes from two users", async () => {
      // USER0 votes for option 2 this time to demonstrate `getPollWinner`
      await voting.submitVote(pollId, soliditySha3(SALT, 2), { from: USER0 });
      await voting.submitVote(pollId, soliditySha3(SALT, 1), { from: USER1 });

      // Returns first option when tied
      let pollWinner = await voting.getPollWinner(pollId);
      expect(pollWinner).to.be.zero;

      await forwardTime(SECONDS_PER_DAY, this);
      await voting.revealVote(pollId, SALT, 2, key, value, mask, siblings, { from: USER0 });

      // Third option in the lead
      pollWinner = await voting.getPollWinner(pollId);
      expect(pollWinner).to.eq.BN(2);

      key = makeReputationKey(colony.address, 1, USER1);
      value = makeReputationValue(WAD2, 4);
      [mask, siblings] = await reputationTree.getProof(key);
      await voting.revealVote(pollId, SALT, 1, key, value, mask, siblings, { from: USER1 });

      // Second option wins
      pollWinner = await voting.getPollWinner(pollId);
      expect(pollWinner).to.eq.BN(1);

      // See final counts
      const { voteCounts } = await voting.getPollInfo(pollId);
      expect(voteCounts[0]).to.be.zero;
      expect(voteCounts[1]).to.eq.BN(WAD2);
      expect(voteCounts[2]).to.eq.BN(WAD);
    });

    it("can update votes, but only last one counts", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, 0), { from: USER0 });
      await voting.submitVote(pollId, soliditySha3(SALT, 1), { from: USER0 });

      await forwardTime(SECONDS_PER_DAY, this);

      // Revealing first vote fails
      await checkErrorRevert(voting.revealVote(pollId, SALT, 0, key, value, mask, siblings, { from: USER0 }), "voting-rep-secret-no-match");

      // Revealing second succeeds
      await voting.revealVote(pollId, SALT, 1, key, value, mask, siblings, { from: USER0 });
    });

    it("can reveal votes after poll closes, but doesn't count", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, 0), { from: USER0 });

      // Close the poll (1 day voting, 2 day reveal)
      await forwardTime(SECONDS_PER_DAY * 3, this);

      await voting.revealVote(pollId, SALT, 0, key, value, mask, siblings, { from: USER0 });

      // Vote didn't count
      const { voteCounts } = await voting.getPollInfo(pollId);
      expect(voteCounts[0]).to.be.zero;
      expect(voteCounts[1]).to.be.zero;
      expect(voteCounts[2]).to.be.zero;
    });

    it("cannot reveal a vote twice, and so cannot vote twice", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, 0), { from: USER0 });

      await forwardTime(SECONDS_PER_DAY, this);

      await voting.revealVote(pollId, SALT, 0, key, value, mask, siblings, { from: USER0 });
      await checkErrorRevert(voting.revealVote(pollId, SALT, 0, key, value, mask, siblings, { from: USER0 }), "voting-rep-secret-no-match");
    });

    it("can vote in two polls with two reputation states, with different proofs", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, 0), { from: USER0 });

      // Update reputation state
      const value2 = makeReputationValue(WAD.muln(3), 1);
      await reputationTree.insert(key, value2);

      // Set new rootHash
      const rootHash = await reputationTree.getRootHash();
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash(rootHash, 0, "0x00", 10, { from: MINER });
      await repCycle.confirmNewHash(0);

      // Create new poll with new reputation state
      await voting.createPoll();
      const pollId2 = await voting.getPollCount();
      await voting.setPollRepInfo(pollId2, 1);
      await voting.addPollAction(pollId2, FAKE);
      await voting.addPollAction(pollId2, FAKE);
      await voting.openPoll(pollId2, SECONDS_PER_DAY);

      await voting.submitVote(pollId2, soliditySha3(SALT, 0), { from: USER0 });

      await forwardTime(SECONDS_PER_DAY, this);

      const [mask2, siblings2] = await reputationTree.getProof(key);
      await voting.revealVote(pollId, SALT, 0, key, value, mask, siblings, { from: USER0 });
      await voting.revealVote(pollId2, SALT, 0, key, value2, mask2, siblings2, { from: USER0 });
    });

    it("can take an action based on the result of a poll", async () => {
      await colony.setAdministrationRole(1, 0, voting.address, 1, true);
      const action = await encodeTxData(colony, "makeTask", [1, 0, FAKE, 1, 0, 0]);

      await voting.createPoll();
      pollId = await voting.getPollCount();
      await voting.setPollRepInfo(pollId, 1);
      await voting.addPollAction(pollId, FAKE);
      await voting.addPollAction(pollId, action);
      await voting.openPoll(pollId, SECONDS_PER_DAY);

      await voting.submitVote(pollId, soliditySha3(SALT, 1), { from: USER0 });

      await forwardTime(SECONDS_PER_DAY, this);
      await voting.revealVote(pollId, SALT, 1, key, value, mask, siblings, { from: USER0 });

      await checkErrorRevert(voting.executePoll(pollId), "voting-base-poll-not-closed");

      await forwardTime(SECONDS_PER_DAY * 2, this);
      const taskCountPrev = await colony.getTaskCount();
      await voting.executePoll(pollId);
      const taskCountPost = await colony.getTaskCount();
      expect(taskCountPost).to.eq.BN(taskCountPrev.addn(1));

      await checkErrorRevert(voting.executePoll(pollId), "voting-base-poll-already-executed");
    });
  });

  describe.only("simple exceptions", async () => {
    let pollId;

    beforeEach(async () => {
      await voting.createPoll();
      pollId = await voting.getPollCount();
      await voting.setPollRepInfo(pollId, 1);
      await voting.addPollAction(pollId, FAKE);
      await voting.addPollAction(pollId, FAKE);
      await voting.openPoll(pollId, SECONDS_PER_DAY);
    });

    it("cannot submit a vote if poll is pending", async () => {
      await voting.createPoll();
      pollId = await voting.getPollCount();
      await checkErrorRevert(voting.submitVote(pollId, soliditySha3(SALT, 0)), "voting-rep-poll-not-open");
    });

    it("cannot submit a vote if voting is closed", async () => {
      await forwardTime(SECONDS_PER_DAY * 2, this);
      await checkErrorRevert(voting.submitVote(pollId, soliditySha3(SALT, 0)), "voting-rep-poll-not-open");
    });

    it("cannot reveal a vote if voting is open", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, 0));
      await checkErrorRevert(voting.revealVote(pollId, SALT, 1, FAKE, FAKE, 0, []), "voting-rep-poll-still-open");
    });

    it("cannot reveal a vote with a bad secret", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, 0));
      await forwardTime(SECONDS_PER_DAY, this);
      await checkErrorRevert(voting.revealVote(pollId, SALT, 1, FAKE, FAKE, 0, []), "voting-rep-secret-no-match");
    });

    it("cannot reveal an invalid vote", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, 2));
      await forwardTime(SECONDS_PER_DAY, this);
      await checkErrorRevert(voting.revealVote(pollId, SALT, 2, FAKE, FAKE, 0, []), "voting-rep-invalid-vote");
    });

    // VotingReputation specific
    it("cannot reveal a vote with a bad proof", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, 0), { from: USER0 });
      await forwardTime(SECONDS_PER_DAY, this);

      // Invalid proof (wrong root hash)
      await checkErrorRevert(voting.revealVote(pollId, SALT, 0, FAKE, FAKE, 0, [], { from: USER0 }), "voting-rep-invalid-root-hash");

      // Invalid colony address
      let key, value, mask, siblings; // eslint-disable-line one-var
      key = makeReputationKey(metaColony.address, 1, USER0);
      value = makeReputationValue(WAD, 2);
      [mask, siblings] = await reputationTree.getProof(key);
      await checkErrorRevert(voting.revealVote(pollId, SALT, 0, key, value, mask, siblings, { from: USER0 }), "voting-rep-invalid-colony-address");

      // Invalid skill id
      key = makeReputationKey(colony.address, 2, USER0);
      value = makeReputationValue(WAD, 3);
      [mask, siblings] = await reputationTree.getProof(key);
      await checkErrorRevert(voting.revealVote(pollId, SALT, 0, key, value, mask, siblings, { from: USER0 }), "voting-rep-invalid-skill-id");

      // Invalid user address
      key = makeReputationKey(colony.address, 1, USER1);
      value = makeReputationValue(WAD2, 4);
      [mask, siblings] = await reputationTree.getProof(key);
      await checkErrorRevert(voting.revealVote(pollId, SALT, 0, key, value, mask, siblings, { from: USER0 }), "voting-rep-invalid-user-address");
    });
  });
});
