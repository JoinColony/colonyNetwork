/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";

import { INITIAL_FUNDING, ZERO_ADDRESS } from "../../helpers/constants";
import { checkErrorRevert } from "../../helpers/test-helper";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, setupRandomColony, fundColonyWithTokens } from "../../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const OneTxPayment = artifacts.require("OneTxPayment");

contract("One transaction payments", accounts => {
  let colony;
  let token;
  let colonyNetwork;
  let oneTxExtension;
  let globalSkillId;
  const RECIPIENT = accounts[3];

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    await setupMetaColonyWithLockedCLNYToken(colonyNetwork);
    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
    oneTxExtension = await OneTxPayment.new();
    globalSkillId = await colonyNetwork.getRootGlobalSkillId();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

    // Give oneTxExtension admin rights
    await colony.setAdminRole(oneTxExtension.address);
  });

  describe("Under normal conditions", () => {
    it("should allow a single transaction payment of tokens to occur", async () => {
      const balanceBefore = await token.balanceOf(RECIPIENT);
      expect(balanceBefore).to.eq.BN(0);
      // This is the one transactions. Those ones above don't count...
      await oneTxExtension.makePayment(colony.address, RECIPIENT, token.address, 10, 1, globalSkillId);
      // Check it completed
      const balanceAfter = await token.balanceOf(RECIPIENT);
      expect(balanceAfter).to.eq.BN(9);
    });

    it("should allow a single transaction payment of ETH to occur", async () => {
      const balanceBefore = await web3.eth.getBalance(RECIPIENT);
      await colony.send(10); // NB 10 wei, not ten ether!
      await colony.claimColonyFunds(ZERO_ADDRESS);
      // This is the one transactions. Those ones above don't count...
      await oneTxExtension.makePayment(colony.address, RECIPIENT, ZERO_ADDRESS, 10, 1, globalSkillId);
      // Check it completed
      const balanceAfter = await web3.eth.getBalance(RECIPIENT);
      // So only 9 here, because of the same rounding errors as applied to the token
      expect(new web3.utils.BN(balanceAfter).sub(new web3.utils.BN(balanceBefore))).to.eq.BN(9);
    });

    it.skip("should not allow a non-admin to make a single-transaction payment", async () => {
      await checkErrorRevert(
        oneTxExtension.makePayment(colony.address, RECIPIENT, token.address, 10, 1, globalSkillId, { from: RECIPIENT }),
        "colony-one-tx-payment-not-authorized"
      );
    });

    it.skip("should not allow an admin to specify a non-global skill", async () => {
      await checkErrorRevert(oneTxExtension.makePayment(colony.address, RECIPIENT, token.address, 10, 1, 3), "colony-not-global-skill");
    });

    it.skip("should not allow an admin to specify a non-existent domain", async () => {
      await checkErrorRevert(
        oneTxExtension.makePayment(colony.address, RECIPIENT, token.address, 10, 99, globalSkillId),
        "colony-domain-does-not-exist"
      );
    });

    it.skip("should not allow an admin to specify a non-existent skill", async () => {
      await checkErrorRevert(oneTxExtension.makePayment(colony.address, RECIPIENT, token.address, 10, 1, 99), "colony-skill-does-not-exist");
    });
  });
});
