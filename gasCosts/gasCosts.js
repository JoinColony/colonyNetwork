/* globals artifacts */
/* eslint-disable no-console */

import { toBN } from "web3-utils";

import {
  MANAGER,
  EVALUATOR,
  WORKER,
  MANAGER_ROLE,
  EVALUATOR_ROLE,
  WORKER_ROLE,
  MANAGER_RATING,
  WORKER_RATING,
  RATING_1_SALT,
  RATING_2_SALT,
  RATING_1_SECRET,
  RATING_2_SECRET,
  SPECIFICATION_HASH,
  DELIVERABLE_HASH,
  SECONDS_PER_DAY
} from "../helpers/constants";
import { getRandomString, getTokenArgs, currentBlockTime, createSignatures, forwardTime, bnSqrt } from "../helpers/test-helper";
import { setupColonyVersionResolver } from "../helpers/upgradable-contracts";
import { giveUserCLNYTokensAndStake, fundColonyWithTokens } from "../helpers/test-data-generator";
import ReputationMiningClient from "../client/main";
import MaliciousReputationMiningClient from "../client/malicious";

const BN = require("bn.js");

const Colony = artifacts.require("Colony");
const Token = artifacts.require("Token");
const IColony = artifacts.require("IColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ColonyTask = artifacts.require("ColonyTask");
const ColonyFunding = artifacts.require("ColonyFunding");
const Resolver = artifacts.require("Resolver");
const EtherRouter = artifacts.require("EtherRouter");
const Authority = artifacts.require("Authority");
const ReputationMiningCycle = artifacts.require("ReputationMiningCycle");

const oneHourLater = async () => forwardTime(3600, this);
const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

contract("All", () => {
  const gasPrice = 20e9;

  let colony;
  let token;
  let tokenAddress;
  let otherToken;
  let colonyTask;
  let colonyFunding;
  let commonColony;
  let authority;
  let colonyNetwork;

  before(async () => {
    colony = await Colony.new();
    const resolver = await Resolver.new();
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    colonyTask = await ColonyTask.new();
    colonyFunding = await ColonyFunding.new();

    await setupColonyVersionResolver(colony, colonyTask, colonyFunding, resolver, colonyNetwork);
    const tokenArgs = getTokenArgs();
    token = await Token.new(...tokenArgs);
    await colonyNetwork.createColony("Antz", token.address);
    const address = await colonyNetwork.getColony.call("Antz");
    await token.setOwner(address);
    colony = await IColony.at(address);
    tokenAddress = await colony.getToken.call();
    const authorityAddress = await colony.authority.call();
    authority = await Authority.at(authorityAddress);
    await IColony.defaults({ gasPrice });

    const commonColonyAddress = await colonyNetwork.getColony.call("Common Colony");
    commonColony = await IColony.at(commonColonyAddress);

    const otherTokenArgs = getTokenArgs();
    otherToken = await Token.new(...otherTokenArgs);
  });

  // We currently only print out gas costs and no assertions are made about what these should be.
  describe("Gas costs", () => {
    it("when working with the Colony Network", async () => {
      const tokenArgs = getTokenArgs();
      const colonyToken = await Token.new(...tokenArgs);
      await colonyNetwork.createColony("Test", colonyToken.address);
    });

    it("when working with the Common Colony", async () => {
      await commonColony.addGlobalSkill(1);
      await commonColony.addGlobalSkill(5);
      await commonColony.addGlobalSkill(6);
      await commonColony.addGlobalSkill(7);
    });

    it("when working with a Colony", async () => {
      await colony.mintTokens(200);
      await colony.claimColonyFunds(tokenAddress);
      await authority.setUserRole(EVALUATOR, 1, true);
    });

    it("when working with a Task", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskDomain(1, 1);
      await colony.setTaskSkill(1, 7);
      await colony.setTaskRoleUser(1, EVALUATOR_ROLE, EVALUATOR);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);

      let txData;
      let sigs;

      // setTaskBrief
      txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH);
      sigs = await createSignatures(colony, [MANAGER, WORKER], 0, txData);
      await colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, 0, txData);

      // setTaskDueDate
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 5;
      txData = await colony.contract.setTaskDueDate.getData(1, dueDate);
      sigs = await createSignatures(colony, [MANAGER, WORKER], 0, txData);
      await colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, 0, txData);

      // moveFundsBetweenPots
      await colony.moveFundsBetweenPots(1, 2, 150, tokenAddress);

      // setTaskManagerPayout
      await colony.setTaskManagerPayout(1, tokenAddress, 50);

      // setTaskEvaluatorPayout
      txData = await colony.contract.setTaskEvaluatorPayout.getData(1, tokenAddress, 40);
      sigs = await createSignatures(colony, [MANAGER, EVALUATOR], 0, txData);
      await colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, 0, txData);

      // setTaskWorkerPayout
      txData = await colony.contract.setTaskWorkerPayout.getData(1, tokenAddress, 100);
      sigs = await createSignatures(colony, [MANAGER, WORKER], 0, txData);
      await colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, 0, txData);

      // submitTaskDeliverable
      await colony.submitTaskDeliverable(1, DELIVERABLE_HASH, { from: WORKER, gasPrice });

      // submitTaskWorkRating
      await colony.submitTaskWorkRating(1, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR, gasPrice });
      await colony.submitTaskWorkRating(1, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER });

      // revealTaskWorkRating
      await colony.revealTaskWorkRating(1, WORKER_ROLE, WORKER_RATING, RATING_2_SALT, { from: EVALUATOR, gasPrice });
      await colony.revealTaskWorkRating(1, MANAGER_ROLE, MANAGER_RATING, RATING_1_SALT, { from: WORKER });

      // finalizeTask
      await colony.finalizeTask(1);
    });

    it("when working with staking", async () => {
      // TODO: Should stakers be part of the constants?
      const STAKER1 = EVALUATOR;
      const STAKER2 = WORKER;
      const STAKER3 = MANAGER;

      // Setup the stakers balance
      const bigStr = "1000000000000000000";
      const lessBigStr = "10000000000000000";
      const big = new BN(bigStr);

      await giveUserCLNYTokensAndStake(colonyNetwork, STAKER1, big);
      await giveUserCLNYTokensAndStake(colonyNetwork, STAKER2, big);
      await giveUserCLNYTokensAndStake(colonyNetwork, STAKER3, big);

      // Start Reputation mining cycle
      await colonyNetwork.startNextCycle();
      let repCycleAddr = await colonyNetwork.getReputationMiningCycle.call();

      await oneHourLater();
      let repCycle = ReputationMiningCycle.at(repCycleAddr);
      await repCycle.submitNewHash("0x0", 0, 1);
      await repCycle.confirmNewHash(0);
      await oneHourLater();

      repCycleAddr = await colonyNetwork.getReputationMiningCycle.call();
      repCycle = ReputationMiningCycle.at(repCycleAddr);

      const goodClient = new ReputationMiningClient(STAKER1, realProviderPort);
      const badClient = new MaliciousReputationMiningClient(STAKER2, realProviderPort, 1, 0xfffffffff);
      const badClient2 = new MaliciousReputationMiningClient(STAKER3, realProviderPort, 2, 0xfffffffff);
      goodClient.initialise(colonyNetwork.address);
      badClient.initialise(colonyNetwork.address);
      badClient2.initialise(colonyNetwork.address);

      // Submit hashes
      await goodClient.addLogContentsToReputationTree();
      await badClient.addLogContentsToReputationTree();
      await badClient2.addLogContentsToReputationTree();

      await goodClient.submitRootHash();
      await badClient.submitRootHash();
      await badClient2.submitRootHash();

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

      // We now know where they disagree
      await goodClient.respondToChallenge();
      // badClient will fail this if we try
      // await badClient.respondToChallenge();
      await oneHourLater();
      await repCycle.invalidateHash(0, 1);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient2.respondToBinarySearchForChallenge();

      await goodClient.respondToBinarySearchForChallenge();
      await badClient2.respondToBinarySearchForChallenge();

      await goodClient.respondToBinarySearchForChallenge();
      await badClient2.respondToBinarySearchForChallenge();

      await goodClient.respondToBinarySearchForChallenge();
      await badClient2.respondToBinarySearchForChallenge();

      await goodClient.respondToChallenge();
      await oneHourLater();
      await repCycle.invalidateHash(1, 0);

      await repCycle.confirmNewHash(2);

      // withdraw
      await colonyNetwork.withdraw(lessBigStr, { from: STAKER1 });
    });

    it("when working with reward payouts", async () => {
      const totalReputation = toBN(350 * 1e18);
      const workerReputation = toBN(200 * 1e18);
      const managerReputation = toBN(100 * 1e18);
      const initialFunding = toBN(360 * 1e18);

      const tokenArgs = getTokenArgs();
      const newToken = await Token.new(...tokenArgs);
      const name = getRandomString(5);
      await colonyNetwork.createColony(name, newToken.address);

      const address = await colonyNetwork.getColony.call(name);
      const newColony = IColony.at(address);
      await newToken.setOwner(address);

      await fundColonyWithTokens(newColony, otherToken, initialFunding.toString());
      await fundColonyWithTokens(newColony, newToken, initialFunding.toString());

      await newColony.bootstrapColony([WORKER, MANAGER], [workerReputation.toString(), managerReputation.toString()]);

      const tx = await newColony.startNextRewardPayout(otherToken.address);
      const payoutId = tx.logs[0].args.id;

      await newColony.waiveRewardPayouts(1, {
        from: MANAGER
      });

      const workerReputationSqrt = bnSqrt(workerReputation);
      const totalReputationSqrt = bnSqrt(workerReputation.add(managerReputation));
      const numeratorSqrt = bnSqrt(workerReputationSqrt.mul(workerReputationSqrt));
      const denominatorSqrt = bnSqrt(totalReputationSqrt.mul(totalReputationSqrt));

      const info = await newColony.getRewardPayoutInfo.call(payoutId);

      const amountSqrt = bnSqrt(info[2]);

      const squareRoots = [
        workerReputationSqrt.toString(),
        workerReputationSqrt.toString(),
        totalReputationSqrt.toString(),
        totalReputationSqrt.toString(),
        numeratorSqrt.toString(),
        denominatorSqrt.toString(),
        amountSqrt.toString()
      ];

      await newColony.claimRewardPayout(payoutId, squareRoots, workerReputation.toString(), totalReputation.toString(), {
        from: WORKER
      });

      await forwardTime(5184001);
      await newColony.finalizeRewardPayout(payoutId);

      await fundColonyWithTokens(newColony, otherToken, initialFunding.toString());

      const tx2 = await newColony.startNextRewardPayout(otherToken.address);
      const payoutId2 = tx2.logs[0].args.id;

      await newColony.waiveRewardPayouts(1, {
        from: MANAGER
      });

      await newColony.claimRewardPayout(payoutId2, squareRoots, workerReputation.toString(), totalReputation.toString(), {
        from: WORKER
      });

      await forwardTime(5184001);
      await newColony.finalizeRewardPayout(payoutId2);
    });
  });
});
