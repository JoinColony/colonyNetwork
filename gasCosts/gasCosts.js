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
import testHelper from "../helpers/test-helper";
import upgradableContracts from "../helpers/upgradable-contracts";

const Colony = artifacts.require("Colony");
const IColony = artifacts.require("IColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ColonyTask = artifacts.require("ColonyTask");
const ColonyFunding = artifacts.require("ColonyFunding");
const ColonyTransactionReviewer = artifacts.require("ColonyTransactionReviewer");
const Resolver = artifacts.require("Resolver");
const EtherRouter = artifacts.require("EtherRouter");
const Authority = artifacts.require("Authority");

contract("all", () => {
  const gasPrice = 20e9;

  let colony;
  let tokenAddress;
  let colonyTask;
  let colonyFunding;
  let colonyTransactionReviewer;
  let commonColony;
  let authority;
  let colonyNetwork;

  let mintTokensCost;

  let makeTaskCost;
  let setTaskDomainCost;
  let setTaskSkillCost;
  let setTaskRoleUserCost;
  let proposeTaskChangeCost;
  let approveTaskChangeCost;
  let moveFundsBetweenPotsCost;
  let setTaskManagerPayoutCost;
  let submitTaskDeliverableCost;
  let submitTaskWorkRatingCost;
  let revealTaskWorkRatingCost;
  let finalizeTaskCost;

  before(async () => {
    console.log("Gas price : ", gasPrice);
    colony = await Colony.new();
    const resolver = await Resolver.new();
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    colonyTask = await ColonyTask.new();
    colonyFunding = await ColonyFunding.new();
    colonyTransactionReviewer = await ColonyTransactionReviewer.new();

    await upgradableContracts.setupColonyVersionResolver(colony, colonyTask, colonyFunding, colonyTransactionReviewer, resolver, colonyNetwork);
    const tokenArgs = testHelper.getTokenArgs();
    const estimate = await colonyNetwork.createColony.estimateGas("Antz", ...tokenArgs);
    console.log("createColony estimate : ", estimate);
    const tx = await colonyNetwork.createColony("Antz", ...tokenArgs, { gasPrice });
    console.log("createColony actual cost : ", tx.receipt.gasUsed);
    const address = await colonyNetwork.getColony.call("Antz");
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
    it("when working with the Common Colony", async () => {
      const tx0 = await commonColony.addGlobalSkill(1);
      const addSkillCost0 = tx0.receipt.gasUsed;
      console.log("addGlobalSkill to level 1 actual cost :", addSkillCost0);

      const tx1 = await commonColony.addGlobalSkill(4);
      const addSkillCost1 = tx1.receipt.gasUsed;
      console.log("addGlobalSkill to level 2 actual cost :", addSkillCost1);

      const tx2 = await commonColony.addGlobalSkill(5);
      const addSkillCost2 = tx2.receipt.gasUsed;
      console.log("addGlobalSkill to level 3 actual cost :", addSkillCost2);

      const tx3 = await commonColony.addGlobalSkill(6);
      const addSkillCost3 = tx3.receipt.gasUsed;
      console.log("addGlobalSkill to level 4 actual cost :", addSkillCost3);
    });

    it("when working with a Colony", async () => {
      // mintTokens
      let estimate = await colony.mintTokens.estimateGas(200);
      console.log("mintTokens estimate : ", estimate);
      let tx = await colony.mintTokens(200, { gasPrice });
      mintTokensCost = tx.receipt.gasUsed;
      console.log("mintTokens actual cost :", mintTokensCost);
      await colony.claimColonyFunds(tokenAddress);

      // setUserRole
      estimate = await authority.setUserRole.estimateGas(EVALUATOR, 1, true);
      console.log("setUserRole estimate : ", estimate);
      tx = await authority.setUserRole(EVALUATOR, 1, true);
      console.log("setUserRole actual cost :", tx.receipt.gasUsed);
    });

    it("when working with a Task", async () => {
      // makeTask
      let estimate = await colony.makeTask.estimateGas(SPECIFICATION_HASH, 1);
      console.log("makeTask estimate : ", estimate);
      let tx = await colony.makeTask(SPECIFICATION_HASH, 1, { gasPrice });
      makeTaskCost = tx.receipt.gasUsed;
      console.log("makeTask actual cost :", makeTaskCost);

      // setTaskDomain
      estimate = await colony.setTaskDomain.estimateGas(1, 1);
      console.log("setTaskDomain estimate : ", estimate);
      tx = await colony.setTaskDomain(1, 1, { gasPrice });
      setTaskDomainCost = tx.receipt.gasUsed;
      console.log("setTaskDomain actual cost :", setTaskDomainCost);

      // setTaskSkill
      estimate = await colony.setTaskSkill.estimateGas(1, 7);
      console.log("setTaskSkill estimate : ", estimate);
      tx = await colony.setTaskSkill(1, 7, { gasPrice });
      setTaskSkillCost = tx.receipt.gasUsed;
      console.log("setTaskSkill actual cost :", setTaskSkillCost);

      // setTaskRoleUser
      estimate = await colony.setTaskRoleUser.estimateGas(1, EVALUATOR_ROLE, EVALUATOR);
      console.log("setTaskRoleUser estimate : ", estimate);
      tx = await colony.setTaskRoleUser(1, EVALUATOR_ROLE, EVALUATOR, { gasPrice });
      setTaskRoleUserCost = tx.receipt.gasUsed;
      console.log("setTaskRoleUser actual cost :", setTaskRoleUserCost);

      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);

      // Propose task change
      let txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH);
      estimate = await colony.proposeTaskChange.estimateGas(txData, 0, 0);
      console.log("proposeTaskChange estimate : ", estimate);
      tx = await colony.proposeTaskChange(txData, 0, 0, { gasPrice });
      proposeTaskChangeCost = tx.receipt.gasUsed;
      console.log("proposeTaskChange actual cost :", proposeTaskChangeCost);
      // Approve task change
      let transactionId = await colony.getTransactionCount.call();
      estimate = await colony.approveTaskChange.estimateGas(transactionId, WORKER_ROLE, { from: WORKER });
      console.log("approveTaskChange estimate : ", estimate);
      tx = await colony.approveTaskChange(transactionId, WORKER_ROLE, { from: WORKER, gasPrice });
      approveTaskChangeCost = tx.receipt.gasUsed;
      console.log("approveTaskChange actual cost :", approveTaskChangeCost);

      let dueDate = await testHelper.currentBlockTime();
      dueDate += SECONDS_PER_DAY * 5;
      txData = await colony.contract.setTaskDueDate.getData(1, dueDate);
      await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
      transactionId = await colony.getTransactionCount.call();
      await colony.approveTaskChange(transactionId, WORKER_ROLE, { from: WORKER });

      // moveFundsBetweenPots
      estimate = await colony.moveFundsBetweenPots.estimateGas(1, 2, 200, tokenAddress);
      console.log("moveFundsBetweenPots estimate : ", estimate);
      tx = await colony.moveFundsBetweenPots(1, 2, 150, tokenAddress, { gasPrice });
      moveFundsBetweenPotsCost = tx.receipt.gasUsed;
      console.log("moveFundsBetweenPots actual cost :", moveFundsBetweenPotsCost);

      // setTaskManagerPayout
      estimate = await colony.setTaskManagerPayout.estimateGas(1, tokenAddress, 50);
      console.log("setTaskManagerPayout estimate : ", estimate);
      tx = await colony.setTaskManagerPayout(1, tokenAddress, 50);
      setTaskManagerPayoutCost = tx.receipt.gasUsed;
      console.log("setTaskManagerPayout actual cost :", setTaskManagerPayoutCost);

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
      estimate = await colony.submitTaskDeliverable.estimateGas(1, DELIVERABLE_HASH, { from: WORKER });
      console.log("submitTaskDeliverable estimate : ", estimate);
      tx = await colony.submitTaskDeliverable(1, DELIVERABLE_HASH, { from: WORKER, gasPrice });
      submitTaskDeliverableCost = tx.receipt.gasUsed;
      console.log("submitTaskDeliverable actual cost :", submitTaskDeliverableCost);

      // submitTaskWorkRating
      estimate = await colony.submitTaskWorkRating.estimateGas(1, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });
      console.log("submitTaskWorkRating estimate : ", estimate);
      tx = await colony.submitTaskWorkRating(1, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR, gasPrice });
      submitTaskWorkRatingCost = tx.receipt.gasUsed;
      console.log("submitTaskWorkRating actual cost :", submitTaskWorkRatingCost);

      await colony.submitTaskWorkRating(1, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER });

      // revealTaskWorkRating
      estimate = await colony.revealTaskWorkRating.estimateGas(1, WORKER_ROLE, WORKER_RATING, RATING_2_SALT, { from: EVALUATOR });
      console.log("revealTaskWorkRating estimate : ", estimate);
      tx = await colony.revealTaskWorkRating(1, WORKER_ROLE, WORKER_RATING, RATING_2_SALT, { from: EVALUATOR, gasPrice });
      revealTaskWorkRatingCost = tx.receipt.gasUsed;
      console.log("revealTaskWorkRating actual cost :", revealTaskWorkRatingCost);

      await colony.revealTaskWorkRating(1, MANAGER_ROLE, MANAGER_RATING, RATING_1_SALT, { from: WORKER });

      // finalizeTask
      estimate = await colony.finalizeTask.estimateGas(1);
      console.log("finalizeTask estimate: ", estimate);
      tx = await colony.finalizeTask(1, { gasPrice });
      finalizeTaskCost = tx.receipt.gasUsed;
      console.log("finalizeTask actual cost :", finalizeTaskCost);
    });

    it("average gas costs for a task lifecycle", async () => {
      const totalGasCost =
        makeTaskCost +
        setTaskSkillCost +
        setTaskRoleUserCost * 2 +
        // setTaskBrief, setTaskDueDate, setTaskEvaluatorPayout, setTaskWorkerPayout
        proposeTaskChangeCost * 4 +
        approveTaskChangeCost * 4 +
        submitTaskDeliverableCost +
        setTaskManagerPayoutCost +
        submitTaskWorkRatingCost * 2 +
        revealTaskWorkRatingCost * 2 +
        finalizeTaskCost;

      const totalEtherCost = web3.fromWei(totalGasCost * gasPrice, "ether");
      console.log("Average task cost : ");
      console.log(" Gas : ", totalGasCost);
      console.log(" Ether : ", totalEtherCost);
    });

    // TODO: Come back to review the average gas cost checks
    it.skip("Average gas costs for customers should not exceed 1 ETH per month", async () => {
      const totalGasCost =
        makeTaskCost * 100 + // assume 100 tasks per month are created
        proposeTaskChangeCost * 20 + // assume 20% of all tasks are updated once
        proposeTaskChangeCost * 100 + // assume all new tasks have their budget set once
        finalizeTaskCost * 25 + // quarter of all tasks are closed and paid out
        mintTokensCost * 1; // only once per month are new colony tokens generated

      const totalEtherCost = web3.fromWei(totalGasCost * gasPrice, "ether");
      console.log("Average monthly cost per customer is : ");
      console.log(" Gas : ", totalGasCost);
      console.log(" Ether : ", totalEtherCost);

      // Only do this assert if we're using testrpc. There's discrepancy between TestRPC estimategas
      // and geth estimateGas; the former is too high.
      const client = await testHelper.web3GetClient();
      if (client.indexOf("TestRPC") === -1) {
        assert.isBelow(totalEtherCost, 1, "Monthly average costs exceed target");
      } else {
        console.log("IGNORING THE RESULT DUE TO TESTRPC INACCURACIES IN ESTIMATEGAS");
      }
    });
  });
});
