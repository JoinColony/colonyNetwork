/* globals artifacts */
import path from "path";
import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";
import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";

import { getTokenArgs, checkErrorRevert, makeReputationKey, advanceMiningCycleNoContest } from "../../helpers/test-helper";
import { giveUserCLNYTokensAndStake, setupRandomColony, fundColonyWithTokens } from "../../helpers/test-data-generator";
import { UINT256_MAX, DEFAULT_STAKE } from "../../helpers/constants";

import ReputationMinerTestWrapper from "../../packages/reputation-miner/test/ReputationMinerTestWrapper";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ITokenLocking = artifacts.require("ITokenLocking");
const Token = artifacts.require("Token");

const contractLoader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "../..", "build", "contracts"),
});

const REAL_PROVIDER_PORT = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

contract("Token Locking", (addresses) => {
  const usersTokens = 10;
  const otherUserTokens = 100;
  const userAddress = addresses[1];
  const otherUserAddress = addresses[2];
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
      useJsTree: true,
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

  describe("when depositing tokens", async () => {
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

    it("should not be able to deposit tokens if they are not approved", async () => {
      await checkErrorRevert(tokenLocking.deposit(token.address, usersTokens, { from: userAddress }), "ds-token-insufficient-approval");
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      expect(info.balance).to.be.zero;
      const userBalance = await token.balanceOf(userAddress);
      expect(userBalance).to.eq.BN(usersTokens);
    });

    it("should be able to deposit tokens multiple times if they are unlocked", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens / 2, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens / 2, { from: userAddress });
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      expect(info.balance).to.eq.BN(usersTokens);
    });

    it("should be able to deposit tokens while they are locked, into pendingBalance", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await fundColonyWithTokens(colony, otherToken);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 100, otherToken.address);
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      expect(info.pendingBalance).to.eq.BN(usersTokens);
    });

    it("should be able to deposit tokens for another user", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.depositFor(token.address, usersTokens, otherUserAddress, { from: userAddress });

      const lock = await tokenLocking.getUserLock(token.address, otherUserAddress);
      expect(lock.balance).to.eq.BN(usersTokens);
    });

    it("should be able to deposit tokens for another user, even if they are locked", async () => {
      await fundColonyWithTokens(colony, otherToken);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 100, otherToken.address);
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);

      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.depositFor(token.address, usersTokens, otherUserAddress, { from: userAddress });

      const lock = await tokenLocking.getUserLock(token.address, otherUserAddress);
      expect(lock.pendingBalance).to.eq.BN(usersTokens);
    });
  });

  describe("when withdrawing tokens", async () => {
    it("should not be able to withdraw if specified amount is greated than deposited", async () => {
      await colony.claimColonyFunds(token.address);
      await colony.bootstrapColony([addresses[0]], [otherUserTokens]);
      await token.approve(tokenLocking.address, otherUserTokens);
      await tokenLocking.deposit(token.address, otherUserTokens);

      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });

      await checkErrorRevert(
        tokenLocking.methods["withdraw(address,uint256,bool)"](token.address, otherUserTokens, false, { from: userAddress }),
        "ds-math-sub-underflow"
      );
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      expect(info.balance).to.eq.BN(usersTokens);
      const userBalance = await token.balanceOf(userAddress);
      expect(userBalance).to.be.zero;
    });

    it("should correctly withdraw tokens", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await tokenLocking.methods["withdraw(address,uint256,bool)"](token.address, usersTokens, false, { from: userAddress });

      const info = await tokenLocking.getUserLock(token.address, userAddress);
      expect(info.balance).to.be.zero;
      const userBalance = await token.balanceOf(userAddress);
      expect(userBalance).to.eq.BN(usersTokens);
    });

    it("should correctly withdraw tokens via the deprecated interface", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await tokenLocking.methods["withdraw(address,uint256)"](token.address, usersTokens, { from: userAddress });

      const info = await tokenLocking.getUserLock(token.address, userAddress);
      expect(info.balance).to.be.zero;
      const userBalance = await token.balanceOf(userAddress);
      expect(userBalance).to.eq.BN(usersTokens);
    });

    it("should not be able to withdraw tokens while they are locked", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await fundColonyWithTokens(colony, otherToken);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 100, otherToken.address);
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      await checkErrorRevert(
        tokenLocking.methods["withdraw(address,uint256,bool)"](token.address, usersTokens, false, { from: userAddress }),
        "colony-token-locking-token-locked"
      );
    });

    it("should be able to withdraw tokens while they are locked, with _force", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await fundColonyWithTokens(colony, otherToken);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 100, otherToken.address);
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      await tokenLocking.methods["withdraw(address,uint256,bool)"](token.address, usersTokens, true, { from: userAddress });
    });

    it("should be able to withdraw tokens after they are unlocked", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await fundColonyWithTokens(colony, otherToken);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 100, otherToken.address);
      const { logs } = await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const payoutId = logs[0].args.rewardPayoutId;
      await tokenLocking.incrementLockCounterTo(token.address, payoutId, { from: userAddress });
      await tokenLocking.methods["withdraw(address,uint256,bool)"](token.address, usersTokens, false, { from: userAddress });
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      expect(info.balance).to.be.zero;
    });
  });

  describe("when transferring or claiming tokens", async () => {
    it("should be able to transfer tokens to balance, when recipient is unlocked", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });

      await tokenLocking.transfer(token.address, usersTokens, otherUserAddress, false, { from: userAddress });

      const lock = await tokenLocking.getUserLock(token.address, otherUserAddress);
      expect(lock.balance).to.eq.BN(usersTokens);
    });

    it("should be able to transfer tokens to pending balance, when recipient is locked", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });

      await fundColonyWithTokens(colony, token);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 100, token.address);
      await colony.startNextRewardPayout(token.address, ...colonyWideReputationProof);
      await tokenLocking.transfer(token.address, usersTokens, otherUserAddress, true, { from: userAddress });

      const lock = await tokenLocking.getUserLock(token.address, otherUserAddress);
      expect(lock.pendingBalance).to.eq.BN(usersTokens);
    });

    it("should not be able to transfer tokens while they are locked", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });

      await fundColonyWithTokens(colony, token);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 100, token.address);
      await colony.startNextRewardPayout(token.address, ...colonyWideReputationProof);

      await checkErrorRevert(
        tokenLocking.transfer(token.address, usersTokens, otherUserAddress, false, { from: userAddress }),
        "colony-token-locking-token-locked"
      );
    });

    it("should be able to transfer tokens while they are locked, with _force", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });

      await fundColonyWithTokens(colony, token);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 100, token.address);
      await colony.startNextRewardPayout(token.address, ...colonyWideReputationProof);

      await tokenLocking.transfer(token.address, usersTokens, otherUserAddress, true, { from: userAddress });

      const lock = await tokenLocking.getUserLock(token.address, otherUserAddress);
      expect(lock.pendingBalance).to.eq.BN(usersTokens);
    });

    it("should be able to claim pending tokens", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await tokenLocking.transfer(token.address, usersTokens, otherUserAddress, false, { from: userAddress });

      await tokenLocking.claim(token.address, false, { from: otherUserAddress });

      const lock = await tokenLocking.getUserLock(token.address, otherUserAddress);
      expect(lock.balance).to.eq.BN(usersTokens);
    });

    it("should not be able to claim pending tokens while they are locked", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await tokenLocking.transfer(token.address, usersTokens, otherUserAddress, false, { from: userAddress });

      await fundColonyWithTokens(colony, token);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 100, token.address);
      await colony.startNextRewardPayout(token.address, ...colonyWideReputationProof);

      await checkErrorRevert(tokenLocking.claim(token.address, false, { from: otherUserAddress }), "colony-token-locking-token-locked");
    });

    it("should be able to claim pending tokens while they are locked, with _force", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await tokenLocking.transfer(token.address, usersTokens, otherUserAddress, false, { from: userAddress });

      await fundColonyWithTokens(colony, token);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 100, token.address);
      await colony.startNextRewardPayout(token.address, ...colonyWideReputationProof);

      await tokenLocking.claim(token.address, true, { from: otherUserAddress });

      const lock = await tokenLocking.getUserLock(token.address, otherUserAddress);
      expect(lock.balance).to.eq.BN(usersTokens);
    });
  });

  describe("locking behavior", async () => {
    it("should correctly increment total lock count", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await fundColonyWithTokens(colony, otherToken);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 100, otherToken.address);
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const totalLockCount = await tokenLocking.getTotalLockCount(token.address);
      expect(totalLockCount).to.eq.BN(1);
    });

    it("should correctly increment users lock count", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await fundColonyWithTokens(colony, otherToken);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 100, otherToken.address);
      const { logs } = await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const payoutId = logs[0].args.rewardPayoutId;

      await tokenLocking.incrementLockCounterTo(token.address, payoutId, { from: userAddress });
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      expect(info.lockCount).to.eq.BN(1);
    });

    it("should not be able to waive to id that does not exist", async () => {
      await fundColonyWithTokens(colony, otherToken);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 100, otherToken.address);
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      await checkErrorRevert(tokenLocking.incrementLockCounterTo(token.address, 10, { from: userAddress }), "colony-token-locking-invalid-lock-id");
    });

    it("should not be able to lock tokens if sender is not colony", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await checkErrorRevert(tokenLocking.lockToken(token.address), "colony-token-locking-sender-not-colony-or-network");
    });

    it("should not be able to unlock users tokens if sender is not colony", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await fundColonyWithTokens(colony, otherToken);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 100, otherToken.address);
      const { logs } = await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const payoutId = logs[0].args.rewardPayoutId;
      await checkErrorRevert(
        tokenLocking.unlockTokenForUser(token.address, userAddress, payoutId),
        "colony-token-locking-sender-not-colony-or-network"
      );
    });

    it("should be able to lock tokens twice", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      await tokenLocking.deposit(token.address, usersTokens, { from: userAddress });
      await fundColonyWithTokens(colony, otherToken);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 100, otherToken.address);
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 100, otherToken.address);
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);

      const totalLockCount = await tokenLocking.getTotalLockCount(token.address);
      expect(totalLockCount).to.eq.BN(2);
    });
  });
});
