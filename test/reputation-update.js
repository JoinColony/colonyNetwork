/* globals artifacts */
import sha3 from 'solidity-sha3';
import CONST from '../helpers/constants';
import testHelper from '../helpers/test-helper';
import testDataGenerator from '../helpers/test-data-generator';

const upgradableContracts = require('../helpers/upgradable-contracts');
const EtherRouter = artifacts.require('EtherRouter');
const Resolver = artifacts.require('Resolver');
const Colony = artifacts.require('Colony');
const IColony = artifacts.require('IColony');
const IColonyNetwork = artifacts.require('IColonyNetwork');
const ColonyFunding = artifacts.require('ColonyFunding');
const ColonyTask = artifacts.require('ColonyTask');
const ColonyTransactionReviewer = artifacts.require('ColonyTransactionReviewer');
const Token = artifacts.require('Token');
const Authority = artifacts.require('Authority');

contract('Colony Reputation Updates', function (accounts) {
  let COLONY_KEY;
  const MANAGER = accounts[0];
  const EVALUATOR = accounts[1];
  const WORKER = accounts[2];
  const OTHER_ACCOUNT = accounts[3];
  const MANAGER_ROLE = CONST.MANAGER_ROLE;
  const EVALUATOR_ROLE = CONST.EVALUATOR_ROLE;
  const WORKER_ROLE = CONST.WORKER_ROLE;
  const specificationHash = CONST.SPECIFICATION_HASH;

  let colony;
  let colonyFunding;
  let colonyTask;
  let token;
  let authority;
  let colonyNetwork;
  let commonColony;
  let resolverColonyNetworkDeployed;

  before(async function () {
    resolverColonyNetworkDeployed = await Resolver.deployed();
  });

  beforeEach(async function () {
    let colony = await Colony.new();
    let colonyFunding = await ColonyFunding.new();
    let colonyTask = await ColonyTask.new();
    let colonyTransactionReviewer = await ColonyTransactionReviewer.new();
    let resolver = await Resolver.new();

    const etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolverColonyNetworkDeployed.address);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    await upgradableContracts.setupColonyVersionResolver(colony, colonyTask, colonyFunding, colonyTransactionReviewer, resolver, colonyNetwork);
    await colonyNetwork.createColony("Common Colony");
    let commonColonyAddress = await colonyNetwork.getColony.call("Common Colony");
    commonColony = await IColony.at(commonColonyAddress);
  });

  describe('when update added to reputation update log', () => {
    it('should be readable', async function () {
      await commonColony.makeTask(specificationHash);
      await commonColony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      await commonColony.acceptTask(1);
      let x = await colonyNetwork.getReputationUpdateLogEntry.call(0);
      assert.equal(x[0], WORKER);
      assert.equal(x[1].toNumber(), 600);
      assert.equal(x[2].toNumber(), 0);
      assert.equal(x[3], commonColony.address);
      assert.equal(x[4].toNumber(), 2);
      assert.equal(x[5].toNumber(), 0);
    });

    it('should not be able to be appended by an account that is not a colony', async function () {
      let lengthBefore = await colonyNetwork.getReputationUpdateLogLength.call();
      await testHelper.checkErrorRevert(colonyNetwork.appendReputationUpdateLog(OTHER_ACCOUNT, 1, 2));
      let lengthAfter = await colonyNetwork.getReputationUpdateLogLength.call();
      assert.equal(lengthBefore.toNumber(), lengthAfter.toNumber());
    });

    it('should populate nPreviousUpdates correctly', async function () {
      let initialRepLogLength = await colonyNetwork.getReputationUpdateLogLength.call();
      initialRepLogLength = initialRepLogLength.toNumber();

      await commonColony.makeTask(specificationHash);
      await commonColony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      await commonColony.acceptTask(1);
      let x = await colonyNetwork.getReputationUpdateLogEntry.call(initialRepLogLength);
      let nPrevious = x[5].toNumber();
      await commonColony.makeTask(specificationHash);
      await commonColony.setTaskRoleUser(2, WORKER_ROLE, WORKER);
      await commonColony.acceptTask(2);
      x = await colonyNetwork.getReputationUpdateLogEntry.call(initialRepLogLength + 1);
      assert.equal(x[5].toNumber(), 2+nPrevious);
    });

    it('should calculate nUpdates correctly when making a log', async function (){

      await commonColony.addSkill(0);
      await commonColony.addSkill(1);
      await commonColony.addSkill(2);
      await commonColony.addSkill(3);
      await commonColony.makeTask(specificationHash);
      await commonColony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      await commonColony.setTaskSkill(1, 2);
      await commonColony.acceptTask(1);
      let x = await colonyNetwork.getReputationUpdateLogEntry.call(0);
      assert.equal(x[1].toNumber(), 600);
      assert.equal(x[4].toNumber(), 6);

      await commonColony.makeTask(specificationHash);
      await commonColony.setTaskRoleUser(2, WORKER_ROLE, WORKER);
      await commonColony.setTaskSkill(2, 3);
      await commonColony.acceptTask(2);
      x = await colonyNetwork.getReputationUpdateLogEntry.call(1);
      assert.equal(x[1].toNumber(), 600);
      assert.equal(x[4].toNumber(), 8); // Negative reputation change means children change as well.
    });
  });
});
