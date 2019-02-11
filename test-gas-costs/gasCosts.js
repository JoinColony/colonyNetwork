/* globals artifacts */
/* eslint-disable no-console, prefer-arrow-callback */

import path from "path";
import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";

import {
  WAD,
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
  DEFAULT_STAKE
} from "../helpers/constants";

import {
  getTokenArgs,
  currentBlockTime,
  forwardTime,
  bnSqrt,
  makeReputationKey,
  getActiveRepCycle,
  advanceMiningCycleNoContest,
  submitAndForwardTimeToDispute,
  accommodateChallengeAndInvalidateHash
} from "../helpers/test-helper";

import {
  giveUserCLNYTokensAndStake,
  fundColonyWithTokens,
  executeSignedTaskChange,
  executeSignedRoleAssignment,
  makeTask,
  setupRandomColony
} from "../helpers/test-data-generator";

import ReputationMinerTestWrapper from "../packages/reputation-miner/test/ReputationMinerTestWrapper";
import MaliciousReputationMinerExtraRep from "../packages/reputation-miner/test/MaliciousReputationMinerExtraRep";

const DSToken = artifacts.require("DSToken");
const IColony = artifacts.require("IColony");
const IMetaColony = artifacts.require("IMetaColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const EtherRouter = artifacts.require("EtherRouter");
const ITokenLocking = artifacts.require("ITokenLocking");

const REAL_PROVIDER_PORT = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

const contractLoader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "build", "contracts")
});

contract("All", function(accounts) {
  const gasPrice = 20e9;

  const MANAGER = accounts[0];
  const EVALUATOR = MANAGER;
  const WORKER = accounts[2];

  let colony;
  let token;
  let otherToken;
  let metaColony;
  let colonyNetwork;
  let tokenLocking;

  before(async function() {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);

    ({ colony, token } = await setupRandomColony(colonyNetwork));

    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await ITokenLocking.at(tokenLockingAddress);

    await IColony.defaults({ gasPrice });

    const otherTokenArgs = getTokenArgs();
    otherToken = await DSToken.new(otherTokenArgs[1]);
  });

  // We currently only print out gas costs and no assertions are made about what these should be.
  describe("Gas costs", function() {
    it("when working with the Colony Network", async function() {
      const tokenArgs = getTokenArgs();
      const colonyToken = await DSToken.new(tokenArgs[1]);
      await colonyNetwork.createColony(colonyToken.address);
    });

    it("when working with the Meta Colony", async function() {
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(6);
      await metaColony.addGlobalSkill(7);
      await metaColony.addGlobalSkill(8);
    });

    it("when working with a Colony", async function() {
      await colony.mintTokens(200);
      await colony.claimColonyFunds(token.address);
      await colony.setAdminRole(EVALUATOR);
    });

    it("when working with a Task", async function() {
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
      await colony.moveFundsBetweenPots(1, 2, 150, token.address);

      // setTaskManagerPayout
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskManagerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, token.address, 50]
      });

      // setTaskEvaluatorPayout
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskEvaluatorPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, token.address, 40]
      });

      // setTaskWorkerPayout
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskWorkerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, token.address, 100]
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

    it("when working with staking", async function() {
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
        useJsTree: true
      });
      const badClient = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: STAKER2, realProviderPort: REAL_PROVIDER_PORT, useJsTree: true },
        1,
        0xfffffffff
      );
      const badClient2 = new MaliciousReputationMinerExtraRep(
        { loader: contractLoader, minerAddress: STAKER3, realProviderPort: REAL_PROVIDER_PORT, useJsTree: true },
        2,
        0xfffffffff
      );
      await goodClient.initialise(colonyNetwork.address);
      await badClient.initialise(colonyNetwork.address);
      await badClient2.initialise(colonyNetwork.address);

      // Submit hashes
      await submitAndForwardTimeToDispute([goodClient, badClient, badClient2], this);
      // Session of respond / invalidate between our 3 submissions
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
      });
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, badClient2); // Invalidate the 'null' that partners the third hash submitted.
      await accommodateChallengeAndInvalidateHash(colonyNetwork, this, goodClient, badClient2, {
        client2: { respondToChallenge: "colony-reputation-mining-increased-reputation-value-incorrect" }
      });
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await repCycle.confirmNewHash(2);

      // withdraw
      const clnyToken = await metaColony.getToken();
      await tokenLocking.withdraw(clnyToken, DEFAULT_STAKE.divn(4), { from: STAKER1 });
    });

    it("when working with reward payouts", async function() {
      const totalReputation = WAD.muln(300);
      const workerReputation = WAD.muln(200);
      const managerReputation = WAD.muln(100);
      const initialFunding = WAD.muln(360);

      const tokenArgs = getTokenArgs();
      const newToken = await DSToken.new(tokenArgs[1]);
      const { logs } = await colonyNetwork.createColony(newToken.address);
      const { colonyAddress } = logs[0].args;
      const newColony = await IColony.at(colonyAddress);
      await newToken.setOwner(colonyAddress);

      await fundColonyWithTokens(newColony, otherToken, initialFunding);
      await newColony.mintTokens(workerReputation.add(managerReputation));
      await newColony.claimColonyFunds(newToken.address);
      await newColony.bootstrapColony([WORKER, MANAGER], [workerReputation, managerReputation]);

      await giveUserCLNYTokensAndStake(colonyNetwork, accounts[8], DEFAULT_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const miningClient = new ReputationMinerTestWrapper({
        loader: contractLoader,
        minerAddress: accounts[8],
        realProviderPort: REAL_PROVIDER_PORT,
        useJsTree: true
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
      await tokenLocking.deposit(newToken.address, workerReputation, { from: WORKER });
      await forwardTime(1, this);

      const tx = await newColony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const payoutId = tx.logs[0].args.rewardPayoutId;

      await tokenLocking.incrementLockCounterTo(newToken.address, payoutId, {
        from: MANAGER
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
        amountSqrt
      ];

      await newColony.claimRewardPayout(payoutId, squareRoots, ...userReputationProof, {
        from: WORKER
      });

      await forwardTime(5184001);
      await newColony.finalizeRewardPayout(payoutId);

      await fundColonyWithTokens(newColony, otherToken, initialFunding);

      const tx2 = await newColony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const payoutId2 = tx2.logs[0].args.rewardPayoutId;

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
