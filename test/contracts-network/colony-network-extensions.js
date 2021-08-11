/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";
import { BN } from "bn.js";
import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";

import { checkErrorRevert, web3GetBalance, encodeTxData, getExtensionAddressFromTx } from "../../helpers/test-helper";
import { setupEtherRouter } from "../../helpers/upgradable-contracts";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, setupRandomColony } from "../../helpers/test-data-generator";
import { UINT256_MAX } from "../../helpers/constants";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ColonyExtension = artifacts.require("ColonyExtension");
const EtherRouter = artifacts.require("EtherRouter");
const IMetaColony = artifacts.require("IMetaColony");
const ITokenLocking = artifacts.require("ITokenLocking");
const TestExtension0 = artifacts.require("TestExtension0");
const TestExtension1 = artifacts.require("TestExtension1");
const TestExtension2 = artifacts.require("TestExtension2");
const TestExtension3 = artifacts.require("TestExtension3");
const TestVotingToken = artifacts.require("TestVotingToken");
const Resolver = artifacts.require("Resolver");
const RequireExecuteCall = artifacts.require("RequireExecuteCall");
const ContractEditing = artifacts.require("ContractEditing");
const Version7 = artifacts.require("Version7");

contract("Colony Network Extensions", (accounts) => {
  let colonyNetwork;
  let editableColonyNetwork;
  let metaColony;
  let colony;
  let token;

  let testExtension0Resolver;
  let testExtension1Resolver;
  let testExtension2Resolver;
  let testExtension3Resolver;
  let testVotingTokenResolver;

  const ROOT = accounts[0];
  const ARCHITECT = accounts[1];
  const USER = accounts[2];

  const TEST_EXTENSION = soliditySha3("TestExtension");
  const TEST_VOTING_TOKEN = soliditySha3("VotingToken");

  before(async () => {
    testExtension0Resolver = await Resolver.new();
    const testExtension0 = await TestExtension0.new();
    await setupEtherRouter("TestExtension0", { TestExtension0: testExtension0.address }, testExtension0Resolver);

    testExtension1Resolver = await Resolver.new();
    const testExtension1 = await TestExtension1.new();
    await setupEtherRouter("TestExtension1", { TestExtension1: testExtension1.address }, testExtension1Resolver);

    testExtension2Resolver = await Resolver.new();
    const testExtension2 = await TestExtension2.new();
    await setupEtherRouter("TestExtension2", { TestExtension2: testExtension2.address }, testExtension2Resolver);

    testExtension3Resolver = await Resolver.new();
    const testExtension3 = await TestExtension3.new();
    await setupEtherRouter("TestExtension3", { TestExtension3: testExtension3.address }, testExtension3Resolver);

    testVotingTokenResolver = await Resolver.new();
    const testVotingToken = await TestVotingToken.new();
    await setupEtherRouter("TestVotingToken", { TestVotingToken: testVotingToken.address }, testVotingTokenResolver);
  });

  beforeEach(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

    const colonyNetworkAsER = await EtherRouter.at(colonyNetwork.address);
    const colonyNetworkResolverAddress = await colonyNetworkAsER.resolver();
    const colonyNetworkResolver = await Resolver.at(colonyNetworkResolverAddress);
    const contractEditing = await ContractEditing.new();
    await colonyNetworkResolver.register("setStorageSlot(uint256,bytes32)", contractEditing.address);
    editableColonyNetwork = await ContractEditing.at(colonyNetwork.address);

    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.addDomain(1, UINT256_MAX, 1); // Domain 2

    await colony.setArchitectureRole(1, UINT256_MAX, ARCHITECT, 1, true);
  });

  describe("without the colony network", () => {
    it("allows a colony to install an extension manually (and without a resolver)", async () => {
      const extension = await TestExtension1.new();

      // Can install directly
      await extension.install(colony.address);

      // Can get the colony
      const colonyAddress = await extension.getColony();
      expect(colonyAddress).to.equal(colony.address);

      // Can only install once
      await checkErrorRevert(extension.install(colony.address), "extension-already-installed");

      // Cannot send ether by default as expected
      await checkErrorRevert(extension.send(100));
      // But can using separate payable function
      await extension.receiveEther({ value: 100 });

      // Can uninstall as expected, with ether going to the colony
      await extension.uninstall();
      const colonyBalance = await web3GetBalance(colony.address);
      expect(new BN(colonyBalance)).to.eq.BN(100);
    });
  });

  describe("adding extensions", () => {
    it("allows the meta colony to add new extensions", async () => {
      await metaColony.addExtensionToNetwork(TEST_EXTENSION, testExtension1Resolver.address);
      await metaColony.addExtensionToNetwork(TEST_EXTENSION, testExtension2Resolver.address);

      const resolverAddress = await colonyNetwork.getExtensionResolver(TEST_EXTENSION, 1);
      expect(resolverAddress).to.equal(testExtension1Resolver.address);
    });

    it("does not allow the meta colony to set a non-matching identifier", async () => {
      await checkErrorRevert(metaColony.addExtensionToNetwork("0x0", testExtension1Resolver.address), "colony-network-extension-bad-identifier");
    });

    it("does not allow the meta colony to overwrite existing extensions", async () => {
      await metaColony.addExtensionToNetwork(TEST_EXTENSION, testExtension1Resolver.address);

      await checkErrorRevert(
        metaColony.addExtensionToNetwork(TEST_EXTENSION, testExtension1Resolver.address),
        "colony-network-extension-already-set"
      );
    });

    it("does not allow the meta colony to add a null resolver", async () => {
      await checkErrorRevert(metaColony.addExtensionToNetwork(TEST_EXTENSION, ethers.constants.AddressZero), "colony-network-extension-bad-resolver");
    });

    it("does not allow other colonies to add new extensions", async () => {
      const fakeMetaColony = await IMetaColony.at(colony.address);

      await checkErrorRevert(
        fakeMetaColony.addExtensionToNetwork(TEST_EXTENSION, testExtension1Resolver.address),
        "colony-caller-must-be-meta-colony"
      );
    });
  });

  describe("installing extensions", () => {
    beforeEach(async () => {
      await metaColony.addExtensionToNetwork(TEST_EXTENSION, testExtension1Resolver.address);
      await metaColony.addExtensionToNetwork(TEST_EXTENSION, testExtension2Resolver.address);
    });

    it("allows a root user to install an extension", async () => {
      const tx = await colony.installExtension(TEST_EXTENSION, 1, { from: ROOT });

      const extensionAddress = getExtensionAddressFromTx(tx);
      const extension = await TestExtension1.at(extensionAddress);
      const owner = await extension.owner();
      expect(owner).to.equal(colonyNetwork.address);

      const identifier = await extension.identifier();
      const version = await extension.version();
      const colonyAddress = await extension.getColony();
      expect(identifier).to.equal(TEST_EXTENSION);
      expect(version).to.eq.BN(1);
      expect(colonyAddress).to.equal(colony.address);

      // Only colonyNetwork can install the extension
      await checkErrorRevert(extension.install(colony.address), "ds-auth-unauthorized");
    });

    it("allows a root user to install an extension with any version", async () => {
      const tx = await colony.installExtension(TEST_EXTENSION, 2, { from: ROOT });

      const extensionAddress = getExtensionAddressFromTx(tx);
      const extension = await TestExtension2.at(extensionAddress);

      const identifier = await extension.identifier();
      const version = await extension.version();
      expect(identifier).to.equal(TEST_EXTENSION);
      expect(version).to.eq.BN(2);
    });

    it("does not allow an extension to be installed with a nonexistent resolver", async () => {
      await checkErrorRevert(colony.installExtension(TEST_EXTENSION, 0, { from: ROOT }), "colony-network-extension-bad-version");
    });

    it("allows colonies to migrate to multiExtension bookkeeping", async () => {
      const extension = await TestExtension1.new();
      await extension.install(colony.address);

      let colonyAddress;

      colonyAddress = await colonyNetwork.getExtensionColony(extension.address);
      expect(colonyAddress).to.equal(ethers.constants.AddressZero);

      // Set up `installations` mapping in the old style
      const slot = soliditySha3(ethers.utils.hexZeroPad(colony.address, 32), soliditySha3(TEST_EXTENSION, 39));
      const value = ethers.utils.hexZeroPad(extension.address, 32);
      await editableColonyNetwork.setStorageSlot(slot, value);

      let extensionAddress;
      extensionAddress = await colonyNetwork.getExtensionInstallation(TEST_EXTENSION, colony.address);
      expect(extensionAddress).to.not.equal(ethers.constants.AddressZero);

      await colony.migrateToMultiExtension(TEST_EXTENSION);

      colonyAddress = await colonyNetwork.getExtensionColony(extension.address);
      expect(colonyAddress).to.equal(colony.address);

      extensionAddress = await colonyNetwork.getExtensionInstallation(TEST_EXTENSION, colony.address);
      expect(extensionAddress).to.equal(ethers.constants.AddressZero);
    });

    it("allows old colonies to install extensions correctly", async () => {
      const version7Colony = await Version7.new(colonyNetwork.address);

      // Add version7Colony to _isColony mapping
      const slot = soliditySha3(ethers.utils.hexZeroPad(version7Colony.address, 32), 19);
      const value = ethers.utils.zeroPad(1, 32);
      await editableColonyNetwork.setStorageSlot(slot, value);

      await version7Colony.installExtension(TEST_EXTENSION, 1);

      const extensionAddress = await colonyNetwork.getExtensionInstallation(TEST_EXTENSION, version7Colony.address);
      expect(extensionAddress).to.not.equal(ethers.constants.AddressZero);

      // But not twice
      await checkErrorRevert(version7Colony.installExtension(TEST_EXTENSION, 1), "colony-network-extension-already-installed");
    });
  });

  describe("upgrading extensions", () => {
    beforeEach(async () => {
      await metaColony.addExtensionToNetwork(TEST_EXTENSION, testExtension1Resolver.address);
      await metaColony.addExtensionToNetwork(TEST_EXTENSION, testExtension2Resolver.address);
      await metaColony.addExtensionToNetwork(TEST_EXTENSION, testExtension3Resolver.address);
    });

    it("allows root users to upgrade an extension", async () => {
      const tx = await colony.installExtension(TEST_EXTENSION, 1, { from: ROOT });

      const extensionAddress = getExtensionAddressFromTx(tx);
      let extension = await ColonyExtension.at(extensionAddress);
      let version = await extension.version();
      expect(version).to.eq.BN(1);

      await colony.methods["upgradeExtension(address,uint256)"](extensionAddress, 2, { from: ROOT });

      extension = await ColonyExtension.at(extensionAddress);
      version = await extension.version();
      expect(version).to.eq.BN(2);
    });

    it("does not allow non-root users to upgrade an extension", async () => {
      const tx = await colony.installExtension(TEST_EXTENSION, 1, { from: ROOT });

      const extensionAddress = getExtensionAddressFromTx(tx);
      await checkErrorRevert(colony.methods["upgradeExtension(address,uint256)"](extensionAddress, 2, { from: ARCHITECT }), "ds-auth-unauthorized");
      await checkErrorRevert(colony.methods["upgradeExtension(address,uint256)"](extensionAddress, 2, { from: USER }), "ds-auth-unauthorized");
    });

    it("does not allow upgrading a extension which is not installed", async () => {
      await checkErrorRevert(
        colony.methods["upgradeExtension(address,uint256)"](ethers.constants.AddressZero, 2, { from: ROOT }),
        "colony-network-extension-not-installed"
      );
    });

    it("does not allow upgrading a extension to a version which does not exist", async () => {
      const tx = await colony.installExtension(TEST_EXTENSION, 3, { from: ROOT });

      // Can't upgrade from version 3 to nonexistent 4
      const extensionAddress = getExtensionAddressFromTx(tx);
      await checkErrorRevert(
        colony.methods["upgradeExtension(address,uint256)"](extensionAddress, 4, { from: ROOT }),
        "colony-network-extension-bad-version"
      );
    });

    it("does not allow upgrading a extension out of order", async () => {
      const tx = await colony.installExtension(TEST_EXTENSION, 1, { from: ROOT });

      const extensionAddress = getExtensionAddressFromTx(tx);
      await checkErrorRevert(
        colony.methods["upgradeExtension(address,uint256)"](extensionAddress, 3, { from: ROOT }),
        "colony-network-extension-bad-increment"
      );
    });

    it("allows old colonies to upgrade extensions correctly", async () => {
      const version7Colony = await Version7.new(colonyNetwork.address);

      // Add version7Colony to _isColony mapping
      const slot = soliditySha3(ethers.utils.hexZeroPad(version7Colony.address, 32), 19);
      const value = ethers.utils.zeroPad(1, 32);
      await editableColonyNetwork.setStorageSlot(slot, value);

      await version7Colony.installExtension(TEST_EXTENSION, 1);

      const extensionAddress = await colonyNetwork.getExtensionInstallation(TEST_EXTENSION, version7Colony.address);

      await version7Colony.upgradeExtension(TEST_EXTENSION, 2);

      const extension = await ColonyExtension.at(extensionAddress);
      const version = await extension.version();
      expect(version).to.eq.BN(2);
    });
  });

  describe("deprecating extensions", () => {
    beforeEach(async () => {
      await metaColony.addExtensionToNetwork(TEST_EXTENSION, testExtension1Resolver.address);
    });

    it("allows root users to deprecate and undeprecate an extension", async () => {
      const tx = await colony.installExtension(TEST_EXTENSION, 1, { from: ROOT });

      const extensionAddress = getExtensionAddressFromTx(tx);
      const extension = await TestExtension1.at(extensionAddress);

      await extension.foo();

      await colony.methods["deprecateExtension(address,bool)"](extensionAddress, true, { from: ROOT });

      await checkErrorRevert(extension.foo(), "colony-extension-deprecated");

      await colony.methods["deprecateExtension(address,bool)"](extensionAddress, false, { from: ROOT });

      await extension.foo();
    });

    it("does not allow non-root users to deprecate an extension", async () => {
      const tx = await colony.installExtension(TEST_EXTENSION, 1, { from: ROOT });

      const extensionAddress = getExtensionAddressFromTx(tx);
      await checkErrorRevert(colony.methods["deprecateExtension(address,bool)"](extensionAddress, true, { from: ARCHITECT }), "ds-auth-unauthorized");
    });

    it("allows old colonies to deprecate extensions correctly", async () => {
      const version7Colony = await Version7.new(colonyNetwork.address);

      // Add version7Colony to _isColony mapping
      const slot = soliditySha3(ethers.utils.hexZeroPad(version7Colony.address, 32), 19);
      const value = ethers.utils.zeroPad(1, 32);
      await editableColonyNetwork.setStorageSlot(slot, value);

      await version7Colony.installExtension(TEST_EXTENSION, 1);

      const extensionAddress = await colonyNetwork.getExtensionInstallation(TEST_EXTENSION, version7Colony.address);
      const extension = await TestExtension1.at(extensionAddress);

      await version7Colony.deprecateExtension(TEST_EXTENSION, true);

      await checkErrorRevert(extension.foo(), "colony-extension-deprecated");
    });
  });

  describe("uninstalling extensions", () => {
    beforeEach(async () => {
      await metaColony.addExtensionToNetwork(TEST_EXTENSION, testExtension1Resolver.address);
    });

    it("allows root users to uninstall an extension and send ether to the beneficiary", async () => {
      const tx = await colony.installExtension(TEST_EXTENSION, 1, { from: ROOT });

      const extensionAddress = getExtensionAddressFromTx(tx);
      const extension = await TestExtension1.at(extensionAddress);
      await extension.send(100);

      // Only colonyNetwork can uninstall
      await checkErrorRevert(extension.uninstall(), "ds-auth-unauthorized");

      await colony.methods["uninstallExtension(address)"](extensionAddress, { from: ROOT });

      const colonyBalance = await web3GetBalance(colony.address);
      expect(new BN(colonyBalance)).to.eq.BN(100);
    });

    it("does not allow non-root users to uninstall an extension", async () => {
      await checkErrorRevert(colony.methods["uninstallExtension(address)"](ethers.constants.AddressZero, { from: USER }), "ds-auth-unauthorized");
    });

    it("does not allow root users to uninstall an extension which is not installed", async () => {
      await checkErrorRevert(
        colony.methods["uninstallExtension(address)"](ethers.constants.AddressZero, { from: ROOT }),
        "colony-network-extension-not-installed"
      );
    });

    it("allows old colonies to uninstall extensions correctly", async () => {
      const version7Colony = await Version7.new(colonyNetwork.address);

      // Add version7Colony to _isColony mapping
      const slot = soliditySha3(ethers.utils.hexZeroPad(version7Colony.address, 32), 19);
      const value = ethers.utils.zeroPad(1, 32);
      await editableColonyNetwork.setStorageSlot(slot, value);

      await version7Colony.installExtension(TEST_EXTENSION, 1);

      let extensionAddress;
      extensionAddress = await colonyNetwork.getExtensionInstallation(TEST_EXTENSION, version7Colony.address);
      expect(extensionAddress).to.not.equal(ethers.constants.AddressZero);

      await version7Colony.uninstallExtension(TEST_EXTENSION);

      extensionAddress = await colonyNetwork.getExtensionInstallation(TEST_EXTENSION, version7Colony.address);
      expect(extensionAddress).to.equal(ethers.constants.AddressZero);
    });
  });

  describe("using extensions", () => {
    beforeEach(async () => {
      await metaColony.addExtensionToNetwork(TEST_VOTING_TOKEN, testVotingTokenResolver.address);
    });

    it("allows network-managed extensions to lock and unlock tokens", async () => {
      const tokenLockingAddress = await colonyNetwork.getTokenLocking();
      const tokenLocking = await ITokenLocking.at(tokenLockingAddress);

      const tx = await colony.installExtension(TEST_VOTING_TOKEN, 1, { from: ROOT });

      const testVotingTokenAddress = getExtensionAddressFromTx(tx);
      const testVotingToken = await TestVotingToken.at(testVotingTokenAddress);

      const lockCountPre = await tokenLocking.getTotalLockCount(token.address);

      await testVotingToken.lockToken();

      const lockCountPost = await tokenLocking.getTotalLockCount(token.address);
      expect(lockCountPost.sub(lockCountPre)).to.eq.BN(1);

      // Check that you can't unlock a lock you haven't set
      await checkErrorRevert(testVotingToken.unlockTokenForUser(ROOT, lockCountPost.addn(1)), "colony-bad-lock-id");

      // Check that you can't unlock too far ahead
      await testVotingToken.lockToken();
      await checkErrorRevert(testVotingToken.unlockTokenForUser(ROOT, lockCountPost.addn(1)), "colony-token-locking-has-previous-active-locks");

      await testVotingToken.unlockTokenForUser(ROOT, lockCountPost);

      const userLock = await tokenLocking.getUserLock(token.address, ROOT);
      expect(userLock.lockCount).to.eq.BN(lockCountPost);

      // Check that you can't unlock twice
      await checkErrorRevert(testVotingToken.unlockTokenForUser(ROOT, lockCountPost), "colony-token-locking-already-unlocked");
    });

    it("does not allow non network-managed extensions to lock and unlock tokens", async () => {
      const testVotingToken = await TestVotingToken.new();
      await testVotingToken.install(colony.address);
      await checkErrorRevert(testVotingToken.lockToken(), "colony-must-be-extension");
      await checkErrorRevert(testVotingToken.unlockTokenForUser(ROOT, 0), "colony-must-be-extension");
    });

    it("does not allow users to lock and unlock tokens", async () => {
      await checkErrorRevert(colony.lockToken(), "colony-must-be-extension");
      await checkErrorRevert(colony.unlockTokenForUser(ROOT, 0), "colony-must-be-extension");
    });

    it("does not allow a colony to unlock a lock placed by another colony", async () => {
      const tokenLockingAddress = await colonyNetwork.getTokenLocking();
      const tokenLocking = await ITokenLocking.at(tokenLockingAddress);

      const tx = await colony.installExtension(TEST_VOTING_TOKEN, 1, { from: ROOT });

      const testVotingTokenAddress = getExtensionAddressFromTx(tx);
      const testVotingToken = await TestVotingToken.at(testVotingTokenAddress);

      await testVotingToken.lockToken();
      const lockId = await tokenLocking.getTotalLockCount(token.address);

      const { colony: otherColony } = await setupRandomColony(colonyNetwork);
      const otherColonyAsER = await EtherRouter.at(otherColony.address);
      const resolverAddress = await otherColonyAsER.resolver();
      const resolver = await Resolver.at(resolverAddress);
      const requireExecuteCall = await RequireExecuteCall.new();
      await resolver.register("executeCall(address,bytes)", requireExecuteCall.address);
      const otherColonyExecuteCall = await RequireExecuteCall.at(otherColony.address);

      const action = await encodeTxData(tokenLocking, "unlockTokenForUser", [token.address, USER, lockId]);
      await checkErrorRevert(otherColonyExecuteCall.executeCall(tokenLocking.address, action), "colony-token-locking-not-locker");
    });
  });
});
