/* globals artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");
const { soliditySha3 } = require("web3-utils");

const { UINT256_MAX, WAD, ADDRESS_ZERO } = require("../../helpers/constants");
const { checkErrorRevert, web3GetCode } = require("../../helpers/test-helper");
const { setupRandomColony, getMetaTransactionParameters } = require("../../helpers/test-data-generator");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const EtherRouter = artifacts.require("EtherRouter");
const EvaluatedExpenditure = artifacts.require("EvaluatedExpenditure");

const EVALUATED_EXPENDITURE = soliditySha3("EvaluatedExpenditure");

contract("EvaluatedExpenditure", (accounts) => {
  let colonyNetwork;
  let colony;
  let evaluatedExpenditure;
  let version;

  const USER0 = accounts[0];
  const USER1 = accounts[1];

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const extension = await EvaluatedExpenditure.new();
    version = await extension.version();
  });

  beforeEach(async () => {
    ({ colony } = await setupRandomColony(colonyNetwork));

    await colony.installExtension(EVALUATED_EXPENDITURE, version);

    const evaluatedExpenditureAddress = await colonyNetwork.getExtensionInstallation(EVALUATED_EXPENDITURE, colony.address);
    evaluatedExpenditure = await EvaluatedExpenditure.at(evaluatedExpenditureAddress);

    await colony.setArbitrationRole(1, UINT256_MAX, evaluatedExpenditure.address, 1, true);
  });

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      evaluatedExpenditure = await EvaluatedExpenditure.new();
      await evaluatedExpenditure.install(colony.address);

      await checkErrorRevert(evaluatedExpenditure.install(colony.address), "extension-already-installed");

      const identifier = await evaluatedExpenditure.identifier();
      expect(identifier).to.equal(EVALUATED_EXPENDITURE);

      const capabilityRoles = await evaluatedExpenditure.getCapabilityRoles("0x0");
      expect(capabilityRoles).to.equal(ethers.constants.HashZero);

      await evaluatedExpenditure.finishUpgrade();
      await evaluatedExpenditure.deprecate(true);
      await evaluatedExpenditure.uninstall();

      const code = await web3GetCode(evaluatedExpenditure.address);
      expect(code).to.equal("0x");
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(EVALUATED_EXPENDITURE, version, { from: USER0 });

      await checkErrorRevert(colony.installExtension(EVALUATED_EXPENDITURE, version, { from: USER0 }), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(EVALUATED_EXPENDITURE, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(EVALUATED_EXPENDITURE, { from: USER0 });
    });

    it("can't use the network-level functions if installed via ColonyNetwork", async () => {
      await checkErrorRevert(evaluatedExpenditure.install(ADDRESS_ZERO, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(evaluatedExpenditure.finishUpgrade({ from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(evaluatedExpenditure.deprecate(true, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(evaluatedExpenditure.uninstall({ from: USER1 }), "ds-auth-unauthorized");
    });
  });

  describe("using the extension", async () => {
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

      await evaluatedExpenditure.setExpenditurePayoutModifiers(1, UINT256_MAX, expenditureId, [0], [WAD], { from: USER0 });

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.payoutModifier).to.eq.BN(WAD);
    });

    it("cannot set the payout modifier with bad arguments", async () => {
      await checkErrorRevert(
        evaluatedExpenditure.setExpenditurePayoutModifiers(1, UINT256_MAX, expenditureId, [0], [], { from: USER0 }),
        "evaluated-expenditure-bad-slots"
      );
    });

    it("cannot set the payout modifier if not the owner", async () => {
      await checkErrorRevert(
        evaluatedExpenditure.setExpenditurePayoutModifiers(1, UINT256_MAX, expenditureId, [0], [WAD], { from: USER1 }),
        "evaluated-expenditure-not-owner"
      );
    });

    it("can set the payout modifier via metatransaction", async () => {
      const txData = await evaluatedExpenditure.contract.methods
        .setExpenditurePayoutModifiers(1, UINT256_MAX.toString(), expenditureId.toString(), [0], [WAD.toString()])
        .encodeABI();

      const { r, s, v } = await getMetaTransactionParameters(txData, USER0, evaluatedExpenditure.address);

      let expenditureSlot;
      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.payoutModifier).to.be.zero;

      await evaluatedExpenditure.executeMetaTransaction(USER0, txData, r, s, v, { from: USER1 });

      expenditureSlot = await colony.getExpenditureSlot(expenditureId, 0);
      expect(expenditureSlot.payoutModifier).to.eq.BN(WAD);
    });
  });
});
