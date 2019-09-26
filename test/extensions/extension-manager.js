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
import { ROOT_ROLE, ARBITRATION_ROLE, ARCHITECTURE_ROLE, FUNDING_ROLE, ADMINISTRATION_ROLE } from "../../helpers/constants";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ExtensionManager = artifacts.require("ExtensionManager");
const OneTxPayment = artifacts.require("OneTxPayment");
const Resolver = artifacts.require("Resolver");
const IMetaColony = artifacts.require("IMetaColony");

contract("ExtensionManager", accounts => {
  let extensionManager;
  let colonyNetwork;
  let metaColony;
  let colony;

  const ROOT = accounts[0];
  const ARCHITECT = accounts[1];
  const USER = accounts[2];

  const COLONY_EXTENSION = soliditySha3("OneTxPayment");

  async function setupResolver() {
    const extension = await OneTxPayment.new();
    const resolver = await Resolver.new();
    await setupEtherRouter("OneTxPayment", { OneTxPayment: extension.address }, resolver);
    return resolver;
  }

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();

    extensionManager = await ExtensionManager.new(metaColony.address);

    const resolver = await setupResolver();
    await metaColony.addExtension(extensionManager.address, COLONY_EXTENSION, 1, resolver.address, [FUNDING_ROLE, ADMINISTRATION_ROLE]);
    await metaColony.addExtension(extensionManager.address, COLONY_EXTENSION, 2, resolver.address, [FUNDING_ROLE, ADMINISTRATION_ROLE]);
  });

  beforeEach(async () => {
    ({ colony } = await setupRandomColony(colonyNetwork));
    await colony.setRootRole(extensionManager.address, true);
    await colony.setArchitectureRole(1, 0, ARCHITECT, 1, true);
  });

  describe("without the extension manager", () => {
    it("allows a colony to install an extension manually (and without a resolver)", async () => {
      const extension = await OneTxPayment.new();

      // Can install directly
      await extension.install(colony.address);

      // Can only install once
      await checkErrorRevert(extension.install(colony.address), "extension-already-installed");

      // Can uninstall as expected
      await extension.send(100);
      await extension.uninstall(colony.address);
      const colonyBalance = await web3GetBalance(colony.address);
      expect(new BN(colonyBalance)).to.eq.BN(100);
    });
  });

  describe("adding extensions", () => {
    let extensionId;
    let resolver;

    beforeEach(async () => {
      extensionId = soliditySha3(shortid.generate());
      resolver = await setupResolver();
    });

    it("allows the meta colony to add new extensions to the manager", async () => {
      // Versions start at 1
      await checkErrorRevert(
        metaColony.addExtension(extensionManager.address, extensionId, 0, resolver.address, []),
        "extension-manager-bad-version"
      );

      await metaColony.addExtension(extensionManager.address, extensionId, 1, resolver.address, []);
      await metaColony.addExtension(extensionManager.address, extensionId, 2, resolver.address, []);

      const resolverAddress = await extensionManager.getResolver(extensionId, 1);
      expect(resolverAddress).to.equal(resolver.address);
    });

    it("does not allow the meta colony to overwrite existing extensions", async () => {
      await metaColony.addExtension(extensionManager.address, extensionId, 1, resolver.address, []);

      await checkErrorRevert(
        metaColony.addExtension(extensionManager.address, extensionId, 1, resolver.address, []),
        "extension-manager-already-added"
      );
    });

    it("does not allow the meta colony to add versions out of order", async () => {
      await checkErrorRevert(
        metaColony.addExtension(extensionManager.address, extensionId, 2, resolver.address, []),
        "extension-manager-bad-version"
      );

      await metaColony.addExtension(extensionManager.address, extensionId, 1, resolver.address, []);
      await metaColony.addExtension(extensionManager.address, extensionId, 2, resolver.address, []);
    });

    it("does not allow the meta colony to add a null resolver", async () => {
      await checkErrorRevert(
        metaColony.addExtension(extensionManager.address, extensionId, 1, ethers.constants.AddressZero, []),
        "extension-manager-bad-resolver"
      );
    });

    it("does not allow other colonies to add new extensions to the manager", async () => {
      const fakeMetaColony = await IMetaColony.at(colony.address);

      await checkErrorRevert(
        fakeMetaColony.addExtension(extensionManager.address, extensionId, 1, resolver.address, []),
        "extension-manager-not-metacolony"
      );
    });
  });

  describe("installing extensions (& user authorizations)", () => {
    it("allows a root user to install an extension", async () => {
      await extensionManager.installExtension(COLONY_EXTENSION, 1, colony.address, 0, 1, 0, 1, { from: ROOT });
      const extensionAddress = await extensionManager.getExtension(COLONY_EXTENSION, 1, colony.address, 1);

      const extension = await OneTxPayment.at(extensionAddress);
      const owner = await extension.owner();
      expect(owner).to.equal(extensionManager.address);

      // Only extensionManager can initialize the extension
      await checkErrorRevert(extension.install(colony.address), "ds-auth-unauthorized");

      const hasFundingRole = await colony.hasUserRole(extensionAddress, 1, FUNDING_ROLE);
      const hasAdministrationRole = await colony.hasUserRole(extensionAddress, 1, ADMINISTRATION_ROLE);
      expect(hasFundingRole).to.be.true;
      expect(hasAdministrationRole).to.be.true;
    });

    it("allows an architect user to install an extension in a subdomain only", async () => {
      await colony.addDomain(1, 0, 1); // Domain 2

      // Domain 1 fails
      await checkErrorRevert(
        extensionManager.installExtension(COLONY_EXTENSION, 1, colony.address, 0, 1, 0, 1, { from: ARCHITECT }),
        "extension-manager-unauthorized"
      );

      // Domain 2 succeeds
      await extensionManager.installExtension(COLONY_EXTENSION, 1, colony.address, 0, 1, 0, 2, { from: ARCHITECT });
    });

    it("does not allow a non root or architect user to install an extension", async () => {
      // Domain 1 fails
      await checkErrorRevert(
        extensionManager.installExtension(COLONY_EXTENSION, 1, colony.address, 0, 1, 0, 1, { from: USER }),
        "extension-manager-unauthorized"
      );

      // Domain 2 fails
      await checkErrorRevert(
        extensionManager.installExtension(COLONY_EXTENSION, 1, colony.address, 0, 1, 0, 2, { from: USER }),
        "extension-manager-unauthorized"
      );
    });

    it("does not allow an extension to be installed with a nonexistent resolver", async () => {
      await checkErrorRevert(
        extensionManager.installExtension(COLONY_EXTENSION, 0, colony.address, 0, 1, 0, 1, { from: ROOT }),
        "extension-manager-bad-version"
      );
    });

    it("does not allow an extension to be installed twice", async () => {
      await extensionManager.installExtension(COLONY_EXTENSION, 1, colony.address, 0, 1, 0, 1, { from: ROOT });

      await checkErrorRevert(
        extensionManager.installExtension(COLONY_EXTENSION, 1, colony.address, 0, 1, 0, 1, { from: ROOT }),
        "extension-manager-already-installed"
      );
    });

    it("does not allow an extension which requires root permission to be installed in a subdomain", async () => {
      await colony.addDomain(1, 0, 1); // Domain 2

      const extensionId = soliditySha3(shortid.generate());
      const resolver = await setupResolver();

      await metaColony.addExtension(extensionManager.address, extensionId, 1, resolver.address, [ROOT_ROLE]);

      await checkErrorRevert(
        extensionManager.installExtension(extensionId, 1, colony.address, 0, 1, 0, 2, { from: ROOT }),
        "extension-manager-bad-domain"
      );

      await extensionManager.installExtension(extensionId, 1, colony.address, 0, 1, 0, 1, { from: ROOT });
    });

    it("allows an extension to be installed with all roles", async () => {
      const allRoles = [ROOT_ROLE, ARBITRATION_ROLE, ARCHITECTURE_ROLE, FUNDING_ROLE, ADMINISTRATION_ROLE];

      const extensionId = soliditySha3(shortid.generate());
      const resolver = await setupResolver();

      await metaColony.addExtension(extensionManager.address, extensionId, 1, resolver.address, allRoles);
      await extensionManager.installExtension(extensionId, 1, colony.address, 0, 1, 0, 1, { from: ROOT });
    });

    it("allows an extension to be installed with non-existent roles, without erroring", async () => {
      const fakeRole = 100;

      const extensionId = soliditySha3(shortid.generate());
      const resolver = await setupResolver();

      await metaColony.addExtension(extensionManager.address, extensionId, 1, resolver.address, [ROOT_ROLE, fakeRole]);
      await extensionManager.installExtension(extensionId, 1, colony.address, 0, 1, 0, 1, { from: ROOT });

      // Check that fakeRole is not part of the role bit array
      const extensionAddress = await extensionManager.getExtension(extensionId, 1, colony.address, 1);
      const userRoles = await colony.getUserRoles(extensionAddress, 1);
      expect(new BN(parseInt(userRoles, 16)).and(new BN(1).shln(fakeRole))).to.be.zero;
    });
  });

  describe("upgrading extensions", () => {
    it("allows authorized users to upgrade an extension", async () => {
      await extensionManager.installExtension(COLONY_EXTENSION, 1, colony.address, 0, 1, 0, 1, { from: ROOT });

      let extensionAddress = await extensionManager.getExtension(COLONY_EXTENSION, 1, colony.address, 1);
      expect(extensionAddress).to.not.equal(ethers.constants.AddressZero);

      await extensionManager.upgradeExtension(COLONY_EXTENSION, 1, colony.address, 0, 1, 0, 1, { from: ROOT });

      extensionAddress = await extensionManager.getExtension(COLONY_EXTENSION, 1, colony.address, 1);
      expect(extensionAddress).to.equal(ethers.constants.AddressZero);

      extensionAddress = await extensionManager.getExtension(COLONY_EXTENSION, 2, colony.address, 1);
      expect(extensionAddress).to.not.equal(ethers.constants.AddressZero);
    });

    it("does not allow upgrading a extension which is not installed", async () => {
      await checkErrorRevert(
        extensionManager.upgradeExtension(COLONY_EXTENSION, 1, colony.address, 0, 1, 0, 1, { from: ROOT }),
        "extension-manager-not-installed"
      );
    });

    it("does not allow upgrading a extension by more than one version at a time", async () => {
      await extensionManager.installExtension(COLONY_EXTENSION, 1, colony.address, 0, 1, 0, 1, { from: ROOT });

      await checkErrorRevert(
        extensionManager.upgradeExtension(COLONY_EXTENSION, 2, colony.address, 0, 1, 0, 1, { from: ROOT }),
        "extension-manager-not-installed"
      );
    });
  });

  describe("removing extensions", () => {
    it("allows authorized users to uninstall an extension and send ether to the benificiary", async () => {
      await extensionManager.installExtension(COLONY_EXTENSION, 1, colony.address, 0, 1, 0, 1, { from: ROOT });
      const extensionAddress = await extensionManager.getExtension(COLONY_EXTENSION, 1, colony.address, 1);

      const extension = await OneTxPayment.at(extensionAddress);
      await extension.send(100);

      // Only extensionManager can uninstall
      await checkErrorRevert(extension.uninstall(colony.address), "ds-auth-unauthorized");

      await checkErrorRevert(
        extensionManager.uninstallExtension(COLONY_EXTENSION, 1, colony.address, 0, 1, 0, 1, { from: USER }),
        "extension-manager-unauthorized"
      );

      await extensionManager.uninstallExtension(COLONY_EXTENSION, 1, colony.address, 0, 1, 0, 1, { from: ROOT });
      const colonyBalance = await web3GetBalance(colony.address);
      expect(new BN(colonyBalance)).to.eq.BN(100);
    });

    it("does not allow authorized users to uninstall an extension which is not installed", async () => {
      await checkErrorRevert(
        extensionManager.uninstallExtension(COLONY_EXTENSION, 1, colony.address, 0, 1, 0, 1, { from: ROOT }),
        "extension-manager-not-installed"
      );
    });
  });
});
