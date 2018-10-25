/* globals artifacts */
import path from "path";
import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";
import { getTokenArgs, checkErrorRevert, forwardTime, makeReputationKey, currentBlockTime } from "../helpers/test-helper";
import { giveUserCLNYTokensAndStake } from "../helpers/test-data-generator";
import { MIN_STAKE, DEFAULT_STAKE, MINING_CYCLE_DURATION } from "../helpers/constants";

import ReputationMiner from "../packages/reputation-miner/ReputationMiner";

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IColony = artifacts.require("IColony");
const ITokenLocking = artifacts.require("ITokenLocking");
const Token = artifacts.require("Token");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");

const contractLoader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "build", "contracts")
});

const REAL_PROVIDER_PORT = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

contract("TokenLocking", addresses => {
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
    let tokenArgs = getTokenArgs();
    token = await Token.new(...tokenArgs);
    tokenArgs = getTokenArgs();
    otherToken = await Token.new(...tokenArgs);

    const { logs } = await colonyNetwork.createColony(token.address);
    const { colonyAddress } = logs[0].args;
    colony = await IColony.at(colonyAddress);
    await token.setOwner(colony.address);
    await colony.mintTokens(usersTokens + otherUserTokens);
    await colony.bootstrapColony([userAddress], [usersTokens]);

    let addr = await colonyNetwork.getReputationMiningCycle.call(true);
    await forwardTime(MINING_CYCLE_DURATION, this);
    let repCycle = await IReputationMiningCycle.at(addr);
    await repCycle.submitRootHash("0x00", 0, 10);
    await repCycle.confirmNewHash(0);

    await giveUserCLNYTokensAndStake(colonyNetwork, addresses[4], DEFAULT_STAKE);

    const miningClient = new ReputationMiner({
      loader: contractLoader,
      minerAddress: addresses[4],
      realProviderPort: REAL_PROVIDER_PORT,
      useJsTree: true
    });
    await miningClient.initialise(colonyNetwork.address);
    await miningClient.addLogContentsToReputationTree();
    await forwardTime(MINING_CYCLE_DURATION, this);
    await miningClient.submitRootHash();

    addr = await colonyNetwork.getReputationMiningCycle.call(true);
    repCycle = await IReputationMiningCycle.at(addr);
    await repCycle.confirmNewHash(0);

    const result = await colony.getDomain(1);
    const rootDomainSkill = result.skillId;
    const colonyWideReputationKey = makeReputationKey(colony.address, rootDomainSkill.toNumber());
    const { key, value, branchMask, siblings } = await miningClient.getReputationProofObject(colonyWideReputationKey);
    colonyWideReputationProof = [key, value, branchMask, siblings];
  });

  describe("when locking tokens", async () => {
    it("should correctly set colony network address", async () => {
      await tokenLocking.setColonyNetwork(0x0);
      let colonyNetworkAddress = await tokenLocking.getColonyNetwork();
      assert.equal(colonyNetworkAddress, 0x0);

      await tokenLocking.setColonyNetwork(colonyNetwork.address);
      colonyNetworkAddress = await tokenLocking.getColonyNetwork();
      assert.equal(colonyNetworkAddress, colonyNetwork.address);
    });

    it("should correctly deposit tokens", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      const userDepositedBalance = info[1];
      assert.equal(userDepositedBalance.toNumber(), usersTokens);

      const tokenLockingContractBalance = await token.balanceOf(tokenLocking.address);
      assert.equal(tokenLockingContractBalance.toNumber(), usersTokens);
    });

    it("should correctly set deposit timestamp", async () => {
      await token.approve(tokenLocking.address, usersTokens, { from: userAddress });
      const deposit = usersTokens / 2;

      const time1 = await currentBlockTime();
      await tokenLocking.deposit(token.address, deposit, { from: userAddress });
      const info1 = await tokenLocking.getUserLock(token.address, userAddress);
      assert.equal(info1[2].toNumber(), time1);

      await forwardTime(3600);

      const time2 = await currentBlockTime();
      await tokenLocking.deposit(token.address, deposit, { from: userAddress });
      const info2 = await tokenLocking.getUserLock(token.address, userAddress);

      const avgTime = (time1 + time2) / 2;
      assert.closeTo(info2[2].toNumber(), avgTime, 1); // Tolerance of 1 second
    });

    it("should not be able to deposit tokens if they are not approved", async () => {
      await checkErrorRevert(
        tokenLocking.deposit(token.address, usersTokens, {
          from: userAddress
        })
      );
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      const userDepositedBalance = info[1];
      assert.equal(userDepositedBalance.toNumber(), 0);
      const userBalance = await token.balanceOf(userAddress);
      assert.equal(userBalance.toNumber(), usersTokens);
    });

    it("should not be able to withdraw if specified amount is greated than deposited", async () => {
      await colony.bootstrapColony([addresses[0]], [otherUserTokens]);
      await token.approve(tokenLocking.address, otherUserTokens);
      await tokenLocking.deposit(token.address, otherUserTokens);

      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });

      await checkErrorRevert(
        tokenLocking.withdraw(token.address, otherUserTokens, {
          from: userAddress
        })
      );
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      const userDepositedBalance = info[1];
      assert.equal(userDepositedBalance.toNumber(), usersTokens);
      const userBalance = await token.balanceOf(userAddress);
      assert.equal(userBalance.toNumber(), 0);
    });

    it("should correctly withdraw tokens", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });

      await tokenLocking.withdraw(token.address, usersTokens, {
        from: userAddress
      });
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      const userDepositedBalance = info[1];
      assert.equal(userDepositedBalance.toNumber(), 0);
      const userBalance = await token.balanceOf(userAddress);
      assert.equal(userBalance.toNumber(), usersTokens);
    });

    it("should not be able to deposit 0 tokens", async () => {
      await checkErrorRevert(
        tokenLocking.deposit(token.address, 0, {
          from: userAddress
        }),
        "colony-token-locking-invalid-amount"
      );
    });

    it("should not be able to withdraw 0 tokens", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });

      await checkErrorRevert(
        tokenLocking.withdraw(token.address, 0, {
          from: userAddress
        }),
        "colony-token-locking-invalid-amount"
      );

      const info = await tokenLocking.getUserLock(token.address, userAddress);
      const userDepositedBalance = info[1];
      assert.equal(userDepositedBalance.toNumber(), usersTokens);
    });

    it("should correctly increment total lock count", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const totalLockCount = await tokenLocking.getTotalLockCount(token.address);
      assert.equal(totalLockCount.toNumber(), 1);
    });

    it("should correctly increment users lock count", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });
      const { logs } = await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const payoutId = logs[0].args.id;

      await tokenLocking.incrementLockCounterTo(token.address, payoutId, {
        from: userAddress
      });
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      const lockCount = info[0];
      assert.equal(lockCount.toNumber(), 1);
    });

    it("should not be able to waive to id that does not exist", async () => {
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);

      await checkErrorRevert(
        tokenLocking.incrementLockCounterTo(token.address, 10, {
          from: userAddress
        }),
        "colony-token-locking-invalid-lock-id"
      );
    });

    it("should not be able to lock tokens if sender is not colony", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });
      await checkErrorRevert(tokenLocking.lockToken(token.address), "colony-token-locking-sender-not-colony");
    });

    it("should not be able to unlock users tokens if sender is not colony", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });
      const { logs } = await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const payoutId = logs[0].args.id;
      await checkErrorRevert(tokenLocking.unlockTokenForUser(token.address, userAddress, payoutId), "colony-token-locking-sender-not-colony");
    });

    it("should be able to deposit tokens multiple times if they are unlocked", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens / 2, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens / 2, {
        from: userAddress
      });
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      const userDepositedBalance = info[1];
      assert.equal(userDepositedBalance.toNumber(), usersTokens);
    });

    it("should not be able to deposit tokens while they are locked", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      await checkErrorRevert(
        tokenLocking.deposit(token.address, usersTokens, {
          from: userAddress
        }),
        "colony-token-locking-token-locked"
      );
    });

    it("should not be able to withdraw tokens while they are locked", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      await checkErrorRevert(
        tokenLocking.withdraw(token.address, usersTokens, {
          from: userAddress
        }),
        "colony-token-locking-token-locked"
      );
    });

    it("should be able to withdraw tokens after they are unlocked", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });
      const { logs } = await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);
      const payoutId = logs[0].args.id;
      await tokenLocking.incrementLockCounterTo(token.address, payoutId, {
        from: userAddress
      });
      await tokenLocking.withdraw(token.address, usersTokens, {
        from: userAddress
      });
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      const userDepositedBalance = info[1];
      assert.equal(userDepositedBalance, 0);
    });

    it("should be able to lock tokens twice", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);

      const tokenArgs = getTokenArgs();
      const newToken = await Token.new(...tokenArgs);
      await colony.startNextRewardPayout(newToken.address, ...colonyWideReputationProof);

      const totalLockCount = await tokenLocking.getTotalLockCount(token.address);
      assert.equal(totalLockCount.toNumber(), 2);
    });

    it("should be able to set user lock count equal to total lock count when depositing if user had 0 deposited tokens", async () => {
      await colony.startNextRewardPayout(otherToken.address, ...colonyWideReputationProof);

      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });

      const info = await tokenLocking.getUserLock(token.address, userAddress);
      const userLockCount = info[0];
      const totalLockCount = await tokenLocking.getTotalLockCount(token.address);

      assert.equal(userLockCount.toString(), totalLockCount.toString());
    });

    it('should not allow "punishStakers" to be called from an account that is not not reputationMiningCycle', async () => {
      await checkErrorRevert(
        tokenLocking.punishStakers([addresses[0], addresses[1]], 0x0, MIN_STAKE),
        "colony-token-locking-sender-not-reputation-mining-cycle"
      );
    });
  });
});
