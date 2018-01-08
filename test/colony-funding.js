/* globals artifacts */
import { EVALUATOR,
  WORKER,
  MANAGER_ROLE,
  WORKER_ROLE,
  SPECIFICATION_HASH } from '../helpers/constants';
import testHelper from '../helpers/test-helper';
import testDataGenerator from '../helpers/test-data-generator';

const EtherRouter = artifacts.require('EtherRouter');
const IColony = artifacts.require('IColony');
const IColonyNetwork = artifacts.require('IColonyNetwork');
const Token = artifacts.require('Token');

contract('Colony Funding', () => {
  let COLONY_KEY;
  let colony;
  let token;
  let otherToken;
  let colonyNetwork;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    COLONY_KEY = testHelper.getRandomString(7);
    await colonyNetwork.createColony(COLONY_KEY);
    const address = await colonyNetwork.getColony.call(COLONY_KEY);
    colony = await IColony.at(address);
    const tokenAddress = await colony.getToken.call();
    token = await Token.at(tokenAddress);
    otherToken = await Token.new();
  });

  describe('when receiving tokens', () => {
    it('should not put the tokens straight in to the pot', async () => {
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

    it('should not put its own tokens in to the reward pot', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, token, 100);
      const colonyRewardPotBalance = await colony.getPotBalance.call(0, token.address);
      const colonyPotBalance = await colony.getPotBalance.call(1, token.address);
      const colonyTokenBalance = await token.balanceOf.call(colony.address);
      assert.equal(colonyTokenBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 100);
      assert.equal(colonyRewardPotBalance.toNumber(), 0);
    });

    it('should let tokens be moved between pots', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, otherToken, 100);
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.moveFundsBetweenPots(1, 2, 51, otherToken.address);
      const colonyPotBalance = await colony.getPotBalance.call(1, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf.call(colony.address);
      const pot2Balance = await colony.getPotBalance.call(2, otherToken.address);
      assert.equal(colonyTokenBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 48);
      assert.equal(pot2Balance.toNumber(), 51);
    });

    it('should not let tokens be moved from the pot for payouts to token holders', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, otherToken, 100);
      await colony.makeTask(SPECIFICATION_HASH);

      await testHelper.checkErrorRevert(colony.moveFundsBetweenPots(0, 2, 1, otherToken.address));
      const colonyPotBalance = await colony.getPotBalance.call(1, otherToken.address);
      const colonyRewardPotBalance = await colony.getPotBalance.call(0, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf.call(colony.address);
      const pot2Balance = await colony.getPotBalance.call(2, otherToken.address);
      assert.equal(colonyTokenBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 99);
      assert.equal(pot2Balance.toNumber(), 0);
      assert.equal(colonyRewardPotBalance.toNumber(), 1);
    });

    it('should not let tokens be moved by non-admins', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, otherToken, 100);
      await colony.makeTask(SPECIFICATION_HASH);

      await testHelper.checkErrorRevert(colony.moveFundsBetweenPots(1, 2, 51, otherToken.address, { from: EVALUATOR }));
      const colonyPotBalance = await colony.getPotBalance.call(1, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf.call(colony.address);
      const pot2Balance = await colony.getPotBalance.call(2, otherToken.address);
      assert.equal(colonyTokenBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 99);
      assert.equal(pot2Balance.toNumber(), 0);
    });

    it('should not allow more tokens to leave a pot than the pot has (even if the colony has that many)', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, otherToken, 100);
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.moveFundsBetweenPots(1, 2, 40, otherToken.address);

      await testHelper.checkErrorRevert(colony.moveFundsBetweenPots(2, 3, 50, otherToken.address));
      const colonyPotBalance = await colony.getPotBalance.call(1, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf.call(colony.address);
      const pot2Balance = await colony.getPotBalance.call(2, otherToken.address);
      const pot3Balance = await colony.getPotBalance.call(3, otherToken.address);
      assert.equal(colonyTokenBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 59);
      assert.equal(pot2Balance.toNumber(), 40);
      assert.equal(pot3Balance.toNumber(), 0);
    });

    it('should correctly track if we are able to make token payouts', async () => {
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
      await testDataGenerator.fundColonyWithTokens(colony, otherToken, 100);
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);
      // Pot 0, Payout 0
      // Pot was equal to payout, transition to pot being equal by changing payout (18)
      const txData1 = await colony.contract.setTaskPayout.getData(1, 0, otherToken.address, 0);
      await colony.proposeTaskChange(txData1, 0, 0);
      await colony.approveTaskChange(1, WORKER_ROLE, { from: WORKER });
      let task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      // Pot 0, Payout 0
      // Pot was equal to payout, transition to pot being equal by changing pot (17)
      await colony.moveFundsBetweenPots(1, 2, 0, otherToken.address);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      // Pot 0, Payout 0
      // Pot was equal to payout, transition to pot being lower by increasing payout (8)
      const txData2 = await colony.contract.setTaskPayout.getData(1, 0, otherToken.address, 40);
      await colony.proposeTaskChange(txData2, 0, 0);
      await colony.approveTaskChange(2, WORKER_ROLE, { from: WORKER });
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
      const txData3 = await colony.contract.setTaskPayout.getData(1, 0, otherToken.address, 80);
      await colony.proposeTaskChange(txData3, 0, 0);
      await colony.approveTaskChange(3, WORKER_ROLE, { from: WORKER });

      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      // Pot 80, Payout 80
      // Pot was equal to payout, transition to being above by decreasing payout (6)
      const txData4 = await colony.contract.setTaskPayout.getData(1, 0, otherToken.address, 40);
      await colony.proposeTaskChange(txData4, 0, 0);
      await colony.approveTaskChange(4, WORKER_ROLE, { from: WORKER });

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
      const txData5 = await colony.contract.setTaskPayout.getData(1, 0, otherToken.address, 10);
      await colony.proposeTaskChange(txData5, 0, 0);
      await colony.approveTaskChange(5, WORKER_ROLE, { from: WORKER });
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      // Pot 20, Payout 10
      // Pot was above, change to being above by changing payout (16)
      const txData6 = await colony.contract.setTaskPayout.getData(1, 0, otherToken.address, 5);
      await colony.proposeTaskChange(txData6, 0, 0);
      await colony.approveTaskChange(6, WORKER_ROLE, { from: WORKER });
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      // Pot 20, Payout 5
      // Pot was above, change to being above by changing pot (15)
      await colony.moveFundsBetweenPots(2, 1, 10, otherToken.address);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      // Pot 10, Payout 5
      // Pot was above payout, change to being below by changing payout (10)
      const txData7 = await colony.contract.setTaskPayout.getData(1, 0, otherToken.address, 40);
      await colony.proposeTaskChange(txData7, 0, 0);
      await colony.approveTaskChange(7, WORKER_ROLE, { from: WORKER });
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 1);
      // Pot 10, Payout 40
      // Pot was below payout, change to being below by changing payout (14)
      const txData8 = await colony.contract.setTaskPayout.getData(1, 0, otherToken.address, 30);
      await colony.proposeTaskChange(txData8, 0, 0);
      await colony.approveTaskChange(8, WORKER_ROLE, { from: WORKER });
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 1);
      // Pot 10, Payout 30
      // Pot was below payout, change to being below by changing pot (13)
      await colony.moveFundsBetweenPots(2, 1, 5, otherToken.address);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 1);
      // Pot 5, Payout 30
      // Pot was below payout, change to being equal by changing payout (2)
      const txData9 = await colony.contract.setTaskPayout.getData(1, 0, otherToken.address, 5);
      await colony.proposeTaskChange(txData9, 0, 0);
      await colony.approveTaskChange(9, WORKER_ROLE, { from: WORKER });
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      // Pot 5, Payout 5
    });

    it('should pay fees on revenue correctly', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, otherToken, 100);
      await testDataGenerator.fundColonyWithTokens(colony, otherToken, 200);
      const colonyPotBalance = await colony.getPotBalance.call(1, otherToken.address);
      const colonyRewardPotBalance = await colony.getPotBalance.call(0, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf.call(colony.address);
      assert.equal(colonyTokenBalance.toNumber(), 300);
      assert.equal(colonyRewardPotBalance.toNumber(), 3);
      assert.equal(colonyPotBalance.toNumber(), 297);
    });

    it('should not allow contributions to nonexistent pots', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, otherToken, 100);
      await testHelper.checkErrorRevert(colony.moveFundsBetweenPots(1, 5, 40, otherToken.address));
      const colonyPotBalance = await colony.getPotBalance.call(1, otherToken.address);
      assert.equal(colonyPotBalance.toNumber(), 99);
    });

    it('should not allow funds to be removed from a task with payouts to go', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, otherToken, 310 * 1e18);
      const taskId = await testDataGenerator.setupRatedTask(colony, otherToken);
      await colony.finalizeTask(taskId);
      await testHelper.checkErrorRevert(colony.moveFundsBetweenPots(2, 1, 40, otherToken.address));
      const colonyPotBalance = await colony.getPotBalance.call(2, otherToken.address);
      assert.equal(colonyPotBalance.toNumber(), 300 * 1e18);
    });

    it('should allow funds to be removed from a task if there are no more payouts of that token to be claimed', async () => {
      await testDataGenerator.fundColonyWithTokens(colony, otherToken, 313 * 1e18);
      const taskId = await testDataGenerator.setupRatedTask(colony, otherToken);
      await colony.moveFundsBetweenPots(1, 2, 10, otherToken.address);
      await colony.finalizeTask(taskId);
      await colony.claimPayout(taskId, MANAGER_ROLE, otherToken.address);
      await colony.claimPayout(taskId, WORKER_ROLE, otherToken.address, { from: WORKER });
      await colony.moveFundsBetweenPots(2, 1, 10, otherToken.address);

      const colonyPotBalance = await colony.getPotBalance.call(2, otherToken.address);
      assert.equal(colonyPotBalance.toNumber(), 0);
    });
  });

  describe('when receiving ether', () => {
    it('should not put the ether straight in to the pot', async () => {
      await colony.send(100);
      let colonyPotBalance = await colony.getPotBalance.call(1, 0x0);
      let colonyEtherBalance = await testHelper.web3GetBalance(colony.address);
      let colonyRewardBalance = await colony.getPotBalance.call(0, 0x0);
      assert.equal(colonyEtherBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 0);
      await colony.claimColonyFunds(0x0);
      colonyPotBalance = await colony.getPotBalance.call(1, 0x0);
      colonyEtherBalance = await testHelper.web3GetBalance(colony.address);
      colonyRewardBalance = await colony.getPotBalance.call(0, 0x0);
      assert.equal(colonyEtherBalance.toNumber(), 100);
      assert.equal(colonyRewardBalance.toNumber(), 1);
      assert.equal(colonyPotBalance.toNumber(), 99);
    });

    it('should let ether be moved between pots', async () => {
      await colony.send(100);
      await colony.claimColonyFunds(0x0);
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.moveFundsBetweenPots(1, 2, 51, 0x0);
      const colonyPotBalance = await colony.getPotBalance.call(1, 0x0);
      const colonyEtherBalance = await testHelper.web3GetBalance(colony.address);
      const pot2Balance = await colony.getPotBalance.call(2, 0x0);
      assert.equal(colonyEtherBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 48);
      assert.equal(pot2Balance.toNumber(), 51);
    });

    it('should not allow more ether to leave a pot than the pot has (even if the colony has that many)', async () => {
      await colony.send(100);
      await colony.claimColonyFunds(0x0);
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.moveFundsBetweenPots(1, 2, 40, 0x0);

      await testHelper.checkErrorRevert(colony.moveFundsBetweenPots(2, 3, 50, 0x0));
      const colonyEtherBalance = await testHelper.web3GetBalance(colony.address);
      const colonyPotBalance = await colony.getPotBalance.call(1, 0x0);
      const pot2Balance = await colony.getPotBalance.call(2, 0x0);
      const pot3Balance = await colony.getPotBalance.call(3, 0x0);
      assert.equal(colonyEtherBalance.toNumber(), 100);
      assert.equal(colonyPotBalance.toNumber(), 59);
      assert.equal(pot2Balance.toNumber(), 40);
      assert.equal(pot3Balance.toNumber(), 0);
    });

    it('should correctly track if we are able to make ether payouts', async () => {
      await colony.send(100);
      await colony.claimColonyFunds(0x0);
      await colony.makeTask(SPECIFICATION_HASH);
      await colony.setTaskRoleUser(1, WORKER_ROLE, WORKER);

      const txData1 = await colony.contract.setTaskPayout.getData(1, 0, 0x0, 40);
      await colony.proposeTaskChange(txData1, 0, 0);
      await colony.approveTaskChange(1, WORKER_ROLE, { from: WORKER });

      let task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 1);
      await colony.moveFundsBetweenPots(1, 2, 40, 0x0);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
      await colony.moveFundsBetweenPots(2, 1, 30, 0x0);
      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 1);

      const txData2 = await colony.contract.setTaskPayout.getData(1, 0, 0x0, 10);
      await colony.proposeTaskChange(txData2, 0, 0);
      await colony.approveTaskChange(2, WORKER_ROLE, { from: WORKER });

      task = await colony.getTask.call(1);
      assert.equal(task[5].toNumber(), 0);
    });

    it('should pay fees on revenue correctly', async () => {
      await colony.send(100);
      await colony.claimColonyFunds(0x0);
      await colony.send(200);
      await colony.claimColonyFunds(0x0);
      const colonyPotBalance = await colony.getPotBalance.call(1, 0x0);
      const colonyRewardPotBalance = await colony.getPotBalance.call(0, 0x0);
      const colonyEtherBalance = await testHelper.web3GetBalance(colony.address);
      const nonRewardPotsTotal = await colony.getNonRewardPotsTotal.call(0x0);
      assert.equal(colonyEtherBalance.toNumber(), 300);
      assert.equal(colonyPotBalance.toNumber(), 297);
      assert.equal(colonyRewardPotBalance.toNumber(), 3);
      assert.equal(nonRewardPotsTotal.toNumber(), 297);
    });
  });
});
