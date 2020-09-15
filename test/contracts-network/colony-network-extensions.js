/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";
import shortid from "shortid";
import { BN } from "bn.js";
import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";

import { checkErrorRevert, web3GetBalance } from "../../helpers/test-helper";
import { setupEtherRouter } from "../../helpers/upgradable-contracts";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, setupRandomColony } from "../../helpers/test-data-generator";
import { UINT256_MAX } from "../../helpers/constants";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ColonyExtension = artifacts.require("ColonyExtension");
const TestExtension0 = artifacts.require("TestExtension0");
const TestExtension1 = artifacts.require("TestExtension1");
const TestExtension2 = artifacts.require("TestExtension2");
const TestExtension3 = artifacts.require("TestExtension3");
const Resolver = artifacts.require("Resolver");
const IMetaColony = artifacts.require("IMetaColony");

contract("Colony Network Extensions", (accounts) => {
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

    resolver0 = await setupResolver(0);
    resolver1 = await setupResolver(1);
    resolver2 = await setupResolver(2);
    resolver3 = await setupResolver(3);

    await metaColony.addExtension(TEST_EXTENSION, resolver1.address);
    await metaColony.addExtension(TEST_EXTENSION, resolver2.address);
    await metaColony.addExtension(TEST_EXTENSION, resolver3.address);
  });

  beforeEach(async () => {
    ({ colony } = await setupRandomColony(colonyNetwork));
    await colony.addDomain(1, UINT256_MAX, 1); // Domain 2

    await colony.setArchitectureRole(1, UINT256_MAX, ARCHITECT, 1, true);
  });

  describe("without the colony network", () => {
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

    it("allows the meta colony to add new extensions", async () => {
      // Versions start at 1
      await checkErrorRevert(metaColony.addExtension(extensionId, resolver0.address), "colony-network-extension-bad-version");

      await metaColony.addExtension(extensionId, resolver1.address);
      await metaColony.addExtension(extensionId, resolver2.address);

      const resolverAddress = await colonyNetwork.getExtensionResolver(extensionId, 1);
      expect(resolverAddress).to.equal(resolver1.address);
    });

    it("allows the meta colony to overwrite existing extensions", async () => {
      await metaColony.addExtension(extensionId, resolver1.address);

      await checkErrorRevert(metaColony.addExtension(extensionId, resolver1.address), "colony-network-extension-already-set");
    });

    it("does not allow the meta colony to add versions out of order", async () => {
      await checkErrorRevert(metaColony.addExtension(extensionId, resolver2.address), "colony-network-extension-bad-version");

      await metaColony.addExtension(extensionId, resolver1.address);
      await metaColony.addExtension(extensionId, resolver2.address);
    });

    it("does not allow the meta colony to add a null resolver", async () => {
      await checkErrorRevert(metaColony.addExtension(extensionId, ethers.constants.AddressZero), "colony-network-extension-bad-resolver");
    });

    it("does not allow other colonies to add new extensions", async () => {
      const fakeMetaColony = await IMetaColony.at(colony.address);

      await checkErrorRevert(fakeMetaColony.addExtension(extensionId, resolver1.address), "colony-caller-must-be-meta-colony");
    });
  });

  describe("installing extensions", () => {
    it("allows a root user to install an extension with any version", async () => {
      await colony.installExtension(TEST_EXTENSION, 1, { from: ROOT });

      const extensionAddress = await colonyNetwork.getExtensionInstallation(TEST_EXTENSION, colony.address);
      const extension = await TestExtension1.at(extensionAddress);
      const owner = await extension.owner();
      expect(owner).to.equal(colonyNetwork.address);

      // Only colonyNetwork can install the extension
      await checkErrorRevert(extension.install(colony.address), "ds-auth-unauthorized");
    });

    it("does not allow an extension to be installed with a nonexistent resolver", async () => {
      await checkErrorRevert(colony.installExtension(TEST_EXTENSION, 0, { from: ROOT }), "colony-network-extension-bad-version");
    });

    it("does not allow an extension to be installed twice", async () => {
      await colony.installExtension(TEST_EXTENSION, 1, { from: ROOT });

      await checkErrorRevert(colony.installExtension(TEST_EXTENSION, 1, { from: ROOT }), "colony-network-extension-already-installed");
    });
  });

  describe("upgrading extensions", () => {
    it("allows root users to upgrade an extension", async () => {
      await colony.installExtension(TEST_EXTENSION, 1, { from: ROOT });

      const extensionAddress = await colonyNetwork.getExtensionInstallation(TEST_EXTENSION, colony.address);
      expect(extensionAddress).to.not.equal(ethers.constants.AddressZero);

      let extension = await ColonyExtension.at(extensionAddress);
      let version = await extension.version();
      expect(version).to.eq.BN(1);

      await colony.upgradeExtension(TEST_EXTENSION, 2, { from: ROOT });

      extension = await ColonyExtension.at(extensionAddress);
      version = await extension.version();
      expect(version).to.eq.BN(2);
    });

    it("does not allow non-root users to upgrade an extension", async () => {
      await colony.installExtension(TEST_EXTENSION, 1, { from: ROOT });

      await checkErrorRevert(colony.upgradeExtension(TEST_EXTENSION, 2, { from: ARCHITECT }), "ds-auth-unauthorized");
      await checkErrorRevert(colony.upgradeExtension(TEST_EXTENSION, 2, { from: USER }), "ds-auth-unauthorized");
    });

    it("does not allow upgrading a extension which is not installed", async () => {
      await checkErrorRevert(colony.upgradeExtension(TEST_EXTENSION, 2, { from: ROOT }), "colony-network-extension-not-installed");
    });

    it("does not allow upgrading a extension to a version which does not exist", async () => {
      await colony.installExtension(TEST_EXTENSION, 3, { from: ROOT });

      // Can't upgrade from version 3 to nonexistent 4
      await checkErrorRevert(colony.upgradeExtension(TEST_EXTENSION, 4, { from: ROOT }), "colony-network-extension-bad-version");
    });

    it("does not allow upgrading a extension out of order", async () => {
      await colony.installExtension(TEST_EXTENSION, 1, { from: ROOT });

      await checkErrorRevert(colony.upgradeExtension(TEST_EXTENSION, 3, { from: ROOT }), "colony-network-extension-bad-increment");
    });
  });

  describe("deprecating extensions", () => {
    it("allows root users to deprecate and undeprecate an extension", async () => {
      await colony.installExtension(TEST_EXTENSION, 1, { from: ROOT });

      const extensionAddress = await colonyNetwork.getExtensionInstallation(TEST_EXTENSION, colony.address);
      const extension = await TestExtension1.at(extensionAddress);

      await extension.foo();

      await colony.deprecateExtension(TEST_EXTENSION, true, { from: ROOT });

      await checkErrorRevert(extension.foo(), "colony-extension-deprecated");

      await colony.deprecateExtension(TEST_EXTENSION, false, { from: ROOT });

      await extension.foo();
    });

    it("does not allow non-root users to deprecate an extension", async () => {
      await colony.installExtension(TEST_EXTENSION, 1, { from: ROOT });

      await checkErrorRevert(colony.deprecateExtension(TEST_EXTENSION, true, { from: ARCHITECT }), "ds-auth-unauthorized");
    });
  });

  describe("uninstalling extensions", () => {
    it("allows root users to uninstall an extension and send ether to the beneficiary", async () => {
      await colony.installExtension(TEST_EXTENSION, 1, { from: ROOT });

      const extensionAddress = await colonyNetwork.getExtensionInstallation(TEST_EXTENSION, colony.address);
      const extension = await TestExtension1.at(extensionAddress);
      await extension.send(100);

      // Only colonyNetwork can uninstall
      await checkErrorRevert(extension.uninstall(), "ds-auth-unauthorized");

      await colony.uninstallExtension(TEST_EXTENSION, { from: ROOT });

      const colonyBalance = await web3GetBalance(colony.address);
      expect(new BN(colonyBalance)).to.eq.BN(100);
    });

    it("does not allow non-root users to uninstall an extension", async () => {
      await checkErrorRevert(colony.uninstallExtension(TEST_EXTENSION, { from: ARCHITECT }), "ds-auth-unauthorized");

      await checkErrorRevert(colony.uninstallExtension(TEST_EXTENSION, { from: USER }), "ds-auth-unauthorized");
    });

    it("does not allow root users to uninstall an extension which is not installed", async () => {
      await checkErrorRevert(colony.uninstallExtension(TEST_EXTENSION, { from: ROOT }), "colony-network-extension-not-installed");
    });
  });
});
