/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";

import { UINT256_MAX, IPFS_HASH } from "../../helpers/constants";
import { setupEtherRouter } from "../../helpers/upgradable-contracts";
import { checkErrorRevert, web3GetCode } from "../../helpers/test-helper";
import { setupColonyNetwork, setupRandomColony, setupMetaColonyWithLockedCLNYToken } from "../../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const Whitelist = artifacts.require("Whitelist");
const Resolver = artifacts.require("Resolver");
const ColonyExtension = artifacts.require("ColonyExtension");

const WHITELIST = soliditySha3("Whitelist");

contract("Whitelist", (accounts) => {
  let colonyNetwork;
  let colony;
  let whitelist;
  let whitelistVersion;

  const USER0 = accounts[0];
  const USER1 = accounts[1];

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    const { metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork);

    const whitelistImplementation = await Whitelist.new();
    const resolver = await Resolver.new();
    await setupEtherRouter("Whitelist", { Whitelist: whitelistImplementation.address }, resolver);
    await metaColony.addExtensionToNetwork(WHITELIST, resolver.address);

    const versionSig = await resolver.stringToSig("version()");
    const target = await resolver.lookup(versionSig);
    const extensionImplementation = await ColonyExtension.at(target);
    whitelistVersion = await extensionImplementation.version();
  });

  beforeEach(async () => {
    ({ colony } = await setupRandomColony(colonyNetwork));

    await colony.installExtension(WHITELIST, whitelistVersion);

    const whitelistAddress = await colonyNetwork.getExtensionInstallation(WHITELIST, colony.address);
    whitelist = await Whitelist.at(whitelistAddress);

    await colony.setAdministrationRole(1, UINT256_MAX, USER0, 1, true);
  });

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      whitelist = await Whitelist.new();
      await whitelist.install(colony.address);

      await checkErrorRevert(whitelist.install(colony.address), "extension-already-installed");

      const identifier = await whitelist.identifier();
      const version = await whitelist.version();
      expect(identifier).to.equal(WHITELIST);
      expect(version).to.eq.BN(whitelistVersion);

      const capabilityRoles = await whitelist.getCapabilityRoles("0x0");
      expect(capabilityRoles).to.equal(ethers.constants.HashZero);

      await whitelist.finishUpgrade();
      await whitelist.deprecate(true);
      await whitelist.uninstall();

      const code = await web3GetCode(whitelist.address);
      expect(code).to.equal("0x");
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(WHITELIST, whitelistVersion, { from: USER0 });

      await checkErrorRevert(colony.installExtension(WHITELIST, whitelistVersion, { from: USER0 }), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(WHITELIST, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(WHITELIST, { from: USER0 });
    });
  });

  describe("using the whitelist", async () => {
    it("can initialise", async () => {
      await whitelist.initialise(true, IPFS_HASH, { from: USER0 });

      const useApprovals = await whitelist.getUseApprovals();
      const agreementHash = await whitelist.getAgreementHash();

      expect(useApprovals).to.be.true;
      expect(agreementHash).to.equal(IPFS_HASH);
    });

    it("cannot initialise if not root", async () => {
      await checkErrorRevert(whitelist.initialise(true, IPFS_HASH, { from: USER1 }), "whitelist-unauthorised");
    });

    it("cannot initialise with null arguments", async () => {
      await checkErrorRevert(whitelist.initialise(false, ""), "whitelist-bad-initialisation");
    });

    it("cannot initialise twice", async () => {
      await whitelist.initialise(true, IPFS_HASH);

      await checkErrorRevert(whitelist.initialise(true, IPFS_HASH), "whitelist-already-initialised");
    });

    it("can approve users on the whitelist", async () => {
      await whitelist.initialise(true, "");

      let status;
      let approval;

      approval = await whitelist.getApproval(USER0);
      expect(approval).to.be.false;
      approval = await whitelist.getApproval(USER1);
      expect(approval).to.be.false;

      status = await whitelist.isApproved(USER0);
      expect(status).to.be.false;
      status = await whitelist.isApproved(USER1);
      expect(status).to.be.false;

      await whitelist.approveUsers([USER0, USER1], true);

      approval = await whitelist.getApproval(USER0);
      expect(approval).to.be.true;
      approval = await whitelist.getApproval(USER1);
      expect(approval).to.be.true;

      status = await whitelist.isApproved(USER0);
      expect(status).to.be.true;
      status = await whitelist.isApproved(USER1);
      expect(status).to.be.true;
    });

    it("cannot approve users if not a root administrator", async () => {
      await whitelist.initialise(true, "");

      await checkErrorRevert(whitelist.approveUsers([USER0], true, { from: USER1 }), "whitelist-unauthorised");
    });

    it("can make users sign an agreement", async () => {
      await whitelist.initialise(false, IPFS_HASH);

      let status;
      let signature;

      signature = await whitelist.getSignature(USER1);
      expect(signature).to.be.false;

      status = await whitelist.isApproved(USER1);
      expect(status).to.be.false;

      await whitelist.signAgreement(IPFS_HASH, { from: USER1 });

      signature = await whitelist.getSignature(USER1);
      expect(signature).to.be.true;

      status = await whitelist.isApproved(USER1);
      expect(status).to.be.true;
    });

    it("cannot accept a bad agreement", async () => {
      await whitelist.initialise(false, IPFS_HASH);

      await checkErrorRevert(whitelist.signAgreement("0xdeadbeef", { from: USER1 }), "whitelist-bad-signature");
    });

    it("can require both a whitelist and an agreement", async () => {
      await whitelist.initialise(true, IPFS_HASH);

      let status;

      status = await whitelist.isApproved(USER1);
      expect(status).to.be.false;

      await whitelist.approveUsers([USER1], true, { from: USER0 });

      status = await whitelist.isApproved(USER1);
      expect(status).to.be.false;

      await whitelist.signAgreement(IPFS_HASH, { from: USER1 });

      status = await whitelist.isApproved(USER1);
      expect(status).to.be.true;
    });

    it("cannot accept input until initialised", async () => {
      await checkErrorRevert(whitelist.approveUsers([USER1], true, { from: USER0 }), "whitelist-not-initialised");
      await checkErrorRevert(whitelist.signAgreement(IPFS_HASH, { from: USER0 }), "whitelist-not-initialised");
    });

    it("cannot accept administrator approval if not configured to do so", async () => {
      await whitelist.initialise(false, IPFS_HASH);

      await checkErrorRevert(whitelist.approveUsers([USER1], true, { from: USER0 }), "whitelist-no-approvals");
    });

    it("cannot accept an agreement signature if not configured to do so", async () => {
      await whitelist.initialise(true, "");

      await checkErrorRevert(whitelist.signAgreement("", { from: USER0 }), "whitelist-no-agreement");
    });

    it("cannot return true if deprecated", async () => {
      await whitelist.initialise(true, "");

      await whitelist.approveUsers([USER1], true, { from: USER0 });

      let status;

      status = await whitelist.isApproved(USER1);
      expect(status).to.be.true;

      await colony.deprecateExtension(WHITELIST, true, { from: USER0 });

      status = await whitelist.isApproved(USER1);
      expect(status).to.be.false;
    });
  });
});
