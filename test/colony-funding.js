/* globals artifacts */

import { toBN, sha3 } from "web3-utils";

import {
  MANAGER,
  EVALUATOR,
  WORKER,
  MANAGER_ROLE,
  EVALUATOR_ROLE,
  WORKER_ROLE,
  SPECIFICATION_HASH,
  WORKER_PAYOUT,
  INITIAL_FUNDING
} from "../helpers/constants";
import { getTokenArgs, checkErrorRevert, web3GetBalance, forwardTime, bnSqrt } from "../helpers/test-helper";
import { fundColonyWithTokens, setupRatedTask } from "../helpers/test-data-generator";

const EtherRouter = artifacts.require("EtherRouter");
const IColony = artifacts.require("IColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const Token = artifacts.require("Token");
const ITokenLocking = artifacts.require("ITokenLocking");
const DSRoles = artifacts.require("DSRoles");

contract("Colony Funding", addresses => {
  let colony;
  let token;
  let otherToken;
  let colonyNetwork;
  let tokenLocking;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const tokenLockingAddress = await colonyNetwork.getTokenLocking.call();
    tokenLocking = ITokenLocking.at(tokenLockingAddress);
  });

  beforeEach(async () => {
    const tokenArgs = getTokenArgs();
    token = await Token.new(...tokenArgs);
    const { logs } = await colonyNetwork.createColony(token.address);
    const { colonyAddress } = logs[0].args;
    await token.setOwner(colonyAddress);
    colony = await IColony.at(colonyAddress);
    const otherTokenArgs = getTokenArgs();
    otherToken = await Token.new(...otherTokenArgs);
  });

  describe("when receiving tokens", () => {
    it("should not put the tokens straight in to the pot", async () => {
      await otherToken.mint(100);
      await otherToken.transfer(colony.address, 100);
      let colonyRewardPotBalance = await colony.getPotBalance.call(0, otherToken.address);
      let colonyPotBalance = await colony.getPotBalance.call(1, otherToken.address);
      let colonyTokenBalance = await otherToken.balanceOf.call(colony.address);
      assert.equal(colonyTokenBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 0);
      assert.equal(colonyRewardPotBalance.toNumber(), 0);
      await colony.claimColonyFunds(otherToken.address);
      colonyRewardPotBalance = await colony.getPotBalance.call(0, otherToken.address);
      colonyPotBalance = await colony.getPotBalance.call(1, otherToken.address);
      colonyTokenBalance = await otherToken.balanceOf.call(colony.address);
      assert.equal(colonyTokenBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 99);
      assert.equal(colonyRewardPotBalance.toNumber(), 1);
    });

    it("should not put its own tokens in to the reward pot", async () => {
      await fundColonyWithTokens(colony, token, 100);
      const colonyRewardPotBalance = await colony.getPotBalance.call(0, token.address);
      const colonyPotBalance = await colony.getPotBalance.call(1, token.address);
      const colonyTokenBalance = await token.balanceOf.call(colony.address);
      assert.equal(colonyTokenBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 100);
      assert.equal(colonyRewardPotBalance.toNumber(), 0);
    });

    it("should let tokens be moved between pots", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.moveFundsBetweenPots(1, 2, 51, otherToken.address);
      const colonyPotBalance = await colony.getPotBalance.call(1, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf.call(colony.address);
      const pot2Balance = await colony.getPotBalance.call(2, otherToken.address);
      assert.equal(colonyTokenBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 48);
      assert.equal(pot2Balance.toNumber(), 51);
    });

    it("should not let tokens be moved from the pot for payouts to token holders", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await colony.makeTask(SPECIFICATION_HASH, 1);

      await checkErrorRevert(colony.moveFundsBetweenPots(0, 2, 1, otherToken.address), "colonyFunding-cannot-move-funds-from-pot-0");
      const colonyPotBalance = await colony.getPotBalance.call(1, otherToken.address);
      const colonyRewardPotBalance = await colony.getPotBalance.call(0, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf.call(colony.address);
      const pot2Balance = await colony.getPotBalance.call(2, otherToken.address);
      assert.equal(colonyTokenBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 99);
      assert.equal(pot2Balance.toNumber(), 0);
      assert.equal(colonyRewardPotBalance.toNumber(), 1);
    });

    it("should not let tokens be moved by non-admins", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await colony.makeTask(SPECIFICATION_HASH, 1);

      await checkErrorRevert(colony.moveFundsBetweenPots(1, 2, 51, otherToken.address, { from: EVALUATOR }));
      const colonyPotBalance = await colony.getPotBalance.call(1, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf.call(colony.address);
      const pot2Balance = await colony.getPotBalance.call(2, otherToken.address);
      assert.equal(colonyTokenBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 99);
      assert.equal(pot2Balance.toNumber(), 0);
    });

    it("should not allow more tokens to leave a pot than the pot has (even if the colony has that many)", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.moveFundsBetweenPots(1, 2, 40, otherToken.address);

      await checkErrorRevert(colony.moveFundsBetweenPots(2, 3, 50, otherToken.address));
      const colonyPotBalance = await colony.getPotBalance.call(1, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf.call(colony.address);
      const pot2Balance = await colony.getPotBalance.call(2, otherToken.address);
      const pot3Balance = await colony.getPotBalance.call(3, otherToken.address);
      assert.equal(colonyTokenBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 59);
      assert.equal(pot2Balance.toNumber(), 40);
      assert.equal(pot3Balance.toNumber(), 0);
    });

    it("should correctly track if we are able to make token payouts", async () => {
      // There are eighteen scenarios to test here.
      // Pot was below payout, now equal (1 + 2)
      // Pot was below payout, now above (3 + 4)
      // Pot was equal to payout, now above (5 + 6)
      // Pot was equal to payout, now below (7 + 8)
      // Pot was above payout, now below (9 + 10)
      // Pot was above payout, now equal (11 + 12)
      // Pot was below payout, still below (13 + 14)
      // Pot was above payout, still above (15 + 16)
      // Pot was equal to payout, still equal (17 + 18)
      //
      // And, for each of these, we have to check that the update is correctly tracked when
      // the pot changes (odd numbers), and when the payout changes (even numbers)
      //
      // NB We do not need to be this exhaustive when using ether, because this test is testing
      // that updateTaskPayoutsWeCannotMakeAfterPotChange and updateTaskPayoutsWeCannotMakeAfterBudgetChange
      // are correct, which are used in both cases.
      await fundColonyWithTokens(colony, otherToken, 100);
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      // Pot 0, Payout 0
      // Pot was equal to payout, transition to pot being equal by changing payout (18)
      await colony.setTaskManagerPayout(1, otherToken.address, 0);
      let task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      // Pot 0, Payout 0
      // Pot was equal to payout, transition to pot being equal by changing pot (17)
      await colony.moveFundsBetweenPots(1, 2, 0, otherToken.address);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      // Pot 0, Payout 0
      // Pot was equal to payout, transition to pot being lower by increasing payout (8)
      await colony.setTaskManagerPayout(1, otherToken.address, 40);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 1);
      // Pot 0, Payout 40
      // Pot was below payout, transition to being equal by increasing pot (1)
      await colony.moveFundsBetweenPots(1, 2, 40, otherToken.address);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      // Pot 40, Payout 40
      // Pot was equal to payout, transition to being above by increasing pot (5)
      await colony.moveFundsBetweenPots(1, 2, 40, otherToken.address);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      // Pot 80, Payout 40
      // Pot was above payout, transition to being equal by increasing payout (12)
      await colony.setTaskManagerPayout(1, otherToken.address, 80);

      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      // Pot 80, Payout 80
      // Pot was equal to payout, transition to being above by decreasing payout (6)
      await colony.setTaskManagerPayout(1, otherToken.address, 40);

      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      // Pot 80, Payout 40
      // Pot was above payout, transition to being equal by decreasing pot (11)
      await colony.moveFundsBetweenPots(2, 1, 40, otherToken.address);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      // Pot 40, Payout 40
      // Pot was equal to payout, transition to pot being below payout by changing pot (7)
      await colony.moveFundsBetweenPots(2, 1, 20, otherToken.address);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 1);
      // Pot 20, Payout 40
      // Pot was below payout, change to being above by changing pot (3)
      await colony.moveFundsBetweenPots(1, 2, 60, otherToken.address);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      // Pot 80, Payout 40
      // Pot was above payout, change to being below by changing pot (9)
      await colony.moveFundsBetweenPots(2, 1, 60, otherToken.address);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 1);
      // Pot 20, Payout 40
      // Pot was below payout, change to being above by changing payout (4)
      await colony.setTaskManagerPayout(1, otherToken.address, 10);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      // Pot 20, Payout 10
      // Pot was above, change to being above by changing payout (16)
      await colony.setTaskManagerPayout(1, otherToken.address, 5);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      // Pot 20, Payout 5
      // Pot was above, change to being above by changing pot (15)
      await colony.moveFundsBetweenPots(2, 1, 10, otherToken.address);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      // Pot 10, Payout 5
      // Pot was above payout, change to being below by changing payout (10)
      await colony.setTaskManagerPayout(1, otherToken.address, 40);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 1);
      // Pot 10, Payout 40
      // Pot was below payout, change to being below by changing payout (14)
      await colony.setTaskManagerPayout(1, otherToken.address, 30);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 1);
      // Pot 10, Payout 30
      // Pot was below payout, change to being below by changing pot (13)
      await colony.moveFundsBetweenPots(2, 1, 5, otherToken.address);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 1);
      // Pot 5, Payout 30
      // Pot was below payout, change to being equal by changing payout (2)
      await colony.setTaskManagerPayout(1, otherToken.address, 5);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      // Pot 5, Payout 5
    });

    it("should pay fees on revenue correctly", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await fundColonyWithTokens(colony, otherToken, 200);
      const colonyPotBalance = await colony.getPotBalance.call(1, otherToken.address);
      const colonyRewardPotBalance = await colony.getPotBalance.call(0, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf.call(colony.address);
      assert.equal(colonyTokenBalance.toNumber(), 300);
      assert.equal(colonyRewardPotBalance.toNumber(), 3);
      assert.equal(colonyPotBalance.toNumber(), 297);
    });

    it("should not allow contributions to nonexistent pots", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await checkErrorRevert(colony.moveFundsBetweenPots(1, 5, 40, otherToken.address));
      const colonyPotBalance = await colony.getPotBalance.call(1, otherToken.address);
      assert.equal(colonyPotBalance.toNumber(), 99);
    });

    it("should not allow funds to be removed from a task with payouts to go", async () => {
      await fundColonyWithTokens(colony, otherToken, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token: otherToken });
      await colony.finalizeTask(taskId);
      await checkErrorRevert(colony.moveFundsBetweenPots(2, 1, 40, otherToken.address));
      const colonyPotBalance = await colony.getPotBalance.call(2, otherToken.address);
      assert.equal(colonyPotBalance.toNumber(), 350 * 1e18);
    });

    it("should allow funds to be removed from a task if there are no more payouts of that token to be claimed", async () => {
      await fundColonyWithTokens(colony, otherToken, 363 * 1e18);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token: otherToken });
      await colony.moveFundsBetweenPots(1, 2, 10, otherToken.address);
      await colony.finalizeTask(taskId);
      await colony.claimPayout(taskId, MANAGER_ROLE, otherToken.address);
      await colony.claimPayout(taskId, WORKER_ROLE, otherToken.address, { from: WORKER });
      await colony.claimPayout(taskId, EVALUATOR_ROLE, otherToken.address, { from: EVALUATOR });
      await colony.moveFundsBetweenPots(2, 1, 10, otherToken.address);

      const colonyPotBalance = await colony.getPotBalance.call(2, otherToken.address);
      assert.equal(colonyPotBalance.toNumber(), 0);
    });

    it("should not allow user to claim payout if rating is 1", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({
        colonyNetwork,
        colony,
        token,
        workerRating: 1
      });
      await colony.finalizeTask(taskId);
      const payout = await colony.getTaskPayout.call(taskId, WORKER_ROLE, token.address);
      assert.equal(payout.toNumber(), 0, "should have worker payout of 0");

      const taskInfo = await colony.getTask.call(taskId);
      await colony.claimPayout(taskId, MANAGER_ROLE, token.address, {
        from: MANAGER
      });
      await colony.claimPayout(taskId, EVALUATOR_ROLE, token.address, {
        from: EVALUATOR
      });
      await colony.claimPayout(taskId, WORKER_ROLE, token.address, {
        from: WORKER
      });
      const remainingPotBalance = await colony.getPotBalance(taskInfo[6].toNumber(), token.address);
      assert.equal(remainingPotBalance.toString(), WORKER_PAYOUT.toString(), "should have remaining pot balance equal to worker payout");

      await colony.moveFundsBetweenPots(taskInfo[6].toNumber(), 1, remainingPotBalance.toString(), token.address);

      const potBalance = await colony.getPotBalance(taskInfo[6].toNumber(), token.address);
      assert.equal(potBalance, 0, "should have pot balance of 0");
    });
  });

  describe("when receiving ether", () => {
    it("should not put the ether straight in to the pot", async () => {
      await colony.send(100);
      let colonyPotBalance = await colony.getPotBalance.call(1, 0x0);
      let colonyEtherBalance = await web3GetBalance(colony.address);
      let colonyRewardBalance = await colony.getPotBalance.call(0, 0x0);
      assert.equal(colonyEtherBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 0);
      await colony.claimColonyFunds(0x0);
      colonyPotBalance = await colony.getPotBalance.call(1, 0x0);
      colonyEtherBalance = await web3GetBalance(colony.address);
      colonyRewardBalance = await colony.getPotBalance.call(0, 0x0);
      assert.equal(colonyEtherBalance.toNumber(), 100);
      assert.equal(colonyRewardBalance.toNumber(), 1);
      assert.equal(colonyPotBalance.toNumber(), 99);
    });

    it("should let ether be moved between pots", async () => {
      await colony.send(100);
      await colony.claimColonyFunds(0x0);
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.moveFundsBetweenPots(1, 2, 51, 0x0);
      const colonyPotBalance = await colony.getPotBalance.call(1, 0x0);
      const colonyEtherBalance = await web3GetBalance(colony.address);
      const pot2Balance = await colony.getPotBalance.call(2, 0x0);
      assert.equal(colonyEtherBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 48);
      assert.equal(pot2Balance.toNumber(), 51);
    });

    it("should not allow more ether to leave a pot than the pot has (even if the colony has that many)", async () => {
      await colony.send(100);
      await colony.claimColonyFunds(0x0);
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.moveFundsBetweenPots(1, 2, 40, 0x0);

      await checkErrorRevert(colony.moveFundsBetweenPots(2, 3, 50, 0x0));
      const colonyEtherBalance = await web3GetBalance(colony.address);
      const colonyPotBalance = await colony.getPotBalance.call(1, 0x0);
      const pot2Balance = await colony.getPotBalance.call(2, 0x0);
      const pot3Balance = await colony.getPotBalance.call(3, 0x0);
      assert.equal(colonyEtherBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 59);
      assert.equal(pot2Balance.toNumber(), 40);
      assert.equal(pot3Balance.toNumber(), 0);
    });

    it("should correctly track if we are able to make ether payouts", async () => {
      await colony.send(100);
      await colony.claimColonyFunds(0x0);
      await colony.makeTask(SPECIFICATION_HASH, 1);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);

      await colony.setTaskManagerPayout(1, 0x0, 40);

      let task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 1);
      await colony.moveFundsBetweenPots(1, 2, 40, 0x0);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      await colony.moveFundsBetweenPots(2, 1, 30, 0x0);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 1);

      await colony.setTaskManagerPayout(1, 0x0, 10);

      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
    });

    it("should pay fees on revenue correctly", async () => {
      await colony.send(100);
      await colony.claimColonyFunds(0x0);
      await colony.send(200);
      await colony.claimColonyFunds(0x0);
      const colonyPotBalance = await colony.getPotBalance.call(1, 0x0);
      const colonyRewardPotBalance = await colony.getPotBalance.call(0, 0x0);
      const colonyEtherBalance = await web3GetBalance(colony.address);
      const nonRewardPotsTotal = await colony.getNonRewardPotsTotal.call(0x0);
      assert.equal(colonyEtherBalance.toNumber(), 300);
      assert.equal(colonyPotBalance.toNumber(), 297);
      assert.equal(colonyRewardPotBalance.toNumber(), 3);
      assert.equal(nonRewardPotsTotal.toNumber(), 297);
    });
  });

  describe("when creating reward payouts", async () => {
    const initialFunding = toBN(100 * 1e18);
    // Represents both reputation and tokens
    const totalAmount = toBN(80 * 1e18);
    // Represents both reputation and tokens
    const userAmount1 = toBN(50 * 1e18);
    // Represents both reputation and tokens
    const userAmount2 = toBN(30 * 1e18);
    const userAddress1 = addresses[0];
    const userAddress2 = addresses[1];
    const userAddress3 = addresses[2];
    let initialSquareRoots;

    beforeEach(async () => {
      await fundColonyWithTokens(colony, otherToken, initialFunding.toString());

      await colony.mintTokens(initialFunding.toString());
      await colony.bootstrapColony([userAddress1, userAddress2], [userAmount1.toString(), userAmount2.toString()]);

      await token.approve(tokenLocking.address, userAmount1.toString(), {
        from: userAddress1
      });

      await tokenLocking.deposit(token.address, userAmount1.toString(), {
        from: userAddress1
      });

      const userReputationSqrt = bnSqrt(userAmount1);

      // User tokens are the same as reputation
      const userTokensSqrt = toBN(userReputationSqrt.toString());

      // square root of total reputation
      const totalReputationSqrt = bnSqrt(totalAmount);

      const totalTokensSqrt = bnSqrt(userAmount1.add(userAmount2));

      const numeratorSqrt = bnSqrt(userReputationSqrt.mul(userTokensSqrt));
      const denominatorSqrt = bnSqrt(totalReputationSqrt.mul(totalTokensSqrt));

      const totalAmountSqrt = bnSqrt(initialFunding.div(toBN(100)));

      // Calculating square roots locally, to avoid big gas costs. This can be proven to be correct on chain easily
      initialSquareRoots = [
        userReputationSqrt.toString(),
        userTokensSqrt.toString(),
        totalReputationSqrt.toString(),
        totalTokensSqrt.toString(),
        numeratorSqrt.toString(),
        denominatorSqrt.toString(),
        totalAmountSqrt.toString()
      ];
    });

    it("should correctly increment global reward payout count", async () => {
      await colony.startNextRewardPayout(otherToken.address);

      const count = await colony.getGlobalRewardPayoutCount.call();
      assert.equal(count, 1);
    });

    it("should not be able to start a reward payout if noone holds colony tokens", async () => {
      const tokenArgs = getTokenArgs();
      const newToken = await Token.new(...tokenArgs);
      const { logs } = await colonyNetwork.createColony(newToken.address);
      const { colonyAddress } = logs[0].args;
      const newColony = IColony.at(colonyAddress);

      await checkErrorRevert(newColony.startNextRewardPayout(otherToken.address), "colony-reward-payout-invalid-total-tokens");
    });

    it("should not be able to create parallel payouts of the same token", async () => {
      await colony.startNextRewardPayout(otherToken.address);

      await checkErrorRevert(colony.startNextRewardPayout(otherToken.address), "colony-reward-payout-token-active");
    });

    it("should be able to collect rewards from multiple payouts of different token", async () => {
      const tokenArgs = getTokenArgs();
      const newToken = await Token.new(...tokenArgs);
      await fundColonyWithTokens(colony, newToken, initialFunding.toString());

      let { logs } = await colony.startNextRewardPayout(newToken.address);
      const payoutId1 = logs[0].args.id;
      ({ logs } = await colony.startNextRewardPayout(otherToken.address));
      const payoutId2 = logs[0].args.id;

      await colony.claimRewardPayout(payoutId1.toString(), initialSquareRoots, userAmount1.toString(), totalAmount.toString(), {
        from: userAddress1
      });

      await colony.claimRewardPayout(payoutId2.toString(), initialSquareRoots, userAmount1.toString(), totalAmount.toString(), {
        from: userAddress1
      });
    });

    it("should not be able to claim payout if colony-wide reputation is 0", async () => {
      const { logs } = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = logs[0].args.id;

      await checkErrorRevert(
        colony.claimRewardPayout(payoutId.toString(), initialSquareRoots, 0, 0, {
          from: userAddress1
        }),
        "colony-reward-payout-invalid-total-reputation"
      );
    });

    it("should not be able to claim tokens if user does not have any tokens", async () => {
      const userReputation3 = toBN(10 * 1e18);
      await colony.bootstrapColony([userAddress3], [userReputation3.toString()]);

      const { logs } = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = logs[0].args.id;

      const userReputation3Sqrt = bnSqrt(userReputation3);
      const totalAmount3 = userAmount1.add(userAmount2).add(userReputation3);
      const totalAmountSqrt = bnSqrt(totalAmount3);
      const totalTokensSqrt = bnSqrt(userAmount1.add(userAmount2));
      const denominatorSqrt = bnSqrt(totalAmount.mul(totalAmount3));
      const info = await colony.getRewardPayoutInfo(payoutId);
      const amountSqrt = bnSqrt(info[2]);

      const squareRoots = [
        userReputation3Sqrt.toString(),
        0,
        totalAmountSqrt.toString(),
        totalTokensSqrt.toString(),
        0,
        denominatorSqrt.toString(),
        amountSqrt.toString()
      ];

      await checkErrorRevert(
        colony.claimRewardPayout(payoutId.toString(), squareRoots, userReputation3.toString(), totalAmount.toString(), {
          from: userAddress3
        }),
        "colony-reward-payout-invalid-user-tokens"
      );
    });

    it("should not be able to claim tokens if user does not have any reputation", async () => {
      const userTokens3 = toBN(1e3);
      await colony.bootstrapColony([userAddress1], [userTokens3.toString()]);
      await token.transfer(userAddress3, userTokens3.toString());

      await token.approve(tokenLocking.address, userTokens3.toString(), {
        from: userAddress3
      });

      await tokenLocking.deposit(token.address, userTokens3.toString(), {
        from: userAddress3
      });

      const { logs } = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = logs[0].args.id;

      const userTokens3Sqrt = bnSqrt(userTokens3);
      const totalAmountSqrt = bnSqrt(totalAmount);
      const totalTokensSqrt = bnSqrt(userAmount1.add(userAmount2).add(userTokens3));
      const denominatorSqrt = bnSqrt(totalAmount.mul(totalTokensSqrt));
      const info = await colony.getRewardPayoutInfo(payoutId);
      const amountSqrt = bnSqrt(info[2]);

      const squareRoots = [
        0,
        userTokens3Sqrt.toString(),
        totalAmountSqrt.toString(),
        totalTokensSqrt.toString(),
        0,
        denominatorSqrt.toString(),
        amountSqrt.toString()
      ];

      await checkErrorRevert(
        colony.claimRewardPayout(payoutId.toString(), squareRoots, 0, totalAmount.toString(), {
          from: userAddress3
        }),
        "colony-reward-payout-invalid-user-reputation"
      );
    });

    it("should be able to withdraw tokens after claiming the reward", async () => {
      const { logs } = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = logs[0].args.id;

      await colony.claimRewardPayout(payoutId.toString(), initialSquareRoots, userAmount1.toString(), totalAmount.toString(), {
        from: userAddress1
      });

      await tokenLocking.withdraw(token.address, userAmount1.toString(), {
        from: userAddress1
      });

      const balance = await token.balanceOf(userAddress1);
      assert.equal(balance.toString(), userAmount1.toString());
    });

    it("should not be able to claim tokens after the payout period has expired", async () => {
      const { logs } = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = logs[0].args.id;

      await forwardTime(5184001, this);
      await checkErrorRevert(
        colony.claimRewardPayout(payoutId.toString(), initialSquareRoots, userAmount1.toString(), totalAmount.toString(), {
          from: userAddress1
        }),
        "colony-reward-payout-not-active"
      );
    });

    it("should be able to waive the payout", async () => {
      const { logs } = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = logs[0].args.id;

      await colony.waiveRewardPayout(payoutId.toString(), {
        from: userAddress1
      });

      await checkErrorRevert(
        colony.claimRewardPayout(payoutId.toString(), initialSquareRoots, userAmount1.toString(), totalAmount.toString(), {
          from: userAddress1
        }),
        "colony-reward-payout-already-claimed-or-waived"
      );
    });

    it("should not be able to waive payout thats already waived", async () => {
      const { logs } = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = logs[0].args.id;

      await colony.waiveRewardPayout(payoutId.toString(), {
        from: userAddress1
      });

      await checkErrorRevert(
        colony.waiveRewardPayout(payoutId.toString(), {
          from: userAddress1
        }),
        "colony-reward-payout-already-claimed-or-waived"
      );
    });

    it("should not be able to waive the payout if specified id does not exist", async () => {
      await colony.startNextRewardPayout(otherToken.address);

      await checkErrorRevert(
        colony.waiveRewardPayout(10, {
          from: userAddress1
        }),
        "colony-reward-payout-invalid-id"
      );
    });

    it("should not be able to claim payout if squareRoots are not valid", async () => {
      const { logs } = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = logs[0].args.id;

      const errorMessages = [
        "colony-reward-payout-invalid-parametar-user-reputation",
        "colony-reward-payout-invalid-parametar-user-token",
        "colony-reward-payout-invalid-parametar-total-reputation",
        "colony-reward-payout-invalid-parametar-total-tokens",
        "colony-reward-payout-invalid-parametar-amount",
        "colony-reward-payout-invalid-parametar-numerator",
        "colony-reward-payout-invalid-parametar-denominator"
      ];

      initialSquareRoots.forEach(async (param, i) => {
        const squareRoots = [...initialSquareRoots];
        squareRoots[i] = toBN(squareRoots[i])
          .mul(toBN(2))
          .toString();

        await checkErrorRevert(
          colony.claimRewardPayout(payoutId.toString(), squareRoots, userAmount1.toString(), totalAmount.toString(), {
            from: userAddress1
          }),
          errorMessages[i]
        );
      });
    });

    it("should be able to finalize reward payout and start new one", async () => {
      const tx = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = tx.logs[0].args.id;

      await forwardTime(5184001, this);
      await colony.finalizeRewardPayout(payoutId);

      await colony.startNextRewardPayout(otherToken.address);
    });

    it("should not be able to finalize the payout if payout is not active", async () => {
      const tx = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = tx.logs[0].args.id;

      await forwardTime(5184001, this);
      await colony.finalizeRewardPayout(payoutId);

      await checkErrorRevert(
        colony.finalizeRewardPayout(payoutId, {
          from: userAddress1
        }),
        "colony-reward-payout-token-not-active"
      );
    });

    it("should not be able to finalize payout if payout is still active", async () => {
      const tx = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = tx.logs[0].args.id;

      await checkErrorRevert(colony.finalizeRewardPayout(payoutId), "colony-reward-payout-active");
    });

    it("should not be able to finalize payout if payoutId does not exist", async () => {
      await colony.startNextRewardPayout(otherToken.address);

      await checkErrorRevert(colony.finalizeRewardPayout(10), "colony-reward-payout-not-found");
    });

    it("should be able to collect payout from two colonies at the same time", async () => {
      // Setting up a new token and two colonies
      const tokenArgs = getTokenArgs();
      const newToken = await Token.new(...tokenArgs);

      let { logs } = await colonyNetwork.createColony(newToken.address);
      let { colonyAddress } = logs[0].args;
      const colony1 = IColony.at(colonyAddress);

      ({ logs } = await colonyNetwork.createColony(newToken.address));
      ({ colonyAddress } = logs[0].args);
      const colony2 = IColony.at(colonyAddress);

      // Giving both colonies the capability to call `mint` function
      const adminRole = 1;
      const newRoles = await DSRoles.new();
      await newRoles.setUserRole(colony1.address, adminRole, true);
      await newRoles.setUserRole(colony2.address, adminRole, true);
      await newRoles.setRoleCapability(adminRole, newToken.address, sha3("mint(uint256)").slice(0, 10), true);
      await newToken.setAuthority(newRoles.address);

      await fundColonyWithTokens(colony1, otherToken, initialFunding.toString());
      await fundColonyWithTokens(colony2, otherToken, initialFunding.toString());

      // Minting the tokens so we can give them to users
      await colony1.mintTokens(initialFunding.toString());
      await colony2.mintTokens(initialFunding.toString());

      // Giving the user colony's native tokens and reputation so they can participate in reward payout
      await colony1.bootstrapColony([userAddress1, userAddress2], [userAmount1.toString(), userAmount2.toString()]);
      await colony2.bootstrapColony([userAddress1, userAddress2], [userAmount1.toString(), userAmount2.toString()]);

      // This will allow token locking contract to sent tokens on users behalf
      await newToken.approve(tokenLocking.address, userAmount1.toString(), {
        from: userAddress1
      });

      await tokenLocking.deposit(newToken.address, userAmount1.toString(), {
        from: userAddress1
      });

      ({ logs } = await colony1.startNextRewardPayout(otherToken.address));
      const payoutId1 = logs[0].args.id;
      ({ logs } = await colony2.startNextRewardPayout(otherToken.address));
      const payoutId2 = logs[0].args.id;

      await colony1.claimRewardPayout(payoutId1.toString(), initialSquareRoots, userAmount1.toString(), totalAmount.toString(), {
        from: userAddress1
      });

      await colony2.claimRewardPayout(payoutId2.toString(), initialSquareRoots, userAmount1.toString(), totalAmount.toString(), {
        from: userAddress1
      });
    });

    const reputations = [
      {
        totalReputationAndTokens: toBN(3),
        payoutTokens: toBN(90000000)
      },
      {
        totalReputationAndTokens: toBN(30),
        payoutTokens: toBN(90000000)
      },
      {
        totalReputationAndTokens: toBN(30000000000),
        payoutTokens: toBN(90000000000)
      },
      {
        totalReputationAndTokens: toBN(3).mul(toBN(10).pow(toBN(76))),
        payoutTokens: toBN(9).mul(toBN(10).pow(toBN(76)))
      },
      {
        totalReputationAndTokens: toBN(2)
          .pow(toBN(256))
          .sub(toBN(1)),
        payoutTokens: toBN(2)
          .pow(toBN(256))
          .sub(toBN(1))
      }
    ];

    reputations.forEach(data =>
      it(`should calculate fairly precise reward payout for:
        user reputation/tokens: ${data.totalReputationAndTokens.div(toBN(3)).toString()}
        total payout tokens: ${data.payoutTokens.toString()}`, async () => {
        // Setting up a new token and colony
        const tokenArgs = getTokenArgs();
        const newToken = await Token.new(...tokenArgs);
        let { logs } = await colonyNetwork.createColony(newToken.address);
        const { colonyAddress } = logs[0].args;
        await newToken.setOwner(colonyAddress);
        const newColony = await IColony.at(colonyAddress);

        // Adding tokens to reward pot with `fundColonyWithTokens`. (data.payoutTokens / 100) will end up in the reward pot
        const payoutTokenArgs = getTokenArgs();
        const payoutToken = await Token.new(...payoutTokenArgs);
        await fundColonyWithTokens(newColony, payoutToken, data.payoutTokens.toString());
        // Minting colony's native token so they can be given to users - see next line
        await newColony.mintTokens(data.totalReputationAndTokens.toString());

        // Giving colony's native tokens to 3 users.
        // Every user has equal amount of reputation and tokens (totalReputationAndTokens / 3)
        const userReputation = data.totalReputationAndTokens.div(toBN(3));
        await newColony.bootstrapColony(
          [userAddress1, userAddress2, userAddress3],
          [userReputation.toString(), userReputation.toString(), userReputation.toString()]
        );

        // This will allow token locking contract to sent tokens on users behalf
        await newToken.approve(tokenLocking.address, userReputation.toString(), {
          from: userAddress1
        });
        await newToken.approve(tokenLocking.address, userReputation.toString(), {
          from: userAddress2
        });
        await newToken.approve(tokenLocking.address, userReputation.toString(), {
          from: userAddress3
        });

        // Send tokens to token locking contract.
        await tokenLocking.deposit(newToken.address, userReputation.toString(), {
          from: userAddress1
        });
        await tokenLocking.deposit(newToken.address, userReputation.toString(), {
          from: userAddress2
        });
        await tokenLocking.deposit(newToken.address, userReputation.toString(), {
          from: userAddress3
        });

        ({ logs } = await newColony.startNextRewardPayout(payoutToken.address));
        const payoutId = logs[0].args.id.toNumber();

        // Getting total amount available for payout
        const rewardPayoutInfo = await newColony.getRewardPayoutInfo(payoutId);
        const amount = rewardPayoutInfo[2];

        // Get users locked token amount from token locking contract
        const userLockedTokens = await tokenLocking.getUserDepositedBalance.call(newToken.address, userAddress1);

        // Calculating the reward payout for one user locally to check against on-chain result
        const numerator = bnSqrt(userLockedTokens.mul(userReputation));
        const denominator = bnSqrt(data.totalReputationAndTokens.mul(data.totalReputationAndTokens));
        const factor = toBN(10).pow(toBN(100));
        const a = numerator.mul(factor).div(denominator);
        const reward = amount.mul(a).div(factor);

        // Calculating square roots locally, to avoid big gas costs. This can be proven on chain easily
        const userReputationSqrt = bnSqrt(userReputation);
        const userTokensSqrt = bnSqrt(userLockedTokens);
        const totalTokensSqrt = bnSqrt(data.totalReputationAndTokens);
        const totalReputationSqrt = bnSqrt(data.totalReputationAndTokens);
        const numeratorSqrt = bnSqrt(numerator);
        const denominatorSqrt = bnSqrt(denominator);
        const amountSqrt = bnSqrt(amount);

        const squareRoots = [
          userReputationSqrt.toString(),
          userTokensSqrt.toString(),
          totalTokensSqrt.toString(),
          totalReputationSqrt.toString(),
          numeratorSqrt.toString(),
          denominatorSqrt.toString(),
          amountSqrt.toString()
        ];

        await newColony.claimRewardPayout(payoutId.toString(), squareRoots, userReputation.toString(), data.totalReputationAndTokens.toString(), {
          from: userAddress1
        });

        const remainingAfterClaim1 = await newColony.getPotBalance(0, payoutToken.address);

        const solidityReward = amount.sub(remainingAfterClaim1);
        console.log("\nCorrect (Javascript): ", reward.toString());
        console.log("Approximation (Solidity): ", solidityReward.toString());

        console.log(
          "Percentage Wrong: ",
          solidityReward
            .minus(reward)
            .div(reward)
            .times(100)
            .toString(),
          "%"
        );
        console.log("Absolute Wrong: ", solidityReward.sub(reward).toString(), "\n");

        console.log("Total Amount: ", amount.toString());
        console.log("Remaining after claim 1: ", remainingAfterClaim1.toString());

        await newColony.claimRewardPayout(payoutId, squareRoots, userReputation.toString(), data.totalReputationAndTokens.toString(), {
          from: userAddress2
        });

        const remainingAfterClaim2 = await newColony.getPotBalance(0, payoutToken.address);

        console.log("Remaining after claim 2: ", remainingAfterClaim2.toString());

        await newColony.claimRewardPayout(payoutId.toString(), squareRoots, userReputation.toString(), data.totalReputationAndTokens.toString(), {
          from: userAddress3
        });

        const remainingAfterClaim3 = await newColony.getPotBalance(0, payoutToken.address);

        console.log("Remaining after claim 3: ", remainingAfterClaim3.toString());
      })
    );
  });
});
