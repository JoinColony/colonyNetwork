/* globals artifacts */
import { soliditySha3 } from "web3-utils";
import BN from "bn.js";
import { ethers } from "ethers";

import {
  UINT256_MAX,
  MANAGER_PAYOUT,
  EVALUATOR_PAYOUT,
  WORKER_PAYOUT,
  INITIAL_FUNDING,
  MANAGER_RATING,
  WORKER_RATING,
  RATING_1_SALT,
  RATING_2_SALT,
  MANAGER_ROLE,
  EVALUATOR_ROLE,
  WORKER_ROLE,
  SPECIFICATION_HASH,
  DELIVERABLE_HASH,
} from "./constants";

import { getTokenArgs, web3GetAccounts, getChildSkillIndex } from "./test-helper";
import { executeSignedTaskChange, executeSignedRoleAssignment } from "./task-review-signing";

const IColony = artifacts.require("IColony");
const IMetaColony = artifacts.require("IMetaColony");
const ITokenLocking = artifacts.require("ITokenLocking");
const Token = artifacts.require("Token");
const TokenAuthority = artifacts.require("./TokenAuthority");
const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");
const IColonyNetwork = artifacts.require("IColonyNetwork");

export async function makeTask({ colonyNetwork, colony, hash = SPECIFICATION_HASH, domainId = 1, skillId = 3, dueDate = 0, manager }) {
  const accounts = await web3GetAccounts();
  manager = manager || accounts[0]; // eslint-disable-line no-param-reassign

  let networkAddress;
  if (colonyNetwork === undefined) {
    networkAddress = await colony.getColonyNetwork();
    colonyNetwork = await IColonyNetwork.at(networkAddress); // eslint-disable-line no-param-reassign
  }

  // Only Colony admins are allowed to make Tasks, make the account an admin
  const childSkillIndex = await getChildSkillIndex(colonyNetwork, colony, 1, domainId);

  await colony.setAdministrationRole(1, childSkillIndex, manager, domainId, true);
  const { logs } = await colony.makeTask(1, childSkillIndex, hash, domainId, skillId, dueDate, { from: manager });
  // Reading the ID out of the event triggered by our transaction will allow us to make multiple tasks in parallel in the future.
  return logs.filter((log) => log.event === "TaskAdded")[0].args.taskId;
}

export async function assignRoles({ colony, taskId, manager, evaluator, worker }) {
  if (evaluator && manager !== evaluator) {
    await executeSignedTaskChange({
      colony,
      taskId,
      functionName: "removeTaskEvaluatorRole",
      signers: [manager],
      sigTypes: [0],
      args: [taskId],
    });

    await executeSignedRoleAssignment({
      colony,
      taskId,
      functionName: "setTaskEvaluatorRole",
      signers: [manager, evaluator],
      sigTypes: [0, 0],
      args: [taskId, evaluator],
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
    args: [taskId, worker],
  });
}

export async function submitDeliverableAndRatings({ colony, taskId, managerRating = MANAGER_RATING, workerRating = WORKER_RATING }) {
  const managerRatingSecret = soliditySha3(RATING_1_SALT, managerRating);
  const workerRatingSecret = soliditySha3(RATING_2_SALT, workerRating);

  const evaluatorRole = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
  const workerRole = await colony.getTaskRole(taskId, WORKER_ROLE);

  await colony.submitTaskDeliverableAndRating(taskId, DELIVERABLE_HASH, managerRatingSecret, { from: workerRole.user });
  await colony.submitTaskWorkRating(taskId, WORKER_ROLE, workerRatingSecret, { from: evaluatorRole.user });
  await colony.revealTaskWorkRating(taskId, MANAGER_ROLE, managerRating, RATING_1_SALT, { from: workerRole.user });
  await colony.revealTaskWorkRating(taskId, WORKER_ROLE, workerRating, RATING_2_SALT, { from: evaluatorRole.user });
}

export async function setupAssignedTask({ colonyNetwork, colony, dueDate, domainId = 1, skillId, manager, evaluator, worker }) {
  const accounts = await web3GetAccounts();
  manager = manager || accounts[0]; // eslint-disable-line no-param-reassign
  evaluator = evaluator || manager; // eslint-disable-line no-param-reassign
  worker = worker || accounts[2]; // eslint-disable-line no-param-reassign

  const taskId = await makeTask({ colonyNetwork, colony, dueDate, domainId, skillId, manager });
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
  workerPayout = WORKER_PAYOUT,
}) {
  const accounts = await web3GetAccounts();
  manager = manager || accounts[0]; // eslint-disable-line no-param-reassign
  evaluator = evaluator || manager; // eslint-disable-line no-param-reassign
  worker = worker || accounts[2]; // eslint-disable-line no-param-reassign

  let tokenAddress;
  if (token === undefined) {
    tokenAddress = await colony.getToken();
  } else {
    tokenAddress = token === ethers.constants.AddressZero ? ethers.constants.AddressZero : token.address;
  }

  const taskId = await makeTask({ colonyNetwork, colony, dueDate, domainId, skillId, manager });
  const task = await colony.getTask(taskId);
  const managerPayoutBN = new BN(managerPayout);
  const evaluatorPayoutBN = new BN(evaluatorPayout);
  const workerPayoutBN = new BN(workerPayout);
  const totalPayouts = managerPayoutBN.add(workerPayoutBN).add(evaluatorPayoutBN);

  const childSkillIndex = await getChildSkillIndex(colonyNetwork, colony, 1, task.domainId);
  await colony.setFundingRole(1, UINT256_MAX, manager, 1, true);
  await colony.moveFundsBetweenPots(1, UINT256_MAX, childSkillIndex, 1, task.fundingPotId, totalPayouts, tokenAddress, { from: manager });
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
  workerRating = WORKER_RATING,
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
    workerPayout,
  });

  await submitDeliverableAndRatings({ colony, taskId, evaluator, worker, managerRating, workerRating });
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
  workerRating,
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
    workerRating,
  });

  await colony.finalizeTask(taskId);
  return taskId;
}

export async function giveUserCLNYTokens(colonyNetwork, userAddress, amount) {
  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await IMetaColony.at(metaColonyAddress);
  const clnyAddress = await metaColony.getToken();
  const clnyToken = await Token.at(clnyAddress);

  const accounts = await web3GetAccounts();
  await clnyToken.mint(userAddress, amount, { from: accounts[11] });
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
  const clnyToken = await Token.at(clnyAddress);

  await giveUserCLNYTokens(colonyNetwork, user, amount);
  const tokenLockingAddress = await colonyNetwork.getTokenLocking();
  const tokenLocking = await ITokenLocking.at(tokenLockingAddress);
  await clnyToken.approve(tokenLocking.address, amount, { from: user });
  await tokenLocking.deposit(clnyToken.address, amount, { from: user });
  await colonyNetwork.stakeForMining(amount, { from: user });
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
    await token.mint(colony.address, tokenAmountBN);
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

  // The following are the needed `transfer` function permissions on the locked CLNY that we setup via the TokenAuthority here
  // IColonyNetworkMining: rewardStakers
  // IColony: bootstrapColony, mintTokensForColonyNetwork, claimPayout and claimRewardPayout
  // ITokenLocking: withdraw, deposit
  const tokenAuthority = await TokenAuthority.new(clnyToken.address, metaColonyAddress, [colonyNetwork.address, tokenLockingAddress]);

  await clnyToken.setAuthority(tokenAuthority.address);
  // Set the CLNY token owner to a dedicated account representing the Colony Multisig
  await clnyToken.setOwner(accounts[11]);

  const locked = await clnyToken.locked();
  assert.isTrue(locked);

  await metaColony.addGlobalSkill();

  return { metaColony, clnyToken };
}

export async function unlockCLNYToken(metaColony) {
  const clnyAddress = await metaColony.getToken();
  const clny = await Token.at(clnyAddress);

  // Unlock CLNY
  const accounts = await web3GetAccounts();
  await clny.unlock({ from: accounts[11] });
  const isLocked = await clny.locked();
  assert.isFalse(isLocked);

  // Note: In future when starting to work with an unlocked token, ownership can potentially be transferred to MetaColony
  // await clny.setOwner(accounts[11], { from: accounts[11] });
  // Authority could be cleared as well?
  // await clny.setAuthority(0x0, { from: accounts[11] });
}

export async function setupColonyNetwork() {
  const resolverColonyNetworkDeployed = await Resolver.deployed();
  const deployedColonyNetwork = await IColonyNetwork.at(EtherRouter.address);

  // Get the version resolver and version number from the metacolony deployed during migration
  const deployedMetaColonyAddress = await deployedColonyNetwork.getMetaColony();
  const deployedMetaColony = await IMetaColony.at(deployedMetaColonyAddress);
  const deployedMetaColonyAsEtherRouter = await EtherRouter.at(deployedMetaColonyAddress);
  const colonyVersionResolverAddress = await deployedMetaColonyAsEtherRouter.resolver();
  const version = await deployedMetaColony.version();

  // Make a new ColonyNetwork
  const etherRouter = await EtherRouter.new();
  await etherRouter.setResolver(resolverColonyNetworkDeployed.address);
  const colonyNetwork = await IColonyNetwork.at(etherRouter.address);

  // Initialise with originally deployed version
  await colonyNetwork.initialise(colonyVersionResolverAddress, version);

  // Jumping through these hoops to avoid the need to rewire ReputationMiningCycleResolver.
  const reputationMiningCycleResolverAddress = await deployedColonyNetwork.getMiningResolver();
  await colonyNetwork.setMiningResolver(reputationMiningCycleResolverAddress);

  // Get token-locking router from when it was deployed during migrations
  const deployedTokenLockingAddress = await deployedColonyNetwork.getTokenLocking();
  const deployedTokenLockingAsEtherRouter = await EtherRouter.at(deployedTokenLockingAddress);
  const tokenLockingResolverAddress = await deployedTokenLockingAsEtherRouter.resolver();
  const tokenLockingEtherRouter = await EtherRouter.new();
  await tokenLockingEtherRouter.setResolver(tokenLockingResolverAddress);

  await colonyNetwork.setTokenLocking(tokenLockingEtherRouter.address);
  const tokenLocking = await ITokenLocking.at(tokenLockingEtherRouter.address);
  await tokenLocking.setColonyNetwork(colonyNetwork.address);

  return colonyNetwork;
}

export async function setupRandomToken() {
  const tokenArgs = getTokenArgs();
  const token = await Token.new(...tokenArgs);
  await token.unlock();
  return token;
}

export async function setupRandomColony(colonyNetwork) {
  const token = await setupRandomToken();

  const colony = await setupColony(colonyNetwork, token.address);

  const tokenLockingAddress = await colonyNetwork.getTokenLocking();
  const tokenAuthority = await TokenAuthority.new(token.address, colony.address, [tokenLockingAddress]);
  await token.setAuthority(tokenAuthority.address);

  return { colony, token };
}

export async function setupColony(colonyNetwork, tokenAddress) {
  const { logs } = await colonyNetwork.createColony(tokenAddress, 0, "", "", true);
  const { colonyAddress } = logs[0].args;
  const colony = await IColony.at(colonyAddress);
  return colony;
}
