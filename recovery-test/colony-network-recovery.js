/* globals artifacts */

import { toBN, padLeft, soliditySha3 } from "web3-utils";
import BN from "bn.js";
import path from "path";
import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";
import {
  forwardTime,
  getTokenArgs,
  makeReputationKey,
  currentBlock,
  currentBlockTime,
  checkErrorRevert,
  submitAndForwardTimeToDispute,
  web3GetStorageAt
} from "../helpers/test-helper";
import { giveUserCLNYTokensAndStake } from "../helpers/test-data-generator";
import ReputationMiner from "../packages/reputation-miner/ReputationMiner";
import { setupEtherRouter } from "../helpers/upgradable-contracts";

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

contract("Colony Network", accounts => {
  let colonyNetwork;
  let miningClient;
  let startingBlockNumber;
  let clnyAddress;
  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    let addr = await colonyNetwork.getReputationMiningCycle.call(true);
    await forwardTime(3600, this);
    let repCycle = await IReputationMiningCycle.at(addr);
    await repCycle.submitRootHash("0x00", 0, 10);
    await repCycle.confirmNewHash(0);

    await giveUserCLNYTokensAndStake(colonyNetwork, accounts[4], toBN(10).pow(toBN(18)));
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    const metaColony = await IColony.at(metaColonyAddress);
    clnyAddress = await metaColony.getToken();

    miningClient = new ReputationMiner({
      loader: contractLoader,
      minerAddress: accounts[4],
      realProviderPort: REAL_PROVIDER_PORT,
      useJsTree: true
    });
    await miningClient.initialise(colonyNetwork.address);

    addr = await colonyNetwork.getReputationMiningCycle.call(true);
    repCycle = await IReputationMiningCycle.at(addr);
    await forwardTime(3600, this);
    await repCycle.submitRootHash("0x00", 0, 10);
    await repCycle.confirmNewHash(0);

    const block = await currentBlock();
    // If we don't add the one here, when we sync from this block number we'll include the previous update log,
    // which we've ignored (by confirming the root hash 0x00)
    startingBlockNumber = block.number + 1;
  });

  afterEach(async () => {
    await colonyNetwork.removeRecoveryRole(accounts[1]);
    await colonyNetwork.removeRecoveryRole(accounts[2]);
  });

  describe("Recovery Mode", () => {
    it("should be able to add and remove recovery roles when not in recovery", async () => {
      const owner = accounts[0];
      let numRecoveryRoles;

      numRecoveryRoles = await colonyNetwork.numRecoveryRoles();
      assert.equal(numRecoveryRoles.toNumber(), 0);
      colonyNetwork.setRecoveryRole(owner);
      await colonyNetwork.setRecoveryRole(accounts[1]);
      await colonyNetwork.setRecoveryRole(accounts[2]);
      numRecoveryRoles = await colonyNetwork.numRecoveryRoles();
      assert.equal(numRecoveryRoles.toNumber(), 3);

      // Can remove recovery roles
      await colonyNetwork.removeRecoveryRole(accounts[2]);
      numRecoveryRoles = await colonyNetwork.numRecoveryRoles();
      assert.equal(numRecoveryRoles.toNumber(), 2);

      // Can't remove twice
      await colonyNetwork.removeRecoveryRole(accounts[2]);
      numRecoveryRoles = await colonyNetwork.numRecoveryRoles();
      assert.equal(numRecoveryRoles.toNumber(), 2);

      await colonyNetwork.removeRecoveryRole(owner);
      numRecoveryRoles = await colonyNetwork.numRecoveryRoles();
      assert.equal(numRecoveryRoles.toNumber(), 1);
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
      await checkErrorRevert(colonyNetwork.createColony(clnyAddress), "colony-in-recovery-mode");
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
      await checkErrorRevert(colonyNetwork.approveExitRecovery({ from: accounts[1] }));
      await colonyNetwork.approveExitRecovery({ from: accounts[0] });
      await colonyNetwork.exitRecoveryMode();
    });

    it("should allow editing of general variables", async () => {
      await colonyNetwork.enterRecoveryMode();
      await colonyNetwork.setStorageSlotRecovery(5, "0xdeadbeef");

      const unprotected = await web3GetStorageAt(colonyNetwork.address, 5);
      assert.equal(unprotected.toString(), `0xdeadbeef${"0".repeat(56)}`);
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
      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(3600, this);
      await repCycle.submitRootHash("0x01", 0, 10);
      await repCycle.confirmNewHash(0);

      let rootHash = await colonyNetwork.getReputationRootHash();
      let nNodes = await colonyNetwork.getReputationRootHashNNodes();
      assert.equal(rootHash, "0x0100000000000000000000000000000000000000000000000000000000000000");
      assert.equal(nNodes.toNumber(), 0);

      await colonyNetwork.enterRecoveryMode();

      await colonyNetwork.setStorageSlotRecovery(19, "0x02");
      await colonyNetwork.setStorageSlotRecovery(20, `0x${new BN(7).toString(16, 64)}`);

      await colonyNetwork.approveExitRecovery();
      await colonyNetwork.exitRecoveryMode();
      rootHash = await colonyNetwork.getReputationRootHash();
      nNodes = await colonyNetwork.getReputationRootHashNNodes();
      assert.equal(rootHash, "0x0200000000000000000000000000000000000000000000000000000000000000");
      assert.equal(nNodes.toNumber(), 7);
    });

    it("miner should be able to correctly interpret historical reputation logs replaced during recovery mode", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, accounts[5], toBN(10).pow(toBN(18)));
      await miningClient.saveCurrentState();
      const startingHash = await miningClient.getRootHash();

      const newMiningClient = new ReputationMiner({
        loader: contractLoader,
        minerAddress: accounts[5],
        realProviderPort: REAL_PROVIDER_PORT,
        useJsTree: true
      });
      await newMiningClient.initialise(colonyNetwork.address);

      const tokenArgs = getTokenArgs();
      const token = await Token.new(...tokenArgs);
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyAddress } = logs[0].args;

      await token.setOwner(colonyAddress);
      const colony = await IColony.at(colonyAddress);

      await colony.mintTokens(1000000000000000);
      await colony.bootstrapColony([accounts[0]], [1000000000000000]);

      let addr = await colonyNetwork.getReputationMiningCycle.call(false);
      let repCycle = await IReputationMiningCycle.at(addr);

      await miningClient.addLogContentsToReputationTree();
      await forwardTime(3600, this);
      await miningClient.submitRootHash();

      addr = await colonyNetwork.getReputationMiningCycle.call(true);
      repCycle = await IReputationMiningCycle.at(addr);
      await repCycle.confirmNewHash(0);

      await miningClient.addLogContentsToReputationTree();
      await forwardTime(3600, this);
      await miningClient.submitRootHash();

      addr = await colonyNetwork.getReputationMiningCycle.call(true);
      repCycle = await IReputationMiningCycle.at(addr);

      const invalidEntry = await repCycle.getReputationUpdateLogEntry(5);
      invalidEntry.amount = 0;

      await repCycle.confirmNewHash(0);

      const domain = await colony.getDomain(1);
      const rootSkill = domain[0];
      const reputationKey = makeReputationKey(colony.address, rootSkill.toNumber(), accounts[0]);
      const originalValue = miningClient.reputations[reputationKey].slice(2, 66);
      assert.equal(parseInt(originalValue, 16), 1000000000000000);

      await colonyNetwork.enterRecoveryMode();

      await colonyNetwork.setReplacementReputationUpdateLogEntry(
        addr,
        5,
        invalidEntry.user,
        invalidEntry.amount,
        invalidEntry.skillId,
        invalidEntry.colony,
        invalidEntry.nUpdates,
        invalidEntry.nPreviousUpdates
      );
      await miningClient.loadState(startingHash);
      // This sync call will log an error - this is because we've changed a log entry, but the root hash
      // on-chain which .sync() does a sanity check against hasn't been updated.
      await miningClient.sync(startingBlockNumber, true);
      console.log("The WARNING and ERROR immediately preceeding can be ignored (they are expected as part of the test)");
      const rootHash = await miningClient.getRootHash();
      const nNodes = await miningClient.nReputations;
      // slots 19 and 20 are hash and nodes respectively
      await colonyNetwork.setStorageSlotRecovery(19, rootHash);
      await colonyNetwork.setStorageSlotRecovery(20, `0x${padLeft(nNodes.toString(16), 64)}`);

      await colonyNetwork.approveExitRecovery();
      await colonyNetwork.exitRecoveryMode();

      const newHash = await colonyNetwork.getReputationRootHash();
      const newHashNNodes = await colonyNetwork.getReputationRootHashNNodes();

      assert.equal(newHash, rootHash);
      assert.equal(newHashNNodes.toNumber(), nNodes);

      await newMiningClient.sync(startingBlockNumber);
      const newValue = newMiningClient.reputations[reputationKey].slice(2, 66);
      assert.equal(new BN(newValue, 16).toNumber(), 0);
    });

    it("the ReputationMiningCycle being replaced mid-cycle should be able to be managed okay by miners (new and old)", async () => {
      await miningClient.saveCurrentState();
      const startingHash = await miningClient.getRootHash();

      const ignorantMiningClient = new ReputationMiner({
        loader: contractLoader,
        minerAddress: accounts[5],
        realProviderPort: REAL_PROVIDER_PORT,
        useJsTree: true
      });
      await ignorantMiningClient.initialise(colonyNetwork.address);

      const tokenArgs = getTokenArgs();
      const token = await Token.new(...tokenArgs);
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyAddress } = logs[0].args;

      await token.setOwner(colonyAddress);
      const colony = await IColony.at(colonyAddress);

      await colony.mintTokens(1000000000000000);
      await colony.bootstrapColony([accounts[0]], [1000000000000000]);

      // A well intentioned miner makes a submission
      await forwardTime(3600, this);
      await ignorantMiningClient.addLogContentsToReputationTree();
      await ignorantMiningClient.submitRootHash();

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

      const oldActiveCycleAddress = await colonyNetwork.getReputationMiningCycle(true);
      const oldActiveCycle = await ReputationMiningCycle.at(oldActiveCycleAddress);

      const oldInactiveCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
      const oldInactiveCycle = await ReputationMiningCycle.at(oldInactiveCycleAddress);

      // 'Initialise' the new mining cycles by hand
      const colonyNetworkAddress = colonyNetwork.address;
      const tokenLockingAddress = await colonyNetwork.getTokenLocking();
      const metaColonyAddress = await colonyNetwork.getMetaColony();
      const metaColony = await IColony.at(metaColonyAddress);
      clnyAddress = await metaColony.getToken();

      // slot 4: colonyNetworkAddress
      // slot 5: tokenLockingAddress
      // slot 6: clnyTokenAddress
      newActiveCycleAsRecovery.setStorageSlot(4, `0x000000000000000000000000${colonyNetworkAddress.slice(2)}`);
      newActiveCycleAsRecovery.setStorageSlot(5, `0x000000000000000000000000${tokenLockingAddress.slice(2)}`);
      newActiveCycleAsRecovery.setStorageSlot(6, `0x000000000000000000000000${clnyAddress.slice(2)}`);
      let timeNow = await currentBlockTime();
      timeNow = new BN(timeNow).toString(16, 64);
      newActiveCycleAsRecovery.setStorageSlot(9, `0x${timeNow.toString(16, 64)}`);
      newInactiveCycleAsRecovery.setStorageSlot(4, `0x000000000000000000000000${colonyNetworkAddress.slice(2)}`);
      newInactiveCycleAsRecovery.setStorageSlot(5, `0x000000000000000000000000${tokenLockingAddress.slice(2)}`);
      newInactiveCycleAsRecovery.setStorageSlot(6, `0x000000000000000000000000${clnyAddress.slice(2)}`);

      // Port over log entries.
      let nLogEntries = await oldActiveCycle.getReputationUpdateLogLength();
      nLogEntries = `0x${padLeft(nLogEntries.toString(16), 64)}`;
      await newActiveCycleAsRecovery.setStorageSlot(3, nLogEntries);
      const arrayStartingSlot = soliditySha3(3);
      for (let i = 0; i < nLogEntries; i += 1) {
        /* eslint-disable no-await-in-loop */
        const logEntryStartingSlot = new BN(arrayStartingSlot.slice(2), 16).add(new BN(i * 6));
        const logEntry = await oldActiveCycle.getReputationUpdateLogEntry(i);
        await newActiveCycleAsRecovery.setStorageSlot(logEntryStartingSlot, `0x000000000000000000000000${logEntry[0].slice(2)}`);
        await newActiveCycleAsRecovery.setStorageSlot(logEntryStartingSlot.addn(1), `0x${padLeft(logEntry[1].toTwos(256), 64)}`);
        await newActiveCycleAsRecovery.setStorageSlot(logEntryStartingSlot.addn(2), `0x${logEntry[2].toString(16, 64)}`);
        await newActiveCycleAsRecovery.setStorageSlot(logEntryStartingSlot.addn(3), `0x000000000000000000000000${logEntry[3].slice(2)}`);
        await newActiveCycleAsRecovery.setStorageSlot(logEntryStartingSlot.addn(4), `0x${logEntry[4].toString(16, 64)}`);
        await newActiveCycleAsRecovery.setStorageSlot(logEntryStartingSlot.addn(5), `0x${logEntry[5].toString(16, 64)}`);
        const portedLogEntry = await newActiveCycle.getReputationUpdateLogEntry(i);
        /* eslint-enable no-await-in-loop  */
        for (let j = 0; j < portedLogEntry.length; j += 1) {
          assert.equal(portedLogEntry[i], logEntry[i]);
        }
      }

      // We change the amount the first log entry is for - this is a 'wrong' entry we are fixing.
      await newActiveCycleAsRecovery.setStorageSlot(new BN(arrayStartingSlot.slice(2), 16).addn(1), `0x${padLeft("0", 64)}`);

      // Do the same for the inactive log entry
      nLogEntries = await oldInactiveCycle.getReputationUpdateLogLength();
      nLogEntries = `0x${padLeft(nLogEntries.toString(16), 64)}`;
      await newInactiveCycleAsRecovery.setStorageSlot(3, nLogEntries);

      for (let i = 0; i < nLogEntries; i += 1) {
        /* eslint-disable no-await-in-loop */
        const logEntryStartingSlot = new BN(arrayStartingSlot.slice(2), 16).add(new BN(i * 6));
        const logEntry = await oldInactiveCycle.getReputationUpdateLogEntry(i);
        await newInactiveCycleAsRecovery.setStorageSlot(logEntryStartingSlot, `0x000000000000000000000000${logEntry[0].slice(2)}`);
        await newInactiveCycleAsRecovery.setStorageSlot(logEntryStartingSlot.addn(1), `0x${padLeft(logEntry[1].toTwos(256), 64)}`);
        await newInactiveCycleAsRecovery.setStorageSlot(logEntryStartingSlot.addn(2), `0x${logEntry[2].toString(16, 64)}`);
        await newInactiveCycleAsRecovery.setStorageSlot(logEntryStartingSlot.addn(3), `0x000000000000000000000000${logEntry[3].slice(2)}`);
        await newInactiveCycleAsRecovery.setStorageSlot(logEntryStartingSlot.addn(4), `0x${logEntry[4].toString(16, 64)}`);
        await newInactiveCycleAsRecovery.setStorageSlot(logEntryStartingSlot.addn(5), `0x${logEntry[5].toString(16, 64)}`);

        const portedLogEntry = await newInactiveCycle.getReputationUpdateLogEntry(i);
        /* eslint-enable no-await-in-loop  */
        for (let j = 0; j < portedLogEntry.length; j += 1) {
          assert.equal(portedLogEntry[i], logEntry[i]);
        }
      }

      // Set the new cycles
      await colonyNetwork.setStorageSlotRecovery(17, `0x000000000000000000000000${newActiveCycle.address.slice(2)}`);
      await colonyNetwork.setStorageSlotRecovery(18, `0x000000000000000000000000${newInactiveCycle.address.slice(2)}`);
      const retrievedActiveCycleAddress = await colonyNetwork.getReputationMiningCycle(true);
      assert.equal(retrievedActiveCycleAddress, newActiveCycle.address);
      const retrievedInactiveCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
      assert.equal(retrievedInactiveCycleAddress, newInactiveCycle.address);

      // Exit recovery mode
      await colonyNetwork.approveExitRecovery();
      await colonyNetwork.exitRecoveryMode();

      // Consume these reputation mining cycles.
      await submitAndForwardTimeToDispute([miningClient], this);
      await newActiveCycle.confirmNewHash(0);

      newActiveCycle = newInactiveCycle;
      await submitAndForwardTimeToDispute([miningClient], this);
      await newActiveCycle.confirmNewHash(0);

      const newMiningClient = new ReputationMiner({
        loader: contractLoader,
        minerAddress: accounts[5],
        realProviderPort: REAL_PROVIDER_PORT,
        useJsTree: true
      });
      await newMiningClient.initialise(colonyNetwork.address);
      await newMiningClient.sync(startingBlockNumber);

      const newClientHash = await newMiningClient.getRootHash();
      const oldClientHash = await miningClient.getRootHash();

      assert.equal(newClientHash, oldClientHash);

      let ignorantClientHash = await ignorantMiningClient.getRootHash();
      // We changed one log entry, so these hashes should be different
      assert.notEqual(newClientHash, ignorantClientHash);

      // Now check the ignorant client can recover. Load a state from before we entered recovery mode
      await ignorantMiningClient.loadState(startingHash);
      await ignorantMiningClient.sync(startingBlockNumber);
      ignorantClientHash = await ignorantMiningClient.getRootHash();

      assert.equal(ignorantClientHash, newClientHash);
    });
  });
});
