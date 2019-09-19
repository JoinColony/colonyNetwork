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
const ColonyExtension = artifacts.require("ColonyExtension");
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

  const COLONY_EXTENSION = soliditySha3("ColonyExtension");

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();

    extensionManager = await ExtensionManager.new(metaColony.address);

    const extension = await ColonyExtension.new();
    const extensionResolver = await Resolver.new();
    await setupEtherRouter("ColonyExtension", { ColonyExtension: extension.address }, extensionResolver);
    await metaColony.addExtension(extensionManager.address, COLONY_EXTENSION, 0, extensionResolver.address, [FUNDING_ROLE, ADMINISTRATION_ROLE]);
  });

  beforeEach(async () => {
    ({ colony } = await setupRandomColony(colonyNetwork));
    await colony.setRootRole(extensionManager.address, true);
    await colony.setArchitectureRole(1, 0, ARCHITECT, 1, true);
  });

  describe("without the extension manager", () => {
    it("allows a colony to install an extension manually (and without a resolver)", async () => {
      const extension = await ColonyExtension.new();

      // Can install directly (with null resolver)!
      await extension.install(colony.address, ethers.constants.AddressZero);

      // Can only install once
      await checkErrorRevert(extension.install(colony.address, ethers.constants.AddressZero), "extension-already-installed");

      // Can uninstall as expected
      await extension.send(100);
      await extension.uninstall(colony.address);
      const colonyBalance = await web3GetBalance(colony.address);
      expect(new BN(colonyBalance)).to.eq.BN(100);
    });
  });

  describe("adding extensions", () => {
    it("allows the meta colony to add new extensions to the manager", async () => {
      const extensionId = soliditySha3(shortid.generate());
      const resolver = await Resolver.new();

      await metaColony.addExtension(extensionManager.address, extensionId, 0, resolver.address, []);
      await metaColony.addExtension(extensionManager.address, extensionId, 1, resolver.address, []);

      const resolverAddress = await extensionManager.getResolver(extensionId, 0);
      expect(resolverAddress).to.equal(resolver.address);
    });

    it("does not allow the meta colony to overwrite existing extensions", async () => {
      const extensionId = soliditySha3(shortid.generate());
      const resolver = await Resolver.new();

      await metaColony.addExtension(extensionManager.address, extensionId, 0, resolver.address, []);

      await checkErrorRevert(
        metaColony.addExtension(extensionManager.address, extensionId, 0, resolver.address, []),
        "extension-manager-already-added"
      );
    });

    it("does not allow the meta colony to add versions out of order", async () => {
      const extensionId = soliditySha3(shortid.generate());
      const resolver = await Resolver.new();

      await checkErrorRevert(
        metaColony.addExtension(extensionManager.address, extensionId, 1, resolver.address, []),
        "extension-manager-bad-version"
      );

      await metaColony.addExtension(extensionManager.address, extensionId, 0, resolver.address, []);
      await metaColony.addExtension(extensionManager.address, extensionId, 1, resolver.address, []);
    });

    it("does not allow the meta colony to add a null resolver", async () => {
      const extensionId = soliditySha3(shortid.generate());

      await checkErrorRevert(
        metaColony.addExtension(extensionManager.address, extensionId, 0, ethers.constants.AddressZero, []),
        "extension-manager-bad-resolver"
      );
    });

    it("does not allow other colonies to add new extensions to the manager", async () => {
      const fakeMetaColony = await IMetaColony.at(colony.address);
      const extensionId = soliditySha3(shortid.generate());
      const resolver = await Resolver.new();

      await checkErrorRevert(
        fakeMetaColony.addExtension(extensionManager.address, extensionId, 0, resolver.address, []),
        "extension-manager-not-metacolony"
      );
    });
  });

  describe("installing extensions (& user authorizations)", () => {
    it("allows a root user to install an extension", async () => {
      await extensionManager.installExtension(COLONY_EXTENSION, 0, colony.address, 0, 1, 0, 1, { from: ROOT });
      const extensionAddress = await extensionManager.getExtension(COLONY_EXTENSION, 0, colony.address, 1);

      const extension = await ColonyExtension.at(extensionAddress);
      const owner = await extension.owner();
      expect(owner).to.equal(extensionManager.address);

      // Only extensionManager can initialize the extension
      await checkErrorRevert(extension.install(colony.address, ethers.constants.AddressZero), "ds-auth-unauthorized");

      const hasFundingRole = await colony.hasUserRole(extensionAddress, 1, FUNDING_ROLE);
      const hasAdministrationRole = await colony.hasUserRole(extensionAddress, 1, ADMINISTRATION_ROLE);
      expect(hasFundingRole).to.be.true;
      expect(hasAdministrationRole).to.be.true;
    });

    it("allows an architect user to install an extension in a subdomain only", async () => {
      await colony.addDomain(1, 0, 1); // Domain 2

      // Domain 1 fails
      await checkErrorRevert(
        extensionManager.installExtension(COLONY_EXTENSION, 0, colony.address, 0, 1, 0, 1, { from: ARCHITECT }),
        "extension-manager-unauthorized"
      );

      // Domain 2 succeeds
      await extensionManager.installExtension(COLONY_EXTENSION, 0, colony.address, 0, 1, 0, 2, { from: ARCHITECT });
    });

    it("does not allow a non root or architect user to install an extension", async () => {
      // Domain 1 fails
      await checkErrorRevert(
        extensionManager.installExtension(COLONY_EXTENSION, 0, colony.address, 0, 1, 0, 1, { from: USER }),
        "extension-manager-unauthorized"
      );

      // Domain 2 fails
      await checkErrorRevert(
        extensionManager.installExtension(COLONY_EXTENSION, 0, colony.address, 0, 1, 0, 2, { from: USER }),
        "extension-manager-unauthorized"
      );
    });

    it("does not allow an extension to be installed twice", async () => {
      await extensionManager.installExtension(COLONY_EXTENSION, 0, colony.address, 0, 1, 0, 1, { from: ROOT });

      await checkErrorRevert(
        extensionManager.installExtension(COLONY_EXTENSION, 0, colony.address, 0, 1, 0, 1, { from: ROOT }),
        "extension-manager-already-installed"
      );
    });

    it("does not allow an extension which requires root permission to be installed in a subdomain", async () => {
      await colony.addDomain(1, 0, 1); // Domain 2

      const extensionId = soliditySha3(shortid.generate());
      const resolver = await Resolver.new();
      await metaColony.addExtension(extensionManager.address, extensionId, 0, resolver.address, [ROOT_ROLE]);

      await checkErrorRevert(
        extensionManager.installExtension(extensionId, 0, colony.address, 0, 1, 0, 2, { from: ROOT }),
        "extension-manager-bad-domain"
      );

      await extensionManager.installExtension(extensionId, 0, colony.address, 0, 1, 0, 1, { from: ROOT });
    });

    it("allows an extension to be installed with all roles", async () => {
      const allRoles = [ROOT_ROLE, ARBITRATION_ROLE, ARCHITECTURE_ROLE, FUNDING_ROLE, ADMINISTRATION_ROLE];

      const extensionId = soliditySha3(shortid.generate());
      const resolver = await Resolver.new();
      await metaColony.addExtension(extensionManager.address, extensionId, 0, resolver.address, allRoles);
      await extensionManager.installExtension(extensionId, 0, colony.address, 0, 1, 0, 1, { from: ROOT });
    });

    it("allows an extension to be installed with non-existent roles, without erroring", async () => {
      const fakeRole = 100;

      const extensionId = soliditySha3(shortid.generate());
      const resolver = await Resolver.new();
      await metaColony.addExtension(extensionManager.address, extensionId, 0, resolver.address, [ROOT_ROLE, fakeRole]);
      await extensionManager.installExtension(extensionId, 0, colony.address, 0, 1, 0, 1, { from: ROOT });

      // Check that fakeRole is not part of the role bit array
      const extensionAddress = await extensionManager.getExtension(extensionId, 0, colony.address, 1);
      const userRoles = await colony.getUserRoles(extensionAddress, 1);
      expect(new BN(parseInt(userRoles, 16)).and(new BN(1).shln(fakeRole))).to.be.zero;
    });
  });

  describe("removing extensions", () => {
    it("allows authorized users to uninstall an extension and send ether to the benificiary", async () => {
      await extensionManager.installExtension(COLONY_EXTENSION, 0, colony.address, 0, 1, 0, 1, { from: ROOT });
      const extensionAddress = await extensionManager.getExtension(COLONY_EXTENSION, 0, colony.address, 1);

      const extension = await ColonyExtension.at(extensionAddress);
      await extension.send(100);

      // Only extensionManager can uninstall
      await checkErrorRevert(extension.uninstall(colony.address), "ds-auth-unauthorized");

      await checkErrorRevert(
        extensionManager.uninstallExtension(COLONY_EXTENSION, 0, colony.address, 0, 1, 0, 1, { from: USER }),
        "extension-manager-unauthorized"
      );

      await extensionManager.uninstallExtension(COLONY_EXTENSION, 0, colony.address, 0, 1, 0, 1, { from: ROOT });
      const colonyBalance = await web3GetBalance(colony.address);
      expect(new BN(colonyBalance)).to.eq.BN(100);
    });

    it("does not allow authorized users to uninstall an extension which is not installed", async () => {
      await checkErrorRevert(
        extensionManager.uninstallExtension(COLONY_EXTENSION, 0, colony.address, 0, 1, 0, 1, { from: ROOT }),
        "extension-manager-not-installed"
      );
    });
  });
});
