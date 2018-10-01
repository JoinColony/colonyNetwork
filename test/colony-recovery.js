/* globals artifacts */

import { SPECIFICATION_HASH } from "../helpers/constants";

import { web3GetStorageAt, checkErrorRevert } from "../helpers/test-helper";

import { setupColonyVersionResolver } from "../helpers/upgradable-contracts";

const IColony = artifacts.require("IColony");
const Colony = artifacts.require("Colony");
const Resolver = artifacts.require("Resolver");
const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const Token = artifacts.require("Token");
const ColonyFunding = artifacts.require("ColonyFunding");
const ColonyTask = artifacts.require("ColonyTask");
const ContractRecovery = artifacts.require("ContractRecovery");

contract("Colony", accounts => {
  let colony;
  let colonyNetwork;
  let clnyToken;

  before(async () => {
    const resolverColonyNetworkDeployed = await Resolver.deployed();
    const colonyTemplate = await Colony.new();
    const colonyFunding = await ColonyFunding.new();
    const colonyTask = await ColonyTask.new();
    const resolver = await Resolver.new();
    const etherRouter = await EtherRouter.new();
    const contractRecovery = await ContractRecovery.new();
    await etherRouter.setResolver(resolverColonyNetworkDeployed.address);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    await setupColonyVersionResolver(colonyTemplate, colonyTask, colonyFunding, contractRecovery, resolver, colonyNetwork);

    clnyToken = await Token.new("Colony Network Token", "CLNY", 18);
    await colonyNetwork.createMetaColony(clnyToken.address);
    // Jumping through these hoops to avoid the need to rewire ReputationMiningCycleResolver.
    const deployedColonyNetwork = await IColonyNetwork.at(EtherRouter.address);
    const reputationMiningCycleResolverAddress = await deployedColonyNetwork.getMiningResolver();
    await colonyNetwork.setMiningResolver(reputationMiningCycleResolverAddress);
    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
  });

  beforeEach(async () => {
    const { logs } = await colonyNetwork.createColony(clnyToken.address);
    const { colonyAddress } = logs[0].args;
    colony = await IColony.at(colonyAddress);
  });

  describe("Recovery Mode", () => {
    it("should be able to add and remove recovery roles when not in recovery", async () => {
      const owner = accounts[0];
      let numRecoveryRoles;

      numRecoveryRoles = await colony.numRecoveryRoles();
      assert.equal(numRecoveryRoles.toNumber(), 0);

      await colony.setRecoveryRole(owner);
      await colony.setRecoveryRole(accounts[1]);
      await colony.setRecoveryRole(accounts[2]);
      numRecoveryRoles = await colony.numRecoveryRoles();
      assert.equal(numRecoveryRoles.toNumber(), 3);

      // Can remove recovery roles
      await colony.removeRecoveryRole(accounts[2]);
      numRecoveryRoles = await colony.numRecoveryRoles();
      assert.equal(numRecoveryRoles.toNumber(), 2);

      // Can't remove twice
      await colony.removeRecoveryRole(accounts[2]);
      numRecoveryRoles = await colony.numRecoveryRoles();
      assert.equal(numRecoveryRoles.toNumber(), 2);

      // Can remove owner
      await colony.removeRecoveryRole(owner);
      numRecoveryRoles = await colony.numRecoveryRoles();
      assert.equal(numRecoveryRoles.toNumber(), 1);
    });

    it("should not be able to add and remove roles when in recovery", async () => {
      const owner = accounts[0];
      await colony.setRecoveryRole(owner);
      await colony.enterRecoveryMode();
      await checkErrorRevert(colony.setAdminRole(accounts[1]), "colony-in-recovery-mode");
      await checkErrorRevert(colony.removeAdminRole(accounts[1]), "colony-in-recovery-mode");
      await checkErrorRevert(colony.setRecoveryRole(accounts[1]), "colony-in-recovery-mode");
      await checkErrorRevert(colony.removeRecoveryRole(accounts[1]), "colony-in-recovery-mode");
      await checkErrorRevert(colony.setOwnerRole(accounts[1]), "colony-in-recovery-mode");
    });

    it("should not be able to call normal functions while in recovery", async () => {
      const owner = accounts[0];
      await colony.setRecoveryRole(owner);
      await colony.enterRecoveryMode();
      await checkErrorRevert(colony.initialiseColony("0x0"), "colony-in-recovery-mode");
      await checkErrorRevert(colony.mintTokens(1000), "colony-in-recovery-mode");
      await checkErrorRevert(colony.addGlobalSkill(0), "colony-in-recovery-mode");
      await checkErrorRevert(colony.makeTask(SPECIFICATION_HASH, 0, 0, 0), "colony-in-recovery-mode");
    });

    it("should exit recovery mode with sufficient approvals", async () => {
      const owner = accounts[0];
      await colony.setRecoveryRole(owner);
      await colony.setRecoveryRole(accounts[1]);
      await colony.setRecoveryRole(accounts[2]);

      await colony.enterRecoveryMode();
      await colony.setStorageSlotRecovery(5, "0xdeadbeef");

      // 0/3 approve
      await checkErrorRevert(colony.exitRecoveryMode(), "colony-recovery-exit-insufficient-approvals");

      // 1/3 approve
      await colony.approveExitRecovery();
      await checkErrorRevert(colony.exitRecoveryMode(), "colony-recovery-exit-insufficient-approvals");

      // 2/3 approve
      await colony.approveExitRecovery({ from: accounts[1] });
      await colony.exitRecoveryMode();
    });

    it("recovery users can work in recovery mode", async () => {
      const owner = accounts[0];
      await colony.setRecoveryRole(owner);
      await colony.setRecoveryRole(accounts[1]);

      await colony.enterRecoveryMode();
      await colony.setStorageSlotRecovery(5, "0xdeadbeef", { from: accounts[1] });

      // 2/2 approve
      await colony.approveExitRecovery();
      await colony.approveExitRecovery({ from: accounts[1] });
      await colony.exitRecoveryMode({ from: accounts[1] });
    });

    it("users cannot approve twice", async () => {
      const owner = accounts[0];
      await colony.setRecoveryRole(owner);
      await colony.enterRecoveryMode();
      await colony.setStorageSlotRecovery(5, "0xdeadbeef");

      await colony.approveExitRecovery();
      await checkErrorRevert(colony.approveExitRecovery(), "colony-recovery-approval-already-given");
    });

    it("users cannot approve if unauthorized", async () => {
      const owner = accounts[0];
      await colony.setRecoveryRole(owner);
      await colony.enterRecoveryMode();
      await checkErrorRevert(colony.approveExitRecovery({ from: accounts[1] }));
    });

    it("should allow editing of general variables", async () => {
      const owner = accounts[0];
      await colony.setRecoveryRole(owner);
      await colony.enterRecoveryMode();
      await colony.setStorageSlotRecovery(5, "0xdeadbeef");

      const unprotected = await web3GetStorageAt(colony.address, 5);
      assert.equal(unprotected.toString(), `0xdeadbeef${"0".repeat(56)}`);
    });

    it("should not allow editing of protected variables", async () => {
      const owner = accounts[0];

      await colony.setRecoveryRole(owner);
      await colony.enterRecoveryMode();
      await checkErrorRevert(colony.setStorageSlotRecovery(0, "0xdeadbeef"), "colony-common-protected-variable");
      // '6' is a protected location in Colony, but not ColonyNetwork. We get a different error.
      await checkErrorRevert(colony.setStorageSlotRecovery(6, "0xdeadbeef"), "colony-protected-variable");
    });

    it("should allow upgrade to be called on a colony in and out of recovery mode", async () => {
      const owner = accounts[0];
      // Note that we can't upgrade, because we don't have a new version. But this test is still valid, becuase we're getting the
      // 'version must be newer' error, not a `colony-not-in-recovery-mode` or `colony-in-recovery-mode` error.
      await checkErrorRevert(colony.upgrade(1), "colony-version-must-be-newer");
      await colony.setRecoveryRole(owner);
      await colony.enterRecoveryMode();
      await checkErrorRevert(colony.upgrade(1), "colony-version-must-be-newer");
    });
  });
});
