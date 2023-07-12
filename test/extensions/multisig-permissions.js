/* globals artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");
const { soliditySha3 } = require("web3-utils");

const { UINT256_MAX, WAD, ROOT_ROLE, ARBITRATION_ROLE, ARCHITECTURE_ROLE, FUNDING_ROLE } = require("../../helpers/constants");

const { checkErrorRevert, web3GetCode, encodeTxData, expectEvent, forwardTime } = require("../../helpers/test-helper");

const { setupRandomColony } = require("../../helpers/test-data-generator");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const EtherRouter = artifacts.require("EtherRouter");
const MultisigPermissions = artifacts.require("MultisigPermissions");

const MULTISIG_PERMISSIONS = soliditySha3("MultisigPermissions");

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
  const USER4 = accounts[4];
  const USER5 = accounts[5];
  const USER6 = accounts[6];

  const giveUserMultisigRoot = async function (contract, address) {
    return contract.setUserRoles(1, UINT256_MAX, address, 1, ethers.utils.hexZeroPad(ethers.BigNumber.from(2).pow(ROOT_ROLE).toHexString(), 32));
  };

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const extension = await MultisigPermissions.new();
    version = await extension.version();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));

    // 1 => { 2, 3 }
    await colony.addDomain(1, UINT256_MAX, 1);
    await colony.addDomain(1, UINT256_MAX, 1);
    await colony.addDomain(1, UINT256_MAX, 1);
    domain1 = await colony.getDomain(1);

    await colony.installExtension(MULTISIG_PERMISSIONS, version);
    const multisigPermissionsAddress = await colonyNetwork.getExtensionInstallation(MULTISIG_PERMISSIONS, colony.address);
    multisigPermissions = await MultisigPermissions.at(multisigPermissionsAddress);

    await multisigPermissions.initialise(0);

    await colony.setRootRole(multisigPermissions.address, true);
    await colony.setArbitrationRole(1, UINT256_MAX, multisigPermissions.address, 1, true);
    await colony.setAdministrationRole(1, UINT256_MAX, multisigPermissions.address, 1, true);

    await await multisigPermissions.setUserRoles(
      1,
      UINT256_MAX,
      USER1,
      1,
      ethers.utils.hexZeroPad(ethers.BigNumber.from(2).pow(ROOT_ROLE).toHexString(), 32)
    );
    await giveUserMultisigRoot(multisigPermissions, USER0);
    await giveUserMultisigRoot(multisigPermissions, USER1);
  });

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      multisigPermissions = await MultisigPermissions.new();
      await multisigPermissions.install(colony.address);

      await checkErrorRevert(multisigPermissions.install(colony.address), "extension-already-installed");

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
      await checkErrorRevert(multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action]), "colony-extension-deprecated");

      deprecated = await multisigPermissions.getDeprecated();
      expect(deprecated).to.equal(true);
    });

    it("can initialised with valid values and emit expected event", async () => {
      multisigPermissions = await MultisigPermissions.new();
      await multisigPermissions.install(colony.address);

      await expectEvent(multisigPermissions.initialise(1), "ExtensionInitialised", []);
    });

    it("only core root can initialise", async () => {
      multisigPermissions = await MultisigPermissions.new();
      await multisigPermissions.install(colony.address);

      await expectEvent(multisigPermissions.initialise(1), "ExtensionInitialised", []);

      // Remove core root
      await colony.setUserRoles(1, UINT256_MAX, USER0, 1, ethers.utils.hexZeroPad("0x00", 32));

      await checkErrorRevert(multisigPermissions.initialise(2), "multisig-permissions-not-core-root");
    });

    it("can query for initialisation values", async () => {
      let threshold = await multisigPermissions.getGlobalThreshold();
      expect(threshold).to.eq.BN(0);

      await multisigPermissions.initialise(2);
      threshold = await multisigPermissions.getGlobalThreshold();
      expect(threshold).to.eq.BN(2);
    });

    it("can't use the network-level functions if installed via ColonyNetwork", async () => {
      // await checkErrorRevert(voting.install(ADDRESS_ZERO, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(multisigPermissions.finishUpgrade({ from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(multisigPermissions.deprecate(true, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(multisigPermissions.uninstall({ from: USER1 }), "ds-auth-unauthorized");
    });
  });

  describe("creating motions", async () => {
    it("can propose an action requiring root permissions if you have root permissions", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action]);

      const motionId = await multisigPermissions.getMotionCount();
      const motion = await multisigPermissions.getMotion(motionId);
      expect(motion.domainSkillId).to.eq.BN(domain1.skillId);
    });

    it("cannot propose a motion requiring root permissions if you do not have root multisig permissions", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await checkErrorRevert(
        multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action], { from: USER2 }),
        "colony-multisig-no-permissions"
      );
    });

    it("cannot propose a motion with mismatching lengths of targets/data", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await checkErrorRevert(multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action, action]), "colony-multisig-invalid-motion");
    });

    it("cannot propose a motion with no targets/data", async () => {
      await checkErrorRevert(multisigPermissions.createMotion(1, UINT256_MAX, [], []), "colony-multisig-invalid-motion");
    });

    it("can't propose an action requiring multiple different permissions", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      const action2 = "0x12345678";
      await checkErrorRevert(multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action, action2]), "colony-multisig-invalid-motion");
    });

    it("can't propose an action requiring the same permissions for multiple actions, but in different domains, even via multicall", async () => {
      await multisigPermissions.setUserRoles(
        1,
        UINT256_MAX,
        USER2,
        1,
        ethers.utils.hexZeroPad(ethers.BigNumber.from(2).pow(ARCHITECTURE_ROLE).toHexString(), 32)
      );

      // Action to award core funding in subdomain 1
      const action1 = await encodeTxData(colony, "setUserRoles", [
        1,
        0,
        USER2,
        2,
        ethers.utils.hexZeroPad(ethers.BigNumber.from(2).pow(FUNDING_ROLE).toHexString(), 32),
      ]);
      // Action to award core funding in subdomain 1
      const action2 = await encodeTxData(colony, "setUserRoles", [
        1,
        1,
        USER2,
        3,
        ethers.utils.hexZeroPad(ethers.BigNumber.from(2).pow(FUNDING_ROLE).toHexString(), 32),
      ]);

      const action = await encodeTxData(colony, "multicall", [[action1, action2]]);

      await checkErrorRevert(
        multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action1, action2], { from: USER2 }),
        "colony-multisig-invalid-motion"
      );
      await checkErrorRevert(
        multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action], { from: USER2 }),
        "colony-multisig-invalid-motion"
      );
    });

    it("can propose an action that's a multicall, with the contents requiring root permissions only if you have root permissions", async () => {
      const action1 = await encodeTxData(colony, "mintTokens", [WAD]);
      const action2 = await encodeTxData(colony, "mintTokens", [WAD.muln(2)]);
      const action = await encodeTxData(colony, "multicall", [[action1, action2]]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action]);

      const motionId = await multisigPermissions.getMotionCount();
      const motion = await multisigPermissions.getMotion(motionId);
      expect(motion.domainSkillId).to.eq.BN(domain1.skillId);

      await checkErrorRevert(
        multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action], { from: USER2 }),
        "colony-multisig-no-permissions"
      );
    });

    it("cannot create a motion suggesting a nested multicall", async () => {
      const action1 = await encodeTxData(colony, "mintTokens", [WAD]);
      const action = await encodeTxData(colony, "multicall", [[action1]]);
      const nestedAction = await encodeTxData(colony, "multicall", [[action]]);

      await checkErrorRevert(
        multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [nestedAction]),
        "colony-multisig-no-nested-multicall"
      );
    });

    it("when you propose a motion, you implicitly approve it", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action]);

      const motionId = await multisigPermissions.getMotionCount();
      // let motion = await multisigPermissions.getMotion(motionId);
      let rootApprovalCount = await multisigPermissions.getMotionRoleApprovalCount(motionId, ROOT_ROLE);
      expect(rootApprovalCount).to.eq.BN(1);
      let userApproval = await multisigPermissions.getUserApproval(motionId, USER0, ROOT_ROLE);
      expect(userApproval).to.equal(true);

      // And can remove the approval
      await multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, false);
      // motion = await multisigPermissions.getMotion(motionId);
      rootApprovalCount = await multisigPermissions.getMotionRoleApprovalCount(motionId, ROOT_ROLE);
      expect(rootApprovalCount).to.eq.BN(0);
      userApproval = await multisigPermissions.getUserApproval(motionId, USER0, ROOT_ROLE);
      expect(userApproval).to.equal(false);
    });
  });

  describe("Handling permissions", async () => {
    it("multisig root can award core root", async () => {
      let userRoles = await colony.getUserRoles(USER2, 1);
      expect(userRoles).to.equal("0x0000000000000000000000000000000000000000000000000000000000000000");

      const action = await encodeTxData(colony, "setUserRoles", [
        1,
        UINT256_MAX,
        USER2,
        1,
        ethers.utils.hexZeroPad(ethers.BigNumber.from(2).pow(ROOT_ROLE).toHexString(), 32),
      ]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action]);

      const motionId = await multisigPermissions.getMotionCount();
      await multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, true, { from: USER1 });

      await multisigPermissions.execute(motionId);

      userRoles = await colony.getUserRoles(USER2, 1);
      expect(userRoles).to.equal("0x0000000000000000000000000000000000000000000000000000000000000002");
    });

    it("core root can award multisig root", async () => {
      let userRoles = await multisigPermissions.getUserRoles(USER2, 1);
      expect(userRoles).to.equal("0x0000000000000000000000000000000000000000000000000000000000000000");

      await multisigPermissions.setUserRoles(
        1,
        UINT256_MAX,
        USER2,
        1,
        ethers.utils.hexZeroPad(ethers.BigNumber.from(2).pow(ROOT_ROLE).toHexString(), 32)
      );

      userRoles = await multisigPermissions.getUserRoles(USER2, 1);
      expect(userRoles).to.equal("0x0000000000000000000000000000000000000000000000000000000000000002");
    });

    it("core architecture can award multisig funding only in subdomains", async () => {
      // Give user 2 core architecture
      await colony.setUserRoles(1, UINT256_MAX, USER2, 1, ethers.utils.hexZeroPad(ethers.BigNumber.from(2).pow(ARCHITECTURE_ROLE).toHexString(), 32));

      // Try to award multisig FUNDING in root domain
      await checkErrorRevert(
        multisigPermissions.setUserRoles(
          1,
          UINT256_MAX,
          USER2,
          1,
          ethers.utils.hexZeroPad(ethers.BigNumber.from(2).pow(FUNDING_ROLE).toHexString(), 32),
          { from: USER2 }
        ),
        "multisig-caller-not-correct-permissions"
      );

      // Try to award multisig FUNDING in a child domain
      await multisigPermissions.setUserRoles(1, 0, USER2, 2, ethers.utils.hexZeroPad(ethers.BigNumber.from(2).pow(FUNDING_ROLE).toHexString(), 32), {
        from: USER2,
      });
    });

    it("multisig architecture can award core funding only in subdomains", async () => {
      await multisigPermissions.setUserRoles(
        1,
        UINT256_MAX,
        USER2,
        1,
        ethers.utils.hexZeroPad(ethers.BigNumber.from(2).pow(ARCHITECTURE_ROLE).toHexString(), 32)
      );

      // Try to create a motion to award core funding in root
      let action = await encodeTxData(colony, "setUserRoles", [
        1,
        UINT256_MAX,
        USER2,
        1,
        ethers.utils.hexZeroPad(ethers.BigNumber.from(2).pow(FUNDING_ROLE).toHexString(), 32),
      ]);

      await checkErrorRevert(
        multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action], { from: USER2 }),
        "colony-multisig-no-permissions"
      );

      // Can create motions to award core funding in subdomain
      action = await encodeTxData(colony, "setUserRoles", [
        1,
        0,
        USER2,
        2,
        ethers.utils.hexZeroPad(ethers.BigNumber.from(2).pow(FUNDING_ROLE).toHexString(), 32),
      ]);
      await multisigPermissions.createMotion(1, 0, [colony.address], [action], { from: USER2 });
    });

    it(`multisig architecture can create motions to award multisig funding only in subdomains,
        and cannot award those permissions directly`, async () => {
      await multisigPermissions.setUserRoles(
        1,
        UINT256_MAX,
        USER2,
        1,
        ethers.utils.hexZeroPad(ethers.BigNumber.from(2).pow(ARCHITECTURE_ROLE).toHexString(), 32)
      );

      await checkErrorRevert(
        multisigPermissions.setUserRoles(1, 0, USER2, 2, ethers.utils.hexZeroPad(ethers.BigNumber.from(2).pow(FUNDING_ROLE).toHexString(), 32), {
          from: USER2,
        }),
        "multisig-caller-not-correct-permissions"
      );

      const action = await encodeTxData(multisigPermissions, "setUserRoles", [
        1,
        0,
        USER2,
        2,
        ethers.utils.hexZeroPad(ethers.BigNumber.from(2).pow(FUNDING_ROLE).toHexString(), 32),
      ]);

      await multisigPermissions.createMotion(1, 0, [multisigPermissions.address], [action], { from: USER2 });
    });

    it(`multisig root can create motions to award multisig root and cannot award those permissions directly`, async () => {
      await multisigPermissions.setUserRoles(
        1,
        UINT256_MAX,
        USER2,
        1,
        ethers.utils.hexZeroPad(ethers.BigNumber.from(2).pow(ROOT_ROLE).toHexString(), 32)
      );

      await checkErrorRevert(
        multisigPermissions.setUserRoles(
          1,
          UINT256_MAX,
          USER2,
          1,
          ethers.utils.hexZeroPad(ethers.BigNumber.from(2).pow(ROOT_ROLE).toHexString(), 32),
          { from: USER2 }
        ),
        "multisig-caller-not-correct-permissions"
      );

      const action = await encodeTxData(colony, "setUserRoles", [
        1,
        UINT256_MAX,
        USER2,
        1,
        ethers.utils.hexZeroPad(ethers.BigNumber.from(2).pow(ROOT_ROLE).toHexString(), 32),
      ]);

      await multisigPermissions.createMotion(1, UINT256_MAX, [multisigPermissions.address], [action], { from: USER2 });
    });

    it("The domain skill threshold for execution changes as expected", async () => {
      await multisigPermissions.initialise(2);
      // By default, it's the global threshold
      const domain = await colony.getDomain(1);

      let res = await multisigPermissions.getDomainSkillRoleThreshold(domain.skillId, ROOT_ROLE);
      expect(res).to.eq.BN(2);

      // Update global threshold
      await multisigPermissions.initialise(3);
      res = await multisigPermissions.getDomainSkillRoleThreshold(domain.skillId, ROOT_ROLE);
      expect(res).to.eq.BN(3);

      // If we set it to something specific for the domain
      await multisigPermissions.setDomainSkillThreshold(domain.skillId, 2);
      res = await multisigPermissions.getDomainSkillRoleThreshold(domain.skillId, ROOT_ROLE);
      expect(res).to.eq.BN(2);

      // Changing the global threshold has no effect
      await multisigPermissions.initialise(1);
      res = await multisigPermissions.getDomainSkillRoleThreshold(domain.skillId, ROOT_ROLE);
      expect(res).to.eq.BN(2);

      // Add users with the relevant permission
      await giveUserMultisigRoot(multisigPermissions, USER2);
      await giveUserMultisigRoot(multisigPermissions, USER3);
      await giveUserMultisigRoot(multisigPermissions, USER4);
      await giveUserMultisigRoot(multisigPermissions, USER5);
      await giveUserMultisigRoot(multisigPermissions, USER6);

      // No effect
      res = await multisigPermissions.getDomainSkillRoleThreshold(domain.skillId, ROOT_ROLE);
      expect(res).to.eq.BN(2);

      // Set default to be relative
      await multisigPermissions.initialise(0);

      // Still no change
      res = await multisigPermissions.getDomainSkillRoleThreshold(domain.skillId, ROOT_ROLE);
      expect(res).to.eq.BN(2);

      // Remove the domain-specific threshold, drops to nUsersWithSpecificPermissions / 2 + 1
      await multisigPermissions.setDomainSkillThreshold(domain.skillId, 0);

      res = await multisigPermissions.getDomainSkillRoleThreshold(domain.skillId, ROOT_ROLE);
      expect(res).to.eq.BN(4);
    });
  });

  describe("Approving motions", async () => {
    it("if you don't have the right permissions, you cannot approve", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action]);
      const motionId = await multisigPermissions.getMotionCount();

      // No permissions
      await checkErrorRevert(multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, true, { from: USER2 }), "colony-multisig-no-permissions");

      // Not right permissions

      await multisigPermissions.setUserRoles(
        1,
        UINT256_MAX,
        USER2,
        1,
        ethers.utils.hexZeroPad(ethers.BigNumber.from(2).pow(ARBITRATION_ROLE).toHexString(), 32)
      );
      await checkErrorRevert(multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, true, { from: USER2 }), "colony-multisig-no-permissions");
      await multisigPermissions.setUserRoles(1, UINT256_MAX, USER2, 1, ethers.utils.hexZeroPad(ethers.BigNumber.from(0).toHexString(), 32));
    });

    it("if you don't show the right permissions, you cannot approve", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action]);
      const motionId = await multisigPermissions.getMotionCount();
      // Not right permissions
      await checkErrorRevert(multisigPermissions.changeApproval(motionId, 1, 0, true), "colony-multisig-not-same-domain");
    });

    it("can withdraw approvals", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action]);

      const motionId = await multisigPermissions.getMotionCount();
      await checkErrorRevert(multisigPermissions.execute(motionId), "colony-multisig-permissions-not-enough-approvals");

      // Approve
      await multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, true, { from: USER1 });
      let approvalCount = await multisigPermissions.getMotionRoleApprovalCount(motionId, ROOT_ROLE);
      expect(approvalCount).to.eq.BN(2);

      let userApproval = await multisigPermissions.getUserApproval(motionId, USER1, ROOT_ROLE);
      expect(userApproval).to.equal(true);

      // Could call if we wanted
      await multisigPermissions.execute.estimateGas(motionId);
      // Unapprove
      await multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, false, { from: USER1 });
      approvalCount = await multisigPermissions.getMotionRoleApprovalCount(motionId, ROOT_ROLE);
      expect(approvalCount).to.eq.BN(1);
      userApproval = await multisigPermissions.getUserApproval(motionId, USER1, ROOT_ROLE);
      expect(userApproval).to.equal(false);

      // Can't call
      await checkErrorRevert(multisigPermissions.execute(motionId), "colony-multisig-permissions-not-enough-approvals");
    });

    it("overallApprovalTimestamp updates as expected as moving above/below approval limit", async () => {
      const domain = await colony.getDomain(1);
      await multisigPermissions.setDomainSkillThreshold(domain.skillId, 1);

      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action]);

      const motionId = await multisigPermissions.getMotionCount();
      let motion = await multisigPermissions.getMotion(motionId);

      const firstTimestamp = motion.overallApprovalTimestamp;
      expect(firstTimestamp).to.be.gt.BN(0);

      await multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, true, { from: USER1 });
      motion = await multisigPermissions.getMotion(motionId);
      expect(firstTimestamp).to.eq.BN(motion.overallApprovalTimestamp);

      await multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, false, { from: USER1 });
      motion = await multisigPermissions.getMotion(motionId);
      expect(firstTimestamp).to.eq.BN(motion.overallApprovalTimestamp);

      await multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, false);
      motion = await multisigPermissions.getMotion(motionId);
      expect(motion.overallApprovalTimestamp).to.eq.BN(0);
    });

    it("overallApprovalTimestamp updates as best we can do when threshold is changed", async () => {
      const domain = await colony.getDomain(1);
      await multisigPermissions.setDomainSkillThreshold(domain.skillId, 1);

      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action]);

      const motionId = await multisigPermissions.getMotionCount();
      let motion = await multisigPermissions.getMotion(motionId);

      const firstTimestamp = motion.overallApprovalTimestamp;
      expect(firstTimestamp).to.be.gt.BN(0);

      // Change threshold
      await multisigPermissions.setDomainSkillThreshold(domain.skillId, 2);
      await forwardTime(100, this);

      await multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, true, { from: USER1 });
      motion = await multisigPermissions.getMotion(motionId);
      expect(firstTimestamp).to.be.lt.BN(motion.overallApprovalTimestamp);
    });

    it("can withdraw approvals even if you don't have permissions to approve any more", async () => {
      const domain = await colony.getDomain(1);
      await multisigPermissions.setDomainSkillThreshold(domain.skillId, 2);

      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action]);

      const motionId = await multisigPermissions.getMotionCount();

      // Approve
      await multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, true, { from: USER1 });
      let approvalCount = await multisigPermissions.getMotionRoleApprovalCount(motionId, ROOT_ROLE);
      expect(approvalCount).to.eq.BN(2);

      // Remove permissions
      await multisigPermissions.setUserRoles(1, UINT256_MAX, USER1, 1, ethers.utils.hexZeroPad(0, 32));

      let userApproval = await multisigPermissions.getUserApproval(motionId, USER1, ROOT_ROLE);
      expect(userApproval).to.equal(true);

      // Unapprove
      await multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, false, { from: USER1 });
      approvalCount = await multisigPermissions.getMotionRoleApprovalCount(motionId, ROOT_ROLE);
      expect(approvalCount).to.eq.BN(1);
      userApproval = await multisigPermissions.getUserApproval(motionId, USER1, ROOT_ROLE);
      expect(userApproval).to.equal(false);

      // Can't call
      await checkErrorRevert(multisigPermissions.execute(motionId), "colony-multisig-permissions-not-enough-approvals");
    });

    it("can't repeatedly approve or unapprove and have an effect", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action]);

      const motionId = await multisigPermissions.getMotionCount();

      // Approve again
      await multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, true);
      // But no effect
      let approvalCount = await multisigPermissions.getMotionRoleApprovalCount(motionId, ROOT_ROLE);
      expect(approvalCount).to.eq.BN(1);

      // Another user approves
      await multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, true, { from: USER1 });
      approvalCount = await multisigPermissions.getMotionRoleApprovalCount(motionId, ROOT_ROLE);
      expect(approvalCount).to.eq.BN(2);

      // Unapprove
      await multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, false);
      approvalCount = await multisigPermissions.getMotionRoleApprovalCount(motionId, ROOT_ROLE);
      expect(approvalCount).to.eq.BN(1);
      let userApproval = await multisigPermissions.getUserApproval(motionId, USER0, ROOT_ROLE);
      expect(userApproval).to.equal(false);

      // Unapprove again
      await multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, false);
      approvalCount = await multisigPermissions.getMotionRoleApprovalCount(motionId, ROOT_ROLE);
      expect(approvalCount).to.eq.BN(1);
      userApproval = await multisigPermissions.getUserApproval(motionId, USER0, ROOT_ROLE);
      expect(userApproval).to.equal(false);
    });

    it.skip("can approve if you have permissions in a parent domain, but you don't count for calculating the threshold", async () => {
      const action = await encodeTxData(colony, "makeExpenditure", [1, 0, 2]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action]);
    });
  });

  describe("Executing motions", async () => {
    it("can't execute an action requiring root permissions without approvals", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action]);

      const motionId = await multisigPermissions.getMotionCount();
      await checkErrorRevert(multisigPermissions.execute(motionId), "colony-multisig-permissions-not-enough-approvals");

      await multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, true);
      await checkErrorRevert(multisigPermissions.execute(motionId), "colony-multisig-permissions-not-enough-approvals");
      await multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, true, { from: USER1 });

      const amountBefore = await token.totalSupply();

      await multisigPermissions.execute(motionId);

      const amountAfter = await token.totalSupply();

      expect(amountAfter.sub(amountBefore)).to.eq.BN(WAD);
    });

    it("can't execute a motion that fails until a week after it meets the approval threshold", async () => {
      const action = "0x12345678";
      await multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action]);
      const motionId = await multisigPermissions.getMotionCount();
      await multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, true, { from: USER1 });
      await checkErrorRevert(multisigPermissions.execute(motionId), "colony-multisig-failed-not-one-week");

      await forwardTime(7 * 3600 * 24, this);

      await multisigPermissions.execute(motionId);
    });

    it("anyone can execute a motion so long as it has approvals", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action]);

      const motionId = await multisigPermissions.getMotionCount();

      await multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, true, { from: USER1 });

      const amountBefore = await token.totalSupply();

      await multisigPermissions.execute(motionId, { from: USER2 });

      const amountAfter = await token.totalSupply();

      expect(amountAfter.sub(amountBefore)).to.eq.BN(WAD);
    });

    it("can't execute multiple times", async () => {
      const action = await encodeTxData(colony, "mintTokens", [WAD]);
      await multisigPermissions.createMotion(1, UINT256_MAX, [colony.address], [action]);

      const motionId = await multisigPermissions.getMotionCount();

      await multisigPermissions.changeApproval(motionId, 1, UINT256_MAX, true, { from: USER1 });

      await multisigPermissions.execute(motionId, { from: USER2 });
      await checkErrorRevert(multisigPermissions.execute(motionId, { from: USER2 }), "multisig-motion-already-executed");
    });
  });
});
