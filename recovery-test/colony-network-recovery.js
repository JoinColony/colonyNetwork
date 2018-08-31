/* globals artifacts */

import { toBN, sha3, padLeft } from "web3-utils";
import BN from "bn.js";
import path from "path";
import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";
import { forwardTime, getTokenArgs, web3GetStorageAt, makeReputationKey, currentBlock, checkErrorRevert } from "../helpers/test-helper";
import { giveUserCLNYTokensAndStake } from "../helpers/test-data-generator";
import ReputationMiner from "../packages/reputation-miner/ReputationMiner";

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ColonyNetworkAuthority = artifacts.require("ColonyNetworkAuthority");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const IColony = artifacts.require("IColony");
const Token = artifacts.require("Token");

const contractLoader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "build", "contracts")
});

const REAL_PROVIDER_PORT = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

function hexAdd(hex, n) {
  const x = new BN(hex, 16);
  const sum = x.addn(n);
  const result = `0x${sum.toString(16).slice(1)}`;
  return result;
}

contract("Colony Network", accounts => {
  let colonyNetwork;
  let miningClient;
  let startingBlockNumber;
  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const colonyNetworkAuthority = await ColonyNetworkAuthority.new(colonyNetwork.address);
    await colonyNetwork.setAuthority(colonyNetworkAuthority.address);
  });

  beforeEach(async () => {
    let addr = await colonyNetwork.getReputationMiningCycle.call(true);
    await forwardTime(3600, this);
    let repCycle = await IReputationMiningCycle.at(addr);
    await repCycle.submitRootHash("0x00", 0, 10);
    await repCycle.confirmNewHash(0);

    const startingBlock = await currentBlock();
    startingBlockNumber = startingBlock.number;

    await giveUserCLNYTokensAndStake(colonyNetwork, accounts[4], toBN(10).pow(toBN(18)));

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
  });

  describe("Recovery Mode", () => {
    it("should not be able to call recovery functions while not in recovery mode", async () => {
      await checkErrorRevert(colonyNetwork.approveExitRecovery(), "colony-not-in-recovery-mode");
      await checkErrorRevert(colonyNetwork.exitRecoveryMode(), "colony-not-in-recovery-mode");
      await checkErrorRevert(colonyNetwork.setReputationState("0x00", 1), "colony-not-in-recovery-mode");
      await checkErrorRevert(colonyNetwork.setReputationMiningCycleStorageSlot(1, "0x00", true), "colony-not-in-recovery-mode");
      await checkErrorRevert(
        colonyNetwork.setCorruptedReputationUpdateLogs("0x5B3b7Dd8754308EB5AcA1BBdB0a5Fb3eb9E13FA0", [1]),
        "colony-not-in-recovery-mode"
      );
    });

    it("should be able to fix reputation state", async () => {
      const addr = await colonyNetwork.getReputationMiningCycle(true);
      const repCycle = await IReputationMiningCycle.at(addr);
      await forwardTime(3600, this);
      await repCycle.submitRootHash("0x01", 0, 10);
      await repCycle.confirmNewHash(0);

      const rootHash = await colonyNetwork.getReputationRootHash();
      const nNodes = await colonyNetwork.getReputationRootHashNNodes();
      assert.equal(rootHash, "0x0100000000000000000000000000000000000000000000000000000000000000");
      assert.equal(nNodes.toNumber(), 0);

      await colonyNetwork.enterRecoveryMode();

      await colonyNetwork.setReputationState("0x02", 2);

      await colonyNetwork.approveExitRecovery();
      await colonyNetwork.exitRecoveryMode();
    });

    it("should be able to fix wrong reputation update logs in inactive reputation mining cycle", async () => {
      const tokenArgs = getTokenArgs();
      const token = await Token.new(...tokenArgs);
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyAddress } = logs[0].args;

      await token.setOwner(colonyAddress);
      const colony = await IColony.at(colonyAddress);

      await colony.mintTokens(1);
      await colony.bootstrapColony([accounts[0]], [1]);

      const index = `0x${padLeft("3", 64)}`;
      let key = sha3(index, { encoding: "hex" });
      key = hexAdd(key, 7);
      let addr = await colonyNetwork.getReputationMiningCycle(false);
      let res = await web3GetStorageAt(addr, key);
      assert.equal(res, "0x01");

      await colonyNetwork.enterRecoveryMode();
      await colonyNetwork.setReputationMiningCycleStorageSlot(key, "0x00", false);
      res = await web3GetStorageAt(addr, key);
      assert.equal(res, "0x0");

      await colonyNetwork.approveExitRecovery();
      await colonyNetwork.exitRecoveryMode();

      await miningClient.addLogContentsToReputationTree();
      await forwardTime(3600, this);
      await miningClient.submitRootHash();

      addr = await colonyNetwork.getReputationMiningCycle.call(true);
      let repCycle = await IReputationMiningCycle.at(addr);
      await repCycle.confirmNewHash(0);

      await miningClient.addLogContentsToReputationTree();
      await forwardTime(3600, this);
      await miningClient.submitRootHash();

      addr = await colonyNetwork.getReputationMiningCycle.call(true);
      repCycle = await IReputationMiningCycle.at(addr);
      await repCycle.confirmNewHash(0);

      const domain = await colony.getDomain(1);
      const rootSkill = domain[0];
      const reputationKey = makeReputationKey(colony.address, rootSkill.toNumber(), accounts[0]);
      const value = miningClient.reputations[reputationKey].slice(2, 66);
      assert.equal(new BN(value, 16).toNumber(), 0);
    });

    it("should be able to fix wrong reputation update logs in active reputation mining cycle", async () => {
      const tokenArgs = getTokenArgs();
      const token = await Token.new(...tokenArgs);
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyAddress } = logs[0].args;

      await token.setOwner(colonyAddress);
      const colony = await IColony.at(colonyAddress);

      await colony.mintTokens(1);
      await colony.bootstrapColony([accounts[0]], [1]);

      await miningClient.addLogContentsToReputationTree();
      await forwardTime(3600, this);
      await miningClient.submitRootHash();

      let addr = await colonyNetwork.getReputationMiningCycle.call(true);
      const repCycle = await IReputationMiningCycle.at(addr);
      await repCycle.confirmNewHash(0);

      const index = `0x${padLeft("3", 64)}`;
      let key = sha3(index, { encoding: "hex" });
      key = hexAdd(key, 7);
      addr = await colonyNetwork.getReputationMiningCycle(true);
      let res = await web3GetStorageAt(addr, key);
      assert.equal(res, "0x01");

      await colonyNetwork.enterRecoveryMode();
      await colonyNetwork.setReputationMiningCycleStorageSlot(key, "0x00", true);
      res = await web3GetStorageAt(addr, key);
      assert.equal(res, "0x0");
      await miningClient.addLogContentsToReputationTree();
      const rootHash = await miningClient.getRootHash();
      const nNodes = miningClient.nReputations - 1;

      await colonyNetwork.setReputationState(rootHash, nNodes);

      await colonyNetwork.approveExitRecovery();
      await colonyNetwork.exitRecoveryMode();
    });

    it.only("should be able to ignore wrong reputation update logs from mining cycles that are self destructed", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, accounts[5], toBN(10).pow(toBN(18)));

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

      await colony.mintTokens(1);
      await colony.bootstrapColony([accounts[0]], [1]);

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
      await repCycle.confirmNewHash(0);

      await colonyNetwork.enterRecoveryMode();
      await colonyNetwork.setCorruptedReputationUpdateLogs(addr, [5]);

      await miningClient.sync(startingBlockNumber, true);
      const rootHash = await miningClient.getRootHash();
      const nNodes = await miningClient.nReputations;
      await colonyNetwork.setReputationState(rootHash, nNodes);

      await colonyNetwork.approveExitRecovery();
      await colonyNetwork.exitRecoveryMode();

      const domain = await colony.getDomain(1);
      const rootSkill = domain[0];
      const reputationKey = makeReputationKey(colony.address, rootSkill.toNumber(), accounts[0]);
      const value = newMiningClient.reputations[reputationKey].slice(2, 66);
      await newMiningClient.sync(startingBlockNumber);
      assert.equal(new BN(value, 16).toNumber(), 0);
    });
  });
});
