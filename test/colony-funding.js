/* globals artifacts */

import { toBN, sha3 } from "web3-utils";

import { MANAGER_ROLE, EVALUATOR_ROLE, WORKER_ROLE, WORKER_PAYOUT, INITIAL_FUNDING } from "../helpers/constants";
import { getTokenArgs, checkErrorRevert, web3GetBalance, forwardTime, currentBlockTime, bnSqrt } from "../helpers/test-helper";
import { fundColonyWithTokens, setupRatedTask, executeSignedTaskChange, executeSignedRoleAssignment, makeTask } from "../helpers/test-data-generator";

const EtherRouter = artifacts.require("EtherRouter");
const IColony = artifacts.require("IColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const Token = artifacts.require("Token");
const ITokenLocking = artifacts.require("ITokenLocking");
const DSRoles = artifacts.require("DSRoles");

contract("Colony Funding", accounts => {
  const MANAGER = accounts[0];
  const EVALUATOR = accounts[1];
  const WORKER = accounts[2];

  let colony;
  let token;
  let otherToken;
  let colonyNetwork;
  let tokenLocking;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await ITokenLocking.at(tokenLockingAddress);
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
      let colonyRewardPotBalance = await colony.getPotBalance(0, otherToken.address);
      let colonyPotBalance = await colony.getPotBalance(1, otherToken.address);
      let colonyTokenBalance = await otherToken.balanceOf(colony.address);
      assert.equal(colonyTokenBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 0);
      assert.equal(colonyRewardPotBalance.toNumber(), 0);
      await colony.claimColonyFunds(otherToken.address);
      colonyRewardPotBalance = await colony.getPotBalance(0, otherToken.address);
      colonyPotBalance = await colony.getPotBalance(1, otherToken.address);
      colonyTokenBalance = await otherToken.balanceOf(colony.address);
      assert.equal(colonyTokenBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 99);
      assert.equal(colonyRewardPotBalance.toNumber(), 1);
    });

    it("should not put its own tokens in to the reward pot", async () => {
      await fundColonyWithTokens(colony, token, 100);
      const colonyRewardPotBalance = await colony.getPotBalance(0, token.address);
      const colonyPotBalance = await colony.getPotBalance(1, token.address);
      const colonyTokenBalance = await token.balanceOf(colony.address);
      assert.equal(colonyTokenBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 100);
      assert.equal(colonyRewardPotBalance.toNumber(), 0);
    });

    it("should let tokens be moved between pots", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await makeTask({ colony });
      await colony.moveFundsBetweenPots(1, 2, 51, otherToken.address);
      const colonyPotBalance = await colony.getPotBalance(1, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf(colony.address);
      const pot2Balance = await colony.getPotBalance(2, otherToken.address);
      assert.equal(colonyTokenBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 48);
      assert.equal(pot2Balance.toNumber(), 51);
    });

    it("should not let tokens be moved from the pot for payouts to token holders", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await makeTask({ colony });

      await checkErrorRevert(colony.moveFundsBetweenPots(0, 2, 1, otherToken.address), "colonyFunding-cannot-move-funds-from-pot-0");
      const colonyPotBalance = await colony.getPotBalance(1, otherToken.address);
      const colonyRewardPotBalance = await colony.getPotBalance(0, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf(colony.address);
      const pot2Balance = await colony.getPotBalance(2, otherToken.address);
      assert.equal(colonyTokenBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 99);
      assert.equal(pot2Balance.toNumber(), 0);
      assert.equal(colonyRewardPotBalance.toNumber(), 1);
    });

    it("should not let tokens be moved by non-admins", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await makeTask({ colony });
      await checkErrorRevert(colony.moveFundsBetweenPots(1, 2, 51, otherToken.address, { from: EVALUATOR }));
      const colonyPotBalance = await colony.getPotBalance(1, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf(colony.address);
      const pot2Balance = await colony.getPotBalance(2, otherToken.address);
      assert.equal(colonyTokenBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 99);
      assert.equal(pot2Balance.toNumber(), 0);
    });

    it("should not allow more tokens to leave a pot than the pot has (even if the colony has that many)", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await makeTask({ colony });
      await makeTask({ colony });
      await colony.moveFundsBetweenPots(1, 2, 40, otherToken.address);

      await checkErrorRevert(colony.moveFundsBetweenPots(2, 3, 50, otherToken.address));
      const colonyPotBalance = await colony.getPotBalance(1, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf(colony.address);
      const pot2Balance = await colony.getPotBalance(2, otherToken.address);
      const pot3Balance = await colony.getPotBalance(3, otherToken.address);
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
      //
      // NB Also that since we can no longer reduce the pot to below the budget,
      // scenarios 7, 9, 13 should revert.
      await fundColonyWithTokens(colony, otherToken, 100);
      const taskId = await makeTask({ colony });
      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });
      // Pot 0, Payout 0
      // Pot was equal to payout, transition to pot being equal by changing payout (18)
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskManagerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 0]
      });
      let task = await colony.getTask(taskId);
      assert.equal(task[5].toNumber(), 0);

      // Pot 0, Payout 0
      // Pot was equal to payout, transition to pot being equal by changing pot (17)
      await colony.moveFundsBetweenPots(1, 2, 0, otherToken.address);
      task = await colony.getTask(taskId);
      assert.equal(task[5].toNumber(), 0);

      // Pot 0, Payout 0
      // Pot was equal to payout, transition to pot being lower by increasing payout (8)
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskManagerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 40]
      });
      task = await colony.getTask(taskId);
      assert.equal(task[5].toNumber(), 1);

      // Pot 0, Payout 40
      // Pot was below payout, transition to being equal by increasing pot (1)
      await colony.moveFundsBetweenPots(1, 2, 40, otherToken.address);
      task = await colony.getTask(taskId);
      assert.equal(task[5].toNumber(), 0);

      // Pot 40, Payout 40
      // Pot was equal to payout, transition to being above by increasing pot (5)
      await colony.moveFundsBetweenPots(1, 2, 40, otherToken.address);
      task = await colony.getTask(taskId);
      assert.equal(task[5].toNumber(), 0);

      // Pot 80, Payout 40
      // Pot was above payout, transition to being equal by increasing payout (12)
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskManagerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 80]
      });
      task = await colony.getTask(taskId);
      assert.equal(task[5].toNumber(), 0);

      // Pot 80, Payout 80
      // Pot was equal to payout, transition to being above by decreasing payout (6)
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskManagerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 40]
      });
      task = await colony.getTask(taskId);
      assert.equal(task[5].toNumber(), 0);

      // Pot 80, Payout 40
      // Pot was above payout, transition to being equal by decreasing pot (11)
      await colony.moveFundsBetweenPots(2, 1, 40, otherToken.address);
      task = await colony.getTask(taskId);
      assert.equal(task[5].toNumber(), 0);

      // Pot 40, Payout 40
      // Pot was equal to payout, transition to pot being below payout by changing pot (7)
      await checkErrorRevert(colony.moveFundsBetweenPots(2, 1, 20, otherToken.address), "colony-funding-task-bad-state");

      // Remove 20 from pot
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskManagerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 20]
      });
      await colony.moveFundsBetweenPots(2, 1, 20, otherToken.address);
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskManagerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 40]
      });

      // Pot 20, Payout 40
      // Pot was below payout, change to being above by changing pot (3)
      await colony.moveFundsBetweenPots(1, 2, 60, otherToken.address);
      task = await colony.getTask(taskId);
      assert.equal(task[5].toNumber(), 0);

      // Pot 80, Payout 40
      // Pot was above payout, change to being below by changing pot (9)
      await checkErrorRevert(colony.moveFundsBetweenPots(2, 1, 60, otherToken.address), "colony-funding-task-bad-state");

      // Remove 60 from pot
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskManagerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 20]
      });
      await colony.moveFundsBetweenPots(2, 1, 60, otherToken.address);
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskManagerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 40]
      });

      // Pot 20, Payout 40
      // Pot was below payout, change to being above by changing payout (4)
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskManagerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 10]
      });
      task = await colony.getTask(taskId);
      assert.equal(task[5].toNumber(), 0);

      // Pot 20, Payout 10
      // Pot was above, change to being above by changing payout (16)
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskManagerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 5]
      });
      task = await colony.getTask(taskId);
      assert.equal(task[5].toNumber(), 0);

      // Pot 20, Payout 5
      // Pot was above, change to being above by changing pot (15)
      await colony.moveFundsBetweenPots(2, 1, 10, otherToken.address);
      task = await colony.getTask(taskId);
      assert.equal(task[5].toNumber(), 0);

      // Pot 10, Payout 5
      // Pot was above payout, change to being below by changing payout (10)
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskManagerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 40]
      });
      task = await colony.getTask(taskId);
      assert.equal(task[5].toNumber(), 1);

      // Pot 10, Payout 40
      // Pot was below payout, change to being below by changing payout (14)
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskManagerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 30]
      });
      task = await colony.getTask(taskId);
      assert.equal(task[5].toNumber(), 1);

      // Pot 10, Payout 30
      // Pot was below payout, change to being below by changing pot (13)
      await checkErrorRevert(colony.moveFundsBetweenPots(2, 1, 5, otherToken.address), "colony-funding-task-bad-state");

      // Remove 5 from pot
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskManagerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 5]
      });
      await colony.moveFundsBetweenPots(2, 1, 5, otherToken.address);
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskManagerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 30]
      });

      // Pot 5, Payout 30
      // Pot was below payout, change to being equal by changing payout (2)
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskManagerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 5]
      });
      task = await colony.getTask(taskId);
      assert.equal(task[5].toNumber(), 0);

      // Pot 5, Payout 5
    });

    it("should pay fees on revenue correctly", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await fundColonyWithTokens(colony, otherToken, 200);
      const colonyPotBalance = await colony.getPotBalance(1, otherToken.address);
      const colonyRewardPotBalance = await colony.getPotBalance(0, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf(colony.address);
      assert.equal(colonyTokenBalance.toNumber(), 300);
      assert.equal(colonyRewardPotBalance.toNumber(), 3);
      assert.equal(colonyPotBalance.toNumber(), 297);
    });

    it("should not allow contributions to nonexistent pots", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await checkErrorRevert(colony.moveFundsBetweenPots(1, 5, 40, otherToken.address));
      const colonyPotBalance = await colony.getPotBalance(1, otherToken.address);
      assert.equal(colonyPotBalance.toNumber(), 99);
    });

    it("should not allow funds to be removed from a task with payouts to go", async () => {
      await fundColonyWithTokens(colony, otherToken, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token: otherToken });
      await colony.finalizeTask(taskId);
      await checkErrorRevert(colony.moveFundsBetweenPots(2, 1, 40, otherToken.address), "colony-funding-task-bad-state");
      const colonyPotBalance = await colony.getPotBalance(2, otherToken.address);
      assert.isTrue(colonyPotBalance.eq(toBN(350 * 1e18)));
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

      const colonyPotBalance = await colony.getPotBalance(2, otherToken.address);
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

      await colony.claimPayout(taskId, MANAGER_ROLE, token.address);
      await colony.claimPayout(taskId, EVALUATOR_ROLE, token.address, { from: EVALUATOR });
      await colony.claimPayout(taskId, WORKER_ROLE, token.address, { from: WORKER });

      const taskInfo = await colony.getTask(taskId);
      const taskPotId = taskInfo[6].toNumber();
      const remainingPotBalance = await colony.getPotBalance(taskPotId, token.address);
      assert.equal(remainingPotBalance.toString(), WORKER_PAYOUT.toString(), "should have remaining pot balance equal to worker payout");

      await colony.moveFundsBetweenPots(taskPotId, 1, remainingPotBalance.toString(), token.address);

      const potBalance = await colony.getPotBalance(taskPotId, token.address);
      assert.equal(potBalance, 0, "should have pot balance of 0");
    });
  });

  describe("when receiving ether", () => {
    it("should not put the ether straight in to the pot", async () => {
      await colony.send(100);
      let colonyPotBalance = await colony.getPotBalance(1, 0x0);
      let colonyEtherBalance = await web3GetBalance(colony.address);
      let colonyRewardBalance = await colony.getPotBalance(0, 0x0);
      assert.equal(colonyEtherBalance, 100);
      assert.isTrue(colonyPotBalance.isZero());
      await colony.claimColonyFunds(0x0);
      colonyPotBalance = await colony.getPotBalance(1, 0x0);
      colonyEtherBalance = await web3GetBalance(colony.address);
      colonyRewardBalance = await colony.getPotBalance(0, 0x0);
      assert.equal(colonyEtherBalance, 100);
      assert.equal(colonyRewardBalance.toNumber(), 1);
      assert.equal(colonyPotBalance.toNumber(), 99);
    });

    it("should let ether be moved between pots", async () => {
      await colony.send(100);
      await colony.claimColonyFunds(0x0);
      await makeTask({ colony });
      await colony.moveFundsBetweenPots(1, 2, 51, 0x0);
      const colonyPotBalance = await colony.getPotBalance(1, 0x0);
      const colonyEtherBalance = await web3GetBalance(colony.address);
      const pot2Balance = await colony.getPotBalance(2, 0x0);
      assert.equal(colonyEtherBalance, 100);
      assert.equal(colonyPotBalance.toNumber(), 48);
      assert.equal(pot2Balance.toNumber(), 51);
    });

    it("should not allow more ether to leave a pot than the pot has (even if the colony has that many)", async () => {
      await colony.send(100);
      await colony.claimColonyFunds(0x0);
      await makeTask({ colony });
      await makeTask({ colony });
      await colony.moveFundsBetweenPots(1, 2, 40, 0x0);

      await checkErrorRevert(colony.moveFundsBetweenPots(2, 3, 50, 0x0));
      const colonyEtherBalance = await web3GetBalance(colony.address);
      const colonyPotBalance = await colony.getPotBalance(1, 0x0);
      const pot2Balance = await colony.getPotBalance(2, 0x0);
      const pot3Balance = await colony.getPotBalance(3, 0x0);
      assert.equal(colonyEtherBalance, 100);
      assert.equal(colonyPotBalance.toNumber(), 59);
      assert.equal(pot2Balance.toNumber(), 40);
      assert.equal(pot3Balance.toNumber(), 0);
    });

    it("should correctly track if we are able to make ether payouts", async () => {
      await colony.send(100);
      await colony.claimColonyFunds(0x0);
      const taskId = await makeTask({ colony });
      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      // Set manager payout above pot value 40 > 0
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskManagerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, 0x0, 40]
      });
      let task = await colony.getTask(taskId);
      assert.equal(task[5].toNumber(), 1);

      // Fund the pot equal to manager payout 40 = 40
      await colony.moveFundsBetweenPots(1, 2, 40, 0x0);
      task = await colony.getTask(taskId);
      assert.equal(task[5].toNumber(), 0);

      // Cannot bring pot balance below current payout
      await checkErrorRevert(colony.moveFundsBetweenPots(2, 1, 30, 0x0), "colony-funding-task-bad-state");

      // Set manager payout above pot value 50 > 40
      await executeSignedTaskChange({
        colony,
        functionName: "setTaskManagerPayout",
        taskId,
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, 0x0, 50]
      });
      task = await colony.getTask(taskId);
      assert.equal(task[5].toNumber(), 1);

      // Fund the pot equal to manager payout, plus 10, 50 < 60
      await colony.moveFundsBetweenPots(1, 2, 20, 0x0);
      task = await colony.getTask(taskId);
      assert.equal(task[5].toNumber(), 0);

      // Cannot bring pot balance below current payout
      await checkErrorRevert(colony.moveFundsBetweenPots(2, 1, 30, 0x0), "colony-funding-task-bad-state");

      // Can remove surplus 50 = 50
      await colony.moveFundsBetweenPots(2, 1, 10, 0x0);
      task = await colony.getTask(taskId);
      assert.equal(task[5].toNumber(), 0);
    });

    it("should pay fees on revenue correctly", async () => {
      await colony.send(100);
      await colony.claimColonyFunds(0x0);
      await colony.send(200);
      await colony.claimColonyFunds(0x0);
      const colonyPotBalance = await colony.getPotBalance(1, 0x0);
      const colonyRewardPotBalance = await colony.getPotBalance(0, 0x0);
      const colonyEtherBalance = await web3GetBalance(colony.address);
      const nonRewardPotsTotal = await colony.getNonRewardPotsTotal(0x0);
      assert.equal(colonyEtherBalance, 300);
      assert.equal(colonyPotBalance.toNumber(), 297);
      assert.equal(colonyRewardPotBalance.toNumber(), 3);
      assert.equal(nonRewardPotsTotal.toNumber(), 297);
    });
  });

  describe("when creating reward payouts", async () => {
    const initialFunding = toBN(100 * 1e18);
    const userReputation = toBN(50 * 1e18);
    const userTokens = toBN(userReputation);
    const totalReputation = toBN(userReputation);
    const totalTokens = toBN(userReputation);

    const userAddress1 = accounts[0];
    const userAddress2 = accounts[1];
    const userAddress3 = accounts[2];
    let initialSquareRoots;

    beforeEach(async () => {
      await fundColonyWithTokens(colony, otherToken, initialFunding.toString());
      await colony.mintTokens(initialFunding.toString());
      await colony.bootstrapColony([userAddress1], [userReputation.toString()]);

      await token.approve(tokenLocking.address, userReputation.toString(), {
        from: userAddress1
      });

      await tokenLocking.deposit(token.address, userReputation.toString(), {
        from: userAddress1
      });

      const userReputationSqrt = bnSqrt(userReputation);
      const userTokensSqrt = bnSqrt(userTokens);

      const totalReputationSqrt = bnSqrt(totalReputation, true);
      const totalTokensSqrt = bnSqrt(totalTokens, true);

      const numeratorSqrt = bnSqrt(userReputationSqrt.mul(userReputationSqrt));
      const denominatorSqrt = bnSqrt(totalReputationSqrt.mul(totalTokensSqrt), true);

      // Total amount that will be paid out
      const balance = await colony.getPotBalance(0, otherToken.address);
      const totalAmountSqrt = bnSqrt(balance);

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

    it("should not be able to start a reward payout if no one holds colony tokens", async () => {
      const tokenArgs = getTokenArgs();
      const newToken = await Token.new(...tokenArgs);
      const { logs } = await colonyNetwork.createColony(newToken.address);
      const { colonyAddress } = logs[0].args;
      const newColony = await IColony.at(colonyAddress);

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

      const tx1 = await colony.startNextRewardPayout(newToken.address);
      const payoutId1 = tx1.logs[0].args.id;

      const tx2 = await colony.startNextRewardPayout(otherToken.address);
      const payoutId2 = tx2.logs[0].args.id;

      await colony.claimRewardPayout(payoutId1, initialSquareRoots, userReputation.toString(), totalReputation.toString(), {
        from: userAddress1
      });

      await colony.claimRewardPayout(payoutId2, initialSquareRoots, userReputation.toString(), totalReputation.toString(), {
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
      await token.transfer(colony.address, userReputation3.toString(), {
        from: userAddress3
      });

      const { logs } = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = logs[0].args.id;

      const userReputation3Sqrt = bnSqrt(userReputation3);
      const totalReputationSqrt = bnSqrt(userReputation.add(userReputation3));
      const totalTokensSqrt = bnSqrt(totalTokens);

      const denominatorSqrt = bnSqrt(userTokens.mul(userReputation.add(userReputation3)));
      const balance = await colony.getPotBalance(0, otherToken.address);
      const amountAvailableForPayoutSqrt = bnSqrt(balance);

      const squareRoots = [
        userReputation3Sqrt.toString(),
        0,
        totalReputationSqrt.toString(),
        totalTokensSqrt.toString(),
        0,
        denominatorSqrt.toString(),
        amountAvailableForPayoutSqrt.toString()
      ];

      await checkErrorRevert(
        colony.claimRewardPayout(payoutId, squareRoots, userReputation3.toString(), totalReputation.toString(), {
          from: userAddress3
        }),
        "colony-reward-payout-invalid-user-tokens"
      );
    });

    it("should not be able to claim tokens if user does not have any reputation", async () => {
      const userTokens3 = toBN(1e3);

      await colony.bootstrapColony([userAddress1], [userTokens3]);

      await token.transfer(userAddress3, userTokens3.toString(), {
        from: userAddress1
      });

      await token.approve(tokenLocking.address, userTokens3.toString(), {
        from: userAddress3
      });

      await tokenLocking.deposit(token.address, userTokens3.toString(), {
        from: userAddress3
      });

      const { logs } = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = logs[0].args.id;

      const userTokens3Sqrt = bnSqrt(userTokens3);
      const totalReputationSqrt = bnSqrt(totalReputation.add(userTokens3), true);
      const totalTokensSqrt = bnSqrt(userTokens.add(userTokens3), true);
      const denominatorSqrt = bnSqrt(totalReputationSqrt.mul(totalTokensSqrt), true);
      const balance = await colony.getPotBalance(0, otherToken.address);
      const amountAvailableForPayoutSqrt = bnSqrt(balance);

      const squareRoots = [
        0,
        userTokens3Sqrt.toString(),
        totalReputationSqrt.toString(),
        totalTokensSqrt.toString(),
        0,
        denominatorSqrt.toString(),
        amountAvailableForPayoutSqrt.toString()
      ];

      await checkErrorRevert(
        colony.claimRewardPayout(payoutId, squareRoots, 0, totalReputation.toString(), {
          from: userAddress3
        }),
        "colony-reward-payout-invalid-user-reputation"
      );
    });

    it("should be able to withdraw tokens after claiming the reward", async () => {
      const { logs } = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = logs[0].args.id;

      await colony.claimRewardPayout(payoutId, initialSquareRoots, userReputation.toString(), totalReputation.toString(), {
        from: userAddress1
      });

      await tokenLocking.withdraw(token.address, userReputation.toString(), {
        from: userAddress1
      });

      const balance = await token.balanceOf(userAddress1);
      assert.equal(balance.toString(), userReputation.toString());
    });

    it("should not be able to claim tokens after the payout period has expired", async () => {
      const { logs } = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = logs[0].args.id;

      await forwardTime(5184001, this);
      await checkErrorRevert(
        colony.claimRewardPayout(payoutId, initialSquareRoots, userReputation.toString(), totalReputation.toString(), {
          from: userAddress1
        }),
        "colony-reward-payout-not-active"
      );
    });

    it("should be able to waive the payout", async () => {
      const { logs } = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = logs[0].args.id;

      await tokenLocking.incrementLockCounterTo(token.address, payoutId, {
        from: userAddress1
      });

      await checkErrorRevert(
        colony.claimRewardPayout(payoutId.toString(), initialSquareRoots, userReputation.toString(), totalReputation.toString(), {
          from: userAddress1
        }),
        "colony-reward-payout-already-claimed-or-waived"
      );
    });

    it("should not be able to claim funds if previous payout is not claimed", async () => {
      await colony.startNextRewardPayout(otherToken.address);

      const { logs } = await colony.startNextRewardPayout(token.address);
      const payoutId2 = logs[0].args.id;

      await checkErrorRevert(
        colony.claimRewardPayout(payoutId2, initialSquareRoots, userReputation.toString(), totalReputation.toString(), {
          from: userAddress1
        }),
        "colony-reward-payout-bad-id"
      );
    });

    it("should not be able to claim payout if squareRoots are not valid", async () => {
      const tx = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = tx.logs[0].args.id;

      const errorMessages = [
        "colony-reward-payout-invalid-parameter-user-reputation",
        "colony-reward-payout-invalid-parameter-user-token",
        "colony-reward-payout-invalid-parameter-total-reputation",
        "colony-reward-payout-invalid-parameter-total-tokens",
        "colony-reward-payout-invalid-parameter-numerator",
        "colony-reward-payout-invalid-parameter-denominator",
        "colony-reward-payout-invalid-parameter-amountAvailableForPayout"
      ];

      const promises = initialSquareRoots.map((param, i) => {
        const squareRoots = [...initialSquareRoots];
        // If we are passing total reputation, total tokens or denominator, we will divide by 2, else multiply
        const functionName = [2, 3, 5].includes(i) ? "div" : "mul";
        squareRoots[i] = toBN(squareRoots[i])
          [functionName](toBN(2))
          .toString();

        return checkErrorRevert(
          colony.claimRewardPayout(payoutId, squareRoots, userReputation.toString(), totalReputation.toString(), {
            from: userAddress1
          }),
          errorMessages[i]
        );
      });

      await Promise.all(promises);
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

    it("should not be able to claim the same payout twice", async () => {
      const tx = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = tx.logs[0].args.id;

      await colony.claimRewardPayout(payoutId, initialSquareRoots, userReputation.toString(), totalReputation.toString(), {
        from: userAddress1
      });

      await checkErrorRevert(
        colony.claimRewardPayout(payoutId, initialSquareRoots, userReputation.toString(), totalReputation.toString(), {
          from: userAddress1
        }),
        "token-locking-invalid-lock-id"
      );
    });

    it("should be able to collect payout from two colonies at the same time", async () => {
      // Setting up a new token and two colonies
      const tokenArgs = getTokenArgs();
      const newToken = await Token.new(...tokenArgs);

      let { logs } = await colonyNetwork.createColony(newToken.address);
      let { colonyAddress } = logs[0].args;
      const colony1 = await IColony.at(colonyAddress);

      ({ logs } = await colonyNetwork.createColony(newToken.address));
      ({ colonyAddress } = logs[0].args);
      const colony2 = await IColony.at(colonyAddress);

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
      await colony1.mintTokens(userReputation.toString());
      await colony2.mintTokens(userReputation.toString());

      // Giving the user colony's native tokens and reputation so they can participate in reward payout
      await colony1.bootstrapColony([userAddress1], [userReputation.toString()]);
      await colony2.bootstrapColony([userAddress1], [userReputation.toString()]);

      // This will allow token locking contract to sent tokens on users behalf
      await newToken.approve(tokenLocking.address, userReputation.toString(), {
        from: userAddress1
      });

      await tokenLocking.deposit(newToken.address, userReputation.toString(), {
        from: userAddress1
      });

      ({ logs } = await colony1.startNextRewardPayout(otherToken.address));
      const payoutId1 = logs[0].args.id;
      ({ logs } = await colony2.startNextRewardPayout(otherToken.address));
      const payoutId2 = logs[0].args.id;

      const userReputationSqrt = bnSqrt(userReputation);
      const userTokensSqrt = bnSqrt(userTokens);
      const totalReputationSqrt = bnSqrt(userReputation, true);
      // Both colony1 and colony2 are giving the user `userReputation` amount of tokens
      const totalTokensSqrt = bnSqrt(userReputation.mul(toBN(2)), true);
      const numeratorSqrt = bnSqrt(userReputationSqrt.mul(userTokensSqrt));
      const denominatorSqrt = bnSqrt(totalReputationSqrt.mul(totalTokensSqrt), true);
      const balance = await colony.getPotBalance(0, otherToken.address);
      const totalAmountAvailableForPayoutSqrt = bnSqrt(balance);

      const squareRoots = [
        userReputationSqrt.toString(),
        userTokensSqrt.toString(),
        totalReputationSqrt.toString(),
        totalTokensSqrt.toString(),
        numeratorSqrt.toString(),
        denominatorSqrt.toString(),
        totalAmountAvailableForPayoutSqrt.toString()
      ];

      await colony1.claimRewardPayout(payoutId1.toString(), squareRoots, userReputation.toString(), totalReputation.toString(), {
        from: userAddress1
      });

      await colony2.claimRewardPayout(payoutId2.toString(), squareRoots, userReputation.toString(), totalReputation.toString(), {
        from: userAddress1
      });

      let rewardPayoutInfo = await colony1.getRewardPayoutInfo(payoutId1);
      const amountAvailableForPayout1 = rewardPayoutInfo[2];
      rewardPayoutInfo = await colony2.getRewardPayoutInfo(payoutId2);
      const amountAvailableForPayout2 = rewardPayoutInfo[2];

      const rewardPotBalanceAfterClaimInPayout1 = await colony1.getPotBalance(0, otherToken.address);
      const rewardPotBalanceAfterClaimInPayout2 = await colony2.getPotBalance(0, otherToken.address);

      const claimInPayout1 = amountAvailableForPayout1.sub(rewardPotBalanceAfterClaimInPayout1);
      const claimInPayout2 = amountAvailableForPayout2.sub(rewardPotBalanceAfterClaimInPayout2);

      const userBalance = await otherToken.balanceOf(userAddress1);
      assert.equal(userBalance.toString(), claimInPayout1.add(claimInPayout2).toString());
    });

    it("should not be able to claim reward payout from a colony that didn't created it", async () => {
      // Setting up a new token and two colonies
      const tokenArgs = getTokenArgs();
      const newToken = await Token.new(...tokenArgs);

      let { logs } = await colonyNetwork.createColony(newToken.address);
      let { colonyAddress } = logs[0].args;
      const colony1 = await IColony.at(colonyAddress);

      ({ logs } = await colonyNetwork.createColony(newToken.address));
      ({ colonyAddress } = logs[0].args);
      const colony2 = await IColony.at(colonyAddress);

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
      await colony1.mintTokens(userReputation.toString());
      await colony2.mintTokens(userReputation.toString());

      // Giving the user colony's native tokens and reputation so they can participate in reward payout
      await colony1.bootstrapColony([userAddress1], [userReputation.toString()]);
      await colony2.bootstrapColony([userAddress1], [userReputation.toString()]);

      // This will allow token locking contract to sent tokens on users behalf
      await newToken.approve(tokenLocking.address, userReputation.toString(), {
        from: userAddress1
      });

      await tokenLocking.deposit(newToken.address, userReputation.toString(), {
        from: userAddress1
      });

      ({ logs } = await colony1.startNextRewardPayout(otherToken.address));
      const payoutId1 = logs[0].args.id;
      await colony2.startNextRewardPayout(otherToken.address);

      const userReputationSqrt = bnSqrt(userReputation);
      const userTokensSqrt = bnSqrt(userTokens);
      const totalReputationSqrt = bnSqrt(userReputation, true);
      // Both colony1 and colony2 are giving the user `userReputation` amount of tokens
      const totalTokensSqrt = bnSqrt(userReputation.mul(toBN(2)), true);
      const numeratorSqrt = bnSqrt(userReputationSqrt.mul(userTokensSqrt));
      const denominatorSqrt = bnSqrt(totalReputationSqrt.mul(totalTokensSqrt), true);
      const balance = await colony.getPotBalance(0, otherToken.address);
      const totalAmountAvailableForPayoutSqrt = bnSqrt(balance);

      const squareRoots = [
        userReputationSqrt.toString(),
        userTokensSqrt.toString(),
        totalReputationSqrt.toString(),
        totalTokensSqrt.toString(),
        numeratorSqrt.toString(),
        denominatorSqrt.toString(),
        totalAmountAvailableForPayoutSqrt.toString()
      ];

      await checkErrorRevert(
        colony2.claimRewardPayout(payoutId1.toString(), squareRoots, userReputation.toString(), totalReputation.toString(), {
          from: userAddress1
        }),
        "colony-reward-payout-not-active"
      );
    });

    it("should return correct info about reward payout", async () => {
      const { logs } = await colony.startNextRewardPayout(otherToken.address);
      const payoutId = logs[0].args.id;

      const balance = await colony.getPotBalance(0, otherToken.address);
      const blockTimestamp = await currentBlockTime();
      const reputationRootHash = await colonyNetwork.getReputationRootHash();

      const info = await colony.getRewardPayoutInfo(payoutId);
      assert.equal(info[0], reputationRootHash);
      assert.equal(info[1].toString(), userTokens.toString());
      assert.equal(info[2].toString(), balance.toString());
      assert.equal(info[3].toString(), otherToken.address);
      assert.equal(info[4].toString(), blockTimestamp.toString());
    });

    const reputations = [
      {
        totalReputation: toBN(3),
        totalAmountOfPayoutTokens: toBN(90000000)
      },
      {
        totalReputation: toBN(30),
        totalAmountOfPayoutTokens: toBN(90000000)
      },
      {
        totalReputation: toBN(30000000000),
        totalAmountOfPayoutTokens: toBN(90000000000)
      },
      {
        totalReputation: toBN(3).mul(toBN(10).pow(toBN(76))),
        totalAmountOfPayoutTokens: toBN(9).mul(toBN(10).pow(toBN(76)))
      },
      {
        // This is highest possible value for colony-wide reputation that can be used for reward payouts
        totalReputation: bnSqrt(
          toBN(2)
            .pow(toBN(256))
            .sub(toBN(1))
        ).pow(toBN(2)),
        totalAmountOfPayoutTokens: toBN(2)
          .pow(toBN(256))
          .sub(toBN(1))
      }
    ];

    reputations.forEach(data =>
      it(`should calculate fairly precise reward payout for:
        user reputation/tokens: ${data.totalReputation.div(toBN(3)).toString()}
        total reputation/tokens: ${data.totalReputation.toString()}`, async () => {
        // Setting up a new token and colony
        const tokenArgs = getTokenArgs();
        const newToken = await Token.new(...tokenArgs);
        let { logs } = await colonyNetwork.createColony(newToken.address);
        const { colonyAddress } = logs[0].args;
        await newToken.setOwner(colonyAddress);
        const newColony = await IColony.at(colonyAddress);

        const payoutTokenArgs = getTokenArgs();
        const payoutToken = await Token.new(...payoutTokenArgs);
        await fundColonyWithTokens(newColony, payoutToken, data.totalAmountOfPayoutTokens.toString());
        // Issuing colony's native tokens so they can be given to users in `bootstrapColony`
        await newColony.mintTokens(data.totalReputation.toString());

        // Every user has equal amount of reputation and tokens (totalReputationAndTokens / 3)
        const reputationPerUser = data.totalReputation.div(toBN(3));
        const tokensPerUser = toBN(reputationPerUser);
        // Giving colony's native tokens to 3 users.
        await newColony.bootstrapColony(
          [userAddress1, userAddress2, userAddress3],
          [reputationPerUser.toString(), reputationPerUser.toString(), reputationPerUser.toString()]
        );

        // This will allow token locking contract to sent tokens on users behalf
        await newToken.approve(tokenLocking.address, tokensPerUser.toString(), {
          from: userAddress1
        });
        await newToken.approve(tokenLocking.address, tokensPerUser.toString(), {
          from: userAddress2
        });
        await newToken.approve(tokenLocking.address, tokensPerUser.toString(), {
          from: userAddress3
        });

        // Send tokens to token locking contract.
        await tokenLocking.deposit(newToken.address, tokensPerUser.toString(), {
          from: userAddress1
        });
        await tokenLocking.deposit(newToken.address, tokensPerUser.toString(), {
          from: userAddress2
        });
        await tokenLocking.deposit(newToken.address, tokensPerUser.toString(), {
          from: userAddress3
        });

        ({ logs } = await newColony.startNextRewardPayout(payoutToken.address));
        const payoutId = logs[0].args.id;

        // Getting total amount available for payout
        const amountAvailableForPayout = await newColony.getPotBalance(0, payoutToken.address);

        const totalSupply = await newToken.totalSupply();
        const colonyTokens = await newToken.balanceOf(newColony.address);
        // Transforming it to BN instance
        const totalTokensHeldByUsers = toBN(totalSupply.sub(colonyTokens));

        // Get users locked token amount from token locking contract
        const info = await tokenLocking.getUserLock(newToken.address, userAddress1);
        const userLockedTokens = info[1];

        // Calculating the reward payout for one user locally to check against on-chain result
        const numerator = bnSqrt(userLockedTokens.mul(reputationPerUser));
        const denominator = bnSqrt(totalTokensHeldByUsers.mul(data.totalReputation));
        const factor = toBN(10).pow(toBN(100));
        const percent = numerator.mul(factor).div(denominator);
        const reward = amountAvailableForPayout.mul(percent).div(factor);

        // Calculating square roots locally, to avoid big gas costs. This can be proven on chain easily
        const userReputationSqrt = bnSqrt(reputationPerUser);
        const userTokensSqrt = bnSqrt(userLockedTokens);
        const totalReputationSqrt = bnSqrt(data.totalReputation, true);
        const totalTokensSqrt = bnSqrt(totalTokensHeldByUsers, true);
        const numeratorSqrt = bnSqrt(numerator);
        const denominatorSqrt = bnSqrt(totalTokensSqrt.mul(totalReputationSqrt), true);
        const amountAvailableForPayoutSqrt = bnSqrt(amountAvailableForPayout);

        const squareRoots = [
          userReputationSqrt.toString(),
          userTokensSqrt.toString(),
          totalReputationSqrt.toString(),
          totalTokensSqrt.toString(),
          numeratorSqrt.toString(),
          denominatorSqrt.toString(),
          amountAvailableForPayoutSqrt.toString()
        ];

        await newColony.claimRewardPayout(payoutId, squareRoots, reputationPerUser.toString(), data.totalReputation.toString(), {
          from: userAddress1
        });

        const remainingAfterClaim1 = await newColony.getPotBalance(0, payoutToken.address);
        const user1BalanceAfterClaim = await payoutToken.balanceOf(userAddress1);
        assert.equal(user1BalanceAfterClaim.toString(), amountAvailableForPayout.sub(remainingAfterClaim1).toString());

        const solidityReward = amountAvailableForPayout.sub(remainingAfterClaim1);
        console.log("\nCorrect (Javascript): ", reward.toString());
        console.log("Approximation (Solidity): ", solidityReward.toString());

        console.log(
          "Percentage Wrong: ",
          solidityReward
            .sub(reward)
            .div(reward)
            .muln(100)
            .toString(),
          "%"
        );
        console.log("Absolute Wrong: ", solidityReward.sub(reward).toString(), "\n");

        console.log("Total Amount: ", amountAvailableForPayout.toString());
        console.log("Remaining after claim 1: ", remainingAfterClaim1.toString());

        await newColony.claimRewardPayout(payoutId, squareRoots, reputationPerUser.toString(), data.totalReputation.toString(), {
          from: userAddress2
        });

        const remainingAfterClaim2 = await newColony.getPotBalance(0, payoutToken.address);
        const user2BalanceAfterClaim = await payoutToken.balanceOf(userAddress1);
        assert.equal(
          user2BalanceAfterClaim.toString(),
          amountAvailableForPayout
            .sub(user1BalanceAfterClaim)
            .sub(remainingAfterClaim2)
            .toString()
        );

        console.log("Remaining after claim 2: ", remainingAfterClaim2.toString());

        await newColony.claimRewardPayout(payoutId, squareRoots, reputationPerUser.toString(), data.totalReputation.toString(), {
          from: userAddress3
        });

        const remainingAfterClaim3 = await newColony.getPotBalance(0, payoutToken.address);
        const user3BalanceAfterClaim = await payoutToken.balanceOf(userAddress1);
        assert.equal(
          user3BalanceAfterClaim.toString(),
          amountAvailableForPayout
            .sub(user1BalanceAfterClaim)
            .sub(user2BalanceAfterClaim)
            .sub(remainingAfterClaim3)
            .toString()
        );

        console.log("Remaining after claim 3: ", remainingAfterClaim3.toString());
      })
    );
  });
});
