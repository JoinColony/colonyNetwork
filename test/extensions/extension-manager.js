/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";
import shortid from "shortid";
import { BN } from "bn.js";
import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";

import { checkErrorRevert, web3GetBalance, rolesToBytes32 } from "../../helpers/test-helper";
import { setupEtherRouter } from "../../helpers/upgradable-contracts";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, setupRandomColony } from "../../helpers/test-data-generator";
import { ROOT_ROLE, ARBITRATION_ROLE, ARCHITECTURE_ROLE, FUNDING_ROLE, ADMINISTRATION_ROLE, UINT256_MAX } from "../../helpers/constants";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ExtensionManager = artifacts.require("ExtensionManager");
const ColonyExtension = artifacts.require("ColonyExtension");
const TestExtension0 = artifacts.require("TestExtension0");
const TestExtension1 = artifacts.require("TestExtension1");
const TestExtension2 = artifacts.require("TestExtension2");
const TestExtension3 = artifacts.require("TestExtension3");
const Resolver = artifacts.require("Resolver");
const IMetaColony = artifacts.require("IMetaColony");

contract("ExtensionManager", (accounts) => {
  let extensionManager;
  let colonyNetwork;
  let metaColony;
  let colony;

  let resolver0;
  let resolver1;
  let resolver2;
  let resolver3;

  const ROOT = accounts[0];
  const ARCHITECT = accounts[1];
  const USER = accounts[2];

  const TEST_EXTENSION = soliditySha3("TestExtension");

  async function setupResolver(versionId) {
    const resolver = await Resolver.new();
    if (versionId === 0) {
      const testExtension0 = await TestExtension0.new();
      await setupEtherRouter("TestExtension0", { TestExtension0: testExtension0.address }, resolver);
    } else if (versionId === 1) {
      const testExtension1 = await TestExtension1.new();
      await setupEtherRouter("TestExtension1", { TestExtension1: testExtension1.address }, resolver);
    } else if (versionId === 2) {
      const testExtension2 = await TestExtension2.new();
      await setupEtherRouter("TestExtension2", { TestExtension2: testExtension2.address }, resolver);
    } else if (versionId === 3) {
      const testExtension3 = await TestExtension3.new();
      await setupEtherRouter("TestExtension3", { TestExtension3: testExtension3.address }, resolver);
    }
    return resolver;
  }

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();

    extensionManager = await ExtensionManager.new(colonyNetwork.address);
    await metaColony.setExtensionManager(extensionManager.address);

    resolver0 = await setupResolver(0);
    resolver1 = await setupResolver(1);
    resolver2 = await setupResolver(2);
    resolver3 = await setupResolver(3);

    await metaColony.addExtension(TEST_EXTENSION, resolver1.address, rolesToBytes32([FUNDING_ROLE, ADMINISTRATION_ROLE]));
    await metaColony.addExtension(TEST_EXTENSION, resolver2.address, ethers.constants.HashZero);
    await metaColony.addExtension(TEST_EXTENSION, resolver3.address, ethers.constants.HashZero);
  });

  beforeEach(async () => {
    ({ colony } = await setupRandomColony(colonyNetwork));
    await colony.addDomain(1, UINT256_MAX, 1); // Domain 2

    await colony.setRootRole(extensionManager.address, true);
    await colony.setArchitectureRole(1, UINT256_MAX, ARCHITECT, 1, true);
  });

  describe("without the extension manager", () => {
    it("allows a colony to install an extension manually (and without a resolver)", async () => {
      const extension = await TestExtension1.new();

      // Can install directly
      await extension.install(colony.address);

      // Can only install once
      await checkErrorRevert(extension.install(colony.address), "extension-already-installed");

      // Cannot send ether by default as expected
      await checkErrorRevert(extension.send(100));
      // But can using separate payable function
      await extension.sendEther({ value: 100 });

      // Can uninstall as expected, with ether going to the colony
      await extension.uninstall();
      const colonyBalance = await web3GetBalance(colony.address);
      expect(new BN(colonyBalance)).to.eq.BN(100);
    });
  });

  describe("adding extensions", () => {
    let extensionId;

    beforeEach(async () => {
      extensionId = soliditySha3(shortid.generate());
    });

    it("allows the meta colony to add new extensions to the manager", async () => {
      // Versions start at 1
      await checkErrorRevert(metaColony.addExtension(extensionId, resolver0.address, ethers.constants.HashZero), "extension-manager-bad-version");

      await metaColony.addExtension(extensionId, resolver1.address, ethers.constants.HashZero);
      await metaColony.addExtension(extensionId, resolver2.address, ethers.constants.HashZero);

      const resolverAddress = await extensionManager.getResolver(extensionId, 1);
      expect(resolverAddress).to.equal(resolver1.address);
    });

    it("allows the meta colony to overwrite existing extensions", async () => {
      await metaColony.addExtension(extensionId, resolver1.address, resolver2.address);
    });

    it("does not allow the meta colony to add versions out of order", async () => {
      await checkErrorRevert(metaColony.addExtension(extensionId, resolver2.address, ethers.constants.HashZero), "extension-manager-bad-version");

      await metaColony.addExtension(extensionId, resolver1.address, ethers.constants.HashZero);
      await metaColony.addExtension(extensionId, resolver2.address, ethers.constants.HashZero);
    });

    it("does not allow the meta colony to pass roles after version 1", async () => {
      await metaColony.addExtension(extensionId, resolver1.address, rolesToBytes32([ROOT_ROLE]));

      await checkErrorRevert(
        metaColony.addExtension(extensionId, resolver2.address, rolesToBytes32([ROOT_ROLE])),
        "extension-manager-nonempty-roles"
      );
    });

    it("does not allow the meta colony to add a null resolver", async () => {
      await checkErrorRevert(
        metaColony.addExtension(extensionId, ethers.constants.AddressZero, ethers.constants.HashZero),
        "extension-manager-bad-resolver"
      );
    });

    it("does not allow other colonies to add new extensions to the manager", async () => {
      const fakeMetaColony = await IMetaColony.at(colony.address);
      await checkErrorRevert(
        fakeMetaColony.addExtension(extensionId, resolver1.address, ethers.constants.HashZero),
        "colony-caller-must-be-meta-colony"
      );
    });

    it("does not allow anyone but the colony network to communicate directly with the manager", async () => {
      await checkErrorRevert(
        extensionManager.addExtension(extensionId, resolver1.address, ethers.constants.HashZero),
        "extension-manager-not-network"
      );
    });
  });

  describe("installing extensions", () => {
    it("allows a root user to install an extension with any version", async () => {
      await extensionManager.installExtension(TEST_EXTENSION, 1, colony.address, { from: ROOT });

      const extensionAddress = await extensionManager.getExtension(TEST_EXTENSION, colony.address);
      const extension = await TestExtension1.at(extensionAddress);
      const owner = await extension.owner();
      expect(owner).to.equal(extensionManager.address);

      // Only extensionManager can install the extension
      await checkErrorRevert(extension.install(colony.address), "ds-auth-unauthorized");
    });

    it("allows non root users to install an extension with the latest version only", async () => {
      await checkErrorRevert(
        extensionManager.installExtension(TEST_EXTENSION, 1, colony.address, { from: USER }),
        "extension-manager-root-or-latest"
      );

      await extensionManager.installExtension(TEST_EXTENSION, 3, colony.address, { from: USER });
    });

    it("does not allow an extension to be installed with a nonexistent resolver", async () => {
      await checkErrorRevert(extensionManager.installExtension(TEST_EXTENSION, 0, colony.address, { from: ROOT }), "extension-manager-bad-version");
    });

    it("does not allow an extension to be installed twice", async () => {
      await extensionManager.installExtension(TEST_EXTENSION, 1, colony.address, { from: ROOT });

      await checkErrorRevert(
        extensionManager.installExtension(TEST_EXTENSION, 1, colony.address, { from: ROOT }),
        "extension-manager-already-installed"
      );
    });
  });

  describe("enabling and disabling extensions", () => {
    beforeEach(async () => {
      await extensionManager.installExtension(TEST_EXTENSION, 1, colony.address, { from: ROOT });
    });

    it("allows users to see the required roles for the extension", async () => {
      const roles = await extensionManager.getRoles(TEST_EXTENSION);
      expect(roles).to.equal(rolesToBytes32([FUNDING_ROLE, ADMINISTRATION_ROLE]));
    });

    it("allows a root user to enable and disable an extension", async () => {
      await extensionManager.enableExtension(TEST_EXTENSION, colony.address, UINT256_MAX, 1, UINT256_MAX, 1, { from: ROOT });

      const extensionAddress = await extensionManager.getExtension(TEST_EXTENSION, colony.address);
      let hasFundingRole = await colony.hasUserRole(extensionAddress, 1, FUNDING_ROLE);
      let hasAdministrationRole = await colony.hasUserRole(extensionAddress, 1, ADMINISTRATION_ROLE);
      expect(hasFundingRole).to.be.true;
      expect(hasAdministrationRole).to.be.true;

      await extensionManager.disableExtension(TEST_EXTENSION, colony.address, UINT256_MAX, 1, UINT256_MAX, 1, { from: ROOT });

      hasFundingRole = await colony.hasUserRole(extensionAddress, 1, FUNDING_ROLE);
      hasAdministrationRole = await colony.hasUserRole(extensionAddress, 1, ADMINISTRATION_ROLE);
      expect(hasFundingRole).to.be.false;
      expect(hasAdministrationRole).to.be.false;
    });

    it("allows an architect user to enable an extension in a subdomain only", async () => {
      // Domain 1 fails
      await checkErrorRevert(
        extensionManager.enableExtension(TEST_EXTENSION, colony.address, 0, 1, 0, 1, { from: ARCHITECT }),
        "extension-manager-unauthorized"
      );

      // Domain 1 fails
      await checkErrorRevert(
        extensionManager.disableExtension(TEST_EXTENSION, colony.address, 0, 1, 0, 1, { from: ARCHITECT }),
        "extension-manager-unauthorized"
      );

      // Domain 2 succeeds
      await extensionManager.enableExtension(TEST_EXTENSION, colony.address, 0, 1, 0, 2, { from: ARCHITECT });
      await extensionManager.disableExtension(TEST_EXTENSION, colony.address, 0, 1, 0, 2, { from: ROOT });
    });

    it("does not allow a non root or architect user to enable an extension", async () => {
      // Domain 1 fails
      await checkErrorRevert(
        extensionManager.enableExtension(TEST_EXTENSION, colony.address, 0, 1, 0, 1, { from: USER }),
        "extension-manager-unauthorized"
      );

      // Domain 2 fails
      await checkErrorRevert(
        extensionManager.enableExtension(TEST_EXTENSION, colony.address, 0, 1, 0, 2, { from: USER }),
        "extension-manager-unauthorized"
      );
    });

    it("does not allow an extension which requires root permission to be enabled in a subdomain", async () => {
      const extensionId = soliditySha3(shortid.generate());

      await metaColony.addExtension(extensionId, resolver1.address, rolesToBytes32([ROOT_ROLE]));
      await extensionManager.installExtension(extensionId, 1, colony.address);

      await checkErrorRevert(extensionManager.enableExtension(extensionId, colony.address, 0, 1, 0, 2, { from: ROOT }), "colony-bad-domain-for-role");

      await extensionManager.enableExtension(extensionId, colony.address, UINT256_MAX, 1, UINT256_MAX, 1, { from: ROOT });
    });

    it("allows an extension to be enabled with all roles", async () => {
      const allRoles = [ROOT_ROLE, ARBITRATION_ROLE, ARCHITECTURE_ROLE, FUNDING_ROLE, ADMINISTRATION_ROLE];
      const extensionId = soliditySha3(shortid.generate());

      await metaColony.addExtension(extensionId, resolver1.address, rolesToBytes32(allRoles));
      await extensionManager.installExtension(extensionId, 1, colony.address);
      await extensionManager.enableExtension(extensionId, colony.address, UINT256_MAX, 1, UINT256_MAX, 1, { from: ROOT });
    });
  });

  describe("upgrading extensions", () => {
    it("allows root users to upgrade an extension", async () => {
      await extensionManager.installExtension(TEST_EXTENSION, 1, colony.address, { from: ROOT });

      const extensionAddress = await extensionManager.getExtension(TEST_EXTENSION, colony.address);
      expect(extensionAddress).to.not.equal(ethers.constants.AddressZero);

      let extension = await ColonyExtension.at(extensionAddress);
      let version = await extension.version();
      expect(version).to.eq.BN(1);

      await extensionManager.upgradeExtension(TEST_EXTENSION, colony.address, 2, { from: ROOT });

      extension = await ColonyExtension.at(extensionAddress);
      version = await extension.version();
      expect(version).to.eq.BN(2);
    });

    it("does not allow non-root users to upgrade an extension", async () => {
      await extensionManager.installExtension(TEST_EXTENSION, 1, colony.address, { from: ROOT });

      await checkErrorRevert(
        extensionManager.upgradeExtension(TEST_EXTENSION, colony.address, 2, { from: ARCHITECT }),
        "extension-manager-unauthorized"
      );

      await checkErrorRevert(extensionManager.upgradeExtension(TEST_EXTENSION, colony.address, 2, { from: USER }), "extension-manager-unauthorized");
    });

    it("does not allow upgrading a extension which is not installed", async () => {
      await checkErrorRevert(extensionManager.upgradeExtension(TEST_EXTENSION, colony.address, 2, { from: ROOT }), "extension-manager-not-installed");
    });

    it("does not allow upgrading a extension to a version which does not exist", async () => {
      await extensionManager.installExtension(TEST_EXTENSION, 3, colony.address, { from: ROOT });

      // Can't upgrade from version 3 to nonexistent 4
      await checkErrorRevert(extensionManager.upgradeExtension(TEST_EXTENSION, colony.address, 4, { from: ROOT }), "extension-manager-bad-version");
    });

    it("does not allow upgrading a extension out of order", async () => {
      await extensionManager.installExtension(TEST_EXTENSION, 1, colony.address, { from: ROOT });

      await checkErrorRevert(extensionManager.upgradeExtension(TEST_EXTENSION, colony.address, 3, { from: ROOT }), "extension-manager-bad-increment");
    });
  });

  describe("removing extensions", () => {
    it("allows root users to uninstall an extension and send ether to the beneficiary", async () => {
      await extensionManager.installExtension(TEST_EXTENSION, 1, colony.address, { from: ROOT });

      const extensionAddress = await extensionManager.getExtension(TEST_EXTENSION, colony.address);
      const extension = await TestExtension1.at(extensionAddress);
      await extension.send(100);

      // Only extensionManager can uninstall
      await checkErrorRevert(extension.uninstall(), "ds-auth-unauthorized");

      await extensionManager.uninstallExtension(TEST_EXTENSION, colony.address, { from: ROOT });

      const colonyBalance = await web3GetBalance(colony.address);
      expect(new BN(colonyBalance)).to.eq.BN(100);
    });

    it("does not allow non-root users to uninstall an extension", async () => {
      await checkErrorRevert(
        extensionManager.uninstallExtension(TEST_EXTENSION, colony.address, { from: ARCHITECT }),
        "extension-manager-unauthorized"
      );

      await checkErrorRevert(extensionManager.uninstallExtension(TEST_EXTENSION, colony.address, { from: USER }), "extension-manager-unauthorized");
    });

    it("does not allow root users to uninstall an extension which is not installed", async () => {
      await checkErrorRevert(extensionManager.uninstallExtension(TEST_EXTENSION, colony.address, { from: ROOT }), "extension-manager-not-installed");
    });
  });
});
