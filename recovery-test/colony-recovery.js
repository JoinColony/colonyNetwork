/* globals artifacts */

import { SPECIFICATION_HASH } from "../helpers/constants";

import { web3GetStorageAt, checkErrorRevert } from "../helpers/test-helper";

import { setupColonyVersionResolver } from "../helpers/upgradable-contracts";

const Colony = artifacts.require("Colony");
const Resolver = artifacts.require("Resolver");
const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const Token = artifacts.require("Token");
const ColonyFunding = artifacts.require("ColonyFunding");
const ColonyTask = artifacts.require("ColonyTask");

contract("Colony", accounts => {
  let colony;
  let colonyNetwork;

  before(async () => {
    const resolverColonyNetworkDeployed = await Resolver.deployed();
    const colonyTemplate = await Colony.new();
    const colonyFunding = await ColonyFunding.new();
    const colonyTask = await ColonyTask.new();
    const resolver = await Resolver.new();
    const etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolverColonyNetworkDeployed.address);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    await setupColonyVersionResolver(colonyTemplate, colonyTask, colonyFunding, resolver, colonyNetwork);

    const clnyToken = await Token.new("Colony Network Token", "CLNY", 18);
    await colonyNetwork.createMetaColony(clnyToken.address);

    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
  });

  describe("Recovery Mode", () => {
    it("should be able to add and remove recovery roles when not in recovery", async () => {
      const owner = accounts[0];
      let numRecoveryRoles;

      numRecoveryRoles = await colony.numRecoveryRoles();
      assert.equal(numRecoveryRoles.toNumber(), 0);

      await colony.setRecoveryRole(owner, { from: owner });
      await colony.setRecoveryRole(accounts[1], { from: owner });
      await colony.setRecoveryRole(accounts[2], { from: owner });
      numRecoveryRoles = await colony.numRecoveryRoles();
      assert.equal(numRecoveryRoles.toNumber(), 3);

      // Can remove recovery roles
      await colony.removeRecoveryRole(accounts[2], { from: owner });
      numRecoveryRoles = await colony.numRecoveryRoles();
      assert.equal(numRecoveryRoles.toNumber(), 2);

      // Can't remove twice
      await colony.removeRecoveryRole(accounts[2], { from: owner });
      numRecoveryRoles = await colony.numRecoveryRoles();
      assert.equal(numRecoveryRoles.toNumber(), 2);

      // Can remove owner
      await colony.removeRecoveryRole(owner, { from: owner });
      numRecoveryRoles = await colony.numRecoveryRoles();
      assert.equal(numRecoveryRoles.toNumber(), 1);
    });

    it("should not be able to add and remove roles when in recovery", async () => {
      const owner = accounts[0];
      await colony.setRecoveryRole(owner, { from: owner });
      await colony.enterRecoveryMode({ from: owner });
      await checkErrorRevert(colony.setOwnerRole(accounts[1], { from: owner }), "colony-in-recovery-mode");
      await checkErrorRevert(colony.setAdminRole(accounts[1], { from: owner }), "colony-in-recovery-mode");
      await checkErrorRevert(colony.removeAdminRole(accounts[1], { from: owner }), "colony-in-recovery-mode");
      await checkErrorRevert(colony.setRecoveryRole(accounts[1], { from: owner }), "colony-in-recovery-mode");
      await checkErrorRevert(colony.removeRecoveryRole(accounts[1], { from: owner }), "colony-in-recovery-mode");
    });

    it("should not be able to call normal functions while in recovery", async () => {
      const owner = accounts[0];
      await colony.setRecoveryRole(owner, { from: owner });
      await colony.enterRecoveryMode({ from: owner });
      await checkErrorRevert(colony.initialiseColony("0x0", { from: owner }), "colony-in-recovery-mode");
      await checkErrorRevert(colony.mintTokens(1000, { from: owner }), "colony-in-recovery-mode");
      await checkErrorRevert(colony.addGlobalSkill(0, { from: owner }), "colony-in-recovery-mode");
      await checkErrorRevert(colony.makeTask(SPECIFICATION_HASH, 0, 0, 0, { from: owner }), "colony-in-recovery-mode");
    });

    it("should exit recovery mode with sufficient approvals", async () => {
      const owner = accounts[0];
      const version = await colony.version();
      await colony.setRecoveryRole(owner, { from: owner });
      await colony.setRecoveryRole(accounts[1], { from: owner });
      await colony.setRecoveryRole(accounts[2], { from: owner });

      await colony.enterRecoveryMode({ from: owner });
      await colony.setStorageSlotRecovery(5, "0xdeadbeef", { from: owner });

      // 0/3 approve
      await checkErrorRevert(colony.exitRecoveryMode(version.toNumber(), { from: owner }), "colony-recovery-exit-insufficient-approvals");

      // 1/3 approve
      await colony.approveExitRecovery({ from: owner });
      await checkErrorRevert(colony.exitRecoveryMode(version.toNumber(), { from: owner }), "colony-recovery-exit-insufficient-approvals");

      // 2/3 approve
      await colony.approveExitRecovery({ from: accounts[1] });
      await colony.exitRecoveryMode(version.toNumber(), { from: owner });
    });

    it("recovery users can work in recovery mode", async () => {
      const owner = accounts[0];
      const version = await colony.version();
      await colony.setRecoveryRole(owner, { from: owner });
      await colony.setRecoveryRole(accounts[1], { from: owner });

      await colony.enterRecoveryMode({ from: owner });
      await colony.setStorageSlotRecovery(5, "0xdeadbeef", { from: accounts[1] });

      // 2/2 approve
      await colony.approveExitRecovery({ from: owner });
      await colony.approveExitRecovery({ from: accounts[1] });
      await colony.exitRecoveryMode(version.toNumber(), { from: accounts[1] });
    });

    it("users cannot approve twice", async () => {
      const owner = accounts[0];
      await colony.setRecoveryRole(owner, { from: owner });
      await colony.enterRecoveryMode({ from: owner });
      await colony.setStorageSlotRecovery(5, "0xdeadbeef", { from: owner });

      await colony.approveExitRecovery({ from: owner });
      await checkErrorRevert(colony.approveExitRecovery({ from: owner }), "colony-recovery-approval-already-given");
    });

    it("users cannot approve if unauthorized", async () => {
      const owner = accounts[0];
      await colony.setRecoveryRole(owner, { from: owner });
      await colony.enterRecoveryMode({ from: owner });
      await checkErrorRevert(colony.approveExitRecovery({ from: accounts[1] }));
    });

    it("should allow editing of general variables", async () => {
      const owner = accounts[0];
      await colony.setRecoveryRole(owner, { from: owner });
      await colony.enterRecoveryMode({ from: owner });
      await colony.setStorageSlotRecovery(5, "0xdeadbeef", { from: owner });

      const unprotected = await web3GetStorageAt(colony.address, 5);
      assert.equal(unprotected.toString(), `0xdeadbeef${"0".repeat(56)}`);
    });

    it("should not allow editing of protected variables", async () => {
      const owner = accounts[0];
      const protectedLoc = 0;

      await colony.setRecoveryRole(owner, { from: owner });
      await colony.enterRecoveryMode({ from: owner });
      await checkErrorRevert(colony.setStorageSlotRecovery(protectedLoc, "0xdeadbeef", { from: owner }), "colony-protected-variable");
    });
  });
});
