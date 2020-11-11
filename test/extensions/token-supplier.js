/* globals artifacts */

import BN from "bn.js";
import chai from "chai";
import bnChai from "bn-chai";
import { soliditySha3 } from "web3-utils";

import { WAD, SECONDS_PER_DAY } from "../../helpers/constants";
import { checkErrorRevert, currentBlockTime, makeTxAtTimestamp, encodeTxData, forwardTime } from "../../helpers/test-helper";
import { setupColonyNetwork, setupRandomColony, setupMetaColonyWithLockedCLNYToken } from "../../helpers/test-data-generator";
import { setupEtherRouter } from "../../helpers/upgradable-contracts";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const TokenSupplier = artifacts.require("TokenSupplier");
const VotingReputation = artifacts.require("TestVotingReputation");
const VotingHybrid = artifacts.require("TestVotingHybrid");
const RequireExecuteCall = artifacts.require("RequireExecuteCall");
const Resolver = artifacts.require("Resolver");

const TOKEN_SUPPLIER = soliditySha3("TokenSupplier");
const VOTING_REPUTATION = soliditySha3("VotingReputation");
const VOTING_HYBRID = soliditySha3("VotingHybrid");

contract("Token Supplier", (accounts) => {
  let colony;
  let token;
  let colonyNetwork;

  let tokenSupplier;

  const USER0 = accounts[0];
  const USER1 = accounts[1];

  const SUPPLY_CEILING = WAD.muln(10);

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    const { metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork);

    let resolver;
    const tokenSupplierImplementation = await TokenSupplier.new();
    resolver = await Resolver.new();
    await setupEtherRouter("TokenSupplier", { TokenSupplier: tokenSupplierImplementation.address }, resolver);
    await metaColony.addExtensionToNetwork(TOKEN_SUPPLIER, resolver.address);

    const votingReputationImplementation = await VotingReputation.new();
    resolver = await Resolver.new();
    await setupEtherRouter("TestVotingReputation", { TestVotingReputation: votingReputationImplementation.address }, resolver);
    await metaColony.addExtensionToNetwork(VOTING_REPUTATION, resolver.address);

    const votingHybridImplementation = await VotingHybrid.new();
    resolver = await Resolver.new();
    await setupEtherRouter("TestVotingHybrid", { TestVotingHybrid: votingHybridImplementation.address }, resolver);
    await metaColony.addExtensionToNetwork(VOTING_HYBRID, resolver.address);
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.installExtension(TOKEN_SUPPLIER, 1);

    const tokenSupplierAddress = await colonyNetwork.getExtensionInstallation(TOKEN_SUPPLIER, colony.address);
    tokenSupplier = await TokenSupplier.at(tokenSupplierAddress);

    await colony.setRootRole(tokenSupplier.address, true);
  });

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      tokenSupplier = await TokenSupplier.new();
      await tokenSupplier.install(colony.address);

      await checkErrorRevert(tokenSupplier.install(colony.address), "extension-already-installed");

      await tokenSupplier.finishUpgrade();
      await tokenSupplier.deprecate(true);
      await tokenSupplier.uninstall();
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(TOKEN_SUPPLIER, 1, { from: USER0 });

      await checkErrorRevert(colony.installExtension(TOKEN_SUPPLIER, 1, { from: USER0 }), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(TOKEN_SUPPLIER, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(TOKEN_SUPPLIER, { from: USER0 });
    });

    it("can initialise", async () => {
      await tokenSupplier.initialise(SUPPLY_CEILING, WAD);
    });

    it("cannot initialise twice", async () => {
      await tokenSupplier.initialise(SUPPLY_CEILING, WAD);
      await checkErrorRevert(tokenSupplier.initialise(SUPPLY_CEILING, WAD), "token-supplier-already-initialised");
    });

    it("cannot initialise if not owner", async () => {
      await checkErrorRevert(tokenSupplier.initialise(SUPPLY_CEILING, WAD, { from: USER1 }), "token-supplier-not-root");
    });

    it("cannot issues tokens if not initialised", async () => {
      await checkErrorRevert(tokenSupplier.issueTokens(), "token-supplier-not-initialised");
    });

    it("can update the tokenSupplyCeiling via a hybrid vote", async () => {
      await colony.installExtension(VOTING_HYBRID, 1);
      const votingHybridAddress = await colonyNetwork.getExtensionInstallation(VOTING_HYBRID, colony.address);
      const votingHybrid = await VotingHybrid.at(votingHybridAddress);
      await colony.setRootRole(votingHybrid.address, true);

      const action = await encodeTxData(tokenSupplier, "setTokenSupplyCeiling", [SUPPLY_CEILING.muln(2)]);
      await votingHybrid.executeCall(tokenSupplier.address, action);

      const tokenSupplyCeiling = await tokenSupplier.tokenSupplyCeiling();
      expect(tokenSupplyCeiling).to.eq.BN(SUPPLY_CEILING.muln(2));

      // Cannot set through a normal contract call
      await checkErrorRevert(tokenSupplier.setTokenSupplyCeiling(SUPPLY_CEILING), "token-supplier-caller-must-be-contract");

      // Cannot set if not a network-managed extension
      const unofficialVotingHybrid = await VotingHybrid.new(colony.address);
      await colony.setRootRole(unofficialVotingHybrid.address, true);
      await checkErrorRevert(unofficialVotingHybrid.executeCall(tokenSupplier.address, action), "transaction-failed");

      // Cannot set if the caller does not implement `identifier()`
      const requireExecuteCall = await RequireExecuteCall.new();
      await colony.setRootRole(requireExecuteCall.address, true);
      await checkErrorRevert(requireExecuteCall.executeCall(tokenSupplier.address, action), "transaction-failed");

      // Cannot set if not VotingHybrid
      await colony.installExtension(VOTING_REPUTATION, 1);
      const votingReputationAddress = await colonyNetwork.getExtensionInstallation(VOTING_REPUTATION, colony.address);
      const votingReputation = await VotingHybrid.at(votingReputationAddress);
      await colony.setRootRole(votingReputation.address, true);
      await checkErrorRevert(votingReputation.executeCall(tokenSupplier.address, action), "transaction-failed");
    });

    it("can update the tokenIssuanceRate via a hybrid vote", async () => {
      await colony.installExtension(VOTING_HYBRID, 1);
      const votingHybridAddress = await colonyNetwork.getExtensionInstallation(VOTING_HYBRID, colony.address);
      const votingHybrid = await VotingHybrid.at(votingHybridAddress);
      await colony.setRootRole(votingHybrid.address, true);

      const action = await encodeTxData(tokenSupplier, "setTokenIssuanceRate", [WAD.muln(2)]);
      await votingHybrid.executeCall(tokenSupplier.address, action);

      const tokenIssuanceRate = await tokenSupplier.tokenIssuanceRate();
      expect(tokenIssuanceRate).to.eq.BN(WAD.muln(2));

      // Cannot set through a normal contract call
      await checkErrorRevert(tokenSupplier.setTokenIssuanceRate(WAD), "token-supplier-caller-must-be-contract");

      // Cannot set if not a network-managed extension
      const unofficialVotingHybrid = await VotingHybrid.new(colony.address);
      await colony.setRootRole(unofficialVotingHybrid.address, true);
      await checkErrorRevert(unofficialVotingHybrid.executeCall(tokenSupplier.address, action), "transaction-failed");

      // Cannot set if the caller does not implement `identifier()`
      const requireExecuteCall = await RequireExecuteCall.new();
      await colony.setRootRole(requireExecuteCall.address, true);
      await checkErrorRevert(requireExecuteCall.executeCall(tokenSupplier.address, action), "transaction-failed");
    });

    it("can update the tokenIssuanceRate via a reputation vote, by <=10% once every 4 weeks", async () => {
      await tokenSupplier.initialise(SUPPLY_CEILING, WAD);

      await colony.installExtension(VOTING_REPUTATION, 1);
      const votingReputationAddress = await colonyNetwork.getExtensionInstallation(VOTING_REPUTATION, colony.address);
      const votingReputation = await VotingHybrid.at(votingReputationAddress);
      await colony.setRootRole(votingReputation.address, true);

      // Smaller change
      const action1 = await encodeTxData(tokenSupplier, "setTokenIssuanceRate", [WAD.add(WAD.divn(10))]);
      // Bigger change
      const action2 = await encodeTxData(tokenSupplier, "setTokenIssuanceRate", [WAD.add(WAD.divn(9))]);

      // Cannot change more than once in 4 weeks
      await checkErrorRevert(votingReputation.executeCall(tokenSupplier.address, action1), "transaction-failed");

      await forwardTime(SECONDS_PER_DAY * 28, this);

      // Cannot change more than 10%
      await checkErrorRevert(votingReputation.executeCall(tokenSupplier.address, action2), "transaction-failed");

      await votingReputation.executeCall(tokenSupplier.address, action1);

      const tokenIssuanceRate = await tokenSupplier.tokenIssuanceRate();
      expect(tokenIssuanceRate).to.eq.BN(WAD.add(WAD.divn(10)));

      // Cannot change more than once in 4 weeks
      await checkErrorRevert(votingReputation.executeCall(tokenSupplier.address, action2), "transaction-failed");

      await forwardTime(SECONDS_PER_DAY * 28, this);

      await votingReputation.executeCall(tokenSupplier.address, action2);
    });
  });

  describe("issuing tokens", async () => {
    beforeEach(async () => {
      await tokenSupplier.initialise(SUPPLY_CEILING, WAD);
    });

    it("can claim tokenIssuanceRate tokens per day", async () => {
      const balancePre = await token.balanceOf(colony.address);

      let time = await currentBlockTime();
      time = new BN(time).addn(SECONDS_PER_DAY);

      await makeTxAtTimestamp(tokenSupplier.issueTokens, [], time.toNumber(), this);

      const balancePost = await token.balanceOf(colony.address);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD);

      const tokenSupply = await token.totalSupply();
      expect(tokenSupply).to.eq.BN(WAD);
    });

    it("can claim up to the tokenSupplyCeiling", async () => {
      const balancePre = await token.balanceOf(colony.address);

      let time = await currentBlockTime();
      time = new BN(time).addn(SECONDS_PER_DAY * 10);

      await makeTxAtTimestamp(tokenSupplier.issueTokens, [], time.toNumber(), this);

      const balancePost = await token.balanceOf(colony.address);
      expect(balancePost.sub(balancePre)).to.eq.BN(SUPPLY_CEILING);

      const tokenSupply = await token.totalSupply();
      expect(tokenSupply).to.eq.BN(SUPPLY_CEILING);

      await checkErrorRevert(tokenSupplier.issueTokens(), "token-supplier-nothing-to-issue");
    });
  });
});
