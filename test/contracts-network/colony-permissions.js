/* global artifacts */
import chai from "chai";
import bnChai from "bn-chai";

import {
  WAD,
  ROOT_ROLE,
  ARCHITECTURE_ROLE,
  ARCHITECTURE_SUBDOMAIN_ROLE,
  FUNDING_ROLE,
  ADMINISTRATION_ROLE,
  ARBITRATION_ROLE,
  INITIAL_FUNDING,
  SPECIFICATION_HASH
} from "../../helpers/constants";

import { fundColonyWithTokens, makeTask, setupRandomColony } from "../../helpers/test-data-generator";
import { checkErrorRevert } from "../../helpers/test-helper";
import { executeSignedRoleAssignment } from "../../helpers/task-review-signing";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");

contract("ColonyPermissions", accounts => {
  const FOUNDER = accounts[0];
  const USER1 = accounts[1];
  const USER2 = accounts[2];

  let colonyNetwork;
  let colony;
  let token;
  let hasRole;

  let domain1;
  let domain2;
  let domain3;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.setRewardInverse(100);

    // Add subdomains 2 and 3
    await colony.addDomain(1, 0, 1);
    await colony.addDomain(1, 0, 1);
    domain1 = await colony.getDomain(1);
    domain2 = await colony.getDomain(2);
    domain3 = await colony.getDomain(3);
  });

  describe("when managing domain-level permissions", () => {
    it("should give colony creator all permissions in root domain", async () => {
      const fundingRole = await colony.hasUserRole(FOUNDER, 1, FUNDING_ROLE);
      const administrationRole = await colony.hasUserRole(FOUNDER, 1, ADMINISTRATION_ROLE);
      const arbitrationRole = await colony.hasUserRole(FOUNDER, 1, ARBITRATION_ROLE);
      const architectureRole = await colony.hasUserRole(FOUNDER, 1, ARCHITECTURE_ROLE);
      const architectureSubdomainRole = await colony.hasUserRole(FOUNDER, 1, ARCHITECTURE_SUBDOMAIN_ROLE);
      const rootRole = await colony.hasUserRole(FOUNDER, 1, ROOT_ROLE);

      expect(fundingRole).to.be.true;
      expect(administrationRole).to.be.true;
      expect(arbitrationRole).to.be.true;
      expect(architectureRole).to.be.true;
      expect(architectureSubdomainRole).to.be.true;
      expect(rootRole).to.be.true;
    });

    it("should allow users with funding permission manipulate funds in their domains only", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

      // Founder can move funds from domain 1 to domain 2.
      await colony.moveFundsBetweenPots(1, 0, 0, domain1.fundingPotId, domain2.fundingPotId, WAD, token.address);

      // User1 can only move funds from domain 2 into domain 2 task.
      await colony.setFundingRole(1, 0, USER1, 2, true);
      hasRole = await colony.hasUserRole(USER1, 2, FUNDING_ROLE);
      expect(hasRole).to.be.true;

      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, 0, 0, domain1.fundingPotId, domain2.fundingPotId, WAD, token.address, { from: USER1 }),
        "ds-auth-unauthorized"
      );

      const taskId = await makeTask({ colonyNetwork, colony, domainId: 2 });
      const task = await colony.getTask(taskId);
      await colony.moveFundsBetweenPots(2, 0, 0, domain2.fundingPotId, task.fundingPotId, WAD, token.address, { from: USER1 });
    });

    it("should allow users with administration permission manipulate tasks/payments in their domains only", async () => {
      // Founder can create tasks in domain 1, 2, 3.
      await colony.makeTask(1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: FOUNDER });
      await colony.makeTask(1, 0, SPECIFICATION_HASH, 2, 0, 0, { from: FOUNDER });
      await colony.makeTask(1, 1, SPECIFICATION_HASH, 3, 0, 0, { from: FOUNDER });

      // User1 can only create tasks in domain 2.
      await colony.setAdministrationRole(1, 0, USER1, 2, true);
      hasRole = await colony.hasUserRole(USER1, 2, ADMINISTRATION_ROLE);
      expect(hasRole).to.be.true;

      await checkErrorRevert(colony.makeTask(1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: USER1 }), "ds-auth-unauthorized");

      const { logs } = await colony.makeTask(2, 0, SPECIFICATION_HASH, 2, 0, 0, { from: USER1 });
      const { taskId } = logs.filter(log => log.event === "TaskAdded")[0].args;

      // User1 can transfer manager role to User2 only if User2 also has administration privileges.
      hasRole = await colony.hasUserRole(USER2, 2, ADMINISTRATION_ROLE);
      expect(hasRole).to.be.false;

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskManagerRole",
          signers: [USER1, USER2],
          sigTypes: [0, 0],
          args: [taskId, USER2, 2, 0]
        }),
        "colony-task-role-assignment-execution-failed"
      );

      await colony.setAdministrationRole(1, 0, USER2, 2, true);
      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskManagerRole",
        signers: [USER1, USER2],
        sigTypes: [0, 0],
        args: [taskId, USER2, 2, 0]
      });

      // And then User2 can transfer over to Founder (permission in parent domain)
      // But not with a bad proof!
      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskManagerRole",
          signers: [USER2, FOUNDER],
          sigTypes: [0, 0],
          args: [taskId, FOUNDER, 1, 1]
        }),
        "colony-task-role-assignment-execution-failed"
      );

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskManagerRole",
        signers: [USER2, FOUNDER],
        sigTypes: [0, 0],
        args: [taskId, FOUNDER, 1, 0]
      });
    });

    it("should allow users with architecture permission manipulate the structure of their subdomains only", async () => {
      // User1 can manipulate domain 2 subdomains only
      await colony.setArchitectureRole(1, 0, USER1, 2, true);
      hasRole = await colony.hasUserRole(USER1, 2, ARCHITECTURE_ROLE);
      expect(hasRole).to.be.true;

      await checkErrorRevert(colony.addDomain(1, 0, 1, { from: USER1 }), "ds-auth-unauthorized");

      // Note: cannot add subdomains currently, this is just checking that the auth passed.
      await checkErrorRevert(colony.addDomain(2, 0, 2, { from: USER1 }), "colony-parent-domain-not-root");

      // Now User1 can manipulate domain 1 subdomains
      await colony.setArchitectureRole(1, 0, USER1, 1, true);
      hasRole = await colony.hasUserRole(USER1, 1, ARCHITECTURE_ROLE);
      expect(hasRole).to.be.true;

      // Create subdomain...
      await colony.addDomain(1, 0, 1, { from: USER1 });

      // Manipulate permission in subdomain...
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
      hasRole = await colony.hasUserRole(USER2, 2, ARCHITECTURE_SUBDOMAIN_ROLE);
      expect(hasRole).to.be.true;

      await colony.setArchitectureRole(1, 0, USER2, 2, false, { from: USER1 });
      hasRole = await colony.hasUserRole(USER2, 2, ARCHITECTURE_ROLE);
      expect(hasRole).to.be.false;
      hasRole = await colony.hasUserRole(USER2, 2, ARCHITECTURE_SUBDOMAIN_ROLE);
      expect(hasRole).to.be.false;

      // But not permissions in the domain itself!
      await checkErrorRevert(colony.setAdministrationRole(1, 0, USER2, 1, true, { from: USER1 }), "ds-auth-only-authorized-in-child-domain");

      // Not without root!
      await colony.setRootRole(USER1, true);
      hasRole = await colony.hasUserRole(USER1, 1, ROOT_ROLE);
      expect(hasRole).to.be.true;

      await colony.setAdministrationRole(1, 0, USER2, 1, true, { from: USER1 });
    });

    it("should allow users with root permission manipulate root domain permissions and colony-wide parameters", async () => {
      await colony.setRootRole(USER1, true);
      hasRole = await colony.hasUserRole(USER1, 1, ROOT_ROLE);
      expect(hasRole).to.be.true;

      // Can create manage permissions in the root domain!
      await colony.setFundingRole(1, 0, USER2, 1, true, { from: USER1 });
      await colony.setArbitrationRole(1, 0, USER2, 1, true, { from: USER1 });
      await colony.setAdministrationRole(1, 0, USER2, 1, true, { from: USER1 });
      await colony.setArchitectureRole(1, 0, USER2, 1, true, { from: USER1 });
      await colony.setRootRole(USER2, true, { from: USER1 });

      // // And child domains!
      await colony.setAdministrationRole(1, 0, USER2, 2, true, { from: USER1 });
      await colony.setAdministrationRole(1, 1, USER2, 3, true, { from: USER1 });
    });

    it("should allow permissions to propagate to subdomains", async () => {
      // Give User 2 funding permissions in domain 1
      await colony.setFundingRole(1, 0, USER2, 1, true);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      // Test we can move funds between domain 1 and 2, and also 2 and 3
      await colony.moveFundsBetweenPots(1, 0, 0, domain1.fundingPotId, domain2.fundingPotId, WAD, token.address, { from: USER2 });
      await colony.moveFundsBetweenPots(1, 0, 1, domain2.fundingPotId, domain3.fundingPotId, WAD, token.address, { from: USER2 });

      // But only with valid proofs
      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, 1, 1, domain2.fundingPotId, domain3.fundingPotId, WAD, token.address, { from: USER2 }),
        "ds-auth-invalid-domain-inheritence"
      );
      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, 0, 0, domain2.fundingPotId, domain3.fundingPotId, WAD, token.address, { from: USER2 }),
        "ds-auth-invalid-domain-inheritence"
      );
    });

    it("should not allow operations on nonexistent domains", async () => {
      // Can make a task in an existing domain
      await colony.makeTask(1, 0, SPECIFICATION_HASH, 1, 0, 0);

      // But can't give a bad permission domain
      await checkErrorRevert(colony.makeTask(10, 0, SPECIFICATION_HASH, 1, 0, 0), "ds-auth-permission-domain-does-not-exist");

      // Nor a bad child domain
      await checkErrorRevert(colony.makeTask(1, 0, SPECIFICATION_HASH, 10, 0, 0), "ds-auth-child-domain-does-not-exist");
    });

    it("should not allow users to pass a too-large child skill index", async () => {
      await checkErrorRevert(colony.makeTask(1, 100, SPECIFICATION_HASH, 2, 0, 0), "colony-network-out-of-range-child-skill-index");
    });
  });
});
