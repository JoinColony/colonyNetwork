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
const VotingReputationFactory = artifacts.require("VotingReputationFactory");

contract("Voting Reputation", accounts => {
  let colony;
  let metaColony;
  let colonyNetwork;

  let voting;
  let votingFactory;

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

    votingFactory = await VotingReputationFactory.new();
  });

  beforeEach(async () => {
    ({ colony } = await setupRandomColony(colonyNetwork));
    await votingFactory.deployExtension(colony.address);
    const votingAddress = await votingFactory.deployedExtensions(colony.address);
    voting = await VotingReputation.at(votingAddress);

    reputationTree = new PatriciaTree();
    await reputationTree.insert(
      makeReputationKey(colony.address, 1), // Colony total
      makeReputationValue(WAD2.add(WAD), 1)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, 1, USER0), // All good
      makeReputationValue(WAD, 2)
    );
    await reputationTree.insert(
      makeReputationKey(metaColony.address, 1, USER0), // Wrong colony
      makeReputationValue(WAD, 3)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, 2, USER0), // Wrong skill
      makeReputationValue(WAD, 4)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, 1, USER1), // Wrong user (and 2x value)
      makeReputationValue(WAD2, 5)
    );

    const rootHash = await reputationTree.getRootHash();
    const repCycle = await getActiveRepCycle(colonyNetwork);
    await forwardTime(MINING_CYCLE_DURATION, this);
    await repCycle.submitRootHash(rootHash, 0, "0x00", 10, { from: MINER });
    await repCycle.confirmNewHash(0);
  });

  describe("using the extension factory", async () => {
    it("can install the extension factory once if root and uninstall", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await checkErrorRevert(votingFactory.deployExtension(colony.address, { from: USER1 }), "colony-extension-user-not-root");
      await votingFactory.deployExtension(colony.address, { from: USER0 });
      await checkErrorRevert(votingFactory.deployExtension(colony.address, { from: USER0 }), "colony-extension-already-deployed");
      await votingFactory.removeExtension(colony.address, { from: USER0 });
    });
  });

  describe("voting on polls", async () => {
    let key, value, mask, siblings, pollId; // eslint-disable-line one-var

    beforeEach(async () => {
      key = makeReputationKey(colony.address, 1);
      value = makeReputationValue(WAD2.add(WAD), 1);
      [mask, siblings] = await reputationTree.getProof(key);

      const action = await encodeTxData(colony, "makeTask", [1, 0, FAKE, 1, 0, 0]);
      await voting.createPoll(action, SECONDS_PER_DAY, 1, key, value, mask, siblings);
      pollId = await voting.getPollCount();

      key = makeReputationKey(colony.address, 1, USER0);
      value = makeReputationValue(WAD, 2);
      [mask, siblings] = await reputationTree.getProof(key);
    });

    it("can rate and reveal for a poll", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });
      await forwardTime(SECONDS_PER_DAY, this);
      await voting.revealVote(pollId, SALT, false, key, value, mask, siblings, { from: USER0 });
    });

    it("can tally votes from two users", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });
      await voting.submitVote(pollId, soliditySha3(SALT, true), { from: USER1 });

      await forwardTime(SECONDS_PER_DAY, this);
      await voting.revealVote(pollId, SALT, false, key, value, mask, siblings, { from: USER0 });

      key = makeReputationKey(colony.address, 1, USER1);
      value = makeReputationValue(WAD2, 5);
      [mask, siblings] = await reputationTree.getProof(key);
      await voting.revealVote(pollId, SALT, true, key, value, mask, siblings, { from: USER1 });

      // See final counts
      const { votes } = await voting.getPollInfo(pollId);
      expect(votes[0]).to.eq.BN(WAD);
      expect(votes[1]).to.eq.BN(WAD2);
    });

    it("can update votes, but only last one counts", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });
      await voting.submitVote(pollId, soliditySha3(SALT, true), { from: USER0 });

      await forwardTime(SECONDS_PER_DAY, this);

      // Revealing first vote fails
      await checkErrorRevert(voting.revealVote(pollId, SALT, false, key, value, mask, siblings, { from: USER0 }), "voting-rep-secret-no-match");

      // Revealing second succeeds
      await voting.revealVote(pollId, SALT, true, key, value, mask, siblings, { from: USER0 });
    });

    it("can reveal votes after poll closes, but doesn't count", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });

      // Close the poll (1 day voting, 2 day reveal)
      await forwardTime(SECONDS_PER_DAY * 3, this);

      await voting.revealVote(pollId, SALT, false, key, value, mask, siblings, { from: USER0 });

      // Vote didn't count
      const { votes } = await voting.getPollInfo(pollId);
      expect(votes[0]).to.be.zero;
      expect(votes[1]).to.be.zero;
    });

    it("cannot reveal a vote twice, and so cannot vote twice", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });

      await forwardTime(SECONDS_PER_DAY, this);

      await voting.revealVote(pollId, SALT, false, key, value, mask, siblings, { from: USER0 });
      await checkErrorRevert(voting.revealVote(pollId, SALT, false, key, value, mask, siblings, { from: USER0 }), "voting-rep-secret-no-match");
    });

    it("can vote in two polls with two reputation states, with different proofs", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });

      // Update reputation state
      const value2 = makeReputationValue(WAD.muln(3), 2);
      await reputationTree.insert(key, value2);

      // Set new rootHash
      const rootHash = await reputationTree.getRootHash();
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash(rootHash, 0, "0x00", 10, { from: MINER });
      await repCycle.confirmNewHash(0);

      // Create new poll with new reputation state
      const keyColony = makeReputationKey(colony.address, 1);
      const valueColony = makeReputationValue(WAD2.add(WAD), 1);
      const [maskColony, siblingsColony] = await reputationTree.getProof(keyColony);
      await voting.createPoll(FAKE, SECONDS_PER_DAY, 1, keyColony, valueColony, maskColony, siblingsColony);

      const pollId2 = await voting.getPollCount();

      await voting.submitVote(pollId2, soliditySha3(SALT, false), { from: USER0 });

      await forwardTime(SECONDS_PER_DAY, this);

      const [mask2, siblings2] = await reputationTree.getProof(key);
      await voting.revealVote(pollId, SALT, false, key, value, mask, siblings, { from: USER0 });
      await voting.revealVote(pollId2, SALT, false, key, value2, mask2, siblings2, { from: USER0 });
    });

    it("can take an action if the poll passes", async () => {
      await colony.setAdministrationRole(1, 0, voting.address, 1, true);

      await voting.submitVote(pollId, soliditySha3(SALT, true), { from: USER0 });

      await forwardTime(SECONDS_PER_DAY, this);
      await voting.revealVote(pollId, SALT, true, key, value, mask, siblings, { from: USER0 });

      await checkErrorRevert(voting.executePoll(pollId), "voting-base-poll-not-closed");

      await forwardTime(SECONDS_PER_DAY * 2, this);
      const taskCountPrev = await colony.getTaskCount();
      await voting.executePoll(pollId);
      const taskCountPost = await colony.getTaskCount();
      expect(taskCountPost).to.eq.BN(taskCountPrev.addn(1));

      await checkErrorRevert(voting.executePoll(pollId), "voting-base-poll-already-executed");
    });

    it("cannot take an action if the poll fails", async () => {
      await colony.setAdministrationRole(1, 0, voting.address, 1, true);

      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });

      await forwardTime(SECONDS_PER_DAY, this);
      await voting.revealVote(pollId, SALT, false, key, value, mask, siblings, { from: USER0 });

      await forwardTime(SECONDS_PER_DAY * 2, this);
      const taskCountPrev = await colony.getTaskCount();
      await voting.executePoll(pollId);
      const taskCountPost = await colony.getTaskCount();
      expect(taskCountPost).to.eq.BN(taskCountPrev);
    });
  });

  describe("simple exceptions", async () => {
    let pollId;

    beforeEach(async () => {
      const key = makeReputationKey(colony.address, 1);
      const value = makeReputationValue(WAD2.add(WAD), 1);
      const [mask, siblings] = await reputationTree.getProof(key);

      await voting.createPoll(FAKE, SECONDS_PER_DAY, 1, key, value, mask, siblings);
      pollId = await voting.getPollCount();
    });

    it("cannot submit a vote if voting is closed", async () => {
      await forwardTime(SECONDS_PER_DAY * 2, this);
      await checkErrorRevert(voting.submitVote(pollId, soliditySha3(SALT, false)), "voting-rep-poll-not-open");
    });

    it("cannot reveal a vote if voting is open", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false));
      await checkErrorRevert(voting.revealVote(pollId, SALT, true, FAKE, FAKE, 0, []), "voting-rep-poll-still-open");
    });

    it("cannot reveal a vote with a bad secret", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false));
      await forwardTime(SECONDS_PER_DAY, this);
      await checkErrorRevert(voting.revealVote(pollId, SALT, true, FAKE, FAKE, 0, []), "voting-rep-secret-no-match");
    });

    // VotingReputation specific
    it("cannot reveal a vote with a bad proof", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });
      await forwardTime(SECONDS_PER_DAY, this);

      // Invalid proof (wrong root hash)
      await checkErrorRevert(voting.revealVote(pollId, SALT, false, FAKE, FAKE, 0, [], { from: USER0 }), "voting-rep-invalid-root-hash");

      // Invalid colony address
      let key, value, mask, siblings; // eslint-disable-line one-var
      key = makeReputationKey(metaColony.address, 1, USER0);
      value = makeReputationValue(WAD, 3);
      [mask, siblings] = await reputationTree.getProof(key);
      await checkErrorRevert(
        voting.revealVote(pollId, SALT, false, key, value, mask, siblings, { from: USER0 }),
        "voting-rep-invalid-colony-address"
      );

      // Invalid skill id
      key = makeReputationKey(colony.address, 2, USER0);
      value = makeReputationValue(WAD, 4);
      [mask, siblings] = await reputationTree.getProof(key);
      await checkErrorRevert(voting.revealVote(pollId, SALT, false, key, value, mask, siblings, { from: USER0 }), "voting-rep-invalid-skill-id");

      // Invalid user address
      key = makeReputationKey(colony.address, 1, USER1);
      value = makeReputationValue(WAD2, 5);
      [mask, siblings] = await reputationTree.getProof(key);
      await checkErrorRevert(voting.revealVote(pollId, SALT, false, key, value, mask, siblings, { from: USER0 }), "voting-rep-invalid-user-address");
    });
  });
});
