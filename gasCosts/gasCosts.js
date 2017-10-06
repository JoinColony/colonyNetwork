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
  let updateTaskIpfsDecodedHashCost;
  let mintTokensCost;
  let contributeEthToTaskCost;
  let contributeTokensToTaskCost;
  let completeAndPayTaskCost;

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

      // updateTaskIpfsDecodedHash
      estimate = await colony.updateTaskIpfsDecodedHash.estimateGas(0, 'My updated task');
      console.log('updateTaskIpfsDecodedHash estimate : ', estimate);
      tx = await colony.updateTaskIpfsDecodedHash(1, '9bb76d8e6c89b524d34a454b3140df29', { gasPrice });
      updateTaskIpfsDecodedHashCost = tx.receipt.gasUsed;
      console.log('updateTaskIpfsDecodedHash actual cost :', updateTaskIpfsDecodedHashCost);

      // mintTokens
      estimate = await colony.mintTokens.estimateGas(200);
      console.log('mintTokens estimate : ', estimate);
      tx = await colony.mintTokens(200, { gasPrice });
      mintTokensCost = tx.receipt.gasUsed;
      console.log('mintTokens actual cost :', mintTokensCost);

      // contributeEthToTask
      estimate = await colony.contributeEthToTask.estimateGas(0, { value: 50 });
      console.log('contributeEthToTask estimate : ', estimate);
      tx = await colony.contributeEthToTask(1, { value: 50, gasPrice });
      contributeEthToTaskCost = tx.receipt.gasUsed;
      console.log('contributeEthToTask actual cost :', contributeEthToTaskCost);

      // setReservedTokensForTask
      estimate = await colony.setReservedTokensForTask.estimateGas(0, 50);
      console.log('setReservedTokensForTask estimate : ', estimate);
      tx = await colony.setReservedTokensForTask(1, 50, { gasPrice });
      contributeTokensToTaskCost = tx.receipt.gasUsed;
      console.log('setReservedTokensForTask actual cost :', contributeTokensToTaskCost);

      // completeAndPayTask
      estimate = await colony.completeAndPayTask.estimateGas(0, OTHER_ACCOUNT);
      console.log('completeAndPayTask estimate: ', estimate);
      tx = await colony.completeAndPayTask(0, OTHER_ACCOUNT, { gasPrice });
      completeAndPayTaskCost = tx.receipt.gasUsed;
      console.log('completeAndPayTask actual cost :', completeAndPayTaskCost);

      // setUserRole
      estimate = await authority.setUserRole.estimateGas(OTHER_ACCOUNT, 1, true);
      console.log('setUserRole estimate : ', estimate);
      tx = await authority.setUserRole(OTHER_ACCOUNT, 1, true);
      console.log('setUserRole actual cost :', tx.receipt.gasUsed);
    });

    it('Average gas costs for customers should not exceed 1 ETH per month', async function () {
      const totalGasCost = (makeTaskCost * 100) // assume 100 tasks per month are created
      + (updateTaskIpfsDecodedHashCost * 20) // assume 20% of all tasks are updated once
      + (contributeTokensToTaskCost * 100) // assume all new tasks have their budget set once
      + (completeAndPayTaskCost * 25) // quarter of all tasks are closed and paid out
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
        console.log('IGNORING THE RESULT DUE TO TESTRPC INACCURICIES IN ESTIMATEGAS');
      }
    });
  });
});
