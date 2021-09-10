/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";

import { UINT256_MAX, WAD } from "../../helpers/constants";
import { setupEtherRouter } from "../../helpers/upgradable-contracts";
import { checkErrorRevert, web3GetCode, getExtensionAddressFromTx } from "../../helpers/test-helper";
import { setupColonyNetwork, setupRandomColony, setupMetaColonyWithLockedCLNYToken } from "../../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EvaluatedExpenditure = artifacts.require("EvaluatedExpenditure");
const Resolver = artifacts.require("Resolver");
const ColonyExtension = artifacts.require("ColonyExtension");

const EVALUATED_EXPENDITURE = soliditySha3("EvaluatedExpenditure");

contract("EvaluatedExpenditure", (accounts) => {
  let colonyNetwork;
  let colony;
  let evaluatedExpenditure;
  let evaluatedExpenditureVersion;

  const USER0 = accounts[0];
  const USER1 = accounts[1];

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    const { metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork);

    const evaluatedExpenditureImplementation = await EvaluatedExpenditure.new();
    const resolver = await Resolver.new();
    await setupEtherRouter("EvaluatedExpenditure", { EvaluatedExpenditure: evaluatedExpenditureImplementation.address }, resolver);
    await metaColony.addExtensionToNetwork(EVALUATED_EXPENDITURE, resolver.address);

    const versionSig = await resolver.stringToSig("version()");
    const target = await resolver.lookup(versionSig);
    const extensionImplementation = await ColonyExtension.at(target);
    evaluatedExpenditureVersion = await extensionImplementation.version();
  });

  beforeEach(async () => {
    ({ colony } = await setupRandomColony(colonyNetwork));

    const tx = await colony.installExtension(EVALUATED_EXPENDITURE, evaluatedExpenditureVersion);
    const evaluatedExpenditureAddress = getExtensionAddressFromTx(tx);
    evaluatedExpenditure = await EvaluatedExpenditure.at(evaluatedExpenditureAddress);

    await colony.setArbitrationRole(1, UINT256_MAX, evaluatedExpenditure.address, 1, true);
  });

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      evaluatedExpenditure = await EvaluatedExpenditure.new();
      await evaluatedExpenditure.install(colony.address);

      await checkErrorRevert(evaluatedExpenditure.install(colony.address), "extension-already-installed");

      const identifier = await evaluatedExpenditure.identifier();
      const version = await evaluatedExpenditure.version();
      expect(identifier).to.equal(EVALUATED_EXPENDITURE);
      expect(version).to.eq.BN(evaluatedExpenditureVersion);

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
      const tx = await colony.installExtension(EVALUATED_EXPENDITURE, evaluatedExpenditureVersion);

      const evaluatedExpenditureAddress = getExtensionAddressFromTx(tx);
      await checkErrorRevert(colony.methods["uninstallExtension(address)"](evaluatedExpenditureAddress, { from: USER1 }), "ds-auth-unauthorized");

      await colony.methods["uninstallExtension(address)"](evaluatedExpenditureAddress, { from: USER0 });
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
  });
});
