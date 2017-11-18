import testHelper from '../helpers/test-helper';
const upgradableContracts = require('../helpers/upgradable-contracts');

const EtherRouter = artifacts.require('EtherRouter');
const Resolver = artifacts.require('Resolver');
const ColonyNetwork = artifacts.require('ColonyNetwork');
const Colony = artifacts.require('Colony');
const Token = artifacts.require('Token');
const Authority = artifacts.require('Authority');

contract('Common Colony', function (accounts) {
  let COLONY_KEY = "Common Colony";
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];
  const THIRD_ACCOUNT = accounts[2];
  // This value must be high enough to certify that the failure was not due to the amount of gas but due to a exception being thrown
  const GAS_TO_SPEND = 4700000;
  // The base58 decoded, bytes32 converted value of the task ipfsHash
  const ipfsDecodedHash = '9bb76d8e6c89b524d34a454b3140df28';
  const newIpfsDecodedHash = '9bb76d8e6c89b524d34a454b3140df29';

  const optionsToSpotTransactionFailure = {
    from: MAIN_ACCOUNT,
    gas: GAS_TO_SPEND,
  };

  let commonColony;
  let token;
  let authority;
  let colonyNetwork;
  let createColonyGas;
  let resolverColonyNetworkDeployed;

  before(async function () {
    const network = await testHelper.web3GetNetwork();
    createColonyGas = (network == 'coverage') ? '0xfffffffffff' : 4e6;
    resolverColonyNetworkDeployed = await Resolver.deployed();
  });

  beforeEach(async function () {
    let colony = await Colony.new();
    let resolver = await Resolver.new();

    const etherRouter = await EtherRouter.new();
    etherRouter.setResolver(resolverColonyNetworkDeployed.address);
    colonyNetwork = await ColonyNetwork.at(etherRouter.address);
    await upgradableContracts.setupColonyVersionResolver(colony, resolver, colonyNetwork);

    await colonyNetwork.createColony(COLONY_KEY);
    let commonColonyAddress = await colonyNetwork.getColony.call(COLONY_KEY);
    commonColony = await Colony.at(commonColonyAddress);
  });

  describe('when adding a new skill', () => {
    it('should be able to add a new skill as a child to the root skill', async function () {
      await commonColony.addSkill(1);

      const skillCount = await colonyNetwork.skillCount.call();
      assert.equal(skillCount.toNumber(), 2);

      const newSkill = await colonyNetwork.skills.call(2);
      assert.equal(newSkill[0].toNumber(), 1);
      assert.equal(newSkill[1].toNumber(), 0);

      // Check rootSkill.nChildren is now 1
      const rootSkill = await colonyNetwork.skills.call(1);
      assert.equal(rootSkill[1].toNumber(), 1);

      // Check rootSkill.children first element is the id of the new skill
      const rootSkillChild = await colonyNetwork.getChildSkillId.call(1, 0);
      assert.equal(rootSkillChild.toNumber(), 2);
    });

    it('should be able to add multiple child skills to the root skill', async function () {
      await commonColony.addSkill(1);
      await commonColony.addSkill(1);
      await commonColony.addSkill(1);

      const skillCount = await colonyNetwork.skillCount.call();
      assert.equal(skillCount.toNumber(), 4);

      const newSkill1 = await colonyNetwork.skills.call(2);
      assert.equal(newSkill1[0].toNumber(), 1);
      assert.equal(newSkill1[1].toNumber(), 0);

      const newSkill2 = await colonyNetwork.skills.call(3);
      assert.equal(newSkill2[0].toNumber(), 1);
      assert.equal(newSkill2[1].toNumber(), 0);

      const newSkill3 = await colonyNetwork.skills.call(4);
      assert.equal(newSkill3[0].toNumber(), 1);
      assert.equal(newSkill3[1].toNumber(), 0);

      // Check rootSkill.nChildren is now 3
      const rootSkill = await colonyNetwork.skills.call(1);
      assert.equal(rootSkill[1].toNumber(), 3);

      // Check rootSkill.children contains the ids of the new skills
      const rootSkillChild1 = await colonyNetwork.getChildSkillId.call(1, 0);
      assert.equal(rootSkillChild1.toNumber(), 2);
      const rootSkillChild2 = await colonyNetwork.getChildSkillId.call(1, 1);
      assert.equal(rootSkillChild2.toNumber(), 3);
      const rootSkillChild3 = await colonyNetwork.getChildSkillId.call(1, 2);
      assert.equal(rootSkillChild3.toNumber(), 4);
    });

    it('should be able to add child skills a few levels down the skills tree', async function () {
      // Add 2 skill nodes to root skill
      await commonColony.addSkill(1);
      await commonColony.addSkill(1);
      // Add a child skill to skill id 3
      await commonColony.addSkill(3);

      const newDeepSkill = await colonyNetwork.skills.call(4);
      assert.equal(newDeepSkill[0].toNumber(), 2);
      assert.equal(newDeepSkill[1].toNumber(), 0);
    });
  });
});
