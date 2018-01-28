/* globals artifacts */
import testHelper from '../helpers/test-helper';

const upgradableContracts = require('../helpers/upgradable-contracts');

const EtherRouter = artifacts.require('EtherRouter');
const Resolver = artifacts.require('Resolver');
const Colony = artifacts.require('Colony');
const IColonyNetwork = artifacts.require('IColonyNetwork');
const IColony = artifacts.require('IColony');
const ColonyFunding = artifacts.require('ColonyFunding');
const ColonyTask = artifacts.require('ColonyTask');
const ColonyTransactionReviewer = artifacts.require('ColonyTransactionReviewer');

contract('Common Colony', () => {
  const COMMON_COLONY_KEY = 'Common Colony';
  let commonColony;
  let colony;
  let colonyNetwork;
  let resolverColonyNetworkDeployed;

  before(async () => {
    resolverColonyNetworkDeployed = await Resolver.deployed();
  });

  beforeEach(async () => {
    const colonyTemplate = await Colony.new();
    const colonyFunding = await ColonyFunding.new();
    const colonyTask = await ColonyTask.new();
    const colonyTransactionReviewer = await ColonyTransactionReviewer.new();
    const resolver = await Resolver.new();

    const etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolverColonyNetworkDeployed.address);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    await upgradableContracts.setupColonyVersionResolver(
      colonyTemplate,
      colonyFunding,
      colonyTask,
      colonyTransactionReviewer,
      resolver,
      colonyNetwork,
    );

    await colonyNetwork.createColony(COMMON_COLONY_KEY);
    const commonColonyAddress = await colonyNetwork.getColony.call(COMMON_COLONY_KEY);
    commonColony = await IColony.at(commonColonyAddress);
  });

  describe('when adding a new global skill', () => {
    it('should be able to add a new skill as a child to the root skill', async () => {
      await commonColony.addSkill(1, true);

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 3);

      const newSkill = await colonyNetwork.getSkill.call(skillCount);
      assert.equal(newSkill[0].toNumber(), 1);
      assert.equal(newSkill[1].toNumber(), 0);

      // Check rootSkill.nChildren is now 1
      const rootSkill = await colonyNetwork.getSkill.call(1);
      assert.equal(rootSkill[1].toNumber(), 1);

      // Check rootSkill.children first element is the id of the new skill
      const rootSkillChild = await colonyNetwork.getChildSkillId.call(1, 0);
      assert.equal(rootSkillChild.toNumber(), 3);
    });

    it('should NOT be able to add a new skill if called by anyone but the common colony', async () => {
      await testHelper.checkErrorRevert(colonyNetwork.addSkill(0, true));
      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 2);
    });

    it('should be able to add multiple child skills to the root global skill', async () => {
      await commonColony.addSkill(1, true);
      await commonColony.addSkill(1, true);
      await commonColony.addSkill(1, true);

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 5);

      const newSkill1 = await colonyNetwork.getSkill.call(3);
      assert.equal(newSkill1[0].toNumber(), 1);
      assert.equal(newSkill1[1].toNumber(), 0);

      const newSkill2 = await colonyNetwork.getSkill.call(4);
      assert.equal(newSkill2[0].toNumber(), 1);
      assert.equal(newSkill2[1].toNumber(), 0);

      const newSkill3 = await colonyNetwork.getSkill.call(5);
      assert.equal(newSkill3[0].toNumber(), 1);
      assert.equal(newSkill3[1].toNumber(), 0);

      // Check rootSkill.nChildren is now 3
      const rootSkill = await colonyNetwork.getSkill.call(1);
      assert.equal(rootSkill[1].toNumber(), 3);

      // Check rootSkill.children contains the ids of the new skills
      const rootSkillChild1 = await colonyNetwork.getChildSkillId.call(1, 0);
      assert.equal(rootSkillChild1.toNumber(), 3);
      const rootSkillChild2 = await colonyNetwork.getChildSkillId.call(1, 1);
      assert.equal(rootSkillChild2.toNumber(), 4);
      const rootSkillChild3 = await colonyNetwork.getChildSkillId.call(1, 2);
      assert.equal(rootSkillChild3.toNumber(), 5);
    });

    it('should be able to add child skills a few levels down the skills tree', async () => {
      // Add 2 skill nodes to root skill
      await commonColony.addSkill(1, true);
      await commonColony.addSkill(1, true);
      // Add a child skill to skill id 3
      await commonColony.addSkill(3, true);

      const newDeepSkill = await colonyNetwork.getSkill.call(5);
      assert.equal(newDeepSkill[0].toNumber(), 2);
      assert.equal(newDeepSkill[1].toNumber(), 0);

      const parentSkill1 = await colonyNetwork.getParentSkillId.call(5, 0);
      assert.equal(parentSkill1.toNumber(), 3);

      const parentSkill2 = await colonyNetwork.getParentSkillId.call(5, 1);
      assert.equal(parentSkill2.toNumber(), 1);
    });

    it('should NOT be able to add a child skill for a non existent parent', async () => {
      // Add 2 skill nodes to root skill
      await commonColony.addSkill(1, true);
      await commonColony.addSkill(1, true);

      await testHelper.checkErrorRevert(commonColony.addSkill(5, true));
      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 4);
    });

    it('should be able to add skills in the middle of the skills tree', async () => {
      await commonColony.addSkill(1, true);
      await commonColony.addSkill(1, true);
      await commonColony.addSkill(4, true);
      await commonColony.addSkill(1, true);
      await commonColony.addSkill(3, true);
      await commonColony.addSkill(4, true);

      const rootSkill = await colonyNetwork.getSkill.call(1);
      assert.equal(rootSkill[0].toNumber(), 0);
      assert.equal(rootSkill[1].toNumber(), 6);
      const rootSkillChildSkillId1 = await colonyNetwork.getChildSkillId.call(1, 0);
      assert.equal(rootSkillChildSkillId1.toNumber(), 3);
      const rootSkillChildSkillId2 = await colonyNetwork.getChildSkillId.call(1, 1);
      assert.equal(rootSkillChildSkillId2.toNumber(), 4);
      const rootSkillChildSkillId3 = await colonyNetwork.getChildSkillId.call(1, 2);
      assert.equal(rootSkillChildSkillId3.toNumber(), 5);
      const rootSkillChildSkillId4 = await colonyNetwork.getChildSkillId.call(1, 3);
      assert.equal(rootSkillChildSkillId4.toNumber(), 6);
      const rootSkillChildSkillId5 = await colonyNetwork.getChildSkillId.call(1, 4);
      assert.equal(rootSkillChildSkillId5.toNumber(), 7);
      const rootSkillChildSkillId6 = await colonyNetwork.getChildSkillId.call(1, 5);
      assert.equal(rootSkillChildSkillId6.toNumber(), 8);

      const skill1 = await colonyNetwork.getSkill.call(3);
      assert.equal(skill1[0].toNumber(), 1);
      assert.equal(skill1[1].toNumber(), 1);
      const skill1ParentSkillId1 = await colonyNetwork.getParentSkillId.call(3, 0);
      assert.equal(skill1ParentSkillId1.toNumber(), 1);
      const skill1ChildSkillId1 = await colonyNetwork.getChildSkillId.call(3, 0);
      assert.equal(skill1ChildSkillId1.toNumber(), 7);

      const skill2 = await colonyNetwork.getSkill.call(4);
      assert.equal(skill2[0].toNumber(), 1);
      assert.equal(skill2[1].toNumber(), 2);
      const skill2ParentSkillId1 = await colonyNetwork.getParentSkillId.call(4, 0);
      assert.equal(skill2ParentSkillId1.toNumber(), 1);
      const skill2ChildSkillId1 = await colonyNetwork.getChildSkillId.call(4, 0);
      assert.equal(skill2ChildSkillId1.toNumber(), 5);
      const skill2ChildSkillId2 = await colonyNetwork.getChildSkillId.call(4, 1);
      assert.equal(skill2ChildSkillId2.toNumber(), 8);

      const skill3 = await colonyNetwork.getSkill.call(5);
      assert.equal(skill3[0].toNumber(), 2);
      assert.equal(skill3[1].toNumber(), 0);
      const skill3ParentSkillId1 = await colonyNetwork.getParentSkillId.call(5, 0);
      assert.equal(skill3ParentSkillId1.toNumber(), 4);
      const skill3ParentSkillId2 = await colonyNetwork.getParentSkillId.call(5, 1);
      assert.equal(skill3ParentSkillId2.toNumber(), 1);

      const skill4 = await colonyNetwork.getSkill.call(6);
      assert.equal(skill4[0].toNumber(), 1);
      assert.equal(skill4[1].toNumber(), 0);
      const skill4ParentSkillId1 = await colonyNetwork.getParentSkillId.call(6, 0);
      assert.equal(skill4ParentSkillId1.toNumber(), 1);

      const skill5 = await colonyNetwork.getSkill.call(7);
      assert.equal(skill5[0].toNumber(), 2);
      assert.equal(skill5[1].toNumber(), 0);
      const skill5ParentSkillId1 = await colonyNetwork.getParentSkillId.call(7, 0);
      assert.equal(skill5ParentSkillId1.toNumber(), 3);
      const skill5ParentSkillId2 = await colonyNetwork.getParentSkillId.call(7, 1);
      assert.equal(skill5ParentSkillId2.toNumber(), 1);

      const skill6 = await colonyNetwork.getSkill.call(8);
      assert.equal(skill6[0].toNumber(), 2);
      assert.equal(skill6[1].toNumber(), 0);
      const skill6ParentSkillId1 = await colonyNetwork.getParentSkillId.call(8, 0);
      assert.equal(skill6ParentSkillId1.toNumber(), 4);
      const skill6ParentSkillId2 = await colonyNetwork.getParentSkillId.call(8, 1);
      assert.equal(skill6ParentSkillId2.toNumber(), 1);
    });

    it('when N parents are there, should record parent skill ids for N = integer powers of 2', async () => {
      await commonColony.addSkill(1, true);
      await commonColony.addSkill(3, true);
      await commonColony.addSkill(4, true);
      await commonColony.addSkill(5, true);
      await commonColony.addSkill(6, true);
      await commonColony.addSkill(7, true);
      await commonColony.addSkill(8, true);
      await commonColony.addSkill(9, true);
      await commonColony.addSkill(10, true);

      const skill11 = await colonyNetwork.getSkill.call(11);
      assert.equal(skill11[0].toNumber(), 9);
      assert.equal(skill11[1].toNumber(), 0);

      const skill11ParentSkillId1 = await colonyNetwork.getParentSkillId.call(11, 0);
      assert.equal(skill11ParentSkillId1.toNumber(), 10);
      const skill11ParentSkillId2 = await colonyNetwork.getParentSkillId.call(11, 1);
      assert.equal(skill11ParentSkillId2.toNumber(), 9);
      const skill11ParentSkillId3 = await colonyNetwork.getParentSkillId.call(11, 2);
      assert.equal(skill11ParentSkillId3.toNumber(), 7);
      const skill11ParentSkillId4 = await colonyNetwork.getParentSkillId.call(11, 3);
      assert.equal(skill11ParentSkillId4.toNumber(), 3);
    });
  });

  describe('when adding domains in the common colony', () => {
    it('should be able to add new domains as children to the root domain', async () => {
      await commonColony.addDomain(2);

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 3);
      const domainCount = await commonColony.getDomainCount.call();
      assert.equal(domainCount.toNumber(), 2);

      const newDomain = await commonColony.getDomain.call(2);
      assert.equal(newDomain[0].toNumber(), 3);
      assert.equal(newDomain[1].toNumber(), 0);

      // Check root local skill.nChildren is now 1
      const rootLocalSkill = await colonyNetwork.getSkill.call(2);
      assert.equal(rootLocalSkill[1].toNumber(), 1);

      // Check root local skill.children first element is the id of the new skill
      const rootSkillChild = await colonyNetwork.getChildSkillId.call(2, 0);
      assert.equal(rootSkillChild.toNumber(), 3);
    });

    it('should NOT be able to add a child local skill more than one level from the root local skill', async () => {
      await commonColony.addDomain(2);
      testHelper.checkError(commonColony.addDomain(3));

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 3);
      const domainCount = await commonColony.getDomainCount.call();
      assert.equal(domainCount.toNumber(), 2);
    });
  });

  describe('when adding domains in a regular colony', () => {
    beforeEach(async () => {
      const COLONY_KEY = testHelper.getRandomString(7);
      await colonyNetwork.createColony(COLONY_KEY);
      const colonyAddress = await colonyNetwork.getColony.call(COLONY_KEY);
      colony = await IColony.at(colonyAddress);
    });

    it('should be able to add new domains as children to the root domain', async () => {
      await colony.addDomain(3);
      await colony.addDomain(3);
      await colony.addDomain(3);

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 6);
      const domainCount = await colony.getDomainCount.call();
      assert.equal(domainCount.toNumber(), 4);

      const newDomain1 = await colony.getDomain.call(2);
      assert.equal(newDomain1[0].toNumber(), 4);
      assert.equal(newDomain1[1].toNumber(), 0);

      const newDomain2 = await colony.getDomain.call(3);
      assert.equal(newDomain2[0].toNumber(), 5);
      assert.equal(newDomain2[1].toNumber(), 0);

      const newDomain3 = await colony.getDomain.call(4);
      assert.equal(newDomain3[0].toNumber(), 6);
      assert.equal(newDomain3[1].toNumber(), 0);

      // Check root local skill.nChildren is now 3
      const rootLocalSkill = await colonyNetwork.getSkill.call(3);
      assert.equal(rootLocalSkill[1].toNumber(), 3);

      // Check root local skill.children are the ids of the new skills
      const rootSkillChild1 = await colonyNetwork.getChildSkillId.call(3, 0);
      assert.equal(rootSkillChild1.toNumber(), 4);
      const rootSkillChild2 = await colonyNetwork.getChildSkillId.call(3, 1);
      assert.equal(rootSkillChild2.toNumber(), 5);
      const rootSkillChild3 = await colonyNetwork.getChildSkillId.call(3, 2);
      assert.equal(rootSkillChild3.toNumber(), 6);
    });

    it('should NOT be able to add a child local skill more than one level from the root local skill', async () => {
      await colony.addDomain(3);
      testHelper.checkError(colony.addDomain(4));

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 4);
      const domainCount = await colony.getDomainCount.call();
      assert.equal(domainCount.toNumber(), 2);
    });
  });
});
