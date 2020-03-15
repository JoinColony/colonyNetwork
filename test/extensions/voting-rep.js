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

const TokenLocking = artifacts.require("TokenLocking");
const VotingReputation = artifacts.require("VotingReputation");
const VotingReputationFactory = artifacts.require("VotingReputationFactory");

contract("Voting Reputation", accounts => {
  let colony;
  let token;
  let domain1;
  let domain2;
  let domain3;
  let metaColony;
  let colonyNetwork;
  let tokenLocking;

  let voting;
  let votingFactory;

  let reputationTree;

  let colonyKey;
  let colonyValue;
  let colonyMask;
  let colonySiblings;

  let user0Key;
  let user0Value;
  let user0Mask;
  let user0Siblings;

  let user1Key;
  let user1Value;
  let user1Mask;
  let user1Siblings;

  const STAKE_WINDOW = SECONDS_PER_DAY * 3;
  const VOTE_WINDOW = SECONDS_PER_DAY * 2;
  const REVEAL_WINDOW = SECONDS_PER_DAY * 2;

  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const USER2 = accounts[2];
  const MINER = accounts[5];

  const SALT = soliditySha3(shortid.generate());
  const FAKE = soliditySha3(shortid.generate());

  const STAKE_YAY = 0;
  const STAKE_NAY = 1;
  const OPEN = 2;
  // const REVEAL = 3;
  // const CLOSED = 4;
  // const EXECUTED = 5;

  const REQUIRED_STAKE = WAD.muln(3).divn(1000);

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

    await giveUserCLNYTokensAndStake(colonyNetwork, MINER, DEFAULT_STAKE);
    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();

    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await TokenLocking.at(tokenLockingAddress);

    votingFactory = await VotingReputationFactory.new();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));

    // 1 => { 2, 3 }
    await colony.addDomain(1, 0, 1);
    await colony.addDomain(1, 0, 1);
    domain1 = await colony.getDomain(1);
    domain2 = await colony.getDomain(2);
    domain3 = await colony.getDomain(3);

    await votingFactory.deployExtension(colony.address);
    const votingAddress = await votingFactory.deployedExtensions(colony.address);
    voting = await VotingReputation.at(votingAddress);
    await colony.setArbitrationRole(1, 0, voting.address, 1, true);
    await colony.setAdministrationRole(1, 0, voting.address, 1, true);

    await token.mint(USER0, WAD);
    await token.mint(USER1, WAD);
    await token.mint(USER2, WAD);
    await token.approve(tokenLocking.address, WAD, { from: USER0 });
    await token.approve(tokenLocking.address, WAD, { from: USER1 });
    await token.approve(tokenLocking.address, WAD, { from: USER2 });
    await tokenLocking.deposit(token.address, WAD, true, { from: USER0 });
    await tokenLocking.deposit(token.address, WAD, true, { from: USER1 });
    await tokenLocking.deposit(token.address, WAD, true, { from: USER2 });
    await colony.approveStake(voting.address, 1, WAD, { from: USER0 });
    await colony.approveStake(voting.address, 1, WAD, { from: USER1 });
    await colony.approveStake(voting.address, 1, WAD, { from: USER2 });
    await tokenLocking.approveStake(colony.address, WAD, { from: USER0 });
    await tokenLocking.approveStake(colony.address, WAD, { from: USER1 });
    await tokenLocking.approveStake(colony.address, WAD, { from: USER2 });

    reputationTree = new PatriciaTree();
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId), // Colony total
      makeReputationValue(WAD.muln(3), 1)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId, USER0), // User0
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
      makeReputationKey(colony.address, domain1.skillId, USER1), // User1 (and 2x value)
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
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId, USER2), // User2, very little rep
      makeReputationValue(REQUIRED_STAKE.subn(1), 8)
    );

    colonyKey = makeReputationKey(colony.address, domain1.skillId);
    colonyValue = makeReputationValue(WAD.muln(3), 1);
    [colonyMask, colonySiblings] = await reputationTree.getProof(colonyKey);

    user0Key = makeReputationKey(colony.address, domain1.skillId, USER0);
    user0Value = makeReputationValue(WAD, 2);
    [user0Mask, user0Siblings] = await reputationTree.getProof(user0Key);

    user1Key = makeReputationKey(colony.address, domain1.skillId, USER1);
    user1Value = makeReputationValue(WAD.muln(2), 5);
    [user1Mask, user1Siblings] = await reputationTree.getProof(user1Key);

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
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createRootPoll(action, colonyKey, colonyValue, colonyMask, colonySiblings);

      const pollId = await voting.getPollCount();
      const poll = await voting.getPoll(pollId);
      expect(poll.skillId).to.eq.BN(domain1.skillId);
    });

    it("can create a domain poll in the root domain", async () => {
      // Create poll in domain of action (1)
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createDomainPoll(1, UINT256_MAX, action, colonyKey, colonyValue, colonyMask, colonySiblings);

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
      // Create poll in parent domain (1) of action (2)
      const action = await encodeTxData(colony, "makeTask", [1, 0, FAKE, 2, 0, 0]);
      await voting.createDomainPoll(1, 0, action, colonyKey, colonyValue, colonyMask, colonySiblings);

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
  });

  describe("staking on polls", async () => {
    let pollId;

    beforeEach(async () => {
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createRootPoll(action, colonyKey, colonyValue, colonyMask, colonySiblings);
      pollId = await voting.getPollCount();
    });

    it("can stake on a poll", async () => {
      await voting.stakePoll(pollId, 1, 0, 1, true, 100, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, 0, 1, true, 100, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      const poll = await voting.getPoll(pollId);
      expect(poll.stakes[0]).to.be.zero;
      expect(poll.stakes[1]).to.eq.BN(200);

      const stake0 = await voting.getStake(pollId, USER0, true);
      const stake1 = await voting.getStake(pollId, USER1, true);
      expect(stake0).to.eq.BN(100);
      expect(stake1).to.eq.BN(100);
    });

    it("updates the poll states correctly", async () => {
      let pollState = await voting.getPollState(pollId);
      expect(pollState).to.eq.BN(STAKE_YAY);

      await voting.stakePoll(pollId, 1, 0, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      pollState = await voting.getPollState(pollId);
      expect(pollState).to.eq.BN(STAKE_NAY);

      await voting.stakePoll(pollId, 1, 0, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      pollState = await voting.getPollState(pollId);
      expect(pollState).to.eq.BN(OPEN);
    });

    it("cannot stake with someone else's reputation", async () => {
      await checkErrorRevert(
        voting.stakePoll(pollId, 1, 0, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER1 }),
        "voting-rep-invalid-user-address"
      );
    });

    it("cannot stake with insufficient reputation", async () => {
      const user2Key = makeReputationKey(colony.address, domain1.skillId, USER2);
      const user2Value = makeReputationValue(REQUIRED_STAKE.subn(1), 8);
      const [user2Mask, user2Siblings] = await reputationTree.getProof(user2Key);

      await checkErrorRevert(
        voting.stakePoll(pollId, 1, 0, 1, true, REQUIRED_STAKE, user2Key, user2Value, user2Mask, user2Siblings, { from: USER2 }),
        "voting-rep-insufficient-rep"
      );
    });

    it("cannot stake more than the required stake", async () => {
      await checkErrorRevert(
        voting.stakePoll(pollId, 1, 0, 1, true, REQUIRED_STAKE.addn(1), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-stake-too-large"
      );
    });

    it("cannot stake with an invalid domainId", async () => {
      await checkErrorRevert(
        voting.stakePoll(pollId, 1, 0, 2, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-bad-stake-domain"
      );
    });

    it("cannot stake out-of-order", async () => {
      await checkErrorRevert(
        voting.stakePoll(pollId, 1, 0, 1, false, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-out-of-order"
      );
    });

    it("cannot stake yay, once time runs out", async () => {
      await forwardTime(STAKE_WINDOW, this);

      await checkErrorRevert(
        voting.stakePoll(pollId, 1, 0, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-staking-closed"
      );
    });

    it("cannot stake nay, once time runs out", async () => {
      await voting.stakePoll(pollId, 1, 0, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_WINDOW, this);

      await checkErrorRevert(
        voting.stakePoll(pollId, 1, 0, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 }),
        "voting-rep-staking-closed"
      );
    });
  });

  describe("voting on polls", async () => {
    let pollId;

    beforeEach(async () => {
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createRootPoll(action, colonyKey, colonyValue, colonyMask, colonySiblings);
      pollId = await voting.getPollCount();

      await voting.stakePoll(pollId, 1, 0, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, 0, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
    });

    it("can rate and reveal for a poll", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });

      await forwardTime(VOTE_WINDOW, this);

      await voting.revealVote(pollId, SALT, false, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
    });

    it("can tally votes from two users", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });
      await voting.submitVote(pollId, soliditySha3(SALT, true), { from: USER1 });

      await forwardTime(VOTE_WINDOW, this);

      await voting.revealVote(pollId, SALT, false, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.revealVote(pollId, SALT, true, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

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
      await checkErrorRevert(
        voting.revealVote(pollId, SALT, false, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-secret-no-match"
      );

      // Revealing second succeeds
      await voting.revealVote(pollId, SALT, true, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
    });

    it("can reveal votes after poll closes, but doesn't count", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });

      await forwardTime(VOTE_WINDOW + REVEAL_WINDOW, this);

      await voting.revealVote(pollId, SALT, false, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      // Vote didn't count
      const { votes } = await voting.getPoll(pollId);
      expect(votes[0]).to.be.zero;
      expect(votes[1]).to.be.zero;
    });

    it("cannot reveal a vote twice, and so cannot vote twice", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });

      await forwardTime(VOTE_WINDOW, this);

      await voting.revealVote(pollId, SALT, false, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await checkErrorRevert(
        voting.revealVote(pollId, SALT, false, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-secret-no-match"
      );
    });

    it("can vote in two polls with two reputation states, with different proofs", async () => {
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });

      // Update reputation state
      const user0Value2 = makeReputationValue(WAD.muln(3), 2);
      await reputationTree.insert(user0Key, user0Value2);

      const [colonyMask2, colonySiblings2] = await reputationTree.getProof(colonyKey);
      const [user0Mask2, user0Siblings2] = await reputationTree.getProof(user0Key);
      const [user1Mask2, user1Siblings2] = await reputationTree.getProof(user1Key);

      // Set new rootHash
      const rootHash = await reputationTree.getRootHash();
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash(rootHash, 0, "0x00", 10, { from: MINER });
      await repCycle.confirmNewHash(0);

      // Create new poll with new reputation state
      await voting.createRootPoll(FAKE, colonyKey, colonyValue, colonyMask2, colonySiblings2);
      const pollId2 = await voting.getPollCount();
      await voting.stakePoll(pollId2, 1, 0, 1, true, REQUIRED_STAKE, user0Key, user0Value2, user0Mask2, user0Siblings2, { from: USER0 });
      await voting.stakePoll(pollId2, 1, 0, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask2, user1Siblings2, { from: USER1 });
      await voting.submitVote(pollId2, soliditySha3(SALT, false), { from: USER0 });

      await forwardTime(VOTE_WINDOW, this);

      await voting.revealVote(pollId, SALT, false, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.revealVote(pollId2, SALT, false, user0Key, user0Value2, user0Mask2, user0Siblings2, { from: USER0 });
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
      await checkErrorRevert(
        voting.revealVote(pollId, SALT, false, user1Key, user1Value, user1Mask, user1Siblings, { from: USER0 }),
        "voting-rep-invalid-user-address"
      );
    });
  });

  describe("executing polls", async () => {
    let pollId;

    beforeEach(async () => {
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createRootPoll(action, colonyKey, colonyValue, colonyMask, colonySiblings);
      pollId = await voting.getPollCount();
    });

    it("cannot take an action if there is insufficient support", async () => {
      await voting.stakePoll(pollId, 1, 0, 1, true, REQUIRED_STAKE.subn(1), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_WINDOW, this);

      await checkErrorRevert(voting.executePoll(pollId), "voting-rep-poll-failed");
    });

    it("can take an action if there is insufficient opposition", async () => {
      await voting.stakePoll(pollId, 1, 0, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, 0, 1, false, REQUIRED_STAKE.subn(1), user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(STAKE_WINDOW, this);

      const taskCountPrev = await colony.getTaskCount();
      await voting.executePoll(pollId);
      const taskCountPost = await colony.getTaskCount();
      expect(taskCountPost).to.eq.BN(taskCountPrev.addn(1));
    });

    it("cannot take an action twice", async () => {
      await voting.stakePoll(pollId, 1, 0, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_WINDOW, this);

      const taskCountPrev = await colony.getTaskCount();
      await voting.executePoll(pollId);
      const taskCountPost = await colony.getTaskCount();
      expect(taskCountPost).to.eq.BN(taskCountPrev.addn(1));

      await checkErrorRevert(voting.executePoll(pollId), "voting-rep-poll-already-executed");
    });

    it("can take an action if the poll passes", async () => {
      await voting.stakePoll(pollId, 1, 0, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, 0, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(pollId, soliditySha3(SALT, true), { from: USER0 });

      await forwardTime(VOTE_WINDOW, this);
      await voting.revealVote(pollId, SALT, true, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await checkErrorRevert(voting.executePoll(pollId), "voting-rep-poll-not-closed");

      await forwardTime(REVEAL_WINDOW * 2, this);
      const taskCountPrev = await colony.getTaskCount();
      await voting.executePoll(pollId);
      const taskCountPost = await colony.getTaskCount();
      expect(taskCountPost).to.eq.BN(taskCountPrev.addn(1));
    });

    it("cannot take an action if the poll fails", async () => {
      await voting.stakePoll(pollId, 1, 0, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, 0, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });

      await forwardTime(VOTE_WINDOW, this);
      await voting.revealVote(pollId, SALT, false, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(REVEAL_WINDOW * 2, this);
      const taskCountPrev = await colony.getTaskCount();
      await voting.executePoll(pollId);
      const taskCountPost = await colony.getTaskCount();
      expect(taskCountPost).to.eq.BN(taskCountPrev);
    });

    it("cannot take an action if there is insufficient voting power (state change actions)", async () => {
      // Set first slot of first expenditure struct to 0x0
      const action = await encodeTxData(colony, "setExpenditureState", [1, UINT256_MAX, 1, 0, [], [], ethers.constants.HashZero]);

      // Create two polls for same variable
      await voting.createDomainPoll(1, UINT256_MAX, action, colonyKey, colonyValue, colonyMask, colonySiblings);
      const pollId1 = await voting.getPollCount();
      await voting.stakePoll(pollId1, 1, 0, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId1, 1, 0, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.createDomainPoll(1, UINT256_MAX, action, colonyKey, colonyValue, colonyMask, colonySiblings);
      const pollId2 = await voting.getPollCount();
      await voting.stakePoll(pollId2, 1, 0, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId2, 1, 0, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(pollId1, soliditySha3(SALT, true), { from: USER0 });
      await voting.submitVote(pollId2, soliditySha3(SALT, true), { from: USER0 });

      await forwardTime(VOTE_WINDOW, this);

      await voting.revealVote(pollId1, SALT, true, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.revealVote(pollId2, SALT, true, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(REVEAL_WINDOW, this);

      await voting.executePoll(pollId1);

      await checkErrorRevert(voting.executePoll(pollId2), "voting-rep-insufficient-vote-power");
    });
  });

  describe("claiming staker rewards", async () => {
    let pollId;

    beforeEach(async () => {
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createRootPoll(action, colonyKey, colonyValue, colonyMask, colonySiblings);
      pollId = await voting.getPollCount();
    });

    it("can let stakers claim rewards, based on the outcome", async () => {
      await voting.stakePoll(pollId, 1, 0, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, 0, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(pollId, soliditySha3(SALT, true), { from: USER0 });
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER1 });
      await forwardTime(VOTE_WINDOW, this);
      await voting.revealVote(pollId, SALT, true, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.revealVote(pollId, SALT, false, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      await forwardTime(REVEAL_WINDOW, this);
      await voting.executePoll(pollId);

      await tokenLocking.claim(token.address, true, { from: USER0 });
      await tokenLocking.claim(token.address, true, { from: USER1 });
      await voting.claimReward(pollId, true, { from: USER0 });
      await voting.claimReward(pollId, false, { from: USER1 });

      const stakerRewards = REQUIRED_STAKE.divn(10).muln(9);
      const expectedReward0 = stakerRewards.divn(3).muln(2); // (stake * .9) * (winPct = 1/3 * 2)
      const expectedReward1 = stakerRewards.divn(3).muln(4); // (stake * .9) * (winPct = 2/3 * 2)

      const user0Lock = await tokenLocking.getUserLock(token.address, USER0);
      const user1Lock = await tokenLocking.getUserLock(token.address, USER1);
      expect(user0Lock.pendingBalance).to.eq.BN(expectedReward0);
      expect(user1Lock.pendingBalance).to.eq.BN(expectedReward1);
    });

    it("cannot claim rewards twice", async () => {
      await voting.stakePoll(pollId, 1, 0, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, 0, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(pollId, soliditySha3(SALT, true), { from: USER0 });
      await forwardTime(VOTE_WINDOW, this);
      await voting.revealVote(pollId, SALT, true, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await forwardTime(REVEAL_WINDOW, this);
      await voting.executePoll(pollId);

      await voting.claimReward(pollId, true, { from: USER0 });
      await tokenLocking.claim(token.address, true, { from: USER0 });
      await voting.claimReward(pollId, true, { from: USER0 });

      const userLock = await tokenLocking.getUserLock(token.address, USER0);
      expect(userLock.pendingBalance).to.be.zero;
    });

    it("cannot claim rewards before a poll is executed", async () => {
      await checkErrorRevert(voting.claimReward(pollId, true, { from: USER0 }), "voting-rep-not-executed");
    });
  });
});
