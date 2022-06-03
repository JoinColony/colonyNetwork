/* globals artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");
const { soliditySha3 } = require("web3-utils");

const { UINT256_MAX, WAD, MINING_CYCLE_DURATION, CHALLENGE_RESPONSE_WINDOW_DURATION } = require("../../helpers/constants");
const { setupRandomColony, getMetaTransactionParameters } = require("../../helpers/test-data-generator");
const {
  checkErrorRevert,
  web3GetCode,
  makeReputationKey,
  makeReputationValue,
  getActiveRepCycle,
  forwardTime,
} = require("../../helpers/test-helper");

const PatriciaTree = require("../../packages/reputation-miner/patricia");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const ITokenLocking = artifacts.require("ITokenLocking");
const EtherRouter = artifacts.require("EtherRouter");
const ExpenditureUtils = artifacts.require("ExpenditureUtils");

const EXPENDITURE_UTILS = soliditySha3("ExpenditureUtils");

contract("ExpenditureUtils", (accounts) => {
  let colonyNetwork;
  let colony;
  let token;
  let tokenLocking;
  let expenditureUtils;
  let version;

  let reputationTree;
  let domain1Key;
  let domain1Value;
  let domain1Mask;
  let domain1Siblings;

  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const MINER = accounts[5];

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await ITokenLocking.at(tokenLockingAddress);

    const extension = await ExpenditureUtils.new();
    version = await extension.version();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));

    await colony.installExtension(EXPENDITURE_UTILS, version);

    const expenditureUtilsAddress = await colonyNetwork.getExtensionInstallation(EXPENDITURE_UTILS, colony.address);
    expenditureUtils = await ExpenditureUtils.at(expenditureUtilsAddress);

    await colony.setArbitrationRole(1, UINT256_MAX, expenditureUtils.address, 1, true);
    await colony.setAdministrationRole(1, UINT256_MAX, expenditureUtils.address, 1, true);

    const domain1 = await colony.getDomain(1);

    reputationTree = new PatriciaTree();
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId), // Colony total
      makeReputationValue(WAD.muln(3), 1)
    );

    domain1Key = makeReputationKey(colony.address, domain1.skillId);
    domain1Value = makeReputationValue(WAD.muln(3), 1);
    [domain1Mask, domain1Siblings] = await reputationTree.getProof(domain1Key);

    const rootHash = await reputationTree.getRootHash();
    const repCycle = await getActiveRepCycle(colonyNetwork);
    await forwardTime(MINING_CYCLE_DURATION, this);
    await repCycle.submitRootHash(rootHash, 0, "0x00", 10, { from: MINER });
    await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
    await repCycle.confirmNewHash(0, { from: MINER });
  });

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      expenditureUtils = await ExpenditureUtils.new();
      await expenditureUtils.install(colony.address);

      await checkErrorRevert(expenditureUtils.install(colony.address), "extension-already-installed");

      const identifier = await expenditureUtils.identifier();
      expect(identifier).to.equal(EXPENDITURE_UTILS);

      const capabilityRoles = await expenditureUtils.getCapabilityRoles("0x0");
      expect(capabilityRoles).to.equal(ethers.constants.HashZero);

      await expenditureUtils.finishUpgrade();
      await expenditureUtils.deprecate(true);
      await expenditureUtils.uninstall();

      const code = await web3GetCode(expenditureUtils.address);
      expect(code).to.equal("0x");
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(EXPENDITURE_UTILS, version, { from: USER0 });

      await checkErrorRevert(colony.installExtension(EXPENDITURE_UTILS, version, { from: USER0 }), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(EXPENDITURE_UTILS, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(EXPENDITURE_UTILS, { from: USER0 });
    });
  });

  describe("using stakes to manage expenditures", async () => {
    beforeEach(async () => {
      await expenditureUtils.setStakeFraction(WAD.divn(10)); // Stake of .3 WADs

      await token.mint(USER0, WAD);
      await token.approve(tokenLocking.address, WAD, { from: USER0 });
      await tokenLocking.deposit(token.address, WAD, false, { from: USER0 });
      await colony.approveStake(expenditureUtils.address, 1, WAD, { from: USER0 });

      const userLock = await tokenLocking.getUserLock(token.address, USER0);
      expect(userLock.balance).to.eq.BN(WAD);
    });

    it("can create an expenditure by submitting a stake", async () => {
      await expenditureUtils.makeExpenditureWithStake(1, UINT256_MAX, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      const { owner } = await colony.getExpenditure(expenditureId);
      expect(owner).to.equal(USER0);

      const obligation = await tokenLocking.getObligation(USER0, token.address, colony.address);
      expect(obligation).to.eq.BN(WAD.muln(3).divn(10));
    });

    it("can slash the stake with the arbitration permission", async () => {
      await expenditureUtils.makeExpenditureWithStake(1, UINT256_MAX, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      await expenditureUtils.slashStake(1, UINT256_MAX, expenditureId, USER0);

      const obligation = await tokenLocking.getObligation(USER0, token.address, colony.address);
      expect(obligation).to.be.zero;

      const userLock = await tokenLocking.getUserLock(token.address, USER0);
      expect(userLock.balance).to.eq.BN(WAD.sub(WAD.muln(3).divn(10)));
    });

    it("if ownership is transferred, the original owner is still slashed", async () => {
      await expenditureUtils.makeExpenditureWithStake(1, UINT256_MAX, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      await colony.transferExpenditure(expenditureId, USER1, { from: USER0 });

      // New owner can't be slahed
      await checkErrorRevert(expenditureUtils.slashStake(1, UINT256_MAX, 0, USER1), "expenditure-utils-nothing-to-slash");

      // Original owner can be
      await expenditureUtils.slashStake(1, UINT256_MAX, expenditureId, USER0);

      const obligation = await tokenLocking.getObligation(USER0, token.address, colony.address);
      expect(obligation).to.be.zero;

      const userLock = await tokenLocking.getUserLock(token.address, USER0);
      expect(userLock.balance).to.eq.BN(WAD.sub(WAD.muln(3).divn(10)));
    });

    it("cannot slash a nonexistent stake", async () => {
      await checkErrorRevert(expenditureUtils.slashStake(1, UINT256_MAX, 0, USER0), "expenditure-utils-nothing-to-slash");
    });

    it("can reclaim the stake by cancelling the expenditure", async () => {
      await expenditureUtils.makeExpenditureWithStake(1, UINT256_MAX, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      await colony.cancelExpenditure(expenditureId);

      await expenditureUtils.reclaimStake(expenditureId);

      const obligation = await tokenLocking.getObligation(USER0, token.address, colony.address);
      expect(obligation).to.be.zero;

      const userLock = await tokenLocking.getUserLock(token.address, USER0);
      expect(userLock.balance).to.eq.BN(WAD);
    });

    it("can reclaim the stake by finalizing the expenditure", async () => {
      await expenditureUtils.makeExpenditureWithStake(1, UINT256_MAX, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      await colony.finalizeExpenditure(expenditureId);

      await expenditureUtils.reclaimStake(expenditureId);

      const obligation = await tokenLocking.getObligation(USER0, token.address, colony.address);
      expect(obligation).to.be.zero;

      const userLock = await tokenLocking.getUserLock(token.address, USER0);
      expect(userLock.balance).to.eq.BN(WAD);
    });

    it("cannot reclaim the stake while the expenditure is in progress", async () => {
      await expenditureUtils.makeExpenditureWithStake(1, UINT256_MAX, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      await checkErrorRevert(expenditureUtils.reclaimStake(expenditureId), "expenditure-utils-expenditure-invalid-state");
    });

    it("cannot reclaim a nonexistent stake", async () => {
      await checkErrorRevert(expenditureUtils.reclaimStake(0), "expenditure-utils-nothing-to-claim");
    });
  });

  describe("setting the payout modifiers with arbitration", async () => {
    let expenditureId;

    beforeEach(async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1);
      expenditureId = await colony.getExpenditureCount();

      await colony.lockExpenditure(expenditureId);
    });

    it("can set the payout modifier in the locked state", async () => {
      let expenditureSlot;

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.payoutModifier).to.be.zero;

      await expenditureUtils.setExpenditurePayoutModifiers(1, UINT256_MAX, expenditureId, [0], [WAD], { from: USER0 });

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.payoutModifier).to.eq.BN(WAD);
    });

    it("cannot set the payout modifier with bad arguments", async () => {
      await checkErrorRevert(
        expenditureUtils.setExpenditurePayoutModifiers(1, UINT256_MAX, expenditureId, [0], [], { from: USER0 }),
        "evaluated-expenditure-bad-slots"
      );
    });

    it("cannot set the payout modifier if not the owner", async () => {
      await checkErrorRevert(
        expenditureUtils.setExpenditurePayoutModifiers(1, UINT256_MAX, expenditureId, [0], [WAD], { from: USER1 }),
        "evaluated-expenditure-not-owner"
      );
    });

    it("can set the payout modifier via metatransaction", async () => {
      const txData = await expenditureUtils.contract.methods
        .setExpenditurePayoutModifiers(1, UINT256_MAX.toString(), expenditureId.toString(), [0], [WAD.toString()])
        .encodeABI();

      const { r, s, v } = await getMetaTransactionParameters(txData, USER0, expenditureUtils.address);

      let expenditureSlot;
      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.payoutModifier).to.be.zero;

      await expenditureUtils.executeMetaTransaction(USER0, txData, r, s, v, { from: USER1 });

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.payoutModifier).to.eq.BN(WAD);
    });
  });
});
