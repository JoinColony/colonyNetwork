/* globals artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");

const { soliditySha3 } = require("web3-utils");
const { UINT256_MAX, GLOBAL_SKILL_ID, WAD, ADDRESS_ZERO, HASHZERO } = require("../../helpers/constants");
const { checkErrorRevert, removeSubdomainLimit, restoreSubdomainLimit } = require("../../helpers/test-helper");
const { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, setupRandomColony } = require("../../helpers/test-data-generator");

const IMetaColony = artifacts.require("IMetaColony");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

contract("Meta Colony", (accounts) => {
  const OTHER_ACCOUNT = accounts[1];

  let metaColony;
  let clnyToken;
  let colony;
  let colonyNetwork;

  beforeEach(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

    // Skills:
    // 1: Metacolony root domain skill
    // 2: Metacolony root local skill
    // 3: Metacolony mining skill
    // 4: First global skill

    const skillCount = await colonyNetwork.getSkillCount();
    expect(skillCount).to.eq.BN(4);

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

    afterEach(async () => {
      await restoreSubdomainLimit(colonyNetwork);
    });

    it("should be able to add a new domain skill as a child of a domain", async () => {
      await metaColony.addDomain(1, UINT256_MAX, 1);

      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(5);

      const newDomainSkill = await colonyNetwork.getSkill(skillCount);
      expect(newDomainSkill.nParents).to.eq.BN(1);
      expect(newDomainSkill.nChildren).to.be.zero;

      // Check nChildren of the skill corresponding to the root domain in the metacolony is now 2
      const rootDomain = await metaColony.getDomain(1);
      const rootDomainSkill = await colonyNetwork.getSkill(rootDomain.skillId);
      expect(rootDomainSkill.nChildren).to.eq.BN(2);

      // Check rootSkill.children first element is the id of the new skill
      const rootSkillChild = await colonyNetwork.getChildSkillId(rootDomain.skillId, 0);
      const rootSkillChild2 = await colonyNetwork.getChildSkillId(rootDomain.skillId, 1);
      expect(rootSkillChild).to.eq.BN(3);
      expect(rootSkillChild2).to.eq.BN(5);
    });

    it("should not allow a non-root role in the metacolony to add or deprecate a global skill", async () => {
      await checkErrorRevert(metaColony.addGlobalSkill({ from: OTHER_ACCOUNT }), "ds-auth-unauthorized");
      await checkErrorRevert(metaColony.deprecateGlobalSkill(0, { from: OTHER_ACCOUNT }), "ds-auth-unauthorized");
    });

    it("should not allow a non-root role in the metacolony to add colony or extension versions to the network", async () => {
      await checkErrorRevert(metaColony.addNetworkColonyVersion(1, ADDRESS_ZERO, { from: OTHER_ACCOUNT }), "ds-auth-unauthorized");
      await checkErrorRevert(metaColony.addExtensionToNetwork(HASHZERO, ADDRESS_ZERO, { from: OTHER_ACCOUNT }), "ds-auth-unauthorized");
    });

    it("should be able to add multiple child skills to the domain skill corresponding to the root domain by adding child domains", async () => {
      await metaColony.addDomain(1, UINT256_MAX, 1);
      await metaColony.addDomain(1, UINT256_MAX, 1);
      await metaColony.addDomain(1, UINT256_MAX, 1);

      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(7);

      const newSkill1 = await colonyNetwork.getSkill(5);
      expect(newSkill1.nParents).to.eq.BN(1);
      expect(newSkill1.nChildren).to.be.zero;

      const newSkill2 = await colonyNetwork.getSkill(6);
      expect(newSkill2.nParents).to.eq.BN(1);
      expect(newSkill2.nChildren).to.be.zero;

      const newSkill3 = await colonyNetwork.getSkill(7);
      expect(newSkill3.nParents).to.eq.BN(1);
      expect(newSkill3.nChildren).to.be.zero;

      // Check rootSkill.nChildren is now 4
      const rootDomain = await metaColony.getDomain(1);
      const rootDomainSkill = await colonyNetwork.getSkill(rootDomain.skillId);
      expect(rootDomainSkill.nChildren).to.eq.BN(4);

      // Check rootDomainSkill.children contains the ids of the new skills
      const rootDomainSkillChild1 = await colonyNetwork.getChildSkillId(1, 1);
      expect(rootDomainSkillChild1).to.eq.BN(5);
      const rootDomainSkillChild2 = await colonyNetwork.getChildSkillId(1, 2);
      expect(rootDomainSkillChild2).to.eq.BN(6);
      const rootDomainSkillChild3 = await colonyNetwork.getChildSkillId(1, 3);
      expect(rootDomainSkillChild3).to.eq.BN(7);
    });

    it("should NOT be able to add a domain that has a non existent parent", async () => {
      // Add 2 skill nodes to skill corresponding to root domain
      await metaColony.addDomain(1, UINT256_MAX, 1);
      await metaColony.addDomain(1, UINT256_MAX, 1);

      await checkErrorRevert(metaColony.addDomain(1, UINT256_MAX, 6), "ds-auth-child-domain-does-not-exist");
      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(6);
    });

    it("should NOT be able to add a child skill to a global skill parent", async () => {
      // Put colony in to recovery mode
      await metaColony.enterRecoveryMode();
      // Work out the storage slot
      // Domain mapping is storage slot 20
      // So domain 1 struct starts at slot given by
      const domain1Slot = soliditySha3(1, 20);
      // Which means the skill is in that slot (it's the first entry in the struct)
      // Edit that slot to the first global skill (from id 1 to id 4)
      await metaColony.setStorageSlotRecovery(domain1Slot, "0x0000000000000000000000000000000000000000000000000000000000000004");
      // Leave recovery mode
      await metaColony.approveExitRecovery();
      await metaColony.exitRecoveryMode();
      // Try to add a child to what the network thinks is a global skill
      await checkErrorRevert(metaColony.addDomain(1, UINT256_MAX, 1), "colony-global-and-local-skill-trees-are-separate");
      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(4);
    });

    it("should be able to add skills in the middle of the skills tree", async () => {
      // Why this random addGlobalSkill in the middle? It means we can use effectively the same tests
      // below, but with skill ID 7 replaced with skill ID 2. While porting everything to the tag cloud
      // arrangement, I was very interested in changing tests as little as possible.

      await metaColony.addDomain(1, UINT256_MAX, 1); // Domain ID 2, skill id 5
      await metaColony.addDomain(1, UINT256_MAX, 1); // Domain ID 3, skill id 6
      await metaColony.addDomain(1, 2, 3); // Domain ID 4, skill id 7
      await metaColony.addGlobalSkill(); // Skill id 8
      await metaColony.addDomain(1, 1, 2); // Domain ID 5, skill id 9
      await metaColony.addDomain(1, 2, 3); // Domain ID 6, skill id 10

      // 1 -> 2 -> 5
      //   -> 3 -> 4
      //        -> 6

      const rootDomain = await metaColony.getDomain(1);
      const rootDomainSkill = await colonyNetwork.getSkill(rootDomain.skillId);
      expect(rootDomainSkill.nParents).to.be.zero;
      expect(rootDomainSkill.nChildren).to.eq.BN(6);
      const rootDomainSkillChildSkillId1 = await colonyNetwork.getChildSkillId(rootDomain.skillId, 0);
      expect(rootDomainSkillChildSkillId1).to.eq.BN(3);
      const rootDomainSkillChildSkillId2 = await colonyNetwork.getChildSkillId(rootDomain.skillId, 1);
      expect(rootDomainSkillChildSkillId2).to.eq.BN(5);
      const rootDomainSkillChildSkillId3 = await colonyNetwork.getChildSkillId(rootDomain.skillId, 2);
      expect(rootDomainSkillChildSkillId3).to.eq.BN(6);
      const rootDomainSkillChildSkillId4 = await colonyNetwork.getChildSkillId(rootDomain.skillId, 3);
      expect(rootDomainSkillChildSkillId4).to.eq.BN(7);
      const rootDomainSkillChildSkillId5 = await colonyNetwork.getChildSkillId(rootDomain.skillId, 4);
      expect(rootDomainSkillChildSkillId5).to.eq.BN(9);
      const rootDomainSkillChildSkillId6 = await colonyNetwork.getChildSkillId(rootDomain.skillId, 5);
      expect(rootDomainSkillChildSkillId6).to.eq.BN(10);

      let skillId = 5;
      const skill1 = await colonyNetwork.getSkill(skillId);
      expect(skill1.nParents).to.eq.BN(1);
      expect(skill1.nChildren).to.eq.BN(1);
      const skill1ParentSkillId1 = await colonyNetwork.getParentSkillId(skillId, 0);
      expect(skill1ParentSkillId1).to.eq.BN(1);
      const skill1ChildSkillId1 = await colonyNetwork.getChildSkillId(skillId, 0);
      expect(skill1ChildSkillId1).to.eq.BN(9);

      skillId = 6;
      const skill2 = await colonyNetwork.getSkill(skillId);
      expect(skill2.nParents).to.eq.BN(1);
      expect(skill2.nChildren).to.eq.BN(2);
      const skill2ParentSkillId1 = await colonyNetwork.getParentSkillId(skillId, 0);
      expect(skill2ParentSkillId1).to.eq.BN(1);
      const skill2ChildSkillId1 = await colonyNetwork.getChildSkillId(skillId, 0);
      expect(skill2ChildSkillId1).to.eq.BN(7);
      const skill2ChildSkillId2 = await colonyNetwork.getChildSkillId(skillId, 1);
      expect(skill2ChildSkillId2).to.eq.BN(10);

      skillId = 7;
      const skill3 = await colonyNetwork.getSkill(skillId);
      expect(skill3.nParents).to.eq.BN(2);
      expect(skill3.nChildren).to.be.zero;
      const skill3ParentSkillId1 = await colonyNetwork.getParentSkillId(skillId, 0);
      expect(skill3ParentSkillId1).to.eq.BN(6);
      const skill3ParentSkillId2 = await colonyNetwork.getParentSkillId(skillId, 1);
      expect(skill3ParentSkillId2).to.eq.BN(1);

      skillId = 3;
      const skill4 = await colonyNetwork.getSkill(skillId);
      expect(skill4.nParents).to.eq.BN(1);
      expect(skill4.nChildren).to.be.zero;
      const skill4ParentSkillId1 = await colonyNetwork.getParentSkillId(skillId, 0);
      expect(skill4ParentSkillId1).to.eq.BN(1);

      skillId = 9;
      const skill5 = await colonyNetwork.getSkill(skillId);
      expect(skill5.nParents).to.eq.BN(2);
      expect(skill5.nChildren).to.be.zero;
      const skill5ParentSkillId1 = await colonyNetwork.getParentSkillId(skillId, 0);
      expect(skill5ParentSkillId1).to.eq.BN(5);
      const skill5ParentSkillId2 = await colonyNetwork.getParentSkillId(skillId, 1);
      expect(skill5ParentSkillId2).to.eq.BN(1);

      skillId = 10;
      const skill6 = await colonyNetwork.getSkill(skillId);
      expect(skill6.nParents).to.eq.BN(2);
      expect(skill6.nChildren).to.be.zero;
      const skill6ParentSkillId1 = await colonyNetwork.getParentSkillId(skillId, 0);
      expect(skill6ParentSkillId1).to.eq.BN(6);
      const skill6ParentSkillId2 = await colonyNetwork.getParentSkillId(skillId, 1);
      expect(skill6ParentSkillId2).to.eq.BN(1);
    });

    it("should correctly ascend the skills tree to find parents", async () => {
      await metaColony.addDomain(1, UINT256_MAX, 1);
      await metaColony.addDomain(1, 1, 2);
      await metaColony.addDomain(1, 2, 3);
      await metaColony.addDomain(1, 3, 4);
      await metaColony.addDomain(1, 4, 5);
      await metaColony.addDomain(1, 5, 6);
      await metaColony.addDomain(1, 6, 7);
      await metaColony.addDomain(1, 7, 8);
      await metaColony.addDomain(1, 8, 9);

      // 1 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12 -> 13

      const skill = await colonyNetwork.getSkill(13);
      const numParents = skill.nParents;
      const numChildren = skill.nChildren;
      expect(numParents).to.eq.BN(9);
      expect(numChildren).to.be.zero;

      let parentId;
      parentId = await colonyNetwork.getParentSkillId(13, 0);
      expect(parentId).to.eq.BN(12);
      parentId = await colonyNetwork.getParentSkillId(13, 1);
      expect(parentId).to.eq.BN(11);
      parentId = await colonyNetwork.getParentSkillId(13, 2);
      expect(parentId).to.eq.BN(10);
      parentId = await colonyNetwork.getParentSkillId(13, 3);
      expect(parentId).to.eq.BN(9);
      parentId = await colonyNetwork.getParentSkillId(13, 4);
      expect(parentId).to.eq.BN(8);
      parentId = await colonyNetwork.getParentSkillId(13, 5);
      expect(parentId).to.eq.BN(7);
      parentId = await colonyNetwork.getParentSkillId(13, 6);
      expect(parentId).to.eq.BN(6);
      parentId = await colonyNetwork.getParentSkillId(13, 7);
      expect(parentId).to.eq.BN(5);
      parentId = await colonyNetwork.getParentSkillId(13, 8);
      expect(parentId).to.eq.BN(1);

      // Higher indices return 0
      parentId = await colonyNetwork.getParentSkillId(13, 10);
      expect(parentId).to.be.zero;
      parentId = await colonyNetwork.getParentSkillId(13, 11);
      expect(parentId).to.be.zero;
      parentId = await colonyNetwork.getParentSkillId(13, 100);
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
      // Edit that slot to a made-up skillId
      await metaColony.setStorageSlotRecovery(domain1Slot, "0xdeadbeef");
      // Leave recovery mode
      await metaColony.approveExitRecovery();
      await metaColony.exitRecoveryMode();
      // Try to add a child
      await checkErrorRevert(metaColony.addDomain(1, UINT256_MAX, 1), "colony-invalid-skill-id");
    });
  });

  describe("when adding domains in the meta colony", () => {
    it("should be able to add new domains as children to the root domain", async () => {
      await metaColony.addDomain(1, UINT256_MAX, 1);
      const newDomainId = await metaColony.getDomainCount();

      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(5);
      const domainCount = await metaColony.getDomainCount();
      expect(domainCount).to.eq.BN(2);

      const newDomain = await metaColony.getDomain(newDomainId);
      expect(newDomain.skillId).to.eq.BN(5);
      expect(newDomain.fundingPotId).to.eq.BN(2);

      // Check root local skill.nChildren is now 2
      // One special mining skill, and the skill associated with the domain we just added
      const rootDomain = await metaColony.getDomain(1);
      const rootDomainSkill = await colonyNetwork.getSkill(rootDomain.skillId);
      expect(rootDomainSkill.nChildren).to.eq.BN(2);

      // Check root local skill.children second element is the id of the new skill
      const rootDomainSkillChild = await colonyNetwork.getChildSkillId(1, 1);
      expect(rootDomainSkillChild).to.eq.BN(5);
    });

    it("should NOT be able to add a child domain more than one level away from the root domain", async () => {
      await metaColony.addDomain(1, UINT256_MAX, 1);

      // In position 1 because the mining skill occupies position 0
      await checkErrorRevert(metaColony.addDomain(1, 1, 2), "colony-parent-domain-not-root");

      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(5);
      const domainCount = await metaColony.getDomainCount();
      expect(domainCount).to.eq.BN(2);
    });
  });

  describe("when adding domains in a regular colony", () => {
    beforeEach(async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
    });

    it("someone who does not have root role should not be able to add domains", async () => {
      await checkErrorRevert(colony.addDomain(1, UINT256_MAX, 1, { from: OTHER_ACCOUNT }), "ds-auth-unauthorized");
    });

    it("should be able to add new domains as children to the root domain", async () => {
      await colony.addDomain(1, UINT256_MAX, 1);
      await colony.addDomain(1, UINT256_MAX, 1);
      await colony.addDomain(1, UINT256_MAX, 1);

      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(9);
      const domainCount = await colony.getDomainCount();
      expect(domainCount).to.eq.BN(4);

      const rootDomain = await colony.getDomain(1);
      expect(rootDomain.skillId).to.eq.BN(5);
      expect(rootDomain.fundingPotId).to.eq.BN(1);

      const newDomain2 = await colony.getDomain(2);
      expect(newDomain2.skillId).to.eq.BN(7);
      expect(newDomain2.fundingPotId).to.eq.BN(2);

      const newDomain3 = await colony.getDomain(3);
      expect(newDomain3.skillId).to.eq.BN(8);
      expect(newDomain3.fundingPotId).to.eq.BN(3);

      // Check root domain skill.nChildren is now 3
      const rootLocalSkill = await colonyNetwork.getSkill(rootDomain.skillId);
      expect(rootLocalSkill.nChildren).to.eq.BN(3);

      // Check root local skill.children are the ids of the new skills
      const rootSkillChild1 = await colonyNetwork.getChildSkillId(rootDomain.skillId, 0);
      expect(rootSkillChild1).to.eq.BN(7);
      const rootSkillChild2 = await colonyNetwork.getChildSkillId(rootDomain.skillId, 1);
      expect(rootSkillChild2).to.eq.BN(8);
      const rootSkillChild3 = await colonyNetwork.getChildSkillId(rootDomain.skillId, 2);
      expect(rootSkillChild3).to.eq.BN(9);
    });

    it("should NOT be able to add a new skill by anyone but a Colony", async () => {
      await checkErrorRevert(colonyNetwork.addSkill(2), "colony-caller-must-be-colony");

      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(6);
    });

    it("should NOT be able to add a new domain skill by anyone but a Colony", async () => {
      const skillCountBefore = await colonyNetwork.getSkillCount();
      const rootDomain = await colony.getDomain(1);
      const rootDomainSkillId = rootDomain.skillId;

      await checkErrorRevert(colonyNetwork.addSkill(rootDomainSkillId), "colony-caller-must-be-colony");

      const skillCountAfter = await colonyNetwork.getSkillCount();
      expect(skillCountBefore).to.eq.BN(skillCountAfter);
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
      expect(skill.deprecated).to.be.false;
    });

    it("cannot create global skills if not a root user in meta colony", async () => {
      await checkErrorRevert(metaColony.addGlobalSkill({ from: OTHER_ACCOUNT }), "ds-auth-unauthorized");
    });

    it("can deprecate global skills", async () => {
      await metaColony.addGlobalSkill();
      const skillId = await colonyNetwork.getSkillCount();

      let skill = await colonyNetwork.getSkill(skillId);
      expect(skill.deprecated).to.be.false;

      await metaColony.deprecateGlobalSkill(skillId);

      skill = await colonyNetwork.getSkill(skillId);
      expect(skill.deprecated).to.be.true;
    });
  });

  describe("when getting a skill", () => {
    it("should return a true flag if the skill is global", async () => {
      const globalSkill = await colonyNetwork.getSkill(GLOBAL_SKILL_ID);

      expect(globalSkill.globalSkill).to.be.true;
    });

    it("should return a false flag if the skill is a domain or local skill", async () => {
      const domainSkill = await colonyNetwork.getSkill(3);

      expect(domainSkill.globalSkill).to.be.false;
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

  describe("when managing the payout whitelist", () => {
    it("should allow a meta colony root user to update the whitelist", async () => {
      let status = await colonyNetwork.getPayoutWhitelist(clnyToken.address);
      expect(status).to.be.false;

      await metaColony.setPayoutWhitelist(clnyToken.address, true);

      status = await colonyNetwork.getPayoutWhitelist(clnyToken.address);
      expect(status).to.be.true;
    });

    it("should not allow anyone else but a meta colony root user to update the whitelist", async () => {
      await checkErrorRevert(metaColony.setPayoutWhitelist(clnyToken.address, true, { from: accounts[1] }), "ds-auth-unauthorized");
    });

    it("should not allow another account, than the meta colony, to update the whitelist", async () => {
      await checkErrorRevert(colonyNetwork.setPayoutWhitelist(clnyToken.address, true), "colony-caller-must-be-meta-colony");
    });
  });

  describe("when minting tokens for the Network", () => {
    it("should NOT allow anyone but the Network to call mintTokensForColonyNetwork", async () => {
      await checkErrorRevert(metaColony.mintTokensForColonyNetwork(100), "colony-access-denied-only-network-allowed");
    });
  });

  describe("when setting the per-cycle miner reward", () => {
    it("should allow the reward to be set", async () => {
      const rewardBefore = await colonyNetwork.getReputationMiningCycleReward();
      expect(rewardBefore).to.be.zero;
      await metaColony.setReputationMiningCycleReward(WAD);
      const rewardAfter = await colonyNetwork.getReputationMiningCycleReward();
      expect(rewardAfter).to.eq.BN(WAD);
    });

    it("setting the reward should be a permissioned function", async () => {
      await checkErrorRevert(metaColony.setReputationMiningCycleReward(0, { from: OTHER_ACCOUNT }), "ds-auth-unauthorized");
    });

    it("a non-meta colony should not be able to set the reward", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      const colonyAsMetaColony = await IMetaColony.at(colony.address);
      await checkErrorRevert(colonyAsMetaColony.setReputationMiningCycleReward(0), "colony-caller-must-be-meta-colony");
    });

    // Checking that the rewards are paid out is done in tests in root-hash-submissions.js
  });
});
