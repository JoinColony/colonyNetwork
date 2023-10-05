/* globals artifacts */

const path = require("path");
const { soliditySha3 } = require("web3-utils");
const { ethers } = require("ethers");

const {
  UINT256_MAX,
  CURR_VERSION,
  WAD,
  SECONDS_PER_HOUR,
  SECONDS_PER_DAY,
  DEFAULT_STAKE,
  INITIAL_FUNDING,
  MINING_CYCLE_DURATION,
  CHALLENGE_RESPONSE_WINDOW_DURATION,
} = require("../helpers/constants");

const {
  getTokenArgs,
  forwardTime,
  bnSqrt,
  makeReputationKey,
  makeReputationValue,
  getActiveRepCycle,
  encodeTxData,
  advanceMiningCycleNoContest,
  submitAndForwardTimeToDispute,
  accommodateChallengeAndInvalidateHash,
} = require("../helpers/test-helper");

const { giveUserCLNYTokensAndStake, fundColonyWithTokens, setupRandomColony } = require("../helpers/test-data-generator");

const { TruffleLoader } = require("../packages/package-utils");
const PatriciaTree = require("../packages/reputation-miner/patricia");
const ReputationMinerTestWrapper = require("../packages/reputation-miner/test/ReputationMinerTestWrapper");
const MaliciousReputationMinerExtraRep = require("../packages/reputation-miner/test/MaliciousReputationMinerExtraRep");

const Token = artifacts.require("Token");
const IColony = artifacts.require("IColony");
const IMetaColony = artifacts.require("IMetaColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const EtherRouter = artifacts.require("EtherRouter");
const ITokenLocking = artifacts.require("ITokenLocking");
const OneTxPayment = artifacts.require("OneTxPayment");
const ReputationBootstrapper = artifacts.require("ReputationBootstrapper");
const VotingReputation = artifacts.require("VotingReputation");
const IVotingReputation = artifacts.require("IVotingReputation");

const REAL_PROVIDER_PORT = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

const contractLoader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "build", "contracts"),
});

contract("All", function (accounts) {
  const gasPrice = 20e9;

  const MANAGER = accounts[0];
  const EVALUATOR = MANAGER;
  const WORKER = accounts[2];
  const MINER = accounts[5];

  let colony;
  let token;
  let localSkillId;
  let otherToken;
  let metaColony;
  let colonyNetwork;
  let tokenLocking;

  before(async function () {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);

    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await ITokenLocking.at(tokenLockingAddress);

    await IColony.defaults({ gasPrice });
  });

  beforeEach(async function () {
    ({ colony, token, localSkillId } = await setupRandomColony(colonyNetwork));

    const otherTokenArgs = getTokenArgs();
    otherToken = await Token.new(...otherTokenArgs);
    await otherToken.unlock();

    await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
    await fundColonyWithTokens(colony, otherToken, INITIAL_FUNDING);
  });

  // We currently only print out gas costs and no assertions are made about what these should be.
  describe("Gas costs", function () {
    it("when working with the Colony Network", async function () {
      const tokenArgs = getTokenArgs();
      const colonyToken = await Token.new(...tokenArgs);
      await colonyToken.unlock();
      await colonyNetwork.createColony(colonyToken.address, CURR_VERSION, "", "");
    });

    it("when working with the Meta Colony", async function () {
      await metaColony.addLocalSkill();
      await metaColony.addLocalSkill();
      await metaColony.addLocalSkill();
      await metaColony.addLocalSkill();
    });

    it("when working with a Colony", async function () {
      await colony.mintTokens(200);
      await colony.claimColonyFunds(token.address);
      await colony.setAdministrationRole(1, UINT256_MAX, EVALUATOR, 1, true);
    });

    it("when working with a OneTxPayment", async function () {
      const oneTxExtension = await OneTxPayment.new();
      await oneTxExtension.install(colony.address);
      await colony.setAdministrationRole(1, UINT256_MAX, oneTxExtension.address, 1, true);
      await colony.setFundingRole(1, UINT256_MAX, oneTxExtension.address, 1, true);
      await colony.setArbitrationRole(1, UINT256_MAX, oneTxExtension.address, 1, true);

      // 1 tx payment to one recipient, native token
      await oneTxExtension.makePayment(1, UINT256_MAX, 1, UINT256_MAX, [WORKER], [token.address], [10], 1, 0);

      // 1 tx payment to one recipient, other token
      await oneTxExtension.makePayment(1, UINT256_MAX, 1, UINT256_MAX, [WORKER], [otherToken.address], [10], 1, 0);

      // 1 tx payment to one recipient, with skill
      await oneTxExtension.makePayment(1, UINT256_MAX, 1, UINT256_MAX, [WORKER], [token.address], [10], 1, localSkillId);

      const firstToken = token.address < otherToken.address ? token.address : otherToken.address;
      const secondToken = token.address < otherToken.address ? otherToken.address : token.address;

      // 1 tx payment to one recipient, two tokens
      await oneTxExtension.makePayment(1, UINT256_MAX, 1, UINT256_MAX, [WORKER, WORKER], [firstToken, secondToken], [10, 10], 1, 0);

      // 1 tx payment to two recipients, one token
      await oneTxExtension.makePayment(1, UINT256_MAX, 1, UINT256_MAX, [WORKER, MANAGER], [firstToken, firstToken], [10, 10], 1, 0);

      // 1 transaction payment to two recipients, two tokens
      await oneTxExtension.makePayment(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        [WORKER, WORKER, MANAGER, MANAGER],
        [firstToken, secondToken, firstToken, secondToken],
        [10, 10, 10, 10],
        1,
        0,
      );
    });

    it("when working with staking", async function () {
      const STAKER1 = accounts[6];
      const STAKER2 = accounts[7];
      const STAKER3 = accounts[8];

      // Setup the stakers balance
      await giveUserCLNYTokensAndStake(colonyNetwork, STAKER1, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, STAKER2, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, STAKER3, DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });
      await advanceMiningCycleNoContest({ colonyNetwork, test: this, minerAddress: STAKER1 });

      const goodClient = new ReputationMinerTestWrapper({
        loader: contractLoader,
        minerAddress: STAKER1,
        realProviderPort: REAL_PROVIDER_PORT,
        useJsTree: true,
      });
      const badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: STAKER2, realProviderPort: REAL_PROVIDER_PORT, useJsTree: true },
        1,
        0xfffffffff,
      );
      const badClient2 = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: STAKER3, realProviderPort: REAL_PROVIDER_PORT, useJsTree: true },
        2,
        0xfffffffff,
      );
      await goodClient.initialise(colonyNetwork.address);
      await badClient.initialise(colonyNetwork.address);
      await badClient2.initialise(colonyNetwork.address);

      // Submit hashes
      await submitAndForwardTimeToDispute([goodClient, badClient, badClient2], this);
      // Session of respond / invalidate between our 3 submissions
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" },
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, badClient2); // Invalidate the 'null' that partners the third hash submitted.
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient2, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" },
      });
      const repCycle = await getActiveRepCycle(colonyNetwork);

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(2, { from: STAKER1 });

      // withdraw
      const clnyToken = await metaColony.getToken();
      await colonyNetwork.unstakeForMining(DEFAULT_STAKE.divn(4), { from: STAKER1 });
      await tokenLocking.methods["withdraw(address,uint256,bool)"](clnyToken, DEFAULT_STAKE.divn(4), false, { from: STAKER1 });
    });

    it("when working with reward payouts", async function () {
      const totalReputation = WAD.muln(300);
      const workerReputation = WAD.muln(200);
      const managerReputation = WAD.muln(100);

      const { colony: newColony, token: newToken } = await setupRandomColony(colonyNetwork);

      await newToken.setOwner(colony.address);
      await newColony.mintTokens(workerReputation.add(managerReputation));
      await newColony.claimColonyFunds(newToken.address);
      await newColony.bootstrapColony([WORKER, MANAGER], [workerReputation, managerReputation]);

      await giveUserCLNYTokensAndStake(colonyNetwork, accounts[8], DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const miningClient = new ReputationMinerTestWrapper({
        loader: contractLoader,
        minerAddress: accounts[8],
        realProviderPort: REAL_PROVIDER_PORT,
        useJsTree: true,
      });

      await miningClient.initialise(colonyNetwork.address);
      await advanceMiningCycleNoContest({ colonyNetwork, client: miningClient, minerAddress: accounts[0], test: this });

      const result = await newColony.getDomain(1);
      const rootDomainSkill = result.skillId;
      const colonyWideReputationKey = makeReputationKey(newColony.address, rootDomainSkill);
      let { key, value, branchMask, siblings } = await miningClient.getReputationProofObject(colonyWideReputationKey);
      const colonyWideReputationProof = [key, value, branchMask, siblings];

      const userReputationKey = makeReputationKey(newColony.address, rootDomainSkill, WORKER);
      ({ key, value, branchMask, siblings } = await miningClient.getReputationProofObject(userReputationKey));
      const userReputationProof = [key, value, branchMask, siblings];

      await newToken.approve(tokenLocking.address, workerReputation, { from: WORKER });
      await tokenLocking.methods["deposit(address,uint256,bool)"](newToken.address, workerReputation, true, { from: WORKER });
      await forwardTime(1, this);

      await fundColonyWithTokens(newColony, otherToken, 300);

      await newColony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 100, otherToken.address);

      const tx = await newColony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const payoutId = tx.logs[0].args.rewardPayoutId;

      await tokenLocking.incrementLockCounterTo(newToken.address, payoutId, {
        from: MANAGER,
      });

      const workerReputationSqrt = bnSqrt(workerReputation);
      const totalReputationSqrt = bnSqrt(totalReputation, true);
      const numeratorSqrt = bnSqrt(workerReputationSqrt.mul(workerReputationSqrt));
      const denominatorSqrt = bnSqrt(totalReputationSqrt.mul(totalReputationSqrt), true);

      const balance = await newColony.getFundingPotBalance(0, otherToken.address);
      const amountSqrt = bnSqrt(balance);

      const squareRoots = [
        workerReputationSqrt,
        workerReputationSqrt,
        totalReputationSqrt,
        totalReputationSqrt,
        numeratorSqrt,
        denominatorSqrt,
        amountSqrt,
      ];

      await newColony.claimRewardPayout(payoutId, squareRoots, ...userReputationProof, {
        from: WORKER,
      });

      await forwardTime(5184001);
      await newColony.finalizeRewardPayout(payoutId);

      await newColony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 100, otherToken.address);

      const tx2 = await newColony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const payoutId2 = tx2.logs[0].args.rewardPayoutId;

      await tokenLocking.incrementLockCounterTo(newToken.address, payoutId2, {
        from: MANAGER,
      });

      await newColony.claimRewardPayout(payoutId2, squareRoots, ...userReputationProof, {
        from: WORKER,
      });

      await forwardTime(5184001);
      await newColony.finalizeRewardPayout(payoutId2);
    });

    it("when bootstrapping reputation", async function () {
      const reputationBootstrapper = await ReputationBootstrapper.new();
      await reputationBootstrapper.install(colony.address);
      await colony.setRootRole(reputationBootstrapper.address, true);

      await reputationBootstrapper.setGrants(
        [false, false, false, false, false],
        [soliditySha3(1), soliditySha3(2), soliditySha3(3), soliditySha3(4), soliditySha3(5)],
        [WAD, WAD, WAD, WAD, WAD],
        { from: MANAGER },
      );

      await reputationBootstrapper.commitSecret(soliditySha3(WORKER, 1), { from: WORKER });
      await forwardTime(SECONDS_PER_HOUR, this);

      await reputationBootstrapper.claimGrant(false, 1, { from: WORKER });
    });

    it("when bootstrapping reputation with tokens", async function () {
      const reputationBootstrapper = await ReputationBootstrapper.new();
      await reputationBootstrapper.install(colony.address);
      await colony.setRootRole(reputationBootstrapper.address, true);

      await token.mint(reputationBootstrapper.address, WAD.muln(10));
      await reputationBootstrapper.setGrants(
        [true, true, true, true, true],
        [soliditySha3(1), soliditySha3(2), soliditySha3(3), soliditySha3(4), soliditySha3(5)],
        [WAD, WAD, WAD, WAD, WAD],
        { from: MANAGER },
      );

      await reputationBootstrapper.commitSecret(soliditySha3(WORKER, 1), { from: WORKER });
      await forwardTime(SECONDS_PER_HOUR, this);

      await reputationBootstrapper.claimGrant(true, 1, { from: WORKER });
    });

    it("when bootstrapping reputation with decay", async function () {
      const reputationBootstrapper = await ReputationBootstrapper.new();
      await reputationBootstrapper.install(colony.address);
      await colony.setRootRole(reputationBootstrapper.address, true);

      await reputationBootstrapper.setGrants(
        [false, false, false, false, false],
        [soliditySha3(1), soliditySha3(2), soliditySha3(3), soliditySha3(4), soliditySha3(5)],
        [WAD, WAD, WAD, WAD, WAD],
        { from: MANAGER },
      );

      await reputationBootstrapper.commitSecret(soliditySha3(WORKER, 1), { from: WORKER });
      await forwardTime(SECONDS_PER_HOUR, this);

      // Reputation decays by half in 90 days
      await forwardTime(SECONDS_PER_DAY * 90, this);

      await reputationBootstrapper.claimGrant(false, 1, { from: WORKER });
    });
  });

  describe("Gas costs for motions", function () {
    let voting;

    let domain1Key;
    let domain1Value;
    let domain1Mask;
    let domain1Siblings;

    let managerKey;
    let managerValue;
    let managerMask;
    let managerSiblings;

    let workerKey;
    let workerValue;
    let workerMask;
    let workerSiblings;

    beforeEach(async function () {
      const domain1 = await colony.getDomain(1);
      domain1Key = makeReputationKey(colony.address, domain1.skillId);
      domain1Value = makeReputationValue(WAD.muln(3), 1);
      managerKey = makeReputationKey(colony.address, domain1.skillId, MANAGER);
      managerValue = makeReputationValue(WAD, 2);
      workerKey = makeReputationKey(colony.address, domain1.skillId, WORKER);
      workerValue = makeReputationValue(WAD.muln(2), 5);

      const reputationTree = new PatriciaTree();
      await reputationTree.insert(domain1Key, domain1Value);
      await reputationTree.insert(managerKey, managerValue);
      await reputationTree.insert(workerKey, workerValue);

      [domain1Mask, domain1Siblings] = await reputationTree.getProof(domain1Key);
      [managerMask, managerSiblings] = await reputationTree.getProof(managerKey);
      [workerMask, workerSiblings] = await reputationTree.getProof(workerKey);

      const rootHash = await reputationTree.getRootHash();
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash(rootHash, 0, "0x00", 10, { from: MINER });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(0, { from: MINER });

      const VOTING_REPUTATION = soliditySha3("VotingReputation");
      const extension = await VotingReputation.new();
      const version = await extension.version();
      await colony.installExtension(VOTING_REPUTATION, version);
      const votingAddress = await colonyNetwork.getExtensionInstallation(VOTING_REPUTATION, colony.address);
      voting = await IVotingReputation.at(votingAddress);

      await voting.initialise(
        WAD.divn(1000),
        WAD.divn(10),
        WAD.divn(10),
        WAD.divn(10).muln(8),
        SECONDS_PER_DAY * 3,
        SECONDS_PER_DAY * 2,
        SECONDS_PER_DAY * 2,
        SECONDS_PER_DAY,
      );

      await colony.setRootRole(voting.address, true);
      await colony.setArbitrationRole(1, UINT256_MAX, voting.address, 1, true);
      await colony.setAdministrationRole(1, UINT256_MAX, voting.address, 1, true);

      await token.mint(MANAGER, WAD);
      await token.mint(WORKER, WAD);
      await token.approve(tokenLocking.address, WAD, { from: MANAGER });
      await token.approve(tokenLocking.address, WAD, { from: WORKER });
      await tokenLocking.methods["deposit(address,uint256,bool)"](token.address, WAD, true, { from: MANAGER });
      await tokenLocking.methods["deposit(address,uint256,bool)"](token.address, WAD, true, { from: WORKER });
      await colony.approveStake(voting.address, 1, WAD, { from: MANAGER });
      await colony.approveStake(voting.address, 1, WAD, { from: WORKER });
    });

    it("making a motion with no dispute", async function () {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await voting.createMotion(1, UINT256_MAX, ethers.constants.AddressZero, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId = await voting.getMotionCount();

      const stake = WAD.muln(3).divn(1000);
      await voting.stakeMotion(motionId, 1, UINT256_MAX, 1, stake, managerKey, managerValue, managerMask, managerSiblings, { from: MANAGER });

      await forwardTime(SECONDS_PER_DAY * 3, this);

      await voting.finalizeMotion(motionId);
      await voting.claimReward(motionId, 1, UINT256_MAX, MANAGER, 1);
    });

    it("making a motion with votes", async function () {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await voting.createMotion(1, UINT256_MAX, ethers.constants.AddressZero, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId = await voting.getMotionCount();

      const stake = WAD.muln(3).divn(1000);
      await voting.stakeMotion(motionId, 1, UINT256_MAX, 1, stake, managerKey, managerValue, managerMask, managerSiblings, { from: MANAGER });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, 0, stake, workerKey, workerValue, workerMask, workerSiblings, { from: WORKER });

      const salt = soliditySha3("salt");
      await voting.submitVote(motionId, soliditySha3(salt, 1), managerKey, managerValue, managerMask, managerSiblings, { from: MANAGER });
      await voting.submitVote(motionId, soliditySha3(salt, 0), workerKey, workerValue, workerMask, workerSiblings, { from: WORKER });

      await voting.revealVote(motionId, salt, 1, managerKey, managerValue, managerMask, managerSiblings, { from: MANAGER });
      await voting.revealVote(motionId, salt, 0, workerKey, workerValue, workerMask, workerSiblings, { from: WORKER });

      await forwardTime(SECONDS_PER_DAY, this);

      await voting.finalizeMotion(motionId);

      await voting.claimReward(motionId, 1, UINT256_MAX, MANAGER, 1);
      await voting.claimReward(motionId, 1, UINT256_MAX, WORKER, 0);
    });
  });
});
