/* globals artifacts */
import CONST from '../helpers/constants';
import testHelper from '../helpers/test-helper';
import testDataGenerator from '../helpers/test-data-generator';
const upgradableContracts = require('../helpers/upgradable-contracts');
import sha3 from 'solidity-sha3';

const Colony = artifacts.require('Colony');
const IColony = artifacts.require('IColony');
const IColonyNetwork = artifacts.require('IColonyNetwork');
const ColonyTask = artifacts.require('ColonyTask');
const ColonyFunding = artifacts.require('ColonyFunding');
const ColonyTransactionReviewer = artifacts.require('ColonyTransactionReviewer');
const Token = artifacts.require('Token');
const Authority = artifacts.require('Authority');
const Resolver = artifacts.require('Resolver');
const EtherRouter = artifacts.require('EtherRouter');

contract('all', function (accounts) {
  const gasPrice = 20e9;
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];
  const THIRD_ACCOUNT = accounts[2];

  let colony;
  let colonyTask;
  let colonyFunding;
  let colonyTransactionReviewer;
  let commonColony;
  let token;
  let authority;
  let colonyNetwork;

  let makeTaskCost;
  let proposeTaskUpdateCost;
  let mintTokensCost;
  let acceptTaskCost;

  before(async function () {
    console.log('Gas price : ', gasPrice);
    colony = await Colony.new();
    let resolver = await Resolver.new();
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    colonyTask = await ColonyTask.new()
    colonyFunding = await ColonyFunding.new()
    colonyTransactionReviewer = await ColonyTransactionReviewer.new();

    await upgradableContracts.setupColonyVersionResolver(colony, colonyTask, colonyFunding, colonyTransactionReviewer, resolver, colonyNetwork);
    const estimate = await colonyNetwork.createColony.estimateGas('Antz');
    console.log('createColony estimate : ', estimate);
    const tx = await colonyNetwork.createColony('Antz', { gasPrice });
    console.log('createColony actual cost : ', tx.receipt.gasUsed);
    const address = await colonyNetwork.getColony.call('Antz');
    colony = await IColony.at(address);
    const tokenAddress = await colony.getToken.call();
    token = await Token.at(tokenAddress);
    const authorityAddress = await colony.authority.call();
    authority = await Authority.at(authorityAddress);
    await IColony.defaults({ gasPrice });

    let commonColonyAddress = await colonyNetwork.getColony.call("Common Colony");
    commonColony = await IColony.at(commonColonyAddress);
  });

  // We currently only print out gas costs and no assertions are made about what these should be.
  describe('Gas costs', function () {
    it('when working with the Common Colony', async function () {
      let tx0 = await commonColony.addSkill(0);
      let addSkillCost0 = tx0.receipt.gasUsed;
      console.log('addSkill to level 1 actual cost :', addSkillCost0);

      let tx1 = await commonColony.addSkill(1);
      let addSkillCost1 = tx1.receipt.gasUsed;
      console.log('addSkill to level 2 actual cost :', addSkillCost1);

      let tx2 = await commonColony.addSkill(2);
      let addSkillCost2 = tx2.receipt.gasUsed;
      console.log('addSkill to level 3 actual cost :', addSkillCost2);

      let tx3 = await commonColony.addSkill(3);
      let addSkillCost3 = tx3.receipt.gasUsed;
      console.log('addSkill to level 4 actual cost :', addSkillCost3);
    });

    it('when working with a Colony', async function () {
      // makeTask
      let estimate = await colony.makeTask.estimateGas('9bb76d8e6c89b524d34a454b3140df28');
      console.log('makeTask estimate : ', estimate);
      let tx = await colony.makeTask('9bb76d8e6c89b524d34a454b3140df28', { gasPrice });
      makeTaskCost = tx.receipt.gasUsed;
      console.log('makeTask actual cost :', makeTaskCost);

      await colony.setTaskRoleUser(1, CONST.EVALUATOR_ROLE, OTHER_ACCOUNT);
      await colony.setTaskRoleUser(1, CONST.WORKER_ROLE, THIRD_ACCOUNT);

      const dueDate = testHelper.currentBlockTime() - 1;
      let txData = await colony.contract.setTaskDueDate.getData(1, dueDate);
      await colony.proposeTaskChange(txData, 0, CONST.MANAGER_ROLE);
      const transactionId = await colony.getTransactionCount.call();
      await colony.approveTaskChange(transactionId, CONST.WORKER_ROLE, { from: THIRD_ACCOUNT });

      // Propose task change
      txData = await colony.contract.setTaskBrief.getData(1, '9bb76d8e6c89b524d34a454b3140df29');
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
  
      const SALT = sha3(testHelper.getRandomString(5));
      const _RATING_SECRET_1_ = await colony.generateSecret.call(SALT, 30);
      const _RATING_SECRET_2_ = await colony.generateSecret.call(SALT, 40);

      await colony.submitTaskWorkRating(1, CONST.WORKER_ROLE, _RATING_SECRET_1_, { from: OTHER_ACCOUNT });
      await colony.submitTaskWorkRating(1, CONST.MANAGER_ROLE, _RATING_SECRET_2_, { from: THIRD_ACCOUNT });
      await colony.revealTaskWorkRating(1, CONST.WORKER_ROLE, 30, SALT, { from: OTHER_ACCOUNT });
      await colony.revealTaskWorkRating(1, CONST.MANAGER_ROLE, 40, SALT, { from: THIRD_ACCOUNT });

      // acceptTask
      estimate = await colony.acceptTask.estimateGas(1);
      console.log('acceptTask estimate: ', estimate);
      tx = await colony.acceptTask(1, { gasPrice });
      acceptTaskCost = tx.receipt.gasUsed;
      console.log('acceptTask actual cost :', acceptTaskCost);

      // setUserRole
      estimate = await authority.setUserRole.estimateGas(OTHER_ACCOUNT, 1, true);
      console.log('setUserRole estimate : ', estimate);
      tx = await authority.setUserRole(OTHER_ACCOUNT, 1, true);
      console.log('setUserRole actual cost :', tx.receipt.gasUsed);
    });

    it('Average gas costs for customers should not exceed 1 ETH per month', async function () {
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
