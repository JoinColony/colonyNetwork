/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";

import { UINT256_MAX, WAD, INITIAL_FUNDING, GLOBAL_SKILL_ID, FUNDING_ROLE, ADMINISTRATION_ROLE } from "../../helpers/constants";
import { checkErrorRevert, web3GetCode, rolesToBytes32, expectEvent } from "../../helpers/test-helper";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, setupRandomColony, fundColonyWithTokens } from "../../helpers/test-data-generator";
import { setupEtherRouter } from "../../helpers/upgradable-contracts";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const OneTxPayment = artifacts.require("OneTxPayment");
const Resolver = artifacts.require("Resolver");

const ONE_TX_PAYMENT = soliditySha3("OneTxPayment");

contract("One transaction payments", (accounts) => {
  let colony;
  let token;
  let colonyNetwork;
  let metaColony;
  let oneTxPayment;

  const USER1 = accounts[1].toLowerCase() < accounts[2].toLowerCase() ? accounts[1] : accounts[2];
  const USER2 = accounts[1].toLowerCase() < accounts[2].toLowerCase() ? accounts[2] : accounts[1];

  const ROLES = rolesToBytes32([FUNDING_ROLE, ADMINISTRATION_ROLE]);
  const ADDRESS_ZERO = ethers.constants.AddressZero;

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));
    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();

    const oneTxPaymentImplementation = await OneTxPayment.new();
    const resolver = await Resolver.new();
    await setupEtherRouter("OneTxPayment", { OneTxPayment: oneTxPaymentImplementation.address }, resolver);
    await metaColony.addExtensionToNetwork(ONE_TX_PAYMENT, resolver.address);
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.addDomain(1, UINT256_MAX, 1); // Domain 2, skillId 5
    await colony.addDomain(1, UINT256_MAX, 1); // Domain 3, skillId 6

    await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

    await colony.installExtension(ONE_TX_PAYMENT, 1);
    const oneTxPaymentAddress = await colonyNetwork.getExtensionInstallation(ONE_TX_PAYMENT, colony.address);
    oneTxPayment = await OneTxPayment.at(oneTxPaymentAddress);

    // Give extension funding and administration rights
    await colony.setUserRoles(1, UINT256_MAX, oneTxPayment.address, 1, ROLES);
  });

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      oneTxPayment = await OneTxPayment.new();
      await oneTxPayment.install(colony.address);

      await checkErrorRevert(oneTxPayment.install(colony.address), "extension-already-installed");

      const identifier = await oneTxPayment.identifier();
      const version = await oneTxPayment.version();
      expect(identifier).to.equal(ONE_TX_PAYMENT);
      expect(version).to.eq.BN(1);

      await oneTxPayment.finishUpgrade();
      await oneTxPayment.deprecate(true);
      await oneTxPayment.uninstall();

      const code = await web3GetCode(oneTxPayment.address);
      expect(code).to.equal("0x");
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(ONE_TX_PAYMENT, 1);

      await checkErrorRevert(colony.installExtension(ONE_TX_PAYMENT, 1), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(ONE_TX_PAYMENT, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(ONE_TX_PAYMENT);
    });
  });

  describe("using the extension", async () => {
    it("should allow a single-transaction payment of tokens to occur", async () => {
      const balanceBefore = await token.balanceOf(USER1);
      expect(balanceBefore).to.be.zero;

      const tx = await oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [token.address], [10], 1, GLOBAL_SKILL_ID);

      const balanceAfter = await token.balanceOf(USER1);
      expect(balanceAfter).to.eq.BN(9);

      await expectEvent(tx, "OneTxPaymentMade", [accounts[0], 1, 1]);
    });

    it("should allow a single-transaction payment of ETH to occur", async () => {
      const balanceBefore = await web3.eth.getBalance(USER1);
      await colony.send(10); // NB 10 wei, not ten ether!
      await colony.claimColonyFunds(ADDRESS_ZERO);

      await oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [ADDRESS_ZERO], [10], 1, GLOBAL_SKILL_ID);

      const balanceAfter = await web3.eth.getBalance(USER1);
      // So only 9 here, because of the same rounding errors as applied to the token
      expect(new web3.utils.BN(balanceAfter).sub(new web3.utils.BN(balanceBefore))).to.eq.BN(9);
    });

    it("should allow a single-transaction to occur in a child domain", async () => {
      const d1 = await colony.getDomain(1);
      const d2 = await colony.getDomain(2);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 0, d1.fundingPotId, d2.fundingPotId, WAD, token.address);
      await oneTxPayment.makePaymentFundedFromDomain(1, 0, 1, 0, [USER1], [token.address], [10], 2, GLOBAL_SKILL_ID);
    });

    it("should allow a single-transaction to occur in a child domain, paid out from the root domain", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await oneTxPayment.makePayment(1, 0, 1, 0, [USER1], [token.address], [10], 2, GLOBAL_SKILL_ID);
    });

    it("should allow a single-transaction to occur in a child domain that's not the first child, paid out from the root domain", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await oneTxPayment.makePayment(1, 1, 1, 1, [USER1], [token.address], [10], 3, GLOBAL_SKILL_ID);
    });

    it("should allow a single-transaction to occur in the root domain, paid out from the root domain", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await oneTxPayment.makePayment(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [token.address], [10], 1, GLOBAL_SKILL_ID);
    });

    it(`should not allow a single-transaction to occur in a child domain, paid out from the root domain
      if the user does not have permission to take funds from root domain`, async () => {
      // Set funding, administration in child
      await colony.setAdministrationRole(1, 0, USER1, 2, true);
      await colony.setFundingRole(1, 0, USER1, 2, true);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await checkErrorRevert(
        oneTxPayment.makePayment(2, UINT256_MAX, 2, UINT256_MAX, [USER1], [token.address], [10], 2, GLOBAL_SKILL_ID, { from: USER1 }),
        "one-tx-payment-not-authorized"
      );
    });

    it(`should allow a single-transaction to occur in a child  domain, paid out from the root domain
      when user has funding in the root domain and administration in a child domain`, async () => {
      // Set funding in root, administration in child
      await colony.setFundingRole(1, UINT256_MAX, USER1, 1, true);
      await colony.setAdministrationRole(1, 0, USER1, 2, true);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await oneTxPayment.makePayment(1, 0, 2, UINT256_MAX, [USER1], [token.address], [10], 2, GLOBAL_SKILL_ID, { from: USER1 });
    });

    it("should allow a single-transaction to occur when user has different permissions than contract", async () => {
      const d1 = await colony.getDomain(1);
      const d2 = await colony.getDomain(2);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 0, d1.fundingPotId, d2.fundingPotId, WAD, token.address);

      await colony.setAdministrationRole(1, 0, USER1, 2, true);
      await colony.setFundingRole(1, 0, USER1, 2, true);
      await oneTxPayment.makePaymentFundedFromDomain(1, 0, 2, UINT256_MAX, [USER1], [token.address], [10], 2, GLOBAL_SKILL_ID, { from: USER1 });
    });

    it("should not allow a non-admin to make a single-transaction payment", async () => {
      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [token.address], [10], 1, GLOBAL_SKILL_ID, {
          from: USER1,
        }),
        "one-tx-payment-not-authorized"
      );
    });

    it("should not allow a non-funder to make a single-transaction payment", async () => {
      await colony.setAdministrationRole(1, UINT256_MAX, USER1, 1, true);
      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [token.address], [10], 1, GLOBAL_SKILL_ID, {
          from: USER1,
        }),
        "one-tx-payment-not-authorized"
      );
    });

    it("should not allow an admin to specify a non-global skill", async () => {
      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [token.address], [10], 1, 2),
        "colony-not-global-skill"
      );
    });

    it("should not allow an admin to specify a deprecated global skill", async () => {
      await metaColony.addGlobalSkill();
      const skillId = await colonyNetwork.getSkillCount();
      await metaColony.deprecateGlobalSkill(skillId);

      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [token.address], [10], 1, skillId),
        "colony-deprecated-global-skill"
      );
    });

    it("should not allow an admin to specify a non-existent domain", async () => {
      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [token.address], [10], 99, GLOBAL_SKILL_ID),
        "colony-network-out-of-range-child-skill-index"
      );
    });

    it("should not allow an admin to specify a non-existent skill", async () => {
      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [token.address], [10], 1, 99),
        "colony-skill-does-not-exist"
      );
    });

    it("should error if user permissions are bad", async () => {
      // Try to make a payment with the permissions in domain 1, child skill at index 1, i.e. skill 6
      // When actually domain 2 in which we are creating the task is skill 5
      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, 1, 1, 1, [USER1], [token.address], [10], 2, GLOBAL_SKILL_ID),
        "one-tx-payment-not-authorized"
      );
    });

    it("should allow a single-transaction payment to multiple workers", async () => {
      const balanceBefore1 = await token.balanceOf(USER1);
      const balanceBefore2 = await token.balanceOf(USER2);

      await oneTxPayment.makePaymentFundedFromDomain(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        [USER1, USER2],
        [token.address, token.address],
        [10, 5],
        1,
        GLOBAL_SKILL_ID
      );

      const balanceAfter1 = await token.balanceOf(USER1);
      const balanceAfter2 = await token.balanceOf(USER2);
      expect(balanceAfter1.sub(balanceBefore1)).to.eq.BN(9);
      expect(balanceAfter2.sub(balanceBefore2)).to.eq.BN(4);
    });

    it("should allow a single-transaction payment to multiple workers of ETH to occur", async () => {
      const balanceBefore1 = await web3.eth.getBalance(USER1);
      const balanceBefore2 = await web3.eth.getBalance(USER2);

      await colony.send(15); // NB 15 wei, not ten ether!
      await colony.claimColonyFunds(ADDRESS_ZERO);

      await oneTxPayment.makePaymentFundedFromDomain(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        [USER1, USER2],
        [ADDRESS_ZERO, ADDRESS_ZERO],
        [10, 5],
        1,
        GLOBAL_SKILL_ID
      );

      const balanceAfter1 = await web3.eth.getBalance(USER1);
      const balanceAfter2 = await web3.eth.getBalance(USER2);
      // So only 9 and 4 here, because of the same rounding errors as applied to the token
      expect(new web3.utils.BN(balanceAfter1).sub(new web3.utils.BN(balanceBefore1))).to.eq.BN(9);
      expect(new web3.utils.BN(balanceAfter2).sub(new web3.utils.BN(balanceBefore2))).to.eq.BN(4);
    });

    it("should allow a single-transaction payment to multiple workers of different tokens", async () => {
      const balanceTokenBefore1 = await token.balanceOf(USER1);
      const balanceEthBefore2 = await web3.eth.getBalance(USER2);

      await colony.send(5); // NB 10 wei, not ten ether!
      await colony.claimColonyFunds(ADDRESS_ZERO);

      await oneTxPayment.makePaymentFundedFromDomain(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        [USER1, USER2],
        [token.address, ADDRESS_ZERO],
        [10, 5],
        1,
        GLOBAL_SKILL_ID
      );

      const balanceTokenAfter1 = await token.balanceOf(USER1);
      const balanceEthAfter2 = await web3.eth.getBalance(USER2);
      // So only 9 and 4 here, because of the same rounding errors as applied to the token
      expect(balanceTokenAfter1.sub(balanceTokenBefore1)).to.eq.BN(9);
      expect(new web3.utils.BN(balanceEthAfter2).sub(new web3.utils.BN(balanceEthBefore2))).to.eq.BN(4);
    });

    it("should allow a single-transaction payment to multiple workers in multiple tokens", async () => {
      const balanceTokenBefore1 = await token.balanceOf(USER1);
      const balanceTokenBefore2 = await token.balanceOf(USER2);
      const balanceEthBefore1 = await web3.eth.getBalance(USER1);
      const balanceEthBefore2 = await web3.eth.getBalance(USER2);

      await colony.send(10); // NB 10 wei, not ten ether!
      await colony.claimColonyFunds(ADDRESS_ZERO);

      await oneTxPayment.makePaymentFundedFromDomain(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        [USER1, USER1, USER2, USER2],
        [ADDRESS_ZERO, token.address, ADDRESS_ZERO, token.address],
        [5, 10, 5, 5],
        1,
        GLOBAL_SKILL_ID
      );

      const balanceTokenAfter1 = await token.balanceOf(USER1);
      const balanceTokenAfter2 = await token.balanceOf(USER2);
      const balanceEthAfter1 = await web3.eth.getBalance(USER1);
      const balanceEthAfter2 = await web3.eth.getBalance(USER2);

      // So only 9 and 4 here, because of the same rounding errors as applied to the token
      expect(balanceTokenAfter1.sub(balanceTokenBefore1)).to.eq.BN(9);
      expect(balanceTokenAfter2.sub(balanceTokenBefore2)).to.eq.BN(4);
      expect(new web3.utils.BN(balanceEthAfter1).sub(new web3.utils.BN(balanceEthBefore1))).to.eq.BN(4);
      expect(new web3.utils.BN(balanceEthAfter2).sub(new web3.utils.BN(balanceEthBefore2))).to.eq.BN(4);
    });

    it("should allow a single-transaction to occur in a child domain, paid out from the root domain to multiple workers", async () => {
      const balanceTokenBefore1 = await token.balanceOf(USER1);
      const balanceTokenBefore2 = await token.balanceOf(USER2);
      const balanceEthBefore1 = await web3.eth.getBalance(USER1);
      const balanceEthBefore2 = await web3.eth.getBalance(USER2);

      await colony.send(10); // NB 10 wei, not ten ether!
      await colony.claimColonyFunds(ADDRESS_ZERO);
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

      await oneTxPayment.makePayment(
        1,
        0,
        1,
        0,
        [USER1, USER1, USER2, USER2],
        [ADDRESS_ZERO, token.address, ADDRESS_ZERO, token.address],
        [5, 10, 5, 5],
        2,
        GLOBAL_SKILL_ID
      );

      const balanceTokenAfter1 = await token.balanceOf(USER1);
      const balanceTokenAfter2 = await token.balanceOf(USER2);
      const balanceEthAfter1 = await web3.eth.getBalance(USER1);
      const balanceEthAfter2 = await web3.eth.getBalance(USER2);

      // So only 9 and 4 here, because of the same rounding errors as applied to the token
      expect(balanceTokenAfter1.sub(balanceTokenBefore1)).to.eq.BN(9);
      expect(balanceTokenAfter2.sub(balanceTokenBefore2)).to.eq.BN(4);
      expect(new web3.utils.BN(balanceEthAfter1).sub(new web3.utils.BN(balanceEthBefore1))).to.eq.BN(4);
      expect(new web3.utils.BN(balanceEthAfter2).sub(new web3.utils.BN(balanceEthBefore2))).to.eq.BN(4);
    });

    it("should not allow arrays of different sizes", async () => {
      await checkErrorRevert(
        oneTxPayment.makePayment(1, 0, 1, 0, [USER2], [token.address, token.address], [10, 5], 2, 0),
        "one-tx-payment-invalid-input"
      );

      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, 0, 1, 0, [USER2], [token.address, token.address], [10, 5], 2, 0),
        "one-tx-payment-invalid-input"
      );
    });

    it("should not allow a single-transaction payment from root to multiple workers if out-of-order", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

      await checkErrorRevert(
        oneTxPayment.makePayment(1, UINT256_MAX, 1, UINT256_MAX, [USER2, USER1], [token.address, token.address], [5, 5], 1, 0),
        "one-tx-payment-bad-worker-order"
      );
    });

    it("should not allow a single-transaction payment from root in multiple tokens if out-of-order", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

      await colony.send(100);
      await colony.claimColonyFunds(ADDRESS_ZERO);

      await checkErrorRevert(
        oneTxPayment.makePayment(1, UINT256_MAX, 1, UINT256_MAX, [USER1, USER1], [token.address, ADDRESS_ZERO], [5, 5], 1, 0),
        "one-tx-payment-bad-token-order"
      );
    });

    it("should not allow a single-transaction payment to multiple workers if out-of-order", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER2, USER1], [token.address, token.address], [5, 5], 1, 0),
        "one-tx-payment-bad-worker-order"
      );
    });

    it("should not allow a single-transaction payment in multiple tokens if out-of-order", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

      await colony.send(100);
      await colony.claimColonyFunds(ADDRESS_ZERO);

      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1, USER1], [token.address, ADDRESS_ZERO], [5, 5], 1, 0),
        "one-tx-payment-bad-token-order"
      );
    });
  });

  describe("using the extension when only installed in a subdomain", async () => {
    beforeEach(async () => {
      await colony.setUserRoles(1, UINT256_MAX, oneTxPayment.address, 1, rolesToBytes32([]));
      await colony.setUserRoles(1, 0, oneTxPayment.address, 2, ROLES);
    });

    it("should not allow a payment to occur in root if it only has subdomain permissions", async () => {
      const balanceBefore = await token.balanceOf(USER1);
      expect(balanceBefore).to.be.zero;

      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [token.address], [10], 1, GLOBAL_SKILL_ID),
        "ds-auth-unauthorized"
      );
    });

    it("should allow a payment to occur in subdomain if it only has subdomain permissions", async () => {
      const balanceBefore = await token.balanceOf(USER1);
      expect(balanceBefore).to.be.zero;

      const d1 = await colony.getDomain(1);
      const d2 = await colony.getDomain(2);

      await colony.moveFundsBetweenPots(1, UINT256_MAX, 0, d1.fundingPotId, d2.fundingPotId, WAD, token.address);

      await oneTxPayment.makePaymentFundedFromDomain(2, UINT256_MAX, 1, 0, [USER1], [token.address], [10], 2, GLOBAL_SKILL_ID);

      const balanceAfter = await token.balanceOf(USER1);
      expect(balanceAfter).to.eq.BN(9);
    });

    it("cannot payout with funds from root if the extension only has subdomain permissions", async () => {
      const balanceBefore = await token.balanceOf(USER1);
      expect(balanceBefore).to.be.zero;
      await checkErrorRevert(oneTxPayment.makePayment(2, 0, 1, 0, [USER1], [token.address], [10], 2, GLOBAL_SKILL_ID), "ds-auth-unauthorized");
    });
  });
});
