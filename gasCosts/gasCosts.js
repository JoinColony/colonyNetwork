/* globals artifacts */
/* eslint-disable no-console */
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
import { getTokenArgs, currentBlockTime, createSignatures, forwardTime } from "../helpers/test-helper";
import { setupColonyVersionResolver } from "../helpers/upgradable-contracts";
import { giveUserCLNYTokens } from "../helpers/test-data-generator";

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

contract("All", () => {
  const gasPrice = 20e9;

  let colony;
  let tokenAddress;
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
    const token = await Token.new(...tokenArgs);
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
  });

  // We currently only print out gas costs and no assertions are made about what these should be.
  describe("Gas costs", () => {
    it("when working with the Colony Network", async () => {
      const tokenArgs = getTokenArgs();
      const token = await Token.new(...tokenArgs);
      await colonyNetwork.createColony("Test", token.address);
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

      // Load the token
      const clnyAddress = await commonColony.getToken.call();
      const clny = Token.at(clnyAddress);

      // Setup the stakers balance
      const bigStr = "1000000000000000000";
      const lessBigStr = "10000000000000000";
      const big = new BN(bigStr);

      await giveUserCLNYTokens(colonyNetwork, STAKER1, big);
      await clny.approve(colonyNetwork.address, bigStr, { from: STAKER1 });

      await giveUserCLNYTokens(colonyNetwork, STAKER2, big);
      await clny.approve(colonyNetwork.address, bigStr, { from: STAKER2 });

      await giveUserCLNYTokens(colonyNetwork, STAKER3, big);
      await clny.approve(colonyNetwork.address, bigStr, { from: STAKER3 });

      // stake
      await colonyNetwork.deposit(lessBigStr, { from: STAKER1 });
      await colonyNetwork.deposit(lessBigStr, { from: STAKER2 });
      await colonyNetwork.deposit(lessBigStr, { from: STAKER3 });

      // Start Reputation
      await colonyNetwork.startNextCycle();
      const repCycleAddr = await colonyNetwork.getReputationMiningCycle.call();

      await oneHourLater();

      const repCycle = ReputationMiningCycle.at(repCycleAddr);

      // Submit Hash
      await repCycle.submitNewHash("0x87654321", 1, 1, { from: STAKER1, gas: 600000 });
      await repCycle.submitNewHash("0x87654322", 2, 10, { from: STAKER2, gas: 600000 });
      await repCycle.submitNewHash("0x87654323", 3, 10, { from: STAKER3, gas: 600000 });

      // Session of respond / invalidate between our 3 submissions
      await repCycle.respondToChallenge(0, 0);
      await oneHourLater();
      await repCycle.invalidateHash(0, 1);
      await oneHourLater();
      await repCycle.invalidateHash(0, 3); // Invalidate the 'null' competing against submission idx=2
      await oneHourLater();
      await repCycle.respondToChallenge(1, 1);
      await oneHourLater();
      await repCycle.invalidateHash(1, 0);
      await oneHourLater();
      await repCycle.confirmNewHash(2);

      // withdraw
      await colonyNetwork.withdraw(lessBigStr, { from: STAKER3 });
    });
  });
});
