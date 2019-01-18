/* globals artifacts */
import chai from "chai";
import bnChai from "bn-chai";

import {
  WAD,
  MANAGER_ROLE,
  EVALUATOR_ROLE,
  WORKER_ROLE,
  MANAGER_PAYOUT,
  EVALUATOR_PAYOUT,
  WORKER_PAYOUT,
  INITIAL_FUNDING,
  ZERO_ADDRESS
} from "../helpers/constants";

import { getTokenArgs, checkErrorRevert, web3GetBalance } from "../helpers/test-helper";

import {
  fundColonyWithTokens,
  setupFinalizedTask,
  executeSignedTaskChange,
  executeSignedRoleAssignment,
  makeTask,
  setupRandomColony
} from "../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const DSToken = artifacts.require("DSToken");

contract("Colony Funding", accounts => {
  const MANAGER = accounts[0];
  const EVALUATOR = MANAGER;
  const WORKER = accounts[2];

  let colony;
  let token;
  let otherToken;
  let colonyNetwork;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.setRewardInverse(100);

    const otherTokenArgs = getTokenArgs();
    otherToken = await DSToken.new(otherTokenArgs[0]);
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

    it("should syphon off own tokens in to the reward pot", async () => {
      await fundColonyWithTokens(colony, token, 100);
      const colonyRewardPotBalance = await colony.getPotBalance(0, token.address);
      const colonyPotBalance = await colony.getPotBalance(1, token.address);
      const colonyTokenBalance = await token.balanceOf(colony.address);
      assert.equal(colonyTokenBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 99);
      assert.equal(colonyRewardPotBalance.toNumber(), 1);
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

    it("should not let tokens be moved between the same pot", async () => {
      await fundColonyWithTokens(colony, otherToken, 1);
      await checkErrorRevert(colony.moveFundsBetweenPots(1, 1, 1, otherToken.address), "colony-funding-cannot-move-funds-between-the-same-pot");
      const colonyPotBalance = await colony.getPotBalance(1, otherToken.address);
      assert.equal(colonyPotBalance.toNumber(), 1, "should have a pot balance of 1");
    });

    it("should not let tokens be moved from the pot for payouts to token holders", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await makeTask({ colony });

      await checkErrorRevert(colony.moveFundsBetweenPots(0, 2, 1, otherToken.address), "colony-funding-cannot-move-funds-from-rewards-pot");
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
      await checkErrorRevert(colony.moveFundsBetweenPots(1, 2, 51, otherToken.address, { from: WORKER }), "ds-auth-unauthorized");
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

      await checkErrorRevert(colony.moveFundsBetweenPots(2, 3, 50, otherToken.address), "colony-funding-task-bad-state");
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
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 0]
      });
      let task = await colony.getTask(taskId);
      assert.equal(task[4].toNumber(), 0);

      // Pot 0, Payout 0
      // Pot was equal to payout, transition to pot being equal by changing pot (17)
      await colony.moveFundsBetweenPots(1, 2, 0, otherToken.address);
      task = await colony.getTask(taskId);
      assert.equal(task[4].toNumber(), 0);

      // Pot 0, Payout 0
      // Pot was equal to payout, transition to pot being lower by increasing payout (8)
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 40]
      });
      task = await colony.getTask(taskId);
      assert.equal(task[4].toNumber(), 1);

      // Pot 0, Payout 40
      // Pot was below payout, transition to being equal by increasing pot (1)
      await colony.moveFundsBetweenPots(1, 2, 40, otherToken.address);
      task = await colony.getTask(taskId);
      assert.equal(task[4].toNumber(), 0);

      // Pot 40, Payout 40
      // Pot was equal to payout, transition to being above by increasing pot (5)
      await colony.moveFundsBetweenPots(1, 2, 40, otherToken.address);
      task = await colony.getTask(taskId);
      assert.equal(task[4].toNumber(), 0);

      // Pot 80, Payout 40
      // Pot was above payout, transition to being equal by increasing payout (12)
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 80]
      });
      task = await colony.getTask(taskId);
      assert.equal(task[4].toNumber(), 0);

      // Pot 80, Payout 80
      // Pot was equal to payout, transition to being above by decreasing payout (6)
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 40]
      });
      task = await colony.getTask(taskId);
      assert.equal(task[4].toNumber(), 0);

      // Pot 80, Payout 40
      // Pot was above payout, transition to being equal by decreasing pot (11)
      await colony.moveFundsBetweenPots(2, 1, 40, otherToken.address);
      task = await colony.getTask(taskId);
      assert.equal(task[4].toNumber(), 0);

      // Pot 40, Payout 40
      // Pot was equal to payout, transition to pot being below payout by changing pot (7)
      await checkErrorRevert(colony.moveFundsBetweenPots(2, 1, 20, otherToken.address), "colony-funding-task-bad-state");

      // Remove 20 from pot
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 20]
      });
      await colony.moveFundsBetweenPots(2, 1, 20, otherToken.address);
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 40]
      });

      // Pot 20, Payout 40
      // Pot was below payout, change to being above by changing pot (3)
      await colony.moveFundsBetweenPots(1, 2, 60, otherToken.address);
      task = await colony.getTask(taskId);
      assert.equal(task[4].toNumber(), 0);

      // Pot 80, Payout 40
      // Pot was above payout, change to being below by changing pot (9)
      await checkErrorRevert(colony.moveFundsBetweenPots(2, 1, 60, otherToken.address), "colony-funding-task-bad-state");

      // Remove 60 from pot
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 20]
      });
      await colony.moveFundsBetweenPots(2, 1, 60, otherToken.address);
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 40]
      });

      // Pot 20, Payout 40
      // Pot was below payout, change to being above by changing payout (4)
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 10]
      });
      task = await colony.getTask(taskId);
      assert.equal(task[4].toNumber(), 0);

      // Pot 20, Payout 10
      // Pot was above, change to being above by changing payout (16)
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 5]
      });
      task = await colony.getTask(taskId);
      assert.equal(task[4].toNumber(), 0);

      // Pot 20, Payout 5
      // Pot was above, change to being above by changing pot (15)
      await colony.moveFundsBetweenPots(2, 1, 10, otherToken.address);
      task = await colony.getTask(taskId);
      assert.equal(task[4].toNumber(), 0);

      // Pot 10, Payout 5
      // Pot was above payout, change to being below by changing payout (10)
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 40]
      });
      task = await colony.getTask(taskId);
      assert.equal(task[4].toNumber(), 1);

      // Pot 10, Payout 40
      // Pot was below payout, change to being below by changing payout (14)
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 30]
      });
      task = await colony.getTask(taskId);
      assert.equal(task[4].toNumber(), 1);

      // Pot 10, Payout 30
      // Pot was below payout, change to being below by changing pot (13)
      await checkErrorRevert(colony.moveFundsBetweenPots(2, 1, 5, otherToken.address), "colony-funding-task-bad-state");

      // Remove 5 from pot
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 5]
      });
      await colony.moveFundsBetweenPots(2, 1, 5, otherToken.address);
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 30]
      });

      // Pot 5, Payout 30
      // Pot was below payout, change to being equal by changing payout (2)
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 5]
      });
      task = await colony.getTask(taskId);
      assert.equal(task[4].toNumber(), 0);

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
      await checkErrorRevert(colony.moveFundsBetweenPots(1, 5, 40, otherToken.address), "colony-funding-nonexistent-pot");
      const colonyPotBalance = await colony.getPotBalance(1, otherToken.address);
      assert.equal(colonyPotBalance.toNumber(), 99);
    });

    it("should not allow attempts to move funds from nonexistent pots", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await checkErrorRevert(colony.moveFundsBetweenPots(5, 1, 40, otherToken.address), "colony-funding-from-nonexistent-pot");
      const colonyPotBalance = await colony.getPotBalance(1, otherToken.address);
      assert.equal(colonyPotBalance.toNumber(), 99);
    });

    it("should not allow funds to be removed from a task with payouts to go", async () => {
      await fundColonyWithTokens(colony, otherToken, INITIAL_FUNDING);
      await setupFinalizedTask({ colonyNetwork, colony, token: otherToken });
      await checkErrorRevert(colony.moveFundsBetweenPots(2, 1, 40, otherToken.address), "colony-funding-task-bad-state");
      const colonyPotBalance = await colony.getPotBalance(2, otherToken.address);
      expect(colonyPotBalance).to.eq.BN(MANAGER_PAYOUT.add(EVALUATOR_PAYOUT).add(WORKER_PAYOUT));
    });

    it("should allow funds to be removed from a task if there are no more payouts of that token to be claimed", async () => {
      await fundColonyWithTokens(colony, otherToken, WAD.muln(363));
      const taskId = await setupFinalizedTask({ colonyNetwork, colony, token: otherToken });
      await colony.moveFundsBetweenPots(1, 2, 10, otherToken.address);
      await colony.claimPayout(taskId, MANAGER_ROLE, otherToken.address);
      await colony.claimPayout(taskId, WORKER_ROLE, otherToken.address, { from: WORKER });
      await colony.claimPayout(taskId, EVALUATOR_ROLE, otherToken.address, { from: EVALUATOR });
      await colony.moveFundsBetweenPots(2, 1, 10, otherToken.address);

      const colonyPotBalance = await colony.getPotBalance(2, otherToken.address);
      assert.equal(colonyPotBalance.toNumber(), 0);
    });

    it("should not allow user to claim payout if rating is 1", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFinalizedTask({
        colonyNetwork,
        colony,
        token,
        workerRating: 1
      });

      await colony.claimPayout(taskId, MANAGER_ROLE, token.address);
      await colony.claimPayout(taskId, EVALUATOR_ROLE, token.address, { from: EVALUATOR });
      await colony.claimPayout(taskId, WORKER_ROLE, token.address, { from: WORKER });

      const taskInfo = await colony.getTask(taskId);
      const taskPotId = taskInfo[5];
      const remainingPotBalance = await colony.getPotBalance(taskPotId, token.address);
      assert.equal(remainingPotBalance.toString(), WORKER_PAYOUT.toString(), "should have remaining pot balance equal to worker payout");

      await colony.moveFundsBetweenPots(taskPotId, 1, remainingPotBalance, token.address);

      const potBalance = await colony.getPotBalance(taskPotId, token.address);
      assert.equal(potBalance, 0, "should have pot balance of 0");
    });
  });

  describe("when receiving ether", () => {
    it("should not put the ether straight in to the pot", async () => {
      await colony.send(100);
      let colonyPotBalance = await colony.getPotBalance(1, ZERO_ADDRESS);
      let colonyEtherBalance = await web3GetBalance(colony.address);
      let colonyRewardBalance = await colony.getPotBalance(0, ZERO_ADDRESS);
      assert.equal(colonyEtherBalance, 100);
      expect(colonyPotBalance).to.be.zero;

      await colony.claimColonyFunds(ZERO_ADDRESS);
      colonyPotBalance = await colony.getPotBalance(1, ZERO_ADDRESS);
      colonyEtherBalance = await web3GetBalance(colony.address);
      colonyRewardBalance = await colony.getPotBalance(0, ZERO_ADDRESS);
      assert.equal(colonyEtherBalance, 100);
      assert.equal(colonyRewardBalance.toNumber(), 1);
      assert.equal(colonyPotBalance.toNumber(), 99);
    });

    it("should let ether be moved between pots", async () => {
      await colony.send(100);
      await colony.claimColonyFunds(ZERO_ADDRESS);
      await makeTask({ colony });
      await colony.moveFundsBetweenPots(1, 2, 51, ZERO_ADDRESS);
      const colonyPotBalance = await colony.getPotBalance(1, ZERO_ADDRESS);
      const colonyEtherBalance = await web3GetBalance(colony.address);
      const pot2Balance = await colony.getPotBalance(2, ZERO_ADDRESS);
      assert.equal(colonyEtherBalance, 100);
      assert.equal(colonyPotBalance.toNumber(), 48);
      assert.equal(pot2Balance.toNumber(), 51);
    });

    it("should not allow more ether to leave a pot than the pot has (even if the colony has that many)", async () => {
      await colony.send(100);
      await colony.claimColonyFunds(ZERO_ADDRESS);
      await makeTask({ colony });
      await makeTask({ colony });
      await colony.moveFundsBetweenPots(1, 2, 40, ZERO_ADDRESS);

      await checkErrorRevert(colony.moveFundsBetweenPots(2, 3, 50, ZERO_ADDRESS), "colony-funding-task-bad-state");
      const colonyEtherBalance = await web3GetBalance(colony.address);
      const colonyPotBalance = await colony.getPotBalance(1, ZERO_ADDRESS);
      const pot2Balance = await colony.getPotBalance(2, ZERO_ADDRESS);
      const pot3Balance = await colony.getPotBalance(3, ZERO_ADDRESS);
      assert.equal(colonyEtherBalance, 100);
      assert.equal(colonyPotBalance.toNumber(), 59);
      assert.equal(pot2Balance.toNumber(), 40);
      assert.equal(pot3Balance.toNumber(), 0);
    });

    it("should correctly track if we are able to make ether payouts", async () => {
      await colony.send(100);
      await colony.claimColonyFunds(ZERO_ADDRESS);
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
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, ZERO_ADDRESS, 40]
      });
      let task = await colony.getTask(taskId);
      assert.equal(task[4].toNumber(), 1);

      // Fund the pot equal to manager payout 40 = 40
      await colony.moveFundsBetweenPots(1, 2, 40, ZERO_ADDRESS);
      task = await colony.getTask(taskId);
      assert.equal(task[4].toNumber(), 0);

      // Cannot bring pot balance below current payout
      await checkErrorRevert(colony.moveFundsBetweenPots(2, 1, 30, ZERO_ADDRESS), "colony-funding-task-bad-state");

      // Set manager payout above pot value 50 > 40
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, ZERO_ADDRESS, 50]
      });
      task = await colony.getTask(taskId);
      assert.equal(task[4].toNumber(), 1);

      // Fund the pot equal to manager payout, plus 10, 50 < 60
      await colony.moveFundsBetweenPots(1, 2, 20, ZERO_ADDRESS);
      task = await colony.getTask(taskId);
      assert.equal(task[4].toNumber(), 0);

      // Cannot bring pot balance below current payout
      await checkErrorRevert(colony.moveFundsBetweenPots(2, 1, 30, ZERO_ADDRESS), "colony-funding-task-bad-state");

      // Can remove surplus 50 = 50
      await colony.moveFundsBetweenPots(2, 1, 10, ZERO_ADDRESS);
      task = await colony.getTask(taskId);
      assert.equal(task[4].toNumber(), 0);
    });

    it("should pay fees on revenue correctly", async () => {
      await colony.send(100);
      await colony.claimColonyFunds(ZERO_ADDRESS);
      await colony.send(200);
      await colony.claimColonyFunds(ZERO_ADDRESS);
      const colonyPotBalance = await colony.getPotBalance(1, ZERO_ADDRESS);
      const colonyRewardPotBalance = await colony.getPotBalance(0, ZERO_ADDRESS);
      const colonyEtherBalance = await web3GetBalance(colony.address);
      const nonRewardPotsTotal = await colony.getNonRewardPotsTotal(ZERO_ADDRESS);
      assert.equal(colonyEtherBalance, 300);
      assert.equal(colonyPotBalance.toNumber(), 297);
      assert.equal(colonyRewardPotBalance.toNumber(), 3);
      assert.equal(nonRewardPotsTotal.toNumber(), 297);
    });
  });
});
