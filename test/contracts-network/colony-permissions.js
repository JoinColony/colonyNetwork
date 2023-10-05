/* global artifacts */
const BN = require("bn.js");
const chai = require("chai");
const bnChai = require("bn-chai");
const ethers = require("ethers");

const {
  UINT256_MAX,
  INT256_MIN,
  INT256_MAX,
  INT128_MAX,
  INT128_MIN,
  WAD,
  ROOT_ROLE,
  ARBITRATION_ROLE,
  ARCHITECTURE_ROLE,
  FUNDING_ROLE,
  ADMINISTRATION_ROLE,
  INITIAL_FUNDING,
  ADDRESS_ZERO,
  HASHZERO,
  SECONDS_PER_DAY,
} = require("../../helpers/constants");

const { fundColonyWithTokens, makeExpenditure, setupRandomColony } = require("../../helpers/test-data-generator");
const { checkErrorRevert, expectEvent, bn2bytes32 } = require("../../helpers/test-helper");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const ColonyAuthority = artifacts.require("ColonyAuthority");

contract("ColonyPermissions", (accounts) => {
  const FOUNDER = accounts[0];
  const USER1 = accounts[1];
  const USER2 = accounts[2];

  let colonyNetwork;
  let colony;
  let token;
  let localSkillId;
  let hasRole;

  let domain1;
  let domain2;
  let domain3;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    ({ colony, token, localSkillId } = await setupRandomColony(colonyNetwork));
    await colony.setRewardInverse(100);

    // Add subdomains 2 and 3
    await colony.addDomain(1, UINT256_MAX, 1);
    await colony.addDomain(1, UINT256_MAX, 1);
    domain1 = await colony.getDomain(1);
    domain2 = await colony.getDomain(2);
    domain3 = await colony.getDomain(3);
  });

  describe("when managing domain-level permissions", () => {
    it("should give colony creator all permissions in root domain", async () => {
      const rootRole = await colony.hasUserRole(FOUNDER, 1, ROOT_ROLE);
      const arbitrationRole = await colony.hasUserRole(FOUNDER, 1, ARBITRATION_ROLE);
      const architectureRole = await colony.hasUserRole(FOUNDER, 1, ARCHITECTURE_ROLE);
      const fundingRole = await colony.hasUserRole(FOUNDER, 1, FUNDING_ROLE);
      const administrationRole = await colony.hasUserRole(FOUNDER, 1, ADMINISTRATION_ROLE);

      expect(rootRole).to.be.true;
      expect(arbitrationRole).to.be.true;
      expect(architectureRole).to.be.true;
      expect(fundingRole).to.be.true;
      expect(administrationRole).to.be.true;
    });

    it("should let users query for roles in domain and subdomains", async () => {
      let administrationRole = await colony.hasUserRole(FOUNDER, 1, ADMINISTRATION_ROLE);
      expect(administrationRole).to.be.true;
      administrationRole = await colony.hasInheritedUserRole(FOUNDER, 1, ADMINISTRATION_ROLE, UINT256_MAX, 1);
      expect(administrationRole).to.be.true;
      administrationRole = await colony.hasInheritedUserRole(FOUNDER, 1, ADMINISTRATION_ROLE, 0, 2);
      expect(administrationRole).to.be.true;
      administrationRole = await colony.hasInheritedUserRole(FOUNDER, 1, ADMINISTRATION_ROLE, 1, 3);
      expect(administrationRole).to.be.true;

      administrationRole = await colony.hasUserRole(USER1, 1, ADMINISTRATION_ROLE);
      expect(administrationRole).to.be.false;
      administrationRole = await colony.hasInheritedUserRole(USER1, 1, ADMINISTRATION_ROLE, UINT256_MAX, 1);
      expect(administrationRole).to.be.false;
      administrationRole = await colony.hasInheritedUserRole(USER1, 1, ADMINISTRATION_ROLE, 0, 2);
      expect(administrationRole).to.be.false;
      administrationRole = await colony.hasInheritedUserRole(USER1, 1, ADMINISTRATION_ROLE, 1, 3);
      expect(administrationRole).to.be.false;
    });

    it("should let users query for role-setting permissions in domains", async () => {
      await colony.setArchitectureRole(1, UINT256_MAX, USER1, 1, true);
      await colony.setArchitectureRole(1, 0, USER2, 2, true);

      const founderDomain1 = await colony.userCanSetRoles(FOUNDER, 1, 0, 1);
      const founderDomain2 = await colony.userCanSetRoles(FOUNDER, 1, 0, 2);
      const user1Domain1 = await colony.userCanSetRoles(USER1, 1, 0, 1);
      const user1Domain2 = await colony.userCanSetRoles(USER1, 1, 0, 2);
      const user2Domain2 = await colony.userCanSetRoles(USER2, 2, 0, 2);

      expect(founderDomain1).to.be.true;
      expect(founderDomain2).to.be.true;
      expect(user1Domain1).to.be.false;
      expect(user1Domain2).to.be.true;
      expect(user2Domain2).to.be.false;
    });

    it("should allow users with funding permission manipulate funds in their domains only", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

      // Founder can move funds from domain 1 to domain 2.
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, 0, domain1.fundingPotId, domain2.fundingPotId, WAD, token.address);

      // User1 can only move funds from domain 2 into domain 2 expenditure.
      await colony.setFundingRole(1, 0, USER1, 2, true);
      hasRole = await colony.hasUserRole(USER1, 2, FUNDING_ROLE);
      expect(hasRole).to.be.true;

      await checkErrorRevert(
        colony.methods["moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address)"](
          1,
          UINT256_MAX,
          1,
          UINT256_MAX,
          0,
          domain1.fundingPotId,
          domain2.fundingPotId,
          WAD,
          token.address,
          { from: USER1 },
        ),
        "ds-auth-unauthorized",
      );

      const expenditureId = await makeExpenditure({ colonyNetwork, colony, domainId: 2 });
      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.methods["moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address)"](
        2,
        UINT256_MAX,
        2,
        UINT256_MAX,
        UINT256_MAX,
        domain2.fundingPotId,
        expenditure.fundingPotId,
        WAD,
        token.address,
        { from: USER1 },
      );
    });

    it("should allow users with administration permission create expenditures in their domains only", async () => {
      // Founder can create expenditures in domain 1, 2, 3.
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: FOUNDER });
      await colony.makeExpenditure(1, 0, 2, { from: FOUNDER });
      await colony.makeExpenditure(1, 1, 3, { from: FOUNDER });

      // User1 can only create expenditures in domain 2.
      await colony.setAdministrationRole(1, 0, USER1, 2, true);
      hasRole = await colony.hasUserRole(USER1, 2, ADMINISTRATION_ROLE);
      expect(hasRole).to.be.true;

      await checkErrorRevert(colony.makeExpenditure(1, UINT256_MAX, 1, { from: USER1 }), "ds-auth-unauthorized");
      await colony.makeExpenditure(2, UINT256_MAX, 2, { from: USER1 });
    });

    it("should allow users with arbitration permission manipulate expenditures in their domains only", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: FOUNDER });
      const expenditureId1 = await colony.getExpenditureCount();
      await colony.makeExpenditure(1, 0, 2, { from: FOUNDER });
      const expenditureId2 = await colony.getExpenditureCount();

      await colony.setArbitrationRole(1, 0, USER1, 2, true);
      hasRole = await colony.hasUserRole(USER1, 2, ARBITRATION_ROLE);
      expect(hasRole).to.be.true;

      // Set globalClaimDelay
      const EXPENDITURES_SLOT = 25;
      const ARRAY = true;
      const day32 = bn2bytes32(new BN(SECONDS_PER_DAY));

      await checkErrorRevert(
        colony.setExpenditureState(1, UINT256_MAX, expenditureId1, EXPENDITURES_SLOT, [ARRAY], [bn2bytes32(new BN(4))], day32, { from: USER1 }),
        "ds-auth-unauthorized",
      );
      await colony.setExpenditureState(2, UINT256_MAX, expenditureId2, EXPENDITURES_SLOT, [ARRAY], [bn2bytes32(new BN(4))], day32, { from: USER1 });
    });

    it("should allow users with architecture permission manipulate the structure of their subdomains only", async () => {
      // User1 can manipulate domain 2 subdomains only
      await colony.setArchitectureRole(1, 0, USER1, 2, true);
      hasRole = await colony.hasUserRole(USER1, 2, ARCHITECTURE_ROLE);
      expect(hasRole).to.be.true;

      await checkErrorRevert(colony.addDomain(1, UINT256_MAX, 1, { from: USER1 }), "ds-auth-unauthorized");

      // Note: cannot add subdomains currently, this is just checking that the auth passed.
      await checkErrorRevert(colony.addDomain(2, UINT256_MAX, 2, { from: USER1 }), "colony-parent-domain-not-root");

      // Now User1 can manipulate domain 1 subdomains
      await colony.setArchitectureRole(1, UINT256_MAX, USER1, 1, true);
      hasRole = await colony.hasUserRole(USER1, 1, ARCHITECTURE_ROLE);
      expect(hasRole).to.be.true;

      // Create subdomain...
      await colony.addDomain(1, UINT256_MAX, 1, { from: USER1 });

      // Manipulate permission in subdomain...
      await colony.setArbitrationRole(1, 0, USER2, 2, true, { from: USER1 });
      hasRole = await colony.hasUserRole(USER2, 2, ARBITRATION_ROLE);
      expect(hasRole).to.be.true;

      await colony.setArbitrationRole(1, 0, USER2, 2, false, { from: USER1 });
      hasRole = await colony.hasUserRole(USER2, 2, ARBITRATION_ROLE);
      expect(hasRole).to.be.false;

      await colony.setFundingRole(1, 0, USER2, 2, true, { from: USER1 });
      hasRole = await colony.hasUserRole(USER2, 2, FUNDING_ROLE);
      expect(hasRole).to.be.true;

      await colony.setFundingRole(1, 0, USER2, 2, false, { from: USER1 });
      hasRole = await colony.hasUserRole(USER2, 2, FUNDING_ROLE);
      expect(hasRole).to.be.false;

      await colony.setAdministrationRole(1, 0, USER2, 2, true, { from: USER1 });
      hasRole = await colony.hasUserRole(USER2, 2, ADMINISTRATION_ROLE);
      expect(hasRole).to.be.true;

      await colony.setAdministrationRole(1, 0, USER2, 2, false, { from: USER1 });
      hasRole = await colony.hasUserRole(USER2, 2, ADMINISTRATION_ROLE);
      expect(hasRole).to.be.false;

      await colony.setArchitectureRole(1, 0, USER2, 2, true, { from: USER1 });
      hasRole = await colony.hasUserRole(USER2, 2, ARCHITECTURE_ROLE);
      expect(hasRole).to.be.true;

      await colony.setArchitectureRole(1, 0, USER2, 2, false, { from: USER1 });
      hasRole = await colony.hasUserRole(USER2, 2, ARCHITECTURE_ROLE);
      expect(hasRole).to.be.false;

      // But not permissions in the domain itself!
      await checkErrorRevert(
        colony.setAdministrationRole(1, UINT256_MAX, USER2, 1, true, { from: USER1 }),
        "ds-auth-only-authorized-in-child-domain",
      );

      // Not without root!
      await colony.setRootRole(USER1, true);
      hasRole = await colony.hasUserRole(USER1, 1, ROOT_ROLE);
      expect(hasRole).to.be.true;

      await colony.setAdministrationRole(1, UINT256_MAX, USER2, 1, true, { from: USER1 });
    });

    it("should not allow users without relevant permissions to set permissions", async () => {
      await await checkErrorRevert(colony.setRootRole(USER1, true, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(colony.setArbitrationRole(1, UINT256_MAX, USER2, 1, true, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(colony.setArchitectureRole(1, UINT256_MAX, USER2, 1, true, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(colony.setFundingRole(1, UINT256_MAX, USER2, 1, true, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(colony.setAdministrationRole(1, UINT256_MAX, USER2, 1, true, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(colony.setUserRoles(1, UINT256_MAX, USER2, 1, HASHZERO, { from: USER1 }), "ds-auth-unauthorized");

      // If you are allowed to set in a subdomain, not necessarily allowed to set in the domain you have permissions...
      await colony.setArchitectureRole(1, UINT256_MAX, USER1, 1, true);
      await checkErrorRevert(colony.setArbitrationRole(1, UINT256_MAX, USER2, 1, true, { from: USER1 }), "ds-auth-only-authorized-in-child-domain");
      await checkErrorRevert(colony.setArchitectureRole(1, UINT256_MAX, USER2, 1, true, { from: USER1 }), "ds-auth-only-authorized-in-child-domain");
      await checkErrorRevert(colony.setFundingRole(1, UINT256_MAX, USER2, 1, true, { from: USER1 }), "ds-auth-only-authorized-in-child-domain");
    });

    it("should not allow users without root permission to call root-restricted functions", async () => {
      await checkErrorRevert(colony.editColony("", { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(colony.editColonyByDelta("", { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(colony.mintTokensFor(ADDRESS_ZERO, 0, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(colony.updateColonyOrbitDB("", { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(colony.installExtension(HASHZERO, ADDRESS_ZERO, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(colony.addLocalSkill({ from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(colony.deprecateLocalSkill(0, true, { from: USER2 }), "ds-auth-unauthorized");
      await checkErrorRevert(colony.makeArbitraryTransactions([], [], true, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(colony.startNextRewardPayout(ADDRESS_ZERO, HASHZERO, HASHZERO, 0, [HASHZERO], { from: USER1 }), "ds-auth-unauthorized");
    });

    it("should allow users with root permission manipulate root domain permissions and colony-wide parameters", async () => {
      await colony.setRootRole(USER1, true);
      hasRole = await colony.hasUserRole(USER1, 1, ROOT_ROLE);
      expect(hasRole).to.be.true;

      // Can create manage permissions in the root domain!
      await colony.setRootRole(USER2, true, { from: USER1 });
      await colony.setArbitrationRole(1, UINT256_MAX, USER2, 1, true, { from: USER1 });
      await colony.setArchitectureRole(1, UINT256_MAX, USER2, 1, true, { from: USER1 });
      await colony.setFundingRole(1, UINT256_MAX, USER2, 1, true, { from: USER1 });
      await colony.setAdministrationRole(1, UINT256_MAX, USER2, 1, true, { from: USER1 });

      // And child domains!
      await colony.setAdministrationRole(1, 0, USER2, 2, true, { from: USER1 });
      await colony.setAdministrationRole(1, 1, USER2, 3, true, { from: USER1 });
    });

    it("should allow users with root permission to emit positive reputation rewards", async () => {
      // Domain rewards
      let tx = await colony.emitDomainReputationReward(3, USER2, 100, { from: FOUNDER });

      const domain = await colony.getDomain(3);
      await expectEvent(tx, "ArbitraryReputationUpdate", [FOUNDER, USER2, domain.skillId, 100]);

      await checkErrorRevert(colony.emitDomainReputationReward(3, USER2, -100, { from: FOUNDER }), "colony-reward-must-be-positive");
      await checkErrorRevert(colony.emitDomainReputationReward(0, USER2, 100, { from: FOUNDER }), "colony-domain-does-not-exist");
      await checkErrorRevert(colony.emitDomainReputationReward(3, USER2, 100, { from: USER1 }), "ds-auth-unauthorized");

      // Skill rewards
      tx = await colony.emitSkillReputationReward(localSkillId, USER2, 100, { from: FOUNDER });
      await expectEvent(tx, "ArbitraryReputationUpdate", [FOUNDER, USER2, localSkillId, 100]);

      await checkErrorRevert(colony.emitSkillReputationReward(0, USER2, 100, { from: FOUNDER }), "colony-not-valid-local-skill");
      await checkErrorRevert(colony.emitSkillReputationReward(localSkillId, USER2, -100, { from: FOUNDER }), "colony-reward-must-be-positive");
      await checkErrorRevert(colony.emitSkillReputationReward(localSkillId, USER2, 100, { from: USER1 }), "ds-auth-unauthorized");
    });

    it("should allow users with arbitration permission to emit negative reputation penalties", async () => {
      await colony.setArbitrationRole(1, UINT256_MAX, USER1, 1, true);
      await colony.setArbitrationRole(1, 0, USER2, 2, true);

      // Domain penalties
      let tx = await colony.emitDomainReputationPenalty(1, 1, 3, USER2, -100, { from: USER1 });

      const domain = await colony.getDomain(3);
      await expectEvent(tx, "ArbitraryReputationUpdate", [USER1, USER2, domain.skillId, -100]);

      await checkErrorRevert(colony.emitDomainReputationPenalty(1, 1, 3, USER2, 100, { from: USER1 }), "colony-penalty-cannot-be-positive");

      // Skill penalties (root domain only)
      tx = await colony.emitSkillReputationPenalty(localSkillId, USER2, -100, { from: USER1 });
      await expectEvent(tx, "ArbitraryReputationUpdate", [USER1, USER2, localSkillId, -100]);

      await checkErrorRevert(colony.emitSkillReputationPenalty(0, USER2, 100, { from: USER1 }), "colony-not-valid-local-skill");
      await checkErrorRevert(colony.emitSkillReputationPenalty(localSkillId, USER2, 100, { from: USER1 }), "colony-penalty-cannot-be-positive");
      await checkErrorRevert(colony.emitSkillReputationPenalty(localSkillId, USER2, -100, { from: USER2 }), "ds-auth-unauthorized");
    });

    it("reputation update log should respect caps on emitted rewards and penalties", async () => {
      await colony.emitDomainReputationReward(3, USER2, INT256_MAX, { from: FOUNDER });
      await colony.emitDomainReputationPenalty(1, 1, 3, USER2, INT256_MIN, { from: FOUNDER });

      const repCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
      const reputationMiningCycle = await IReputationMiningCycle.at(repCycleAddress);
      const nLogs = await reputationMiningCycle.getReputationUpdateLogLength();

      const lastLog = await reputationMiningCycle.getReputationUpdateLogEntry(nLogs.subn(1));
      const penultimateLog = await reputationMiningCycle.getReputationUpdateLogEntry(nLogs.subn(2));

      expect(penultimateLog.amount).to.eq.BN(INT128_MAX);
      expect(lastLog.amount).to.eq.BN(INT128_MIN);
    });

    it("should allow permissions to propagate to subdomains", async () => {
      // Give User 2 funding permissions in domain 1
      await colony.setFundingRole(1, UINT256_MAX, USER2, 1, true);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      // Test we can move funds between domain 1 and 2, and also 2 and 3
      // Deprecated version
      await colony.methods["moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,address)"](
        1,
        UINT256_MAX,
        0,
        domain1.fundingPotId,
        domain2.fundingPotId,
        WAD,
        token.address,
        {
          from: USER2,
        },
      );
      await colony.methods["moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,address)"](
        1,
        0,
        1,
        domain2.fundingPotId,
        domain3.fundingPotId,
        WAD,
        token.address,
        { from: USER2 },
      );

      // Newest version
      await colony.methods["moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address)"](
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        0,
        domain1.fundingPotId,
        domain2.fundingPotId,
        WAD,
        token.address,
        { from: USER2 },
      );

      await colony.methods["moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address)"](
        1,
        UINT256_MAX,
        1,
        0,
        1,
        domain2.fundingPotId,
        domain3.fundingPotId,
        WAD,
        token.address,
        { from: USER2 },
      );

      // But only with valid proofs. Deprecated version of this function
      await checkErrorRevert(
        colony.methods["moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,address)"](
          1,
          1,
          1,
          domain2.fundingPotId,
          domain3.fundingPotId,
          WAD,
          token.address,
          { from: USER2 },
        ),
        "ds-auth-invalid-domain-inheritance",
      );
      await checkErrorRevert(
        colony.methods["moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,address)"](
          1,
          0,
          0,
          domain2.fundingPotId,
          domain3.fundingPotId,
          WAD,
          token.address,
          { from: USER2 },
        ),
        "ds-auth-invalid-domain-inheritance",
      );

      // The newest version
      await checkErrorRevert(
        colony.methods["moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address)"](
          1,
          UINT256_MAX,
          1,
          1,
          1,
          domain2.fundingPotId,
          domain3.fundingPotId,
          WAD,
          token.address,
          { from: USER2 },
        ),
        "colony-invalid-domain-inheritance",
      );

      await checkErrorRevert(
        colony.methods["moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address)"](
          1,
          UINT256_MAX,
          1,
          0,
          0,
          domain2.fundingPotId,
          domain3.fundingPotId,
          WAD,
          token.address,
          { from: USER2 },
        ),
        "colony-invalid-domain-inheritance",
      );
    });

    it("should not allow operations on nonexistent domains", async () => {
      // Can make an expenditure in an existing domain
      await colony.makeExpenditure(1, UINT256_MAX, 1);

      // But can't give a bad permission domain
      await checkErrorRevert(colony.makeExpenditure(10, 0, 1), "ds-auth-permission-domain-does-not-exist");

      // Nor a bad child domain
      await checkErrorRevert(colony.makeExpenditure(1, 0, 10), "ds-auth-child-domain-does-not-exist");
    });

    it("should not allow users to pass a too-large child skill index", async () => {
      await checkErrorRevert(colony.makeExpenditure(1, 100, 2), "colony-network-out-of-range-child-skill-index");
    });

    it("should be able to get all user roles", async () => {
      const roleRecovery = ethers.BigNumber.from(2 ** 0).toHexString();
      const roleRoot = ethers.BigNumber.from(2 ** 1).toHexString();
      const roleArbitration = ethers.BigNumber.from(2 ** 2).toHexString();
      const roleArchitecture = ethers.BigNumber.from(2 ** 3).toHexString();
      const roleFunding = ethers.BigNumber.from(2 ** 5).toHexString();
      const roleAdministration = ethers.BigNumber.from(2 ** 6).toHexString();

      const roles1 = await colony.getUserRoles(FOUNDER, 1);
      const allRoles = roleRecovery | roleRoot | roleArbitration | roleArchitecture | roleFunding | roleAdministration; // eslint-disable-line no-bitwise
      expect(roles1).to.equal(ethers.utils.hexZeroPad(ethers.BigNumber.from(allRoles).toHexString(), 32));

      await colony.setAdministrationRole(1, 0, USER2, 2, true, { from: FOUNDER });
      const roles2 = await colony.getUserRoles(USER2, 2);
      expect(roles2).to.equal(ethers.utils.hexZeroPad(roleAdministration, 32));
    });

    it("should be able to set many roles at once", async () => {
      let recoveryRolesCount = await colony.numRecoveryRoles();
      expect(recoveryRolesCount).to.eq.BN(1);

      const roleRecovery = ethers.BigNumber.from(2 ** 0).toHexString();
      const roleRoot = ethers.BigNumber.from(2 ** 1).toHexString();
      const roleArbitration = ethers.BigNumber.from(2 ** 2).toHexString();
      const roleFunding = ethers.BigNumber.from(2 ** 5).toHexString();

      const rolesRoot = ethers.utils.hexZeroPad(ethers.BigNumber.from(roleRecovery | roleRoot | roleArbitration | roleFunding).toHexString(), 32); // eslint-disable-line no-bitwise
      const rolesArch = ethers.utils.hexZeroPad(ethers.BigNumber.from(roleArbitration | roleFunding).toHexString(), 32); // eslint-disable-line no-bitwise

      let userRoles;
      await colony.setArchitectureRole(1, UINT256_MAX, USER1, 1, true);
      // Root can set root roles
      await colony.setUserRoles(1, UINT256_MAX, USER2, 1, rolesRoot, { from: FOUNDER });
      userRoles = await colony.getUserRoles(USER2, 1);
      expect(userRoles).to.equal(rolesRoot);

      // And the recovery roles count is updated
      recoveryRolesCount = await colony.numRecoveryRoles();
      expect(recoveryRolesCount).to.eq.BN(2);

      // Setting the roles again doesn't increment the count of recovery roles
      await colony.setUserRoles(1, UINT256_MAX, USER2, 1, rolesRoot, { from: FOUNDER });
      recoveryRolesCount = await colony.numRecoveryRoles();
      expect(recoveryRolesCount).to.eq.BN(2);

      // But not in subdomains!
      await checkErrorRevert(colony.setUserRoles(1, 0, USER2, 2, rolesRoot, { from: FOUNDER }), "colony-bad-domain-for-role");

      // But can set arch roles in subdomains
      await colony.setUserRoles(1, 0, USER2, 2, rolesArch, { from: FOUNDER });
      userRoles = await colony.getUserRoles(USER2, 2);
      expect(userRoles).to.equal(rolesArch);

      // Arch cannot set root roles!
      await checkErrorRevert(colony.setUserRoles(1, UINT256_MAX, USER2, 1, rolesRoot, { from: USER1 }), "ds-auth-only-authorized-in-child-domain");

      // But can set arch roles in subdomains
      await colony.setUserRoles(1, 1, USER2, 3, rolesArch, { from: USER1 });
      userRoles = await colony.getUserRoles(USER2, 3);
      expect(userRoles).to.equal(rolesArch);

      // Events are only emitted for roles that change...
      let tx = await colony.setUserRoles(1, 1, USER2, 3, rolesArch, { from: USER1 });
      expect(tx.logs.length).to.equal(0);

      // Can also remove roles
      tx = await colony.setUserRoles(1, 1, USER2, 3, "0x0", { from: USER1 });

      expect(tx.logs.length).to.equal(2);

      expect(tx.logs[0].event).to.equal("ColonyRoleSet");
      expect(tx.logs[0].args.setTo).to.equal(false);
      expect(tx.logs[0].args.role.toNumber()).to.equal(ARBITRATION_ROLE);
      expect(tx.logs[0].args.user).to.equal(USER2);

      expect(tx.logs[1].event).to.equal("ColonyRoleSet");
      expect(tx.logs[1].args.setTo).to.equal(false);
      expect(tx.logs[1].args.role.toNumber()).to.equal(FUNDING_ROLE);
      expect(tx.logs[1].args.user).to.equal(USER2);

      userRoles = await colony.getUserRoles(USER2, 3);
      expect(userRoles).to.equal(ethers.constants.HashZero);

      // And the recovery roles count is updated when recovery is removed
      await colony.setUserRoles(1, UINT256_MAX, USER2, 1, "0x0", { from: FOUNDER });

      recoveryRolesCount = await colony.numRecoveryRoles();
      expect(recoveryRolesCount).to.eq.BN(1);

      // But not when they're 'removed' again
      await colony.setUserRoles(1, UINT256_MAX, USER2, 1, "0x0", { from: FOUNDER });

      recoveryRolesCount = await colony.numRecoveryRoles();
      expect(recoveryRolesCount).to.eq.BN(1);
    });

    it("should not allow a role to be set that doesn't exist", async () => {
      const nonexistentRole = ethers.BigNumber.from(2).pow(7).toHexString();
      await colony.setUserRoles(1, 0, USER2, 2, nonexistentRole, { from: FOUNDER });
      const userRoles = await colony.getUserRoles(USER2, 2);
      expect(userRoles).to.equal(ethers.constants.HashZero);
    });

    it("authority should not allow users who aren't permissioned to set roles", async () => {
      const authority = await ColonyAuthority.new(USER2);
      await checkErrorRevert(authority.setUserRole(ADDRESS_ZERO, 0, true, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(
        authority.methods["setUserRole(address,uint256,uint8,bool)"](ADDRESS_ZERO, 0, 0, true, { from: USER1 }),
        "ds-auth-unauthorized",
      );
    });
  });
});
