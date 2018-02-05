/* globals artifacts */
/* eslint-disable no-console */
import { EVALUATOR,
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
  SPECIFICATION_HASH } from '../helpers/constants';
import testHelper from '../helpers/test-helper';
import upgradableContracts from '../helpers/upgradable-contracts';

const Colony = artifacts.require('Colony');
const IColony = artifacts.require('IColony');
const IColonyNetwork = artifacts.require('IColonyNetwork');
const ColonyTask = artifacts.require('ColonyTask');
const ColonyFunding = artifacts.require('ColonyFunding');
const ColonyTransactionReviewer = artifacts.require('ColonyTransactionReviewer');
const Resolver = artifacts.require('Resolver');
const EtherRouter = artifacts.require('EtherRouter');
const Authority = artifacts.require('Authority');

contract('all', () => {
  const gasPrice = 20e9;

  let colony;
  let colonyTask;
  let colonyFunding;
  let colonyTransactionReviewer;
  let commonColony;
  let authority;
  let colonyNetwork;

  let makeTaskCost;
  let proposeTaskUpdateCost;
  let mintTokensCost;
  let acceptTaskCost;

  before(async () => {
    console.log('Gas price : ', gasPrice);
    colony = await Colony.new();
    const resolver = await Resolver.new();
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    colonyTask = await ColonyTask.new();
    colonyFunding = await ColonyFunding.new();
    colonyTransactionReviewer = await ColonyTransactionReviewer.new();

    await upgradableContracts.setupColonyVersionResolver(colony, colonyTask, colonyFunding, colonyTransactionReviewer, resolver, colonyNetwork);
    const estimate = await colonyNetwork.createColony.estimateGas('Antz');
    console.log('createColony estimate : ', estimate);
    const tx = await colonyNetwork.createColony('Antz', { gasPrice });
    console.log('createColony actual cost : ', tx.receipt.gasUsed);
    const address = await colonyNetwork.getColony.call('Antz');
    colony = await IColony.at(address);
    const authorityAddress = await colony.authority.call();
    authority = await Authority.at(authorityAddress);
    await IColony.defaults({ gasPrice });

    const commonColonyAddress = await colonyNetwork.getColony.call('Common Colony');
    commonColony = await IColony.at(commonColonyAddress);
  });

  // We currently only print out gas costs and no assertions are made about what these should be.
  describe('Gas costs', () => {
    it('when working with the Common Colony', async () => {
      const tx0 = await commonColony.addGlobalSkill(1);
      const addSkillCost0 = tx0.receipt.gasUsed;
      console.log('addGlobalSkill to level 1 actual cost :', addSkillCost0);

      const tx1 = await commonColony.addGlobalSkill(2);
      const addSkillCost1 = tx1.receipt.gasUsed;
      console.log('addGlobalSkill to level 2 actual cost :', addSkillCost1);

      const tx2 = await commonColony.addGlobalSkill(3);
      const addSkillCost2 = tx2.receipt.gasUsed;
      console.log('addGlobalSkill to level 3 actual cost :', addSkillCost2);

      const tx3 = await commonColony.addGlobalSkill(4);
      const addSkillCost3 = tx3.receipt.gasUsed;
      console.log('addGlobalSkill to level 4 actual cost :', addSkillCost3);
    });

    it('when working with a Colony', async () => {
      // makeTask
      let estimate = await colony.makeTask.estimateGas(SPECIFICATION_HASH, 1);
      console.log('makeTask estimate : ', estimate);
      let tx = await colony.makeTask(SPECIFICATION_HASH, 1, { gasPrice });
      makeTaskCost = tx.receipt.gasUsed;
      console.log('makeTask actual cost :', makeTaskCost);

      await colony.setTaskRoleUser(1, EVALUATOR_ROLE, EVALUATOR);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);

      const dueDate = testHelper.currentBlockTime() - 1;
      let txData = await colony.contract.setTaskDueDate.getData(1, dueDate);
      await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
      const transactionId = await colony.getTransactionCount.call();
      await colony.approveTaskChange(transactionId, WORKER_ROLE, { from: WORKER });

      // Propose task change
      txData = await colony.contract.setTaskBrief.getData(1, SPECIFICATION_HASH);
      estimate = await colony.proposeTaskChange.estimateGas(txData, 0, 0);
      console.log('Propose task change of brief estimate : ', estimate);
      tx = await colony.proposeTaskChange(txData, 0, 0, { gasPrice });
      proposeTaskUpdateCost = tx.receipt.gasUsed;
      console.log('proposeTaskChange actual cost :', proposeTaskUpdateCost);

      // mintTokens
      estimate = await colony.mintTokens.estimateGas(200);
      console.log('mintTokens estimate : ', estimate);
      tx = await colony.mintTokens(200, { gasPrice });
      mintTokensCost = tx.receipt.gasUsed;
      console.log('mintTokens actual cost :', mintTokensCost);

      await colony.submitTaskWorkRating(1, WORKER_ROLE, RATING_2_SECRET, { from: EVALUATOR });
      await colony.submitTaskWorkRating(1, MANAGER_ROLE, RATING_1_SECRET, { from: WORKER });
      await colony.revealTaskWorkRating(1, WORKER_ROLE, WORKER_RATING, RATING_2_SALT, { from: EVALUATOR });
      await colony.revealTaskWorkRating(1, MANAGER_ROLE, MANAGER_RATING, RATING_1_SALT, { from: WORKER });

      // finalizeTask
      estimate = await colony.finalizeTask.estimateGas(1);
      console.log('finalizeTask estimate: ', estimate);
      tx = await colony.finalizeTask(1, { gasPrice });
      acceptTaskCost = tx.receipt.gasUsed;
      console.log('finalizeTask actual cost :', acceptTaskCost);

      // setUserRole
      estimate = await authority.setUserRole.estimateGas(EVALUATOR, 1, true);
      console.log('setUserRole estimate : ', estimate);
      tx = await authority.setUserRole(EVALUATOR, 1, true);
      console.log('setUserRole actual cost :', tx.receipt.gasUsed);
    });

    // TODO: Come back to review the average gas cost checks
    it.skip('Average gas costs for customers should not exceed 1 ETH per month', async () => {
      const totalGasCost = (makeTaskCost * 100) // assume 100 tasks per month are created
      + (proposeTaskUpdateCost * 20) // assume 20% of all tasks are updated once
      + (proposeTaskUpdateCost * 100) // assume all new tasks have their budget set once
      + (acceptTaskCost * 25) // quarter of all tasks are closed and paid out
      + (mintTokensCost * 1); // only once per month are new colony tokens generated

      const totalEtherCost = web3.fromWei(totalGasCost * gasPrice, 'ether');
      console.log('Average monthly cost per customer is : ');
      console.log(' Gas : ', totalGasCost);
      console.log(' Ether : ', totalEtherCost);

      // Only do this assert if we're using testrpc. There's discrepancy between TestRPC estimategas
      // and geth estimateGas; the former is too high.
      const client = await testHelper.web3GetClient();
      if (client.indexOf('TestRPC') === -1) {
        assert.isBelow(totalEtherCost, 1, 'Monthly average costs exceed target');
      } else {
        console.log('IGNORING THE RESULT DUE TO TESTRPC INACCURACIES IN ESTIMATEGAS');
      }
    });
  });
});
