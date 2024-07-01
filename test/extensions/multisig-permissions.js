/* globals artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");
const { soliditySha3 } = require("web3-utils");

const {
  UINT256_MAX,
  WAD,
  ROOT_ROLE,
  ARBITRATION_ROLE,
  ARCHITECTURE_ROLE,
  FUNDING_ROLE,
  ADMINISTRATION_ROLE,
  INITIAL_FUNDING,
  SECONDS_PER_DAY,
  ADDRESS_ZERO,
} = require("../../helpers/constants");

const {
  checkErrorRevert,
  web3GetCode,
  encodeTxData,
  expectEvent,
  forwardTime,
  rolesToBytes32,
  makeTxAtTimestamp,
} = require("../../helpers/test-helper");

const { setupRandomColony, fundColonyWithTokens } = require("../../helpers/test-data-generator");

const NONE = 0;
const APPROVAL = 1;
const REJECTION = 2;

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const EtherRouter = artifacts.require("EtherRouter");
const MultisigPermissions = artifacts.require("MultisigPermissions");
const OneTxPayment = artifacts.require("OneTxPayment");

const MULTISIG_PERMISSIONS = soliditySha3("MultisigPermissions");
const ONE_TX_PAYMENT = soliditySha3("OneTxPayment");

contract("Multisig Permissions", (accounts) => {
  let colony;
  let token;
  let domain1;
  let colonyNetwork;

  let multisigPermissions;
  let version;

  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const USER2 = accounts[2];
  const USER3 = accounts[3];

  const setRootRoles = async function (contract, address, roles) {
    return contract.setUserRoles(1, UINT256_MAX, address, 1, roles);
  };

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const extension = await MultisigPermissions.new();
    version = await extension.version();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));

    // 1 => { 2, 3, 4 }
    await colony.addDomain(1, UINT256_MAX, 1);
    await colony.addDomain(1, UINT256_MAX, 1);
    await colony.addDomain(1, UINT256_MAX, 1);
    domain1 = await colony.getDomain(1);

    await colony.installExtension(MULTISIG_PERMISSIONS, version);
    const multisigPermissionsAddress = await colonyNetwork.getExtensionInstallation(MULTISIG_PERMISSIONS, colony.address);
    multisigPermissions = await MultisigPermissions.at(multisigPermissionsAddress);

    await colony.setRootRole(multisigPermissions.address, true);
    await colony.setArbitrationRole(1, UINT256_MAX, multisigPermissions.address, 1, true);
    await colony.setAdministrationRole(1, UINT256_MAX, multisigPermissions.address, 1, true);

    await setRootRoles(multisigPermissions, USER0, rolesToBytes32([ROOT_ROLE]));
    await setRootRoles(multisigPermissions, USER1, rolesToBytes32([ROOT_ROLE]));
  });

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      multisigPermissions = await MultisigPermissions.new();
      await multisigPermissions.install(colony.address);

      await checkErrorRevert(multisigPermissions.install(colony.address), "extension-already-installed");
      await checkErrorRevert(multisigPermissions.install(colony.address, { from: USER1 }), "ds-auth-unauthorized");

      const identifier = await multisigPermissions.identifier();
      expect(identifier).to.equal(MULTISIG_PERMISSIONS);

      const capabilityRoles = await multisigPermissions.getCapabilityRoles("0x0");
      expect(capabilityRoles).to.equal(ethers.constants.HashZero);

      await multisigPermissions.finishUpgrade();
      await multisigPermissions.deprecate(true);
      await multisigPermissions.uninstall();

      const code = await web3GetCode(multisigPermissions.address);
      expect(code).to.equal("0x");
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(MULTISIG_PERMISSIONS, version, { from: USER0 });

      await checkErrorRevert(colony.installExtension(MULTISIG_PERMISSIONS, version, { from: USER0 }), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(MULTISIG_PERMISSIONS, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(MULTISIG_PERMISSIONS, { from: USER0 });
    });

    it("can deprecate the extension if root", async () => {
      let deprecated = await multisigPermissions.getDeprecated();
      expect(deprecated).to.equal(false);

      await checkErrorRevert(colony.deprecateExtension(MULTISIG_PERMISSIONS, true, { from: USER2 }), "ds-auth-unauthorized");
      await colony.deprecateExtension(MULTISIG_PERMISSIONS, true);

      // Can't make new motions!
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await checkErrorRevert(multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]), "colony-extension-deprecated");

      deprecated = await multisigPermissions.getDeprecated();
      expect(deprecated).to.equal(true);
    });

    it("can  with valid values and emit expected events", async () => {
      multisigPermissions = await MultisigPermissions.new();
      await multisigPermissions.install(colony.address);

      await expectEvent(multisigPermissions.setGlobalThreshold(1), "GlobalThresholdSet", [1]);
    });

    it("only core root can initialise", async () => {
      multisigPermissions = await MultisigPermissions.new();
      await multisigPermissions.install(colony.address);

      await expectEvent(multisigPermissions.setGlobalThreshold(1), "GlobalThresholdSet", [1]);

      // Remove core root
      await setRootRoles(colony, USER0, ethers.utils.hexZeroPad("0x00", 32));

      await checkErrorRevert(multisigPermissions.setGlobalThreshold(2), "multisig-permissions-not-core-root");
    });

    it("only core root can set domain skill threshold", async () => {
      await checkErrorRevert(multisigPermissions.setDomainSkillThreshold(1, 1, { from: USER1 }), "multisig-permissions-not-core-root");
    });

    it("can query for initialisation values", async () => {
      let threshold = await multisigPermissions.getGlobalThreshold();
      expect(threshold).to.eq.BN(0);

      await multisigPermissions.setGlobalThreshold(2);
      threshold = await multisigPermissions.getGlobalThreshold();
      expect(threshold).to.eq.BN(2);
    });

    it("can't use the network-level functions if installed via ColonyNetwork", async () => {
      await checkErrorRevert(multisigPermissions.install(colony.address, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(multisigPermissions.finishUpgrade({ from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(multisigPermissions.deprecate(true, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(multisigPermissions.uninstall({ from: USER1 }), "ds-auth-unauthorized");
    });
  });

  describe("creating motions", async () => {
    it("can propose an action requiring root permissions if you have root permissions", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);

      const motionId = await multisigPermissions.getMotionCount();
      const motion = await multisigPermissions.getMotion(motionId);
      expect(motion.domainSkillId).to.eq.BN(domain1.skillId);
    });

    it("cannot propose a motion requiring root permissions if you do not have root multisig permissions", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await checkErrorRevert(
        multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action], { from: USER2 }),
        "colony-multisig-no-permissions",
      );
    });

    it("cannot propose a motion with mismatching lengths of targets/data", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await checkErrorRevert(multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action, action]), "colony-multisig-invalid-motion");
    });

    it("cannot propose a motion with no targets/data", async () => {
      await checkErrorRevert(multisigPermissions.createMotion(1, UINT256_MAX, [], []), "colony-multisig-invalid-motion");
    });

    it("can't propose an action requiring multiple different permissions", async () => {
      const action = await encodeTxData(colony, "addDomain", [1, UINT256_MAX, 1]); // Requires architecture
      const action2 = "0x12345678"; // Will be flagged as requiring root, but is also the special 'NO_ACTION' sig used by voting reputation.
      await checkErrorRevert(
        multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO, ADDRESS_ZERO], [action, action2]),
        "colony-multisig-invalid-motion",
      );
      await checkErrorRevert(
        multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO, ADDRESS_ZERO], [action2, action]),
        "colony-multisig-invalid-motion",
      );

      const multicallAction1 = await encodeTxData(colony, "multicall", [[action, action2]]);
      const multicallAction2 = await encodeTxData(colony, "multicall", [[action2, action]]);
      await checkErrorRevert(multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [multicallAction1]), "colony-multisig-invalid-motion");
      await checkErrorRevert(multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [multicallAction2]), "colony-multisig-invalid-motion");
    });

    it("can't propose an action requiring the same permissions for multiple actions, but in different domains, even via multicall", async () => {
      await setRootRoles(multisigPermissions, USER2, rolesToBytes32([ARCHITECTURE_ROLE]));

      // Action to award core funding in domain 2
      const action1 = await encodeTxData(colony, "setUserRoles", [1, 0, USER2, 2, rolesToBytes32([FUNDING_ROLE])]);
      // Action to award core funding in domain 3
      const action2 = await encodeTxData(colony, "setUserRoles", [1, 1, USER2, 3, rolesToBytes32([FUNDING_ROLE])]);

      const action = await encodeTxData(colony, "multicall", [[action1, action2]]);

      await checkErrorRevert(
        multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO, ADDRESS_ZERO], [action1, action2], { from: USER2 }),
        "colony-multisig-invalid-motion",
      );
      await checkErrorRevert(
        multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action], { from: USER2 }),
        "colony-multisig-invalid-motion",
      );
    });

    it("can propose an action that's a multicall, with the contents requiring root permissions only if you have root permissions", async () => {
      const action1 = await encodeTxData(colony, "mintTokens", [WAD]);
      const action2 = await encodeTxData(colony, "mintTokens", [WAD.muln(2)]);
      const action = await encodeTxData(colony, "multicall", [[action1, action2]]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);

      const motionId = await multisigPermissions.getMotionCount();
      const motion = await multisigPermissions.getMotion(motionId);
      expect(motion.domainSkillId).to.eq.BN(domain1.skillId);

      await checkErrorRevert(
        multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action], { from: USER2 }),
        "colony-multisig-no-permissions",
      );
    });

    it("cannot create a motion suggesting a nested multicall", async () => {
      const action1 = await encodeTxData(colony, "mintTokens", [WAD]);
      const action = await encodeTxData(colony, "multicall", [[action1]]);
      const nestedAction = await encodeTxData(colony, "multicall", [[action]]);

      await checkErrorRevert(
        multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [nestedAction]),
        "colony-get-action-summary-no-nested-multicalls",
      );
    });

    it("when you propose a motion, you implicitly approve it", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);

      const motionId = await multisigPermissions.getMotionCount();
      let rootApprovalCount = await multisigPermissions.getMotionRoleVoteCount(motionId, ROOT_ROLE, APPROVAL);
      expect(rootApprovalCount).to.eq.BN(1);
      let userApproval = await multisigPermissions.getUserVote(motionId, USER0, ROOT_ROLE, APPROVAL);
      expect(userApproval).to.equal(true);

      // And can remove the approval
      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, NONE);
      rootApprovalCount = await multisigPermissions.getMotionRoleVoteCount(motionId, ROOT_ROLE, APPROVAL);
      expect(rootApprovalCount).to.eq.BN(0);
      userApproval = await multisigPermissions.getUserVote(motionId, USER0, ROOT_ROLE, APPROVAL);
      expect(userApproval).to.equal(false);
    });
  });

  describe("Handling permissions", async () => {
    it("multisig root can award core root", async () => {
      let userRoles = await colony.getUserRoles(USER2, 1);
      expect(userRoles).to.equal("0x0000000000000000000000000000000000000000000000000000000000000000");

      const action = await encodeTxData(colony, "setUserRoles", [1, UINT256_MAX, USER2, 1, rolesToBytes32([ROOT_ROLE])]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);

      const motionId = await multisigPermissions.getMotionCount();
      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, APPROVAL, { from: USER1 });

      await multisigPermissions.execute(motionId);

      userRoles = await colony.getUserRoles(USER2, 1);
      expect(userRoles).to.equal("0x0000000000000000000000000000000000000000000000000000000000000002");
    });

    it("core root can award multisig root", async () => {
      let userRoles = await multisigPermissions.getUserRoles(USER2, 1);
      expect(userRoles).to.equal("0x0000000000000000000000000000000000000000000000000000000000000000");

      await setRootRoles(multisigPermissions, USER2, rolesToBytes32([ROOT_ROLE]));

      userRoles = await multisigPermissions.getUserRoles(USER2, 1);
      expect(userRoles).to.equal("0x0000000000000000000000000000000000000000000000000000000000000002");
    });

    it("core architecture can award multisig funding only in subdomains", async () => {
      // Give user 2 core architecture
      await setRootRoles(colony, USER2, rolesToBytes32([ARCHITECTURE_ROLE]));

      // Try to award multisig FUNDING in root domain
      await checkErrorRevert(
        multisigPermissions.setUserRoles(1, UINT256_MAX, USER2, 1, rolesToBytes32([FUNDING_ROLE]), { from: USER2 }),
        "multisig-caller-not-correct-permissions",
      );

      // Try to award multisig FUNDING in a child domain
      await setRootRoles(multisigPermissions, USER2, rolesToBytes32([FUNDING_ROLE]), {
        from: USER2,
      });
    });

    it("multisig architecture can award core funding only in subdomains", async () => {
      await setRootRoles(multisigPermissions, USER2, rolesToBytes32([ARCHITECTURE_ROLE]));

      // Try to create a motion to award core funding in root
      let action = await encodeTxData(colony, "setUserRoles", [1, UINT256_MAX, USER2, 1, rolesToBytes32([FUNDING_ROLE])]);

      await checkErrorRevert(
        multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action], { from: USER2 }),
        "colony-multisig-no-permissions",
      );

      // Can create motions to award core funding in subdomain
      action = await encodeTxData(colony, "setUserRoles", [1, 0, USER2, 2, rolesToBytes32([FUNDING_ROLE])]);
      await multisigPermissions.createMotion(1, 0, [ADDRESS_ZERO], [action], { from: USER2 });
    });

    it(`multisig architecture can create motions to award multisig funding only in subdomains,
        and cannot award those permissions directly`, async () => {
      await setRootRoles(multisigPermissions, USER2, rolesToBytes32([ARCHITECTURE_ROLE]));

      await checkErrorRevert(
        multisigPermissions.setUserRoles(1, 0, USER2, 2, rolesToBytes32([FUNDING_ROLE]), {
          from: USER2,
        }),
        "multisig-caller-not-correct-permissions",
      );

      const action = await encodeTxData(multisigPermissions, "setUserRoles", [1, 0, USER2, 2, rolesToBytes32([FUNDING_ROLE])]);

      await multisigPermissions.createMotion(1, 0, [multisigPermissions.address], [action], { from: USER2 });
    });

    it(`multisig root can create motions to award multisig root and cannot award those permissions directly`, async () => {
      await setRootRoles(multisigPermissions, USER2, rolesToBytes32([ROOT_ROLE]));

      await checkErrorRevert(
        multisigPermissions.setUserRoles(1, UINT256_MAX, USER2, 1, rolesToBytes32([ROOT_ROLE]), { from: USER2 }),
        "multisig-caller-not-correct-permissions",
      );

      const action = await encodeTxData(colony, "setUserRoles", [1, UINT256_MAX, USER2, 1, rolesToBytes32([ROOT_ROLE])]);

      await multisigPermissions.createMotion(1, UINT256_MAX, [multisigPermissions.address], [action], { from: USER2 });
    });

    it("The domain skill threshold for execution changes as expected", async () => {
      await multisigPermissions.setGlobalThreshold(2);
      // By default, it's the global threshold
      const domain = await colony.getDomain(1);

      let res = await multisigPermissions.getDomainSkillRoleThreshold(domain.skillId, ROOT_ROLE);
      expect(res).to.eq.BN(2);
      res = await multisigPermissions.getDomainSkillThreshold(domain.skillId);
      expect(res).to.eq.BN(0);

      // Update global threshold
      await multisigPermissions.setGlobalThreshold(3);
      res = await multisigPermissions.getDomainSkillRoleThreshold(domain.skillId, ROOT_ROLE);
      expect(res).to.eq.BN(3);
      res = await multisigPermissions.getDomainSkillThreshold(domain.skillId);
      expect(res).to.eq.BN(0);

      // If we set it to something specific for the domain
      await multisigPermissions.setDomainSkillThreshold(domain.skillId, 2);
      res = await multisigPermissions.getDomainSkillRoleThreshold(domain.skillId, ROOT_ROLE);
      expect(res).to.eq.BN(2);
      res = await multisigPermissions.getDomainSkillThreshold(domain.skillId);
      expect(res).to.eq.BN(2);

      // Changing the global threshold has no effect
      await multisigPermissions.setGlobalThreshold(1);
      res = await multisigPermissions.getDomainSkillRoleThreshold(domain.skillId, ROOT_ROLE);
      expect(res).to.eq.BN(2);
      res = await multisigPermissions.getDomainSkillThreshold(domain.skillId);
      expect(res).to.eq.BN(2);

      // Add users with the relevant permission
      const USER4 = accounts[4];
      const USER5 = accounts[5];
      const USER6 = accounts[6];

      await setRootRoles(multisigPermissions, USER2, rolesToBytes32([ROOT_ROLE]));
      await setRootRoles(multisigPermissions, USER3, rolesToBytes32([ROOT_ROLE]));
      await setRootRoles(multisigPermissions, USER4, rolesToBytes32([ROOT_ROLE]));
      await setRootRoles(multisigPermissions, USER5, rolesToBytes32([ROOT_ROLE]));
      await setRootRoles(multisigPermissions, USER6, rolesToBytes32([ROOT_ROLE]));

      // No effect
      res = await multisigPermissions.getDomainSkillRoleThreshold(domain.skillId, ROOT_ROLE);
      expect(res).to.eq.BN(2);
      res = await multisigPermissions.getDomainSkillThreshold(domain.skillId);
      expect(res).to.eq.BN(2);

      // Set default to be relative
      await multisigPermissions.setGlobalThreshold(0);

      // Still no change
      res = await multisigPermissions.getDomainSkillRoleThreshold(domain.skillId, ROOT_ROLE);
      expect(res).to.eq.BN(2);
      res = await multisigPermissions.getDomainSkillThreshold(domain.skillId);
      expect(res).to.eq.BN(2);

      // Remove the domain-specific threshold, drops to nUsersWithSpecificPermissions / 2 + 1
      await multisigPermissions.setDomainSkillThreshold(domain.skillId, 0);

      res = await multisigPermissions.getDomainSkillRoleThreshold(domain.skillId, ROOT_ROLE);
      expect(res).to.eq.BN(4);
      res = await multisigPermissions.getDomainSkillThreshold(domain.skillId);
      expect(res).to.eq.BN(0);
    });
  });

  describe("Approving motions", async () => {
    it("if the motion doesn't exist, you cannot approve or cancel", async () => {
      await checkErrorRevert(multisigPermissions.changeVote(1, UINT256_MAX, 1, APPROVAL), "multisig-motion-nonexistent");
      await checkErrorRevert(multisigPermissions.cancel(1), "multisig-motion-nonexistent");
    });

    it("if you don't have the right permissions, you cannot approve", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);
      const motionId = await multisigPermissions.getMotionCount();

      // No permissions
      await checkErrorRevert(multisigPermissions.changeVote(1, UINT256_MAX, motionId, APPROVAL, { from: USER2 }), "colony-multisig-no-permissions");

      // Not right permissions
      await setRootRoles(multisigPermissions, USER2, rolesToBytes32([ARBITRATION_ROLE]));
      await checkErrorRevert(multisigPermissions.changeVote(1, UINT256_MAX, motionId, APPROVAL, { from: USER2 }), "colony-multisig-no-permissions");
    });

    it("if you don't show the right permissions, you cannot approve", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);
      const motionId = await multisigPermissions.getMotionCount();

      // Not right permissions
      await checkErrorRevert(multisigPermissions.changeVote(1, 0, motionId, APPROVAL), "colony-multisig-not-same-domain");
    });

    it("can withdraw approvals", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);

      const motionId = await multisigPermissions.getMotionCount();
      await checkErrorRevert(multisigPermissions.execute(motionId), "colony-multisig-not-enough-approvals");

      // Approve
      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, APPROVAL, { from: USER1 });
      let approvalCount = await multisigPermissions.getMotionRoleVoteCount(motionId, ROOT_ROLE, APPROVAL);
      expect(approvalCount).to.eq.BN(2);

      let userApproval = await multisigPermissions.getUserVote(motionId, USER1, ROOT_ROLE, APPROVAL);
      expect(userApproval).to.equal(true);

      // Could call if we wanted
      await multisigPermissions.execute.estimateGas(motionId);

      // Unapprove
      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, NONE, { from: USER1 });
      approvalCount = await multisigPermissions.getMotionRoleVoteCount(motionId, ROOT_ROLE, APPROVAL);
      expect(approvalCount).to.eq.BN(1);
      userApproval = await multisigPermissions.getUserVote(motionId, USER1, ROOT_ROLE, APPROVAL);
      expect(userApproval).to.equal(false);

      // Can't call
      await checkErrorRevert(multisigPermissions.execute(motionId), "colony-multisig-not-enough-approvals");
    });

    it("overallApprovalTimestamp updates as expected as moving above/below approval limit", async () => {
      const domain = await colony.getDomain(1);
      await multisigPermissions.setDomainSkillThreshold(domain.skillId, 1);

      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);

      const motionId = await multisigPermissions.getMotionCount();
      let motion = await multisigPermissions.getMotion(motionId);

      const firstTimestamp = motion.overallApprovalTimestamp;
      expect(firstTimestamp).to.be.gt.BN(0);

      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, APPROVAL, { from: USER1 });
      motion = await multisigPermissions.getMotion(motionId);
      expect(firstTimestamp).to.eq.BN(motion.overallApprovalTimestamp);

      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, NONE, { from: USER1 });
      motion = await multisigPermissions.getMotion(motionId);
      expect(firstTimestamp).to.eq.BN(motion.overallApprovalTimestamp);

      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, NONE);
      motion = await multisigPermissions.getMotion(motionId);
      expect(motion.overallApprovalTimestamp).to.eq.BN(0);
    });

    it("overallApprovalTimestamp updates as best we can do when threshold is changed", async () => {
      const domain = await colony.getDomain(1);
      await multisigPermissions.setDomainSkillThreshold(domain.skillId, 1);

      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);

      const motionId = await multisigPermissions.getMotionCount();
      let motion = await multisigPermissions.getMotion(motionId);

      const firstTimestamp = motion.overallApprovalTimestamp;
      expect(firstTimestamp).to.be.gt.BN(0);

      // Change threshold
      await multisigPermissions.setDomainSkillThreshold(domain.skillId, 2);
      await forwardTime(100, this);

      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, APPROVAL, { from: USER1 });
      motion = await multisigPermissions.getMotion(motionId);
      expect(firstTimestamp).to.be.lt.BN(motion.overallApprovalTimestamp);
    });

    it("can withdraw approvals even if you don't have permissions to approve any more", async () => {
      const domain = await colony.getDomain(1);
      await multisigPermissions.setDomainSkillThreshold(domain.skillId, 2);

      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);

      const motionId = await multisigPermissions.getMotionCount();

      // Approve
      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, APPROVAL, { from: USER1 });
      let approvalCount = await multisigPermissions.getMotionRoleVoteCount(motionId, ROOT_ROLE, APPROVAL);
      expect(approvalCount).to.eq.BN(2);

      // Remove permissions
      await setRootRoles(multisigPermissions, USER1, ethers.utils.hexZeroPad(0, 32));

      let userApproval = await multisigPermissions.getUserVote(motionId, USER1, ROOT_ROLE, APPROVAL);
      expect(userApproval).to.equal(true);

      // Unapprove
      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, NONE, { from: USER1 });
      approvalCount = await multisigPermissions.getMotionRoleVoteCount(motionId, ROOT_ROLE, APPROVAL);
      expect(approvalCount).to.eq.BN(1);
      userApproval = await multisigPermissions.getUserVote(motionId, USER1, ROOT_ROLE, APPROVAL);
      expect(userApproval).to.equal(false);

      // Can't call
      await checkErrorRevert(multisigPermissions.execute(motionId), "colony-multisig-not-enough-approvals");
    });

    it("can't repeatedly approve or unapprove and have an effect", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);

      const motionId = await multisigPermissions.getMotionCount();

      // Approve again
      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, APPROVAL);

      // But no effect
      let approvalCount = await multisigPermissions.getMotionRoleVoteCount(motionId, ROOT_ROLE, APPROVAL);
      expect(approvalCount).to.eq.BN(1);

      // Another user approves
      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, APPROVAL, { from: USER1 });
      approvalCount = await multisigPermissions.getMotionRoleVoteCount(motionId, ROOT_ROLE, APPROVAL);
      expect(approvalCount).to.eq.BN(2);

      // Unapprove
      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, NONE);
      approvalCount = await multisigPermissions.getMotionRoleVoteCount(motionId, ROOT_ROLE, APPROVAL);
      expect(approvalCount).to.eq.BN(1);
      let userApproval = await multisigPermissions.getUserVote(motionId, USER0, ROOT_ROLE, APPROVAL);
      expect(userApproval).to.equal(false);

      // Unapprove again
      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, NONE);
      approvalCount = await multisigPermissions.getMotionRoleVoteCount(motionId, ROOT_ROLE, APPROVAL);
      expect(approvalCount).to.eq.BN(1);
      userApproval = await multisigPermissions.getUserVote(motionId, USER0, ROOT_ROLE, APPROVAL);
      expect(userApproval).to.equal(false);
    });

    it("can approve if you have permissions in a parent domain, but you don't count for calculating the threshold", async () => {
      const action = await encodeTxData(colony, "makeExpenditure", [1, 0, 2]);
      await checkErrorRevert(multisigPermissions.createMotion(1, 0, [ADDRESS_ZERO], [action]), "colony-multisig-no-permissions");

      // Give user0 root and admin in root domain
      await setRootRoles(multisigPermissions, USER0, rolesToBytes32([ROOT_ROLE, ADMINISTRATION_ROLE]));

      // Give users 1,2,3 admin in the subdomain
      await multisigPermissions.setUserRoles(1, 0, USER1, 2, rolesToBytes32([ADMINISTRATION_ROLE]));
      await multisigPermissions.setUserRoles(1, 0, USER2, 2, rolesToBytes32([ADMINISTRATION_ROLE]));
      await multisigPermissions.setUserRoles(1, 0, USER3, 2, rolesToBytes32([ADMINISTRATION_ROLE]));

      const domain = await colony.getDomain(2);

      const counts = await multisigPermissions.getDomainSkillRoleCounts(domain.skillId, ADMINISTRATION_ROLE);
      expect(counts).to.eq.BN(3);

      // That should make the threshold 2. If the admin holder in root was counted, the threshold would be three
      const threshold = await multisigPermissions.getDomainSkillRoleThreshold(domain.skillId, ADMINISTRATION_ROLE);
      expect(threshold).to.eq.BN(2);
    });

    it("approvals on multiple permissions are tracked separately", async () => {
      const extension = await OneTxPayment.new();
      const oneTxPaymentVersion = await extension.version();
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const d1 = await colony.getDomain(1);
      const d2 = await colony.getDomain(2);

      await colony.moveFundsBetweenPots(1, UINT256_MAX, 0, d1.fundingPotId, d2.fundingPotId, WAD, token.address);

      await colony.installExtension(ONE_TX_PAYMENT, oneTxPaymentVersion);
      const oneTxPaymentAddress = await colonyNetwork.getExtensionInstallation(ONE_TX_PAYMENT, colony.address);
      const oneTxPayment = await OneTxPayment.at(oneTxPaymentAddress);

      // Give extensions funding and administration rights
      await setRootRoles(colony, multisigPermissions.address, rolesToBytes32([ROOT_ROLE, FUNDING_ROLE, ADMINISTRATION_ROLE, ARBITRATION_ROLE]));
      await setRootRoles(colony, oneTxPayment.address, rolesToBytes32([FUNDING_ROLE, ADMINISTRATION_ROLE, ARBITRATION_ROLE]));

      // Make a motion that requires two permissions
      const action = await encodeTxData(
        oneTxPayment,
        "makePaymentFundedFromDomain(uint256,uint256,uint256,uint256,address[],address[],uint256[],uint256,uint256)",
        [1, 0, 1, 0, [USER0], [token.address], [100], 2, 0],
      );

      // If we don't have any permissions, can't create
      await checkErrorRevert(multisigPermissions.createMotion(1, 0, [oneTxPayment.address], [action]), "colony-multisig-no-permissions");

      // Give one permission
      await setRootRoles(multisigPermissions, USER0, rolesToBytes32([ROOT_ROLE, ADMINISTRATION_ROLE]));

      // Now can create
      await multisigPermissions.createMotion(1, 0, [oneTxPayment.address], [action]);

      // One meets threshold, still can't execute
      const motionId = await multisigPermissions.getMotionCount();
      await checkErrorRevert(multisigPermissions.execute(motionId), "colony-multisig-not-enough-approvals");

      // Give user funding, arbitration, specifically in the domain
      await multisigPermissions.setUserRoles(1, 0, USER1, 2, rolesToBytes32([FUNDING_ROLE, ARBITRATION_ROLE]));

      // Have them approve
      await multisigPermissions.changeVote(2, UINT256_MAX, motionId, APPROVAL, { from: USER1 });

      const balanceBefore = await token.balanceOf(USER0);

      // Now all permissions meet the threshold, can execute.
      await multisigPermissions.execute(motionId);
      const balanceAfter = await token.balanceOf(USER0);

      expect(balanceAfter.sub(balanceBefore)).to.eq.BN(98); // Accounts for network fee
    });
  });

  describe("Rejecting motions", async () => {
    it("if you don't have the right permissions, you cannot reject", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);
      const motionId = await multisigPermissions.getMotionCount();

      // No permissions
      await checkErrorRevert(multisigPermissions.changeVote(1, UINT256_MAX, motionId, REJECTION, { from: USER2 }), "colony-multisig-no-permissions");

      // Not right permissions
      await setRootRoles(multisigPermissions, USER2, rolesToBytes32([ARBITRATION_ROLE]));
      await checkErrorRevert(multisigPermissions.changeVote(1, UINT256_MAX, motionId, REJECTION, { from: USER2 }), "colony-multisig-no-permissions");
    });

    it("if you don't show the right permissions, you cannot reject", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);
      const motionId = await multisigPermissions.getMotionCount();

      // Not right permissions
      await checkErrorRevert(multisigPermissions.changeVote(1, 0, motionId, REJECTION), "colony-multisig-not-same-domain");
    });

    it("can withdraw rejections", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);

      const motionId = await multisigPermissions.getMotionCount();
      await checkErrorRevert(multisigPermissions.cancel(motionId, { from: USER1 }), "colony-multisig-not-enough-rejections");

      // But even though not at threshold, creator could reject
      await multisigPermissions.cancel.estimateGas(motionId);

      // Reject
      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, REJECTION, { from: USER1 });
      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, REJECTION, { from: USER0 });
      let rejectionCount = await multisigPermissions.getMotionRoleVoteCount(motionId, ROOT_ROLE, REJECTION);
      expect(rejectionCount).to.eq.BN(2);

      let userRejection = await multisigPermissions.getUserVote(motionId, USER1, ROOT_ROLE, REJECTION);
      expect(userRejection).to.equal(true);

      // Could reject if we wanted
      await multisigPermissions.cancel.estimateGas(motionId);

      // Unreject
      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, NONE, { from: USER1 });
      rejectionCount = await multisigPermissions.getMotionRoleVoteCount(motionId, ROOT_ROLE, REJECTION);
      expect(rejectionCount).to.eq.BN(1);
      userRejection = await multisigPermissions.getUserVote(motionId, USER1, ROOT_ROLE, REJECTION);
      expect(userRejection).to.equal(false);

      // Can't reject unless creator
      await checkErrorRevert(multisigPermissions.cancel(motionId, { from: USER1 }), "colony-multisig-not-enough-rejections");
      await multisigPermissions.cancel.estimateGas(motionId);
    });

    it("can withdraw rejections even if you don't have permissions to reject any more", async () => {
      const domain = await colony.getDomain(1);
      await multisigPermissions.setDomainSkillThreshold(domain.skillId, 2);

      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);

      const motionId = await multisigPermissions.getMotionCount();

      // Reject
      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, REJECTION, { from: USER1 });
      let rejectionCount = await multisigPermissions.getMotionRoleVoteCount(motionId, ROOT_ROLE, REJECTION);
      expect(rejectionCount).to.eq.BN(1);

      // Remove permissions
      await setRootRoles(multisigPermissions, USER1, ethers.utils.hexZeroPad(0, 32));

      let userRejection = await multisigPermissions.getUserVote(motionId, USER1, ROOT_ROLE, REJECTION);
      expect(userRejection).to.equal(true);

      // Unreject
      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, NONE, { from: USER1 });
      rejectionCount = await multisigPermissions.getMotionRoleVoteCount(motionId, ROOT_ROLE, REJECTION);
      expect(rejectionCount).to.eq.BN(0);
      userRejection = await multisigPermissions.getUserVote(motionId, USER1, ROOT_ROLE, REJECTION);
      expect(userRejection).to.equal(false);

      // Can't call
      await checkErrorRevert(multisigPermissions.execute(motionId), "colony-multisig-not-enough-approvals");
    });

    it("can't repeatedly reject or unreject and have an effect", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);

      const motionId = await multisigPermissions.getMotionCount();

      // Reject again
      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, REJECTION);

      // But no effect
      let approvalCount = await multisigPermissions.getMotionRoleVoteCount(motionId, ROOT_ROLE, REJECTION);
      expect(approvalCount).to.eq.BN(1);

      // Another user rejects
      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, REJECTION, { from: USER1 });
      approvalCount = await multisigPermissions.getMotionRoleVoteCount(motionId, ROOT_ROLE, REJECTION);
      expect(approvalCount).to.eq.BN(2);

      // Unreject
      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, NONE);
      approvalCount = await multisigPermissions.getMotionRoleVoteCount(motionId, ROOT_ROLE, REJECTION);
      expect(approvalCount).to.eq.BN(1);
      let userApproval = await multisigPermissions.getUserVote(motionId, USER0, ROOT_ROLE, REJECTION);
      expect(userApproval).to.equal(false);

      // Unreject again
      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, NONE);
      approvalCount = await multisigPermissions.getMotionRoleVoteCount(motionId, ROOT_ROLE, REJECTION);
      expect(approvalCount).to.eq.BN(1);
      userApproval = await multisigPermissions.getUserVote(motionId, USER0, ROOT_ROLE, REJECTION);
      expect(userApproval).to.equal(false);
    });

    it("can reject if you have permissions in a parent domain, but you don't count for calculating the threshold", async () => {
      const action = await encodeTxData(colony, "makeExpenditure", [1, 0, 2]);
      await checkErrorRevert(multisigPermissions.createMotion(1, 0, [ADDRESS_ZERO], [action]), "colony-multisig-no-permissions");

      // Give user0 root and admin in root domain
      await setRootRoles(multisigPermissions, USER0, rolesToBytes32([ROOT_ROLE, ADMINISTRATION_ROLE]));

      // Give users 1,2,3 admin in the subdomain
      await multisigPermissions.setUserRoles(1, 0, USER1, 2, rolesToBytes32([ADMINISTRATION_ROLE]));
      await multisigPermissions.setUserRoles(1, 0, USER2, 2, rolesToBytes32([ADMINISTRATION_ROLE]));
      await multisigPermissions.setUserRoles(1, 0, USER3, 2, rolesToBytes32([ADMINISTRATION_ROLE]));

      const domain = await colony.getDomain(2);

      const counts = await multisigPermissions.getDomainSkillRoleCounts(domain.skillId, ADMINISTRATION_ROLE);
      expect(counts).to.eq.BN(3);

      // That should make the threshold 2. If the admin holder in root was counted, the threshold would be three
      const threshold = await multisigPermissions.getDomainSkillRoleThreshold(domain.skillId, ADMINISTRATION_ROLE);
      expect(threshold).to.eq.BN(2);
    });

    it("rejections on multiple permissions are tracked separately", async () => {
      const extension = await OneTxPayment.new();
      const oneTxPaymentVersion = await extension.version();

      await colony.installExtension(ONE_TX_PAYMENT, oneTxPaymentVersion);
      const oneTxPaymentAddress = await colonyNetwork.getExtensionInstallation(ONE_TX_PAYMENT, colony.address);
      const oneTxPayment = await OneTxPayment.at(oneTxPaymentAddress);

      // Give extensions funding and administration rights
      await setRootRoles(colony, multisigPermissions.address, rolesToBytes32([ROOT_ROLE, FUNDING_ROLE, ADMINISTRATION_ROLE]));
      await setRootRoles(colony, oneTxPayment.address, rolesToBytes32([FUNDING_ROLE, ADMINISTRATION_ROLE]));

      // Make a motion that requires two permissions
      const action = await encodeTxData(
        oneTxPayment,
        "makePaymentFundedFromDomain(uint256,uint256,uint256,uint256,address[],address[],uint256[],uint256,uint256)",
        [1, 0, 1, 0, [USER0], [token.address], [100], 2, 0],
      );

      // If we don't have any permissions, can't create
      await checkErrorRevert(multisigPermissions.createMotion(1, 0, [oneTxPayment.address], [action]), "colony-multisig-no-permissions");

      // Give one permission
      await setRootRoles(multisigPermissions, USER0, rolesToBytes32([ROOT_ROLE, ADMINISTRATION_ROLE]));

      // Now can create
      await multisigPermissions.createMotion(1, 0, [oneTxPayment.address], [action]);
      const motionId = await multisigPermissions.getMotionCount();

      // And reject
      await multisigPermissions.changeVote(1, 0, motionId, REJECTION, { from: USER0 });

      // One meets threshold, still can't reject unless creator
      await checkErrorRevert(multisigPermissions.cancel(motionId, { from: USER1 }), "colony-multisig-not-enough-rejections");
      await multisigPermissions.cancel.estimateGas(motionId, { from: USER0 });
      // Give user funding, specifically in the domain
      await multisigPermissions.setUserRoles(1, 0, USER1, 2, rolesToBytes32([FUNDING_ROLE]));

      // Have them reject
      await multisigPermissions.changeVote(2, UINT256_MAX, motionId, REJECTION, { from: USER1 });

      // Now both permissions meet the threshold, can reject.
      await multisigPermissions.cancel(motionId);
      const motion = await multisigPermissions.getMotion(motionId);
      expect(motion.rejected).to.be.true;

      // Can't execute
      await checkErrorRevert(multisigPermissions.execute(motionId), "multisig-motion-already-rejected");
      // Can't reject again
      await checkErrorRevert(multisigPermissions.cancel(motionId), "multisig-motion-already-rejected");
    });

    it("anyone can cancel a motion that was created more than a week ago", async () => {
      const action = "0x12345678";

      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);
      const motionId = await multisigPermissions.getMotionCount();
      const motion = await multisigPermissions.getMotion(motionId);

      await checkErrorRevert(multisigPermissions.cancel(motionId, { from: USER3 }), "colony-multisig-not-enough-rejections");

      const oneWeek = parseInt(motion.creationTimestamp, 10) + SECONDS_PER_DAY * 7;

      await checkErrorRevert(
        makeTxAtTimestamp(multisigPermissions.cancel, [motionId, { from: USER3, gasLimit: 1000000 }], oneWeek, this),
        "colony-multisig-not-enough-rejections",
      );

      await makeTxAtTimestamp(multisigPermissions.cancel, [motionId, { from: USER3, gasLimit: 1000000 }], oneWeek + 1, this);
    });
  });

  describe("Executing motions", async () => {
    it("can't execute a nonexistent motion", async () => {
      await checkErrorRevert(multisigPermissions.changeVote(1, UINT256_MAX, 1, APPROVAL), "multisig-motion-nonexistent");
    });

    it("can't execute an action requiring root permissions without approvals", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);

      const motionId = await multisigPermissions.getMotionCount();
      await checkErrorRevert(multisigPermissions.execute(motionId), "colony-multisig-not-enough-approvals");

      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, APPROVAL, { from: USER1 });

      const amountBefore = await token.totalSupply();

      await multisigPermissions.execute(motionId);

      const amountAfter = await token.totalSupply();

      expect(amountAfter.sub(amountBefore)).to.eq.BN(WAD);
    });

    it("can't execute a motion that fails until a week after it meets the approval threshold", async () => {
      const action = "0x12345678";
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);
      const motionId = await multisigPermissions.getMotionCount();
      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, APPROVAL, { from: USER1 });
      await checkErrorRevert(multisigPermissions.execute(motionId), "colony-multisig-failed-not-one-week");

      await forwardTime(7 * 3600 * 24 + 1, this);

      await multisigPermissions.execute(motionId);
    });

    it("anyone can execute a motion so long as it has approvals", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);

      const motionId = await multisigPermissions.getMotionCount();

      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, APPROVAL, { from: USER1 });

      const amountBefore = await token.totalSupply();

      await multisigPermissions.execute(motionId, { from: USER2 });

      const amountAfter = await token.totalSupply();

      expect(amountAfter.sub(amountBefore)).to.eq.BN(WAD);
    });

    it("can't execute multiple times", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);

      const motionId = await multisigPermissions.getMotionCount();

      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, APPROVAL, { from: USER1 });

      await multisigPermissions.execute(motionId, { from: USER2 });

      await checkErrorRevert(multisigPermissions.execute(motionId, { from: USER2 }), "multisig-motion-already-executed");
    });

    it("can't change vote or cancel once executed", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [ADDRESS_ZERO], [action]);

      const motionId = await multisigPermissions.getMotionCount();

      await multisigPermissions.changeVote(1, UINT256_MAX, motionId, APPROVAL, { from: USER1 });

      await multisigPermissions.execute(motionId, { from: USER2 });

      await checkErrorRevert(multisigPermissions.changeVote(2, UINT256_MAX, motionId, APPROVAL, { from: USER1 }), "multisig-motion-already-executed");

      await checkErrorRevert(multisigPermissions.cancel(motionId, { from: USER1 }), "multisig-motion-already-executed");
    });
  });
});
