/* globals artifacts */
import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";
import shortid from "shortid";
import { setupRandomColony } from "../helpers/test-data-generator";
import { UINT256_MAX, WAD, MINING_CYCLE_DURATION, SECONDS_PER_DAY, CHALLENGE_RESPONSE_WINDOW_DURATION } from "../helpers/constants";
import { makeReputationKey, makeReputationValue, getActiveRepCycle, forwardTime, encodeTxData, checkErrorRevert } from "../helpers/test-helper";

import PatriciaTree from "../packages/reputation-miner/patricia";

const IColonyNetwork = artifacts.require("IColonyNetwork");
const IMetaColony = artifacts.require("IMetaColony");
const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");
const VotingReputationMisaligned = artifacts.require("VotingReputationMisaligned");
const { soliditySha3 } = require("web3-utils");
const { setupEtherRouter } = require("../helpers/upgradable-contracts");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const TokenLocking = artifacts.require("TokenLocking");
const IVotingReputation = artifacts.require("IVotingReputation");

const VOTING_REPUTATION = soliditySha3("VotingReputation");

const TOTAL_STAKE_FRACTION = WAD.divn(1000); // 0.1 %
const USER_MIN_STAKE_FRACTION = WAD.divn(10); // 10 %

const MAX_VOTE_FRACTION = WAD.divn(10).muln(8); // 80 %
const VOTER_REWARD_FRACTION = WAD.divn(10); // 10 %

const STAKE_PERIOD = SECONDS_PER_DAY * 3;
const SUBMIT_PERIOD = SECONDS_PER_DAY * 2;
const REVEAL_PERIOD = SECONDS_PER_DAY * 2;
const ESCALATION_PERIOD = SECONDS_PER_DAY;

const NAY = 0;
const YAY = 1;

// const NULL = 0;
// const STAKING = 1;
// const SUBMIT = 2;
// const REVEAL = 3;
// const CLOSED = 4;
// const EXECUTABLE = 5;
// const EXECUTED = 6;
// const FAILED = 7;

const ADDRESS_ZERO = ethers.constants.AddressZero;
const REQUIRED_STAKE = WAD.muln(3).divn(1000);
contract("Voting Reputation Misalignment upgrade", (accounts) => {
  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const USER2 = accounts[2];
  const MINER = accounts[5];

  let colony;
  let token;
  let domain1;
  let domain2;
  let domain3;
  let metaColony;
  let colonyNetwork;
  let tokenLocking;

  let voting;

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
  let badVersion;
  const NAME_HASH = soliditySha3("VotingReputation");

  const SALT = soliditySha3({ type: "string", value: shortid.generate() });

  before(async function () {
    const etherRouterColonyNetwork = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouterColonyNetwork.address);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);

    const badImplementation = await VotingReputationMisaligned.new();

    badVersion = await badImplementation.version();
    const badResolver = await Resolver.new();

    await setupEtherRouter("VotingReputationMisaligned", { VotingReputationMisaligned: badImplementation.address }, badResolver);
    await metaColony.addExtensionToNetwork(NAME_HASH, badResolver.address);

    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await TokenLocking.at(tokenLockingAddress);
  });

  beforeEach(async function () {
    // Install previous in a new colony
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.installExtension(NAME_HASH, badVersion);

    // 1 => { 2, 3 }
    await colony.addDomain(1, UINT256_MAX, 1);
    await colony.addDomain(1, UINT256_MAX, 1);
    domain1 = await colony.getDomain(1);
    domain2 = await colony.getDomain(2);
    domain3 = await colony.getDomain(3);

    const votingAddress = await colonyNetwork.getExtensionInstallation(VOTING_REPUTATION, colony.address);
    voting = await IVotingReputation.at(votingAddress);

    await voting.initialise(
      TOTAL_STAKE_FRACTION,
      VOTER_REWARD_FRACTION,
      USER_MIN_STAKE_FRACTION,
      MAX_VOTE_FRACTION,
      STAKE_PERIOD,
      SUBMIT_PERIOD,
      REVEAL_PERIOD,
      ESCALATION_PERIOD
    );

    await colony.setRootRole(voting.address, true);
    await colony.setArbitrationRole(1, UINT256_MAX, voting.address, 1, true);
    await colony.setAdministrationRole(1, UINT256_MAX, voting.address, 1, true);

    await token.mint(USER0, WAD);
    await token.mint(USER1, WAD);
    await token.mint(USER2, WAD);
    await token.approve(tokenLocking.address, WAD, { from: USER0 });
    await token.approve(tokenLocking.address, WAD, { from: USER1 });
    await token.approve(tokenLocking.address, WAD, { from: USER2 });
    await tokenLocking.methods["deposit(address,uint256,bool)"](token.address, WAD, true, { from: USER0 });
    await tokenLocking.methods["deposit(address,uint256,bool)"](token.address, WAD, true, { from: USER1 });
    await tokenLocking.methods["deposit(address,uint256,bool)"](token.address, WAD, true, { from: USER2 });
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
      makeReputationValue(WAD.muln(3), 7)
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
    await reputationTree.insert(
      makeReputationKey(colony.address, domain3.skillId, USER0), // User0, domain 3
      makeReputationValue(WAD, 11)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain3.skillId, USER1), // User1, domain 3
      makeReputationValue(WAD.muln(2), 12)
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
    await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
    await repCycle.confirmNewHash(0, { from: MINER });
  });

  describe("when upgrading voting reputation contract", function () {
    it("can reclaim stake from ghost motion", async function () {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId = await voting.getMotionCount();

      const half = REQUIRED_STAKE.divn(2);

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, half, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, half, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      const motion = await voting.getMotion(motionId);
      expect(motion.stakes[0]).to.be.zero;
      expect(motion.stakes[1]).to.eq.BN(REQUIRED_STAKE);

      const stake0 = await voting.getStake(motionId, USER0, YAY);
      const stake1 = await voting.getStake(motionId, USER1, YAY);
      expect(stake0).to.eq.BN(half);
      expect(stake1).to.eq.BN(half);

      let count = await voting.getMotionCount();
      expect(count).to.eq.BN(1);
      // Upgrade

      await colony.upgradeExtension(VOTING_REPUTATION, badVersion.toNumber() + 1);

      count = await voting.getMotionCount();
      expect(count).to.eq.BN(1);
      // Reclaim ghost stakes.

      await voting.claimMisalignedReward(1, 1, UINT256_MAX, USER0, YAY);
      await voting.claimMisalignedReward(1, 1, UINT256_MAX, USER1, YAY);
    });

    it("can reclaim stake from ghost motion that was finalized after going to a vote", async function () {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(motionId, soliditySha3(SALT, YAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      await voting.revealVote(motionId, SALT, YAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(REVEAL_PERIOD, this);
      await forwardTime(STAKE_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.true;

      let count = await voting.getMotionCount();
      expect(count).to.eq.BN(1);
      // Upgrade

      await colony.upgradeExtension(VOTING_REPUTATION, badVersion.toNumber() + 1);

      count = await voting.getMotionCount();
      expect(count).to.eq.BN(1);
      // Reclaim ghost stakes.

      await voting.claimMisalignedReward(1, 1, UINT256_MAX, USER0, YAY);
      await voting.claimMisalignedReward(1, 1, UINT256_MAX, USER1, NAY);
    });

    it("can reclaim stake from ghost motion that was finalized, but didn't execute due to vote decision after going to a vote", async function () {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await voting.submitVote(motionId, soliditySha3(SALT, NAY), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SUBMIT_PERIOD, this);

      await voting.revealVote(motionId, SALT, NAY, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(REVEAL_PERIOD, this);
      await forwardTime(STAKE_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.false;

      let count = await voting.getMotionCount();
      expect(count).to.eq.BN(1);
      // Upgrade

      await colony.upgradeExtension(VOTING_REPUTATION, badVersion.toNumber() + 1);

      count = await voting.getMotionCount();
      expect(count).to.eq.BN(1);
      // Reclaim ghost stakes.

      await voting.claimMisalignedReward(1, 1, UINT256_MAX, USER0, YAY);
      await voting.claimMisalignedReward(1, 1, UINT256_MAX, USER1, NAY);
    });

    it("can reclaim stake from ghost motion that was finalized after being staked but not voted on", async function () {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId = await voting.getMotionCount();

      const half = REQUIRED_STAKE.divn(2);

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, half, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(STAKE_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.true;

      let count = await voting.getMotionCount();
      expect(count).to.eq.BN(1);
      // Upgrade

      await colony.upgradeExtension(VOTING_REPUTATION, badVersion.toNumber() + 1);

      count = await voting.getMotionCount();
      expect(count).to.eq.BN(1);
      // Reclaim ghost stakes.

      await voting.claimMisalignedReward(1, 1, UINT256_MAX, USER0, YAY);
      await voting.claimMisalignedReward(1, 1, UINT256_MAX, USER1, NAY);
    });

    it("can reclaim stake from ghost motion that could have been finalized, but wasn't", async function () {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(STAKE_PERIOD, this);

      let count = await voting.getMotionCount();
      expect(count).to.eq.BN(1);
      // Upgrade

      await colony.upgradeExtension(VOTING_REPUTATION, badVersion.toNumber() + 1);

      count = await voting.getMotionCount();
      expect(count).to.eq.BN(1);
      // Reclaim ghost stakes.

      await voting.claimMisalignedReward(1, 1, UINT256_MAX, USER0, YAY);

      // Can't reclaim twice
      await checkErrorRevert(voting.claimMisalignedReward(1, 1, UINT256_MAX, USER0, YAY), "voting-rep-nothing-to-claim");
    });

    it("can reclaim stake from ghost motion that never was staked fully", async function () {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId = await voting.getMotionCount();

      const half = REQUIRED_STAKE.divn(2);

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, half, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, half, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(STAKE_PERIOD, this);

      let count = await voting.getMotionCount();
      expect(count).to.eq.BN(1);
      // Upgrade

      await colony.upgradeExtension(VOTING_REPUTATION, badVersion.toNumber() + 1);

      count = await voting.getMotionCount();
      expect(count).to.eq.BN(1);
      // Reclaim ghost stakes.

      await voting.claimMisalignedReward(1, 1, UINT256_MAX, USER0, YAY);
      await voting.claimMisalignedReward(1, 1, UINT256_MAX, USER1, NAY);
    });

    it("can reclaim stake from ghost motion that was staked fully, no-one voted on, and was then finalized", async function () {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId = await voting.getMotionCount();

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, NAY, REQUIRED_STAKE, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      await forwardTime(STAKE_PERIOD, this);
      await forwardTime(SUBMIT_PERIOD, this);
      await forwardTime(REVEAL_PERIOD, this);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.false;

      let count = await voting.getMotionCount();
      expect(count).to.eq.BN(1);
      // Upgrade

      await colony.upgradeExtension(VOTING_REPUTATION, badVersion.toNumber() + 1);

      count = await voting.getMotionCount();
      expect(count).to.eq.BN(1);
      // Reclaim ghost stakes.

      await voting.claimMisalignedReward(1, 1, UINT256_MAX, USER0, YAY);
      await voting.claimMisalignedReward(1, 1, UINT256_MAX, USER1, NAY);
    });

    it("metatransaction nonces skip a million", async function () {
      let nonce = await voting.getMetatransactionNonce(USER0);
      expect(nonce).to.eq.BN(0);
      await colony.upgradeExtension(VOTING_REPUTATION, badVersion.toNumber() + 1);
      nonce = await voting.getMetatransactionNonce(USER0);
      expect(nonce).to.eq.BN(1000000);
    });
  });
});
