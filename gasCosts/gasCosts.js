/* globals artifacts */
/* eslint-disable no-console */
import {
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
import { getTokenArgs, currentBlockTime } from "../helpers/test-helper";
import { setupColonyVersionResolver } from "../helpers/upgradable-contracts";

const Colony = artifacts.require("Colony");
const Token = artifacts.require("Token");
const IColony = artifacts.require("IColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ColonyTask = artifacts.require("ColonyTask");
const ColonyFunding = artifacts.require("ColonyFunding");
const ColonyTransactionReviewer = artifacts.require("ColonyTransactionReviewer");
const Resolver = artifacts.require("Resolver");
const EtherRouter = artifacts.require("EtherRouter");
const Authority = artifacts.require("Authority");

contract("All", () => {
  const gasPrice = 20e9;

  let colony;
  let tokenAddress;
  let colonyTask;
  let colonyFunding;
  let colonyTransactionReviewer;
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
    colonyTransactionReviewer = await ColonyTransactionReviewer.new();

    await setupColonyVersionResolver(colony, colonyTask, colonyFunding, colonyTransactionReviewer, resolver, colonyNetwork);
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

      // Propose task change
      let txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH);
      await colony.proposeTaskChange(txData, 0, 0);

      let transactionId = await colony.getTransactionCount.call();
      await colony.approveTaskChange(transactionId, WORKER_ROLE, { from: WORKER, gasPrice });

      const dueDate = currentBlockTime() + SECONDS_PER_DAY * 5;
      txData = await colony.contract.setTaskDueDate.getData(1, dueDate);
      await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
      transactionId = await colony.getTransactionCount.call();
      await colony.approveTaskChange(transactionId, WORKER_ROLE, { from: WORKER });

      // moveFundsBetweenPots
      await colony.moveFundsBetweenPots(1, 2, 150, tokenAddress);

      // setTaskManagerPayout
      await colony.setTaskManagerPayout(1, tokenAddress, 50);

      // setTaskEvaluatorPayout
      txData = await colony.contract.setTaskEvaluatorPayout.getData(1, tokenAddress, 40);
      await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
      transactionId = await colony.getTransactionCount.call();
      await colony.approveTaskChange(transactionId, EVALUATOR_ROLE, { from: EVALUATOR });

      // setTaskWorkerPayout
      txData = await colony.contract.setTaskWorkerPayout.getData(1, tokenAddress, 100);
      await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
      transactionId = await colony.getTransactionCount.call();
      await colony.approveTaskChange(transactionId, WORKER_ROLE, { from: WORKER });

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
  });
});
