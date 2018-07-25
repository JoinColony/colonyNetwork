/* globals artifacts */

import { getTokenArgs, checkErrorRevert } from "../helpers/test-helper";

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IColony = artifacts.require("IColony");
const ITokenLocking = artifacts.require("ITokenLocking");
const Token = artifacts.require("Token");

contract("TokenLocking", accounts => {
  const usersTokens = 6;
  const userAddress = accounts[1];
  let token;
  let tokenLocking;
  let otherToken;
  let colonyNetwork;
  let colony;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await ITokenLocking.at(tokenLockingAddress);
  });

  beforeEach(async () => {
    let tokenArgs = getTokenArgs();
    token = await Token.new(...tokenArgs);
    await token.mint(usersTokens);
    await token.transfer(userAddress, usersTokens);

    tokenArgs = getTokenArgs();
    otherToken = await Token.new(...tokenArgs);

    const { logs } = await colonyNetwork.createColony(token.address);
    const { colonyAddress } = logs[0].args;
    colony = await IColony.at(colonyAddress);
  });

  describe("when locking tokens", async () => {
    it("should correctly set colony network address", async () => {
      await tokenLocking.setColonyNetwork(0x0);
      let colonyNetworkAddress = await tokenLocking.getColonyNetwork.call();
      assert.equal(colonyNetworkAddress, 0x0);

      await tokenLocking.setColonyNetwork(colonyNetwork.address);
      colonyNetworkAddress = await tokenLocking.getColonyNetwork.call();
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

    it("should not be able to deposit tokens if they are not approved", async () => {
      await checkErrorRevert(
        tokenLocking.deposit(token.address, usersTokens, {
          from: userAddress
        }),
        "token-locking-transfer-failed"
      );
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      const userDepositedBalance = info[1];
      assert.equal(userDepositedBalance.toNumber(), 0);
      const userBalance = await token.balanceOf(userAddress);
      assert.equal(userBalance.toNumber(), usersTokens);
    });

    it("should not be able to withdraw if specified amount is greated than deposited", async () => {
      const otherUserTokens = 100;
      await token.mint(otherUserTokens);
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
        })
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
        })
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
      await colony.startNextRewardPayout(otherToken.address);
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
      const { logs } = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = logs[0].args.id;

      await tokenLocking.incrementLockCounterTo(token.address, payoutId, {
        from: userAddress
      });
      const info = await tokenLocking.getUserLock(token.address, userAddress);
      const lockCount = info[0];
      assert.equal(lockCount.toNumber(), 1);
    });

    it("should not be able to waive to id that does not exist", async () => {
      await colony.startNextRewardPayout(otherToken.address);

      await checkErrorRevert(
        tokenLocking.incrementLockCounterTo(token.address, 10, {
          from: userAddress
        }),
        "token-locking-invalid-lock-id"
      );
    });

    it("should not be able to lock tokens if sender is not colony", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });
      await checkErrorRevert(tokenLocking.lockToken(token.address), "token-locking-sender-not-colony");
    });

    it("should not be able to unlock users tokens if sender is not colony", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });
      const { logs } = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = logs[0].args.id;
      await checkErrorRevert(tokenLocking.unlockTokenForUser(token.address, userAddress, payoutId), "token-locking-sender-not-colony");
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
      await colony.startNextRewardPayout(otherToken.address);
      await checkErrorRevert(
        tokenLocking.deposit(token.address, usersTokens, {
          from: userAddress
        }),
        "token-locking-token-locked"
      );
    });

    it("should not be able to withdraw tokens while they are locked", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });
      await colony.startNextRewardPayout(otherToken.address);
      await checkErrorRevert(
        tokenLocking.withdraw(token.address, usersTokens, {
          from: userAddress
        }),
        "token-locking-token-locked"
      );
    });

    it("should be able to withdraw tokens after they are unlocked", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });
      const { logs } = await colony.startNextRewardPayout(otherToken.address);
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
      await colony.startNextRewardPayout(otherToken.address);

      const tokenArgs = getTokenArgs();
      const newToken = await Token.new(...tokenArgs);
      await colony.startNextRewardPayout(newToken.address);

      const totalLockCount = await tokenLocking.getTotalLockCount(token.address);
      assert.equal(totalLockCount.toNumber(), 2);
    });

    it("should be able to set user lock count equal to total lock count when depositing if user had 0 deposited tokens", async () => {
      await colony.startNextRewardPayout(otherToken.address);

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
      await checkErrorRevert(tokenLocking.punishStakers([accounts[0], accounts[1]]), "token-locking-sender-not-reputation-mining-cycle");
    });
  });
});
