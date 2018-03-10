/* globals artifacts */
import { SPECIFICATION_HASH, INITIAL_FUNDING } from "../helpers/constants";
import { checkErrorRevert, checkError, getRandomString, getTokenArgs } from "../helpers/test-helper";
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
const ColonyTransactionReviewer = artifacts.require("ColonyTransactionReviewer");

contract("Common Colony", () => {
  let COLONY_KEY;
  let TOKEN_ARGS;
  let commonColony;
  let commonColonyToken;
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
    const colonyTransactionReviewer = await ColonyTransactionReviewer.new();
    const resolver = await Resolver.new();
    const etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolverColonyNetworkDeployed.address);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    await upgradableContracts.setupColonyVersionResolver(
      colonyTemplate,
      colonyTask,
      colonyFunding,
      colonyTransactionReviewer,
      resolver,
      colonyNetwork
    );
    commonColonyToken = await Token.new("Colony Network Token", "CLNY", 18);
    await colonyNetwork.createColony("Common Colony", commonColonyToken.address);
    const commonColonyAddress = await colonyNetwork.getColony.call("Common Colony");
    commonColony = await IColony.at(commonColonyAddress);
  });

  describe("when working with ERC20 properties of Common Colony token", () => {
    it("token `symbol` property is correct", async () => {
      const tokenSymbol = await commonColonyToken.symbol();
      assert.equal(web3.toUtf8(tokenSymbol), "CLNY");
    });

    it("token `decimals` property is correct", async () => {
      const tokenDecimals = await commonColonyToken.decimals.call();
      assert.equal(tokenDecimals.toString(), "18");
    });

    it("token `name` property is correct", async () => {
      const tokenName = await commonColonyToken.name.call();
      assert.equal(web3.toUtf8(tokenName), "Colony Network Token");
    });
  });

  describe("when adding a new global skill", () => {
    it("should be able to add a new skill as a child to the root skill", async () => {
      await commonColony.addGlobalSkill(1);

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

    it("should be able to add multiple child skills to the root global skill", async () => {
      await commonColony.addGlobalSkill(1);
      await commonColony.addGlobalSkill(1);
      await commonColony.addGlobalSkill(1);

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

    it("should be able to add child skills a few levels down the skills tree", async () => {
      // Add 2 skill nodes to root skill
      await commonColony.addGlobalSkill(1);
      await commonColony.addGlobalSkill(1);
      // Add a child skill to skill id 3
      await commonColony.addGlobalSkill(3);

      const newDeepSkill = await colonyNetwork.getSkill.call(5);
      assert.equal(newDeepSkill[0].toNumber(), 2);
      assert.equal(newDeepSkill[1].toNumber(), 0);

      const parentSkill1 = await colonyNetwork.getParentSkillId.call(5, 0);
      assert.equal(parentSkill1.toNumber(), 3);

      const parentSkill2 = await colonyNetwork.getParentSkillId.call(5, 1);
      assert.equal(parentSkill2.toNumber(), 1);
    });

    it("should NOT be able to add a child skill for a non existent parent", async () => {
      // Add 2 skill nodes to root skill
      await commonColony.addGlobalSkill(1);
      await commonColony.addGlobalSkill(1);

      await checkErrorRevert(commonColony.addGlobalSkill(5));
      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 4);
    });

    it("should NOT be able to add a child skill to a local skill parent", async () => {
      await checkError(commonColony.addGlobalSkill(2));
      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 2);
    });

    it("should be able to add skills in the middle of the skills tree", async () => {
      await commonColony.addGlobalSkill(1);
      await commonColony.addGlobalSkill(1);
      await commonColony.addGlobalSkill(4);
      await commonColony.addGlobalSkill(1);
      await commonColony.addGlobalSkill(3);
      await commonColony.addGlobalSkill(4);

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

    it("when N parents are there, should record parent skill ids for N = integer powers of 2", async () => {
      await commonColony.addGlobalSkill(1);
      await commonColony.addGlobalSkill(3);
      await commonColony.addGlobalSkill(4);
      await commonColony.addGlobalSkill(5);
      await commonColony.addGlobalSkill(6);
      await commonColony.addGlobalSkill(7);
      await commonColony.addGlobalSkill(8);
      await commonColony.addGlobalSkill(9);
      await commonColony.addGlobalSkill(10);

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

    it("should NOT be able to add a new root global skill", async () => {
      await checkError(commonColony.addGlobalSkill(0));

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 2);
    });
  });

  describe("when adding domains in the common colony", () => {
    it("should be able to add new domains as children to the root domain", async () => {
      await commonColony.addDomain(2);

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 3);
      const domainCount = await commonColony.getDomainCount.call();
      assert.equal(domainCount.toNumber(), 2);

      const newDomain = await commonColony.getDomain.call(1);
      assert.equal(newDomain[0].toNumber(), 2);
      assert.equal(newDomain[1].toNumber(), 1);

      // Check root local skill.nChildren is now 1
      const rootLocalSkill = await colonyNetwork.getSkill.call(2);
      assert.equal(rootLocalSkill[1].toNumber(), 1);

      // Check root local skill.children first element is the id of the new skill
      const rootSkillChild = await colonyNetwork.getChildSkillId.call(2, 0);
      assert.equal(rootSkillChild.toNumber(), 3);
    });

    it("should NOT be able to add a child local skill more than one level from the root local skill", async () => {
      await commonColony.addDomain(2);
      await checkError(commonColony.addDomain(3));

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 3);
      const domainCount = await commonColony.getDomainCount.call();
      assert.equal(domainCount.toNumber(), 2);
    });
  });

  describe("when adding domains in a regular colony", () => {
    beforeEach(async () => {
      COLONY_KEY = getRandomString(7);
      TOKEN_ARGS = getTokenArgs();
      const newToken = await Token.new(...TOKEN_ARGS);
      await colonyNetwork.createColony(COLONY_KEY, newToken.address);
      const address = await colonyNetwork.getColony.call(COLONY_KEY);
      colony = await IColony.at(address);
      const tokenAddress = await colony.getToken.call();
      token = await Token.at(tokenAddress);
    });

    it("should be able to add new domains as children to the root domain", async () => {
      await colony.addDomain(3);
      await colony.addDomain(3);
      await colony.addDomain(3);

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 6);
      const domainCount = await colony.getDomainCount.call();
      assert.equal(domainCount.toNumber(), 4);

      const newDomain1 = await colony.getDomain.call(1);
      assert.equal(newDomain1[0].toNumber(), 3);
      assert.equal(newDomain1[1].toNumber(), 1);

      const newDomain2 = await colony.getDomain.call(2);
      assert.equal(newDomain2[0].toNumber(), 4);
      assert.equal(newDomain2[1].toNumber(), 2);

      const newDomain3 = await colony.getDomain.call(3);
      assert.equal(newDomain3[0].toNumber(), 5);
      assert.equal(newDomain3[1].toNumber(), 3);

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

    it("should NOT be able to add a child local skill more than one level from the root local skill", async () => {
      await colony.addDomain(3);
      await checkError(colony.addDomain(4));

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 4);
      const domainCount = await colony.getDomainCount.call();
      assert.equal(domainCount.toNumber(), 2);
    });

    it("should NOT be able to add a child local skill to a global skill parent", async () => {
      await checkError(colony.addDomain(1));

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 3);
      const domainCount = await colony.getDomainCount.call();
      assert.equal(domainCount.toNumber(), 1);
    });

    it("should NOT be able to add a new local skill by anyone but a Colony", async () => {
      await checkError(colonyNetwork.addSkill(2, false));

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 3);
    });

    it("should NOT be able to add a new root local skill", async () => {
      await checkError(colonyNetwork.addSkill(0, false));

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 3);
    });
  });

  describe("when setting domain and skill on task", () => {
    beforeEach(async () => {
      COLONY_KEY = getRandomString(7);
      TOKEN_ARGS = getTokenArgs();
      token = await Token.new(...TOKEN_ARGS);
      await colonyNetwork.createColony(COLONY_KEY, token.address);
      const address = await colonyNetwork.getColony.call(COLONY_KEY);
      await token.setOwner(address);
      colony = await IColony.at(address);
    });

    it("should be able to set domain on task", async () => {
      await colony.addDomain(3);
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskDomain(1, 2);
      const taskDomain = await colony.getTaskDomain.call(1, 0);
      assert.equal(taskDomain.toNumber(), 2);
    });

    it("should NOT be able to set a domain on nonexistent task", async () => {
      await checkError(colony.setTaskDomain(10, 3));
    });

    it("should NOT be able to set a nonexistent domain on task", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await checkError(colony.setTaskDomain(1, 20));

      const taskDomain = await colony.getTaskDomain.call(1, 0);
      assert.equal(taskDomain.toNumber(), 1);
    });

    it("should NOT be able to set a domain on finalized task", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony });
      await colony.finalizeTask(taskId);
      await checkError(colony.setTaskDomain(taskId, 1));
    });

    it("should be able to set global skill on task", async () => {
      await commonColony.addGlobalSkill(1);
      await commonColony.addGlobalSkill(4);

      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskSkill(1, 5);
      const taskSkill = await colony.getTaskSkill.call(1, 0);
      assert.equal(taskSkill.toNumber(), 5);
    });

    it("should NOT be able to set global skill on nonexistent task", async () => {
      await checkError(colony.setTaskSkill(10, 1));
    });

    it("should NOT be able to set global skill on finalized task", async () => {
      await commonColony.addGlobalSkill(1);
      await commonColony.addGlobalSkill(4);
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony });
      await colony.finalizeTask(taskId);
      await checkError(colony.setTaskSkill(taskId, 5));

      const taskSkill = await colony.getTaskSkill.call(taskId, 0);
      assert.equal(taskSkill.toNumber(), 1);
    });

    it("should NOT be able to set nonexistent skill on task", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await checkError(colony.setTaskSkill(1, 5));
    });

    it("should NOT be able to set local skill on task", async () => {
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await checkError(colony.setTaskSkill(1, 3));
    });
  });
});
