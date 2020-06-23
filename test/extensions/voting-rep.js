/* globals artifacts */

import BN from "bn.js";
import chai from "chai";
import bnChai from "bn-chai";
import shortid from "shortid";
import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";

import { UINT256_MAX, WAD, MINING_CYCLE_DURATION, SECONDS_PER_DAY, DEFAULT_STAKE } from "../../helpers/constants";
import {
  checkErrorRevert,
  makeReputationKey,
  makeReputationValue,
  getActiveRepCycle,
  forwardTime,
  encodeTxData,
  bn2bytes32,
} from "../../helpers/test-helper";

import {
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  setupRandomColony,
  giveUserCLNYTokensAndStake,
} from "../../helpers/test-data-generator";

import PatriciaTree from "../../packages/reputation-miner/patricia";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const TokenLocking = artifacts.require("TokenLocking");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const VotingReputation = artifacts.require("VotingReputation");
const VotingReputationFactory = artifacts.require("VotingReputationFactory");

contract("Voting Reputation", (accounts) => {
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

  let domain1Key;
  let domain1Value;
  let domain1Mask;
  let domain1Siblings;

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

  const STAKING = 0;
  const VOTING = 1;
  // const REVEAL = 2;
  // const CLOSED = 3;
  const EXECUTABLE = 4;
  // const EXECUTED = 5;
  const FAILED = 6;

  const FOLD = 1;
  const CALL = 2;

  const ADDRESS_ZERO = ethers.constants.AddressZero;
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
    await colony.addDomain(1, UINT256_MAX, 1);
    await colony.addDomain(1, UINT256_MAX, 1);
    domain1 = await colony.getDomain(1);
    domain2 = await colony.getDomain(2);
    domain3 = await colony.getDomain(3);

    await votingFactory.deployExtension(colony.address);
    const votingAddress = await votingFactory.deployedExtensions(colony.address);
    voting = await VotingReputation.at(votingAddress);
    await voting.initialise(WAD.divn(1000), WAD.divn(10), WAD.muln(2).divn(3));
    await colony.setArbitrationRole(1, UINT256_MAX, voting.address, 1, true);
    await colony.setAdministrationRole(1, UINT256_MAX, voting.address, 1, true);

    await token.mint(USER0, WAD);
    await token.mint(USER1, WAD);
    await token.mint(USER2, WAD);
    await token.approve(tokenLocking.address, WAD, { from: USER0 });
    await token.approve(tokenLocking.address, WAD, { from: USER1 });
    await token.approve(tokenLocking.address, WAD, { from: USER2 });
    await tokenLocking.deposit(token.address, WAD, { from: USER0 });
    await tokenLocking.deposit(token.address, WAD, { from: USER1 });
    await tokenLocking.deposit(token.address, WAD, { from: USER2 });
    await colony.approveStake(voting.address, 1, WAD, { from: USER0 });
    await colony.approveStake(voting.address, 1, WAD, { from: USER1 });
    await colony.approveStake(voting.address, 1, WAD, { from: USER2 });

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
    await reputationTree.insert(
      makeReputationKey(colony.address, domain2.skillId, USER0), // User0, domain 2
      makeReputationValue(WAD.divn(3), 9)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain2.skillId, USER1), // User1, domain 2
      makeReputationValue(WAD.divn(3).muln(2), 10)
    );

    domain1Key = makeReputationKey(colony.address, domain1.skillId);
    domain1Value = makeReputationValue(WAD.muln(3), 1);
    [domain1Mask, domain1Siblings] = await reputationTree.getProof(domain1Key);

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

  describe("deploying the extension", async () => {
    it("can install the extension factory once if root and uninstall", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await checkErrorRevert(votingFactory.deployExtension(colony.address, { from: USER1 }), "colony-extension-user-not-root");
      await votingFactory.deployExtension(colony.address, { from: USER0 });
      await checkErrorRevert(votingFactory.deployExtension(colony.address, { from: USER0 }), "colony-extension-already-deployed");
      await votingFactory.removeExtension(colony.address, { from: USER0 });
    });

    it("can deprecate the extension", async () => {
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createRootPoll(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);

      await voting.deprecate();

      await checkErrorRevert(
        voting.createRootPoll(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings),
        "voting-rep-not-active"
      );
    });
  });

  describe("creating polls", async () => {
    it("can create a root poll", async () => {
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createRootPoll(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);

      const pollId = await voting.getPollCount();
      const poll = await voting.getPoll(pollId);
      expect(poll.skillId).to.eq.BN(domain1.skillId);
    });

    it("can create a domain poll in the root domain", async () => {
      // Create poll in domain of action (1)
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createDomainPoll(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);

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
      await voting.createDomainPoll(2, UINT256_MAX, ADDRESS_ZERO, action, key, value, mask, siblings);

      const pollId = await voting.getPollCount();
      const poll = await voting.getPoll(pollId);
      expect(poll.skillId).to.eq.BN(domain2.skillId);
    });

    it("can externally escalate a domain poll", async () => {
      // Create poll in parent domain (1) of action (2)
      const action = await encodeTxData(colony, "makeTask", [1, 0, FAKE, 2, 0, 0]);
      await voting.createDomainPoll(1, 0, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);

      const pollId = await voting.getPollCount();
      const poll = await voting.getPoll(pollId);
      expect(poll.skillId).to.eq.BN(domain1.skillId);
    });

    it("cannot externally escalate a domain poll with an invalid domain proof", async () => {
      const key = makeReputationKey(colony.address, domain3.skillId);
      const value = makeReputationValue(WAD, 7);
      const [mask, siblings] = await reputationTree.getProof(key);

      // Provide proof for (3) instead of (2)
      const action = await encodeTxData(colony, "makeTask", [1, 0, FAKE, 2, 0, 0]);
      await checkErrorRevert(voting.createDomainPoll(1, 1, ADDRESS_ZERO, action, key, value, mask, siblings), "voting-rep-invalid-domain-id");
    });
  });

  describe("staking on polls", async () => {
    let pollId;

    beforeEach(async () => {
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createRootPoll(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      pollId = await voting.getPollCount();
    });

    it("can stake on a poll", async () => {
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, 100, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, 100, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      const poll = await voting.getPoll(pollId);
      expect(poll.stakes[0]).to.be.zero;
      expect(poll.stakes[1]).to.eq.BN(200);

      const stake0 = await voting.getStake(pollId, USER0, true);
      const stake1 = await voting.getStake(pollId, USER1, true);
      expect(stake0).to.eq.BN(100);
      expect(stake1).to.eq.BN(100);
    });

    it("can update the poll states correctly", async () => {
      let pollState = await voting.getPollState(pollId);
      expect(pollState).to.eq.BN(STAKING);

      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      pollState = await voting.getPollState(pollId);
      expect(pollState).to.eq.BN(STAKING);

      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      pollState = await voting.getPollState(pollId);
      expect(pollState).to.eq.BN(STAKING);

      await voting.respondToStake(pollId, true, CALL, { from: USER0 });
      pollState = await voting.getPollState(pollId);
      expect(pollState).to.eq.BN(STAKING);

      await voting.respondToStake(pollId, false, CALL, { from: USER1 });
      pollState = await voting.getPollState(pollId);
      expect(pollState).to.eq.BN(VOTING);
    });

    it("can go to a vote even if both sides do not call", async () => {
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(STAKE_WINDOW, this);

      const pollState = await voting.getPollState(pollId);
      expect(pollState).to.eq.BN(VOTING);
    });

    it("cannot execute if the YAY side stakes and folds", async () => {
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.respondToStake(pollId, true, FOLD, { from: USER0 });

      const pollState = await voting.getPollState(pollId);
      expect(pollState).to.eq.BN(FAILED);
    });

    it("can execute if the NAY side stakes and folds", async () => {
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.respondToStake(pollId, false, FOLD, { from: USER1 });

      const pollState = await voting.getPollState(pollId);
      expect(pollState).to.eq.BN(EXECUTABLE);
    });

    it("cannot respond to a stake if not fully staked", async () => {
      await checkErrorRevert(voting.respondToStake(pollId, true, CALL, { from: USER0 }), "voting-rep-not-fully-staked");
    });

    it("cannot respond to a stake if not in the staking phase", async () => {
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(STAKE_WINDOW, this);

      await checkErrorRevert(voting.respondToStake(pollId, true, CALL, { from: USER0 }), "voting-rep-not-staking");
    });

    it("cannot respond to a stake if not the lead", async () => {
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await checkErrorRevert(voting.respondToStake(pollId, true, CALL, { from: USER2 }), "voting-rep-not-lead");
    });

    it("cannot respond to a stake twice", async () => {
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.respondToStake(pollId, true, CALL, { from: USER0 });

      await checkErrorRevert(voting.respondToStake(pollId, true, CALL, { from: USER0 }), "voting-rep-already-responded");
    });

    it("cannot stake for an action while there is an active poll for the same action", async () => {
      let activePoll;

      const { action } = await voting.getPoll(pollId);
      activePoll = await voting.getActivePoll(soliditySha3(action));
      expect(activePoll).to.be.zero;

      await forwardTime(STAKE_WINDOW / 2, this);
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      activePoll = await voting.getActivePoll(soliditySha3(action));
      expect(activePoll).to.eq.BN(pollId);

      await voting.createRootPoll(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const otherPollId = await voting.getPollCount();

      await checkErrorRevert(
        voting.stakePoll(otherPollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-competing-poll-exists"
      );

      // But, can stake once the first poll is executed.
      await forwardTime(STAKE_WINDOW / 2, this);
      await voting.executePoll(pollId);

      activePoll = await voting.getActivePoll(soliditySha3(action));
      expect(activePoll).to.be.zero;

      await voting.stakePoll(otherPollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      activePoll = await voting.getActivePoll(soliditySha3(action));
      expect(activePoll).to.eq.BN(otherPollId);
    });

    it("can update the expenditure globalClaimDelay if voting on expenditure state", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1);
      const expenditureId = await colony.getExpenditureCount();

      // Set payoutModifier to 1 for expenditure slot 0
      const action = await encodeTxData(colony, "setExpenditureState", [
        1,
        UINT256_MAX,
        expenditureId,
        25,
        [true],
        [bn2bytes32(new BN(3))],
        bn2bytes32(WAD),
      ]);

      await voting.createDomainPoll(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      pollId = await voting.getPollCount();

      let expenditurePollCount;
      expenditurePollCount = await voting.getExpenditurePollCount(soliditySha3(expenditureId));
      expect(expenditurePollCount).to.be.zero;

      let expenditureSlot;
      expenditureSlot = await colony.getExpenditure(expenditureId);
      expect(expenditureSlot.globalClaimDelay).to.be.zero;

      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      expenditurePollCount = await voting.getExpenditurePollCount(soliditySha3(expenditureId));
      expect(expenditurePollCount).to.eq.BN(1);

      expenditureSlot = await colony.getExpenditure(expenditureId);
      expect(expenditureSlot.globalClaimDelay).to.eq.BN(UINT256_MAX);
    });

    it("can update the expenditure slot claimDelay if voting on expenditure slot state", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1);
      const expenditureId = await colony.getExpenditureCount();

      // Set payoutModifier to 1 for expenditure slot 0
      const action = await encodeTxData(colony, "setExpenditureState", [
        1,
        UINT256_MAX,
        expenditureId,
        26,
        [false, true],
        ["0x0", bn2bytes32(new BN(2))],
        bn2bytes32(WAD),
      ]);

      await voting.createDomainPoll(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      pollId = await voting.getPollCount();

      let expenditurePollCount;
      expenditurePollCount = await voting.getExpenditurePollCount(soliditySha3(expenditureId, 0));
      expect(expenditurePollCount).to.be.zero;

      let expenditureSlot;
      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.be.zero;

      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      expenditurePollCount = await voting.getExpenditurePollCount(soliditySha3(expenditureId, 0));
      expect(expenditurePollCount).to.eq.BN(1);

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.eq.BN(UINT256_MAX);
    });

    it("can update the expenditure slot claimDelay if voting on expenditure payout state", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1);
      const expenditureId = await colony.getExpenditureCount();

      // Set payout to WAD for expenditure slot 0, internal token
      const action = await encodeTxData(colony, "setExpenditureState", [
        1,
        UINT256_MAX,
        expenditureId,
        27,
        [false, false],
        ["0x0", bn2bytes32(new BN(token.address.slice(2), 16))],
        bn2bytes32(WAD),
      ]);

      await voting.createDomainPoll(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      pollId = await voting.getPollCount();

      let expenditurePollCount;
      expenditurePollCount = await voting.getExpenditurePollCount(soliditySha3(expenditureId, 0));
      expect(expenditurePollCount).to.be.zero;

      let expenditureSlot;
      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.be.zero;

      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      expenditurePollCount = await voting.getExpenditurePollCount(soliditySha3(expenditureId, 0));
      expect(expenditurePollCount).to.eq.BN(1);

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.eq.BN(UINT256_MAX);
    });

    it("can accurately track the number of polls for a single expenditure", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1);
      const expenditureId = await colony.getExpenditureCount();
      const expenditureHash = soliditySha3(expenditureId, 0);

      // Set payoutModifier to 1 for expenditure slot 0
      const action1 = await encodeTxData(colony, "setExpenditureState", [
        1,
        UINT256_MAX,
        expenditureId,
        26,
        [false, true],
        ["0x0", bn2bytes32(new BN(2))],
        bn2bytes32(WAD),
      ]);

      // Set payout to WAD for expenditure slot 0, internal token
      const action2 = await encodeTxData(colony, "setExpenditureState", [
        1,
        UINT256_MAX,
        expenditureId,
        27,
        [false, false],
        ["0x0", bn2bytes32(new BN(token.address.slice(2), 16))],
        bn2bytes32(WAD),
      ]);

      await voting.createDomainPoll(1, UINT256_MAX, ADDRESS_ZERO, action1, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const pollId1 = await voting.getPollCount();

      await voting.createDomainPoll(1, UINT256_MAX, ADDRESS_ZERO, action2, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const pollId2 = await voting.getPollCount();

      let expenditurePollCount;
      expenditurePollCount = await voting.getExpenditurePollCount(expenditureHash);
      expect(expenditurePollCount).to.be.zero;

      let expenditureSlot;
      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.be.zero;

      await voting.stakePoll(pollId1, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId2, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      expenditurePollCount = await voting.getExpenditurePollCount(expenditureHash);
      expect(expenditurePollCount).to.eq.BN(2);

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.eq.BN(UINT256_MAX);

      await forwardTime(STAKE_WINDOW, this);
      await voting.executePoll(pollId1);

      expenditurePollCount = await voting.getExpenditurePollCount(expenditureHash);
      expect(expenditurePollCount).to.eq.BN(1);

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.eq.BN(UINT256_MAX);

      await voting.executePoll(pollId2);

      expenditurePollCount = await voting.getExpenditurePollCount(expenditureHash);
      expect(expenditurePollCount).to.be.zero;

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.claimDelay).to.be.zero;
    });

    it("cannot stake with someone else's reputation", async () => {
      await checkErrorRevert(
        voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER1 }),
        "voting-rep-invalid-user-address"
      );
    });

    it("cannot stake with insufficient reputation", async () => {
      const user2Key = makeReputationKey(colony.address, domain1.skillId, USER2);
      const user2Value = makeReputationValue(REQUIRED_STAKE.subn(1), 8);
      const [user2Mask, user2Siblings] = await reputationTree.getProof(user2Key);

      await checkErrorRevert(
        voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user2Key, user2Value, user2Mask, user2Siblings, { from: USER2 }),
        "voting-rep-insufficient-rep"
      );
    });

    it("cannot stake more than the required stake", async () => {
      await checkErrorRevert(
        voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE.addn(1), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-stake-too-large"
      );
    });

    it("cannot stake with an invalid domainId", async () => {
      await checkErrorRevert(
        voting.stakePoll(pollId, 1, 0, 2, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-bad-domain-id"
      );
    });

    it("cannot stake once time runs out", async () => {
      await forwardTime(STAKE_WINDOW, this);

      await checkErrorRevert(
        voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "voting-rep-staking-closed"
      );

      await checkErrorRevert(
        voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 }),
        "voting-rep-staking-closed"
      );
    });
  });

  describe("voting on polls", async () => {
    let pollId;

    beforeEach(async () => {
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createRootPoll(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      pollId = await voting.getPollCount();

      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.respondToStake(pollId, true, CALL, { from: USER0 });
      await voting.respondToStake(pollId, false, CALL, { from: USER1 });
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

    it("can update votes, but just the last one counts", async () => {
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

      await forwardTime(VOTE_WINDOW, this);
      await forwardTime(REVEAL_WINDOW, this);

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

      const [domain1Mask2, domain1Siblings2] = await reputationTree.getProof(domain1Key);
      const [user0Mask2, user0Siblings2] = await reputationTree.getProof(user0Key);
      const [user1Mask2, user1Siblings2] = await reputationTree.getProof(user1Key);

      // Set new rootHash
      const rootHash = await reputationTree.getRootHash();
      const repCycle = await getActiveRepCycle(colonyNetwork);

      await forwardTime(MINING_CYCLE_DURATION, this);

      await repCycle.submitRootHash(rootHash, 0, "0x00", 10, { from: MINER });
      await repCycle.confirmNewHash(0);

      // Create new poll with new reputation state
      await voting.createRootPoll(ADDRESS_ZERO, FAKE, domain1Key, domain1Value, domain1Mask2, domain1Siblings2);
      const pollId2 = await voting.getPollCount();
      await voting.stakePoll(pollId2, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value2, user0Mask2, user0Siblings2, { from: USER0 });
      await voting.stakePoll(pollId2, 1, UINT256_MAX, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask2, user1Siblings2, { from: USER1 });
      await voting.respondToStake(pollId2, true, CALL, { from: USER0 });
      await voting.respondToStake(pollId2, false, CALL, { from: USER1 });

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
      await voting.createRootPoll(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      pollId = await voting.getPollCount();
    });

    it("cannot take an action if there is insufficient support", async () => {
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE.subn(1), user0Key, user0Value, user0Mask, user0Siblings, {
        from: USER0,
      });

      await forwardTime(STAKE_WINDOW, this);

      await checkErrorRevert(voting.executePoll(pollId), "voting-rep-poll-failed");
    });

    it("can take an action if there is insufficient opposition", async () => {
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, REQUIRED_STAKE.subn(1), user1Key, user1Value, user1Mask, user1Siblings, {
        from: USER1,
      });

      await forwardTime(STAKE_WINDOW, this);

      const { logs } = await voting.executePoll(pollId);
      expect(logs[0].args.success).to.be.true;
    });

    it("can take an action with an arbitrary target", async () => {
      const { colony: otherColony } = await setupRandomColony(colonyNetwork);
      await token.mint(otherColony.address, WAD, { from: USER0 });

      const action = await encodeTxData(colony, "claimColonyFunds", [token.address]);
      await voting.createRootPoll(otherColony.address, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      pollId = await voting.getPollCount();

      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_WINDOW, this);

      const balanceBefore = await otherColony.getFundingPotBalance(1, token.address);
      expect(balanceBefore).to.be.zero;

      await voting.executePoll(pollId);

      const balanceAfter = await otherColony.getFundingPotBalance(1, token.address);
      expect(balanceAfter).to.eq.BN(WAD);
    });

    it("cannot take an action during staking or voting", async () => {
      let pollState;
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      pollState = await voting.getPollState(pollId);
      expect(pollState).to.eq.BN(STAKING);
      await checkErrorRevert(voting.executePoll(pollId), "voting-rep-poll-not-executable");

      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      await voting.respondToStake(pollId, true, CALL, { from: USER0 });
      await voting.respondToStake(pollId, false, CALL, { from: USER1 });

      pollState = await voting.getPollState(pollId);
      expect(pollState).to.eq.BN(VOTING);
      await checkErrorRevert(voting.executePoll(pollId), "voting-rep-poll-not-executable");
    });

    it("cannot take an action twice", async () => {
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_WINDOW, this);

      const { logs } = await voting.executePoll(pollId);
      expect(logs[0].args.success).to.be.true;

      await checkErrorRevert(voting.executePoll(pollId), "voting-rep-poll-already-executed");
    });

    it("can take an action if the poll passes", async () => {
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      await voting.respondToStake(pollId, true, CALL, { from: USER0 });
      await voting.respondToStake(pollId, false, CALL, { from: USER1 });

      await voting.submitVote(pollId, soliditySha3(SALT, true), { from: USER0 });

      await forwardTime(VOTE_WINDOW, this);

      await voting.revealVote(pollId, SALT, true, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(REVEAL_WINDOW, this);

      await checkErrorRevert(voting.executePoll(pollId), "voting-rep-poll-escalation-window-open");

      await forwardTime(STAKE_WINDOW, this);

      const { logs } = await voting.executePoll(pollId);
      expect(logs[0].args.success).to.be.true;
    });

    it("cannot take an action if the poll fails", async () => {
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      await voting.respondToStake(pollId, true, CALL, { from: USER0 });
      await voting.respondToStake(pollId, false, CALL, { from: USER1 });

      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });

      await forwardTime(VOTE_WINDOW, this);

      await voting.revealVote(pollId, SALT, false, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(REVEAL_WINDOW, this);
      await forwardTime(STAKE_WINDOW, this);

      const { logs } = await voting.executePoll(pollId);
      expect(logs[0].args.success).to.be.false;
    });

    it("cannot take an action if there is insufficient voting power (state change actions)", async () => {
      // Set first slot of first expenditure struct to 0x0
      const action = await encodeTxData(colony, "setExpenditureState", [1, UINT256_MAX, 1, 0, [], [], ethers.constants.HashZero]);
      let logs;

      await voting.createDomainPoll(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const pollId1 = await voting.getPollCount();

      await voting.stakePoll(pollId1, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId1, 1, UINT256_MAX, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      await voting.respondToStake(pollId1, true, CALL, { from: USER0 });
      await voting.respondToStake(pollId1, false, CALL, { from: USER1 });

      await voting.submitVote(pollId1, soliditySha3(SALT, true), { from: USER0 });

      await forwardTime(VOTE_WINDOW, this);

      await voting.revealVote(pollId1, SALT, true, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(REVEAL_WINDOW, this);
      await forwardTime(STAKE_WINDOW, this);

      ({ logs } = await voting.executePoll(pollId1));
      expect(logs[0].args.success).to.be.true;

      // Create another poll for the same variable
      await voting.createDomainPoll(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const pollId2 = await voting.getPollCount();

      await voting.stakePoll(pollId2, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId2, 1, UINT256_MAX, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      await voting.respondToStake(pollId2, true, CALL, { from: USER0 });
      await voting.respondToStake(pollId2, false, CALL, { from: USER1 });

      await voting.submitVote(pollId2, soliditySha3(SALT, true), { from: USER0 });

      await forwardTime(VOTE_WINDOW, this);

      await voting.revealVote(pollId2, SALT, true, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(REVEAL_WINDOW, this);
      await forwardTime(STAKE_WINDOW, this);

      ({ logs } = await voting.executePoll(pollId2));
      expect(logs[0].args.success).to.be.false;
    });

    it("can set vote power correctly if there is insufficient opposition", async () => {
      const action = await encodeTxData(colony, "setExpenditureState", [1, UINT256_MAX, 1, 0, [], [], ethers.constants.HashZero]);

      await voting.createDomainPoll(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      pollId = await voting.getPollCount();

      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_WINDOW, this);

      await voting.executePoll(pollId);
      const slot = soliditySha3(action.slice(0, action.length - 64));
      const pastPoll = await voting.getPastPoll(slot);
      expect(pastPoll).to.eq.BN(WAD.muln(2).subn(2)); // ~66.6% of 3 WAD
    });

    it("can set vote power correctly after a vote", async () => {
      const action = await encodeTxData(colony, "setExpenditureState", [1, UINT256_MAX, 1, 0, [], [], ethers.constants.HashZero]);

      await voting.createDomainPoll(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      pollId = await voting.getPollCount();

      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      await voting.respondToStake(pollId, true, CALL, { from: USER0 });
      await voting.respondToStake(pollId, false, CALL, { from: USER1 });

      await voting.submitVote(pollId, soliditySha3(SALT, true), { from: USER0 });

      await forwardTime(VOTE_WINDOW, this);

      await voting.revealVote(pollId, SALT, true, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(REVEAL_WINDOW, this);
      await forwardTime(STAKE_WINDOW, this);

      await voting.executePoll(pollId);
      const slot = soliditySha3(action.slice(0, action.length - 64));
      const pastPoll = await voting.getPastPoll(slot);
      expect(pastPoll).to.eq.BN(WAD); // USER0 had 1 WAD of reputation
    });
  });

  describe("claiming rewards", async () => {
    let pollId;

    beforeEach(async () => {
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, FAKE, 1, 0, 0]);
      await voting.createRootPoll(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      pollId = await voting.getPollCount();
    });

    it("can let stakers claim rewards, based on the stake outcome", async () => {
      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      const numEntriesPrev = await repCycle.getReputationUpdateLogLength();

      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, REQUIRED_STAKE.divn(2), user1Key, user1Value, user1Mask, user1Siblings, {
        from: USER1,
      });

      await forwardTime(STAKE_WINDOW, this);

      await voting.executePoll(pollId);

      const user0LockPre = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPre = await tokenLocking.getUserLock(token.address, USER1);

      await voting.claimReward(pollId, 1, UINT256_MAX, 1, USER0, true);
      await voting.claimReward(pollId, 1, UINT256_MAX, 1, USER1, false);

      const user0LockPost = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPost = await tokenLocking.getUserLock(token.address, USER1);

      // Note that no voter rewards were paid out
      const expectedReward0 = REQUIRED_STAKE.add(REQUIRED_STAKE.divn(20)); // stake + (stake / 20)
      const expectedReward1 = REQUIRED_STAKE.divn(20).muln(9); // (stake * 9 / 20)

      expect(new BN(user0LockPost.balance).sub(new BN(user0LockPre.balance))).to.eq.BN(expectedReward0);
      expect(new BN(user1LockPost.balance).sub(new BN(user1LockPre.balance))).to.eq.BN(expectedReward1);

      // Now check that user0 has no penalty, while user1 has a 10% penalty
      const numEntriesPost = await repCycle.getReputationUpdateLogLength();
      expect(numEntriesPost.sub(numEntriesPrev)).to.eq.BN(1);

      const repUpdate = await repCycle.getReputationUpdateLogEntry(numEntriesPost.subn(1));
      expect(repUpdate.user).to.equal(USER1);
      expect(repUpdate.amount).to.eq.BN(REQUIRED_STAKE.divn(20).neg());
    });

    it("can let stakers claim rewards, based on the vote outcome", async () => {
      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      const numEntriesPrev = await repCycle.getReputationUpdateLogLength();

      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.respondToStake(pollId, true, CALL, { from: USER0 });
      await voting.respondToStake(pollId, false, CALL, { from: USER1 });

      await voting.submitVote(pollId, soliditySha3(SALT, true), { from: USER0 });
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER1 });

      await forwardTime(VOTE_WINDOW, this);

      await voting.revealVote(pollId, SALT, true, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.revealVote(pollId, SALT, false, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(REVEAL_WINDOW, this);
      await forwardTime(STAKE_WINDOW, this);

      await voting.executePoll(pollId);

      const user0LockPre = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPre = await tokenLocking.getUserLock(token.address, USER1);

      await voting.claimReward(pollId, 1, UINT256_MAX, 1, USER0, true);
      await voting.claimReward(pollId, 1, UINT256_MAX, 1, USER1, false);

      const user0LockPost = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPost = await tokenLocking.getUserLock(token.address, USER1);

      const stakerRewards = REQUIRED_STAKE.divn(10).muln(9);
      const expectedReward0 = stakerRewards.divn(3).muln(2); // (stake * .9) * (winPct = 1/3 * 2)
      const expectedReward1 = stakerRewards.divn(3).muln(4); // (stake * .9) * (winPct = 2/3 * 2)

      expect(new BN(user0LockPost.balance).sub(new BN(user0LockPre.balance))).to.eq.BN(expectedReward0);
      expect(new BN(user1LockPost.balance).sub(new BN(user1LockPre.balance))).to.eq.BN(expectedReward1);

      // Now check that user1 has no penalty, while user0 has a 1/3 penalty
      const numEntriesPost = await repCycle.getReputationUpdateLogLength();
      expect(numEntriesPost.sub(numEntriesPrev)).to.eq.BN(1);

      const repUpdate = await repCycle.getReputationUpdateLogEntry(numEntriesPost.subn(1));
      expect(repUpdate.user).to.equal(USER0);
      expect(repUpdate.amount).to.eq.BN(REQUIRED_STAKE.divn(3).neg());
    });

    it("can let stakers claim their original stake if neither side fully staked", async () => {
      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      const numEntriesPrev = await repCycle.getReputationUpdateLogLength();

      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, 100, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, 100, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(STAKE_WINDOW, this);

      const user0LockPre = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPre = await tokenLocking.getUserLock(token.address, USER1);

      await voting.claimReward(pollId, 1, UINT256_MAX, 1, USER0, true);
      await voting.claimReward(pollId, 1, UINT256_MAX, 1, USER1, false);

      const numEntriesPost = await repCycle.getReputationUpdateLogLength();

      const user0LockPost = await tokenLocking.getUserLock(token.address, USER0);
      const user1LockPost = await tokenLocking.getUserLock(token.address, USER1);

      expect(numEntriesPrev).to.eq.BN(numEntriesPost);
      expect(new BN(user0LockPost.balance).sub(new BN(user0LockPre.balance))).to.eq.BN(100);
      expect(new BN(user1LockPost.balance).sub(new BN(user1LockPre.balance))).to.eq.BN(100);
    });

    it("cannot claim rewards twice", async () => {
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.respondToStake(pollId, true, CALL, { from: USER0 });
      await voting.respondToStake(pollId, false, CALL, { from: USER1 });

      await voting.submitVote(pollId, soliditySha3(SALT, true), { from: USER0 });

      await forwardTime(VOTE_WINDOW, this);

      await voting.revealVote(pollId, SALT, true, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(REVEAL_WINDOW, this);
      await forwardTime(STAKE_WINDOW, this);

      await voting.executePoll(pollId);

      await voting.claimReward(pollId, 1, UINT256_MAX, 1, USER0, true);
      const userLock0 = await tokenLocking.getUserLock(token.address, USER0);
      await voting.claimReward(pollId, 1, UINT256_MAX, 1, USER0, true);
      const userLock1 = await tokenLocking.getUserLock(token.address, USER0);
      expect(userLock0.balance).to.eq.BN(userLock1.balance);
    });

    it("cannot claim rewards before a poll is executed", async () => {
      await checkErrorRevert(voting.claimReward(pollId, 1, UINT256_MAX, 1, USER0, true), "voting-rep-not-failed-or-executed");
    });

    it("cannot claim rewards with a bad domainId", async () => {
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_WINDOW, this);

      await voting.executePoll(pollId);

      await checkErrorRevert(voting.claimReward(pollId, 2, UINT256_MAX, 2, USER0, true), "voting-rep-bad-domain-id");
    });
  });

  describe("escalating polls", async () => {
    let pollId;

    beforeEach(async () => {
      const domain2Key = makeReputationKey(colony.address, domain2.skillId);
      const domain2Value = makeReputationValue(WAD, 6);
      const [domain2Mask, domain2Siblings] = await reputationTree.getProof(domain2Key);

      user0Key = makeReputationKey(colony.address, domain2.skillId, USER0);
      user0Value = makeReputationValue(WAD.divn(3), 9);
      [user0Mask, user0Siblings] = await reputationTree.getProof(user0Key);

      user1Key = makeReputationKey(colony.address, domain2.skillId, USER1);
      user1Value = makeReputationValue(WAD.divn(3).muln(2), 10);
      [user1Mask, user1Siblings] = await reputationTree.getProof(user1Key);

      const action = await encodeTxData(colony, "makeTask", [1, 0, FAKE, 2, 0, 0]);
      await voting.createDomainPoll(2, UINT256_MAX, ADDRESS_ZERO, action, domain2Key, domain2Value, domain2Mask, domain2Siblings);
      pollId = await voting.getPollCount();

      await colony.approveStake(voting.address, 2, WAD, { from: USER0 });
      await colony.approveStake(voting.address, 2, WAD, { from: USER1 });

      await voting.stakePoll(pollId, 1, 0, 2, true, WAD.divn(1000), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, 0, 2, false, WAD.divn(1000), user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.respondToStake(pollId, true, CALL, { from: USER0 });
      await voting.respondToStake(pollId, false, CALL, { from: USER1 });

      // Note that this is a passing vote
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });
      await voting.submitVote(pollId, soliditySha3(SALT, true), { from: USER1 });

      await forwardTime(VOTE_WINDOW, this);

      await voting.revealVote(pollId, SALT, false, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.revealVote(pollId, SALT, true, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(REVEAL_WINDOW, this);
    });

    it("can internally escalate a domain poll after a vote", async () => {
      await voting.escalatePoll(pollId, 1, 0, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });
    });

    it("can internally escalate a domain poll after a vote", async () => {
      await voting.escalatePoll(pollId, 1, 0, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER1 });
    });

    it("cannot internally escalate a domain poll if not in a 'closed' state", async () => {
      await forwardTime(STAKE_WINDOW, this);

      await voting.executePoll(pollId);

      await checkErrorRevert(
        voting.escalatePoll(pollId, 1, 0, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER2 }),
        "voting-rep-poll-not-closed"
      );
    });

    it("cannot internally escalate a domain poll with an invalid domain proof", async () => {
      await checkErrorRevert(
        voting.escalatePoll(pollId, 1, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 }),
        "voting-rep-invalid-domain-proof"
      );
    });

    it("cannot internally escalate a domain poll with an invalid reputation proof", async () => {
      await checkErrorRevert(voting.escalatePoll(pollId, 1, 0, "0x0", "0x0", "0x0", [], { from: USER0 }), "voting-rep-invalid-root-hash");
    });

    it("can stake after internally escalating a domain poll", async () => {
      await voting.escalatePoll(pollId, 1, 0, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });

      user0Key = makeReputationKey(colony.address, domain1.skillId, USER0);
      user0Value = makeReputationValue(WAD, 2);
      [user0Mask, user0Siblings] = await reputationTree.getProof(user0Key);

      user1Key = makeReputationKey(colony.address, domain1.skillId, USER1);
      user1Value = makeReputationValue(WAD.muln(2), 5);
      [user1Mask, user1Siblings] = await reputationTree.getProof(user1Key);

      const remainingStake = REQUIRED_STAKE.sub(WAD.divn(1000));
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, remainingStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, remainingStake, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
    });

    it("can execute after internally escalating a domain poll, if there is insufficient opposition", async () => {
      await voting.escalatePoll(pollId, 1, 0, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });

      user0Key = makeReputationKey(colony.address, domain1.skillId, USER0);
      user0Value = makeReputationValue(WAD, 2);
      [user0Mask, user0Siblings] = await reputationTree.getProof(user0Key);

      const remainingStake = REQUIRED_STAKE.sub(WAD.divn(1000));
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, remainingStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_WINDOW, this);

      const { logs } = await voting.executePoll(pollId);
      expect(logs[0].args.success).to.be.true;
    });

    it("cannot execute after internally escalating a domain poll, if there is insufficient support", async () => {
      await voting.escalatePoll(pollId, 1, 0, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });

      user1Key = makeReputationKey(colony.address, domain1.skillId, USER1);
      user1Value = makeReputationValue(WAD.muln(2), 5);
      [user1Mask, user1Siblings] = await reputationTree.getProof(user1Key);

      const remainingStake = REQUIRED_STAKE.sub(WAD.divn(1000));
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, remainingStake, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(STAKE_WINDOW, this);

      const { logs } = await voting.executePoll(pollId);
      expect(logs[0].args.success).to.be.false;
    });

    it("can fall back on the previous vote if both sides fail to stake", async () => {
      await voting.escalatePoll(pollId, 1, 0, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });

      await forwardTime(STAKE_WINDOW, this);

      // Note that the previous vote succeeded
      const { logs } = await voting.executePoll(pollId);
      expect(logs[0].args.success).to.be.true;
    });

    it("can use the result of a new vote after internally escalating a domain poll", async () => {
      await voting.escalatePoll(pollId, 1, 0, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });

      user0Key = makeReputationKey(colony.address, domain1.skillId, USER0);
      user0Value = makeReputationValue(WAD, 2);
      [user0Mask, user0Siblings] = await reputationTree.getProof(user0Key);

      user1Key = makeReputationKey(colony.address, domain1.skillId, USER1);
      user1Value = makeReputationValue(WAD.muln(2), 5);
      [user1Mask, user1Siblings] = await reputationTree.getProof(user1Key);

      const remainingStake = REQUIRED_STAKE.sub(WAD.divn(1000));
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, true, remainingStake, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakePoll(pollId, 1, UINT256_MAX, 1, false, remainingStake, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.respondToStake(pollId, true, CALL, { from: USER0 });
      await voting.respondToStake(pollId, false, CALL, { from: USER1 });

      // Make the vote fail this time (everyone votes against)
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER0 });
      await voting.submitVote(pollId, soliditySha3(SALT, false), { from: USER1 });

      await forwardTime(VOTE_WINDOW, this);

      await voting.revealVote(pollId, SALT, false, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.revealVote(pollId, SALT, false, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(REVEAL_WINDOW, this);
      await forwardTime(STAKE_WINDOW, this);

      const { logs } = await voting.executePoll(pollId);
      expect(logs[0].args.success).to.be.false;
    });
  });
});
