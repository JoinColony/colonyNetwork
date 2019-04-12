import chai from "chai";
import bnChai from "bn-chai";

import { soliditySha3 } from "web3-utils";
import { INITIAL_FUNDING, DELIVERABLE_HASH, GLOBAL_SKILL_ID } from "../helpers/constants";
import { checkErrorRevert, removeSubdomainLimit } from "../helpers/test-helper";
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
      expect(tokenSymbol).to.equal("CLNY");

      const tokenDecimals = await clnyToken.decimals();
      expect(tokenDecimals).to.eq.BN(18);

      const tokenName = await clnyToken.name();
      expect(tokenName).to.equal("Colony Network Token");
    });
  });

  describe("when adding skills to the tree by adding domains", () => {
    beforeEach(async () => {
      await removeSubdomainLimit(colonyNetwork); // Temporary for tests until we allow subdomain depth > 1
    });

    it("should be able to add a new skill as a child of a domain", async () => {
      await metaColony.addDomain(1, 0, 1);

      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(4);

      const newSkill = await colonyNetwork.getSkill(skillCount);
      expect(newSkill.nParents).to.eq.BN(1);
      expect(newSkill.nChildren).to.be.zero;

      // Check nChildren of the skill corresponding to the root domain in the metacolony is now 2
      const rootSkill = await colonyNetwork.getSkill(1);
      expect(rootSkill.nChildren).to.eq.BN(2);

      // Check rootSkill.children first element is the id of the new skill
      const rootSkillChild = await colonyNetwork.getChildSkillId(1, 0);
      const rootSkillChild2 = await colonyNetwork.getChildSkillId(1, 1);
      expect(rootSkillChild).to.eq.BN(2);
      expect(rootSkillChild2).to.eq.BN(4);
    });

    it("should not allow a non-root role in the metacolony to add a global skill", async () => {
      await checkErrorRevert(metaColony.addGlobalSkill({ from: OTHER_ACCOUNT }), "ds-auth-unauthorized");
    });

    it("should be able to add multiple child skills to the skill corresponding to the root domain by adding child domains", async () => {
      await metaColony.addDomain(1, 0, 1);
      await metaColony.addDomain(1, 0, 1);
      await metaColony.addDomain(1, 0, 1);

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

      // Check rootSkill.nChildren is now 4
      const rootSkill = await colonyNetwork.getSkill(1);
      expect(rootSkill.nChildren).to.eq.BN(4);

      // Check rootSkill.children contains the ids of the new skills
      const rootSkillChild1 = await colonyNetwork.getChildSkillId(1, 1);
      expect(rootSkillChild1).to.eq.BN(4);
      const rootSkillChild2 = await colonyNetwork.getChildSkillId(1, 2);
      expect(rootSkillChild2).to.eq.BN(5);
      const rootSkillChild3 = await colonyNetwork.getChildSkillId(1, 3);
      expect(rootSkillChild3).to.eq.BN(6);
    });

    it("should NOT be able to add a domain that has a non existent parent", async () => {
      // Add 2 skill nodes to skill corresponding to root domain
      await metaColony.addDomain(1, 0, 1);
      await metaColony.addDomain(1, 0, 1);

      await checkErrorRevert(metaColony.addDomain(1, 0, 6), "ds-auth-child-domain-does-not-exist");
      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(5);
    });

    it("should NOT be able to add a child skill to a local skill parent", async () => {
      // Put colony in to recovery mode
      await metaColony.enterRecoveryMode();
      // work out the storage slot
      // Domain mapping is storage slot 20
      // So domain 1 struct starts at slot given by
      const domain1Slot = soliditySha3(1, 20);
      // Which means the skill is in that slot (it's the first entry in the struct)
      // Edit that slot
      await metaColony.setStorageSlotRecovery(domain1Slot, "0x0000000000000000000000000000000000000000000000000000000000000003");
      // Leave recovery mode
      await metaColony.approveExitRecovery();
      await metaColony.exitRecoveryMode();
      // Try to add a child
      await checkErrorRevert(metaColony.addDomain(1, 0, 1), "colony-global-and-local-skill-trees-are-separate");
      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(3);
    });

    it("should be able to add skills in the middle of the skills tree", async () => {
      // Why this random addGlobalSkill in the middle? It means we can use effectively the same tests
      // below, but with skill ID 7 replaced with skill ID 2. While porting everything to the tag cloud
      // arrangement, I was very interested in changing tests as little as possible.
      await metaColony.addDomain(1, 0, 1); // Domain ID 2, skill id 4
      await metaColony.addDomain(1, 0, 1); // Domain ID 3, skill id 5
      await metaColony.addDomain(1, 2, 3); // Domain ID 4, skill id 6
      await metaColony.addGlobalSkill(); // Skill id 7
      await metaColony.addDomain(1, 1, 2); // Domain ID 5, skill id 8
      await metaColony.addDomain(1, 2, 3); // Domain ID 6, skill id 9

      const rootSkill = await colonyNetwork.getSkill(1);
      expect(rootSkill.nParents).to.be.zero;
      expect(rootSkill.nChildren).to.eq.BN(6);
      const rootSkillChildSkillId1 = await colonyNetwork.getChildSkillId(1, 0);
      expect(rootSkillChildSkillId1).to.eq.BN(2);
      const rootSkillChildSkillId2 = await colonyNetwork.getChildSkillId(1, 1);
      expect(rootSkillChildSkillId2).to.eq.BN(4);
      const rootSkillChildSkillId3 = await colonyNetwork.getChildSkillId(1, 2);
      expect(rootSkillChildSkillId3).to.eq.BN(5);
      const rootSkillChildSkillId4 = await colonyNetwork.getChildSkillId(1, 3);
      expect(rootSkillChildSkillId4).to.eq.BN(6);
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

      const skill4 = await colonyNetwork.getSkill(2);
      expect(skill4.nParents).to.eq.BN(1);
      expect(skill4.nChildren).to.be.zero;
      const skill4ParentSkillId1 = await colonyNetwork.getParentSkillId(2, 0);
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
      await metaColony.addDomain(1, 0, 1);
      await metaColony.addDomain(1, 1, 2);
      await metaColony.addDomain(1, 2, 3);
      await metaColony.addDomain(1, 3, 4);
      await metaColony.addDomain(1, 4, 5);
      await metaColony.addDomain(1, 5, 6);
      await metaColony.addDomain(1, 6, 7);
      await metaColony.addDomain(1, 7, 8);
      await metaColony.addDomain(1, 8, 9);

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

    it("should prevent a child skill being added to a skill that doesn't exist", async () => {
      // Put colony in to recovery mode
      await metaColony.enterRecoveryMode();
      // work out the storage slot
      // Domain mapping is storage slot 20
      // So domain 1 struct starts at slot given by
      const domain1Slot = soliditySha3(1, 20);
      // Which means the skill is in that slot (it's the first entry in the struct)
      // Edit that slot
      await metaColony.setStorageSlotRecovery(domain1Slot, "0xdeadbeef");
      // Leave recovery mode
      await metaColony.approveExitRecovery();
      await metaColony.exitRecoveryMode();
      // Try to add a child
      await checkErrorRevert(metaColony.addDomain(1, 0, 1), "colony-invalid-skill-id");
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
      const rootLocalSkill = await colonyNetwork.getSkill(1);
      expect(rootLocalSkill.nChildren).to.eq.BN(2);

      // Check root local skill.children second element is the id of the new skill
      const rootSkillChild = await colonyNetwork.getChildSkillId(1, 1);
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
      await checkErrorRevert(colonyNetwork.addSkill(2), "colony-caller-must-be-colony");

      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(4);
    });

    it("should NOT be able to add a new root local skill", async () => {
      const skillCountBefore = await colonyNetwork.getSkillCount();
      const rootDomain = await colony.getDomain(1);
      const rootLocalSkillId = rootDomain.skillId;

      await checkErrorRevert(colonyNetwork.addSkill(rootLocalSkillId), "colony-caller-must-be-colony");

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
      await metaColony.addGlobalSkill();
      await metaColony.addGlobalSkill();

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
      await metaColony.addGlobalSkill();

      const taskId = await makeTask({ colony, skillId: 0 });
      await checkErrorRevert(colony.setTaskSkill(taskId, 5, { from: OTHER_ACCOUNT }), "colony-not-self");

      const task = await colony.getTask(taskId);
      expect(task.skillIds[0]).to.be.zero;
    });

    it("should NOT be able to set global skill on nonexistent task", async () => {
      await checkErrorRevert(colony.setTaskSkill(10, 1), "colony-task-does-not-exist");
    });

    it("should NOT be able to set global skill on completed task", async () => {
      await metaColony.addGlobalSkill();
      await metaColony.addGlobalSkill();
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFinalizedTask({ colonyNetwork, colony });
      await checkErrorRevert(colony.setTaskSkill(taskId, 5), "colony-task-complete");

      const task = await colony.getTask(taskId);
      expect(task.skillIds[0]).to.eq.BN(GLOBAL_SKILL_ID);
    });

    it("should NOT be able to set nonexistent skill on task", async () => {
      const taskId = await makeTask({ colony });
      await checkErrorRevert(colony.setTaskSkill(taskId, 5), "colony-skill-does-not-exist");
    });

    it("should NOT be able to set local skill on task", async () => {
      const taskId = await makeTask({ colony });
      await checkErrorRevert(colony.setTaskSkill(taskId, 1), "colony-not-global-skill");
    });

    it("should NOT be able to set a depreciated skill on task", async () => {
      const taskId = await makeTask({ colony });
      await metaColony.addGlobalSkill();
      const skillId = await colonyNetwork.getSkillCount();
      await metaColony.depreciateGlobalSkill(skillId);

      await checkErrorRevert(colony.setTaskSkill(taskId, skillId), "colony-depreciated-global-skill");
    });
  });

  describe("when managing global skills", () => {
    it("can create global skills", async () => {
      await metaColony.addGlobalSkill();
      const skillId = await colonyNetwork.getSkillCount();
      const skill = await colonyNetwork.getSkill(skillId);
      expect(skill.nChildren).to.be.zero;
      expect(skill.nParents).to.be.zero;
      expect(skill.globalSkill).to.be.true;
      expect(skill.depreciated).to.be.false;
    });

    it("cannot create global skills if not a root user in meta colony", async () => {
      await checkErrorRevert(metaColony.addGlobalSkill({ from: OTHER_ACCOUNT }), "ds-auth-unauthorized");
    });

    it("can depreciate global skills", async () => {
      await metaColony.addGlobalSkill();
      const skillId = await colonyNetwork.getSkillCount();

      let skill = await colonyNetwork.getSkill(skillId);
      expect(skill.depreciated).to.be.false;

      await metaColony.depreciateGlobalSkill(skillId);

      skill = await colonyNetwork.getSkill(skillId);
      expect(skill.depreciated).to.be.true;
    });
  });

  describe("when getting a skill", () => {
    it("should return a true flag if the skill is global", async () => {
      const globalSkill = await colonyNetwork.getSkill(3);
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
