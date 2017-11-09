/* globals artifacts */
import testHelper from '../helpers/test-helper';
const upgradableContracts = require('../helpers/upgradable-contracts');

const ColonyNetwork = artifacts.require('ColonyNetwork');
const Colony = artifacts.require('Colony');
const Token = artifacts.require('Token');
const Authority = artifacts.require('Authority');
const Resolver = artifacts.require('Resolver');
const EtherRouter = artifacts.require('EtherRouter');

contract('all', function (accounts) {
  const gasPrice = 20e9;
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];

  let colony;
  let resolver;
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
    resolver = await Resolver.new();
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await ColonyNetwork.at(etherRouter.address);
    await upgradableContracts.setupColonyVersionResolver(colony, resolver, colonyNetwork);
    const estimate = await colonyNetwork.createColony.estimateGas('Antz');
    console.log('createColony estimate : ', estimate);
    const tx = await colonyNetwork.createColony('Antz', { gasPrice });
    console.log('createColony actual cost : ', tx.receipt.gasUsed);
    const address = await colonyNetwork.getColony.call('Antz');
    colony = await Colony.at(address);
    const tokenAddress = await colony.token.call();
    token = await Token.at(tokenAddress);
    const authorityAddress = await colony.authority.call();
    authority = await Authority.at(authorityAddress);
    await Colony.defaults({ gasPrice });
  });

  // We currently only print out gas costs and no assertions are made about what these should be.
  describe('Gas costs', function () {
    it('when working with a Colony', async function () {
      // makeTask
      let estimate = await colony.makeTask.estimateGas('9bb76d8e6c89b524d34a454b3140df28');
      console.log('makeTask estimate : ', estimate);
      let tx = await colony.makeTask('9bb76d8e6c89b524d34a454b3140df28', { gasPrice });
      makeTaskCost = tx.receipt.gasUsed;
      console.log('makeTask actual cost :', makeTaskCost);

      // Propose task change
      const txData = await colony.contract.setTaskBrief.getData(1, '9bb76d8e6c89b524d34a454b3140df29');
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
