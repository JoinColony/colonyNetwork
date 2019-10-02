/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";

import { UINT256_MAX, WAD, INITIAL_FUNDING, GLOBAL_SKILL_ID, FUNDING_ROLE, ADMINISTRATION_ROLE } from "../../helpers/constants";
import { checkErrorRevert, web3GetCode } from "../../helpers/test-helper";
import { setupEtherRouter } from "../../helpers/upgradable-contracts";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, setupRandomColony, fundColonyWithTokens } from "../../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ExtensionManager = artifacts.require("ExtensionManager");
const OneTxPayment = artifacts.require("OneTxPayment");
const Resolver = artifacts.require("Resolver");

contract("One transaction payments", (accounts) => {
  let colony;
  let token;
  let colonyNetwork;
  let extensionManager;
  let metaColony;
  let oneTxExtension;

  const ONE_TX_PAYMENT = soliditySha3("OneTxPayment");

  const RECIPIENT = accounts[3];
  const RECIPIENT2 = accounts[4];
  const COLONY_ADMIN = accounts[5];

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

    extensionManager = await ExtensionManager.new(colonyNetwork.address);
    await metaColony.setExtensionManager(extensionManager.address);

    const oneTxPayment = await OneTxPayment.new();
    const resolver = await Resolver.new();
    await setupEtherRouter("OneTxPayment", { OneTxPayment: oneTxPayment.address }, resolver);
    await metaColony.addExtension(ONE_TX_PAYMENT, resolver.address, [FUNDING_ROLE, ADMINISTRATION_ROLE]);

    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

    await colony.setRootRole(extensionManager.address, true);
    await extensionManager.installExtension(ONE_TX_PAYMENT, 1, colony.address, 0, 1, 0, 1);

    const extensionAddress = await extensionManager.getExtension(ONE_TX_PAYMENT, colony.address, 1);
    oneTxExtension = await OneTxPayment.at(extensionAddress);

    // Give a user colony administration rights (needed for one-tx)
    await colony.setAdministrationRole(1, UINT256_MAX, COLONY_ADMIN, 1, true);
    await colony.setFundingRole(1, UINT256_MAX, COLONY_ADMIN, 1, true);
  });

  describe("one tx payments", () => {
    it("should implement the ColonyExtension interface", async () => {
      const extension = await OneTxPayment.new();

      const version = await extension.version();
      expect(version).to.eq.BN(1);

      await extension.install(colony.address);
      await checkErrorRevert(extension.install(colony.address), "extension-already-installed");

      await extension.finishUpgrade();

      await extension.uninstall();
      const code = await web3GetCode(extension.address);
      expect(code).to.equal("0x");
    });

    it("should allow a single-transaction payment of tokens to occur", async () => {
      const balanceBefore = await token.balanceOf(RECIPIENT);
      expect(balanceBefore).to.eq.BN(0);
      // This is the one transactions. Those ones above don't count...
      await oneTxExtension.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [RECIPIENT], [token.address], [10], 1, GLOBAL_SKILL_ID, {
        from: COLONY_ADMIN,
      });
      // Check it completed
      const balanceAfter = await token.balanceOf(RECIPIENT);
      expect(balanceAfter).to.eq.BN(9);
    });

    it("should allow a single-transaction payment of ETH to occur", async () => {
      const balanceBefore = await web3.eth.getBalance(RECIPIENT);
      await colony.send(10); // NB 10 wei, not ten ether!
      await colony.claimColonyFunds(ethers.constants.AddressZero);
      // This is the one transactions. Those ones above don't count...
      await oneTxExtension.makePaymentFundedFromDomain(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        [RECIPIENT],
        [ethers.constants.AddressZero],
        [10],
        1,
        GLOBAL_SKILL_ID,
        { from: COLONY_ADMIN }
      );
      // Check it completed
      const balanceAfter = await web3.eth.getBalance(RECIPIENT);
      // So only 9 here, because of the same rounding errors as applied to the token
      expect(new web3.utils.BN(balanceAfter).sub(new web3.utils.BN(balanceBefore))).to.eq.BN(9);
    });

    it("should allow a single-transaction to occur in a child domain", async () => {
      await colony.addDomain(1, UINT256_MAX, 1);
      const d1 = await colony.getDomain(1);
      const d2 = await colony.getDomain(2);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 0, d1.fundingPotId, d2.fundingPotId, WAD, token.address);
      await oneTxExtension.makePaymentFundedFromDomain(1, 0, 1, 0, [RECIPIENT], [token.address], [10], 2, GLOBAL_SKILL_ID, { from: COLONY_ADMIN });
    });

    it("should allow a single-transaction to occur in a child domain, paid out from the root domain", async () => {
      await colony.addDomain(1, UINT256_MAX, 1);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await oneTxExtension.makePayment(1, 0, 1, 0, [RECIPIENT], [token.address], [10], 2, GLOBAL_SKILL_ID, { from: COLONY_ADMIN });
    });

    it("should allow a single-transaction to occur in a child domain that's not the first child, paid out from the root domain", async () => {
      await colony.addDomain(1, UINT256_MAX, 1);
      await colony.addDomain(1, UINT256_MAX, 1);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await oneTxExtension.makePayment(1, 1, 1, 1, [RECIPIENT], [token.address], [10], 3, GLOBAL_SKILL_ID, { from: COLONY_ADMIN });
    });

    it("should allow a single-transaction to occur in the root domain, paid out from the root domain", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await oneTxExtension.makePayment(1, UINT256_MAX, 1, UINT256_MAX, [RECIPIENT], [token.address], [10], 1, GLOBAL_SKILL_ID, {
        from: COLONY_ADMIN,
      });
    });

    it(`should not allow a single-transaction to occur in a child domain, paid out from the root domain
      if the user does not have permission to take funds from root domain`, async () => {
      await colony.addDomain(1, UINT256_MAX, 1);
      const USER = accounts[6];

      await colony.setAdministrationRole(1, 0, USER, 2, true);
      await colony.setFundingRole(1, 0, USER, 2, true);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await checkErrorRevert(
        oneTxExtension.makePayment(2, UINT256_MAX, 2, UINT256_MAX, [RECIPIENT], [token.address], [10], 2, GLOBAL_SKILL_ID, { from: USER }),
        "colony-one-tx-payment-root-funding-not-authorized"
      );
    });

    it("should allow a single-transaction to occur when user has different permissions than contract", async () => {
      await colony.addDomain(1, UINT256_MAX, 1);
      const d1 = await colony.getDomain(1);
      const d2 = await colony.getDomain(2);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 0, d1.fundingPotId, d2.fundingPotId, WAD, token.address);

      const USER = accounts[6];
      await colony.setAdministrationRole(1, 0, USER, 2, true);
      await colony.setFundingRole(1, 0, USER, 2, true);
      await oneTxExtension.makePaymentFundedFromDomain(1, 0, 2, UINT256_MAX, [RECIPIENT], [token.address], [10], 2, GLOBAL_SKILL_ID, { from: USER });
    });

    it("should not allow a non-admin to make a single-transaction payment", async () => {
      await checkErrorRevert(
        oneTxExtension.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [RECIPIENT], [token.address], [10], 1, GLOBAL_SKILL_ID, {
          from: accounts[10],
        }),
        "colony-one-tx-payment-administration-not-authorized"
      );
    });

    it("should not allow a non-funder to make a single-transaction payment", async () => {
      await colony.setAdministrationRole(1, UINT256_MAX, accounts[10], 1, true);
      await checkErrorRevert(
        oneTxExtension.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [RECIPIENT], [token.address], [10], 1, GLOBAL_SKILL_ID, {
          from: accounts[10],
        }),
        "colony-one-tx-payment-funding-not-authorized"
      );
    });

    it("should not allow an admin to specify a non-global skill", async () => {
      await checkErrorRevert(
        oneTxExtension.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [RECIPIENT], [token.address], [10], 1, 2, { from: COLONY_ADMIN }),
        "colony-not-global-skill"
      );
    });

    it("should not allow an admin to specify a deprecated global skill", async () => {
      await metaColony.addGlobalSkill();
      const skillId = await colonyNetwork.getSkillCount();
      await metaColony.deprecateGlobalSkill(skillId);

      await checkErrorRevert(
        oneTxExtension.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [RECIPIENT], [token.address], [10], 1, skillId, {
          from: COLONY_ADMIN,
        }),
        "colony-deprecated-global-skill"
      );
    });

    it("should not allow an admin to specify a non-existent domain", async () => {
      await checkErrorRevert(
        oneTxExtension.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [RECIPIENT], [token.address], [10], 99, GLOBAL_SKILL_ID, {
          from: COLONY_ADMIN,
        }),
        "colony-one-tx-payment-domain-does-not-exist"
      );
    });

    it("should not allow an admin to specify a non-existent skill", async () => {
      await checkErrorRevert(
        oneTxExtension.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [RECIPIENT], [token.address], [10], 1, 99, { from: COLONY_ADMIN }),
        "colony-skill-does-not-exist"
      );
    });

    it("should error if user permissions are bad", async () => {
      await colony.addDomain(1, UINT256_MAX, 1); // Adds domain 2 skillId 5
      await colony.addDomain(1, UINT256_MAX, 1); // Adds domain 3 skillId 6

      // Try to make a payment with the permissions in domain 1, child skill at index 1, i.e. skill 6
      // When actually domain 2 in which we are creating the task is skill 5
      await checkErrorRevert(
        oneTxExtension.makePaymentFundedFromDomain(1, 1, 1, 1, [RECIPIENT], [token.address], [10], 2, GLOBAL_SKILL_ID, { from: COLONY_ADMIN }),
        "colony-one-tx-payment-bad-child-skill"
      );
    });

    it("should allow a single-transaction payment to multiple workers", async () => {
      const balanceBefore = await token.balanceOf(RECIPIENT);
      const balanceBefore2 = await token.balanceOf(RECIPIENT2);
      expect(balanceBefore).to.eq.BN(0);
      expect(balanceBefore2).to.eq.BN(0);
      // This is the one transactions. Those ones above don't count...
      await oneTxExtension.makePaymentFundedFromDomain(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        [RECIPIENT, RECIPIENT2],
        [token.address, token.address],
        [10, 5],
        1,
        GLOBAL_SKILL_ID,
        { from: COLONY_ADMIN }
      );
      // Check it completed
      const balanceAfter = await token.balanceOf(RECIPIENT);
      const balanceAfter2 = await token.balanceOf(RECIPIENT2);
      expect(balanceAfter).to.eq.BN(9);
      expect(balanceAfter2).to.eq.BN(4);
    });

    it("should allow a single-transaction payment to multiple workers of ETH to occur", async () => {
      const balanceBefore = await web3.eth.getBalance(RECIPIENT);
      const balanceBefore2 = await web3.eth.getBalance(RECIPIENT2);
      await colony.send(15); // NB 15 wei, not ten ether!
      await colony.claimColonyFunds(ethers.constants.AddressZero);
      // This is the one transactions. Those ones above don't count...
      await oneTxExtension.makePaymentFundedFromDomain(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        [RECIPIENT, RECIPIENT2],
        [ethers.constants.AddressZero, ethers.constants.AddressZero],
        [10, 5],
        1,
        GLOBAL_SKILL_ID,
        { from: COLONY_ADMIN }
      );
      // Check it completed
      const balanceAfter = await web3.eth.getBalance(RECIPIENT);
      const balanceAfter2 = await web3.eth.getBalance(RECIPIENT2);
      // So only 9 and 4 here, because of the same rounding errors as applied to the token
      expect(new web3.utils.BN(balanceAfter).sub(new web3.utils.BN(balanceBefore))).to.eq.BN(9);
      expect(new web3.utils.BN(balanceAfter2).sub(new web3.utils.BN(balanceBefore2))).to.eq.BN(4);
    });

    it("should allow a single-transaction payment to multiple workers of different tokens", async () => {
      const balanceTokenBefore = await token.balanceOf(RECIPIENT);
      const balanceEthBefore2 = await web3.eth.getBalance(RECIPIENT2);
      expect(balanceTokenBefore).to.eq.BN(0);
      await colony.send(5); // NB 10 wei, not ten ether!
      await colony.claimColonyFunds(ethers.constants.AddressZero);
      // This is the one transactions. Those ones above don't count...
      await oneTxExtension.makePaymentFundedFromDomain(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        [RECIPIENT, RECIPIENT2],
        [token.address, ethers.constants.AddressZero],
        [10, 5],
        1,
        GLOBAL_SKILL_ID,
        { from: COLONY_ADMIN }
      );
      // Check it completed
      const balanceTokenAfter = await token.balanceOf(RECIPIENT);
      const balanceEthAfter2 = await web3.eth.getBalance(RECIPIENT2);
      // So only 9 and 4 here, because of the same rounding errors as applied to the token
      expect(balanceTokenAfter).to.eq.BN(9);
      expect(new web3.utils.BN(balanceEthAfter2).sub(new web3.utils.BN(balanceEthBefore2))).to.eq.BN(4);
    });

    it("should allow a single-transaction payment to multiple workers using different slots", async () => {
      const balanceTokenBefore = await token.balanceOf(RECIPIENT);
      const balanceEthBefore2 = await web3.eth.getBalance(RECIPIENT2);
      expect(balanceTokenBefore).to.eq.BN(0);
      await colony.send(10); // NB 10 wei, not ten ether!
      await colony.claimColonyFunds(ethers.constants.AddressZero);
      // This is the one transactions. Those ones above don't count...
      await oneTxExtension.makePaymentFundedFromDomain(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        [RECIPIENT2, RECIPIENT, RECIPIENT2],
        [ethers.constants.AddressZero, token.address, ethers.constants.AddressZero],
        [5, 10, 5],
        1,
        GLOBAL_SKILL_ID,
        { from: COLONY_ADMIN }
      );
      // Check it completed
      const balanceTokenAfter = await token.balanceOf(RECIPIENT);
      const balanceEthAfter2 = await web3.eth.getBalance(RECIPIENT2);
      // So only 9 and 8 here, because of the same rounding errors as applied to the token
      expect(balanceTokenAfter).to.eq.BN(9);
      expect(new web3.utils.BN(balanceEthAfter2).sub(new web3.utils.BN(balanceEthBefore2))).to.eq.BN(8);
    });

    it("should allow a single-transaction to occur in a child domain, paid out from the root domain to multiple workers", async () => {
      await colony.addDomain(1, UINT256_MAX, 1);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await oneTxExtension.makePayment(1, 0, 1, 0, [RECIPIENT, RECIPIENT2], [token.address, token.address], [10, 5], 2, GLOBAL_SKILL_ID, {
        from: COLONY_ADMIN,
      });
    });

    it("should not allow arrays of different sizes", async () => {
      await colony.addDomain(1, UINT256_MAX, 1);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await checkErrorRevert(
        oneTxExtension.makePayment(1, 0, 1, 0, [RECIPIENT2], [token.address, token.address], [10, 5], 2, GLOBAL_SKILL_ID, {
          from: COLONY_ADMIN,
        }),
        "colony-one-tx-payment-arrays-must-be-equal-length"
      );
    });
  });
});
