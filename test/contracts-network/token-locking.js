/* globals artifacts */
import path from "path";
import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";
import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";

import { getTokenArgs, checkErrorRevert, forwardTime, makeReputationKey, getBlockTime, advanceMiningCycleNoContest } from "../../helpers/test-helper";
import { giveUserCLNYTokensAndStake, setupRandomColony, fundColonyWithTokens } from "../../helpers/test-data-generator";
import { UINT256_MAX, MIN_STAKE, DEFAULT_STAKE } from "../../helpers/constants";

import ReputationMinerTestWrapper from "../../packages/reputation-miner/test/ReputationMinerTestWrapper";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ITokenLocking = artifacts.require("ITokenLocking");
const Token = artifacts.require("Token");

const contractLoader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "../..", "build", "contracts")
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
    await colony.mintTokens(Math.ceil(((usersTokens + otherUserTokens) * 100) / 99));
    await colony.claimColonyFunds(token.address);
    await colony.bootstrapColony([userAddress], [usersTokens]);

    const tokenArgs = getTokenArgs();
    otherToken = await Token.new(...tokenArgs);
    await otherToken.unlock();

    await giveUserCLNYTokensAndStake(colonyNetwork, addresses[4], DEFAULT_STAKE);
    const client = new ReputationMinerTestWrapper({
      loader: contractLoader,
      minerAddress: addresses[4],
      realProviderPort: REAL_PROVIDER_PORT,
      useJsTree: true
    });
    await client.initialise(colonyNetwork.address);

    // Enable the client to start mining.
    await advanceMiningCycleNoContest({ colonyNetwork, test: this });

    // Load the reputation state and run another cycle.
    await advanceMiningCycleNoContest({ colonyNetwork, client, test: this });

    const result = await colony.getDomain(1);
    const rootDomainSkill = result.skillId;
    const colonyWideReputationKey = makeReputationKey(colony.address, rootDomainSkill);
    const { key, value, branchMask, siblings } = await client.getReputationProofObject(colonyWideReputationKey);
    colonyWideReputationProof = [key, value, branchMask, siblings];
  });

  describe("when locking tokens", async () => {
    it("should correctly set colony network address", async () => {
      await tokenLocking.setColonyNetwork(ethers.constants.AddressZero);
      let colonyNetworkAddress = await tokenLocking.getColonyNetwork();
      expect(colonyNetworkAddress).to.equal(ethers.constants.AddressZero);

      await tokenLocking.setColonyNetwork(colonyNetwork.address);
      colonyNetworkAddress = await tokenLocking.getColonyNetwork();
      expect(colonyNetworkAddress).to.equal(colonyNetwork.address);
    });

    it("should correctly deposit tokens", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      expect(info.balance).to.eq.BN(usersTokens);

      const tokenLockingContractBalance = await token.balanceOf(tokenLocking.address);
      expect(tokenLockingContractBalance).to.eq.BN(usersTokens);
    });

    it("should correctly deposit large amounts of tokens", async () => {
      await otherToken.mint(userAddress, UINT256_MAX);
      await otherToken.approve(tokenLocking.address, UINT256_MAX, { from: userAddress });
      await tokenLocking.deposit(otherToken.address, UINT256_MAX, { from: userAddress });
      const info = await tokenLocking.getUserLock(otherToken.address, userAddress);
      expect(info.balance).to.eq.BN(UINT256_MAX);

      const tokenLockingContractBalance = await otherToken.balanceOf(tokenLocking.address);
      expect(tokenLockingContractBalance).to.eq.BN(UINT256_MAX);
    });

    it("should correctly set deposit timestamp", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      const quarter = Math.floor(usersTokens / 4);

      let tx;
      tx = await tokenLocking.deposit(token.address, quarter * 3, { from: userAddress });
      const time1 = await getBlockTime(tx.receipt.blockNumber);
      const info1 = await tokenLocking.getUserLock(token.address, userAddress);
      expect(info1.balance).to.eq.BN(quarter * 3);
      expect(info1.timestamp).to.eq.BN(time1);

      await forwardTime(3600);

      tx = await tokenLocking.deposit(token.address, quarter, { from: userAddress });
      const time2 = await getBlockTime(tx.receipt.blockNumber);
      const info2 = await tokenLocking.getUserLock(token.address, userAddress);

      const weightedAvgTime = Math.floor((time1 * 3 + time2) / 4);
      expect(info2.balance).to.eq.BN(quarter * 4);
      expect(info2.timestamp).to.eq.BN(weightedAvgTime);
    });

    it("should not be able to deposit tokens if they are not approved", async () => {
      await checkErrorRevert(tokenLocking.deposit(token.address, usersTokens, { from: userAddress }), "ds-token-insufficient-approval");
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      expect(info.balance).to.be.zero;
      const userBalance = await token.balanceOf(userAddress);
      expect(userBalance).to.eq.BN(usersTokens);
    });

    it("should not be able to withdraw if specified amount is greated than deposited", async () => {
      await colony.claimColonyFunds(token.address);
      await colony.bootstrapColony([addresses[0]], [otherUserTokens]);
      await token.approve(tokenLocking.address, otherUserTokens);
      await tokenLocking.deposit(token.address, otherUserTokens);

      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });

      await checkErrorRevert(tokenLocking.withdraw(token.address, otherUserTokens, { from: userAddress }), "ds-math-sub-underflow");
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      expect(info.balance).to.eq.BN(usersTokens);
      const userBalance = await token.balanceOf(userAddress);
      expect(userBalance).to.be.zero;
    });

    it("should correctly withdraw tokens", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await tokenLocking.withdraw(token.address, usersTokens, { from: userAddress });

      const info = await tokenLocking.getUserLock(token.address, userAddress);
      expect(info.balance).to.be.zero;
      const userBalance = await token.balanceOf(userAddress);
      expect(userBalance).to.eq.BN(usersTokens);
    });

    it("should not be able to deposit 0 tokens", async () => {
      await checkErrorRevert(tokenLocking.deposit(token.address, 0, { from: userAddress }), "colony-token-locking-invalid-amount");
    });

    it("should not be able to withdraw 0 tokens", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });

      await checkErrorRevert(tokenLocking.withdraw(token.address, 0, { from: userAddress }), "colony-token-locking-invalid-amount");

      const info = await tokenLocking.getUserLock(token.address, userAddress);
      expect(info.balance).to.eq.BN(usersTokens);
    });

    it("should correctly increment total lock count", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await fundColonyWithTokens(colony, otherToken);
      await colony.moveFundsBetweenPots(1, 0, 0, 1, 0, 100, otherToken.address);
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const totalLockCount = await tokenLocking.getTotalLockCount(token.address);
      expect(totalLockCount).to.eq.BN(1);
    });

    it("should correctly increment users lock count", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await fundColonyWithTokens(colony, otherToken);
      await colony.moveFundsBetweenPots(1, 0, 0, 1, 0, 100, otherToken.address);
      const { logs } = await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const payoutId = logs[0].args.rewardPayoutId;

      await tokenLocking.incrementLockCounterTo(token.address, payoutId, { from: userAddress });
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      expect(info.lockCount).to.eq.BN(1);
    });

    it("should not be able to waive to id that does not exist", async () => {
      await fundColonyWithTokens(colony, otherToken);
      await colony.moveFundsBetweenPots(1, 0, 0, 1, 0, 100, otherToken.address);
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
      await fundColonyWithTokens(colony, otherToken);
      await colony.moveFundsBetweenPots(1, 0, 0, 1, 0, 100, otherToken.address);
      const { logs } = await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const payoutId = logs[0].args.rewardPayoutId;
      await checkErrorRevert(tokenLocking.unlockTokenForUser(token.address, userAddress, payoutId), "colony-token-locking-sender-not-colony");
    });

    it("should be able to deposit tokens multiple times if they are unlocked", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens / 2, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens / 2, { from: userAddress });
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      expect(info.balance).to.eq.BN(usersTokens);
    });

    it("should not be able to deposit tokens while they are locked", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await fundColonyWithTokens(colony, otherToken);
      await colony.moveFundsBetweenPots(1, 0, 0, 1, 0, 100, otherToken.address);
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      await checkErrorRevert(tokenLocking.deposit(token.address, usersTokens, { from: userAddress }), "colony-token-locking-token-locked");
    });

    it("should not be able to withdraw tokens while they are locked", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await fundColonyWithTokens(colony, otherToken);
      await colony.moveFundsBetweenPots(1, 0, 0, 1, 0, 100, otherToken.address);
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      await checkErrorRevert(tokenLocking.withdraw(token.address, usersTokens, { from: userAddress }), "colony-token-locking-token-locked");
    });

    it("should be able to withdraw tokens after they are unlocked", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await fundColonyWithTokens(colony, otherToken);
      await colony.moveFundsBetweenPots(1, 0, 0, 1, 0, 100, otherToken.address);
      const { logs } = await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const payoutId = logs[0].args.rewardPayoutId;
      await tokenLocking.incrementLockCounterTo(token.address, payoutId, { from: userAddress });
      await tokenLocking.withdraw(token.address, usersTokens, { from: userAddress });
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      expect(info.balance).to.be.zero;
    });

    it("should be able to lock tokens twice", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await fundColonyWithTokens(colony, otherToken);
      await colony.moveFundsBetweenPots(1, 0, 0, 1, 0, 100, otherToken.address);
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      await colony.moveFundsBetweenPots(1, 0, 0, 1, 0, 100, otherToken.address);
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);

      const totalLockCount = await tokenLocking.getTotalLockCount(token.address);
      expect(totalLockCount).to.eq.BN(2);
    });

    it("should be able to set user lock count equal to total lock count when depositing if user had 0 deposited tokens", async () => {
      await fundColonyWithTokens(colony, otherToken);
      await colony.moveFundsBetweenPots(1, 0, 0, 1, 0, 100, otherToken.address);
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);

      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });

      const info = await tokenLocking.getUserLock(token.address, userAddress);
      const totalLockCount = await tokenLocking.getTotalLockCount(token.address);
      expect(info.lockCount).to.eq.BN(totalLockCount);
    });

    it('should not allow "punishStakers" to be called from an account that is not not reputationMiningCycle', async () => {
      await checkErrorRevert(
        tokenLocking.punishStakers([addresses[0], addresses[1]], ethers.constants.AddressZero, MIN_STAKE),
        "colony-token-locking-sender-not-reputation-mining-cycle"
      );
    });
  });
});
