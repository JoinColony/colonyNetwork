import chai from "chai";
import bnChai from "bn-chai";

import { asciiToHex } from "web3-utils";
import { INITIAL_FUNDING, DELIVERABLE_HASH } from "../helpers/constants";
import { checkErrorRevert } from "../helpers/test-helper";
import {
  fundColonyWithTokens,
  setupFundedTask,
  setupFinalizedTask,
  executeSignedTaskChange,
  makeTask,
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  setupRandomColony
} from "../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

contract("Meta Colony", accounts => {
  const MANAGER = accounts[0];
  const OTHER_ACCOUNT = accounts[1];
  const WORKER = accounts[2];

  let metaColony;
  let clnyToken;
  let colony;
  let token;
  let colonyNetwork;

  beforeEach(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
  });

  describe("when working with ERC20 properties of Meta Colony token", () => {
    it("token properties are correct", async () => {
      const tokenSymbol = await clnyToken.symbol();
      expect(tokenSymbol).to.equal(asciiToHex("CLNY"));

      const tokenDecimals = await clnyToken.decimals();
      expect(tokenDecimals).to.eq.BN(18);

      const tokenName = await clnyToken.name();
      expect(tokenName).to.equal(asciiToHex("Colony Network Token"));
    });
  });

  describe("when adding a new global skill", () => {
    it("should be able to add a new skill as a child to the root skill", async () => {
      await metaColony.addGlobalSkill(1);

      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(4);

      const newSkill = await colonyNetwork.getSkill(skillCount);
      expect(newSkill.nParents).to.eq.BN(1);
      expect(newSkill.nChildren).to.be.zero;

      // Check rootSkill.nChildren is now 1
      const rootSkill = await colonyNetwork.getSkill(1);
      expect(rootSkill.nChildren).to.eq.BN(1);

      // Check rootSkill.children first element is the id of the new skill
      const rootSkillChild = await colonyNetwork.getChildSkillId(1, 0);
      expect(rootSkillChild).to.eq.BN(4);
    });

    it("should not allow a non-root role in the metacolony to add a global skill", async () => {
      await checkErrorRevert(metaColony.addGlobalSkill(1, { from: OTHER_ACCOUNT }), "ds-auth-unauthorized");
    });

    it("should be able to add multiple child skills to the root global skill", async () => {
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(1);

      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(6);

      const newSkill1 = await colonyNetwork.getSkill(4);
      expect(newSkill1.nParents).to.eq.BN(1);
      expect(newSkill1.nChildren).to.be.zero;

      const newSkill2 = await colonyNetwork.getSkill(5);
      expect(newSkill2.nParents).to.eq.BN(1);
      expect(newSkill2.nChildren).to.be.zero;

      const newSkill3 = await colonyNetwork.getSkill(6);
      expect(newSkill3.nParents).to.eq.BN(1);
      expect(newSkill3.nChildren).to.be.zero;

      // Check rootSkill.nChildren is now 3
      const rootSkill = await colonyNetwork.getSkill(1);
      expect(rootSkill.nChildren).to.eq.BN(3);

      // Check rootSkill.children contains the ids of the new skills
      const rootSkillChild1 = await colonyNetwork.getChildSkillId(1, 0);
      expect(rootSkillChild1).to.eq.BN(4);
      const rootSkillChild2 = await colonyNetwork.getChildSkillId(1, 1);
      expect(rootSkillChild2).to.eq.BN(5);
      const rootSkillChild3 = await colonyNetwork.getChildSkillId(1, 2);
      expect(rootSkillChild3).to.eq.BN(6);
    });

    it("should NOT be able to add a child skill for a non existent parent", async () => {
      // Add 2 skill nodes to root skill
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(1);

      await checkErrorRevert(metaColony.addGlobalSkill(6), "colony-invalid-skill-id");
      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(5);
    });

    it("should NOT be able to add a child skill to a local skill parent", async () => {
      await checkErrorRevert(metaColony.addGlobalSkill(2), "colony-global-and-local-skill-trees-are-separate");
      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(3);
    });

    it("should be able to add skills in the middle of the skills tree", async () => {
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(5);
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(4);
      await metaColony.addGlobalSkill(5);

      const rootSkill = await colonyNetwork.getSkill(1);
      expect(rootSkill.nParents).to.be.zero;
      expect(rootSkill.nChildren).to.eq.BN(6);
      const rootSkillChildSkillId1 = await colonyNetwork.getChildSkillId(1, 0);
      expect(rootSkillChildSkillId1).to.eq.BN(4);
      const rootSkillChildSkillId2 = await colonyNetwork.getChildSkillId(1, 1);
      expect(rootSkillChildSkillId2).to.eq.BN(5);
      const rootSkillChildSkillId3 = await colonyNetwork.getChildSkillId(1, 2);
      expect(rootSkillChildSkillId3).to.eq.BN(6);
      const rootSkillChildSkillId4 = await colonyNetwork.getChildSkillId(1, 3);
      expect(rootSkillChildSkillId4).to.eq.BN(7);
      const rootSkillChildSkillId5 = await colonyNetwork.getChildSkillId(1, 4);
      expect(rootSkillChildSkillId5).to.eq.BN(8);
      const rootSkillChildSkillId6 = await colonyNetwork.getChildSkillId(1, 5);
      expect(rootSkillChildSkillId6).to.eq.BN(9);

      const skill1 = await colonyNetwork.getSkill(4);
      expect(skill1.nParents).to.eq.BN(1);
      expect(skill1.nChildren).to.eq.BN(1);
      const skill1ParentSkillId1 = await colonyNetwork.getParentSkillId(4, 0);
      expect(skill1ParentSkillId1).to.eq.BN(1);
      const skill1ChildSkillId1 = await colonyNetwork.getChildSkillId(4, 0);
      expect(skill1ChildSkillId1).to.eq.BN(8);

      const skill2 = await colonyNetwork.getSkill(5);
      expect(skill2.nParents).to.eq.BN(1);
      expect(skill2.nChildren).to.eq.BN(2);
      const skill2ParentSkillId1 = await colonyNetwork.getParentSkillId(5, 0);
      expect(skill2ParentSkillId1).to.eq.BN(1);
      const skill2ChildSkillId1 = await colonyNetwork.getChildSkillId(5, 0);
      expect(skill2ChildSkillId1).to.eq.BN(6);
      const skill2ChildSkillId2 = await colonyNetwork.getChildSkillId(5, 1);
      expect(skill2ChildSkillId2).to.eq.BN(9);

      const skill3 = await colonyNetwork.getSkill(6);
      expect(skill3.nParents).to.eq.BN(2);
      expect(skill3.nChildren).to.be.zero;
      const skill3ParentSkillId1 = await colonyNetwork.getParentSkillId(6, 0);
      expect(skill3ParentSkillId1).to.eq.BN(5);
      const skill3ParentSkillId2 = await colonyNetwork.getParentSkillId(6, 1);
      expect(skill3ParentSkillId2).to.eq.BN(1);

      const skill4 = await colonyNetwork.getSkill(7);
      expect(skill4.nParents).to.eq.BN(1);
      expect(skill4.nChildren).to.be.zero;
      const skill4ParentSkillId1 = await colonyNetwork.getParentSkillId(7, 0);
      expect(skill4ParentSkillId1).to.eq.BN(1);

      const skill5 = await colonyNetwork.getSkill(8);
      expect(skill5.nParents).to.eq.BN(2);
      expect(skill5.nChildren).to.be.zero;
      const skill5ParentSkillId1 = await colonyNetwork.getParentSkillId(8, 0);
      expect(skill5ParentSkillId1).to.eq.BN(4);
      const skill5ParentSkillId2 = await colonyNetwork.getParentSkillId(8, 1);
      expect(skill5ParentSkillId2).to.eq.BN(1);

      const skill6 = await colonyNetwork.getSkill(9);
      expect(skill6.nParents).to.eq.BN(2);
      expect(skill6.nChildren).to.be.zero;
      const skill6ParentSkillId1 = await colonyNetwork.getParentSkillId(9, 0);
      expect(skill6ParentSkillId1).to.eq.BN(5);
      const skill6ParentSkillId2 = await colonyNetwork.getParentSkillId(9, 1);
      expect(skill6ParentSkillId2).to.eq.BN(1);
    });

    it("should correctly ascend the skills tree to find parents", async () => {
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(4);
      await metaColony.addGlobalSkill(5);
      await metaColony.addGlobalSkill(6);
      await metaColony.addGlobalSkill(7);
      await metaColony.addGlobalSkill(8);
      await metaColony.addGlobalSkill(9);
      await metaColony.addGlobalSkill(10);
      await metaColony.addGlobalSkill(11);

      // 1 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12

      const skill = await colonyNetwork.getSkill(12);
      const numParents = skill.nParents;
      const numChildren = skill.nChildren;
      expect(numParents).to.eq.BN(9);
      expect(numChildren).to.be.zero;

      let parentId;
      parentId = await colonyNetwork.getParentSkillId(12, 0);
      expect(parentId).to.eq.BN(11);
      parentId = await colonyNetwork.getParentSkillId(12, 1);
      expect(parentId).to.eq.BN(10);
      parentId = await colonyNetwork.getParentSkillId(12, 2);
      expect(parentId).to.eq.BN(9);
      parentId = await colonyNetwork.getParentSkillId(12, 3);
      expect(parentId).to.eq.BN(8);
      parentId = await colonyNetwork.getParentSkillId(12, 4);
      expect(parentId).to.eq.BN(7);
      parentId = await colonyNetwork.getParentSkillId(12, 5);
      expect(parentId).to.eq.BN(6);
      parentId = await colonyNetwork.getParentSkillId(12, 6);
      expect(parentId).to.eq.BN(5);
      parentId = await colonyNetwork.getParentSkillId(12, 7);
      expect(parentId).to.eq.BN(4);
      parentId = await colonyNetwork.getParentSkillId(12, 8);
      expect(parentId).to.eq.BN(1);

      // Higher indices return 0
      parentId = await colonyNetwork.getParentSkillId(12, 9);
      expect(parentId).to.be.zero;
      parentId = await colonyNetwork.getParentSkillId(12, 10);
      expect(parentId).to.be.zero;
      parentId = await colonyNetwork.getParentSkillId(12, 100);
      expect(parentId).to.be.zero;
    });

    it("should NOT be able to add a new root global skill", async () => {
      await checkErrorRevert(metaColony.addGlobalSkill(0), "colony-invalid-skill-id");

      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(3);
    });
  });

  describe("when adding domains in the meta colony", () => {
    it("should be able to add new domains as children to the root domain", async () => {
      await metaColony.addDomain(1, 0, 1);
      const newDomainId = await metaColony.getDomainCount();

      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(4);
      const domainCount = await metaColony.getDomainCount();
      expect(domainCount).to.eq.BN(2);

      const newDomain = await metaColony.getDomain(newDomainId);
      expect(newDomain.skillId).to.eq.BN(4);
      expect(newDomain.fundingPotId).to.eq.BN(2);

      // Check root local skill.nChildren is now 2
      // One special mining skill, and the skill associated with the domain we just added
      const rootLocalSkill = await colonyNetwork.getSkill(2);
      expect(rootLocalSkill.nChildren).to.eq.BN(2);

      // Check root local skill.children second element is the id of the new skill
      const rootSkillChild = await colonyNetwork.getChildSkillId(2, 1);
      expect(rootSkillChild).to.eq.BN(4);
    });

    it("should NOT be able to add a child domain more than one level away from the root domain", async () => {
      await metaColony.addDomain(1, 0, 1);

      // In position 1 because the mining skill occupies position 0
      await checkErrorRevert(metaColony.addDomain(1, 1, 2), "colony-parent-domain-not-root");

      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(4);
      const domainCount = await metaColony.getDomainCount();
      expect(domainCount).to.eq.BN(2);
    });
  });

  describe("when adding domains in a regular colony", () => {
    beforeEach(async () => {
      ({ colony, token } = await setupRandomColony(colonyNetwork));
    });

    it("someone who does not have root role should not be able to add domains", async () => {
      await checkErrorRevert(colony.addDomain(1, 0, 1, { from: OTHER_ACCOUNT }), "ds-auth-unauthorized");
    });

    it("should be able to add new domains as children to the root domain", async () => {
      await colony.addDomain(1, 0, 1);
      await colony.addDomain(1, 0, 1);
      await colony.addDomain(1, 0, 1);

      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(7);
      const domainCount = await colony.getDomainCount();
      expect(domainCount).to.eq.BN(4);

      const rootDomain = await colony.getDomain(1);
      expect(rootDomain.skillId).to.eq.BN(4);
      expect(rootDomain.fundingPotId).to.eq.BN(1);

      const newDomain2 = await colony.getDomain(2);
      expect(newDomain2.skillId).to.eq.BN(5);
      expect(newDomain2.fundingPotId).to.eq.BN(2);

      const newDomain3 = await colony.getDomain(3);
      expect(newDomain3.skillId).to.eq.BN(6);
      expect(newDomain3.fundingPotId).to.eq.BN(3);

      // Check root local skill.nChildren is now 3
      const rootLocalSkill = await colonyNetwork.getSkill(4);
      expect(rootLocalSkill.nChildren).to.eq.BN(3);

      // Check root local skill.children are the ids of the new skills
      const rootSkillChild1 = await colonyNetwork.getChildSkillId(4, 0);
      expect(rootSkillChild1).to.eq.BN(5);
      const rootSkillChild2 = await colonyNetwork.getChildSkillId(4, 1);
      expect(rootSkillChild2).to.eq.BN(6);
      const rootSkillChild3 = await colonyNetwork.getChildSkillId(4, 2);
      expect(rootSkillChild3).to.eq.BN(7);
    });

    it("should NOT be able to add a new local skill by anyone but a Colony", async () => {
      await checkErrorRevert(colonyNetwork.addSkill(2, false), "colony-caller-must-be-colony");

      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(4);
    });

    it("should NOT be able to add a new root local skill", async () => {
      const skillCountBefore = await colonyNetwork.getSkillCount();
      const rootDomain = await colony.getDomain(1);
      const rootLocalSkillId = rootDomain.skillId;

      await checkErrorRevert(colonyNetwork.addSkill(rootLocalSkillId, false), "colony-caller-must-be-colony");

      const skillCountAfter = await colonyNetwork.getSkillCount();
      expect(skillCountBefore).to.eq.BN(skillCountAfter);
    });
  });

  describe("when setting domain and skill on task", () => {
    beforeEach(async () => {
      ({ colony, token } = await setupRandomColony(colonyNetwork));
    });

    it("should be able to set domain on task", async () => {
      await colony.addDomain(1, 0, 1);
      const taskId = await makeTask({ colony });

      await executeSignedTaskChange({
        colony,
        functionName: "setTaskDomain",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, 2]
      });

      const task = await colony.getTask(taskId);
      expect(task.domainId).to.eq.BN(2);
    });

    it("should NOT allow a non-manager to set domain on task", async () => {
      await colony.addDomain(1, 0, 1);
      const taskId = await makeTask({ colony });
      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          functionName: "setTaskDomain",
          taskId,
          signers: [OTHER_ACCOUNT],
          sigTypes: [0],
          args: [taskId, 2]
        }),
        "colony-task-signatures-do-not-match-reviewer-1"
      );

      const task = await colony.getTask(taskId);
      expect(task.domainId).to.eq.BN(1);
    });

    it("should NOT be able to set a domain on nonexistent task", async () => {
      const taskId = await makeTask({ colony });
      const nonexistentTaskId = taskId.addn(10);

      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          functionName: "setTaskDomain",
          taskId,
          signers: [MANAGER],
          sigTypes: [0],
          args: [nonexistentTaskId, 1]
        }),
        "colony-task-does-not-exist"
      );
    });

    it("should NOT be able to set a nonexistent domain on task", async () => {
      const taskId = await makeTask({ colony });

      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          functionName: "setTaskDomain",
          taskId,
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, 20]
        }),
        "colony-task-change-execution-failed"
      );

      const task = await colony.getTask(taskId);
      expect(task.domainId).to.eq.BN(1);
    });

    it("should NOT be able to set a domain on completed task", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFundedTask({ colonyNetwork, colony });
      await colony.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER });

      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          functionName: "setTaskDomain",
          taskId,
          signers: [MANAGER, WORKER],
          sigTypes: [0, 0],
          args: [taskId, 1]
        }),
        "colony-task-change-execution-failed"
      );
    });

    it("should be able to set global skill on task", async () => {
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(5);

      const taskId = await makeTask({ colony });

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskSkill",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, 6]
      });

      const task = await colony.getTask(taskId);
      expect(task.skillIds[0]).to.eq.BN(6);
    });

    it("should not allow anyone but the colony to set global skill on task", async () => {
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(5);

      const taskId = await makeTask({ colony, skillId: 0 });
      await checkErrorRevert(colony.setTaskSkill(taskId, 5, { from: OTHER_ACCOUNT }), "colony-not-self");

      const task = await colony.getTask(taskId);
      expect(task.skillIds[0]).to.be.zero;
    });

    it("should NOT be able to set global skill on nonexistent task", async () => {
      await checkErrorRevert(colony.setTaskSkill(10, 1), "colony-task-does-not-exist");
    });

    it("should NOT be able to set global skill on completed task", async () => {
      await metaColony.addGlobalSkill(1);
      await metaColony.addGlobalSkill(5);
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFinalizedTask({ colonyNetwork, colony });
      await checkErrorRevert(colony.setTaskSkill(taskId, 6), "colony-task-complete");

      const task = await colony.getTask(taskId);
      expect(task.skillIds[0]).to.eq.BN(1);
    });

    it("should NOT be able to set nonexistent skill on task", async () => {
      await makeTask({ colony });
      await checkErrorRevert(colony.setTaskSkill(1, 5), "colony-skill-does-not-exist");
    });

    it("should NOT be able to set local skill on task", async () => {
      await makeTask({ colony });
      await checkErrorRevert(colony.setTaskSkill(1, 3), "colony-not-global-skill");
    });
  });

  describe("when getting a skill", () => {
    it("should return a true flag if the skill is global", async () => {
      const globalSkill = await colonyNetwork.getSkill(1);
      expect(globalSkill.globalSkill).to.be.true;
    });

    it("should return a false flag if the skill is local", async () => {
      const localSkill = await colonyNetwork.getSkill(2);
      expect(localSkill.globalSkill).to.be.false;
    });
  });

  describe("when setting the network fee", () => {
    it("should allow a meta colony root user to set the fee", async () => {
      await metaColony.setNetworkFeeInverse(234);
      const fee = await colonyNetwork.getFeeInverse();
      expect(fee).to.eq.BN(234);
    });

    it("should not allow anyone else but a meta colony root user to set the fee", async () => {
      await checkErrorRevert(metaColony.setNetworkFeeInverse(234, { from: accounts[1] }), "ds-auth-unauthorized");
      const fee = await colonyNetwork.getFeeInverse();
      expect(fee).to.eq.BN(100);
    });

    it("should not allow another account, than the meta colony, to set the fee", async () => {
      await checkErrorRevert(colonyNetwork.setFeeInverse(100), "colony-caller-must-be-meta-colony");
    });

    it("should not allow the fee to be set to zero", async () => {
      await checkErrorRevert(metaColony.setNetworkFeeInverse(0), "colony-network-fee-inverse-cannot-be-zero");
    });
  });

  describe("when minting tokens for the Network", () => {
    it("should NOT allow anyone but the Network to call mintTokensForColonyNetwork", async () => {
      await checkErrorRevert(metaColony.mintTokensForColonyNetwork(100), "colony-access-denied-only-network-allowed");
    });
  });
});
