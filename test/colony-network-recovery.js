/* globals artifacts */

import { padLeft, soliditySha3, numberToHex } from "web3-utils";
import BN from "bn.js";
import chai from "chai";
import bnChai from "bn-chai";
import path from "path";
import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";
import {
  forwardTime,
  makeReputationKey,
  currentBlock,
  currentBlockTime,
  checkErrorRevert,
  web3GetStorageAt,
  getActiveRepCycle,
  advanceMiningCycleNoContest
} from "../helpers/test-helper";
import { setupFinalizedTask, giveUserCLNYTokensAndStake, fundColonyWithTokens, setupRandomColony } from "../helpers/test-data-generator";
import ReputationMinerTestWrapper from "../packages/reputation-miner/test/ReputationMinerTestWrapper";
import { setupEtherRouter } from "../helpers/upgradable-contracts";
import { DEFAULT_STAKE, MINING_CYCLE_DURATION } from "../helpers/constants";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const IColony = artifacts.require("IColony");
const Token = artifacts.require("Token");
const ReputationMiningCycle = artifacts.require("ReputationMiningCycle");
const ReputationMiningCycleRespond = artifacts.require("ReputationMiningCycleRespond");
const Resolver = artifacts.require("Resolver");
const ContractEditing = artifacts.require("ContractEditing");

const contractLoader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "build", "contracts")
});

const REAL_PROVIDER_PORT = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

contract("Colony Network Recovery", accounts => {
  let colonyNetwork;
  let client;
  let startingBlockNumber;
  let metaColony;
  let clny;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IColony.at(metaColonyAddress);
    const clnyAddress = await metaColony.getToken();
    clny = await Token.at(clnyAddress);

    client = new ReputationMinerTestWrapper({
      loader: contractLoader,
      minerAddress: accounts[5],
      realProviderPort: REAL_PROVIDER_PORT,
      useJsTree: true
    });
  });

  beforeEach(async () => {
    await client.resetDB();
    await client.initialise(colonyNetwork.address);

    // Advance two cycles to clear active and inactive state.
    await advanceMiningCycleNoContest({ colonyNetwork, test: this });
    await advanceMiningCycleNoContest({ colonyNetwork, test: this });

    const block = await currentBlock();
    // If we don't add the one here, when we sync from this block number we'll include the previous update log,
    // which we've ignored (by confirming the root hash 0x00)
    startingBlockNumber = block.number + 1;
  });

  afterEach(async () => {
    await colonyNetwork.removeRecoveryRole(accounts[1]);
    await colonyNetwork.removeRecoveryRole(accounts[2]);
  });

  describe("when using recovery mode", () => {
    it("should be able to add and remove recovery roles when not in recovery", async () => {
      const founder = accounts[0];
      let numRecoveryRoles;

      numRecoveryRoles = await colonyNetwork.numRecoveryRoles();
      expect(numRecoveryRoles).to.be.zero;
      colonyNetwork.setRecoveryRole(founder);
      await colonyNetwork.setRecoveryRole(accounts[1]);
      await colonyNetwork.setRecoveryRole(accounts[2]);
      numRecoveryRoles = await colonyNetwork.numRecoveryRoles();
      expect(numRecoveryRoles).to.eq.BN(3);

      // Can remove recovery roles
      await colonyNetwork.removeRecoveryRole(accounts[2]);
      numRecoveryRoles = await colonyNetwork.numRecoveryRoles();
      expect(numRecoveryRoles).to.eq.BN(2);

      // Can't remove twice
      await colonyNetwork.removeRecoveryRole(accounts[2]);
      numRecoveryRoles = await colonyNetwork.numRecoveryRoles();
      expect(numRecoveryRoles).to.eq.BN(2);

      await colonyNetwork.removeRecoveryRole(founder);
      numRecoveryRoles = await colonyNetwork.numRecoveryRoles();
      expect(numRecoveryRoles).to.eq.BN(1);
    });

    it("should not be able to add and remove roles when in recovery", async () => {
      await colonyNetwork.setRecoveryRole(accounts[1]);
      await colonyNetwork.enterRecoveryMode();
      await checkErrorRevert(colonyNetwork.setRecoveryRole(accounts[1]), "colony-in-recovery-mode");
      await checkErrorRevert(colonyNetwork.removeRecoveryRole(accounts[1]), "colony-in-recovery-mode");
      await colonyNetwork.approveExitRecovery();
      await colonyNetwork.approveExitRecovery({ from: accounts[1] });
      await colonyNetwork.exitRecoveryMode();
    });

    it("should not be able to call normal functions while in recovery", async () => {
      await colonyNetwork.enterRecoveryMode();
      await checkErrorRevert(colonyNetwork.createColony(clny.address), "colony-in-recovery-mode");
      await colonyNetwork.approveExitRecovery();
      await colonyNetwork.exitRecoveryMode();
    });

    it("should exit recovery mode with sufficient approvals", async () => {
      await colonyNetwork.setRecoveryRole(accounts[1]);
      await colonyNetwork.setRecoveryRole(accounts[2]);

      await colonyNetwork.enterRecoveryMode();
      await colonyNetwork.setStorageSlotRecovery(5, "0xdeadbeef");

      // 0/3 approve
      await checkErrorRevert(colonyNetwork.exitRecoveryMode(), "colony-recovery-exit-insufficient-approvals");

      // 1/3 approve
      await colonyNetwork.approveExitRecovery();
      await checkErrorRevert(colonyNetwork.exitRecoveryMode(), "colony-recovery-exit-insufficient-approvals");

      // 2/3 approve
      await colonyNetwork.approveExitRecovery({ from: accounts[1] });
      await colonyNetwork.exitRecoveryMode();
    });

    it("recovery users can work in recovery mode", async () => {
      await colonyNetwork.setRecoveryRole(accounts[1]);

      await colonyNetwork.enterRecoveryMode();
      await colonyNetwork.setStorageSlotRecovery(5, "0xdeadbeef", { from: accounts[1] });

      // 2/2 approve
      await colonyNetwork.approveExitRecovery();
      await colonyNetwork.approveExitRecovery({ from: accounts[1] });
      await colonyNetwork.exitRecoveryMode({ from: accounts[1] });
    });

    it("users cannot approve twice", async () => {
      await colonyNetwork.enterRecoveryMode();
      await colonyNetwork.setStorageSlotRecovery(5, "0xdeadbeef");

      await colonyNetwork.approveExitRecovery();
      await checkErrorRevert(colonyNetwork.approveExitRecovery(), "colony-recovery-approval-already-given");
      await colonyNetwork.exitRecoveryMode();
    });

    it("users cannot approve if unauthorized", async () => {
      await colonyNetwork.enterRecoveryMode();
      await checkErrorRevert(colonyNetwork.approveExitRecovery({ from: accounts[1] }), "ds-auth-unauthorized");
      await colonyNetwork.approveExitRecovery({ from: accounts[0] });
      await colonyNetwork.exitRecoveryMode();
    });

    it("should allow editing of general variables", async () => {
      await colonyNetwork.enterRecoveryMode();
      await colonyNetwork.setStorageSlotRecovery(5, "0xdeadbeef");

      const unprotected = await web3GetStorageAt(colonyNetwork.address, 5);
      expect(unprotected.toString()).to.equal(`0xdeadbeef${"0".repeat(56)}`);
      await colonyNetwork.approveExitRecovery();
      await colonyNetwork.exitRecoveryMode();
    });

    it("should not allow editing of protected variables", async () => {
      const protectedLoc = 0;
      await colonyNetwork.enterRecoveryMode();
      await checkErrorRevert(colonyNetwork.setStorageSlotRecovery(protectedLoc, "0xdeadbeef"), "colony-common-protected-variable");
      await colonyNetwork.approveExitRecovery();
      await colonyNetwork.exitRecoveryMode();
    });

    it("should not be able to call recovery functions while not in recovery mode", async () => {
      await checkErrorRevert(colonyNetwork.approveExitRecovery(), "colony-not-in-recovery-mode");
      await checkErrorRevert(colonyNetwork.exitRecoveryMode(), "colony-not-in-recovery-mode");
      await checkErrorRevert(colonyNetwork.setStorageSlotRecovery(1, "0x00"), "colony-not-in-recovery-mode");
    });

    it("should be able to fix reputation state", async () => {
      await advanceMiningCycleNoContest({ colonyNetwork, test: this }); // Default (0x00, 0)

      let rootHash = await colonyNetwork.getReputationRootHash();
      let nNodes = await colonyNetwork.getReputationRootHashNNodes();
      expect(rootHash).to.equal("0x0000000000000000000000000000000000000000000000000000000000000000");
      expect(nNodes).to.be.zero;

      await colonyNetwork.enterRecoveryMode();

      await colonyNetwork.setStorageSlotRecovery(13, "0x02");
      await colonyNetwork.setStorageSlotRecovery(14, `0x${new BN(7).toString(16, 64)}`);

      await colonyNetwork.approveExitRecovery();
      await colonyNetwork.exitRecoveryMode();
      rootHash = await colonyNetwork.getReputationRootHash();
      nNodes = await colonyNetwork.getReputationRootHashNNodes();
      expect(rootHash).to.equal("0x0200000000000000000000000000000000000000000000000000000000000000");
      expect(nNodes).to.eq.BN(7);
    });

    it("should be able to set replacement reputation log entry", async () => {
      await colonyNetwork.enterRecoveryMode();

      const repCycle = await getActiveRepCycle(colonyNetwork);
      const logLength = await repCycle.getReputationUpdateLogLength();
      // Use the last entry
      const entryToModify = logLength.subn(1);

      const entry = await repCycle.getReputationUpdateLogEntry(entryToModify);
      entry.amount = new BN(123456789);

      await colonyNetwork.setReplacementReputationUpdateLogEntry(
        repCycle.address,
        entryToModify,
        entry.user,
        entry.amount,
        entry.skillId,
        entry.colony,
        entry.nUpdates,
        entry.nPreviousUpdates
      );

      const replacementEntry = await colonyNetwork.getReplacementReputationUpdateLogEntry(repCycle.address, 0);
      expect(entry.user).to.equal(replacementEntry.user);
      expect(entry.amount).to.eq.BN(new BN(replacementEntry.amount));
      expect(entry.skillId).to.equal(replacementEntry.skillId);
      expect(entry.colony).to.equal(replacementEntry.colony);
      expect(entry.nUpdates).to.equal(replacementEntry.nUpdates);
      expect(entry.nPreviousUpdates).to.equal(replacementEntry.nPreviousUpdates);

      await colonyNetwork.approveExitRecovery();
      await colonyNetwork.exitRecoveryMode();
    });
  });

  describe("when using recovery mode, miners should work correctly", async () => {
    process.env.SOLIDITY_COVERAGE
      ? it.skip
      : it("miner should be able to correctly interpret historical reputation logs replaced during recovery mode", async () => {
          await giveUserCLNYTokensAndStake(colonyNetwork, accounts[5], DEFAULT_STAKE);

          await fundColonyWithTokens(metaColony, clny);
          await setupFinalizedTask({ colonyNetwork, colony: metaColony });

          await client.saveCurrentState();
          const startingHash = await client.getRootHash();

          const newClient = new ReputationMinerTestWrapper({
            loader: contractLoader,
            minerAddress: accounts[5],
            realProviderPort: REAL_PROVIDER_PORT,
            useJsTree: true
          });
          await newClient.initialise(colonyNetwork.address);

          const { colony, token } = await setupRandomColony(colonyNetwork);
          await colony.mintTokens(1000000000000000);
          await colony.claimColonyFunds(token.address);
          await colony.bootstrapColony([accounts[5]], [1000000000000000]);

          await advanceMiningCycleNoContest({ colonyNetwork, client, test: this });

          const repCycle = await getActiveRepCycle(colonyNetwork);
          const invalidEntry = await repCycle.getReputationUpdateLogEntry(5);
          invalidEntry.amount = 0;

          await advanceMiningCycleNoContest({ colonyNetwork, client, test: this });

          const domain = await colony.getDomain(1);
          const rootSkill = domain.skillId;
          const reputationKey = makeReputationKey(colony.address, rootSkill, accounts[5]);
          const originalValue = client.reputations[reputationKey].slice(2, 66);
          expect(parseInt(originalValue, 16)).to.equal(1000000000000000);

          await colonyNetwork.enterRecoveryMode();

          await colonyNetwork.setReplacementReputationUpdateLogEntry(
            repCycle.address,
            5,
            invalidEntry.user,
            invalidEntry.amount,
            invalidEntry.skillId,
            invalidEntry.colony,
            invalidEntry.nUpdates,
            invalidEntry.nPreviousUpdates
          );
          await client.loadState(startingHash);
          // This sync call will log an error - this is because we've changed a log entry, but the root hash
          // on-chain which .sync() does a sanity check against hasn't been updated.
          await client.sync(startingBlockNumber, true);
          console.log("The WARNING and ERROR immediately preceeding can be ignored (they are expected as part of the test)");

          const rootHash = await client.getRootHash();
          const nNodes = await client.nReputations;

          // slots 13 and 14 are hash and nodes respectively
          await colonyNetwork.setStorageSlotRecovery(13, rootHash);
          const nNodesHex = numberToHex(nNodes);
          await colonyNetwork.setStorageSlotRecovery(14, `${padLeft(nNodesHex, 64)}`);

          await colonyNetwork.approveExitRecovery();
          await colonyNetwork.exitRecoveryMode();

          const newHash = await colonyNetwork.getReputationRootHash();
          const newHashNNodes = await colonyNetwork.getReputationRootHashNNodes();
          expect(newHash).to.equal(rootHash);
          expect(newHashNNodes).to.eq.BN(nNodes.toString()); // nNodes is a BigNumber :sob:

          await newClient.sync(startingBlockNumber);
          const newValue = newClient.reputations[reputationKey].slice(2, 66);
          expect(new BN(newValue, 16)).to.be.zero;
        });

    process.env.SOLIDITY_COVERAGE
      ? it.skip
      : it("the ReputationMiningCycle being replaced mid-cycle should be able to be managed okay by miners (new and old)", async () => {
          await client.saveCurrentState();
          const startingHash = await client.getRootHash();

          const ignorantclient = new ReputationMinerTestWrapper({
            loader: contractLoader,
            minerAddress: accounts[5],
            realProviderPort: REAL_PROVIDER_PORT,
            useJsTree: true
          });
          await ignorantclient.initialise(colonyNetwork.address);

          const { colony, token } = await setupRandomColony(colonyNetwork);
          await colony.mintTokens(1000000000000000);
          await colony.claimColonyFunds(token.address);

          await colony.bootstrapColony([accounts[0]], [1000000000000000]);

          // A well intentioned miner makes a submission
          await forwardTime(MINING_CYCLE_DURATION, this);
          await ignorantclient.addLogContentsToReputationTree();
          await ignorantclient.submitRootHash();

          // Enter recovery mode
          await colonyNetwork.enterRecoveryMode();

          // Deploy new instances of ReputationMiningCycle
          // This has its own resolver, which is the same as the normal ReputationMiningCycle resolver with the addition of
          // a function that lets us edit storage slots directly.
          let newActiveCycle = await EtherRouter.new();
          let newInactiveCycle = await EtherRouter.new();
          const newResolver = await Resolver.new();

          // We use the existing deployments for the majority of the functions
          const deployedImplementations = {};
          deployedImplementations.ReputationMiningCycle = ReputationMiningCycle.address;
          deployedImplementations.ReputationMiningCycleRespond = ReputationMiningCycleRespond.address;
          await setupEtherRouter("IReputationMiningCycle", deployedImplementations, newResolver);

          // Now add our extra functions.
          // Add ReputationMiningCycleEditing to the resolver
          const contractEditing = await ContractEditing.new();
          await newResolver.register("setStorageSlot(uint256,bytes32)", contractEditing.address);

          // Point our cycles at the resolver.
          await newActiveCycle.setResolver(newResolver.address);
          await newInactiveCycle.setResolver(newResolver.address);
          newActiveCycle = await IReputationMiningCycle.at(newActiveCycle.address);
          newInactiveCycle = await IReputationMiningCycle.at(newInactiveCycle.address);

          // We also need these contracts with the recovery function present.
          const newActiveCycleAsRecovery = await ContractEditing.at(newActiveCycle.address);
          const newInactiveCycleAsRecovery = await ContractEditing.at(newInactiveCycle.address);

          const oldActiveCycle = await getActiveRepCycle(colonyNetwork);

          const oldInactiveCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
          const oldInactiveCycle = await ReputationMiningCycle.at(oldInactiveCycleAddress);

          // 'Initialise' the new mining cycles by hand
          const colonyNetworkAddress = colonyNetwork.address;
          const tokenLockingAddress = await colonyNetwork.getTokenLocking();
          const metaColonyAddress = await colonyNetwork.getMetaColony();
          const myMetaColony = await IColony.at(metaColonyAddress);
          const myClnyAddress = await myMetaColony.getToken();

          // slot 3: colonyNetworkAddress
          // slot 4: tokenLockingAddress
          // slot 5: clnyTokenAddress
          newActiveCycleAsRecovery.setStorageSlot(3, `0x000000000000000000000000${colonyNetworkAddress.slice(2)}`);
          newActiveCycleAsRecovery.setStorageSlot(4, `0x000000000000000000000000${tokenLockingAddress.slice(2)}`);
          newActiveCycleAsRecovery.setStorageSlot(5, `0x000000000000000000000000${myClnyAddress.slice(2)}`);
          let timeNow = await currentBlockTime();
          timeNow = new BN(timeNow).toString(16, 64);
          newActiveCycleAsRecovery.setStorageSlot(9, `0x${timeNow.toString(16, 64)}`);
          newInactiveCycleAsRecovery.setStorageSlot(3, `0x000000000000000000000000${colonyNetworkAddress.slice(2)}`);
          newInactiveCycleAsRecovery.setStorageSlot(4, `0x000000000000000000000000${tokenLockingAddress.slice(2)}`);
          newInactiveCycleAsRecovery.setStorageSlot(5, `0x000000000000000000000000${myClnyAddress.slice(2)}`);

          // Port over log entries.
          let nLogEntries = await oldActiveCycle.getReputationUpdateLogLength();
          nLogEntries = `0x${padLeft(nLogEntries.toString(16), 64)}`;
          await newActiveCycleAsRecovery.setStorageSlot(6, nLogEntries);
          const arrayStartingSlot = soliditySha3(6);
          for (let i = 0; i < nLogEntries; i += 1) {
            const logEntryStartingSlot = new BN(arrayStartingSlot.slice(2), 16).add(new BN(i * 5));
            const logEntry = await oldActiveCycle.getReputationUpdateLogEntry(i);
            await newActiveCycleAsRecovery.setStorageSlot(logEntryStartingSlot, `0x000000000000000000000000${logEntry.user.slice(2)}`);
            await newActiveCycleAsRecovery.setStorageSlot(logEntryStartingSlot.addn(1), `0x${padLeft(new BN(logEntry.amount).toTwos(256), 64)}`);
            await newActiveCycleAsRecovery.setStorageSlot(logEntryStartingSlot.addn(2), `0x${new BN(logEntry.skillId).toString(16, 64)}`);
            await newActiveCycleAsRecovery.setStorageSlot(logEntryStartingSlot.addn(3), `0x000000000000000000000000${logEntry.colony.slice(2)}`);
            await newActiveCycleAsRecovery.setStorageSlot(
              logEntryStartingSlot.addn(4),
              `0x${new BN(logEntry.nPreviousUpdates).toString(16, 32)}${new BN(logEntry.nUpdates).toString(16, 32)}`
            );

            const portedLogEntry = await newActiveCycle.getReputationUpdateLogEntry(i);
            expect(portedLogEntry.user).to.equal(logEntry.user);
            expect(portedLogEntry.amount).to.equal(logEntry.amount);
            expect(portedLogEntry.skillId).to.equal(logEntry.skillId);
            expect(portedLogEntry.colony).to.equal(logEntry.colony);
            expect(portedLogEntry.nUpdates).to.equal(logEntry.nUpdates);
            expect(portedLogEntry.nPreviousUpdates).to.equal(logEntry.nPreviousUpdates);
          }

          // We change the amount the first log entry is for - this is a 'wrong' entry we are fixing.
          await newActiveCycleAsRecovery.setStorageSlot(new BN(arrayStartingSlot.slice(2), 16).addn(1), `0x${padLeft("0", 64)}`);

          // Do the same for the inactive log entry
          nLogEntries = await oldInactiveCycle.getReputationUpdateLogLength();
          nLogEntries = `0x${padLeft(nLogEntries.toString(16), 64)}`;
          await newInactiveCycleAsRecovery.setStorageSlot(6, nLogEntries);

          for (let i = 0; i < nLogEntries; i += 1) {
            const logEntryStartingSlot = new BN(arrayStartingSlot.slice(2), 16).add(new BN(i * 5));
            const logEntry = await oldInactiveCycle.getReputationUpdateLogEntry(i);
            await newInactiveCycleAsRecovery.setStorageSlot(logEntryStartingSlot, `0x000000000000000000000000${logEntry.user.slice(2)}`);
            await newInactiveCycleAsRecovery.setStorageSlot(logEntryStartingSlot.addn(1), `0x${padLeft(new BN(logEntry.amount).toTwos(256), 64)}`);
            await newInactiveCycleAsRecovery.setStorageSlot(logEntryStartingSlot.addn(2), `0x${new BN(logEntry.skillId).toString(16, 64)}`);
            await newInactiveCycleAsRecovery.setStorageSlot(logEntryStartingSlot.addn(3), `0x000000000000000000000000${logEntry.colony.slice(2)}`);
            await newInactiveCycleAsRecovery.setStorageSlot(
              logEntryStartingSlot.addn(4),
              `0x${new BN(logEntry.nPreviousUpdates).toString(16, 32)}${new BN(logEntry.nUpdates).toString(16, 32)}`
            );

            const portedLogEntry = await newInactiveCycle.getReputationUpdateLogEntry(i);

            expect(portedLogEntry.user).to.equal(logEntry.user);
            expect(portedLogEntry.amount).to.equal(logEntry.amount);
            expect(portedLogEntry.skillId).to.equal(logEntry.skillId);
            expect(portedLogEntry.colony).to.equal(logEntry.colony);
            expect(portedLogEntry.nUpdates).to.equal(logEntry.nUpdates);
            expect(portedLogEntry.nPreviousUpdates).to.equal(logEntry.nPreviousUpdates);
          }

          // Set the new cycles
          await colonyNetwork.setStorageSlotRecovery(16, `0x000000000000000000000000${newActiveCycle.address.slice(2)}`);
          await colonyNetwork.setStorageSlotRecovery(17, `0x000000000000000000000000${newInactiveCycle.address.slice(2)}`);
          const retrievedActiveCycleAddress = await colonyNetwork.getReputationMiningCycle(true);
          expect(retrievedActiveCycleAddress).to.equal(newActiveCycle.address);
          const retrievedInactiveCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
          expect(retrievedInactiveCycleAddress).to.equal(newInactiveCycle.address);

          // Exit recovery mode
          await colonyNetwork.approveExitRecovery();
          await colonyNetwork.exitRecoveryMode();

          // Consume these reputation mining cycles.
          await advanceMiningCycleNoContest({ colonyNetwork, client, test: this });
          await advanceMiningCycleNoContest({ colonyNetwork, client, test: this });

          const newClient = new ReputationMinerTestWrapper({
            loader: contractLoader,
            minerAddress: accounts[5],
            realProviderPort: REAL_PROVIDER_PORT,
            useJsTree: true
          });
          await newClient.initialise(colonyNetwork.address);
          await newClient.sync(startingBlockNumber);

          const newClientHash = await newClient.getRootHash();
          const oldClientHash = await client.getRootHash();

          expect(newClientHash).to.equal(oldClientHash);

          let ignorantClientHash = await ignorantclient.getRootHash();
          // We changed one log entry, so these hashes should be different
          expect(newClientHash).to.not.equal(ignorantClientHash);

          // Now check the ignorant client can recover. Load a state from before we entered recovery mode
          await ignorantclient.loadState(startingHash);
          await ignorantclient.sync(startingBlockNumber);
          ignorantClientHash = await ignorantclient.getRootHash();

          expect(ignorantClientHash).to.equal(newClientHash);
        });
  });
});
