/* globals artifacts */

import BN from "bn.js";
import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";

import { UINT256_MAX, WAD, SECONDS_PER_DAY, DEFAULT_STAKE, MINING_CYCLE_DURATION, SUBMITTER_ONLY_WINDOW } from "../../helpers/constants";

import {
  checkErrorRevert,
  web3GetCode,
  makeReputationKey,
  makeReputationValue,
  getActiveRepCycle,
  forwardTime,
  encodeTxData,
} from "../../helpers/test-helper";

import {
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  setupRandomColony,
  giveUserCLNYTokensAndStake,
} from "../../helpers/test-data-generator";

import { setupEtherRouter } from "../../helpers/upgradable-contracts";

import PatriciaTree from "../../packages/reputation-miner/patricia";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const TokenLocking = artifacts.require("TokenLocking");
const Resolver = artifacts.require("Resolver");
const VotingToken = artifacts.require("VotingToken");
const VotingReputation = artifacts.require("VotingReputation");
const VotingHybrid = artifacts.require("VotingHybrid");

const VOTING_HYBRID = soliditySha3("VotingHybrid");
const VOTING_REPUTATION = soliditySha3("VotingReputation");
const VOTING_TOKEN = soliditySha3("VotingToken");

contract("Voting Hybrid", (accounts) => {
  let colony;
  let token;
  let domain1;
  let metaColony;
  let colonyNetwork;
  let tokenLocking;

  let votingHybrid;
  let votingReputation;
  let votingToken;
  let requiredStake;

  let reputationTree;

  let domain1Key;
  let domain1Value;
  let domain1Mask;
  let domain1Siblings;

  let user0Key;
  let user0Value;
  let user0Mask;
  let user0Siblings;

  const TOTAL_STAKE_FRACTION = WAD.divn(1000); // 0.1 %
  const USER_MIN_STAKE_FRACTION = WAD.divn(10); // 10 %

  const MAX_VOTE_FRACTION = WAD.divn(10).muln(6); // 60 %
  const VOTER_REWARD_FRACTION = WAD.divn(10); // 10 %

  const STAKE_PERIOD = SECONDS_PER_DAY * 3;
  const SUBMIT_PERIOD = SECONDS_PER_DAY * 2;
  const REVEAL_PERIOD = SECONDS_PER_DAY * 2;
  const ESCALATION_PERIOD = SECONDS_PER_DAY;

  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const USER2 = accounts[2];
  const MINER = accounts[5];

  // const NAY = 0;
  const YAY = 1;

  const REPUTATION = 0;
  const TOKEN = 1;

  // const NULL = 0;
  // const STAKING = 1;
  // const SUBMIT = 2;
  // const REVEAL = 3;
  // const CLOSED = 4;
  // const EXECUTABLE = 5;
  // const EXECUTED = 6;
  // const FAILED = 7;

  const ADDRESS_ZERO = ethers.constants.AddressZero;

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

    await giveUserCLNYTokensAndStake(colonyNetwork, MINER, DEFAULT_STAKE);
    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();

    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await TokenLocking.at(tokenLockingAddress);

    const votingHybridImplementation = await VotingHybrid.new();
    const votingHybridResolver = await Resolver.new();
    await setupEtherRouter("VotingHybrid", { VotingHybrid: votingHybridImplementation.address }, votingHybridResolver);
    await metaColony.addExtensionToNetwork(VOTING_HYBRID, votingHybridResolver.address);

    const votingReputationImplementation = await VotingReputation.new();
    const votingReputationResolver = await Resolver.new();
    await setupEtherRouter("VotingReputation", { VotingReputation: votingReputationImplementation.address }, votingReputationResolver);
    await metaColony.addExtensionToNetwork(VOTING_REPUTATION, votingReputationResolver.address);

    const votingTokenImplementation = await VotingToken.new();
    const votingTokenResolver = await Resolver.new();
    await setupEtherRouter("VotingToken", { VotingToken: votingTokenImplementation.address }, votingTokenResolver);
    await metaColony.addExtensionToNetwork(VOTING_TOKEN, votingTokenResolver.address);
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    domain1 = await colony.getDomain(1);

    await colony.installExtension(VOTING_HYBRID, 1);
    const votingHybridAddress = await colonyNetwork.getExtensionInstallation(VOTING_HYBRID, colony.address);
    votingHybrid = await VotingHybrid.at(votingHybridAddress);

    await colony.installExtension(VOTING_REPUTATION, 1);
    const votingRepuationAddress = await colonyNetwork.getExtensionInstallation(VOTING_REPUTATION, colony.address);
    votingReputation = await VotingReputation.at(votingRepuationAddress);

    await colony.installExtension(VOTING_TOKEN, 1);
    const votingTokenAddress = await colonyNetwork.getExtensionInstallation(VOTING_TOKEN, colony.address);
    votingToken = await VotingToken.at(votingTokenAddress);

    await votingHybrid.initialise(votingReputation.address, votingToken.address);

    await votingReputation.initialise(
      TOTAL_STAKE_FRACTION,
      VOTER_REWARD_FRACTION,
      USER_MIN_STAKE_FRACTION,
      MAX_VOTE_FRACTION,
      STAKE_PERIOD,
      SUBMIT_PERIOD,
      REVEAL_PERIOD,
      ESCALATION_PERIOD
    );

    await votingToken.initialise(
      TOTAL_STAKE_FRACTION,
      VOTER_REWARD_FRACTION,
      USER_MIN_STAKE_FRACTION,
      MAX_VOTE_FRACTION,
      STAKE_PERIOD,
      SUBMIT_PERIOD,
      REVEAL_PERIOD,
      ESCALATION_PERIOD
    );

    await colony.setRootRole(votingHybrid.address, true);
    await colony.setArbitrationRole(1, UINT256_MAX, votingReputation.address, 1, true);
    await colony.setArbitrationRole(1, UINT256_MAX, votingToken.address, 1, true);

    const user0Influence = WAD;
    const user1Influence = WAD.muln(2);
    const totalInfluence = user0Influence.add(user1Influence);
    requiredStake = totalInfluence.divn(1000);

    // Setup reputation state

    reputationTree = new PatriciaTree();
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId), // Colony total
      makeReputationValue(totalInfluence, 1)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId, USER0), // User0
      makeReputationValue(user0Influence, 2)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId, USER1), // User1
      makeReputationValue(user1Influence, 3)
    );

    domain1Key = makeReputationKey(colony.address, domain1.skillId);
    domain1Value = makeReputationValue(totalInfluence, 1);
    [domain1Mask, domain1Siblings] = await reputationTree.getProof(domain1Key);

    user0Key = makeReputationKey(colony.address, domain1.skillId, USER0);
    user0Value = makeReputationValue(user0Influence, 2);
    [user0Mask, user0Siblings] = await reputationTree.getProof(user0Key);

    const rootHash = await reputationTree.getRootHash();
    const repCycle = await getActiveRepCycle(colonyNetwork);
    await forwardTime(MINING_CYCLE_DURATION, this);
    await repCycle.submitRootHash(rootHash, 0, "0x00", 10, { from: MINER });
    await forwardTime(SUBMITTER_ONLY_WINDOW + 1, this);
    await repCycle.confirmNewHash(0);

    // Setup token state

    await token.mint(USER0, user0Influence);
    await token.mint(USER1, user1Influence);
    await token.approve(tokenLocking.address, user0Influence, { from: USER0 });
    await token.approve(tokenLocking.address, user1Influence, { from: USER1 });
    await tokenLocking.methods["deposit(address,uint256,bool)"](token.address, user0Influence, true, { from: USER0 });
    await tokenLocking.methods["deposit(address,uint256,bool)"](token.address, user1Influence, true, { from: USER1 });
    await colony.approveStake(votingToken.address, 1, user0Influence, { from: USER0 });
    await colony.approveStake(votingToken.address, 1, user1Influence, { from: USER1 });
    await colony.approveStake(votingReputation.address, 1, user0Influence, { from: USER0 });
    await colony.approveStake(votingReputation.address, 1, user1Influence, { from: USER1 });
  });

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      votingHybrid = await VotingHybrid.new();
      await votingHybrid.install(colony.address);

      await checkErrorRevert(votingHybrid.install(colony.address), "extension-already-installed");

      const identifier = await votingHybrid.identifier();
      const version = await votingHybrid.version();
      expect(identifier).to.equal(VOTING_HYBRID);
      expect(version).to.eq.BN(1);

      await votingHybrid.finishUpgrade();
      await votingHybrid.deprecate(true);
      await votingHybrid.uninstall();

      const code = await web3GetCode(votingHybrid.address);
      expect(code).to.equal("0x");
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(VOTING_HYBRID, 1, { from: USER0 });

      await checkErrorRevert(colony.installExtension(VOTING_HYBRID, 1, { from: USER0 }), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(VOTING_HYBRID, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(VOTING_HYBRID, { from: USER0 });
    });

    it("can deprecate the extension if root", async () => {
      let deprecated = await votingHybrid.getDeprecated();
      expect(deprecated).to.be.false;

      await checkErrorRevert(colony.deprecateExtension(VOTING_HYBRID, true, { from: USER2 }), "ds-auth-unauthorized");
      await colony.deprecateExtension(VOTING_HYBRID, true);

      // Cant make new motions!
      const action = await encodeTxData(colony, "makeTask", [1, UINT256_MAX, "0x0", 1, 0, 0]);

      await checkErrorRevert(
        votingHybrid.createRootMotion(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings),
        "colony-extension-deprecated"
      );

      deprecated = await votingHybrid.getDeprecated();
      expect(deprecated).to.be.true;
    });

    it("cannot initialise twice or if not root", async () => {
      await checkErrorRevert(votingHybrid.initialise(votingReputation.address, votingToken.address), "voting-hybrid-already-initialised");
      await checkErrorRevert(
        votingHybrid.initialise(votingReputation.address, votingToken.address, { from: USER2 }),
        "voting-hybrid-caller-not-root"
      );
    });
  });

  describe("using the extension", async () => {
    it("can create a motion", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await votingHybrid.createRootMotion(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);

      const hybridMotionId = await votingHybrid.getMotionCount();
      const reputationMotionId = await votingReputation.getMotionCount();
      const tokenMotionId = await votingToken.getMotionCount();

      const hybridMotion = await votingHybrid.getMotion(hybridMotionId);
      const reputationMotion = await votingReputation.getMotion(reputationMotionId);
      const tokenMotion = await votingReputation.getMotion(tokenMotionId);

      expect(hybridMotion.approvals[REPUTATION]).to.be.false;
      expect(hybridMotion.approvals[TOKEN]).to.be.false;

      expect(reputationMotion.altTarget).to.equal(votingHybrid.address);
      expect(tokenMotion.altTarget).to.equal(votingHybrid.address);

      expect(new BN(reputationMotion.action.slice(-64), 16)).to.eq.BN(hybridMotionId);
      expect(new BN(tokenMotion.action.slice(-64), 16)).to.eq.BN(hybridMotionId);
    });

    it("can approve a motion if both sub-motions succeed", async () => {
      const balancePre = await token.balanceOf(colony.address);
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await votingHybrid.createRootMotion(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);

      const hybridMotionId = await votingHybrid.getMotionCount();
      const reputationMotionId = await votingReputation.getMotionCount();
      const tokenMotionId = await votingToken.getMotionCount();

      await votingReputation.stakeMotion(reputationMotionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings);
      await votingToken.stakeMotion(tokenMotionId, 1, UINT256_MAX, YAY, requiredStake);

      await forwardTime(STAKE_PERIOD, this);

      await votingReputation.finalizeMotion(reputationMotionId);
      await votingToken.finalizeMotion(tokenMotionId);

      const hybridMotion = await votingHybrid.getMotion(hybridMotionId);
      const balancePost = await token.balanceOf(colony.address);

      expect(hybridMotion.approvals[REPUTATION]).to.be.true;
      expect(hybridMotion.approvals[TOKEN]).to.be.true;
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD);
    });

    it("cannot approve a motion if the reputation motion fails", async () => {
      const balancePre = await token.balanceOf(colony.address);
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await votingHybrid.createRootMotion(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);

      const hybridMotionId = await votingHybrid.getMotionCount();
      const reputationMotionId = await votingReputation.getMotionCount();
      const tokenMotionId = await votingToken.getMotionCount();

      await votingToken.stakeMotion(tokenMotionId, 1, UINT256_MAX, YAY, requiredStake);

      await forwardTime(STAKE_PERIOD, this);

      await checkErrorRevert(votingReputation.finalizeMotion(reputationMotionId), "voting-base-motion-not-finalizable");
      await votingToken.finalizeMotion(tokenMotionId);

      const hybridMotion = await votingHybrid.getMotion(hybridMotionId);
      const balancePost = await token.balanceOf(colony.address);

      expect(hybridMotion.approvals[REPUTATION]).to.be.false;
      expect(hybridMotion.approvals[TOKEN]).to.be.true;
      expect(balancePost.sub(balancePre)).to.be.zero;
    });

    it("cannot approve a motion if the token motion fails", async () => {
      const balancePre = await token.balanceOf(colony.address);
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await votingHybrid.createRootMotion(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);

      const hybridMotionId = await votingHybrid.getMotionCount();
      const reputationMotionId = await votingReputation.getMotionCount();
      const tokenMotionId = await votingToken.getMotionCount();

      await votingReputation.stakeMotion(reputationMotionId, 1, UINT256_MAX, YAY, requiredStake, user0Key, user0Value, user0Mask, user0Siblings);

      await forwardTime(STAKE_PERIOD, this);

      await votingReputation.finalizeMotion(reputationMotionId);
      await checkErrorRevert(votingToken.finalizeMotion(tokenMotionId), "voting-base-motion-not-finalizable");

      const hybridMotion = await votingHybrid.getMotion(hybridMotionId);
      const balancePost = await token.balanceOf(colony.address);

      expect(hybridMotion.approvals[REPUTATION]).to.be.true;
      expect(hybridMotion.approvals[TOKEN]).to.be.false;
      expect(balancePost.sub(balancePre)).to.be.zero;
    });

    it("cannot approve a motion if neither reputation or token voting", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await votingHybrid.createRootMotion(ADDRESS_ZERO, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);

      const hybridMotionId = await votingHybrid.getMotionCount();
      await votingHybrid.approveMotion(hybridMotionId);

      const hybridMotion = await votingHybrid.getMotion(hybridMotionId);
      expect(hybridMotion.approvals[REPUTATION]).to.be.false;
      expect(hybridMotion.approvals[TOKEN]).to.be.false;
    });
  });
});
