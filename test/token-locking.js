/* globals artifacts */
import path from "path";
import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";
import { getTokenArgs, checkErrorRevert, forwardTime, makeReputationKey, getBlockTime, advanceMiningCycleNoContest } from "../helpers/test-helper";
import { giveUserCLNYTokensAndStake, setupRandomColony } from "../helpers/test-data-generator";
import { MIN_STAKE, DEFAULT_STAKE, ZERO_ADDRESS } from "../helpers/constants";

import ReputationMiner from "../packages/reputation-miner/ReputationMiner";

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ITokenLocking = artifacts.require("ITokenLocking");
const ERC20ExtendedToken = artifacts.require("ERC20ExtendedToken");

const contractLoader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "build", "contracts")
});

const REAL_PROVIDER_PORT = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

contract("Token Locking", addresses => {
  const usersTokens = 10;
  const otherUserTokens = 100;
  const userAddress = addresses[1];
  let token;
  let tokenLocking;
  let otherToken;
  let colonyNetwork;
  let colony;
  let colonyWideReputationProof;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await ITokenLocking.at(tokenLockingAddress);
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.mintTokens(usersTokens + otherUserTokens);
    await colony.bootstrapColony([userAddress], [usersTokens]);

    const tokenArgs = getTokenArgs();
    otherToken = await ERC20ExtendedToken.new(...tokenArgs);

    await advanceMiningCycleNoContest({ colonyNetwork, test: this });

    await giveUserCLNYTokensAndStake(colonyNetwork, addresses[4], DEFAULT_STAKE);
    const client = new ReputationMiner({
      loader: contractLoader,
      minerAddress: addresses[4],
      realProviderPort: REAL_PROVIDER_PORT,
      useJsTree: true
    });
    await client.initialise(colonyNetwork.address);

    await advanceMiningCycleNoContest({ colonyNetwork, client, test: this });

    const result = await colony.getDomain(1);
    const rootDomainSkill = result.skillId;
    const colonyWideReputationKey = makeReputationKey(colony.address, rootDomainSkill);
    const { key, value, branchMask, siblings } = await client.getReputationProofObject(colonyWideReputationKey);
    colonyWideReputationProof = [key, value, branchMask, siblings];
  });

  describe("when locking tokens", async () => {
    it("should correctly set colony network address", async () => {
      await tokenLocking.setColonyNetwork(ZERO_ADDRESS);
      let colonyNetworkAddress = await tokenLocking.getColonyNetwork();
      assert.equal(colonyNetworkAddress, ZERO_ADDRESS);

      await tokenLocking.setColonyNetwork(colonyNetwork.address);
      colonyNetworkAddress = await tokenLocking.getColonyNetwork();
      assert.equal(colonyNetworkAddress, colonyNetwork.address);
    });

    it("should correctly deposit tokens", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      assert.equal(info.balance, usersTokens);

      const tokenLockingContractBalance = await token.balanceOf(tokenLocking.address);
      assert.equal(tokenLockingContractBalance.toNumber(), usersTokens);
    });

    it("should correctly set deposit timestamp", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      const quarter = Math.floor(usersTokens / 4);

      let tx;
      tx = await tokenLocking.deposit(token.address, quarter * 3, { from: userAddress });
      const time1 = await getBlockTime(tx.receipt.blockNumber);
      const info1 = await tokenLocking.getUserLock(token.address, userAddress);
      assert.equal(info1.balance, quarter * 3);
      assert.equal(info1.timestamp, time1);

      await forwardTime(3600);

      tx = await tokenLocking.deposit(token.address, quarter, { from: userAddress });
      const time2 = await getBlockTime(tx.receipt.blockNumber);
      const info2 = await tokenLocking.getUserLock(token.address, userAddress);

      const weightedAvgTime = Math.floor((time1 * 3 + time2) / 4);
      assert.equal(info2.balance, quarter * 4);
      assert.equal(info2.timestamp, weightedAvgTime);
    });

    it("should not be able to deposit tokens if they are not approved", async () => {
      await checkErrorRevert(tokenLocking.deposit(token.address, usersTokens, { from: userAddress }), "ds-token-insufficient-approval");
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      assert.equal(info.balance, 0);
      const userBalance = await token.balanceOf(userAddress);
      assert.equal(userBalance.toNumber(), usersTokens);
    });

    it("should not be able to withdraw if specified amount is greated than deposited", async () => {
      await colony.bootstrapColony([addresses[0]], [otherUserTokens]);
      await token.approve(tokenLocking.address, otherUserTokens);
      await tokenLocking.deposit(token.address, otherUserTokens);

      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });

      await checkErrorRevert(tokenLocking.withdraw(token.address, otherUserTokens, { from: userAddress }), "ds-math-sub-underflow");
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      assert.equal(info.balance, usersTokens);
      const userBalance = await token.balanceOf(userAddress);
      assert.equal(userBalance.toNumber(), 0);
    });

    it("should correctly withdraw tokens", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await tokenLocking.withdraw(token.address, usersTokens, { from: userAddress });
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      assert.equal(info.balance, 0);
      const userBalance = await token.balanceOf(userAddress);
      assert.equal(userBalance.toNumber(), usersTokens);
    });

    it("should not be able to deposit 0 tokens", async () => {
      await checkErrorRevert(tokenLocking.deposit(token.address, 0, { from: userAddress }), "colony-token-locking-invalid-amount");
    });

    it("should not be able to withdraw 0 tokens", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });

      await checkErrorRevert(tokenLocking.withdraw(token.address, 0, { from: userAddress }), "colony-token-locking-invalid-amount");

      const info = await tokenLocking.getUserLock(token.address, userAddress);
      assert.equal(info.balance, usersTokens);
    });

    it("should correctly increment total lock count", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const totalLockCount = await tokenLocking.getTotalLockCount(token.address);
      assert.equal(totalLockCount.toNumber(), 1);
    });

    it("should correctly increment users lock count", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      const { logs } = await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const payoutId = logs[0].args.rewardPayoutId;

      await tokenLocking.incrementLockCounterTo(token.address, payoutId, { from: userAddress });
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      assert.equal(info.lockCount, 1);
    });

    it("should not be able to waive to id that does not exist", async () => {
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);

      await checkErrorRevert(tokenLocking.incrementLockCounterTo(token.address, 10, { from: userAddress }), "colony-token-locking-invalid-lock-id");
    });

    it("should not be able to lock tokens if sender is not colony", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await checkErrorRevert(tokenLocking.lockToken(token.address), "colony-token-locking-sender-not-colony");
    });

    it("should not be able to unlock users tokens if sender is not colony", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      const { logs } = await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const payoutId = logs[0].args.rewardPayoutId;
      await checkErrorRevert(tokenLocking.unlockTokenForUser(token.address, userAddress, payoutId), "colony-token-locking-sender-not-colony");
    });

    it("should be able to deposit tokens multiple times if they are unlocked", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens / 2, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens / 2, { from: userAddress });
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      assert.equal(info.balance, usersTokens);
    });

    it("should not be able to deposit tokens while they are locked", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      await checkErrorRevert(tokenLocking.deposit(token.address, usersTokens, { from: userAddress }), "colony-token-locking-token-locked");
    });

    it("should not be able to withdraw tokens while they are locked", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      await checkErrorRevert(tokenLocking.withdraw(token.address, usersTokens, { from: userAddress }), "colony-token-locking-token-locked");
    });

    it("should be able to withdraw tokens after they are unlocked", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      const { logs } = await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const payoutId = logs[0].args.rewardPayoutId;
      await tokenLocking.incrementLockCounterTo(token.address, payoutId, { from: userAddress });
      await tokenLocking.withdraw(token.address, usersTokens, { from: userAddress });
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      assert.equal(info.balance, 0);
    });

    it("should be able to lock tokens twice", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);

      const tokenArgs = getTokenArgs();
      const newToken = await ERC20ExtendedToken.new(...tokenArgs);
      await colony.startNextRewardPayout(newToken.address, ...colonyWideReputationProof);

      const totalLockCount = await tokenLocking.getTotalLockCount(token.address);
      assert.equal(totalLockCount.toNumber(), 2);
    });

    it("should be able to set user lock count equal to total lock count when depositing if user had 0 deposited tokens", async () => {
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);

      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });

      const info = await tokenLocking.getUserLock(token.address, userAddress);
      const totalLockCount = await tokenLocking.getTotalLockCount(token.address);

      assert.equal(info.lockCount, totalLockCount.toString());
    });

    it('should not allow "punishStakers" to be called from an account that is not not reputationMiningCycle', async () => {
      await checkErrorRevert(
        tokenLocking.punishStakers([addresses[0], addresses[1]], ZERO_ADDRESS, MIN_STAKE),
        "colony-token-locking-sender-not-reputation-mining-cycle"
      );
    });
  });
});
