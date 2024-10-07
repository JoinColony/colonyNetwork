/* globals artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");
const { soliditySha3 } = require("web3-utils");

const {
  UINT256_MAX,
  WAD,
  INITIAL_FUNDING,
  ARBITRATION_ROLE,
  FUNDING_ROLE,
  ADMINISTRATION_ROLE,
  ADDRESS_ZERO,
  ADDRESS_FULL,
  SECONDS_PER_DAY,
} = require("../../helpers/constants");

const { checkErrorRevert, rolesToBytes32, expectEvent, upgradeColonyOnceThenToLatest } = require("../../helpers/test-helper");
const { setupRandomColony, fundColonyWithTokens, getMetaTransactionParameters, setupColony } = require("../../helpers/test-data-generator");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const IMetaColony = artifacts.require("IMetaColony");
const EtherRouter = artifacts.require("EtherRouter");
const OneTxPayment = artifacts.require("OneTxPayment");

const ONE_TX_PAYMENT = soliditySha3("OneTxPayment");
const {
  deployOldExtensionVersion,
  downgradeColony,
  downgradeColonyNetwork,
  deployColonyVersionGLWSS4,
  deployColonyNetworkVersionGLWSS4,
  deployColonyVersionHMWSS,
  deployColonyVersionIMWSS,
} = require("../../scripts/deployOldUpgradeableVersion");

contract("One transaction payments", (accounts) => {
  let colony;
  let token;
  let localSkillId;
  let colonyNetwork;
  let metaColony;
  let oneTxPayment;
  let version;

  const USER0 = accounts[0];
  const USER1 = accounts[1].toLowerCase() < accounts[2].toLowerCase() ? accounts[1] : accounts[2];
  const USER2 = accounts[1].toLowerCase() < accounts[2].toLowerCase() ? accounts[2] : accounts[1];

  const ROLES = rolesToBytes32([ARBITRATION_ROLE, FUNDING_ROLE, ADMINISTRATION_ROLE]);

  before(async () => {
    const cnAddress = (await EtherRouter.deployed()).address;

    const etherRouter = await EtherRouter.at(cnAddress);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);

    const extension = await OneTxPayment.new();
    version = await extension.version();
  });

  beforeEach(async () => {
    ({ colony, token, localSkillId } = await setupRandomColony(colonyNetwork));
    await colony.addDomain(1, UINT256_MAX, 1); // Domain 2, skillId 5
    await colony.addDomain(1, UINT256_MAX, 1); // Domain 3, skillId 6

    await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

    await colony.installExtension(ONE_TX_PAYMENT, version);
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
      expect(identifier).to.equal(ONE_TX_PAYMENT);

      const capabilityRoles = await oneTxPayment.getCapabilityRoles("0x0");
      expect(capabilityRoles).to.equal(ethers.constants.HashZero);

      await oneTxPayment.finishUpgrade();
      await oneTxPayment.deprecate(true);
      await oneTxPayment.uninstall();

      const colonyAddress = await oneTxPayment.getColony();
      expect(colonyAddress).to.equal(ADDRESS_FULL);
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(ONE_TX_PAYMENT, version, { from: USER0 });

      const extensionAddress = await colonyNetwork.getExtensionInstallation(ONE_TX_PAYMENT, colony.address);
      const etherRouter = await EtherRouter.at(extensionAddress);
      let resolverAddress = await etherRouter.resolver();
      expect(resolverAddress).to.not.equal(ethers.constants.AddressZero);

      await checkErrorRevert(colony.installExtension(ONE_TX_PAYMENT, version, { from: USER0 }), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(ONE_TX_PAYMENT, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(ONE_TX_PAYMENT, { from: USER0 });

      resolverAddress = await etherRouter.resolver();
      expect(resolverAddress).to.equal(ethers.constants.AddressZero);
    });

    it("can't use the network-level functions if installed via ColonyNetwork", async () => {
      await checkErrorRevert(oneTxPayment.install(ADDRESS_ZERO, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(oneTxPayment.finishUpgrade({ from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(oneTxPayment.deprecate(true, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(oneTxPayment.uninstall({ from: USER1 }), "ds-auth-unauthorized");
    });
  });

  describe("using the extension", async () => {
    it("should allow a single-transaction payment of tokens to occur", async () => {
      const balanceBefore = await token.balanceOf(USER1);
      expect(balanceBefore).to.be.zero;

      const tx = await oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [token.address], [10], 1, localSkillId);

      const balanceAfter = await token.balanceOf(USER1);
      expect(balanceAfter).to.eq.BN(9);

      await expectEvent(tx, "OneTxPaymentMade", [accounts[0], 1, 1]);
    });

    it("should allow a single-transaction payment of tokens to occur, regardless of global claim delay", async () => {
      await colony.setDefaultGlobalClaimDelay(SECONDS_PER_DAY);

      const balanceBefore = await token.balanceOf(USER1);
      expect(balanceBefore).to.be.zero;

      await oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [token.address], [10], 1, localSkillId);

      const balanceAfter = await token.balanceOf(USER1);
      expect(balanceAfter).to.eq.BN(9);

      await colony.setDefaultGlobalClaimDelay(0);
    });

    it("should allow a single-transaction payment of tokens to occur via metatransaction", async () => {
      const balanceBefore = await token.balanceOf(USER1);
      expect(balanceBefore).to.be.zero;

      const txData = await oneTxPayment.contract.methods
        .makePaymentFundedFromDomain(1, UINT256_MAX.toString(), 1, UINT256_MAX.toString(), [USER1], [token.address], [10], 1, localSkillId.toString())
        .encodeABI();
      const { r, s, v } = await getMetaTransactionParameters(txData, accounts[0], oneTxPayment.address);

      const tx = await oneTxPayment.executeMetaTransaction(accounts[0], txData, r, s, v, { from: USER2 });

      const balanceAfter = await token.balanceOf(USER1);
      expect(balanceAfter).to.eq.BN(9);

      await expectEvent(tx, "OneTxPaymentMade", [accounts[0], 1, 1]);
    });

    it("should allow a single-transaction payment of ETH to occur", async () => {
      const balanceBefore = await web3.eth.getBalance(USER1);
      await colony.send(10); // NB 10 wei, not ten ether!
      await colony.claimColonyFunds(ADDRESS_ZERO);

      await oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [ADDRESS_ZERO], [10], 1, localSkillId);

      const balanceAfter = await web3.eth.getBalance(USER1);
      // So only 9 here, because of the same rounding errors as applied to the token
      expect(new web3.utils.BN(balanceAfter).sub(new web3.utils.BN(balanceBefore))).to.eq.BN(9);
    });

    it("should allow a single-transaction to occur in a child domain", async () => {
      const d1 = await colony.getDomain(1);
      const d2 = await colony.getDomain(2);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 0, d1.fundingPotId, d2.fundingPotId, WAD, token.address);
      await oneTxPayment.makePaymentFundedFromDomain(1, 0, 1, 0, [USER1], [token.address], [10], 2, localSkillId);
    });

    it("should allow a single-transaction to occur in a child domain, paid out from the root domain", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await oneTxPayment.makePayment(1, 0, 1, 0, [USER1], [token.address], [10], 2, localSkillId);
    });

    it("should allow a single-transaction to occur in a child domain that's not the first child, paid out from the root domain", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await oneTxPayment.makePayment(1, 1, 1, 1, [USER1], [token.address], [10], 3, localSkillId);
    });

    it("should allow a single-transaction to occur in the root domain, paid out from the root domain", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await oneTxPayment.makePayment(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [token.address], [10], 1, localSkillId);
    });

    it(`should not allow a single-transaction to occur in a child domain, paid out from the root domain
      if the user does not have permission to take funds from root domain`, async () => {
      // Set funding, administration in child
      await colony.setAdministrationRole(1, 0, USER1, 2, true);
      await colony.setFundingRole(1, 0, USER1, 2, true);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await checkErrorRevert(
        oneTxPayment.makePayment(2, UINT256_MAX, 2, UINT256_MAX, [USER1], [token.address], [10], 2, localSkillId, { from: USER1 }),
        "one-tx-payment-not-authorized",
      );
    });

    it(`should allow a single-transaction to occur in a child  domain, paid out from the root domain
      when user has funding in the root domain and administration and arbitration in a child domain`, async () => {
      // Set funding in root, administration in child
      await colony.setFundingRole(1, UINT256_MAX, USER1, 1, true);
      await colony.setAdministrationRole(1, 0, USER1, 2, true);
      await colony.setArbitrationRole(1, 0, USER1, 2, true);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await oneTxPayment.makePayment(1, 0, 2, UINT256_MAX, [USER1], [token.address], [10], 2, localSkillId, { from: USER1 });
    });

    it("should allow a single-transaction to occur when user has different permissions than contract", async () => {
      const d1 = await colony.getDomain(1);
      const d2 = await colony.getDomain(2);

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 0, d1.fundingPotId, d2.fundingPotId, WAD, token.address);

      await colony.setAdministrationRole(1, 0, USER1, 2, true);
      await colony.setFundingRole(1, 0, USER1, 2, true);
      await colony.setArbitrationRole(1, 0, USER1, 2, true);
      await oneTxPayment.makePaymentFundedFromDomain(1, 0, 2, UINT256_MAX, [USER1], [token.address], [10], 2, localSkillId, { from: USER1 });
    });

    it("should not allow a non-admin to make a single-transaction payment", async () => {
      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [token.address], [10], 1, localSkillId, {
          from: USER1,
        }),
        "one-tx-payment-not-authorized",
      );
    });

    it("should not allow a non-funder to make a single-transaction payment", async () => {
      await colony.setAdministrationRole(1, UINT256_MAX, USER1, 1, true);
      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [token.address], [10], 1, localSkillId, {
          from: USER1,
        }),
        "one-tx-payment-not-authorized",
      );
    });

    it("should not allow an admin to specify a non-global skill", async () => {
      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [token.address], [10], 1, 2),
        "colony-not-valid-local-skill",
      );
    });

    it("should not allow an admin to specify a global skill (removed functionality), either deprecated or undeprecated", async () => {
      const { OldInterface } = await deployColonyVersionGLWSS4(colonyNetwork);
      await deployColonyVersionHMWSS(colonyNetwork);
      await downgradeColony(colonyNetwork, metaColony, "glwss4");

      // Make the colonyNetwork the old version
      await deployColonyNetworkVersionGLWSS4();

      const colonyNetworkAsEtherRouter = await EtherRouter.at(colonyNetwork.address);
      const latestResolver = await colonyNetworkAsEtherRouter.resolver();

      await downgradeColonyNetwork(colonyNetwork, "glwss4");

      // Add global skill
      const oldMetaColony = await OldInterface.at(metaColony.address);
      await oldMetaColony.addGlobalSkill();
      const globalSkillId = await colonyNetwork.getSkillCount();
      await oldMetaColony.addGlobalSkill();
      const globalSkillId2 = await colonyNetwork.getSkillCount();
      await oldMetaColony.deprecateGlobalSkill(globalSkillId);

      // Upgrade to current version
      await colonyNetworkAsEtherRouter.setResolver(latestResolver);
      await upgradeColonyOnceThenToLatest(metaColony);

      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [token.address], [10], 1, globalSkillId),
        "colony-not-valid-local-skill",
      );

      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [token.address], [10], 1, globalSkillId2),
        "colony-not-valid-local-skill",
      );
    });

    it("should not allow an admin to specify a non-existent domain", async () => {
      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, 98, 1, 98, [USER1], [token.address], [10], 99, localSkillId),
        "colony-network-out-of-range-child-skill-index",
      );
    });

    it("should not allow an admin to specify a non-existent skill", async () => {
      const skillCount = await colonyNetwork.getSkillCount();

      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [token.address], [10], 1, skillCount.addn(1)),
        "colony-not-valid-local-skill",
      );
    });

    it("should error if user permissions are bad", async () => {
      // Try to make a payment with the permissions in domain 1, child skill at index 1, i.e. skill 6
      // When actually domain 2 in which we are creating the task is skill 5
      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, 1, 1, 1, [USER1], [token.address], [10], 2, localSkillId),
        "one-tx-payment-not-authorized",
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
        localSkillId,
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
        localSkillId,
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
        localSkillId,
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
        localSkillId,
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
        localSkillId,
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
        "one-tx-payment-invalid-input",
      );

      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, 0, 1, 0, [USER2], [token.address, token.address], [10, 5], 2, 0),
        "one-tx-payment-invalid-input",
      );
    });

    it("should not allow a single-transaction payment from root to multiple workers if out-of-order", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

      await checkErrorRevert(
        oneTxPayment.makePayment(1, UINT256_MAX, 1, UINT256_MAX, [USER2, USER1], [token.address, token.address], [5, 5], 1, 0),
        "one-tx-payment-bad-worker-order",
      );
    });

    it("should not allow a single-transaction payment from root in multiple tokens if out-of-order", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

      await colony.send(100);
      await colony.claimColonyFunds(ADDRESS_ZERO);

      await checkErrorRevert(
        oneTxPayment.makePayment(1, UINT256_MAX, 1, UINT256_MAX, [USER1, USER1], [token.address, ADDRESS_ZERO], [5, 5], 1, 0),
        "one-tx-payment-bad-token-order",
      );
    });

    it("should not allow a single-transaction payment to multiple workers if out-of-order", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER2, USER1], [token.address, token.address], [5, 5], 1, 0),
        "one-tx-payment-bad-worker-order",
      );
    });

    it("should not allow a single-transaction payment in multiple tokens if out-of-order", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

      await colony.send(100);
      await colony.claimColonyFunds(ADDRESS_ZERO);

      await checkErrorRevert(
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1, USER1], [token.address, ADDRESS_ZERO], [5, 5], 1, 0),
        "one-tx-payment-bad-token-order",
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
        oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [token.address], [10], 1, localSkillId),
        "ds-auth-unauthorized",
      );
    });

    it("should allow a payment to occur in subdomain if it only has subdomain permissions", async () => {
      const balanceBefore = await token.balanceOf(USER1);
      expect(balanceBefore).to.be.zero;

      const d1 = await colony.getDomain(1);
      const d2 = await colony.getDomain(2);

      await colony.moveFundsBetweenPots(1, UINT256_MAX, 0, d1.fundingPotId, d2.fundingPotId, WAD, token.address);

      await oneTxPayment.makePaymentFundedFromDomain(2, UINT256_MAX, 1, 0, [USER1], [token.address], [10], 2, localSkillId);

      const balanceAfter = await token.balanceOf(USER1);
      expect(balanceAfter).to.eq.BN(9);
    });

    it("cannot payout with funds from root if the extension only has subdomain permissions", async () => {
      const balanceBefore = await token.balanceOf(USER1);
      expect(balanceBefore).to.be.zero;
      await checkErrorRevert(oneTxPayment.makePayment(2, 0, 1, 0, [USER1], [token.address], [10], 2, localSkillId), "ds-auth-unauthorized");
    });
  });

  describe("upgrading the extension from v5 and the colony from v13", async () => {
    before(async () => {
      // V5 is `glwss4`,
      await deployOldExtensionVersion("OneTxPayment", "OneTxPayment", ["OneTxPayment"], "glwss4", colonyNetwork);
      // V6 is `hmwss`,
      await deployOldExtensionVersion("OneTxPayment", "OneTxPayment", ["OneTxPayment"], "hmwss", colonyNetwork);
      await deployColonyNetworkVersionGLWSS4();
      await deployColonyVersionGLWSS4(colonyNetwork);
      await deployColonyVersionHMWSS(colonyNetwork);
      await deployColonyVersionIMWSS(colonyNetwork);
    });

    beforeEach(async () => {
      colony = await setupColony(colonyNetwork, token.address, 13);

      await colony.installExtension(ONE_TX_PAYMENT, 5);

      const oneTxPaymentAddress = await colonyNetwork.getExtensionInstallation(ONE_TX_PAYMENT, colony.address);
      oneTxPayment = await OneTxPayment.at(oneTxPaymentAddress);
      expect(await oneTxPayment.version()).to.eq.BN(5);

      // Award permissions mirroring the frontend.
      await colony.setAdministrationRole(1, UINT256_MAX, oneTxPayment.address, 1, true);
      await colony.setFundingRole(1, UINT256_MAX, oneTxPayment.address, 1, true);
    });

    it("should not be allowed to upgrade the extension without first upgrading the colony", async () => {
      await checkErrorRevert(colony.upgradeExtension(ONE_TX_PAYMENT, 6), "voting-rep-upgrade-colony-first");
    });

    it("when we upgrade the colony, the extension should be upgraded too and be given the new permission", async () => {
      expect(await colony.hasUserRole(oneTxPayment.address, 1, ARBITRATION_ROLE)).to.be.false;
      expect(await oneTxPayment.version()).to.eq.BN(5);
      await colony.upgrade(14);
      expect(await oneTxPayment.version()).to.eq.BN(6);
      expect(await colony.hasUserRole(oneTxPayment.address, 1, ARBITRATION_ROLE)).to.be.true;
    });

    it("if the extension doesn't have administration permission in the root domain, we do upgrade, but don't award permission", async () => {
      await colony.setAdministrationRole(1, UINT256_MAX, oneTxPayment.address, 1, false);
      expect(await colony.hasUserRole(oneTxPayment.address, 1, ARBITRATION_ROLE)).to.be.false;
      expect(await oneTxPayment.version()).to.eq.BN(5);
      await colony.upgrade(14);
      expect(await oneTxPayment.version()).to.eq.BN(6);
      expect(await colony.hasUserRole(oneTxPayment.address, 1, ARBITRATION_ROLE)).to.be.false;
    });

    it("a colony can still upgrade even if OneTxPayment not installed", async () => {
      await colony.uninstallExtension(ONE_TX_PAYMENT);
      expect(await colony.version()).to.eq.BN(13);
      await colony.upgrade(14);
      expect(await colony.version()).to.eq.BN(14);
    });

    it("a colony can still upgrade even if OneTxPayment is more up-to-date than we might expect", async () => {
      await colony.uninstallExtension(ONE_TX_PAYMENT);
      await colony.installExtension(ONE_TX_PAYMENT, 6);
      await colony.upgrade(14);
    });

    it.only("can call getDomain() without an error", async () => {
      await colony.uninstallExtension(ONE_TX_PAYMENT);
      await colony.installExtension(ONE_TX_PAYMENT, 6);
      const oneTxPaymentAddress = await colonyNetwork.getExtensionInstallation(ONE_TX_PAYMENT, colony.address);
      oneTxPayment = await OneTxPayment.at(oneTxPaymentAddress);

      await colony.setUserRoles(1, UINT256_MAX, oneTxPayment.address, 1, ROLES);
      await token.mint(colony.address, INITIAL_FUNDING);
      await colony.claimColonyFunds(token.address);

      await colony.upgrade(14);
      await colony.upgrade(15);
      await colony.upgrade(16);

      await oneTxPayment.makePaymentFundedFromDomain(1, UINT256_MAX, 1, UINT256_MAX, [USER1], [token.address], [10], 1, 0);
    });
  });
});
