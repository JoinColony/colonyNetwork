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
import { currentBlockTime, createSignatures } from "../helpers/test-helper";

const IColony = artifacts.require("IColony");
const Token = artifacts.require("Token");

export async function setupAssignedTask({ colonyNetwork, colony, dueDate, domain = 1, skill = 0, evaluator = EVALUATOR, worker = WORKER }) {
  const specificationHash = SPECIFICATION_HASH;
  const tx = await colony.makeTask(specificationHash, domain);
  // Reading the ID out of the event triggered by our transaction will allow us to make multiple tasks in parallel in the future.
  const taskId = tx.logs[0].args.id.toNumber();
  // If the skill is not specified, default to the root global skill
  if (skill === 0) {
    const rootGlobalSkill = await colonyNetwork.getRootGlobalSkillId.call();
    if (rootGlobalSkill.toNumber() === 0) throw new Error("Meta Colony is not setup and therefore the root global skill does not exist");
    await colony.setTaskSkill(taskId, rootGlobalSkill);
  } else {
    await colony.setTaskSkill(taskId, skill);
  }
  await colony.setTaskRoleUser(taskId, EVALUATOR_ROLE, evaluator);
  await colony.setTaskRoleUser(taskId, WORKER_ROLE, worker);

  let dueDateTimestamp = dueDate;
  if (!dueDateTimestamp) {
    dueDateTimestamp = await currentBlockTime();
  }
  const txData = await colony.contract.setTaskDueDate.getData(taskId, dueDateTimestamp);
  const signers = MANAGER === worker ? [MANAGER] : [MANAGER, worker];
  const sigs = await createSignatures(colony, taskId, signers, 0, txData);
  const signatureTypes = Array.from({ length: signers.length }, () => 0);
  await colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, signatureTypes, 0, txData);
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
  let txData;
  let sigs;

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

  txData = await colony.contract.setTaskEvaluatorPayout.getData(taskId, tokenAddress, evaluatorPayout.toString());
  let signers = MANAGER === evaluator ? [MANAGER] : [MANAGER, evaluator];
  sigs = await createSignatures(colony, taskId, signers, 0, txData);
  let signatureTypes = Array.from({ length: signers.length }, () => 0);
  await colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, signatureTypes, 0, txData);

  txData = await colony.contract.setTaskWorkerPayout.getData(taskId, tokenAddress, workerPayout.toString());
  signers = MANAGER === worker ? [MANAGER] : [MANAGER, worker];
  sigs = await createSignatures(colony, taskId, signers, 0, txData);
  signatureTypes = Array.from({ length: signers.length }, () => 0);
  await colony.executeTaskChange(sigs.sigV, sigs.sigR, sigs.sigS, signatureTypes, 0, txData);
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
  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = IColony.at(metaColonyAddress);
  const clnyAddress = await metaColony.getToken.call();
  const clny = Token.at(clnyAddress);
  const amount = new BN(_amount);
  const mainStartingBalance = await clny.balanceOf.call(MANAGER);
  const targetStartingBalance = await clny.balanceOf.call(address);
  await metaColony.mintTokens(amount * 3);
  await metaColony.claimColonyFunds(clny.address);
  const taskId = await setupRatedTask({
    colonyNetwork,
    colony: metaColony,
    managerPayout: amount.mul(new BN("2")),
    evaluatorPayout: new BN("0"),
    workerPayout: new BN("0")
  });
  await metaColony.finalizeTask(taskId);
  await metaColony.claimPayout(taskId, 0, clny.address);

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

export async function giveUserCLNYTokensAndStake(colonyNetwork, address, _amount) {
  const metaColonyAddress = await colonyNetwork.getMetaColony.call();
  const metaColony = IColony.at(metaColonyAddress);
  const clnyAddress = await metaColony.getToken.call();
  const clny = Token.at(clnyAddress);

  await giveUserCLNYTokens(colonyNetwork, address, _amount);
  await clny.approve(colonyNetwork.address, _amount.toString(), { from: address });
  await colonyNetwork.deposit(_amount.toString(), { from: address });
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
