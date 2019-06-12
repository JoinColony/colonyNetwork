/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";
import shortid from "shortid";
import { soliditySha3 } from "web3-utils";

import { WAD, MINING_CYCLE_DURATION, SECONDS_PER_DAY, DEFAULT_STAKE } from "../../helpers/constants";
import { checkErrorRevert, makeReputationKey, makeReputationValue, getActiveRepCycle, forwardTime } from "../../helpers/test-helper";

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
  let votingReputation;
  let reputationTree;

  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const MINER = accounts[5];

  const SALT = soliditySha3(shortid.generate());
  const WAD2 = WAD.muln(2);
  const FAKE = soliditySha3("");

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));
    await giveUserCLNYTokensAndStake(colonyNetwork, MINER, DEFAULT_STAKE);
    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
  });

  beforeEach(async () => {
    ({ colony } = await setupRandomColony(colonyNetwork));
    votingReputation = await VotingReputation.new(colony.address);

    reputationTree = new PatriciaTree();
    await reputationTree.insert(
      makeReputationKey(colony.address, 1, USER0), // All good
      makeReputationValue(WAD2, 1)
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
      makeReputationKey(colony.address, 1, USER1), // Wrong user
      makeReputationValue(WAD, 4)
    );

    const rootHash = await reputationTree.getRootHash();
    const repCycle = await getActiveRepCycle(colonyNetwork);
    await forwardTime(MINING_CYCLE_DURATION, this);
    await repCycle.submitRootHash(rootHash, 0, "0x00", 10, { from: MINER });
    await repCycle.confirmNewHash(0);
  });

  describe.only("happy paths", async () => {
    it("can create a new poll", async () => {
      let pollCount = await votingReputation.getPollCount();
      expect(pollCount).to.be.zero;

      await votingReputation.createPoll(2, SECONDS_PER_DAY, 1);
      pollCount = await votingReputation.getPollCount();
      expect(pollCount).to.eq.BN(1);
    });

    it("can rate and reveal for a poll", async () => {
      await votingReputation.createPoll(2, SECONDS_PER_DAY, 1);
      const pollId = await votingReputation.getPollCount();
      await votingReputation.submitVote(pollId, soliditySha3(SALT, 0), { from: USER0 });

      await forwardTime(SECONDS_PER_DAY, this);
      const key = makeReputationKey(colony.address, 1, USER0);
      const value = makeReputationValue(WAD2, 1);
      const [mask, siblings] = await reputationTree.getProof(key);
      await votingReputation.revealVote(pollId, SALT, 0, key, value, mask, siblings, { from: USER0 });
    });

    it("can tally votes for a poll", async () => {
      await votingReputation.createPoll(3, SECONDS_PER_DAY, 1);
      const pollId = await votingReputation.getPollCount();

      await votingReputation.submitVote(pollId, soliditySha3(SALT, 0), { from: USER0 });
      await votingReputation.submitVote(pollId, soliditySha3(SALT, 1), { from: USER1 });

      await forwardTime(SECONDS_PER_DAY, this);

      let key, value, mask, siblings; // eslint-disable-line one-var
      key = makeReputationKey(colony.address, 1, USER0);
      value = makeReputationValue(WAD2, 1);
      [mask, siblings] = await reputationTree.getProof(key);
      await votingReputation.revealVote(pollId, SALT, 0, key, value, mask, siblings, { from: USER0 });

      key = makeReputationKey(colony.address, 1, USER1);
      value = makeReputationValue(WAD, 4);
      [mask, siblings] = await reputationTree.getProof(key);
      await votingReputation.revealVote(pollId, SALT, 1, key, value, mask, siblings, { from: USER1 });

      const { voteCounts } = await votingReputation.getPollInfo(pollId);
      expect(voteCounts[0]).to.eq.BN(WAD2);
      expect(voteCounts[1]).to.eq.BN(WAD);
      expect(voteCounts[2]).to.be.zero;
    });

    it("can update votes, but only last one counts", async () => {
      await votingReputation.createPoll(2, SECONDS_PER_DAY, 1);
      const pollId = await votingReputation.getPollCount();

      await votingReputation.submitVote(pollId, soliditySha3(SALT, 0), { from: USER0 });
      await votingReputation.submitVote(pollId, soliditySha3(SALT, 1), { from: USER0 });

      await forwardTime(SECONDS_PER_DAY, this);

      const key = makeReputationKey(colony.address, 1, USER0);
      const value = makeReputationValue(WAD2, 1);
      const [mask, siblings] = await reputationTree.getProof(key);

      // Revealing first vote fails
      await checkErrorRevert(
        votingReputation.revealVote(pollId, SALT, 0, key, value, mask, siblings, { from: USER0 }),
        "colony-rep-voting-secret-no-match"
      );

      // Revealing second succeeds
      await votingReputation.revealVote(pollId, SALT, 1, key, value, mask, siblings, { from: USER0 });
    });

    it("can reveal votes after poll closes, but doesn't count", async () => {
      await votingReputation.createPoll(2, SECONDS_PER_DAY, 1);
      const pollId = await votingReputation.getPollCount();

      await votingReputation.submitVote(pollId, soliditySha3(SALT, 0), { from: USER0 });

      // Close the poll (1 day voting, 2 day reveal)
      await forwardTime(SECONDS_PER_DAY * 3, this);

      const key = makeReputationKey(colony.address, 1, USER0);
      const value = makeReputationValue(WAD2, 1);
      const [mask, siblings] = await reputationTree.getProof(key);

      await votingReputation.revealVote(pollId, SALT, 0, key, value, mask, siblings, { from: USER0 });

      // Vote didn't count
      const { voteCounts } = await votingReputation.getPollInfo(pollId);
      expect(voteCounts[0]).to.be.zero;
      expect(voteCounts[1]).to.be.zero;
      expect(voteCounts[2]).to.be.zero;
    });

    it("cannot reveal a vote twice, and so cannot vote twice", async () => {
      await votingReputation.createPoll(2, SECONDS_PER_DAY, 1);
      const pollId = await votingReputation.getPollCount();
      await votingReputation.submitVote(pollId, soliditySha3(SALT, 0), { from: USER0 });

      await forwardTime(SECONDS_PER_DAY, this);

      const key = makeReputationKey(colony.address, 1, USER0);
      const value = makeReputationValue(WAD2, 1);
      const [mask, siblings] = await reputationTree.getProof(key);

      await votingReputation.revealVote(pollId, SALT, 0, key, value, mask, siblings, { from: USER0 });
      await checkErrorRevert(
        votingReputation.revealVote(pollId, SALT, 0, key, value, mask, siblings, { from: USER0 }),
        "colony-rep-voting-secret-no-match"
      );
    });

    it("can vote in two polls with two reputation states, with different proofs", async () => {
      await votingReputation.createPoll(2, SECONDS_PER_DAY, 1);
      const pollId1 = await votingReputation.getPollCount();
      await votingReputation.submitVote(pollId1, soliditySha3(SALT, 0), { from: USER0 });

      const key = makeReputationKey(colony.address, 1, USER0);
      const value1 = makeReputationValue(WAD2, 1);
      const [mask1, siblings1] = await reputationTree.getProof(key);

      // Update reputation state
      const value2 = makeReputationValue(WAD.muln(3), 1);
      await reputationTree.insert(key, value2);

      // Set new rootHash
      const rootHash = await reputationTree.getRootHash();
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash(rootHash, 0, "0x00", 10, { from: MINER });
      await repCycle.confirmNewHash(0);

      await votingReputation.createPoll(2, SECONDS_PER_DAY, 1);
      const pollId2 = await votingReputation.getPollCount();
      await votingReputation.submitVote(pollId2, soliditySha3(SALT, 0), { from: USER0 });

      await forwardTime(SECONDS_PER_DAY, this);

      const [mask2, siblings2] = await reputationTree.getProof(key);
      await votingReputation.revealVote(pollId1, SALT, 0, key, value1, mask1, siblings1, { from: USER0 });
      await votingReputation.revealVote(pollId2, SALT, 0, key, value2, mask2, siblings2, { from: USER0 });
    });
  });

  describe.only("simple exceptions", async () => {
    let pollId;

    beforeEach(async () => {
      await votingReputation.createPoll(2, SECONDS_PER_DAY, 1);
      pollId = await votingReputation.getPollCount();
    });

    it("cannot submit a vote if voting is closed", async () => {
      await forwardTime(SECONDS_PER_DAY * 2, this);
      await checkErrorRevert(votingReputation.submitVote(pollId, soliditySha3(SALT, 0)), "colony-rep-voting-poll-not-open");
    });

    it("cannot reveal a vote if voting is open", async () => {
      await votingReputation.submitVote(pollId, soliditySha3(SALT, 0));
      await checkErrorRevert(votingReputation.revealVote(pollId, SALT, 1, FAKE, FAKE, 0, []), "colony-rep-voting-poll-still-open");
    });

    it("cannot reveal a vote with a bad secret", async () => {
      await votingReputation.submitVote(pollId, soliditySha3(SALT, 0));
      await forwardTime(SECONDS_PER_DAY, this);
      await checkErrorRevert(votingReputation.revealVote(pollId, SALT, 1, FAKE, FAKE, 0, []), "colony-rep-voting-secret-no-match");
    });

    it("cannot reveal an invalid vote", async () => {
      await votingReputation.submitVote(pollId, soliditySha3(SALT, 2));
      await forwardTime(SECONDS_PER_DAY, this);
      await checkErrorRevert(votingReputation.revealVote(pollId, SALT, 2, FAKE, FAKE, 0, []), "colony-rep-voting-invalid-vote");
    });

    it("cannot reveal a vote with a bad proof", async () => {
      await votingReputation.submitVote(pollId, soliditySha3(SALT, 0));
      await forwardTime(SECONDS_PER_DAY, this);
      await checkErrorRevert(votingReputation.revealVote(pollId, SALT, 0, FAKE, FAKE, 0, []), "colony-rep-voting-invalid-root-hash");
    });

    it("cannot submit a proof with the wrong colony", async () => {
      await votingReputation.submitVote(pollId, soliditySha3(SALT, 0));
      const key = makeReputationKey(metaColony.address, 1, USER0);
      const value = makeReputationValue(WAD, 2);
      const [mask, siblings] = await reputationTree.getProof(key);
      await forwardTime(SECONDS_PER_DAY, this);
      await checkErrorRevert(
        votingReputation.revealVote(pollId, SALT, 0, key, value, mask, siblings, { from: USER0 }),
        "colony-rep-voting-invalid-colony-address"
      );
    });

    it("cannot submit a proof with the wrong skill", async () => {
      await votingReputation.submitVote(pollId, soliditySha3(SALT, 0));
      const key = makeReputationKey(colony.address, 2, USER0);
      const value = makeReputationValue(WAD, 3);
      const [mask, siblings] = await reputationTree.getProof(key);
      await forwardTime(SECONDS_PER_DAY, this);
      await checkErrorRevert(
        votingReputation.revealVote(pollId, SALT, 0, key, value, mask, siblings, { from: USER0 }),
        "colony-rep-voting-invalid-skill-id"
      );
    });

    it("cannot submit a proof with the wrong user", async () => {
      await votingReputation.submitVote(pollId, soliditySha3(SALT, 0));
      const key = makeReputationKey(colony.address, 1, USER1);
      const value = makeReputationValue(WAD, 4);
      const [mask, siblings] = await reputationTree.getProof(key);
      await forwardTime(SECONDS_PER_DAY, this);
      await checkErrorRevert(
        votingReputation.revealVote(pollId, SALT, 0, key, value, mask, siblings, { from: USER0 }),
        "colony-rep-voting-invalid-user-address"
      );
    });
  });
});
