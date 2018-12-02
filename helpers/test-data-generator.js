/* globals artifacts */
import web3Utils from "web3-utils";
import { BN } from "bn.js";
import { ethers } from "ethers";

import {
  MANAGER_PAYOUT,
  EVALUATOR_PAYOUT,
  WORKER_PAYOUT,
  INITIAL_FUNDING,
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

const { setupColonyVersionResolver } = require("../helpers/upgradable-contracts");

const IColony = artifacts.require("IColony");
const ITokenLocking = artifacts.require("ITokenLocking");
const Token = artifacts.require("Token");
const TokenAuthority = artifacts.require("./TokenAuthority");
const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");
const Colony = artifacts.require("Colony");
const ColonyFunding = artifacts.require("ColonyFunding");
const ColonyTask = artifacts.require("ColonyTask");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ContractRecovery = artifacts.require("ContractRecovery");

export async function makeTask({ colony, hash = SPECIFICATION_HASH, domainId = 1, skillId = 0, dueDate = 0, manager }) {
  const accounts = await web3GetAccounts();
  manager = manager || accounts[0]; // eslint-disable-line no-param-reassign
  // Only Colony admins are allowed to make Tasks, make the account an admin
  await colony.setAdminRole(manager);
  const { logs } = await colony.makeTask(hash, domainId, skillId, dueDate, { from: manager });

  // Reading the ID out of the event triggered by our transaction will allow us to make multiple tasks in parallel in the future.
  return logs.filter(log => log.event === "TaskAdded")[0].args.taskId;
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

export async function assignRoles({ colony, taskId, manager, evaluator, worker }) {
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
}

export async function setupTask({ colonyNetwork, colony, dueDate, domainId = 1, skillId = 0, manager }) {
  // If the skill is not specified, default to the root global skill
  if (skillId === 0) {
    skillId = await colonyNetwork.getRootGlobalSkillId(); // eslint-disable-line no-param-reassign
    if (skillId.toNumber() === 0) throw new Error("Meta Colony is not setup and therefore the root global skill does not exist");
  }

  const taskId = await makeTask({ colony, dueDate, domainId, skillId, manager });

  return taskId;
}

export async function setupAssignedTask({ colonyNetwork, colony, dueDate, domainId = 1, skillId = 0, manager, evaluator, worker }) {
  const accounts = await web3GetAccounts();
  manager = manager || accounts[0]; // eslint-disable-line no-param-reassign
  evaluator = evaluator || manager; // eslint-disable-line no-param-reassign
  worker = worker || accounts[2]; // eslint-disable-line no-param-reassign

  const taskId = await setupTask({ colonyNetwork, colony, dueDate, domainId, skillId, manager });
  await assignRoles({ colony, taskId, manager, evaluator, worker });

  return taskId;
}
export async function setupFundedTask({
  colonyNetwork,
  colony,
  token,
  dueDate,
  domainId,
  skillId,
  manager,
  evaluator,
  worker,
  managerPayout = MANAGER_PAYOUT,
  evaluatorPayout = EVALUATOR_PAYOUT,
  workerPayout = WORKER_PAYOUT
}) {
  const accounts = await web3GetAccounts();
  manager = manager || accounts[0]; // eslint-disable-line no-param-reassign
  evaluator = evaluator || manager; // eslint-disable-line no-param-reassign
  worker = worker || accounts[2]; // eslint-disable-line no-param-reassign

  let tokenAddress;
  if (token === undefined) {
    tokenAddress = await colony.getToken();
  } else {
    tokenAddress = token === ZERO_ADDRESS ? ZERO_ADDRESS : token.address;
  }

  const taskId = await setupTask({ colonyNetwork, colony, dueDate, domainId, skillId, manager });
  const task = await colony.getTask(taskId);
  const potId = task[5];
  const managerPayoutBN = new BN(managerPayout);
  const evaluatorPayoutBN = new BN(evaluatorPayout);
  const workerPayoutBN = new BN(workerPayout);
  const totalPayouts = managerPayoutBN.add(workerPayoutBN).add(evaluatorPayoutBN);
  await colony.moveFundsBetweenPots(1, potId, totalPayouts, tokenAddress);
  await colony.setAllTaskPayouts(taskId, tokenAddress, managerPayout, evaluatorPayout, workerPayout, { from: manager });
  await assignRoles({ colony, taskId, manager, evaluator, worker });

  return taskId;
}

export async function setupRatedTask({
  colonyNetwork,
  colony,
  token,
  dueDate,
  domainId,
  skillId,
  manager,
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
  manager = manager || accounts[0]; // eslint-disable-line no-param-reassign
  evaluator = evaluator || manager; // eslint-disable-line no-param-reassign
  worker = worker || accounts[2]; // eslint-disable-line no-param-reassign

  const taskId = await setupFundedTask({
    colonyNetwork,
    colony,
    token,
    dueDate,
    domainId,
    skillId,
    manager,
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

export async function setupFinalizedTask({
  colonyNetwork,
  colony,
  token,
  dueDate,
  domainId,
  skillId,
  manager,
  evaluator,
  worker,
  managerPayout,
  evaluatorPayout,
  workerPayout,
  managerRating,
  managerRatingSalt,
  workerRating,
  workerRatingSalt
}) {
  const accounts = await web3GetAccounts();
  manager = manager || accounts[0]; // eslint-disable-line no-param-reassign
  evaluator = evaluator || manager; // eslint-disable-line no-param-reassign
  worker = worker || accounts[2]; // eslint-disable-line no-param-reassign

  const taskId = await setupRatedTask({
    colonyNetwork,
    colony,
    token,
    dueDate,
    domainId,
    skillId,
    manager,
    evaluator,
    worker,
    managerPayout,
    evaluatorPayout,
    workerPayout,
    managerRating,
    managerRatingSalt,
    workerRating,
    workerRatingSalt
  });

  await colony.finalizeTask(taskId);
  return taskId;
}

export async function giveUserCLNYTokens(colonyNetwork, userAddress, amount) {
  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await IMetaColony.at(metaColonyAddress);
  const clnyAddress = await metaColony.getToken();
  const clny = await Token.at(clnyAddress);

  await clny.mint(amount, { from: accounts[11] });
  await clny.transfer(userAddress, amount, { from: accounts[11] });
}

export async function giveUserCLNYTokensAndStake(colonyNetwork, user, _amount) {
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

  await giveUserCLNYTokens(colonyNetwork, user, amount);
  const tokenLockingAddress = await colonyNetwork.getTokenLocking();
  const tokenLocking = await ITokenLocking.at(tokenLockingAddress);
  await clny.approve(tokenLocking.address, amount, { from: user });
  await tokenLocking.deposit(clny.address, amount, { from: user });
}

export async function fundColonyWithTokens(colony, token, tokenAmount = INITIAL_FUNDING) {
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

export async function setupMetaColonyWithLockedCLNYToken(colonyNetwork) {
  const accounts = await web3GetAccounts();
  const clnyToken = await Token.new("Colony Network Token", "CLNY", 18);
  await colonyNetwork.createMetaColony(clnyToken.address);
  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await IMetaColony.at(metaColonyAddress);
  await metaColony.setNetworkFeeInverse(100);

  const tokenLockingAddress = await colonyNetwork.getTokenLocking();
  const reputationMinerTestAccounts = accounts.slice(3, 11);
  // Second parameter is the vesting contract which is not the subject of this integration testing so passing in 0x0
  const tokenAuthority = await TokenAuthority.new(
    clnyToken.address,
    colonyNetwork.address,
    metaColonyAddress,
    tokenLockingAddress,
    ZERO_ADDRESS,
    reputationMinerTestAccounts
  );

  await clnyToken.setAuthority(tokenAuthority.address);
  // Set the CLNY token owner to a dedicated account representing the Colony Multisig
  await clnyToken.setOwner(accounts[11]);

  const locked = await clnyToken.locked();
  assert.isTrue(locked);

  return { metaColony, clnyToken };
}

export async function setupMetaColonyWithUNLockedCLNYToken(colonyNetwork) {
  const { metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork);
  // Unlock CLNY and Transfer ownership to MetaColony
  const accounts = await web3GetAccounts();
  await clnyToken.unlock({ from: accounts[11] });
  await clnyToken.setOwner(metaColony.address, { from: accounts[11] });
  // TODO: Shoult we clear the Authority as well?
  // await clnyToken.setAuthority(0x0, { from: accounts[11] });

  const locked = await clnyToken.locked();
  assert.isFalse(locked);

  return { metaColony, clnyToken };
}

export async function setupColonyNetwork() {
  const resolverColonyNetworkDeployed = await Resolver.deployed();
  const colonyTemplate = await Colony.new();
  const colonyFunding = await ColonyFunding.new();
  const colonyTask = await ColonyTask.new();
  const resolver = await Resolver.new();
  const contractRecovery = await ContractRecovery.new();
  const etherRouter = await EtherRouter.new();
  await etherRouter.setResolver(resolverColonyNetworkDeployed.address);

  const colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  await setupColonyVersionResolver(colonyTemplate, colonyTask, colonyFunding, contractRecovery, resolver);
  await colonyNetwork.initialise(resolver.address);
  // Jumping through these hoops to avoid the need to rewire ReputationMiningCycleResolver.
  const deployedColonyNetwork = await IColonyNetwork.at(EtherRouter.address);
  const reputationMiningCycleResolverAddress = await deployedColonyNetwork.getMiningResolver();
  await colonyNetwork.setMiningResolver(reputationMiningCycleResolverAddress);

  return colonyNetwork;
}
