/* global artifacts */
import chai from "chai";
import bnChai from "bn-chai";

import { WAD, INITIAL_FUNDING, SPECIFICATION_HASH } from "../helpers/constants";
import { fundColonyWithTokens, makeTask, setupRandomColony } from "../helpers/test-data-generator";
import { checkErrorRevert } from "../helpers/test-helper";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");

contract("ColonyTask", accounts => {
  const FOUNDER = accounts[0];
  const USER1 = accounts[1];
  const USER2 = accounts[2];

  let colonyNetwork;
  let colony;
  let token;

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
  });

  describe("when managing domain-level permissions", () => {
    it("should give colony creator all permissions in root domain", async () => {
      // Roles 0-2 are the existing Founder, Admin, and Recovery roles
      const fundingRole = await colony.hasUserRole(FOUNDER, 1, 3);
      const administrationRole = await colony.hasUserRole(FOUNDER, 1, 4);
      // const arbitrationRole = await colony.hasUserRole(FOUNDER, 1, 5); Not implemented yet.
      const architectureRole = await colony.hasUserRole(FOUNDER, 1, 6);
      const architectureSubdomainRole = await colony.hasUserRole(FOUNDER, 1, 7);
      const rootRole = await colony.hasUserRole(FOUNDER, 1, 8);

      expect(fundingRole).to.be.true;
      expect(administrationRole).to.be.true;
      expect(architectureRole).to.be.true;
      expect(architectureSubdomainRole).to.be.true;
      expect(rootRole).to.be.true;
    });

    it("should allow users with funding permission manipulate funds in their domains only", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

      // Founder can move funds from domain 1 to domain 2.
      await colony.moveFundsBetweenPots(1, 0, 0, 1, 2, WAD, token.address);

      // User1 can only move funds from domain 2 into domain 2 task.
      await colony.setFundingRole(1, 0, USER1, 2);

      await checkErrorRevert(colony.moveFundsBetweenPots(1, 0, 0, 1, 2, WAD, token.address, { from: USER1 }), "ds-auth-unauthorized");

      const taskId = await makeTask({ colony, domainId: 2 });
      const task = await colony.getTask(taskId);
      await colony.moveFundsBetweenPots(2, 0, 0, 2, task.fundingPotId, WAD, token.address, { from: USER1 });
    });

    it("should allow users with administration permission manipulate tasks/payments in their domains only", async () => {
      // Founder can create tasks in domain 1, 2, 3.
      await colony.makeTask(1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: FOUNDER });
      await colony.makeTask(1, 0, SPECIFICATION_HASH, 2, 0, 0, { from: FOUNDER });
      await colony.makeTask(1, 1, SPECIFICATION_HASH, 3, 0, 0, { from: FOUNDER });

      // User1 can only create tasks in domain 2.
      await colony.setAdministrationRole(1, 0, USER1, 2);

      await checkErrorRevert(colony.makeTask(1, 0, SPECIFICATION_HASH, 1, 0, 0, { from: USER1 }), "ds-auth-unauthorized");

      await colony.makeTask(2, 0, SPECIFICATION_HASH, 2, 0, 0, { from: USER1 });
    });

    it("should allow users with architecture permission manipulate the structure of their subdomains only", async () => {
      // User1 can manipulate domain 2 subdomains only
      await colony.setArchitectureRole(1, 0, USER1, 2);

      await checkErrorRevert(colony.addDomain(1, 0, 1, { from: USER1 }), "ds-auth-unauthorized");

      // Note: cannot add subdomains currently, this is just checking that the auth passed.
      await checkErrorRevert(colony.addDomain(2, 0, 2, { from: USER1 }), "colony-parent-domain-not-root");

      // Now User1 can manipulate domain 1 subdomains
      await colony.setArchitectureRole(1, 0, USER1, 1);

      // Create subdomain...
      await colony.addDomain(1, 0, 1, { from: USER1 });

      // Manipulate permission in subdomain...
      await colony.setFundingRole(1, 0, USER2, 2, { from: USER1 });
      await colony.setAdministrationRole(1, 0, USER2, 2, { from: USER1 });
      await colony.setArchitectureRole(1, 0, USER2, 2, { from: USER1 });

      // But not permissions in the domain itself!
      await checkErrorRevert(colony.setAdministrationRole(1, 0, USER2, 1, { from: USER1 }), "ds-auth-only-authorized-in-child-domain");

      // Not without root!
      await colony.setRootRole(USER1);
      await colony.setAdministrationRole(1, 0, USER2, 1, { from: USER1 });
    });

    it("should allow users with root permission manipulate root domain permissions and colony-wide parameters", async () => {
      await colony.setRootRole(USER1);

      // Can create manage permissions in the root domain!
      await colony.setFundingRole(1, 0, USER2, 1, { from: USER1 });
      await colony.setAdministrationRole(1, 0, USER2, 1, { from: USER1 });
      await colony.setArchitectureRole(1, 0, USER2, 1, { from: USER1 });
      await colony.setRootRole(USER2, { from: USER1 });

      // // And child domains!
      await colony.setAdministrationRole(1, 0, USER2, 1, { from: USER1 });
      await colony.setAdministrationRole(1, 1, USER2, 3, { from: USER1 });
    });
  });
});
