/* globals artifacts */

import { getTokenArgs, checkErrorRevert } from "../helpers/test-helper";

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IColony = artifacts.require("IColony");
const ITokenLocking = artifacts.require("ITokenLocking");
const Token = artifacts.require("Token");

contract("TokenLocking", addresses => {
  const usersTokens = 6;
  const userAddress = addresses[1];
  let token;
  let tokenLocking;
  let otherToken;
  let colonyNetwork;
  let colony;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = IColonyNetwork.at(etherRouter.address);
    const tokenLockingAddress = await colonyNetwork.getTokenLocking.call();
    tokenLocking = ITokenLocking.at(tokenLockingAddress);
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
    colony = IColony.at(colonyAddress);
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
      const userDepositedBalance = await tokenLocking.getUserDepositedBalance.call(token.address, userAddress);
      assert.equal(userDepositedBalance.toNumber(), usersTokens);
    });

    it("should not be able todo deposit tokens if they are not approved", async () => {
      await checkErrorRevert(
        tokenLocking.deposit(token.address, usersTokens, {
          from: userAddress
        })
      );
      const userDepositedBalance = await tokenLocking.getUserDepositedBalance.call(token.address, userAddress);
      assert.equal(userDepositedBalance.toNumber(), 0);
    });

    it("should not be able to withdraw if specified amount is greated than deposited", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });
      await checkErrorRevert(
        tokenLocking.withdraw(token.address, 10, {
          from: userAddress
        })
      );
      const userDepositedBalance = await tokenLocking.getUserDepositedBalance.call(token.address, userAddress);
      assert.equal(userDepositedBalance.toNumber(), usersTokens);
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
      const userDepositedBalance = await tokenLocking.getUserDepositedBalance.call(token.address, userAddress);
      assert.equal(userDepositedBalance.toNumber(), 0);
    });

    it("should correctly increment total lock count", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });
      await colony.startNextRewardPayout(otherToken.address);
      const totalLockCount = await tokenLocking.getTotalTokenLockCount.call(token.address);
      assert.equal(totalLockCount.toNumber(), 1);
    });

    it("should correctly users lock count", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });
      const { logs } = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = logs[0].args.id;

      await colony.waiveRewardPayout(payoutId, {
        from: userAddress
      });
      const lockCount = await tokenLocking.getUserTokenLockCount.call(token.address, userAddress);
      assert.equal(lockCount.toNumber(), 1);
    });

    it("should correctly lock tokens", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });
      await colony.startNextRewardPayout(otherToken.address);

      const locked = await tokenLocking.usersTokensLocked.call(token.address, userAddress);
      assert(locked, "Users tokens are not locked");
    });

    it("should correctly unlock tokens", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens, {
        from: userAddress
      });
      const { logs } = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = logs[0].args.id;

      await colony.waiveRewardPayout(payoutId, {
        from: userAddress
      });

      const locked = await tokenLocking.usersTokensLocked.call(token.address, userAddress);
      assert(!locked, "Users tokens are locked");
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
      await colony.startNextRewardPayout(otherToken.address);
      await checkErrorRevert(tokenLocking.unlockTokenForUser(token.address, userAddress), "token-locking-sender-not-colony");
    });

    it("should be able to deposit tokens multiple times before if they are unlocked", async () => {
      await token.approve(tokenLocking.address, usersTokens, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens / 2, {
        from: userAddress
      });
      await tokenLocking.deposit(token.address, usersTokens / 2, {
        from: userAddress
      });
      const userDepositedBalance = await tokenLocking.getUserDepositedBalance.call(token.address, userAddress);
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
        })
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
        })
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
      await colony.waiveRewardPayout(payoutId, {
        from: userAddress
      });
      await tokenLocking.withdraw(token.address, usersTokens, {
        from: userAddress
      });
      const userDepositedBalance = await tokenLocking.getUserDepositedBalance.call(token.address, userAddress);
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

      const totalLockCount = await tokenLocking.getTotalTokenLockCount.call(token.address);
      assert.equal(totalLockCount.toNumber(), 2);
    });
  });
});
