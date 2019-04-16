/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";

import { WAD, INITIAL_FUNDING, GLOBAL_SKILL_ID } from "../../helpers/constants";
import { checkErrorRevert } from "../../helpers/test-helper";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, setupRandomColony, fundColonyWithTokens } from "../../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const OneTxPayment = artifacts.require("OneTxPayment");

contract("One transaction payments", accounts => {
  let colony;
  let token;
  let colonyNetwork;
  let metaColony;
  let oneTxExtension;
  const RECIPIENT = accounts[3];
  const COLONY_ADMIN = accounts[5];

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));
    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

    // Give a user colony administration rights (needed for one-tx)
    await colony.setAdministrationRole(1, 0, COLONY_ADMIN, 1, true);
    await colony.setFundingRole(1, 0, COLONY_ADMIN, 1, true);

    oneTxExtension = await OneTxPayment.new(colony.address);

    // Give oneTxExtension administration and funding rights
    await colony.setAdministrationRole(1, 0, oneTxExtension.address, 1, true);
    await colony.setFundingRole(1, 0, oneTxExtension.address, 1, true);
  });

  describe("under normal conditions", () => {
    it("should allow a single-transaction payment of tokens to occur", async () => {
      const balanceBefore = await token.balanceOf(RECIPIENT);
      expect(balanceBefore).to.eq.BN(0);
      // This is the one transactions. Those ones above don't count...
      await oneTxExtension.makePayment(1, 0, 1, 0, RECIPIENT, token.address, 10, 1, GLOBAL_SKILL_ID, { from: COLONY_ADMIN });
      // Check it completed
      const balanceAfter = await token.balanceOf(RECIPIENT);
      expect(balanceAfter).to.eq.BN(9);
    });

    it("should allow a single-transaction payment of ETH to occur", async () => {
      const balanceBefore = await web3.eth.getBalance(RECIPIENT);
      await colony.send(10); // NB 10 wei, not ten ether!
      await colony.claimColonyFunds(ethers.constants.AddressZero);
      // This is the one transactions. Those ones above don't count...
      await oneTxExtension.makePayment(1, 0, 1, 0, RECIPIENT, ethers.constants.AddressZero, 10, 1, GLOBAL_SKILL_ID, { from: COLONY_ADMIN });
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
      await oneTxExtension.makePayment(1, 0, 1, 0, RECIPIENT, token.address, 10, 2, GLOBAL_SKILL_ID, { from: COLONY_ADMIN });
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
      await oneTxExtension.makePayment(1, 0, 2, 0, RECIPIENT, token.address, 10, 2, GLOBAL_SKILL_ID, { from: USER });
    });

    it("should not allow a non-admin to make a single-transaction payment", async () => {
      await checkErrorRevert(
        oneTxExtension.makePayment(1, 0, 1, 0, RECIPIENT, token.address, 10, 1, GLOBAL_SKILL_ID, { from: accounts[10] }),
        "colony-one-tx-payment-administration-not-authorized"
      );
    });

    it("should not allow a non-funder to make a single-transaction payment", async () => {
      await colony.setAdministrationRole(1, 0, accounts[10], 1, true);
      await checkErrorRevert(
        oneTxExtension.makePayment(1, 0, 1, 0, RECIPIENT, token.address, 10, 1, GLOBAL_SKILL_ID, { from: accounts[10] }),
        "colony-one-tx-payment-funding-not-authorized"
      );
    });

    it("should not allow an admin to specify a non-global skill", async () => {
      await checkErrorRevert(
        oneTxExtension.makePayment(1, 0, 1, 0, RECIPIENT, token.address, 10, 1, 2, { from: COLONY_ADMIN }),
        "colony-not-global-skill"
      );
    });

    it("should not allow an admin to specify a deprecated global skill", async () => {
      await metaColony.addGlobalSkill();
      const skillId = await colonyNetwork.getSkillCount();
      await metaColony.deprecateGlobalSkill(skillId);

      await checkErrorRevert(
        oneTxExtension.makePayment(1, 0, 1, 0, RECIPIENT, token.address, 10, 1, skillId, { from: COLONY_ADMIN }),
        "colony-deprecated-global-skill"
      );
    });

    it("should not allow an admin to specify a non-existent domain", async () => {
      await checkErrorRevert(
        oneTxExtension.makePayment(1, 0, 1, 0, RECIPIENT, token.address, 10, 99, GLOBAL_SKILL_ID, { from: COLONY_ADMIN }),
        "ds-auth-child-domain-does-not-exist"
      );
    });

    it("should not allow an admin to specify a non-existent skill", async () => {
      await checkErrorRevert(
        oneTxExtension.makePayment(1, 0, 1, 0, RECIPIENT, token.address, 10, 1, 99, { from: COLONY_ADMIN }),
        "colony-skill-does-not-exist"
      );
    });
  });
});
