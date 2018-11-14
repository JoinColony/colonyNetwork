/* globals artifacts */
import web3Utils from "web3-utils";
import { BN } from "bn.js";

import {
  MANAGER_PAYOUT,
  EVALUATOR_PAYOUT,
  WORKER_PAYOUT,
  MANAGER_RATING,
  WORKER_RATING,
  RATING_1_SALT,
  RATING_2_SALT,
  MANAGER_ROLE,
  WORKER_ROLE,
  SPECIFICATION_HASH,
  DELIVERABLE_HASH,
  ZERO_ADDRESS
} from "./constants";
import { createSignatures, createSignaturesTrezor, web3GetAccounts } from "./test-helper";

const ethers = require("ethers");

const IMetaColony = artifacts.require("IMetaColony");
const ITokenLocking = artifacts.require("ITokenLocking");
const Token = artifacts.require("Token");

export async function makeTask({ colony, hash = SPECIFICATION_HASH, domainId = 1, skillId = 0, dueDate = 0 }) {
  const { logs } = await colony.makeTask(hash, domainId, skillId, dueDate);
  // Reading the ID out of the event triggered by our transaction will allow us to make multiple tasks in parallel in the future.
  return logs.filter(log => log.event === "TaskAdded")[0].args.id;
}

async function getSigsAndTransactionData({ colony, taskId, functionName, signers, sigTypes, args }) {
  // We have to pass in an ethers BN because of https://github.com/ethereum/web3.js/issues/1920
  const ethersBNTaskId = ethers.utils.bigNumberify(taskId.toString());
  const convertedArgs = [];
  args.forEach(arg => {
    if (Number.isInteger(arg)) {
      const convertedArg = ethers.utils.bigNumberify(arg);
      convertedArgs.push(convertedArg);
    } else if (web3.utils.isBN(arg) || web3.utils.isBigNumber(arg)) {
      const convertedArg = ethers.utils.bigNumberify(arg.toString());
      convertedArgs.push(convertedArg);
    } else {
      convertedArgs.push(arg);
    }
  });

  const txData = await colony.contract.methods[functionName](...convertedArgs).encodeABI();
  const sigsPromises = sigTypes.map((type, i) => {
    if (type === 0) {
      return createSignatures(colony, ethersBNTaskId, [signers[i]], 0, txData);
    }
    return createSignaturesTrezor(colony, ethersBNTaskId, [signers[i]], 0, txData);
  });
  const sigs = await Promise.all(sigsPromises);
  const sigV = sigs.map(sig => sig.sigV[0]);
  const sigR = sigs.map(sig => sig.sigR[0]);
  const sigS = sigs.map(sig => sig.sigS[0]);
  return { sigV, sigR, sigS, txData };
}

export async function executeSignedTaskChange({ colony, taskId, functionName, signers, sigTypes, args }) {
  const { sigV, sigR, sigS, txData } = await getSigsAndTransactionData({ colony, taskId, functionName, signers, sigTypes, args });
  return colony.executeTaskChange(sigV, sigR, sigS, sigTypes, 0, txData);
}

export async function executeSignedRoleAssignment({ colony, taskId, functionName, signers, sigTypes, args }) {
  const { sigV, sigR, sigS, txData } = await getSigsAndTransactionData({ colony, taskId, functionName, signers, sigTypes, args });
  return colony.executeTaskRoleAssignment(sigV, sigR, sigS, sigTypes, 0, txData);
}

export async function setupAssignedTask({ colonyNetwork, colony, dueDate, domain = 1, skill = 0, evaluator, worker }) {
  const accounts = await web3GetAccounts();
  const manager = accounts[0];
  evaluator = evaluator || manager; // eslint-disable-line no-param-reassign
  worker = worker || accounts[2]; // eslint-disable-line no-param-reassign

  const taskId = await makeTask({ colony, domainId: domain });
  // If the skill is not specified, default to the root global skill
  if (skill === 0) {
    const rootGlobalSkill = await colonyNetwork.getRootGlobalSkillId();
    if (rootGlobalSkill.isZero()) throw new Error("Meta Colony is not setup and therefore the root global skill does not exist");

    await executeSignedTaskChange({
      colony,
      taskId,
      functionName: "setTaskSkill",
      signers: [manager],
      sigTypes: [0],
      args: [taskId, rootGlobalSkill]
    });
  } else {
    await executeSignedTaskChange({
      colony,
      taskId,
      functionName: "setTaskSkill",
      signers: [manager],
      sigTypes: [0],
      args: [taskId, skill]
    });
  }

  if (manager !== evaluator) {
    await executeSignedTaskChange({
      colony,
      taskId,
      functionName: "removeTaskEvaluatorRole",
      signers: [manager],
      sigTypes: [0],
      args: [taskId]
    });

    await executeSignedRoleAssignment({
      colony,
      taskId,
      functionName: "setTaskEvaluatorRole",
      signers: [manager, evaluator],
      sigTypes: [0, 0],
      args: [taskId, evaluator]
    });
  }

  const signers = manager === worker ? [manager] : [manager, worker];
  const sigTypes = Array.from({ length: signers.length }, () => 0);

  await executeSignedRoleAssignment({
    colony,
    taskId,
    functionName: "setTaskWorkerRole",
    signers,
    sigTypes,
    args: [taskId, worker]
  });

  const dueDateTimestamp = dueDate;
  if (dueDateTimestamp) {
    await executeSignedTaskChange({
      colony,
      taskId,
      functionName: "setTaskDueDate",
      signers,
      sigTypes,
      args: [taskId, dueDateTimestamp]
    });
  }
  return taskId;
}

export async function setupFundedTask({
  colonyNetwork,
  colony,
  token,
  dueDate,
  domain,
  skill,
  evaluator,
  worker,
  managerPayout = MANAGER_PAYOUT,
  evaluatorPayout = EVALUATOR_PAYOUT,
  workerPayout = WORKER_PAYOUT
}) {
  const accounts = await web3GetAccounts();
  const manager = accounts[0];
  evaluator = evaluator || manager; // eslint-disable-line no-param-reassign
  worker = worker || accounts[2]; // eslint-disable-line no-param-reassign

  let tokenAddress;
  if (token === undefined) {
    tokenAddress = await colony.getToken();
  } else {
    tokenAddress = token === ZERO_ADDRESS ? ZERO_ADDRESS : token.address;
  }
  const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate, domain, skill, evaluator, worker });
  const task = await colony.getTask(taskId);
  const potId = task[5];
  const managerPayoutBN = new BN(managerPayout);
  const evaluatorPayoutBN = new BN(evaluatorPayout);
  const workerPayoutBN = new BN(workerPayout);
  const totalPayouts = managerPayoutBN.add(workerPayoutBN).add(evaluatorPayoutBN);
  await colony.moveFundsBetweenPots(1, potId, totalPayouts.toString(), tokenAddress);

  await executeSignedTaskChange({
    colony,
    taskId,
    functionName: "setTaskManagerPayout",
    signers: [manager],
    sigTypes: [0],
    args: [taskId, tokenAddress, managerPayout.toString()]
  });

  let signers = manager === evaluator ? [manager] : [manager, evaluator];
  let sigTypes = Array.from({ length: signers.length }, () => 0);

  await executeSignedTaskChange({
    colony,
    taskId,
    functionName: "setTaskEvaluatorPayout",
    signers,
    sigTypes,
    args: [taskId, tokenAddress, evaluatorPayout.toString()]
  });

  signers = manager === worker ? [manager] : [manager, worker];
  sigTypes = Array.from({ length: signers.length }, () => 0);

  await executeSignedTaskChange({
    colony,
    taskId,
    functionName: "setTaskWorkerPayout",
    signers,
    sigTypes,
    args: [taskId, tokenAddress, workerPayout.toString()]
  });
  return taskId;
}

export async function setupRatedTask({
  colonyNetwork,
  colony,
  token,
  dueDate,
  domain,
  skill,
  evaluator,
  worker,
  managerPayout = MANAGER_PAYOUT,
  evaluatorPayout = EVALUATOR_PAYOUT,
  workerPayout = WORKER_PAYOUT,
  managerRating = MANAGER_RATING,
  managerRatingSalt = RATING_1_SALT,
  workerRating = WORKER_RATING,
  workerRatingSalt = RATING_2_SALT
}) {
  const accounts = await web3GetAccounts();
  const manager = accounts[0];
  evaluator = evaluator || manager; // eslint-disable-line no-param-reassign
  worker = worker || accounts[2]; // eslint-disable-line no-param-reassign

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

  await colony.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: worker });

  const WORKER_RATING_SECRET = web3Utils.soliditySha3(workerRatingSalt, workerRating);
  const MANAGER_RATING_SECRET = web3Utils.soliditySha3(managerRatingSalt, managerRating);
  await colony.submitTaskWorkRating(taskId, WORKER_ROLE, WORKER_RATING_SECRET, { from: evaluator });
  await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, MANAGER_RATING_SECRET, { from: worker });
  await colony.revealTaskWorkRating(taskId, WORKER_ROLE, workerRating, workerRatingSalt, { from: evaluator });
  await colony.revealTaskWorkRating(taskId, MANAGER_ROLE, managerRating, managerRatingSalt, { from: worker });
  return taskId;
}

export async function giveUserCLNYTokens(colonyNetwork, address, _amount) {
  let amount;
  if (web3.utils.isBN(_amount)) {
    amount = _amount;
  } else {
    amount = new BN(_amount);
  }

  const accounts = await web3GetAccounts();
  const manager = accounts[0];
  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await IMetaColony.at(metaColonyAddress);
  const clnyAddress = await metaColony.getToken();
  const clny = await Token.at(clnyAddress);
  const mainStartingBalance = await clny.balanceOf(manager);
  const targetStartingBalance = await clny.balanceOf(address);
  await metaColony.mintTokens(amount.muln(3).toString());

  await metaColony.claimColonyFunds(clny.address);
  const taskId = await setupRatedTask({
    colonyNetwork,
    colony: metaColony, // NOTE: CLNY is native token
    managerPayout: amount.mul(new BN("2")),
    evaluatorPayout: new BN("0"),
    workerPayout: new BN("0")
  });
  await metaColony.finalizeTask(taskId);
  await metaColony.claimPayout(taskId, MANAGER_ROLE, clny.address);

  let mainBalance = await clny.balanceOf(manager);
  await clny.transfer(
    ZERO_ADDRESS,
    mainBalance
      .sub(amount)
      .sub(mainStartingBalance)
      .toString()
  );
  await clny.transfer(address, amount.toString());
  mainBalance = await clny.balanceOf(manager);
  if (address !== manager) {
    await clny.transfer(ZERO_ADDRESS, mainBalance.sub(mainStartingBalance).toString());
  }
  const userBalance = await clny.balanceOf(address);
  assert.equal(targetStartingBalance.add(amount).toString(), userBalance.toString());
}

export async function giveUserCLNYTokensAndStake(colonyNetwork, address, _amount) {
  let amount;
  if (web3.utils.isBN(_amount)) {
    amount = _amount;
  } else {
    amount = new BN(_amount);
  }

  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await IMetaColony.at(metaColonyAddress);
  const clnyAddress = await metaColony.getToken();
  const clny = await Token.at(clnyAddress);

  await giveUserCLNYTokens(colonyNetwork, address, amount);
  const tokenLockingAddress = await colonyNetwork.getTokenLocking();
  const tokenLocking = await ITokenLocking.at(tokenLockingAddress);
  await clny.approve(tokenLocking.address, amount, { from: address });
  await tokenLocking.deposit(clny.address, amount, { from: address });
}

export async function fundColonyWithTokens(colony, token, tokenAmount) {
  // We get input either a plan JS number or a BN.js instance. Ensure we always pass on BN.js
  let tokenAmountBN;
  if (web3.utils.isBN(tokenAmount)) {
    tokenAmountBN = tokenAmount;
  } else {
    tokenAmountBN = new BN(tokenAmount);
  }

  const colonyToken = await colony.getToken();
  if (colonyToken === token.address) {
    await colony.mintTokens(tokenAmountBN);
  } else {
    await token.mint(tokenAmountBN);
    await token.transfer(colony.address, tokenAmountBN);
  }
  await colony.claimColonyFunds(token.address);
}
