/* globals artifacts */
import { SPECIFICATION_HASH, INITIAL_FUNDING } from "../helpers/constants";
import { checkErrorRevert, getTokenArgs } from "../helpers/test-helper";
import { fundColonyWithTokens, setupRatedTask } from "../helpers/test-data-generator";

const upgradableContracts = require("../helpers/upgradable-contracts");

const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");
const Colony = artifacts.require("Colony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IColony = artifacts.require("IColony");
const ColonyFunding = artifacts.require("ColonyFunding");
const ColonyTask = artifacts.require("ColonyTask");
const Token = artifacts.require("Token");

contract("Meta Colony", () => {
  let TOKEN_ARGS;
  let metaColony;
  let metaColonyToken;
  let colony;
  let token;
  let colonyNetwork;
  let resolverColonyNetworkDeployed;

  before(async () => {
    resolverColonyNetworkDeployed = await Resolver.deployed();
  });

  beforeEach(async () => {
    const colonyTemplate = await Colony.new();
    const colonyFunding = await ColonyFunding.new();
    const colonyTask = await ColonyTask.new();
    const resolver = await Resolver.new();
    const etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolverColonyNetworkDeployed.address);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    await upgradableContracts.setupColonyVersionResolver(colonyTemplate, colonyTask, colonyFunding, resolver, colonyNetwork);
    await colonyNetwork.startNextCycle();

    metaColonyToken = await Token.new("Colony Network Token", "CLNY", 18);
    await colonyNetwork.createMetaColony(metaColonyToken.address);
    const metaColonyAddress = await colonyNetwork.getMetaColony.call();
    metaColony = await IColony.at(metaColonyAddress);
  });

  describe("when working with ERC20 properties of Meta Colony token", () => {
    it("token `symbol` property is correct", async () => {
      const tokenSymbol = await metaColonyToken.symbol();
      assert.equal(web3.toUtf8(tokenSymbol), "CLNY");
    });

    it("token `decimals` property is correct", async () => {
      const tokenDecimals = await metaColonyToken.decimals.call();
      assert.equal(tokenDecimals.toString(), "18");
    });

    it("token `name` property is correct", async () => {
      const tokenName = await metaColonyToken.name.call();
      assert.equal(web3.toUtf8(tokenName), "Colony Network Token");
    });
  });

  describe("when adding a new global skill", () => {
    it("should be able to add a new skill as a child to the root skill", async () => {
      await metaColony.addGlobalSkill(1);

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 4);

      const newSkill = await colonyNetwork.getSkill.call(skillCount);
      assert.equal(newSkill[0].toNumber(), 1);
      assert.equal(newSkill[1].toNumber(), 0);

      // Check rootSkill.nChildren is now 1
      const rootSkill = await colonyNetwork.getSkill.call(1);
      assert.equal(rootSkill[1].toNumber(), 1);

      // Check rootSkill.children first element is the id of the new skill
      const rootSkillChild = await colonyNetwork.getChildSkillId.call(1, 0);
      assert.equal(rootSkillChild.toNumber(), 4);
    });

    it("should be able to add multiple child skills to the root global skill", async () => {
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(1);

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 6);

      const newSkill1 = await colonyNetwork.getSkill.call(4);
      assert.equal(newSkill1[0].toNumber(), 1);
      assert.equal(newSkill1[1].toNumber(), 0);

      const newSkill2 = await colonyNetwork.getSkill.call(5);
      assert.equal(newSkill2[0].toNumber(), 1);
      assert.equal(newSkill2[1].toNumber(), 0);

      const newSkill3 = await colonyNetwork.getSkill.call(6);
      assert.equal(newSkill3[0].toNumber(), 1);
      assert.equal(newSkill3[1].toNumber(), 0);

      // Check rootSkill.nChildren is now 3
      const rootSkill = await colonyNetwork.getSkill.call(1);
      assert.equal(rootSkill[1].toNumber(), 3);

      // Check rootSkill.children contains the ids of the new skills
      const rootSkillChild1 = await colonyNetwork.getChildSkillId.call(1, 0);
      assert.equal(rootSkillChild1.toNumber(), 4);
      const rootSkillChild2 = await colonyNetwork.getChildSkillId.call(1, 1);
      assert.equal(rootSkillChild2.toNumber(), 5);
      const rootSkillChild3 = await colonyNetwork.getChildSkillId.call(1, 2);
      assert.equal(rootSkillChild3.toNumber(), 6);
    });

    it("should be able to add child skills a few levels down the skills tree", async () => {
      // Add 2 skill nodes to root skill
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(1);
      // Add a child skill to skill id 4
      await metaColony.addGlobalSkill(4);

      const newDeepSkill = await colonyNetwork.getSkill.call(6);
      assert.equal(newDeepSkill[0].toNumber(), 2);
      assert.equal(newDeepSkill[1].toNumber(), 0);

      const parentSkill1 = await colonyNetwork.getParentSkillId.call(6, 0);
      assert.equal(parentSkill1.toNumber(), 4);

      const parentSkill2 = await colonyNetwork.getParentSkillId.call(6, 1);
      assert.equal(parentSkill2.toNumber(), 1);
    });

    it("should NOT be able to add a child skill for a non existent parent", async () => {
      // Add 2 skill nodes to root skill
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(1);

      await checkErrorRevert(metaColony.addGlobalSkill(6));
      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 5);
    });

    it("should NOT be able to add a child skill to a local skill parent", async () => {
      await checkErrorRevert(metaColony.addGlobalSkill(2));
      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 3);
    });

    it("should be able to add skills in the middle of the skills tree", async () => {
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(5);
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(4);
      await metaColony.addGlobalSkill(5);

      const rootSkill = await colonyNetwork.getSkill.call(1);
      assert.equal(rootSkill[0].toNumber(), 0);
      assert.equal(rootSkill[1].toNumber(), 6);
      const rootSkillChildSkillId1 = await colonyNetwork.getChildSkillId.call(1, 0);
      assert.equal(rootSkillChildSkillId1.toNumber(), 4);
      const rootSkillChildSkillId2 = await colonyNetwork.getChildSkillId.call(1, 1);
      assert.equal(rootSkillChildSkillId2.toNumber(), 5);
      const rootSkillChildSkillId3 = await colonyNetwork.getChildSkillId.call(1, 2);
      assert.equal(rootSkillChildSkillId3.toNumber(), 6);
      const rootSkillChildSkillId4 = await colonyNetwork.getChildSkillId.call(1, 3);
      assert.equal(rootSkillChildSkillId4.toNumber(), 7);
      const rootSkillChildSkillId5 = await colonyNetwork.getChildSkillId.call(1, 4);
      assert.equal(rootSkillChildSkillId5.toNumber(), 8);
      const rootSkillChildSkillId6 = await colonyNetwork.getChildSkillId.call(1, 5);
      assert.equal(rootSkillChildSkillId6.toNumber(), 9);

      const skill1 = await colonyNetwork.getSkill.call(4);
      assert.equal(skill1[0].toNumber(), 1);
      assert.equal(skill1[1].toNumber(), 1);
      const skill1ParentSkillId1 = await colonyNetwork.getParentSkillId.call(4, 0);
      assert.equal(skill1ParentSkillId1.toNumber(), 1);
      const skill1ChildSkillId1 = await colonyNetwork.getChildSkillId.call(4, 0);
      assert.equal(skill1ChildSkillId1.toNumber(), 8);

      const skill2 = await colonyNetwork.getSkill.call(5);
      assert.equal(skill2[0].toNumber(), 1);
      assert.equal(skill2[1].toNumber(), 2);
      const skill2ParentSkillId1 = await colonyNetwork.getParentSkillId.call(5, 0);
      assert.equal(skill2ParentSkillId1.toNumber(), 1);
      const skill2ChildSkillId1 = await colonyNetwork.getChildSkillId.call(5, 0);
      assert.equal(skill2ChildSkillId1.toNumber(), 6);
      const skill2ChildSkillId2 = await colonyNetwork.getChildSkillId.call(5, 1);
      assert.equal(skill2ChildSkillId2.toNumber(), 9);

      const skill3 = await colonyNetwork.getSkill.call(6);
      assert.equal(skill3[0].toNumber(), 2);
      assert.equal(skill3[1].toNumber(), 0);
      const skill3ParentSkillId1 = await colonyNetwork.getParentSkillId.call(6, 0);
      assert.equal(skill3ParentSkillId1.toNumber(), 5);
      const skill3ParentSkillId2 = await colonyNetwork.getParentSkillId.call(6, 1);
      assert.equal(skill3ParentSkillId2.toNumber(), 1);

      const skill4 = await colonyNetwork.getSkill.call(7);
      assert.equal(skill4[0].toNumber(), 1);
      assert.equal(skill4[1].toNumber(), 0);
      const skill4ParentSkillId1 = await colonyNetwork.getParentSkillId.call(7, 0);
      assert.equal(skill4ParentSkillId1.toNumber(), 1);

      const skill5 = await colonyNetwork.getSkill.call(8);
      assert.equal(skill5[0].toNumber(), 2);
      assert.equal(skill5[1].toNumber(), 0);
      const skill5ParentSkillId1 = await colonyNetwork.getParentSkillId.call(8, 0);
      assert.equal(skill5ParentSkillId1.toNumber(), 4);
      const skill5ParentSkillId2 = await colonyNetwork.getParentSkillId.call(8, 1);
      assert.equal(skill5ParentSkillId2.toNumber(), 1);

      const skill6 = await colonyNetwork.getSkill.call(9);
      assert.equal(skill6[0].toNumber(), 2);
      assert.equal(skill6[1].toNumber(), 0);
      const skill6ParentSkillId1 = await colonyNetwork.getParentSkillId.call(9, 0);
      assert.equal(skill6ParentSkillId1.toNumber(), 5);
      const skill6ParentSkillId2 = await colonyNetwork.getParentSkillId.call(9, 1);
      assert.equal(skill6ParentSkillId2.toNumber(), 1);
    });

    it("when N parents are there, should record parent skill ids for N = integer powers of 2", async () => {
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(4);
      await metaColony.addGlobalSkill(5);
      await metaColony.addGlobalSkill(6);
      await metaColony.addGlobalSkill(7);
      await metaColony.addGlobalSkill(8);
      await metaColony.addGlobalSkill(9);
      await metaColony.addGlobalSkill(10);
      await metaColony.addGlobalSkill(11);

      const skill12 = await colonyNetwork.getSkill.call(12);
      assert.equal(skill12[0].toNumber(), 9);
      assert.equal(skill12[1].toNumber(), 0);

      const skill12ParentSkillId1 = await colonyNetwork.getParentSkillId.call(12, 0);
      assert.equal(skill12ParentSkillId1.toNumber(), 11);
      const skill12ParentSkillId2 = await colonyNetwork.getParentSkillId.call(12, 1);
      assert.equal(skill12ParentSkillId2.toNumber(), 10);
      const skill12ParentSkillId3 = await colonyNetwork.getParentSkillId.call(12, 2);
      assert.equal(skill12ParentSkillId3.toNumber(), 8);
      const skill12ParentSkillId4 = await colonyNetwork.getParentSkillId.call(12, 3);
      assert.equal(skill12ParentSkillId4.toNumber(), 4);
    });

    it("should NOT be able to add a new root global skill", async () => {
      await checkErrorRevert(metaColony.addGlobalSkill(0));

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 3);
    });
  });

  describe("when adding domains in the meta colony", () => {
    it("should be able to add new domains as children to the root domain", async () => {
      await metaColony.addDomain(2);
      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 4);
      const domainCount = await metaColony.getDomainCount.call();
      assert.equal(domainCount.toNumber(), 2);

      const newDomain = await metaColony.getDomain.call(1);
      assert.equal(newDomain[0].toNumber(), 2);
      assert.equal(newDomain[1].toNumber(), 1);

      // Check root local skill.nChildren is now 2
      // One special mining skill, and the skill associated with the domain we just added
      const rootLocalSkill = await colonyNetwork.getSkill.call(2);
      assert.equal(rootLocalSkill[1].toNumber(), 2);

      // Check root local skill.children second element is the id of the new skill
      const rootSkillChild = await colonyNetwork.getChildSkillId.call(2, 1);
      assert.equal(rootSkillChild.toNumber(), 4);
    });

    it("should NOT be able to add a child local skill more than one level from the root local skill", async () => {
      await metaColony.addDomain(2);
      await checkErrorRevert(metaColony.addDomain(4));

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 4);
      const domainCount = await metaColony.getDomainCount.call();
      assert.equal(domainCount.toNumber(), 2);
    });
  });

  describe("when adding domains in a regular colony", () => {
    beforeEach(async () => {
      TOKEN_ARGS = getTokenArgs();
      const newToken = await Token.new(...TOKEN_ARGS);
      const { logs } = await colonyNetwork.createColony(newToken.address);
      const { colonyAddress } = logs[0].args;
      colony = await IColony.at(colonyAddress);
      const tokenAddress = await colony.getToken.call();
      token = await Token.at(tokenAddress);
    });

    it("should be able to add new domains as children to the root domain", async () => {
      await colony.addDomain(4);
      await colony.addDomain(4);
      await colony.addDomain(4);

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 7);
      const domainCount = await colony.getDomainCount.call();
      assert.equal(domainCount.toNumber(), 4);

      // TODO: I think newDomain1 is the root domain of the colony?
      const newDomain1 = await colony.getDomain.call(1);
      assert.equal(newDomain1[0].toNumber(), 4);
      assert.equal(newDomain1[1].toNumber(), 1);

      const newDomain2 = await colony.getDomain.call(2);
      assert.equal(newDomain2[0].toNumber(), 5);
      assert.equal(newDomain2[1].toNumber(), 2);

      const newDomain3 = await colony.getDomain.call(3);
      assert.equal(newDomain3[0].toNumber(), 6);
      assert.equal(newDomain3[1].toNumber(), 3);
      // Check root local skill.nChildren is now 3
      const rootLocalSkill = await colonyNetwork.getSkill.call(4);
      assert.equal(rootLocalSkill[1].toNumber(), 3);
      // Check root local skill.children are the ids of the new skills
      const rootSkillChild1 = await colonyNetwork.getChildSkillId.call(4, 0);
      assert.equal(rootSkillChild1.toNumber(), 5);
      const rootSkillChild2 = await colonyNetwork.getChildSkillId.call(4, 1);
      assert.equal(rootSkillChild2.toNumber(), 6);
      const rootSkillChild3 = await colonyNetwork.getChildSkillId.call(4, 2);
      assert.equal(rootSkillChild3.toNumber(), 7);
    });

    it("should NOT be able to add a child local skill more than one level from the root local skill", async () => {
      await colony.addDomain(4);
      await checkErrorRevert(colony.addDomain(5));

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 5);
      const domainCount = await colony.getDomainCount.call();
      assert.equal(domainCount.toNumber(), 2);
    });

    it("should NOT be able to add a child local skill to a global skill parent", async () => {
      await checkErrorRevert(colony.addDomain(1));

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 4);
      const domainCount = await colony.getDomainCount.call();
      assert.equal(domainCount.toNumber(), 1);
    });

    it("should NOT be able to add a new local skill by anyone but a Colony", async () => {
      await checkErrorRevert(colonyNetwork.addSkill(2, false));

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 4);
    });

    it("should NOT be able to add a new root local skill", async () => {
      await checkErrorRevert(colonyNetwork.addSkill(0, false));

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 4);
    });
  });

  describe("when setting domain and skill on task", () => {
    beforeEach(async () => {
      TOKEN_ARGS = getTokenArgs();
      token = await Token.new(...TOKEN_ARGS);
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyAddress } = logs[0].args;
      await token.setOwner(colonyAddress);
      colony = await IColony.at(colonyAddress);
    });

    it("should be able to set domain on task", async () => {
      const colonyRootDomain = await colony.getDomain(1);
      await colony.addDomain(colonyRootDomain[0].toString());
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskDomain(1, 2);
      const task = await colony.getTask.call(1);
      assert.equal(task[8].toNumber(), 2);
    });

    it("should NOT be able to set a domain on nonexistent task", async () => {
      await checkErrorRevert(colony.setTaskDomain(10, 3));
    });

    it("should NOT be able to set a nonexistent domain on task", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await checkErrorRevert(colony.setTaskDomain(1, 20));

      const task = await colony.getTask.call(1);
      assert.equal(task[8].toNumber(), 1);
    });

    it("should NOT be able to set a domain on finalized task", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony });
      await colony.finalizeTask(taskId);
      await checkErrorRevert(colony.setTaskDomain(taskId, 1));
    });

    it("should be able to set global skill on task", async () => {
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(5);

      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskSkill(1, 6);
      const task = await colony.getTask.call(1);
      assert.equal(task[9][0].toNumber(), 6);
    });

    it("should NOT be able to set global skill on nonexistent task", async () => {
      await checkErrorRevert(colony.setTaskSkill(10, 1));
    });

    it("should NOT be able to set global skill on finalized task", async () => {
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(5);
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony });
      await colony.finalizeTask(taskId);
      await checkErrorRevert(colony.setTaskSkill(taskId, 6));

      const task = await colony.getTask.call(taskId);
      assert.equal(task[9][0].toNumber(), 1);
    });

    it("should NOT be able to set nonexistent skill on task", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await checkErrorRevert(colony.setTaskSkill(1, 5));
    });

    it("should NOT be able to set local skill on task", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await checkErrorRevert(colony.setTaskSkill(1, 3));
    });
  });
});
