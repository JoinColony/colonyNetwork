/* global artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");

const { UINT256_MAX, SPECIFICATION_HASH, ADDRESS_ZERO, HASHZERO } = require("../../helpers/constants");
const { web3GetStorageAt, checkErrorRevert, expectEvent } = require("../../helpers/test-helper");
const { setupRandomColony, getMetaTransactionParameters } = require("../../helpers/test-data-generator");

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IMetaColony = artifacts.require("IMetaColony");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

contract("Colony Recovery", (accounts) => {
  let colony;
  let colonyNetwork;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    ({ colony } = await setupRandomColony(colonyNetwork));
  });

  describe("when using recovery mode", () => {
    it("should be able to check whether we are in recovery mode", async () => {
      let recoveryMode = await colony.isInRecoveryMode();
      expect(recoveryMode).to.be.false;
      await colony.enterRecoveryMode();

      recoveryMode = await colony.isInRecoveryMode();
      expect(recoveryMode).to.be.true;
    });

    it("should be able to add and remove recovery roles when not in recovery", async () => {
      let numRecoveryRoles;

      numRecoveryRoles = await colony.numRecoveryRoles();
      expect(numRecoveryRoles).to.eq.BN(1);

      await colony.setRecoveryRole(accounts[1]);
      await colony.setRecoveryRole(accounts[2]);
      numRecoveryRoles = await colony.numRecoveryRoles();
      expect(numRecoveryRoles).to.eq.BN(3);

      // Can remove recovery roles
      await colony.removeRecoveryRole(accounts[2]);
      numRecoveryRoles = await colony.numRecoveryRoles();
      expect(numRecoveryRoles).to.eq.BN(2);

      // Can't remove twice
      await colony.removeRecoveryRole(accounts[2]);
      numRecoveryRoles = await colony.numRecoveryRoles();
      expect(numRecoveryRoles).to.eq.BN(2);

      // Can remove founder
      await colony.removeRecoveryRole(accounts[0]);
      numRecoveryRoles = await colony.numRecoveryRoles();
      expect(numRecoveryRoles).to.eq.BN(1);
    });

    it("should emit events when changing recovery roles", async () => {
      await expectEvent(colony.setRecoveryRole(accounts[1]), "RecoveryRoleSet", [accounts[1]]);
      await expectEvent(colony.removeRecoveryRole(accounts[1]), "RecoveryRoleSet", [accounts[1]]);
    });

    it("should emit events when moving through the recovery procress", async () => {
      await expectEvent(colony.enterRecoveryMode(), "RecoveryModeEntered", [accounts[0]]);
      await expectEvent(
        colony.setStorageSlotRecovery("0xdead", "0xbeef00000000000000000000000000000000000000000000000000000000beef"),
        "RecoveryStorageSlotSet",
        [accounts[0], "0xdead", "0x00", "0xbeef00000000000000000000000000000000000000000000000000000000beef"]
      );
      await expectEvent(
        colony.setStorageSlotRecovery("0xdead", "0xbadbeef00000000000000000000000000000000000000000000000000badbeef"),
        "RecoveryStorageSlotSet",
        [
          accounts[0],
          "0xdead",
          "0xbeef00000000000000000000000000000000000000000000000000000000beef",
          "0xbadbeef00000000000000000000000000000000000000000000000000badbeef",
        ]
      );
      await expectEvent(colony.approveExitRecovery(), "RecoveryModeExitApproved", [accounts[0]]);
      await expectEvent(colony.exitRecoveryMode(), "RecoveryModeExited", [accounts[0]]);
    });

    it("should not error when adding recovery roles for existing recovery users", async () => {
      let numRecoveryRoles;

      numRecoveryRoles = await colony.numRecoveryRoles();
      expect(numRecoveryRoles).to.eq.BN(1);

      await colony.setRecoveryRole(accounts[1]);
      numRecoveryRoles = await colony.numRecoveryRoles();
      expect(numRecoveryRoles).to.eq.BN(2);

      // Can add twice
      await colony.setRecoveryRole(accounts[1]);
      numRecoveryRoles = await colony.numRecoveryRoles();
      expect(numRecoveryRoles).to.eq.BN(2);
    });

    it.skip("should not allow more than the maximum users allowed to have recovery role", async function maximumRecoveryUsersTest() {
      // Besides the fact it takes a long time, this test is also very expensive. It currently runs out of funds
      // half way through the for-loop below so come back to it if there's need in future
      this.timeout(100000000);
      const uint64Max = 2 ** 64;
      for (let i = 0; i < uint64Max; i += 1) {
        const user = web3.utils.randomHex(20);
        await colony.setRecoveryRole(user);
      }
      const userX = web3.utils.randomHex(20);
      await checkErrorRevert(colony.setRecoveryRole(userX), "colony-maximum-num-recovery-roles");
    });

    it("should not be able to add and remove roles when in recovery", async () => {
      await colony.enterRecoveryMode();
      await checkErrorRevert(colony.setAdministrationRole(1, UINT256_MAX, accounts[1], 1, true), "colony-in-recovery-mode");
      await checkErrorRevert(colony.setAdministrationRole(1, UINT256_MAX, accounts[1], 1, false), "colony-in-recovery-mode");
      await checkErrorRevert(colony.setRecoveryRole(accounts[1]), "colony-in-recovery-mode");
      await checkErrorRevert(colony.removeRecoveryRole(accounts[1]), "colony-in-recovery-mode");
      await checkErrorRevert(colony.setRootRole(accounts[1], true), "colony-in-recovery-mode");
      await checkErrorRevert(colony.setRootRole(accounts[1], false), "colony-in-recovery-mode");
    });

    it.only("should not be able to call normal functions while in recovery", async () => {
      await colony.enterRecoveryMode();

      const metaColonyAddress = await colonyNetwork.getMetaColony();
      const metaColony = await IMetaColony.at(metaColonyAddress);
      await metaColony.enterRecoveryMode();

      await checkErrorRevert(colony.initialiseColony(ethers.constants.AddressZero, ethers.constants.AddressZero), "colony-in-recovery-mode");
      await checkErrorRevert(colony.mintTokens(1000), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.addGlobalSkill(), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.deprecateGlobalSkill(0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.emitDomainReputationReward(0, ADDRESS_ZERO, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.emitSkillReputationReward(0, ADDRESS_ZERO, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.emitSkillReputationPenalty(0, ADDRESS_ZERO, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.editColony(""), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.editColonyByDelta(""), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.bootstrapColony([], []), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.mintTokensFor(ADDRESS_ZERO, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.mintTokensForColonyNetwork(0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setNetworkFeeInverse(0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setPayoutWhitelist(ADDRESS_ZERO, true), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setReputationMiningCycleReward(0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.addNetworkColonyVersion(0, ADDRESS_ZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.addExtensionToNetwork(HASHZERO, ADDRESS_ZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.installExtension(HASHZERO, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.upgradeExtension(HASHZERO, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.deprecateExtension(HASHZERO, true), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.uninstallExtension(HASHZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.addLocalSkill(), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.deprecateLocalSkill(0, false), "colony-in-recovery-mode");
      await checkErrorRevert(colony.makeTask(1, 0, SPECIFICATION_HASH, 0, 0, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.approveStake(ADDRESS_ZERO, 0, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.obligateStake(ADDRESS_ZERO, 0, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.deobligateStake(ADDRESS_ZERO, 0, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.transferStake(0, 0, ADDRESS_ZERO, ADDRESS_ZERO, 0, 0, ADDRESS_ZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.unlockToken(), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.addDomain(0, 0, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.addDomain(0, 0, 0, ""), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.editDomain(0, 0, 0, ""), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.deprecateDomain(0, 0, 0, true), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.initialiseRootLocalSkill(), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setDefaultGlobalClaimDelay(0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.makeExpenditure(0, 0, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.transferExpenditure(0, ADDRESS_ZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.transferExpenditureViaArbitration(0, 0, 0, ADDRESS_ZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.cancelExpenditure(0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.lockExpenditure(0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.finalizeExpenditure(0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setExpenditureMetadata(0, ""), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setExpenditureMetadata(0, 0, 0, ""), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setExpenditureRecipients(0, [], []), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setExpenditureSkills(0, [], []), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setExpenditureClaimDelays(0, [], []), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setExpenditurePayoutModifiers(0, [], []), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setExpenditureRecipient(0, 0, ADDRESS_ZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setExpenditureSkill(0, 0, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setExpenditureClaimDelay(0, 0, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setExpenditureState(0, 0, 0, 0, [], [], HASHZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setArbitrationRole(0, 0, ADDRESS_ZERO, 0, true), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setArchitectureRole(0, 0, ADDRESS_ZERO, 0, true), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setFundingRole(0, 0, ADDRESS_ZERO, 0, true), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setAdministrationRole(0, 0, ADDRESS_ZERO, 0, true), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setUserRoles(0, 0, ADDRESS_ZERO, 0, HASHZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.executeTaskRoleAssignment([], [], [], [], 0, HASHZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.submitTaskWorkRating(0, 0, HASHZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.revealTaskWorkRating(0, 0, 0, HASHZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setTaskEvaluatorRole(0, ADDRESS_ZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setTaskWorkerRole(0, ADDRESS_ZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.removeTaskEvaluatorRole(0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.removeTaskWorkerRole(0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setTaskSkill(0, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setTaskBrief(0, HASHZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setTaskDueDate(0, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.submitTaskDeliverable(0, HASHZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.submitTaskDeliverableAndRating(0, HASHZERO, HASHZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.completeTask(0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.finalizeTask(0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.cancelTask(0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.lockToken(), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.unlockTokenForUser(ADDRESS_ZERO, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setTaskManagerPayout(0, ADDRESS_ZERO, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setTaskEvaluatorPayout(0, ADDRESS_ZERO, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setTaskWorkerPayout(0, ADDRESS_ZERO, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setAllTaskPayouts(0, ADDRESS_ZERO, 0, 0, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.claimTaskPayout(0, 0, ADDRESS_ZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.claimExpenditurePayout(0, 0, ADDRESS_ZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.claimPayment(0, ADDRESS_ZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setPaymentPayout(0, 0, 0, ADDRESS_ZERO, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.moveFundsBetweenPots(0, 0, 0, 0, 0, 0, 0, 0, ADDRESS_ZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.moveFundsBetweenPots(0, 0, 0, 0, 0, 0, ADDRESS_ZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.claimColonyFunds(ADDRESS_ZERO), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.startNextRewardPayout(ADDRESS_ZERO, HASHZERO, HASHZERO, 0, []), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.claimRewardPayout(0, [0, 0, 0, 0, 0, 0, 0], HASHZERO, HASHZERO, 0, []), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setRewardInverse(0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setExpenditurePayouts(0, [], ADDRESS_ZERO, []), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.setExpenditurePayout(0, 0, ADDRESS_ZERO, 0), "colony-in-recovery-mode");
      await checkErrorRevert(metaColony.enterRecoveryMode({ from: accounts[2] }), "colony-in-recovery-mode");
    });

    it("recovery functions should be permissioned", async () => {
      await colony.setRecoveryRole(accounts[1]);
      await checkErrorRevert(colony.setRecoveryRole(accounts[2], { from: accounts[2] }), "ds-auth-unauthorized");
      await checkErrorRevert(colony.removeRecoveryRole(accounts[1], { from: accounts[2] }), "ds-auth-unauthorized");
      await checkErrorRevert(colony.enterRecoveryMode({ from: accounts[2] }), "ds-auth-unauthorized");

      await colony.enterRecoveryMode();
      await checkErrorRevert(colony.setStorageSlotRecovery(5, "0xdeadbeef", { from: accounts[2] }), "ds-auth-unauthorized");
      await checkErrorRevert(colony.exitRecoveryMode({ from: accounts[2] }), "ds-auth-unauthorized");
    });

    it("should exit recovery mode with sufficient approvals", async () => {
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
      await colony.setRecoveryRole(accounts[1]);

      await colony.enterRecoveryMode();
      await colony.setStorageSlotRecovery(5, "0xdeadbeef", { from: accounts[1] });

      // 2/2 approve
      await colony.approveExitRecovery();
      await colony.approveExitRecovery({ from: accounts[1] });
      await colony.exitRecoveryMode({ from: accounts[1] });
    });

    it("users cannot approve twice", async () => {
      await colony.enterRecoveryMode();
      await colony.setStorageSlotRecovery(5, "0xdeadbeef");

      await colony.approveExitRecovery();
      await checkErrorRevert(colony.approveExitRecovery(), "colony-recovery-approval-already-given");
    });

    it("users cannot approve if unauthorized", async () => {
      await colony.enterRecoveryMode();
      await checkErrorRevert(colony.approveExitRecovery({ from: accounts[1] }), "ds-auth-unauthorized");
    });

    it("should allow editing of general variables", async () => {
      await colony.enterRecoveryMode();
      await colony.setStorageSlotRecovery(5, "0xdeadbeef");

      const unprotected = await web3GetStorageAt(colony.address, 5);
      expect(unprotected).to.eq.BN(`0xdeadbeef${"0".repeat(56)}`);
    });

    it("should not allow editing of protected variables in a protected slot", async () => {
      await colony.enterRecoveryMode();
      await checkErrorRevert(colony.setStorageSlotRecovery(0, "0xdeadbeef"), "colony-common-protected-variable");
      await checkErrorRevert(colony.setStorageSlotRecovery(1, "0xdeadbeef"), "colony-common-protected-variable");
      await checkErrorRevert(colony.setStorageSlotRecovery(2, "0xdeadbeef"), "colony-common-protected-variable");
      // '6' is a protected location in Colony, but not ColonyNetwork. We get a different error.
      await checkErrorRevert(colony.setStorageSlotRecovery(6, "0xdeadbeef"), "colony-protected-variable");
      await checkErrorRevert(colony.setStorageSlotRecovery(36, "0xdeadbeef"), "colony-protected-variable");
    });

    it("should not allow editing of a protected variable in a mapping", async () => {
      // First, set a variable in a protected mapping. Currently, the only way we do that
      // is via a metatransaction
      const txData = await colony.contract.methods.mintTokens(100).encodeABI();

      const { r, s, v } = await getMetaTransactionParameters(txData, accounts[0], colony.address);

      await colony.executeMetaTransaction(accounts[0], txData, r, s, v, { from: accounts[1] });

      // Put colony in to recovery mode
      await colony.enterRecoveryMode();
      // work out the storage slot
      // Metatransaction nonce mapping is storage slot 35
      // So this user has their nonce stored at
      const user0MetatransactionNonceSlot = await web3.utils.soliditySha3(
        { type: "bytes32", value: ethers.utils.hexZeroPad(accounts[0], 32) },
        { type: "uint256", value: "35" }
      );

      // Try and edit that slot
      await checkErrorRevert(
        colony.setStorageSlotRecovery(user0MetatransactionNonceSlot, "0x00000000000000000000000000000000000000000000000000000000000000ff"),
        "colony-protected-variable"
      );

      // Try and edit the protection
      const user0MetatransactionNonceProtectionSlot = web3.utils.soliditySha3("RECOVERY_PROTECTED", user0MetatransactionNonceSlot);
      await checkErrorRevert(colony.setStorageSlotRecovery(user0MetatransactionNonceProtectionSlot, "0x00"), "colony-protected-variable");
    });

    it("should allow upgrade to be called on a colony in and out of recovery mode", async () => {
      // Note that we can't upgrade, because we don't have a new version. But this test is still valid, because we're getting the
      // 'version must be newer' error, not a `colony-not-in-recovery-mode` or `colony-in-recovery-mode` error.
      await checkErrorRevert(colony.upgrade(1), "colony-version-must-be-one-newer");
      await colony.enterRecoveryMode();
      await checkErrorRevert(colony.upgrade(1), "colony-version-must-be-one-newer");
    });
  });
});
