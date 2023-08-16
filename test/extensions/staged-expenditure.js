/* globals artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");
const { soliditySha3 } = require("web3-utils");

const { UINT256_MAX, UINT128_MAX, WAD, ADDRESS_ZERO, MINING_CYCLE_DURATION, CHALLENGE_RESPONSE_WINDOW_DURATION } = require("../../helpers/constants");
const { setupRandomColony, fundColonyWithTokens } = require("../../helpers/test-data-generator");
const {
  checkErrorRevert,
  web3GetCode,
  expectEvent,
  expectNoEvent,
  makeReputationKey,
  makeReputationValue,
  getActiveRepCycle,
  forwardTime,
} = require("../../helpers/test-helper");

const PatriciaTree = require("../../packages/reputation-miner/patricia");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const EtherRouter = artifacts.require("EtherRouter");
const StagedExpenditure = artifacts.require("StagedExpenditure");
const StakedExpenditure = artifacts.require("StakedExpenditure");

const STAGED_EXPENDITURE = soliditySha3("StagedExpenditure");

contract("Staged Expenditure", (accounts) => {
  let colonyNetwork;
  let colony;
  let token;
  let stagedExpenditure;
  let version;

  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const MINER = accounts[5];

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const extension = await StagedExpenditure.new();
    version = await extension.version();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));

    await colony.installExtension(STAGED_EXPENDITURE, version);

    const stagedExpenditureAddress = await colonyNetwork.getExtensionInstallation(STAGED_EXPENDITURE, colony.address);
    stagedExpenditure = await StagedExpenditure.at(stagedExpenditureAddress);

    await colony.setArbitrationRole(1, UINT256_MAX, stagedExpenditure.address, 1, true);
    await colony.setAdministrationRole(1, UINT256_MAX, stagedExpenditure.address, 1, true);
    await colony.setFundingRole(1, UINT256_MAX, USER0, 1, true);
  });

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      stagedExpenditure = await StagedExpenditure.new();
      await stagedExpenditure.install(colony.address);

      await checkErrorRevert(stagedExpenditure.install(colony.address), "extension-already-installed");

      const identifier = await stagedExpenditure.identifier();
      expect(identifier).to.equal(STAGED_EXPENDITURE);

      const capabilityRoles = await stagedExpenditure.getCapabilityRoles("0x0");
      expect(capabilityRoles).to.equal(ethers.constants.HashZero);

      await stagedExpenditure.finishUpgrade();
      await stagedExpenditure.deprecate(true);
      await stagedExpenditure.uninstall();

      const code = await web3GetCode(stagedExpenditure.address);
      expect(code).to.equal("0x");
    });

    it("can't use the network-level functions if installed via ColonyNetwork", async () => {
      await checkErrorRevert(stagedExpenditure.install(ADDRESS_ZERO, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(stagedExpenditure.finishUpgrade({ from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(stagedExpenditure.deprecate(true, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(stagedExpenditure.uninstall({ from: USER1 }), "ds-auth-unauthorized");
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(STAGED_EXPENDITURE, version, { from: USER0 });

      await checkErrorRevert(colony.installExtension(STAGED_EXPENDITURE, version, { from: USER0 }), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(STAGED_EXPENDITURE, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(STAGED_EXPENDITURE, { from: USER0 });
    });
  });

  describe("using the extension", async () => {
    it("can create a staged payment via permissions", async () => {
      await fundColonyWithTokens(colony, token, WAD.muln(10));

      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();
      const expenditure = await colony.getExpenditure(expenditureId);
      const domain1 = await colony.getDomain(1);

      await stagedExpenditure.setExpenditureStaged(expenditureId, true, { from: USER0 });

      await colony.setExpenditureRecipients(expenditureId, [0, 1], [USER1, USER1], { from: USER0 });
      await colony.setExpenditureClaimDelays(expenditureId, [0, 1], [UINT128_MAX, UINT128_MAX], { from: USER0 });
      await colony.setExpenditurePayouts(expenditureId, [0, 1], token.address, [WAD, WAD.muln(2)], { from: USER0 });

      await colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        WAD.muln(3),
        token.address,
        { from: USER0 }
      );

      // Cannot release stage if not finalized
      await checkErrorRevert(
        stagedExpenditure.releaseStagedPayment(1, UINT256_MAX, expenditureId, 0, [token.address], { from: USER0 }),
        "expenditure-not-finalized"
      );

      await colony.finalizeExpenditure(expenditureId);

      // Cannot claim until the slot is released
      await checkErrorRevert(colony.claimExpenditurePayout(expenditureId, 0, token.address), "colony-expenditure-cannot-claim");

      // Cannot release stage if not owner
      await checkErrorRevert(
        stagedExpenditure.releaseStagedPayment(1, UINT256_MAX, expenditureId, 0, [token.address], { from: USER1 }),
        "staged-expenditure-not-owner"
      );

      await stagedExpenditure.releaseStagedPayment(1, UINT256_MAX, expenditureId, 0, [token.address], { from: USER0 });
      await colony.claimExpenditurePayout(expenditureId, 0, token.address);
    });

    it("can create a staged payment via a stake", async () => {
      const STAKED_EXPENDITURE = soliditySha3("StakedExpenditure");
      const extension = await StakedExpenditure.new();
      const stakedExpenditureversion = await extension.version();

      const reputationTree = new PatriciaTree();
      const domain1 = await colony.getDomain(1);
      reputationTree.insert(makeReputationKey(colony.address, domain1.skillId), makeReputationValue(WAD, 1));

      const rootHash = await reputationTree.getRootHash();
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash(rootHash, 0, "0x00", 10, { from: MINER });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(0, { from: MINER });

      await colony.installExtension(STAKED_EXPENDITURE, stakedExpenditureversion);

      const stakedExpenditureAddress = await colonyNetwork.getExtensionInstallation(STAKED_EXPENDITURE, colony.address);
      const stakedExpenditure = await StakedExpenditure.at(stakedExpenditureAddress);
      await colony.setAdministrationRole(1, UINT256_MAX, stakedExpenditure.address, 1, true);

      await fundColonyWithTokens(colony, token, WAD.muln(10));

      const domain1Key = makeReputationKey(colony.address, domain1.skillId);
      const domain1Value = makeReputationValue(WAD, 1);
      const [domain1Mask, domain1Siblings] = reputationTree.getProof(domain1Key);

      await stakedExpenditure.makeExpenditureWithStake(1, UINT256_MAX, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();
      const expenditure = await colony.getExpenditure(expenditureId);

      await stagedExpenditure.setExpenditureStaged(expenditureId, true, { from: USER0 });

      await colony.setExpenditureRecipients(expenditureId, [0, 1], [USER1, USER1], { from: USER0 });
      await colony.setExpenditureClaimDelays(expenditureId, [0, 1], [UINT128_MAX, UINT128_MAX], { from: USER0 });
      await colony.setExpenditurePayouts(expenditureId, [0, 1], token.address, [WAD, WAD.muln(2)], { from: USER0 });

      await colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        WAD.muln(3),
        token.address,
        { from: USER0 }
      );

      await colony.finalizeExpenditure(expenditureId);

      await stagedExpenditure.releaseStagedPayment(1, UINT256_MAX, expenditureId, 0, [token.address], { from: USER0 });

      await colony.claimExpenditurePayout(expenditureId, 0, token.address);
    });

    it("non-owners cannot set an expenditure to a staged payment", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      await checkErrorRevert(stagedExpenditure.setExpenditureStaged(expenditureId, true, { from: USER1 }), "staged-expenditure-not-owner");
    });

    it("if an expenditure is not in draft state, cannot be turned in to staged expenditure", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      await colony.finalizeExpenditure(expenditureId, { from: USER0 });
      await checkErrorRevert(stagedExpenditure.setExpenditureStaged(expenditureId, true, { from: USER0 }), "expenditure-not-draft");
    });

    it("should emit an event only when an expenditure changes to or from a staged expenditure", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      let tx = await stagedExpenditure.setExpenditureStaged(expenditureId, true, { from: USER0 });
      await expectEvent(tx, "ExpenditureMadeStaged", [expenditureId, true]);

      tx = await stagedExpenditure.setExpenditureStaged(expenditureId, true, { from: USER0 });
      await expectNoEvent(tx, "ExpenditureMadeStaged", [expenditureId, true]);

      tx = await stagedExpenditure.setExpenditureStaged(expenditureId, false, { from: USER0 });
      await expectEvent(tx, "ExpenditureMadeStaged", [expenditureId, false]);

      tx = await stagedExpenditure.setExpenditureStaged(expenditureId, false, { from: USER0 });
      await expectNoEvent(tx, "ExpenditureMadeStaged", [expenditureId, false]);
    });

    it("can release, but not claim, a staged payment", async () => {
      await fundColonyWithTokens(colony, token, WAD.muln(10));

      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();
      const expenditure = await colony.getExpenditure(expenditureId);
      const domain1 = await colony.getDomain(1);

      await stagedExpenditure.setExpenditureStaged(expenditureId, true, {
        from: USER0,
      });

      await colony.setExpenditureRecipients(expenditureId, [0, 1], [USER1, USER1], { from: USER0 });
      await colony.setExpenditureClaimDelays(expenditureId, [0, 1], [UINT128_MAX, UINT128_MAX], { from: USER0 });
      await colony.setExpenditurePayouts(expenditureId, [0, 1], token.address, [WAD, WAD.muln(2)], { from: USER0 });

      await colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        WAD.muln(3),
        token.address,
        { from: USER0 }
      );

      await colony.finalizeExpenditure(expenditureId);

      let slotBefore = await colony.getExpenditureSlot(expenditureId, 0);

      await stagedExpenditure.releaseStagedPayment(1, UINT256_MAX, expenditureId, 0, [], { from: USER0 });

      let slotAfter = await colony.getExpenditureSlot(expenditureId, 0);

      expect(slotBefore.claimDelay).to.equal(UINT128_MAX.toString());
      expect(slotAfter.claimDelay).to.equal("0");

      let slotPayout = await colony.getExpenditureSlotPayout(expenditureId, 0, token.address);
      expect(slotPayout).to.eq.BN(WAD);

      slotBefore = await colony.getExpenditureSlot(expenditureId, 1);

      await stagedExpenditure.releaseStagedPayment(1, UINT256_MAX, expenditureId, 1, [], { from: USER0 });

      slotAfter = await colony.getExpenditureSlot(expenditureId, 1);

      expect(slotBefore.claimDelay).to.equal(UINT128_MAX.toString());
      expect(slotAfter.claimDelay).to.equal("0");

      slotPayout = await colony.getExpenditureSlotPayout(expenditureId, 1, token.address);
      expect(slotPayout).to.eq.BN(WAD.muln(2));
    });

    it("cannot release a stage if not a staged payment", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      await checkErrorRevert(
        stagedExpenditure.releaseStagedPayment(1, UINT256_MAX, expenditureId, 0, [token.address], { from: USER0 }),
        "staged-expenditure-not-staged-expenditure"
      );
    });
  });
});
