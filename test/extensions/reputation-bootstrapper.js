/* globals artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");
const { soliditySha3 } = require("web3-utils");

const { WAD, INT128_MAX, ADDRESS_ZERO, SECONDS_PER_DAY, SECONDS_PER_HOUR } = require("../../helpers/constants");
const { checkErrorRevert, web3GetCode, getBlockTime, forwardTime } = require("../../helpers/test-helper");
const { setupRandomColony, getMetaTransactionParameters } = require("../../helpers/test-data-generator");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const EtherRouter = artifacts.require("EtherRouter");
const ReputationBootstrapper = artifacts.require("ReputationBootstrapper");

const REPUTATION_BOOTSTRAPPER = soliditySha3("ReputationBootstrapper");

contract("Reputation Bootstrapper", (accounts) => {
  let colonyNetwork;
  let colony;
  let token;
  let reputationBootstrapper;
  let version;
  let domain1;

  const USER0 = accounts[0];
  const USER1 = accounts[1];

  const PIN1 = 1;
  const PIN2 = 2;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const extension = await ReputationBootstrapper.new();
    version = await extension.version();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));

    domain1 = await colony.getDomain(1);

    await colony.installExtension(REPUTATION_BOOTSTRAPPER, version);

    const reputationBoostrapperAddress = await colonyNetwork.getExtensionInstallation(REPUTATION_BOOTSTRAPPER, colony.address);
    reputationBootstrapper = await ReputationBootstrapper.at(reputationBoostrapperAddress);

    await colony.setRootRole(reputationBootstrapper.address, true);
    await colony.setRootRole(USER0, true);
  });

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      reputationBootstrapper = await ReputationBootstrapper.new();
      await reputationBootstrapper.install(colony.address);

      await checkErrorRevert(reputationBootstrapper.install(colony.address), "extension-already-installed");

      const identifier = await reputationBootstrapper.identifier();
      expect(identifier).to.equal(REPUTATION_BOOTSTRAPPER);

      const capabilityRoles = await reputationBootstrapper.getCapabilityRoles("0x0");
      expect(capabilityRoles).to.equal(ethers.constants.HashZero);

      await reputationBootstrapper.finishUpgrade();
      await reputationBootstrapper.deprecate(true);
      await reputationBootstrapper.uninstall();

      const code = await web3GetCode(reputationBootstrapper.address);
      expect(code).to.equal("0x");
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(REPUTATION_BOOTSTRAPPER, version, { from: USER0 });

      await checkErrorRevert(
        colony.installExtension(REPUTATION_BOOTSTRAPPER, version, { from: USER0 }),
        "colony-network-extension-already-installed"
      );
      await checkErrorRevert(colony.uninstallExtension(REPUTATION_BOOTSTRAPPER, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(REPUTATION_BOOTSTRAPPER, { from: USER0 });
    });

    it("can't use the network-level functions if installed via ColonyNetwork", async () => {
      await checkErrorRevert(reputationBootstrapper.install(ADDRESS_ZERO, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(reputationBootstrapper.finishUpgrade({ from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(reputationBootstrapper.deprecate(true, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(reputationBootstrapper.uninstall({ from: USER1 }), "ds-auth-unauthorized");
    });
  });

  describe("using the extension", async () => {
    it("can get the token", async () => {
      const tokenAddress = await reputationBootstrapper.getToken();
      expect(tokenAddress).to.equal(token.address);
    });

    it("can get the decay parameters", async () => {
      const decayPeriod = await reputationBootstrapper.getDecayPeriod();
      const decayNumerator = await reputationBootstrapper.getDecayNumerator();
      const decayDenominator = await reputationBootstrapper.getDecayDenominator();

      expect(decayPeriod).to.eq.BN(SECONDS_PER_HOUR);
      expect(decayNumerator).to.eq.BN("999679150010889");
      expect(decayDenominator).to.eq.BN("1000000000000000");
    });

    it("can setup reputation amounts", async () => {
      await reputationBootstrapper.setGrants([false, false], [soliditySha3(PIN1), soliditySha3(PIN2)], [WAD, WAD.muln(2)]);

      const grant = await reputationBootstrapper.getGrant(false, soliditySha3(PIN1));
      expect(grant.amount).to.eq.BN(WAD);
    });

    it("cannot setup reputation amounts if not root", async () => {
      await checkErrorRevert(reputationBootstrapper.setGrants([], [], [], { from: USER1 }), "reputation-bootstrapper-caller-not-root");
    });

    it("cannot setup reputation amounts with mismatched arguments", async () => {
      await checkErrorRevert(reputationBootstrapper.setGrants([true], [], []), "reputation-bootstrapper-invalid-arguments");
      await checkErrorRevert(reputationBootstrapper.setGrants([], [soliditySha3(PIN1)], []), "reputation-bootstrapper-invalid-arguments");
      await checkErrorRevert(reputationBootstrapper.setGrants([], [], [WAD]), "reputation-bootstrapper-invalid-arguments");
    });

    it("cannot setup reputation amounts with invalid values", async () => {
      await checkErrorRevert(
        reputationBootstrapper.setGrants([true], [soliditySha3(PIN1)], [INT128_MAX.addn(1)]),
        "reputation-bootstrapper-invalid-amount"
      );
    });

    it("can commit a secret", async () => {
      const hashedSecret = soliditySha3(USER1, PIN1);
      const addressHash = soliditySha3(USER1, hashedSecret);

      const tx = await reputationBootstrapper.commitSecret(hashedSecret, { from: USER1 });
      const blockTime = await getBlockTime(tx.receipt.blockNumber);
      const committedSecret = await reputationBootstrapper.getCommittedSecret(addressHash);
      expect(committedSecret).to.eq.BN(blockTime);
    });

    it("cannot claim reputation before committing the secret", async () => {
      await reputationBootstrapper.setGrants([false, false], [soliditySha3(PIN1), soliditySha3(PIN2)], [WAD, WAD.muln(2)]);

      // Can't claim without committing the secret
      await checkErrorRevert(reputationBootstrapper.claimGrant(false, PIN1, { from: USER1 }), "reputation-bootstrapper-commit-window-unelapsed");

      await reputationBootstrapper.commitSecret(soliditySha3(USER1, PIN1), { from: USER1 });

      // Can't claim until the delay has elapsed
      await checkErrorRevert(reputationBootstrapper.claimGrant(false, PIN1, { from: USER1 }), "reputation-bootstrapper-commit-window-unelapsed");

      await forwardTime(SECONDS_PER_HOUR, this);
      await reputationBootstrapper.claimGrant(false, PIN1, { from: USER1 });
    });

    it("cannot claim using someone else's secret", async () => {
      await reputationBootstrapper.setGrants([false, false], [soliditySha3(PIN1), soliditySha3(PIN2)], [WAD, WAD.muln(2)]);

      await reputationBootstrapper.commitSecret(soliditySha3(USER1, PIN1), { from: USER1 });

      await forwardTime(SECONDS_PER_HOUR, this);
      await checkErrorRevert(reputationBootstrapper.claimGrant(false, PIN1, { from: USER0 }), "reputation-bootstrapper-commit-window-unelapsed");
    });

    it("can claim reputation amounts", async () => {
      await reputationBootstrapper.setGrants([false, false], [soliditySha3(PIN1), soliditySha3(PIN2)], [WAD, WAD.muln(2)]);

      await reputationBootstrapper.commitSecret(soliditySha3(USER1, PIN1), { from: USER1 });
      await forwardTime(SECONDS_PER_HOUR, this);

      await reputationBootstrapper.claimGrant(false, PIN1, { from: USER1 });

      const inactiveCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
      const inactivecycle = await IReputationMiningCycle.at(inactiveCycleAddress);
      const numLogs = await inactivecycle.getReputationUpdateLogLength();
      const updateLog = await inactivecycle.getReputationUpdateLogEntry(numLogs.subn(1));

      expect(updateLog.user).to.equal(USER1);
      expect(updateLog.amount).to.eq.BN("999679150010889000");
      expect(updateLog.skillId).to.eq.BN(domain1.skillId);

      const balance = await token.balanceOf(USER1);
      expect(balance).to.be.zero;
    });

    it("can claim reputation amounts with a decay", async () => {
      await reputationBootstrapper.setGrants([false, false], [soliditySha3(PIN1), soliditySha3(PIN2)], [WAD, WAD.muln(2)]);

      await reputationBootstrapper.commitSecret(soliditySha3(USER1, PIN1), { from: USER1 });
      await forwardTime(SECONDS_PER_HOUR, this);

      // Reputation decays by half in 90 days
      await forwardTime(SECONDS_PER_DAY * 90, this);
      await reputationBootstrapper.claimGrant(false, PIN1, { from: USER1 });

      const inactiveCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
      const inactivecycle = await IReputationMiningCycle.at(inactiveCycleAddress);
      const numLogs = await inactivecycle.getReputationUpdateLogLength();
      const updateLog = await inactivecycle.getReputationUpdateLogEntry(numLogs.subn(1));
      expect(updateLog.amount).to.eq.BN("499839575005038055"); // Numerical approximation
    });

    it("can claim reputation amounts and tokens, if set", async () => {
      await token.mint(reputationBootstrapper.address, WAD.muln(10));

      await reputationBootstrapper.setGrants([true, true], [soliditySha3(PIN1), soliditySha3(PIN2)], [WAD, WAD.muln(2)]);

      let totalPayableGrants;
      totalPayableGrants = await reputationBootstrapper.getTotalPayableGrants();
      expect(totalPayableGrants).to.eq.BN(WAD.muln(3));

      await reputationBootstrapper.commitSecret(soliditySha3(USER1, PIN1), { from: USER1 });
      await forwardTime(SECONDS_PER_HOUR, this);

      await reputationBootstrapper.claimGrant(true, PIN1, { from: USER1 });

      totalPayableGrants = await reputationBootstrapper.getTotalPayableGrants();
      expect(totalPayableGrants).to.eq.BN(WAD.muln(2));

      const balance = await token.balanceOf(USER1);
      expect(balance).to.eq.BN(WAD);
    });

    it("can set and claim grants continually", async () => {
      await token.mint(reputationBootstrapper.address, WAD.muln(1));

      await reputationBootstrapper.setGrants([true], [soliditySha3(PIN1)], [WAD]);

      await reputationBootstrapper.commitSecret(soliditySha3(USER0, PIN1), { from: USER0 });
      await forwardTime(SECONDS_PER_HOUR, this);

      await reputationBootstrapper.claimGrant(true, PIN1, { from: USER0 });

      // Can't add new grants until funds are there
      await checkErrorRevert(
        reputationBootstrapper.setGrants([true], [soliditySha3(PIN2)], [WAD.muln(2)]),
        "reputation-bootstrapper-insufficient-balance"
      );

      await token.mint(reputationBootstrapper.address, WAD.muln(2));
      await reputationBootstrapper.setGrants([true], [soliditySha3(PIN2)], [WAD.muln(2)]);

      await reputationBootstrapper.commitSecret(soliditySha3(USER1, PIN2), { from: USER1 });
      await forwardTime(SECONDS_PER_HOUR, this);

      await reputationBootstrapper.claimGrant(true, PIN2, { from: USER1 });

      const balance1 = await token.balanceOf(USER0);
      expect(balance1).to.eq.BN(WAD);
      const balance2 = await token.balanceOf(USER1);
      expect(balance2).to.eq.BN(WAD.muln(2));

      const totalPayableGrants = await reputationBootstrapper.getTotalPayableGrants();
      expect(totalPayableGrants).to.be.zero;
    });

    it("cannot set a paid grant with insufficient funding", async () => {
      await checkErrorRevert(reputationBootstrapper.setGrants([true], [soliditySha3(PIN1)], [WAD]), "reputation-bootstrapper-insufficient-balance");

      await token.mint(reputationBootstrapper.address, WAD.muln(10));

      await reputationBootstrapper.setGrants([true], [soliditySha3(PIN1)], [WAD]);
    });

    it("can update the grant amounts", async () => {
      await token.mint(reputationBootstrapper.address, WAD.muln(2));

      await reputationBootstrapper.setGrants([true], [soliditySha3(PIN1)], [WAD.muln(2)]);

      // Cannot set to 3 WAD
      await checkErrorRevert(
        reputationBootstrapper.setGrants([true], [soliditySha3(PIN1)], [WAD.muln(3)]),
        "reputation-bootstrapper-insufficient-balance"
      );

      // Cannot add a second grant
      await checkErrorRevert(reputationBootstrapper.setGrants([true], [soliditySha3(PIN2)], [WAD]), "reputation-bootstrapper-insufficient-balance");

      // Reduce the first grant
      await reputationBootstrapper.setGrants([true], [soliditySha3(PIN1)], [WAD]);

      // Now the second goes through
      await reputationBootstrapper.setGrants([true], [soliditySha3(PIN2)], [WAD]);
    });

    it("cannot claim a nonexistent amount", async () => {
      await reputationBootstrapper.commitSecret(soliditySha3(USER1, PIN1), { from: USER1 });
      await forwardTime(SECONDS_PER_HOUR, this);

      await checkErrorRevert(reputationBootstrapper.claimGrant(true, PIN1, { from: USER1 }), "reputation-bootstrapper-nothing-to-claim");
    });

    it("cannot claim an unpaid grant as paid", async () => {
      await reputationBootstrapper.setGrants([false], [soliditySha3(PIN1)], [WAD]);

      await reputationBootstrapper.commitSecret(soliditySha3(USER1, PIN1), { from: USER1 });
      await forwardTime(SECONDS_PER_HOUR, this);

      await checkErrorRevert(reputationBootstrapper.claimGrant(true, PIN1, { from: USER1 }), "reputation-bootstrapper-nothing-to-claim");
    });

    it("cannot claim reputation amounts and tokens if the token amount only partially covers the balance", async () => {
      await token.mint(reputationBootstrapper.address, WAD.divn(2));

      await checkErrorRevert(reputationBootstrapper.setGrants([true], [soliditySha3(PIN1)], [WAD]), "reputation-bootstrapper-insufficient-balance");
    });

    it("cannot set or claim grants while deprecated", async () => {
      await colony.deprecateExtension(REPUTATION_BOOTSTRAPPER, true);

      await checkErrorRevert(reputationBootstrapper.setGrants([true], [soliditySha3(PIN1)], [WAD]), "colony-extension-deprecated");
      await checkErrorRevert(reputationBootstrapper.commitSecret(soliditySha3(USER1, PIN1)), "colony-extension-deprecated");
      await checkErrorRevert(reputationBootstrapper.claimGrant(true, PIN1), "colony-extension-deprecated");
    });

    it("can claim reputation via metatransactions", async () => {
      await reputationBootstrapper.setGrants([false], [soliditySha3(PIN1)], [WAD]);

      await reputationBootstrapper.commitSecret(soliditySha3(USER1, PIN1), { from: USER1 });
      await forwardTime(SECONDS_PER_HOUR, this);

      const txData = await reputationBootstrapper.contract.methods.claimGrant(false, PIN1).encodeABI();
      const { r, s, v } = await getMetaTransactionParameters(txData, USER1, reputationBootstrapper.address);

      await reputationBootstrapper.executeMetaTransaction(USER1, txData, r, s, v, { from: USER1 });

      const inactiveCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
      const inactivecycle = await IReputationMiningCycle.at(inactiveCycleAddress);
      const numLogs = await inactivecycle.getReputationUpdateLogLength();
      const updateLog = await inactivecycle.getReputationUpdateLogEntry(numLogs.subn(1));

      expect(updateLog.user).to.equal(USER1);
      expect(updateLog.amount).to.eq.BN("999679150010889000");
      expect(updateLog.skillId).to.eq.BN(domain1.skillId);
    });
  });
});
