/* globals artifacts */
import BN from "bn.js";

import { giveUserCLNYTokens, giveUserCLNYTokensAndStake } from "../../helpers/test-data-generator";
import { MINING_CYCLE_DURATION, ZERO_ADDRESS } from "../../helpers/constants";
import { forwardTime, checkErrorRevert, getActiveRepCycle } from "../../helpers/test-helper";

const EtherRouter = artifacts.require("EtherRouter");
const IMetaColony = artifacts.require("IMetaColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ITokenLocking = artifacts.require("ITokenLocking");
const Token = artifacts.require("Token");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");

contract("Reputation mining - basic functionality", accounts => {
  const MINER1 = accounts[5];
  const MINER2 = accounts[6];

  let colonyNetwork;
  let tokenLocking;
  let metaColony;
  let clny;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await ITokenLocking.at(tokenLockingAddress);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);
    const clnyAddress = await metaColony.getToken();
    clny = await Token.at(clnyAddress);
  });

  afterEach(async () => {
    // Ensure consistent state of token locking and clny balance for two test accounts
    const miner1Lock = await tokenLocking.getUserLock(clny.address, MINER1);
    if (miner1Lock.balance > 0) {
      await tokenLocking.withdraw(clny.address, miner1Lock.balance, { from: MINER1 });
    }

    const miner2Lock = await tokenLocking.getUserLock(clny.address, MINER2);
    if (miner2Lock.balance > 0) {
      await tokenLocking.withdraw(clny.address, miner2Lock.balance, { from: MINER2 });
    }

    const miner1Balance = await clny.balanceOf(MINER1);
    await clny.burn(miner1Balance, { from: MINER1 });

    const miner2Balance = await clny.balanceOf(MINER2);
    await clny.burn(miner2Balance, { from: MINER2 });
  });

  describe("when miners are staking CLNY", () => {
    it("should allow miners to stake CLNY", async () => {
      await giveUserCLNYTokens(colonyNetwork, MINER2, 9000);
      await clny.approve(tokenLocking.address, 5000, { from: MINER2 });
      await tokenLocking.deposit(clny.address, 5000, { from: MINER2 });

      const userBalance = await clny.balanceOf(MINER2);
      assert.equal(userBalance.toNumber(), 4000);

      const info = await tokenLocking.getUserLock(clny.address, MINER2);
      const stakedBalance = new BN(info.balance);
      assert.equal(stakedBalance.toNumber(), 5000);
    });

    it("should allow miners to withdraw staked CLNY", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, 5000);

      await tokenLocking.withdraw(clny.address, 5000, { from: MINER2 });

      const info = await tokenLocking.getUserLock(clny.address, MINER2);
      const stakedBalance = new BN(info.balance);
      assert.equal(stakedBalance.toNumber(), 0);
    });

    it("should not allow miners to deposit more CLNY than they have", async () => {
      await giveUserCLNYTokens(colonyNetwork, MINER2, 9000);
      await clny.approve(tokenLocking.address, 10000, { from: MINER2 });

      await checkErrorRevert(tokenLocking.deposit(clny.address, 10000, { from: MINER2 }));

      const userBalance = await clny.balanceOf(MINER2);
      assert.equal(userBalance.toNumber(), 9000);

      const info = await tokenLocking.getUserLock(clny.address, MINER2);
      const stakedBalance = new BN(info.balance);
      assert.equal(stakedBalance.toNumber(), 0);
    });

    it("should not allow miners to withdraw more CLNY than they staked, even if enough has been staked total", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, 9000);

      await checkErrorRevert(tokenLocking.withdraw(clny.address, 10000, { from: MINER2 }), "ds-math-sub-underflow");

      const info = await tokenLocking.getUserLock(clny.address, MINER2);
      const stakedBalance = new BN(info.balance);
      assert.equal(stakedBalance.toNumber(), 9000);

      const userBalance = await clny.balanceOf(MINER2);
      assert.equal(userBalance.toNumber(), 0);
    });

    it("should not allow someone to submit a new reputation hash if they are not staking", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);

      await checkErrorRevert(repCycle.submitRootHash("0x12345678", 10, "0x00", 0), "colony-reputation-mining-zero-entry-index-passed");

      const nSubmittedHashes = await repCycle.getNSubmittedHashes();
      assert.isTrue(nSubmittedHashes.isZero());
    });
  });

  describe("when working with reputation functions permissions", async () => {
    it("should not allow someone who is not ColonyNetwork to appendReputationUpdateLog", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await checkErrorRevert(
        repCycle.appendReputationUpdateLog(MINER1, 100, 0, metaColony.address, 0, 1),
        "colony-reputation-mining-sender-not-network"
      );
    });

    it("should not allow someone who is not ColonyNetwork to reset the ReputationMiningCycle window", async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await checkErrorRevert(repCycle.resetWindow(), "colony-reputation-mining-sender-not-network");
    });

    it('should not allow "setReputationRootHash" to be called from an account that is not a ReputationMiningCycle', async () => {
      await checkErrorRevert(
        colonyNetwork.setReputationRootHash("0x000001", 10, [accounts[0], accounts[1]], 0),
        "colony-reputation-mining-sender-not-active-reputation-cycle"
      );
    });

    it('should not allow "startNextCycle" to be called if a cycle is in progress', async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);

      assert.isTrue(parseInt(repCycle.address, 16) !== 0);

      await checkErrorRevert(colonyNetwork.startNextCycle(), "colony-reputation-mining-still-active");
    });

    it('should not allow "rewardStakersWithReputation" to be called by someone not the colonyNetwork', async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);

      await checkErrorRevert(
        repCycle.rewardStakersWithReputation([MINER1], [1], ZERO_ADDRESS, 10000, 3),
        "colony-reputation-mining-sender-not-network"
      );
    });

    it('should not allow "initialise" to be called on either the active or inactive ReputationMiningCycle', async () => {
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await checkErrorRevert(repCycle.initialise(MINER1, MINER2), "colony-reputation-mining-cycle-already-initialised");

      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const inactiveRepCycle = await IReputationMiningCycle.at(addr);

      await checkErrorRevert(inactiveRepCycle.initialise(MINER1, MINER2), "colony-reputation-mining-cycle-already-initialised");
    });
  });
});
