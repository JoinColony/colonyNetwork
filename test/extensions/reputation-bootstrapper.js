/* globals artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");
const { soliditySha3 } = require("web3-utils");

const { WAD, INT128_MAX, ADDRESS_ZERO, SECONDS_PER_DAY } = require("../../helpers/constants");
const { checkErrorRevert, web3GetCode, forwardTime } = require("../../helpers/test-helper");
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

  describe("managing the extension", async () => {
    it("can setup repuation amounts", async () => {
      await reputationBootstrapper.setGrants([soliditySha3(PIN1), soliditySha3(PIN2)], [WAD, WAD.muln(2)]);

      const grant = await reputationBootstrapper.grants(soliditySha3(PIN1));
      expect(grant.amount).to.eq.BN(WAD);
    });

    it("cannot setup reputation amounts if not root", async () => {
      await checkErrorRevert(reputationBootstrapper.setGrants([], [], { from: USER1 }), "reputation-bootsrapper-caller-not-root");
    });

    it("cannot setup repuation amounts with mismatched arguments", async () => {
      await checkErrorRevert(reputationBootstrapper.setGrants([], [WAD]), "reputation-bootsrapper-invalid-arguments");
    });

    it("cannot setup repuation amounts with invalid values", async () => {
      await checkErrorRevert(reputationBootstrapper.setGrants([soliditySha3(PIN1)], [INT128_MAX.addn(1)]), "reputation-bootstrapper-invalid-amount");
    });

    it("can claim repuation amounts", async () => {
      await reputationBootstrapper.setGrants([soliditySha3(PIN1), soliditySha3(PIN2)], [WAD, WAD.muln(2)]);

      await reputationBootstrapper.claimGrant(PIN1, { from: USER1 });

      const inactiveCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
      const inactivecycle = await IReputationMiningCycle.at(inactiveCycleAddress);
      const numLogs = await inactivecycle.getReputationUpdateLogLength();
      const updateLog = await inactivecycle.getReputationUpdateLogEntry(numLogs.subn(1));

      expect(updateLog.user).to.equal(USER1);
      expect(updateLog.amount).to.eq.BN(WAD);
      expect(updateLog.skillId).to.eq.BN(domain1.skillId);

      const balance = await token.balanceOf(USER1);
      expect(balance).to.be.zero;
    });

    it("can claim reputation amounts with a decay", async () => {
      await reputationBootstrapper.setGrants([soliditySha3(PIN1), soliditySha3(PIN2)], [WAD, WAD.muln(2)]);

      // Reputation decays by half in 90 days
      await forwardTime(SECONDS_PER_DAY * 90, this);

      await reputationBootstrapper.claimGrant(PIN1, { from: USER1 });

      const inactiveCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
      const inactivecycle = await IReputationMiningCycle.at(inactiveCycleAddress);
      const numLogs = await inactivecycle.getReputationUpdateLogLength();
      const updateLog = await inactivecycle.getReputationUpdateLogEntry(numLogs.subn(1));
      expect(updateLog.amount).to.eq.BN(WAD.divn(2).subn(406575)); // Numerical approximation
    });

    it("can claim repuation amounts and tokens, if set", async () => {
      await token.mint(reputationBootstrapper.address, WAD.muln(10));
      await reputationBootstrapper.setGiveTokens(true);

      await reputationBootstrapper.setGrants([soliditySha3(PIN1), soliditySha3(PIN2)], [WAD, WAD.muln(2)]);

      await reputationBootstrapper.claimGrant(PIN1, { from: USER1 });

      const balance = await token.balanceOf(USER1);
      expect(balance).to.eq.BN(WAD);
    });

    it("cannot claim a nonexistent amount", async () => {
      await checkErrorRevert(reputationBootstrapper.claimGrant(PIN1, { from: USER1 }), "reputation-bootstrapper-nothing-to-claim");
    });

    it("cannot claim reputation amounts and tokens if the token amount only partially covers the balance", async () => {
      await token.mint(reputationBootstrapper.address, WAD.divn(2));
      await reputationBootstrapper.setGiveTokens(true);

      await reputationBootstrapper.setGrants([soliditySha3(PIN1)], [WAD]);

      await checkErrorRevert(reputationBootstrapper.claimGrant(PIN1, { from: USER1 }), "ds-token-insufficient-balance");
    });

    it("can claim reputation via metatransactions", async () => {
      await reputationBootstrapper.setGrants([soliditySha3(PIN1)], [WAD]);

      const txData = await reputationBootstrapper.contract.methods.claimGrant(PIN1).encodeABI();
      const { r, s, v } = await getMetaTransactionParameters(txData, USER0, reputationBootstrapper.address);

      await reputationBootstrapper.executeMetaTransaction(USER0, txData, r, s, v, { from: USER1 });

      const inactiveCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
      const inactivecycle = await IReputationMiningCycle.at(inactiveCycleAddress);
      const numLogs = await inactivecycle.getReputationUpdateLogLength();
      const updateLog = await inactivecycle.getReputationUpdateLogEntry(numLogs.subn(1));

      expect(updateLog.user).to.equal(USER0);
      expect(updateLog.amount).to.eq.BN(WAD);
      expect(updateLog.skillId).to.eq.BN(domain1.skillId);
    });
  });
});
