/* globals artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");

const {
  UINT256_MAX,
  WAD,
  MANAGER_ROLE,
  EVALUATOR_ROLE,
  WORKER_ROLE,
  MANAGER_PAYOUT,
  EVALUATOR_PAYOUT,
  WORKER_PAYOUT,
  INITIAL_FUNDING,
} = require("../../helpers/constants");

const { fundColonyWithTokens, setupFinalizedTask, setupRandomColony, makeTask } = require("../../helpers/test-data-generator");
const { getTokenArgs, checkErrorRevert, web3GetBalance, removeSubdomainLimit } = require("../../helpers/test-helper");
const { executeSignedTaskChange, executeSignedRoleAssignment } = require("../../helpers/task-review-signing");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IMetaColony = artifacts.require("IMetaColony");
const Token = artifacts.require("Token");

contract("Colony Funding", (accounts) => {
  const MANAGER = accounts[0];
  const WORKER = accounts[2];

  let colony;
  let token;
  let otherToken;
  let colonyNetwork;
  let metaColony;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.setRewardInverse(100);

    const otherTokenArgs = getTokenArgs();
    otherToken = await Token.new(...otherTokenArgs);
    await otherToken.unlock();
  });

  describe("when receiving tokens", () => {
    it("should not put the tokens straight in to the pot", async () => {
      await otherToken.mint(colony.address, 100);
      let colonyRewardPotBalance = await colony.getFundingPotBalance(0, otherToken.address);
      let colonyPotBalance = await colony.getFundingPotBalance(1, otherToken.address);
      let colonyTokenBalance = await otherToken.balanceOf(colony.address);
      expect(colonyTokenBalance).to.eq.BN(100);
      expect(colonyPotBalance).to.be.zero;
      expect(colonyRewardPotBalance).to.be.zero;
      await colony.claimColonyFunds(otherToken.address);
      colonyRewardPotBalance = await colony.getFundingPotBalance(0, otherToken.address);
      colonyPotBalance = await colony.getFundingPotBalance(1, otherToken.address);
      colonyTokenBalance = await otherToken.balanceOf(colony.address);
      expect(colonyTokenBalance).to.eq.BN(100);
      expect(colonyPotBalance).to.eq.BN(99);
      expect(colonyRewardPotBalance).to.eq.BN(1);
    });

    it("should syphon off own tokens in to the reward pot", async () => {
      await fundColonyWithTokens(colony, token, 100);
      const colonyRewardPotBalance = await colony.getFundingPotBalance(0, token.address);
      const colonyPotBalance = await colony.getFundingPotBalance(1, token.address);
      const colonyTokenBalance = await token.balanceOf(colony.address);
      expect(colonyTokenBalance).to.eq.BN(100);
      expect(colonyPotBalance).to.eq.BN(99);
      expect(colonyRewardPotBalance).to.eq.BN(1);
    });

    it("should let tokens be moved between funding pots", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      const taskId = await makeTask({ colony });
      const task = await colony.getTask(taskId);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, task.fundingPotId, 51, otherToken.address);
      const colonyPotBalance = await colony.getFundingPotBalance(1, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf(colony.address);
      const pot2Balance = await colony.getFundingPotBalance(2, otherToken.address);
      expect(colonyTokenBalance).to.eq.BN(100);
      expect(colonyPotBalance).to.eq.BN(48);
      expect(pot2Balance).to.eq.BN(51);
    });

    it("should let multiple tokens be moved between funding pots at once", async () => {
      await fundColonyWithTokens(colony, token, 100);
      await fundColonyWithTokens(colony, otherToken, 200);

      await colony.addDomain(1, UINT256_MAX, 1);

      const sig = "moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256[],address[])";
      const moveFundsBetweenPots = colony.methods[sig];
      await moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, 0, 1, 2, [50, 100], [token.address, otherToken.address]);

      const colonyTokenBalance = await token.balanceOf(colony.address);
      const colonyOtherTokenBalance = await otherToken.balanceOf(colony.address);

      const potTokenBalance = await colony.getFundingPotBalance(1, token.address);
      const potOtherTokenBalance = await colony.getFundingPotBalance(1, otherToken.address);

      const pot2TokenBalance = await colony.getFundingPotBalance(2, token.address);
      const pot2OtherTokenBalance = await colony.getFundingPotBalance(2, otherToken.address);

      expect(colonyTokenBalance).to.eq.BN(100);
      expect(colonyOtherTokenBalance).to.eq.BN(200);
      expect(potTokenBalance).to.eq.BN(49);
      expect(potOtherTokenBalance).to.eq.BN(98);
      expect(pot2TokenBalance).to.eq.BN(50);
      expect(pot2OtherTokenBalance).to.eq.BN(100);
    });

    it("when moving tokens between pots, should respect permission inheritance", async () => {
      await removeSubdomainLimit(colonyNetwork); // Temporary for tests until we allow subdomain depth > 1
      await fundColonyWithTokens(colony, otherToken, 100);
      await colony.addDomain(1, UINT256_MAX, 1);
      await colony.addDomain(1, 0, 2);
      const domain1 = await colony.getDomain(1);
      const domain2 = await colony.getDomain(2);
      const domain3 = await colony.getDomain(3);

      // Move funds from 1 to 2
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, 0, domain1.fundingPotId, domain2.fundingPotId, 50, otherToken.address);

      // From 2 to 3 using same permission (i.e. 'acting in' domain 1)
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, 0, 1, domain2.fundingPotId, domain3.fundingPotId, 10, otherToken.address);

      // From 2 to 3 leveraging permissions slightly differently (i.e. 'acting in' domain 2)
      await colony.moveFundsBetweenPots(1, 0, 2, UINT256_MAX, 0, domain2.fundingPotId, domain3.fundingPotId, 10, otherToken.address);
    });

    it("should not let tokens be moved between the same pot", async () => {
      await fundColonyWithTokens(colony, otherToken, 1);
      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, 1, 1, otherToken.address),
        "colony-funding-cannot-move-funds-between-the-same-pot"
      );
      const colonyPotBalance = await colony.getFundingPotBalance(1, otherToken.address);
      expect(colonyPotBalance).to.eq.BN(1);
    });

    it("should not let tokens be moved from the pot for payouts to token holders", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      const taskId = await makeTask({ colony });
      const task = await colony.getTask(taskId);

      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 0, task.fundingPotId, 1, otherToken.address),
        "colony-funding-cannot-move-funds-from-rewards-pot"
      );
      const colonyPotBalance = await colony.getFundingPotBalance(1, otherToken.address);
      const colonyRewardPotBalance = await colony.getFundingPotBalance(0, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf(colony.address);
      const pot2Balance = await colony.getFundingPotBalance(2, otherToken.address);
      expect(colonyTokenBalance).to.eq.BN(100);
      expect(colonyPotBalance).to.eq.BN(99);
      expect(pot2Balance).to.be.zero;
      expect(colonyRewardPotBalance).to.eq.BN(1);
    });

    it("should not let tokens be moved by non-admins", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      const taskId = await makeTask({ colony });
      const task = await colony.getTask(taskId);

      const moveFundsBetweenPots = colony.methods["moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address)"];
      await checkErrorRevert(
        moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, task.fundingPotId, 51, otherToken.address, { from: WORKER }),
        "ds-auth-unauthorized"
      );

      const colonyPotBalance = await colony.getFundingPotBalance(1, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf(colony.address);
      const pot2Balance = await colony.getFundingPotBalance(2, otherToken.address);
      expect(colonyTokenBalance).to.eq.BN(100);
      expect(colonyPotBalance).to.eq.BN(99);
      expect(pot2Balance).to.be.zero;
    });

    it("should not allow more tokens to leave a pot than the pot has (even if the colony has that many)", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await colony.addDomain(1, UINT256_MAX, 1);
      await colony.addDomain(1, UINT256_MAX, 1);

      await colony.moveFundsBetweenPots(1, UINT256_MAX, 0, 1, 2, 40, otherToken.address);
      await checkErrorRevert(colony.moveFundsBetweenPots(1, 0, 1, 2, 3, 50, otherToken.address), "ds-math-sub-underflow");

      const colonyTokenBalance = await otherToken.balanceOf(colony.address);
      const pot1Balance = await colony.getFundingPotBalance(1, otherToken.address);
      const pot2Balance = await colony.getFundingPotBalance(2, otherToken.address);
      const pot3Balance = await colony.getFundingPotBalance(3, otherToken.address);
      expect(colonyTokenBalance).to.eq.BN(100);
      expect(pot1Balance).to.eq.BN(59);
      expect(pot2Balance).to.eq.BN(40);
      expect(pot3Balance).to.be.zero;
    });

    it("should correctly track if we are able to make token payouts", async () => {
      // There are eighteen scenarios to test here.
      // FundingPot was below payout, now equal (1 + 2)
      // FundingPot was below payout, now above (3 + 4)
      // FundingPot was equal to payout, now above (5 + 6)
      // FundingPot was equal to payout, now below (7 + 8)
      // FundingPot was above payout, now below (9 + 10)
      // FundingPot was above payout, now equal (11 + 12)
      // FundingPot was below payout, still below (13 + 14)
      // FundingPot was above payout, still above (15 + 16)
      // FundingPot was equal to payout, still equal (17 + 18)
      //
      // And, for each of these, we have to check that the update is correctly tracked when
      // the pot changes (odd numbers), and when the payout changes (even numbers)
      //
      // NB We do not need to be this exhaustive when using ether, because this test is testing
      // that updatePayoutsWeCannotMakeAfterPotChange and updatePayoutsWeCannotMakeAfterBudgetChange
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
        args: [taskId, WORKER],
      });

      // FundingPot 0, Payout 0
      // FundingPot was equal to payout, transition to pot being equal by changing payout (18)
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 0],
      });
      const task = await colony.getTask(taskId);
      let fundingPot = await colony.getFundingPot(task.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot 0, Payout 0
      // FundingPot was equal to payout, transition to pot being equal by changing pot (17)
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, task.fundingPotId, 0, otherToken.address);
      fundingPot = await colony.getFundingPot(task.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot 0, Payout 0
      // FundingPot was equal to payout, transition to pot being lower by increasing payout (8)
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 40],
      });
      fundingPot = await colony.getFundingPot(task.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.eq.BN(1);

      // FundingPot Balance: 0, Payout: 40
      // FundingPot was below payout, transition to being equal by increasing pot (1)
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, task.fundingPotId, 40, otherToken.address);
      fundingPot = await colony.getFundingPot(task.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot Balance: 40, Payout 40
      // FundingPot was equal to payout, transition to being above by increasing pot (5)
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, task.fundingPotId, 40, otherToken.address);
      fundingPot = await colony.getFundingPot(task.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot Balance: 80, Payout 40
      // FundingPot was above payout, transition to being equal by increasing payout (12)
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 80],
      });
      fundingPot = await colony.getFundingPot(task.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot 80, Payout 80
      // FundingPot was equal to payout, transition to being above by decreasing payout (6)
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 40],
      });
      fundingPot = await colony.getFundingPot(task.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot 80, Payout 40
      // FundingPot was above payout, transition to being equal by decreasing pot (11)
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, task.fundingPotId, 1, 40, otherToken.address);
      fundingPot = await colony.getFundingPot(task.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot 40, Payout 40
      // FundingPot was equal to payout, transition to pot being below payout by changing pot (7)
      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, task.fundingPotId, 1, 20, otherToken.address),
        "colony-funding-task-bad-state"
      );

      // Remove 20 from pot
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 20],
      });
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, task.fundingPotId, 1, 20, otherToken.address);
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 40],
      });

      // FundingPot 20, Payout 40
      // FundingPot was below payout, change to being above by changing pot (3)
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, task.fundingPotId, 60, otherToken.address);
      fundingPot = await colony.getFundingPot(task.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot 80, Payout 40
      // FundingPot was above payout, change to being below by changing pot (9)
      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, task.fundingPotId, 1, 60, otherToken.address),
        "colony-funding-task-bad-state"
      );

      // Remove 60 from pot
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 20],
      });
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, task.fundingPotId, 1, 60, otherToken.address);
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 40],
      });

      // FundingPot 20, Payout 40
      // FundingPot was below payout, change to being above by changing payout (4)
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 10],
      });
      fundingPot = await colony.getFundingPot(task.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot 20, Payout 10
      // FundingPot was above, change to being above by changing payout (16)
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 5],
      });
      fundingPot = await colony.getFundingPot(task.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot 20, Payout 5
      // FundingPot was above, change to being above by changing pot (15)
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, task.fundingPotId, 1, 10, otherToken.address);
      fundingPot = await colony.getFundingPot(task.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot 10, Payout 5
      // FundingPot was above payout, change to being below by changing payout (10)
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 40],
      });
      fundingPot = await colony.getFundingPot(task.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.eq.BN(1);

      // FundingPot 10, Payout 40
      // FundingPot was below payout, change to being below by changing payout (14)
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 30],
      });
      fundingPot = await colony.getFundingPot(task.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.eq.BN(1);

      // FundingPot 10, Payout 30
      // FundingPot was below payout, change to being below by changing pot (13)
      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, task.fundingPotId, 1, 5, otherToken.address),
        "colony-funding-task-bad-state"
      );

      // Remove 5 from pot
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 5],
      });
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, task.fundingPotId, 1, 5, otherToken.address);
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 30],
      });

      // FundingPot 5, Payout 30
      // FundingPot was below payout, change to being equal by changing payout (2)
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, otherToken.address, 5],
      });
      fundingPot = await colony.getFundingPot(task.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot 5, Payout 5
    });

    it("should pay fees on revenue correctly", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await fundColonyWithTokens(colony, otherToken, 200);
      const colonyPotBalance = await colony.getFundingPotBalance(1, otherToken.address);
      const colonyRewardPotBalance = await colony.getFundingPotBalance(0, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf(colony.address);
      expect(colonyTokenBalance).to.eq.BN(300);
      expect(colonyRewardPotBalance).to.eq.BN(3);
      expect(colonyPotBalance).to.eq.BN(297);
    });

    it("should return correct number of funding pots", async () => {
      const taskCountBefore = await colony.getTaskCount();
      expect(taskCountBefore).to.be.zero;
      const potCountBefore = await colony.getFundingPotCount();
      // Expect there to be a single funding pot for the root Domain created.
      // Note that the reward pot with id 0 is NOT included in the Colony Funding funding pots count
      expect(potCountBefore).to.eq.BN(1);

      await colony.addDomain(1, UINT256_MAX, 1);
      const potCountAfterAddingDomain = await colony.getFundingPotCount();
      expect(potCountAfterAddingDomain).to.eq.BN(2);

      for (let i = 0; i < 5; i += 1) {
        await makeTask({ colony });
      }

      const taskCountAfter = await colony.getTaskCount();
      expect(taskCountAfter).to.be.eq.BN(5);
      const potCountAfter = await colony.getFundingPotCount();
      expect(potCountAfter).to.eq.BN(7);
    });

    it("should not allow contributions to nonexistent funding pots", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await checkErrorRevert(colony.moveFundsBetweenPots(1, UINT256_MAX, 3, 1, 5, 40, otherToken.address), "colony-funding-nonexistent-pot");
      const colonyPotBalance = await colony.getFundingPotBalance(1, otherToken.address);
      expect(colonyPotBalance).to.eq.BN(99);
    });

    it("should not allow attempts to move funds from nonexistent funding pots", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await checkErrorRevert(colony.moveFundsBetweenPots(1, 3, UINT256_MAX, 5, 1, 40, otherToken.address), "colony-funding-nonexistent-pot");
      const colonyPotBalance = await colony.getFundingPotBalance(1, otherToken.address);
      expect(colonyPotBalance).to.eq.BN(99);
    });

    it("should not allow funds to be removed from a task with payouts to go", async () => {
      await fundColonyWithTokens(colony, otherToken, INITIAL_FUNDING);
      const taskId = await setupFinalizedTask({ colonyNetwork, colony, token: otherToken });
      const task = await colony.getTask(taskId);

      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, task.fundingPotId, 1, 40, otherToken.address),
        "colony-funding-task-bad-state"
      );

      const colonyPotBalance = await colony.getFundingPotBalance(2, otherToken.address);
      expect(colonyPotBalance).to.eq.BN(MANAGER_PAYOUT.add(EVALUATOR_PAYOUT).add(WORKER_PAYOUT));
    });

    it("should automatically return surplus funds to the domain", async () => {
      await fundColonyWithTokens(colony, otherToken, WAD.muln(500));
      const taskId = await setupFinalizedTask({ colonyNetwork, colony, token: otherToken });

      const task = await colony.getTask(taskId);

      // Add an extra WAD of funding
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, task.fundingPotId, WAD, otherToken.address);

      await colony.claimTaskPayout(taskId, MANAGER_ROLE, otherToken.address);
      await colony.claimTaskPayout(taskId, WORKER_ROLE, otherToken.address);
      await colony.claimTaskPayout(taskId, EVALUATOR_ROLE, otherToken.address);

      // WAD is gone
      const taskPotBalance = await colony.getFundingPotBalance(task.fundingPotId, otherToken.address);
      expect(taskPotBalance).to.be.zero;
    });

    it("should not allow user to claim payout if rating is 1", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFinalizedTask({
        colonyNetwork,
        colony,
        token,
        workerRating: 1,
      });

      await colony.claimTaskPayout(taskId, MANAGER_ROLE, token.address);
      await colony.claimTaskPayout(taskId, EVALUATOR_ROLE, token.address);
      await colony.claimTaskPayout(taskId, WORKER_ROLE, token.address);

      const task = await colony.getTask(taskId);
      const remainingPotBalance = await colony.getFundingPotBalance(task.fundingPotId, token.address);
      expect(remainingPotBalance).to.eq.BN(WORKER_PAYOUT);

      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, task.fundingPotId, 1, remainingPotBalance, token.address);

      const potBalance = await colony.getFundingPotBalance(task.fundingPotId, token.address);
      expect(potBalance).to.be.zero;
    });

    it("should correctly send whitelisted tokens to the Metacolony", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);

      await metaColony.setNetworkFeeInverse(1); // 100% to fees

      const taskId = await setupFinalizedTask({ colonyNetwork, colony, token });

      const networkBalanceBefore = await token.balanceOf(colonyNetwork.address);
      await colony.claimTaskPayout(taskId, MANAGER_ROLE, token.address);
      const networkBalanceAfter = await token.balanceOf(colonyNetwork.address);
      expect(networkBalanceAfter.sub(networkBalanceBefore)).to.eq.BN(MANAGER_PAYOUT);

      await metaColony.setPayoutWhitelist(token.address, true);

      const metaColonyBalanceBefore = await token.balanceOf(metaColony.address);
      await colony.claimTaskPayout(taskId, WORKER_ROLE, token.address);
      const metaColonyBalanceAfter = await token.balanceOf(metaColony.address);
      expect(metaColonyBalanceAfter.sub(metaColonyBalanceBefore)).to.eq.BN(WORKER_PAYOUT);
    });
  });

  describe("when receiving ether", () => {
    it("should not put the ether straight in to the pot", async () => {
      await colony.send(100);
      let colonyPotBalance = await colony.getFundingPotBalance(1, ethers.constants.AddressZero);
      let colonyEtherBalance = await web3GetBalance(colony.address);
      let colonyRewardBalance = await colony.getFundingPotBalance(0, ethers.constants.AddressZero);
      expect(colonyEtherBalance).to.eq.BN(100);
      expect(colonyPotBalance).to.be.zero;

      await colony.claimColonyFunds(ethers.constants.AddressZero);
      colonyPotBalance = await colony.getFundingPotBalance(1, ethers.constants.AddressZero);
      colonyEtherBalance = await web3GetBalance(colony.address);
      colonyRewardBalance = await colony.getFundingPotBalance(0, ethers.constants.AddressZero);
      expect(colonyEtherBalance).to.eq.BN(100);
      expect(colonyRewardBalance).to.eq.BN(1);
      expect(colonyPotBalance).to.eq.BN(99);
    });

    it("should let ether be moved between funding pots", async () => {
      await colony.send(100);
      await colony.claimColonyFunds(ethers.constants.AddressZero);
      const taskId = await makeTask({ colony });
      const task = await colony.getTask(taskId);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, task.fundingPotId, 51, ethers.constants.AddressZero);
      const colonyPotBalance = await colony.getFundingPotBalance(1, ethers.constants.AddressZero);
      const colonyEtherBalance = await web3GetBalance(colony.address);
      const pot2Balance = await colony.getFundingPotBalance(2, ethers.constants.AddressZero);
      expect(colonyEtherBalance).to.eq.BN(100);
      expect(colonyPotBalance).to.eq.BN(48);
      expect(pot2Balance).to.eq.BN(51);
    });

    it("should not allow more ether to leave a pot than the pot has (even if the colony has that many)", async () => {
      await colony.send(100);
      await colony.claimColonyFunds(ethers.constants.AddressZero);
      await colony.addDomain(1, UINT256_MAX, 1);
      await colony.addDomain(1, UINT256_MAX, 1);

      await colony.moveFundsBetweenPots(1, UINT256_MAX, 0, 1, 2, 40, ethers.constants.AddressZero);
      await checkErrorRevert(colony.moveFundsBetweenPots(1, 0, 1, 2, 3, 50, ethers.constants.AddressZero), "ds-math-sub-underflow");

      const colonyEtherBalance = await web3GetBalance(colony.address);
      const pot1Balance = await colony.getFundingPotBalance(1, ethers.constants.AddressZero);
      const pot2Balance = await colony.getFundingPotBalance(2, ethers.constants.AddressZero);
      const pot3Balance = await colony.getFundingPotBalance(3, ethers.constants.AddressZero);
      expect(colonyEtherBalance).to.eq.BN(100);
      expect(pot1Balance).to.eq.BN(59);
      expect(pot2Balance).to.eq.BN(40);
      expect(pot3Balance).to.be.zero;
    });

    it("should correctly track if we are able to make ether payouts", async () => {
      await colony.send(100);
      await colony.claimColonyFunds(ethers.constants.AddressZero);
      const taskId = await makeTask({ colony });
      const task = await colony.getTask(taskId);

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER],
      });

      // Set manager payout above pot value 40 > 0
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, ethers.constants.AddressZero, 40],
      });

      let fundingPot = await colony.getFundingPot(task.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.eq.BN(1);

      // Fund the pot equal to manager payout 40 = 40
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, task.fundingPotId, 40, ethers.constants.AddressZero);
      fundingPot = await colony.getFundingPot(task.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // Cannot bring pot balance below current payout
      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, task.fundingPotId, 1, 30, ethers.constants.AddressZero),
        "colony-funding-task-bad-state"
      );

      // Set manager payout above pot value 50 > 40
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, ethers.constants.AddressZero, 50],
      });
      fundingPot = await colony.getFundingPot(task.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.eq.BN(1);

      // Fund the pot equal to manager payout, plus 10, 50 < 60
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, task.fundingPotId, 20, ethers.constants.AddressZero);
      fundingPot = await colony.getFundingPot(task.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // Cannot bring pot balance below current payout
      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, task.fundingPotId, 1, 30, ethers.constants.AddressZero),
        "colony-funding-task-bad-state"
      );

      // Can remove surplus 50 = 50
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, task.fundingPotId, 1, 10, ethers.constants.AddressZero);
      fundingPot = await colony.getFundingPot(task.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;
    });

    it("should pay fees on revenue correctly", async () => {
      await colony.send(100);
      await colony.claimColonyFunds(ethers.constants.AddressZero);
      await colony.send(200);
      await colony.claimColonyFunds(ethers.constants.AddressZero);
      const colonyPotBalance = await colony.getFundingPotBalance(1, ethers.constants.AddressZero);
      const colonyRewardPotBalance = await colony.getFundingPotBalance(0, ethers.constants.AddressZero);
      const colonyEtherBalance = await web3GetBalance(colony.address);
      const nonRewardPotsTotal = await colony.getNonRewardPotsTotal(ethers.constants.AddressZero);
      expect(colonyEtherBalance).to.eq.BN(300);
      expect(colonyPotBalance).to.eq.BN(297);
      expect(colonyRewardPotBalance).to.eq.BN(3);
      expect(nonRewardPotsTotal).to.eq.BN(297);
    });
  });
});
