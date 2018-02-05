import web3Utils from 'web3-utils';
import { BN } from 'bn.js';

import { EVALUATOR,
  WORKER,
  MANAGER_PAYOUT,
  WORKER_PAYOUT,
  MANAGER_RATING,
  WORKER_RATING,
  RATING_1_SALT,
  RATING_2_SALT,
  MANAGER_ROLE,
  EVALUATOR_ROLE,
  WORKER_ROLE,
  SPECIFICATION_HASH } from '../helpers/constants';
import testHelper from '../helpers/test-helper';

module.exports = {
  async setupAssignedTask(
    colonyNetwork,
    colony,
    dueDate = testHelper.currentBlockTime(),
    domain = 1,
    skill = 0,
    evaluator = EVALUATOR,
    worker = WORKER,
  ) {
    await colony.makeTask(SPECIFICATION_HASH, 1);
    let taskId = await colony.getTaskCount.call();
    taskId = taskId.toNumber();
    await colony.setTaskDomain(taskId, domain);
    // If the skill is not specified, default to the root global skill
    if (skill === 0) {
      const rootGlobalSkill = await colonyNetwork.getRootGlobalSkillId.call();
      if (rootGlobalSkill === 0) throw new Error('Common Colony is not setup and therefore the root global skill does not exist');
      await colony.setTaskSkill(taskId, rootGlobalSkill);
    } else {
      await colony.setTaskSkill(taskId, skill);
    }
    await colony.setTaskRoleUser(taskId, EVALUATOR_ROLE, evaluator);
    await colony.setTaskRoleUser(taskId, WORKER_ROLE, worker);
    const txData = await colony.contract.setTaskDueDate.getData(taskId, dueDate);
    await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
    const transactionId = await colony.getTransactionCount.call();
    await colony.approveTaskChange(transactionId, WORKER_ROLE, { from: worker });
    return taskId;
  },
  async setupFundedTask(
    colonyNetwork,
    colony,
    token,
    dueDate,
    domain,
    skill,
    evaluator = EVALUATOR,
    worker = WORKER,
    manager_payout = MANAGER_PAYOUT,
    worker_payout = WORKER_PAYOUT,
  ) {
    let tokenAddress;
    if (token === undefined) {
      tokenAddress = await colony.getToken.call();
    } else {
      tokenAddress = token === 0x0 ? 0x0 : token.address;
    }

    const taskId = await this.setupAssignedTask(colonyNetwork, colony, dueDate, domain, skill, evaluator, worker);
    const task = await colony.getTask.call(taskId);
    const potId = task[6].toNumber();
    const managerPayout = new BN(manager_payout);
    const workerPayout = new BN(worker_payout);
    const totalPayouts = managerPayout.add(workerPayout);
    await colony.moveFundsBetweenPots(1, potId, totalPayouts.toString(), tokenAddress);
    let txData = await colony.contract.setTaskPayout.getData(taskId, MANAGER_ROLE, tokenAddress, managerPayout.toString());
    await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
    let transactionId = await colony.getTransactionCount.call();
    await colony.approveTaskChange(transactionId, WORKER_ROLE, { from: worker });

    txData = await colony.contract.setTaskPayout.getData(taskId, WORKER_ROLE, tokenAddress, workerPayout.toString());
    await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
    transactionId = await colony.getTransactionCount.call();
    await colony.approveTaskChange(transactionId, WORKER_ROLE, { from: worker });
    return taskId;
  },
  async setupRatedTask(
    colonyNetwork,
    colony,
    token,
    dueDate,
    domain,
    skill,
    evaluator = EVALUATOR,
    worker = WORKER,
    manager_payout = MANAGER_PAYOUT,
    worker_payout = WORKER_PAYOUT,
    manager_rating = MANAGER_RATING,
    manager_rating_salt = RATING_1_SALT,
    worker_rating = WORKER_RATING,
    worker_rating_salt = RATING_2_SALT,
  ) {
    const taskId = await this.setupFundedTask(colonyNetwork, colony, token, dueDate, domain, skill, evaluator, worker, manager_payout, worker_payout);
    const WORKER_RATING_SECRET = web3Utils.soliditySha3(worker_rating_salt, worker_rating);
    const MANAGER_RATING_SECRET = web3Utils.soliditySha3(manager_rating_salt, manager_rating);
    await colony.submitTaskWorkRating(taskId, WORKER_ROLE, WORKER_RATING_SECRET, { from: evaluator });
    await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, MANAGER_RATING_SECRET, { from: worker });
    await colony.revealTaskWorkRating(taskId, WORKER_ROLE, worker_rating, worker_rating_salt, { from: evaluator });
    await colony.revealTaskWorkRating(taskId, MANAGER_ROLE, manager_rating, manager_rating_salt, { from: worker });
    return taskId;
  },
  async fundColonyWithTokens(colony, token, tokenAmount) {
    const colonyToken = await colony.getToken.call();
    if (colonyToken === token.address) {
      await colony.mintTokens(tokenAmount);
    } else {
      await token.mint(tokenAmount);
      await token.transfer(colony.address, tokenAmount);
    }
    await colony.claimColonyFunds(token.address);
  },
};
