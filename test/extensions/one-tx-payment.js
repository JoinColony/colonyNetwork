/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";

import { UINT256_MAX, WAD, INITIAL_FUNDING, GLOBAL_SKILL_ID, FUNDING_ROLE, ADMINISTRATION_ROLE } from "../../helpers/constants";
import { checkErrorRevert, web3GetCode, rolesToBytes32 } from "../../helpers/test-helper";
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

  const USER0 = accounts[0];
  const USER1 = accounts[1];

  const RECIPIENT = accounts[3];
  const RECIPIENT2 = accounts[4];
  const COLONY_ADMIN = accounts[5];

  const ROLES = rolesToBytes32([FUNDING_ROLE, ADMINISTRATION_ROLE]);

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

    // Give a user and extension funding and administration rights
    await colony.setUserRoles(1, UINT256_MAX, oneTxPayment.address, 1, ROLES);
    await colony.setUserRoles(1, UINT256_MAX, COLONY_ADMIN, 1, ROLES);
  });

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      oneTxPayment = await OneTxPayment.new();
      await oneTxPayment.install(colony.address);

      await checkErrorRevert(oneTxPayment.install(colony.address), "extension-already-installed");

      await oneTxPayment.finishUpgrade();
      await oneTxPayment.deprecate(true);
      await oneTxPayment.uninstall();

      const code = await web3GetCode(oneTxPayment.address);
      expect(code).to.equal("0x");
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(ONE_TX_PAYMENT, 1, { from: USER0 });

      await checkErrorRevert(colony.installExtension(ONE_TX_PAYMENT, 1, { from: USER0 }), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(ONE_TX_PAYMENT, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(ONE_TX_PAYMENT, { from: USER0 });
    });
  });

  describe("using the extension", async () => {
    it("should allow a single-transaction payment of tokens to occur", async () => {
      const balanceBefore = await token.balanceOf(RECIPIENT);
      expect(balanceBefore).to.be.zero;

      await oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [RECIPIENT], [token.address], [10], 1, GLOBAL_SKILL_ID, {
        from: COLONY_ADMIN,
      });

      const balanceAfter = await token.balanceOf(RECIPIENT);
      expect(balanceAfter).to.eq.BN(9);
    });

    it("should allow a single-transaction payment of ETH to occur", async () => {
      const balanceBefore = await web3.eth.getBalance(RECIPIENT);
      await colony.send(10); // NB 10 wei, not ten ether!
      await colony.claimColonyFunds(ethers.constants.AddressZero);

      await oneTxPayment.makePaymentFundedFromDomain(
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

      const balanceAfter = await web3.eth.getBalance(RECIPIENT);
      // So only 9 here, because of the same rounding errors as applied to the token
      expect(new web3.utils.BN(balanceAfter).sub(new web3.utils.BN(balanceBefore))).to.eq.BN(9);
    });

    it("should allow a single-transaction to occur in a child domain", async () => {
      const d1 = await colony.getDomain(1);
      const d2 = await colony.getDomain(2);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 0, d1.fundingPotId, d2.fundingPotId, WAD, token.address);
      await oneTxPayment.makePaymentFundedFromDomain(1, 0, 1, 0, [RECIPIENT], [token.address], [10], 2, GLOBAL_SKILL_ID, { from: COLONY_ADMIN });
    });

    it("should allow a single-transaction to occur in a child domain, paid out from the root domain", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await oneTxPayment.makePayment(1, 0, 1, 0, [RECIPIENT], [token.address], [10], 2, GLOBAL_SKILL_ID, { from: COLONY_ADMIN });
    });

    it("should allow a single-transaction to occur in a child domain that's not the first child, paid out from the root domain", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await oneTxPayment.makePayment(1, 1, 1, 1, [RECIPIENT], [token.address], [10], 3, GLOBAL_SKILL_ID, { from: COLONY_ADMIN });
    });

    it("should allow a single-transaction to occur in the root domain, paid out from the root domain", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await oneTxPayment.makePayment(1, UINT256_MAX, 1, UINT256_MAX, [RECIPIENT], [token.address], [10], 1, GLOBAL_SKILL_ID, {
        from: COLONY_ADMIN,
      });
    });

    it(`should not allow a single-transaction to occur in a child domain, paid out from the root domain
      if the user does not have permission to take funds from root domain`, async () => {
      // Set funding, administration in child
      await colony.setAdministrationRole(1, 0, USER1, 2, true);
      await colony.setFundingRole(1, 0, USER1, 2, true);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await checkErrorRevert(
        oneTxPayment.makePayment(2, UINT256_MAX, 2, UINT256_MAX, [RECIPIENT], [token.address], [10], 2, GLOBAL_SKILL_ID, { from: USER1 }),
        "colony-one-tx-payment-not-authorized"
      );
    });

    it(`should allow a single-transaction to occur in a child  domain, paid out from the root domain
      when user has funding in the root domain and administration in a child domain`, async () => {
      // Set funding in root, administration in child
      await colony.setFundingRole(1, UINT256_MAX, USER1, 1, true);
      await colony.setAdministrationRole(1, 0, USER1, 2, true);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await oneTxPayment.makePayment(1, 0, 2, UINT256_MAX, [RECIPIENT], [token.address], [10], 2, GLOBAL_SKILL_ID, { from: USER1 });
    });

    it("should allow a single-transaction to occur when user has different permissions than contract", async () => {
      const d1 = await colony.getDomain(1);
      const d2 = await colony.getDomain(2);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 0, d1.fundingPotId, d2.fundingPotId, WAD, token.address);

      await colony.setAdministrationRole(1, 0, USER1, 2, true);
      await colony.setFundingRole(1, 0, USER1, 2, true);
      await oneTxPayment.makePaymentFundedFromDomain(1, 0, 2, UINT256_MAX, [RECIPIENT], [token.address], [10], 2, GLOBAL_SKILL_ID, { from: USER1 });
    });

    it("should not allow a non-admin to make a single-transaction payment", async () => {
      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [RECIPIENT], [token.address], [10], 1, GLOBAL_SKILL_ID, {
          from: USER1,
        }),
        "colony-one-tx-payment-not-authorized"
      );
    });

    it("should not allow a non-funder to make a single-transaction payment", async () => {
      await colony.setAdministrationRole(1, UINT256_MAX, USER1, 1, true);
      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [RECIPIENT], [token.address], [10], 1, GLOBAL_SKILL_ID, {
          from: USER1,
        }),
        "colony-one-tx-payment-not-authorized"
      );
    });

    it("should not allow an admin to specify a non-global skill", async () => {
      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [RECIPIENT], [token.address], [10], 1, 2, { from: COLONY_ADMIN }),
        "colony-not-global-skill"
      );
    });

    it("should not allow an admin to specify a deprecated global skill", async () => {
      await metaColony.addGlobalSkill();
      const skillId = await colonyNetwork.getSkillCount();
      await metaColony.deprecateGlobalSkill(skillId);

      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [RECIPIENT], [token.address], [10], 1, skillId, {
          from: COLONY_ADMIN,
        }),
        "colony-deprecated-global-skill"
      );
    });

    it("should not allow an admin to specify a non-existent domain", async () => {
      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [RECIPIENT], [token.address], [10], 99, GLOBAL_SKILL_ID, {
          from: COLONY_ADMIN,
        }),
        "colony-network-out-of-range-child-skill-index"
      );
    });

    it("should not allow an admin to specify a non-existent skill", async () => {
      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [RECIPIENT], [token.address], [10], 1, 99, { from: COLONY_ADMIN }),
        "colony-skill-does-not-exist"
      );
    });

    it("should error if user permissions are bad", async () => {
      // Try to make a payment with the permissions in domain 1, child skill at index 1, i.e. skill 6
      // When actually domain 2 in which we are creating the task is skill 5
      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, 1, 1, 1, [RECIPIENT], [token.address], [10], 2, GLOBAL_SKILL_ID, { from: COLONY_ADMIN }),
        "colony-one-tx-payment-not-authorized"
      );
    });

    it("should allow a single-transaction payment to multiple workers", async () => {
      const balanceBefore = await token.balanceOf(RECIPIENT);
      const balanceBefore2 = await token.balanceOf(RECIPIENT2);
      expect(balanceBefore).to.be.zero;
      expect(balanceBefore2).to.be.zero;

      await oneTxPayment.makePaymentFundedFromDomain(
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

      await oneTxPayment.makePaymentFundedFromDomain(
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

      const balanceAfter = await web3.eth.getBalance(RECIPIENT);
      const balanceAfter2 = await web3.eth.getBalance(RECIPIENT2);
      // So only 9 and 4 here, because of the same rounding errors as applied to the token
      expect(new web3.utils.BN(balanceAfter).sub(new web3.utils.BN(balanceBefore))).to.eq.BN(9);
      expect(new web3.utils.BN(balanceAfter2).sub(new web3.utils.BN(balanceBefore2))).to.eq.BN(4);
    });

    it("should allow a single-transaction payment to multiple workers of different tokens", async () => {
      const balanceTokenBefore = await token.balanceOf(RECIPIENT);
      const balanceEthBefore2 = await web3.eth.getBalance(RECIPIENT2);
      expect(balanceTokenBefore).to.be.zero;
      await colony.send(5); // NB 10 wei, not ten ether!
      await colony.claimColonyFunds(ethers.constants.AddressZero);

      await oneTxPayment.makePaymentFundedFromDomain(
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

      const balanceTokenAfter = await token.balanceOf(RECIPIENT);
      const balanceEthAfter2 = await web3.eth.getBalance(RECIPIENT2);
      // So only 9 and 4 here, because of the same rounding errors as applied to the token
      expect(balanceTokenAfter).to.eq.BN(9);
      expect(new web3.utils.BN(balanceEthAfter2).sub(new web3.utils.BN(balanceEthBefore2))).to.eq.BN(4);
    });

    it("should allow a single-transaction payment to multiple workers using different slots", async () => {
      const balanceTokenBefore = await token.balanceOf(RECIPIENT);
      const balanceEthBefore2 = await web3.eth.getBalance(RECIPIENT2);
      expect(balanceTokenBefore).to.be.zero;

      await colony.send(10); // NB 10 wei, not ten ether!
      await colony.claimColonyFunds(ethers.constants.AddressZero);

      await oneTxPayment.makePaymentFundedFromDomain(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        [RECIPIENT2, RECIPIENT2, RECIPIENT, RECIPIENT2],
        [ethers.constants.AddressZero, token.address, token.address, ethers.constants.AddressZero],
        [5, 5, 10, 5],
        1,
        GLOBAL_SKILL_ID,
        { from: COLONY_ADMIN }
      );

      const balanceTokenAfter = await token.balanceOf(RECIPIENT);
      const balanceEthAfter2 = await web3.eth.getBalance(RECIPIENT2);
      // So only 9 and 8 here, because of the same rounding errors as applied to the token
      expect(balanceTokenAfter).to.eq.BN(9);
      expect(new web3.utils.BN(balanceEthAfter2).sub(new web3.utils.BN(balanceEthBefore2))).to.eq.BN(8);
    });

    it("should allow a single-transaction to occur in a child domain, paid out from the root domain to multiple workers", async () => {
      const balanceTokenBefore = await token.balanceOf(RECIPIENT);
      const balanceEthBefore2 = await web3.eth.getBalance(RECIPIENT2);
      expect(balanceTokenBefore).to.be.zero;

      await colony.send(10); // NB 10 wei, not ten ether!
      await colony.claimColonyFunds(ethers.constants.AddressZero);
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

      await oneTxPayment.makePayment(
        1,
        0,
        1,
        0,
        [RECIPIENT2, RECIPIENT2, RECIPIENT, RECIPIENT2],
        [ethers.constants.AddressZero, token.address, token.address, ethers.constants.AddressZero],
        [5, 5, 10, 5],
        2,
        GLOBAL_SKILL_ID,
        { from: COLONY_ADMIN }
      );

      const balanceTokenAfter = await token.balanceOf(RECIPIENT);
      const balanceEthAfter2 = await web3.eth.getBalance(RECIPIENT2);
      // So only 9 and 8 here, because of the same rounding errors as applied to the token
      expect(balanceTokenAfter).to.eq.BN(9);
      expect(new web3.utils.BN(balanceEthAfter2).sub(new web3.utils.BN(balanceEthBefore2))).to.eq.BN(8);
    });

    it("should not allow arrays of different sizes", async () => {
      await checkErrorRevert(
        oneTxPayment.makePayment(1, 0, 1, 0, [RECIPIENT2], [token.address, token.address], [10, 5], 2, GLOBAL_SKILL_ID, {
          from: COLONY_ADMIN,
        }),
        "colony-one-tx-payment-invalid-input"
      );

      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, 0, 1, 0, [RECIPIENT2], [token.address, token.address], [10, 5], 2, GLOBAL_SKILL_ID, {
          from: COLONY_ADMIN,
        }),
        "colony-one-tx-payment-invalid-input"
      );
    });
  });
});
