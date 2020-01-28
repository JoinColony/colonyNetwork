/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";
import shortid from "shortid";
import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";

import { UINT256_MAX, WAD, MINING_CYCLE_DURATION, SECONDS_PER_DAY, DEFAULT_STAKE } from "../../helpers/constants";
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
  let domain1;
  let domain2;
  let domain3;
  let metaColony;
  let colonyNetwork;

  let voting;
  let votingFactory;

  let reputationTree;

  const VOTE_WINDOW = SECONDS_PER_DAY * 2;
  const REVEAL_WINDOW = SECONDS_PER_DAY * 2;

  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const MINER = accounts[5];

  const SALT = soliditySha3(shortid.generate());
  const FAKE = soliditySha3(shortid.generate());

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

    await colony.addDomain(1, 0, 1);
    await colony.addDomain(1, 0, 1);
    domain1 = await colony.getDomain(1);
    domain2 = await colony.getDomain(2);
    domain3 = await colony.getDomain(3);

    await votingFactory.deployExtension(colony.address);
    const votingAddress = await votingFactory.deployedExtensions(colony.address);
    voting = await VotingReputation.at(votingAddress);

    reputationTree = new PatriciaTree();
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId), // Colony total
      makeReputationValue(WAD.muln(3), 1)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId, USER0), // All good
      makeReputationValue(WAD, 2)
    );
    await reputationTree.insert(
      makeReputationKey(metaColony.address, domain1.skillId, USER0), // Wrong colony
      makeReputationValue(WAD, 3)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, 1234, USER0), // Wrong skill
      makeReputationValue(WAD, 4)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId, USER1), // Wrong user (and 2x value)
      makeReputationValue(WAD.muln(2), 5)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain2.skillId), // Colony total, domain 2
      makeReputationValue(WAD, 6)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain3.skillId), // Colony total, domain 3
      makeReputationValue(WAD, 7)
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

  describe("creating polls", async () => {
    it("can create a root poll", async () => {
      const key = makeReputationKey(colony.address, domain1.skillId);
      const value = makeReputationValue(WAD.muln(3), 1);
      const [mask, siblings] = await reputationTree.getProof(key);

      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createRootPoll(action, key, value, mask, siblings);

      const pollId = await voting.getPollCount();
      const poll = await voting.getPoll(pollId);
      expect(poll.skillId).to.eq.BN(domain1.skillId);
    });

    it("can create a domain poll in the root domain", async () => {
      const key = makeReputationKey(colony.address, domain1.skillId);
      const value = makeReputationValue(WAD.muln(3), 1);
      const [mask, siblings] = await reputationTree.getProof(key);

      // Create poll in domain of action (1)
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createDomainPoll(1, UINT256_MAX, action, key, value, mask, siblings);

      const pollId = await voting.getPollCount();
      const poll = await voting.getPoll(pollId);
      expect(poll.skillId).to.eq.BN(domain1.skillId);
    });

    it("can create a domain poll in a child domain", async () => {
      const key = makeReputationKey(colony.address, domain2.skillId);
      const value = makeReputationValue(WAD, 6);
      const [mask, siblings] = await reputationTree.getProof(key);

      // Create poll in domain of action (2)
      const action = await encodeTxData(colony, "makeTask", [1, 0, FAKE, 2, 0, 0]);
      await voting.createDomainPoll(2, UINT256_MAX, action, key, value, mask, siblings);

      const pollId = await voting.getPollCount();
      const poll = await voting.getPoll(pollId);
      expect(poll.skillId).to.eq.BN(domain2.skillId);
    });

    it("can escalate a domain poll", async () => {
      const key = makeReputationKey(colony.address, domain1.skillId);
      const value = makeReputationValue(WAD.muln(3), 1);
      const [mask, siblings] = await reputationTree.getProof(key);

      // Create poll in parent domain (1) of action (2)
      const action = await encodeTxData(colony, "makeTask", [1, 0, FAKE, 2, 0, 0]);
      await voting.createDomainPoll(1, 0, action, key, value, mask, siblings);

      const pollId = await voting.getPollCount();
      const poll = await voting.getPoll(pollId);
      expect(poll.skillId).to.eq.BN(domain1.skillId);
    });

    it("cannot escalate a domain poll with an invalid domain proof", async () => {
      const key = makeReputationKey(colony.address, domain3.skillId);
      const value = makeReputationValue(WAD, 7);
      const [mask, siblings] = await reputationTree.getProof(key);

      // Provide proof for (3) instead of (2)
      const action = await encodeTxData(colony, "makeTask", [1, 0, FAKE, 2, 0, 0]);
      await checkErrorRevert(voting.createDomainPoll(1, 1, action, key, value, mask, siblings), "voting-rep-invalid-domain-id");
    });

    it("can stake on a poll", async () => {
      const key = makeReputationKey(colony.address, domain1.skillId);
      const value = makeReputationValue(WAD.muln(3), 1);
      const [mask, siblings] = await reputationTree.getProof(key);

      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createRootPoll(action, key, value, mask, siblings);

      const pollId = await voting.getPollCount();
      await voting.stakePoll(pollId, 1, true, 100, { from: USER0 });
      await voting.stakePoll(pollId, 1, true, 100, { from: USER1 });

      const poll = await voting.getPoll(pollId);
      expect(poll.stakes[0]).to.be.zero;
      expect(poll.stakes[1]).to.eq.BN(200);

      const stake0 = await voting.getStake(pollId, USER0, true);
      const stake1 = await voting.getStake(pollId, USER1, true);
      expect(stake0).to.eq.BN(100);
      expect(stake1).to.eq.BN(100);
    });

    it("cannot stake on both sides of a poll", async () => {
      const key = makeReputationKey(colony.address, domain1.skillId);
      const value = makeReputationValue(WAD.muln(3), 1);
      const [mask, siblings] = await reputationTree.getProof(key);

      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createRootPoll(action, key, value, mask, siblings);

      const pollId = await voting.getPollCount();
      await voting.stakePoll(pollId, 1, true, 100, { from: USER0 });

      await checkErrorRevert(voting.stakePoll(pollId, 1, false, 100, { from: USER0 }), "voting-rep-cannot-stake-both-sides");
    });

    it("cannot stake more than the required stake", async () => {
      const key = makeReputationKey(colony.address, domain1.skillId);
      const value = makeReputationValue(WAD.muln(3), 1);
      const [mask, siblings] = await reputationTree.getProof(key);

      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createRootPoll(action, key, value, mask, siblings);

      const totalStake = WAD.muln(3).divn(1000);
      const pollId = await voting.getPollCount();
      await checkErrorRevert(voting.stakePoll(pollId, 1, true, totalStake.addn(1), { from: USER0 }), "voting-rep-stake-too-large");
    });

    it("cannot stake with an invalid domainId", async () => {
      const key = makeReputationKey(colony.address, domain1.skillId);
      const value = makeReputationValue(WAD.muln(3), 1);
      const [mask, siblings] = await reputationTree.getProof(key);

      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createRootPoll(action, key, value, mask, siblings);

      const pollId = await voting.getPollCount();
      await checkErrorRevert(voting.stakePoll(pollId, 2, true, 100, { from: USER0 }), "voting-rep-bad-stake-domain");
    });
  });

  describe("voting on polls", async () => {
    let key, value, mask, siblings, pollId; // eslint-disable-line one-var

    beforeEach(async () => {
      key = makeReputationKey(colony.address, domain1.skillId);
      value = makeReputationValue(WAD.muln(3), 1);
      [mask, siblings] = await reputationTree.getProof(key);

      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createRootPoll(action, key, value, mask, siblings);
      pollId = await voting.getPollCount();

      key = makeReputationKey(colony.address, domain1.skillId, USER0);
      value = makeReputationValue(WAD, 2);
      [mask, siblings] = await reputationTree.getProof(key);
    });

    it("can rate and reveal for a poll", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });
      await forwardTime(VOTE_WINDOW, this);
      await voting.revealVote(pollId, SALT, false, key, value, mask, siblings, { from: USER0 });
    });

    it("can tally votes from two users", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });
      await voting.submitVote(pollId, soliditySha3(SALT, true), { from: USER1 });

      await forwardTime(VOTE_WINDOW, this);
      await voting.revealVote(pollId, SALT, false, key, value, mask, siblings, { from: USER0 });

      key = makeReputationKey(colony.address, domain1.skillId, USER1);
      value = makeReputationValue(WAD.muln(2), 5);
      [mask, siblings] = await reputationTree.getProof(key);
      await voting.revealVote(pollId, SALT, true, key, value, mask, siblings, { from: USER1 });

      // See final counts
      const { votes } = await voting.getPoll(pollId);
      expect(votes[0]).to.eq.BN(WAD);
      expect(votes[1]).to.eq.BN(WAD.muln(2));
    });

    it("can update votes, but only last one counts", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });
      await voting.submitVote(pollId, soliditySha3(SALT, true), { from: USER0 });

      await forwardTime(VOTE_WINDOW, this);

      // Revealing first vote fails
      await checkErrorRevert(voting.revealVote(pollId, SALT, false, key, value, mask, siblings, { from: USER0 }), "voting-rep-secret-no-match");

      // Revealing second succeeds
      await voting.revealVote(pollId, SALT, true, key, value, mask, siblings, { from: USER0 });
    });

    it("can reveal votes after poll closes, but doesn't count", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });

      await forwardTime(VOTE_WINDOW + REVEAL_WINDOW, this);

      await voting.revealVote(pollId, SALT, false, key, value, mask, siblings, { from: USER0 });

      // Vote didn't count
      const { votes } = await voting.getPoll(pollId);
      expect(votes[0]).to.be.zero;
      expect(votes[1]).to.be.zero;
    });

    it("cannot reveal a vote twice, and so cannot vote twice", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });

      await forwardTime(VOTE_WINDOW, this);

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
      const keyColony = makeReputationKey(colony.address, domain1.skillId);
      const valueColony = makeReputationValue(WAD.muln(3), 1);
      const [maskColony, siblingsColony] = await reputationTree.getProof(keyColony);
      await voting.createRootPoll(FAKE, keyColony, valueColony, maskColony, siblingsColony);

      const pollId2 = await voting.getPollCount();

      await voting.submitVote(pollId2, soliditySha3(SALT, false), { from: USER0 });

      await forwardTime(VOTE_WINDOW, this);

      const [mask2, siblings2] = await reputationTree.getProof(key);
      await voting.revealVote(pollId, SALT, false, key, value, mask, siblings, { from: USER0 });
      await voting.revealVote(pollId2, SALT, false, key, value2, mask2, siblings2, { from: USER0 });
    });

    it("can take an action if the poll passes", async () => {
      await colony.setAdministrationRole(1, 0, voting.address, 1, true);

      await voting.submitVote(pollId, soliditySha3(SALT, true), { from: USER0 });

      await forwardTime(VOTE_WINDOW, this);
      await voting.revealVote(pollId, SALT, true, key, value, mask, siblings, { from: USER0 });

      await checkErrorRevert(voting.executePoll(pollId), "voting-base-poll-not-closed");

      await forwardTime(REVEAL_WINDOW * 2, this);
      const taskCountPrev = await colony.getTaskCount();
      await voting.executePoll(pollId);
      const taskCountPost = await colony.getTaskCount();
      expect(taskCountPost).to.eq.BN(taskCountPrev.addn(1));

      await checkErrorRevert(voting.executePoll(pollId), "voting-base-poll-already-executed");
    });

    it("cannot take an action if the poll fails", async () => {
      await colony.setAdministrationRole(1, 0, voting.address, 1, true);

      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });

      await forwardTime(VOTE_WINDOW, this);
      await voting.revealVote(pollId, SALT, false, key, value, mask, siblings, { from: USER0 });

      await forwardTime(REVEAL_WINDOW * 2, this);
      const taskCountPrev = await colony.getTaskCount();
      await voting.executePoll(pollId);
      const taskCountPost = await colony.getTaskCount();
      expect(taskCountPost).to.eq.BN(taskCountPrev);
    });

    it("cannot take an action if there is insufficient voting power (state change actions)", async () => {
      await colony.setArbitrationRole(1, 0, voting.address, 1, true);

      key = makeReputationKey(colony.address, domain1.skillId);
      value = makeReputationValue(WAD.muln(3), 1);
      [mask, siblings] = await reputationTree.getProof(key);

      // Set first slot of first expenditure struct to 0x0
      const action = await encodeTxData(colony, "setExpenditureState", [1, UINT256_MAX, 1, 0, [], [], ethers.constants.HashZero]);

      // Create two polls for same variable
      await voting.createDomainPoll(1, UINT256_MAX, action, key, value, mask, siblings);
      const pollId1 = await voting.getPollCount();
      await voting.createDomainPoll(1, UINT256_MAX, action, key, value, mask, siblings);
      const pollId2 = await voting.getPollCount();

      key = makeReputationKey(colony.address, domain1.skillId, USER0);
      value = makeReputationValue(WAD, 2);
      [mask, siblings] = await reputationTree.getProof(key);

      await voting.submitVote(pollId1, soliditySha3(SALT, true), { from: USER0 });
      await voting.submitVote(pollId2, soliditySha3(SALT, true), { from: USER0 });

      await forwardTime(VOTE_WINDOW, this);

      await voting.revealVote(pollId1, SALT, true, key, value, mask, siblings, { from: USER0 });
      await voting.revealVote(pollId2, SALT, true, key, value, mask, siblings, { from: USER0 });

      await forwardTime(REVEAL_WINDOW, this);

      await voting.executePoll(pollId1);

      await checkErrorRevert(voting.executePoll(pollId2), "voting-rep-insufficient-vote-power");
    });
  });

  describe("simple exceptions", async () => {
    let pollId;

    beforeEach(async () => {
      const key = makeReputationKey(colony.address, domain1.skillId);
      const value = makeReputationValue(WAD.muln(3), 1);
      const [mask, siblings] = await reputationTree.getProof(key);

      await voting.createRootPoll(FAKE, key, value, mask, siblings);
      pollId = await voting.getPollCount();
    });

    it("cannot submit a vote if voting is closed", async () => {
      await forwardTime(VOTE_WINDOW, this);
      await checkErrorRevert(voting.submitVote(pollId, soliditySha3(SALT, false)), "voting-rep-poll-not-open");
    });

    it("cannot reveal a vote if voting is open", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false));
      await checkErrorRevert(voting.revealVote(pollId, SALT, true, FAKE, FAKE, 0, []), "voting-rep-poll-still-open");
    });

    it("cannot reveal a vote with a bad secret", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false));
      await forwardTime(VOTE_WINDOW, this);
      await checkErrorRevert(voting.revealVote(pollId, SALT, true, FAKE, FAKE, 0, []), "voting-rep-secret-no-match");
    });

    // VotingReputation specific
    it("cannot reveal a vote with a bad proof", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });
      await forwardTime(VOTE_WINDOW, this);

      // Invalid proof (wrong root hash)
      await checkErrorRevert(voting.revealVote(pollId, SALT, false, FAKE, FAKE, 0, [], { from: USER0 }), "voting-rep-invalid-root-hash");

      // Invalid colony address
      let key, value, mask, siblings; // eslint-disable-line one-var
      key = makeReputationKey(metaColony.address, domain1.skillId, USER0);
      value = makeReputationValue(WAD, 3);
      [mask, siblings] = await reputationTree.getProof(key);
      await checkErrorRevert(
        voting.revealVote(pollId, SALT, false, key, value, mask, siblings, { from: USER0 }),
        "voting-rep-invalid-colony-address"
      );

      // Invalid skill id
      key = makeReputationKey(colony.address, 1234, USER0);
      value = makeReputationValue(WAD, 4);
      [mask, siblings] = await reputationTree.getProof(key);
      await checkErrorRevert(voting.revealVote(pollId, SALT, false, key, value, mask, siblings, { from: USER0 }), "voting-rep-invalid-skill-id");

      // Invalid user address
      key = makeReputationKey(colony.address, domain1.skillId, USER1);
      value = makeReputationValue(WAD.muln(2), 5);
      [mask, siblings] = await reputationTree.getProof(key);
      await checkErrorRevert(voting.revealVote(pollId, SALT, false, key, value, mask, siblings, { from: USER0 }), "voting-rep-invalid-user-address");
    });
  });
});
