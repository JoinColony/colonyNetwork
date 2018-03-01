/* globals artifacts */
import web3Utils from "web3-utils";
import { BN } from "bn.js";

import {
  MANAGER,
  EVALUATOR,
  WORKER,
  MANAGER_PAYOUT,
  EVALUATOR_PAYOUT,
  WORKER_PAYOUT,
  MANAGER_RATING,
  WORKER_RATING,
  RATING_1_SALT,
  RATING_2_SALT,
  MANAGER_ROLE,
  EVALUATOR_ROLE,
  WORKER_ROLE,
  SPECIFICATION_HASH
} from "../helpers/constants";
import { currentBlockTime } from "../helpers/test-helper";

const IColony = artifacts.require("IColony");
const Token = artifacts.require("Token");

export async function setupAssignedTask({
  colonyNetwork,
  colony,
  dueDate = currentBlockTime(),
  domain = 1,
  skill = 0,
  evaluator = EVALUATOR,
  worker = WORKER
}) {
  await colony.makeTask(SPECIFICATION_HASH, domain);
  let taskId = await colony.getTaskCount.call();
  taskId = taskId.toNumber();
  // If the skill is not specified, default to the root global skill
  if (skill === 0) {
    const rootGlobalSkill = await colonyNetwork.getRootGlobalSkillId.call();
    if (rootGlobalSkill === 0) throw new Error("Common Colony is not setup and therefore the root global skill does not exist");
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
}

export async function setupFundedTask({
  colonyNetwork,
  colony,
  token,
  dueDate,
  domain,
  skill,
  evaluator = EVALUATOR,
  worker = WORKER,
  managerPayout = MANAGER_PAYOUT,
  evaluatorPayout = EVALUATOR_PAYOUT,
  workerPayout = WORKER_PAYOUT
}) {
  let tokenAddress;
  if (token === undefined) {
    tokenAddress = await colony.getToken.call();
  } else {
    tokenAddress = token === 0x0 ? 0x0 : token.address;
  }
  const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate, domain, skill, evaluator, worker });
  const task = await colony.getTask.call(taskId);
  const potId = task[6].toNumber();
  const managerPayoutBN = new BN(managerPayout);
  const evaluatorPayoutBN = new BN(evaluatorPayout);
  const workerPayoutBN = new BN(workerPayout);
  const totalPayouts = managerPayoutBN.add(workerPayoutBN).add(evaluatorPayoutBN);
  await colony.moveFundsBetweenPots(1, potId, totalPayouts.toString(), tokenAddress);

  await colony.setTaskManagerPayout(taskId, tokenAddress, managerPayout.toString());

  let txData = await colony.contract.setTaskEvaluatorPayout.getData(taskId, tokenAddress, evaluatorPayout.toString());
  await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
  let transactionId = await colony.getTransactionCount.call();
  await colony.approveTaskChange(transactionId, EVALUATOR_ROLE, { from: evaluator });

  txData = await colony.contract.setTaskWorkerPayout.getData(taskId, tokenAddress, workerPayout.toString());
  await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
  transactionId = await colony.getTransactionCount.call();
  await colony.approveTaskChange(transactionId, WORKER_ROLE, { from: worker });

  return taskId;
}

export async function setupRatedTask({
  colonyNetwork,
  colony,
  token,
  dueDate,
  domain,
  skill,
  evaluator = EVALUATOR,
  worker = WORKER,
  managerPayout = MANAGER_PAYOUT,
  evaluatorPayout = EVALUATOR_PAYOUT,
  workerPayout = WORKER_PAYOUT,
  managerRating = MANAGER_RATING,
  managerRatingSalt = RATING_1_SALT,
  workerRating = WORKER_RATING,
  workerRatingSalt = RATING_2_SALT
}) {
  const taskId = await setupFundedTask({
    colonyNetwork,
    colony,
    token,
    dueDate,
    domain,
    skill,
    evaluator,
    worker,
    managerPayout,
    evaluatorPayout,
    workerPayout
  });
  const WORKER_RATING_SECRET = web3Utils.soliditySha3(workerRatingSalt, workerRating);
  const MANAGER_RATING_SECRET = web3Utils.soliditySha3(managerRatingSalt, managerRating);
  await colony.submitTaskWorkRating(taskId, WORKER_ROLE, WORKER_RATING_SECRET, { from: evaluator });
  await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, MANAGER_RATING_SECRET, { from: worker });
  await colony.revealTaskWorkRating(taskId, WORKER_ROLE, workerRating, workerRatingSalt, { from: evaluator });
  await colony.revealTaskWorkRating(taskId, MANAGER_ROLE, managerRating, managerRatingSalt, { from: worker });
  return taskId;
}

export async function giveUserCLNYTokens(colonyNetwork, address, _amount) {
  const commonColonyAddress = await colonyNetwork.getColony("Common Colony");
  const commonColony = IColony.at(commonColonyAddress);
  const clnyAddress = await commonColony.getToken.call();
  const clny = Token.at(clnyAddress);
  const amount = new BN(_amount);
  const mainStartingBalance = await clny.balanceOf.call(MANAGER);
  const targetStartingBalance = await clny.balanceOf.call(address);
  await commonColony.mintTokens(amount * 3);
  await commonColony.claimColonyFunds(clny.address);
  const taskId = await setupRatedTask({
    colonyNetwork,
    colony: commonColony,
    managerPayout: amount.mul(new BN("2")),
    evaluatorPayout: new BN("0"),
    workerPayout: new BN("0")
  });
  await commonColony.finalizeTask(taskId);
  await commonColony.claimPayout(taskId, 0, clny.address);

  let mainBalance = await clny.balanceOf.call(MANAGER);
  await clny.transfer(
    0x0,
    mainBalance
      .sub(amount)
      .sub(mainStartingBalance)
      .toString()
  );
  await clny.transfer(address, amount.toString());
  mainBalance = await clny.balanceOf.call(MANAGER);
  if (address !== MANAGER) {
    await clny.transfer(0x0, mainBalance.sub(mainStartingBalance).toString());
  }
  const userBalance = await clny.balanceOf.call(address);
  assert.equal(targetStartingBalance.add(amount).toString(), userBalance.toString());
}

export async function fundColonyWithTokens(colony, token, tokenAmount) {
  const colonyToken = await colony.getToken.call();
  if (colonyToken === token.address) {
    await colony.mintTokens(tokenAmount);
  } else {
    await token.mint(tokenAmount);
    await token.transfer(colony.address, tokenAmount);
  }
  await colony.claimColonyFunds(token.address);
}
