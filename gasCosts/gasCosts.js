/* globals artifacts */
/* eslint-disable no-console */

import path from "path";
import { toBN } from "web3-utils";
import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";

import {
  MANAGER_ROLE,
  WORKER_ROLE,
  MANAGER_RATING,
  WORKER_RATING,
  RATING_1_SALT,
  RATING_2_SALT,
  RATING_1_SECRET,
  RATING_2_SECRET,
  SPECIFICATION_HASH,
  DELIVERABLE_HASH,
  SECONDS_PER_DAY,
  DEFAULT_STAKE,
  MINING_CYCLE_DURATION
} from "../helpers/constants";
import { getTokenArgs, currentBlockTime, forwardTime, bnSqrt, makeReputationKey } from "../helpers/test-helper";

import {
  giveUserCLNYTokensAndStake,
  fundColonyWithTokens,
  executeSignedTaskChange,
  executeSignedRoleAssignment,
  makeTask
} from "../helpers/test-data-generator";

import ReputationMiner from "../packages/reputation-miner/ReputationMiner";
import MaliciousReputationMinerExtraRep from "../packages/reputation-miner/test/MaliciousReputationMinerExtraRep";

const Token = artifacts.require("Token");
const IColony = artifacts.require("IColony");
const IMetaColony = artifacts.require("IMetaColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const EtherRouter = artifacts.require("EtherRouter");
const ITokenLocking = artifacts.require("ITokenLocking");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");

const oneMiningCycleDurationLater = async () => forwardTime(MINING_CYCLE_DURATION, this);
const REAL_PROVIDER_PORT = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

const contractLoader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "build", "contracts")
});

contract("All", accounts => {
  const gasPrice = 20e9;

  const MANAGER = accounts[0];
  const EVALUATOR = MANAGER;
  const WORKER = accounts[2];

  let colony;
  let token;
  let tokenAddress;
  let otherToken;
  let metaColony;
  let colonyNetwork;
  let tokenLocking;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);

    const tokenArgs = getTokenArgs();
    token = await Token.new(...tokenArgs);

    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await ITokenLocking.at(tokenLockingAddress);

    const { logs } = await colonyNetwork.createColony(token.address);
    const { colonyAddress } = logs[0].args;
    await token.setOwner(colonyAddress);
    colony = await IColony.at(colonyAddress);
    tokenAddress = await colony.getToken();
    await IColony.defaults({ gasPrice });

    const otherTokenArgs = getTokenArgs();
    otherToken = await Token.new(...otherTokenArgs);
  });

  // We currently only print out gas costs and no assertions are made about what these should be.
  describe("Gas costs", () => {
    it("when working with the Colony Network", async () => {
      const tokenArgs = getTokenArgs();
      const colonyToken = await Token.new(...tokenArgs);
      await colonyNetwork.createColony(colonyToken.address);
    });

    it("when working with the Meta Colony", async () => {
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(6);
      await metaColony.addGlobalSkill(7);
      await metaColony.addGlobalSkill(8);
    });

    it("when working with a Colony", async () => {
      await colony.mintTokens(200);
      await colony.claimColonyFunds(tokenAddress);
      await colony.setAdminRole(EVALUATOR);
    });

    it("when working with a Task", async () => {
      const taskId = await makeTask({ colony });

      // setTaskSkill
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskSkill",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, 7]
      });

      // setTaskBrief
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskBrief",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, SPECIFICATION_HASH]
      });

      // setTaskDueDate
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 5;

      await executeSignedTaskChange({
        colony,
        functionName: "setTaskDueDate",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, dueDate]
      });

      // moveFundsBetweenPots
      await colony.moveFundsBetweenPots(1, 2, 150, tokenAddress);

      // setTaskManagerPayout
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskManagerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, tokenAddress, 50]
      });

      // setTaskEvaluatorPayout
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskEvaluatorPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, tokenAddress, 40]
      });

      // setTaskWorkerPayout
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskWorkerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, tokenAddress, 100]
      });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      // submitTaskDeliverable
      await colony.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER, gasPrice });

      // submitTaskWorkRating
      await colony.submitTaskWorkRating(taskId, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR, gasPrice });
      await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER });

      // revealTaskWorkRating
      await colony.revealTaskWorkRating(taskId, WORKER_ROLE, WORKER_RATING, RATING_2_SALT, { from: EVALUATOR, gasPrice });
      await colony.revealTaskWorkRating(taskId, MANAGER_ROLE, MANAGER_RATING, RATING_1_SALT, { from: WORKER });

      // finalizeTask
      await colony.finalizeTask(taskId);
    });

    it("when working with staking", async () => {
      const STAKER1 = accounts[0];
      const STAKER2 = accounts[1];
      const STAKER3 = accounts[2];

      // Setup the stakers balance
      await giveUserCLNYTokensAndStake(colonyNetwork, STAKER1, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, STAKER2, DEFAULT_STAKE);
      await giveUserCLNYTokensAndStake(colonyNetwork, STAKER3, DEFAULT_STAKE);

      let repCycleAddr = await colonyNetwork.getReputationMiningCycle(true);

      await oneMiningCycleDurationLater();
      let repCycle = await IReputationMiningCycle.at(repCycleAddr);
      await repCycle.submitRootHash("0x00", 0, 1);
      await repCycle.confirmNewHash(0);

      repCycleAddr = await colonyNetwork.getReputationMiningCycle(true);
      repCycle = await IReputationMiningCycle.at(repCycleAddr);

      const goodClient = new ReputationMiner({ loader: contractLoader, minerAddress: STAKER1, realProviderPort: REAL_PROVIDER_PORT });
      const badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: STAKER2, realProviderPort: REAL_PROVIDER_PORT },
        1,
        0xfffffffff
      );
      const badClient2 = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: STAKER3, realProviderPort: REAL_PROVIDER_PORT },
        2,
        0xfffffffff
      );
      await goodClient.initialise(colonyNetwork.address);
      await badClient.initialise(colonyNetwork.address);
      await badClient2.initialise(colonyNetwork.address);
      // Submit hashes
      await goodClient.addLogContentsToReputationTree();
      await badClient.addLogContentsToReputationTree();
      await badClient2.addLogContentsToReputationTree();
      await forwardTime(MINING_CYCLE_DURATION / 2, this);
      await goodClient.submitRootHash();
      await badClient.submitRootHash();
      await badClient2.submitRootHash();
      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      // Session of respond / invalidate between our 3 submissions
      await goodClient.submitJustificationRootHash();
      await badClient.submitJustificationRootHash();
      await badClient2.submitJustificationRootHash();

      await repCycle.invalidateHash(0, 3); // Bye for R1

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      // We now know where they disagree
      await goodClient.respondToChallenge();
      // badClient will fail this if we try
      // await badClient.respondToChallenge();
      await oneMiningCycleDurationLater();
      await repCycle.invalidateHash(0, 1);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient2.respondToBinarySearchForChallenge();

      await goodClient.respondToBinarySearchForChallenge();
      await badClient2.respondToBinarySearchForChallenge();

      await goodClient.respondToBinarySearchForChallenge();
      await badClient2.respondToBinarySearchForChallenge();

      await goodClient.respondToBinarySearchForChallenge();
      await badClient2.respondToBinarySearchForChallenge();

      await goodClient.respondToBinarySearchForChallenge();
      await badClient2.respondToBinarySearchForChallenge();

      await goodClient.confirmBinarySearchResult();
      await badClient.confirmBinarySearchResult();

      await goodClient.respondToChallenge();
      await oneMiningCycleDurationLater();
      await repCycle.invalidateHash(1, 0);

      await repCycle.confirmNewHash(2);

      const clnyToken = await metaColony.getToken();
      // withdraw
      await tokenLocking.withdraw(clnyToken, DEFAULT_STAKE.divn(4), { from: STAKER1 });
    });

    it("when working with reward payouts", async () => {
      const totalReputation = toBN(300 * 1e18);
      const workerReputation = toBN(200 * 1e18);
      const managerReputation = toBN(100 * 1e18);
      const initialFunding = toBN(360 * 1e18);

      const tokenArgs = getTokenArgs();
      const newToken = await Token.new(...tokenArgs);
      const { logs } = await colonyNetwork.createColony(newToken.address);
      const { colonyAddress } = logs[0].args;
      const newColony = await IColony.at(colonyAddress);
      await newToken.setOwner(colonyAddress);

      await fundColonyWithTokens(newColony, otherToken, initialFunding);
      await newColony.mintTokens(workerReputation.add(managerReputation).toString());

      await newColony.bootstrapColony([WORKER, MANAGER], [workerReputation.toString(), managerReputation.toString()]);

      let addr = await colonyNetwork.getReputationMiningCycle.call(true);
      await forwardTime(MINING_CYCLE_DURATION, this);
      let repCycle = await IReputationMiningCycle.at(addr);
      await repCycle.submitRootHash("0x00", 0, 10);
      await repCycle.confirmNewHash(0);

      await giveUserCLNYTokensAndStake(colonyNetwork, accounts[4], DEFAULT_STAKE);

      const miningClient = new ReputationMiner({
        loader: contractLoader,
        minerAddress: accounts[4],
        realProviderPort: REAL_PROVIDER_PORT,
        useJsTree: true
      });
      await miningClient.initialise(colonyNetwork.address);
      await miningClient.addLogContentsToReputationTree();
      await forwardTime(MINING_CYCLE_DURATION, this);
      await miningClient.submitRootHash();

      addr = await colonyNetwork.getReputationMiningCycle.call(true);
      repCycle = await IReputationMiningCycle.at(addr);
      await repCycle.confirmNewHash(0);

      const result = await newColony.getDomain(1);
      const rootDomainSkill = result.skillId;
      const colonyWideReputationKey = makeReputationKey(newColony.address, rootDomainSkill);
      let { key, value, branchMask, siblings } = await miningClient.getReputationProofObject(colonyWideReputationKey);
      const colonyWideReputationProof = [key, value, branchMask, siblings];

      const userReputationKey = makeReputationKey(newColony.address, rootDomainSkill, WORKER);
      ({ key, value, branchMask, siblings } = await miningClient.getReputationProofObject(userReputationKey));
      const userReputationProof = [key, value, branchMask, siblings];

      await newToken.approve(tokenLocking.address, workerReputation.toString(), {
        from: WORKER
      });
      await tokenLocking.deposit(newToken.address, workerReputation.toString(), {
        from: WORKER
      });

      const tx = await newColony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const payoutId = tx.logs[0].args.id;

      await tokenLocking.incrementLockCounterTo(newToken.address, payoutId, {
        from: MANAGER
      });

      const workerReputationSqrt = bnSqrt(workerReputation);
      const totalReputationSqrt = bnSqrt(totalReputation, true);
      const numeratorSqrt = bnSqrt(workerReputationSqrt.mul(workerReputationSqrt));
      const denominatorSqrt = bnSqrt(totalReputationSqrt.mul(totalReputationSqrt), true);

      const balance = await newColony.getPotBalance(0, otherToken.address);
      const amountSqrt = bnSqrt(balance);

      const squareRoots = [
        workerReputationSqrt.toString(),
        workerReputationSqrt.toString(),
        totalReputationSqrt.toString(),
        totalReputationSqrt.toString(),
        numeratorSqrt.toString(),
        denominatorSqrt.toString(),
        amountSqrt.toString()
      ];

      await newColony.claimRewardPayout(payoutId, squareRoots, ...userReputationProof, {
        from: WORKER
      });

      await forwardTime(5184001);
      await newColony.finalizeRewardPayout(payoutId);

      await fundColonyWithTokens(newColony, otherToken, initialFunding);

      const tx2 = await newColony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const payoutId2 = tx2.logs[0].args.id;

      await tokenLocking.incrementLockCounterTo(newToken.address, payoutId2, {
        from: MANAGER
      });

      await newColony.claimRewardPayout(payoutId2, squareRoots, ...userReputationProof, {
        from: WORKER
      });

      await forwardTime(5184001);
      await newColony.finalizeRewardPayout(payoutId2);
    });
  });
});
