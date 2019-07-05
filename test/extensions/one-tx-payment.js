/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";

import { WAD, INITIAL_FUNDING, GLOBAL_SKILL_ID } from "../../helpers/constants";
import { checkErrorRevert } from "../../helpers/test-helper";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, setupRandomColony, fundColonyWithTokens } from "../../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const OneTxPaymentFactory = artifacts.require("OneTxPaymentFactory");
const OneTxPayment = artifacts.require("OneTxPayment");

contract("One transaction payments", accounts => {
  let colony;
  let token;
  let colonyNetwork;
  let metaColony;
  let oneTxExtension;
  let oneTxExtensionFactory;

  const RECIPIENT = accounts[3];
  const COLONY_ADMIN = accounts[5];

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));
    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
    oneTxExtensionFactory = await OneTxPaymentFactory.new();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

    // Give a user colony administration rights (needed for one-tx)
    await colony.setAdministrationRole(1, 0, COLONY_ADMIN, 1, true);
    await colony.setFundingRole(1, 0, COLONY_ADMIN, 1, true);

    await oneTxExtensionFactory.deployExtension(colony.address);
    const oneTxExtensionAddress = await oneTxExtensionFactory.deployedExtensions(colony.address);
    oneTxExtension = await OneTxPayment.at(oneTxExtensionAddress);

    // Give oneTxExtension administration and funding rights
    await colony.setAdministrationRole(1, 0, oneTxExtension.address, 1, true);
    await colony.setFundingRole(1, 0, oneTxExtension.address, 1, true);
  });

  describe("under normal conditions", () => {
    it("does not allow an extension to be redeployed", async () => {
      await checkErrorRevert(oneTxExtensionFactory.deployExtension(colony.address), "colony-extension-already-deployed");
    });

    it("does not allow a user without root permission to deploy the extension", async () => {
      await checkErrorRevert(oneTxExtensionFactory.deployExtension(colony.address, { from: COLONY_ADMIN }), "colony-extension-user-not-root");
    });

    it("does not allow a user without root permission to remove the extension", async () => {
      await checkErrorRevert(oneTxExtensionFactory.removeExtension(colony.address, { from: COLONY_ADMIN }), "colony-extension-user-not-root");
    });

    it("does allow a user with root permission to remove the extension", async () => {
      const tx = await oneTxExtensionFactory.removeExtension(colony.address);
      const extensionAddress = await oneTxExtensionFactory.deployedExtensions(colony.address);
      assert.equal(extensionAddress, ethers.constants.AddressZero);
      const event = tx.logs[0];
      assert.equal(event.args[0], "OneTxPayment");
      assert.equal(event.args[1], colony.address);
    });

    it("emits the expected event when extension added", async () => {
      ({ colony, token } = await setupRandomColony(colonyNetwork));
      const tx = await oneTxExtensionFactory.deployExtension(colony.address);
      const event = tx.logs[0];
      assert.equal(event.args[0], "OneTxPayment");
      assert.equal(event.args[1], colony.address);
      const oneTxExtensionAddress = await oneTxExtensionFactory.deployedExtensions(colony.address);
      assert.equal(event.args[2], oneTxExtensionAddress);
    });

    it("should allow a single-transaction payment of tokens to occur", async () => {
      const balanceBefore = await token.balanceOf(RECIPIENT);
      expect(balanceBefore).to.eq.BN(0);
      // This is the one transactions. Those ones above don't count...
      await oneTxExtension.makePaymentFundedFromDomain(1, 0, 1, 0, RECIPIENT, token.address, 10, 1, GLOBAL_SKILL_ID, { from: COLONY_ADMIN });
      // Check it completed
      const balanceAfter = await token.balanceOf(RECIPIENT);
      expect(balanceAfter).to.eq.BN(9);
    });

    it("should allow a single-transaction payment of ETH to occur", async () => {
      const balanceBefore = await web3.eth.getBalance(RECIPIENT);
      await colony.send(10); // NB 10 wei, not ten ether!
      await colony.claimColonyFunds(ethers.constants.AddressZero);
      // This is the one transactions. Those ones above don't count...
      await oneTxExtension.makePaymentFundedFromDomain(1, 0, 1, 0, RECIPIENT, ethers.constants.AddressZero, 10, 1, GLOBAL_SKILL_ID, {
        from: COLONY_ADMIN
      });
      // Check it completed
      const balanceAfter = await web3.eth.getBalance(RECIPIENT);
      // So only 9 here, because of the same rounding errors as applied to the token
      expect(new web3.utils.BN(balanceAfter).sub(new web3.utils.BN(balanceBefore))).to.eq.BN(9);
    });

    it("should allow a single-transaction to occur in a child domain", async () => {
      await colony.addDomain(1, 0, 1);
      const d1 = await colony.getDomain(1);
      const d2 = await colony.getDomain(2);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await colony.moveFundsBetweenPots(1, 0, 0, d1.fundingPotId, d2.fundingPotId, WAD, token.address);
      await oneTxExtension.makePaymentFundedFromDomain(1, 0, 1, 0, RECIPIENT, token.address, 10, 2, GLOBAL_SKILL_ID, { from: COLONY_ADMIN });
    });

    it("should allow a single-transaction to occur in a child domain, paid out from the root domain", async () => {
      await colony.addDomain(1, 0, 1);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await oneTxExtension.makePayment(1, 0, 1, 0, RECIPIENT, token.address, 10, 2, GLOBAL_SKILL_ID, { from: COLONY_ADMIN });
    });

    it("should allow a single-transaction to occur in a child domain that's not the first child, paid out from the root domain", async () => {
      await colony.addDomain(1, 0, 1);
      await colony.addDomain(1, 0, 1);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await oneTxExtension.makePayment(1, 1, 1, 1, RECIPIENT, token.address, 10, 3, GLOBAL_SKILL_ID, { from: COLONY_ADMIN });
    });

    it("should allow a single-transaction to occur in the root domain, paid out from the root domain", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await oneTxExtension.makePayment(1, 0, 1, 0, RECIPIENT, token.address, 10, 1, GLOBAL_SKILL_ID, { from: COLONY_ADMIN });
    });

    it(`should not allow a single-transaction to occur in a child domain, paid out from the root domain
      if the user does not have permission to take funds from root domain`, async () => {
      await colony.addDomain(1, 0, 1);
      const USER = accounts[6];

      await colony.setAdministrationRole(1, 0, USER, 2, true);
      await colony.setFundingRole(1, 0, USER, 2, true);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await checkErrorRevert(
        oneTxExtension.makePayment(2, 0, 2, 0, RECIPIENT, token.address, 10, 2, GLOBAL_SKILL_ID, { from: USER }),
        "colony-one-tx-payment-root-funding-not-authorized"
      );
    });

    it("should allow a single-transaction to occur when user has different permissions than contract", async () => {
      await colony.addDomain(1, 0, 1);
      const d1 = await colony.getDomain(1);
      const d2 = await colony.getDomain(2);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await colony.moveFundsBetweenPots(1, 0, 0, d1.fundingPotId, d2.fundingPotId, WAD, token.address);

      const USER = accounts[6];
      await colony.setAdministrationRole(1, 0, USER, 2, true);
      await colony.setFundingRole(1, 0, USER, 2, true);
      await oneTxExtension.makePaymentFundedFromDomain(1, 0, 2, 0, RECIPIENT, token.address, 10, 2, GLOBAL_SKILL_ID, { from: USER });
    });

    it("should not allow a non-admin to make a single-transaction payment", async () => {
      await checkErrorRevert(
        oneTxExtension.makePaymentFundedFromDomain(1, 0, 1, 0, RECIPIENT, token.address, 10, 1, GLOBAL_SKILL_ID, { from: accounts[10] }),
        "colony-one-tx-payment-administration-not-authorized"
      );
    });

    it("should not allow a non-funder to make a single-transaction payment", async () => {
      await colony.setAdministrationRole(1, 0, accounts[10], 1, true);
      await checkErrorRevert(
        oneTxExtension.makePaymentFundedFromDomain(1, 0, 1, 0, RECIPIENT, token.address, 10, 1, GLOBAL_SKILL_ID, { from: accounts[10] }),
        "colony-one-tx-payment-funding-not-authorized"
      );
    });

    it("should not allow an admin to specify a non-global skill", async () => {
      await checkErrorRevert(
        oneTxExtension.makePaymentFundedFromDomain(1, 0, 1, 0, RECIPIENT, token.address, 10, 1, 2, { from: COLONY_ADMIN }),
        "colony-not-global-skill"
      );
    });

    it("should not allow an admin to specify a deprecated global skill", async () => {
      await metaColony.addGlobalSkill();
      const skillId = await colonyNetwork.getSkillCount();
      await metaColony.deprecateGlobalSkill(skillId);

      await checkErrorRevert(
        oneTxExtension.makePaymentFundedFromDomain(1, 0, 1, 0, RECIPIENT, token.address, 10, 1, skillId, { from: COLONY_ADMIN }),
        "colony-deprecated-global-skill"
      );
    });

    it("should not allow an admin to specify a non-existent domain", async () => {
      await checkErrorRevert(
        oneTxExtension.makePaymentFundedFromDomain(1, 0, 1, 0, RECIPIENT, token.address, 10, 99, GLOBAL_SKILL_ID, { from: COLONY_ADMIN }),
        "colony-one-tx-payment-domain-does-not-exist"
      );
    });

    it("should not allow an admin to specify a non-existent skill", async () => {
      await checkErrorRevert(
        oneTxExtension.makePaymentFundedFromDomain(1, 0, 1, 0, RECIPIENT, token.address, 10, 1, 99, { from: COLONY_ADMIN }),
        "colony-skill-does-not-exist"
      );
    });

    it("should error if user permissions are bad", async () => {
      await colony.addDomain(1, 0, 1); // Adds domain 2 skillId 5
      await colony.addDomain(1, 0, 1); // Adds domain 3 skillId 6

      // Try to make a payment with the permissions in domain 1, child skill at index 1, i.e. skill 6
      // When actually domain 2 in which we are creating the task is skill 5
      await checkErrorRevert(
        oneTxExtension.makePaymentFundedFromDomain(1, 0, 1, 1, RECIPIENT, token.address, 10, 2, GLOBAL_SKILL_ID, { from: COLONY_ADMIN }),
        "colony-one-tx-payment-bad-child-skill"
      );
    });
  });
});
