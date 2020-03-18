/* globals artifacts */
import shortid from "shortid";
import chai from "chai";
import { asciiToHex } from "web3-utils";
import BN from "bn.js";

import { UINT256_MAX, MIN_STAKE, MINING_CYCLE_DURATION, DEFAULT_STAKE } from "./constants";

const IColony = artifacts.require("IColony");
const IMetaColony = artifacts.require("IMetaColony");
const ITokenLocking = artifacts.require("ITokenLocking");
const Token = artifacts.require("Token");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const NoLimitSubdomains = artifacts.require("NoLimitSubdomains");
const TaskSkillEditing = artifacts.require("TaskSkillEditing");
const Resolver = artifacts.require("Resolver");
const ContractEditing = artifacts.require("ContractEditing");

const { expect } = chai;

export function web3GetNetwork() {
  return new Promise((resolve, reject) => {
    web3.eth.net.getId((err, res) => {
      if (err !== null) return reject(err);
      return resolve(res);
    });
  });
}

export function web3GetClient() {
  return new Promise((resolve, reject) => {
    web3.eth.getNodeInfo((err, res) => {
      if (err !== null) return reject(err);
      return resolve(res);
    });
  });
}

export function web3GetBalance(account) {
  return new Promise((resolve, reject) => {
    web3.eth.getBalance(account, (err, res) => {
      if (err !== null) return reject(err);
      return resolve(res);
    });
  });
}

export function web3GetStorageAt(address, position) {
  return new Promise((resolve, reject) => {
    web3.eth.getStorageAt(address, position, (err, res) => {
      if (err !== null) return reject(err);
      return resolve(res);
    });
  });
}

export function web3GetTransaction(txid) {
  return new Promise((resolve, reject) => {
    web3.eth.getTransaction(txid, (err, res) => {
      if (err !== null) return reject(err);
      return resolve(res);
    });
  });
}

export function web3GetTransactionReceipt(txid) {
  return new Promise((resolve, reject) => {
    web3.eth.getTransactionReceipt(txid, (err, res) => {
      if (err !== null) return reject(err);
      return resolve(res);
    });
  });
}

export function web3GetFirstTransactionHashFromLastBlock() {
  return new Promise((resolve, reject) => {
    web3.eth.getBlock("latest", true, (err, res) => {
      if (err !== null) return reject(err);
      return resolve(res.transactions[0].hash);
    });
  });
}

export function web3GetCode(a) {
  return new Promise((resolve, reject) => {
    web3.eth.getCode(a, (err, res) => {
      if (err !== null) return reject(err);
      return resolve(res);
    });
  });
}

export function web3GetAccounts() {
  return new Promise((resolve, reject) => {
    web3.eth.getAccounts((err, res) => {
      if (err !== null) return reject(err);
      return resolve(res);
    });
  });
}

export function web3GetRawCall(params) {
  const packet = {
    jsonrpc: "2.0",
    method: "eth_call",
    params: [params],
    id: new Date().getTime()
  };

  return new Promise((resolve, reject) => {
    web3.currentProvider.send(packet, (err, res) => {
      if (err !== null) return reject(err);
      return resolve(res);
    });
  });
}

// Borrowed from `truffle` https://github.com/trufflesuite/truffle/blob/next/packages/truffle-contract/lib/reason.js
export function extractReasonString(res) {
  if (!res || (!res.error && !res.result)) return "";

  const errorStringHash = "0x08c379a0";

  const isObject = res && typeof res === "object" && res.error && res.error.data;
  const isString = res && typeof res === "object" && typeof res.result === "string";

  if (isObject) {
    const { data } = res.error;
    const hash = Object.keys(data)[0];

    if (data[hash].return && data[hash].return.includes(errorStringHash)) {
      return web3.eth.abi.decodeParameter("string", data[hash].return.slice(10));
    }
  } else if (isString && res.result.includes(errorStringHash)) {
    return web3.eth.abi.decodeParameter("string", res.result.slice(10));
  }
  return "";
}

export async function checkErrorRevert(promise, errorMessage) {
  // There is a discrepancy between how ganache-cli handles errors
  // (throwing an exception all the way up to these tests) and how geth/parity handle them
  // (still making a valid transaction and returning a txid). For the explanation of why
  // See https://github.com/ethereumjs/testrpc/issues/39
  //
  // Obviously, we want our tests to pass on all, so this is a bit of a problem.
  // We have to have this special function that we use to catch the error.
  let receipt;
  let reason;
  try {
    ({ receipt } = await promise);
    // If the promise is from Truffle, then we have the receipt already.
    // If this tx has come from the mining client, the promise has just resolved to a tx hash and we need to do the following
    if (!receipt) {
      const txid = await promise;
      receipt = await web3GetTransactionReceipt(txid);
    }
  } catch (err) {
    ({ receipt, reason } = err);
    expect(reason).to.equal(errorMessage);
  }
  // Check the receipt `status` to ensure transaction failed.
  expect(receipt.status, `Transaction succeeded, but expected error ${errorMessage}`).to.be.false;
}

export async function checkErrorRevertEthers(promise, errorMessage) {
  let receipt;
  try {
    receipt = await promise;
  } catch (err) {
    const txid = err.transactionHash;
    const tx = await web3GetTransaction(txid);
    const response = await web3GetRawCall({ from: tx.from, to: tx.to, data: tx.input, gas: tx.gas, value: tx.value });
    const reason = extractReasonString(response);
    expect(reason).to.equal(errorMessage);
    return;
  }

  expect(receipt.status, `Transaction succeeded, but expected to fail with: ${errorMessage}`).to.be.zero;
}

export async function checkSuccessEthers(promise, errorMessage) {
  let receipt;
  try {
    receipt = await promise;
  } catch (err) {
    receipt = err;
  }

  if (receipt.status === 1) {
    return;
  }
  const txid = receipt.transactionHash;
  const tx = await web3GetTransaction(txid);
  const response = await web3GetRawCall({ from: tx.from, to: tx.to, data: tx.input, gas: tx.gas, value: tx.value });
  const reason = extractReasonString(response);
  expect(receipt.status, `${errorMessage} with error ${reason}`).to.equal(1);
}

export function getRandomString(_length) {
  const length = _length || 7;
  let randString = "";
  while (randString.length < length) {
    randString += shortid
      .generate()
      .replace(/_/g, "")
      .toLowerCase();
  }
  return randString.slice(0, length);
}

export function getTokenArgs() {
  const name = asciiToHex(getRandomString(5));
  const symbol = asciiToHex(getRandomString(3));
  return [name, symbol, 18];
}

export async function currentBlockTime() {
  const p = new Promise((resolve, reject) => {
    web3.eth.getBlock("latest", (err, res) => {
      if (err) {
        return reject(err);
      }
      return resolve(res.timestamp);
    });
  });
  return p;
}

export async function currentBlock() {
  const p = new Promise((resolve, reject) => {
    web3.eth.getBlock("latest", (err, res) => {
      if (err) {
        return reject(err);
      }
      return resolve(res);
    });
  });
  return p;
}

export async function getBlockTime(blockNumber) {
  const p = new Promise((resolve, reject) => {
    web3.eth.getBlock(blockNumber, (err, res) => {
      if (err) {
        return reject(err);
      }
      return resolve(res.timestamp);
    });
  });
  return p;
}

export async function expectEvent(tx, eventName) {
  const { logs } = await tx;
  const event = logs.find(e => e.event === eventName);
  return expect(event).to.exist;
}

export async function expectAllEvents(tx, eventNames) {
  const { logs } = await tx;
  const events = eventNames.every(eventName => logs.find(e => e.event === eventName));
  return expect(events).to.be.true;
}

export async function forwardTime(seconds, test) {
  const client = await web3GetClient();
  const p = new Promise((resolve, reject) => {
    if (client.indexOf("TestRPC") === -1) {
      resolve(test.skip());
    } else {
      // console.log(`Forwarding time with ${seconds}s ...`);
      web3.currentProvider.send(
        {
          jsonrpc: "2.0",
          method: "evm_increaseTime",
          params: [seconds],
          id: 0
        },
        err => {
          if (err) {
            return reject(err);
          }
          return web3.currentProvider.send(
            {
              jsonrpc: "2.0",
              method: "evm_mine",
              params: [],
              id: 0
            },
            (err2, res) => {
              if (err2) {
                return reject(err2);
              }
              return resolve(res);
            }
          );
        }
      );
    }
  });
  return p;
}

export async function mineBlock() {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "evm_mine",
        params: [],
        id: new Date().getTime()
      },
      err => {
        if (err) {
          return reject(err);
        }
        return resolve();
      }
    );
  });
}

export function bnSqrt(bn, isGreater) {
  let a = bn.addn(1).divn(2);
  let b = bn;
  while (a.lt(b)) {
    b = a;
    a = bn
      .div(a)
      .add(a)
      .divn(2);
  }

  if (isGreater && b.mul(b).lt(bn)) {
    b = b.addn(1);
  }
  return b;
}

export function makeReputationKey(colonyAddress, skillBN, accountAddress = undefined) {
  if (!BN.isBN(skillBN)) {
    skillBN = new BN(skillBN.toString()); // eslint-disable-line no-param-reassign
  }
  let key = `0x`;
  key += `${new BN(colonyAddress.slice(2), 16).toString(16, 40)}`; // Colony address as bytes
  key += `${skillBN.toString(16, 64)}`; // SkillId as uint256
  if (accountAddress === undefined) {
    key += `${new BN(0, 16).toString(16, 40)}`; // Colony address as 0 bytes
  } else {
    key += `${new BN(accountAddress.slice(2), 16).toString(16, 40)}`; // User address as bytes
  }
  return key;
}

// Note: value can be anything with a `.toString()` method -- a string, number, or BN.
export function makeReputationValue(value, reputationId) {
  return `0x${new BN(value.toString()).toString(16, 64)}${new BN(reputationId).toString(16, 64)}`;
}

export async function getValidEntryNumber(colonyNetwork, account, hash, startingEntryNumber = 1) {
  const repCycle = await getActiveRepCycle(colonyNetwork);

  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await IColony.at(metaColonyAddress);
  const clnyAddress = await metaColony.getToken();

  // First, get user balance
  const tokenLockingAddress = await colonyNetwork.getTokenLocking();
  const tokenLocking = await ITokenLocking.at(tokenLockingAddress);
  const userLockInformation = await tokenLocking.getUserLock(clnyAddress, account);
  const userBalance = new BN(userLockInformation.balance);

  // What's the largest entry they can submit?
  const nIter = userBalance.div(MIN_STAKE);
  // Work out the target
  const constant = UINT256_MAX.divn(MINING_CYCLE_DURATION);
  const reputationMiningWindowOpenTimestamp = await repCycle.getReputationMiningWindowOpenTimestamp();

  // Iterate from `startingEntryNumber ` up until the largest entry, until we find one we can submit now
  // or return an error
  const timestamp = await currentBlockTime();
  for (let i = startingEntryNumber; i <= nIter; i += 1) {
    const entryHash = await repCycle.getEntryHash(account, i, hash);
    const target = new BN(timestamp).sub(reputationMiningWindowOpenTimestamp).mul(constant);
    if (new BN(entryHash.slice(2), 16).lt(target)) {
      return i;
    }
  }
  return new Error("No valid submission found");
}

export async function submitAndForwardTimeToDispute(clients, test) {
  // For there to be a dispute we need at least 2 competing submisssions
  expect(clients.length).to.be.above(1);

  await forwardTime(MINING_CYCLE_DURATION / 2, test);
  for (let i = 0; i < clients.length; i += 1) {
    await clients[i].addLogContentsToReputationTree();
    await clients[i].submitRootHash();
  }
  await forwardTime(MINING_CYCLE_DURATION / 2, test);

  // If there are multiple submissions, ensure they are all different
  const submissionsPromise = clients.map(async client => {
    const rootHash = await client.getRootHash();
    const nNodes = await client.getRootHashNNodes();
    const jrh = await client.justificationTree.getRootHash();
    return rootHash + nNodes + jrh;
  });

  const submissions = await Promise.all(submissionsPromise);
  const uniqueSubmissions = [...new Set(submissions)];
  expect(submissions.length, "Submissions from clients are equal, surprisingly").to.be.equal(uniqueSubmissions.length);
}

export async function runBinarySearch(client1, client2) {
  // Loop while doing the binary search, checking we were successful at each point
  // Binary search will error when it is complete.
  let noError = true;
  while (noError) {
    try {
      await client1.respondToBinarySearchForChallenge();
    } catch (err) {
      noError = false;
    }

    try {
      await client2.respondToBinarySearchForChallenge();
    } catch (err) {
      noError = false;
    }
  }
}

export async function getActiveRepCycle(colonyNetwork) {
  const addr = await colonyNetwork.getReputationMiningCycle(true);
  const repCycle = await IReputationMiningCycle.at(addr);
  return repCycle;
}

export async function advanceMiningCycleNoContest({ colonyNetwork, client, minerAddress, test }) {
  await forwardTime(MINING_CYCLE_DURATION, test);
  const repCycle = await getActiveRepCycle(colonyNetwork);

  if (client !== undefined) {
    await client.addLogContentsToReputationTree();
    await client.submitRootHash();
  } else {
    const accounts = await web3GetAccounts();
    minerAddress = minerAddress || accounts[5]; // eslint-disable-line no-param-reassign
    try {
      await repCycle.submitRootHash("0x00", 0, "0x00", 10, { from: minerAddress });
    } catch (err) {
      console.log("advanceMiningCycleNoContest error thrown by .submitRootHash", err);
    }
  }

  await repCycle.confirmNewHash(0);
}

export async function accommodateChallengeAndInvalidateHashViaTimeout(colonyNetwork, test, client1) {
  const repCycle = await getActiveRepCycle(colonyNetwork);
  const [round1, idx1] = await client1.getMySubmissionRoundAndIndex();
  // Make a submission from client1
  const submission1before = await repCycle.getReputationHashSubmission(client1.minerAddress);

  // Submit JRH for submission 1 if needed
  // We only do this if client2 is defined so that we test JRH submission in rounds other than round 0.
  if (submission1before.jrhNNodes === "0") {
    await checkSuccessEthers(client1.confirmJustificationRootHash(), "Client 1 was unable to confirmJustificationRootHash");
  } else {
    await checkSuccessEthers(client1.respondToBinarySearchForChallenge(), "Client 1 was unable to respondToBinarySearchForChallenge");
  }

  // Timeout the other client
  await forwardTime(600, test);
  const toInvalidateIdx = idx1.mod(2).eq(1) ? idx1.sub(1) : idx1.add(1);

  const accounts = await web3GetAccounts();
  return repCycle.invalidateHash(round1, toInvalidateIdx, { from: accounts[5] });
}

export async function accommodateChallengeAndInvalidateHash(colonyNetwork, test, client1, client2, _errors) {
  let toInvalidateIdx;
  const repCycle = await getActiveRepCycle(colonyNetwork);
  const [round1, idx1] = await client1.getMySubmissionRoundAndIndex();
  let errors = _errors;
  // Make sure our errors object has the minimum properties to not throw an 'cannot access property x of undefined' error
  if (!errors) {
    errors = {};
  }
  if (!errors.client1) {
    errors.client1 = {};
  }
  if (!errors.client2) {
    errors.client2 = {};
  }
  if (!errors.client1.respondToBinarySearchForChallenge) {
    errors.client1.respondToBinarySearchForChallenge = [];
  }
  if (!errors.client2.respondToBinarySearchForChallenge) {
    errors.client2.respondToBinarySearchForChallenge = [];
  }

  if (client2 !== undefined) {
    const [round2, idx2] = await client2.getMySubmissionRoundAndIndex();

    await navigateChallenge(colonyNetwork, client1, client2, errors);

    // Work out which submission is to be invalidated.
    const disputeRound1 = await repCycle.getDisputeRound(round1);
    const disputeRound2 = await repCycle.getDisputeRound(round2);
    const disputedEntry1 = disputeRound1[idx1];
    const disputedEntry2 = disputeRound2[idx2];

    if (new BN(disputedEntry1.challengeStepCompleted).gt(new BN(disputedEntry2.challengeStepCompleted))) {
      toInvalidateIdx = idx2;
    } else {
      // Note that if they're equal, they're both going to be invalidated, so we can call
      // either
      toInvalidateIdx = idx1;
    }
    // Forward time, so that whichever has failed to respond by now has timed out.
    await forwardTime(600, test);
  } else {
    toInvalidateIdx = idx1.mod(2).eq(1) ? idx1.sub(1) : idx1.add(1);
  }

  const accounts = await web3GetAccounts();
  return repCycle.invalidateHash(round1, toInvalidateIdx, { from: accounts[5] });
}

async function navigateChallenge(colonyNetwork, client1, client2, errors) {
  const repCycle = await getActiveRepCycle(colonyNetwork);
  const [round1, idx1] = await client1.getMySubmissionRoundAndIndex();
  const submission1before = await repCycle.getReputationHashSubmission(client1.minerAddress);

  // Submit JRH for submission 1 if needed
  // We only do this if client2 is defined so that we test JRH submission in rounds other than round 0.
  if (submission1before.jrhNNodes === "0") {
    if (errors.client1.confirmJustificationRootHash) {
      await checkErrorRevertEthers(client1.confirmJustificationRootHash(), errors.client1.confirmJustificationRootHash);
    } else {
      await checkSuccessEthers(client1.confirmJustificationRootHash(), "Client 1 failed unexpectedly on confirmJustificationRootHash");
    }
  }

  const [round2, idx2] = await client2.getMySubmissionRoundAndIndex();
  expect(round1.eq(round2), "Clients do not have submissions in the same round").to.be.true;
  const submission2before = await repCycle.getReputationHashSubmission(client2.minerAddress);
  expect(
    idx1.sub(idx2).pow(2).eq(1), // eslint-disable-line prettier/prettier
    "Clients are not facing each other in this round"
  ).to.be.true;

  if (submission2before.jrhNNodes === "0") {
    if (errors.client2.confirmJustificationRootHash) {
      await checkErrorRevertEthers(client2.confirmJustificationRootHash(), errors.client2.confirmJustificationRootHash);
    } else {
      await checkSuccessEthers(client2.confirmJustificationRootHash(), "Client 2 failed unexpectedly on confirmJustificationRootHash");
    }
  }

  // i.e. if we had errors here, we must have seen then when we expected. Everything beyond here will just fail, so short-circuit to
  // the invalidation step
  if (errors.client1.confirmJustificationRootHash || errors.client2.confirmJustificationRootHash) {
    return;
  }
  let disputeRound = await repCycle.getDisputeRound(round1);
  let submission1 = disputeRound[idx1];
  let binarySearchStep = -1;
  let binarySearchError = false;
  while (submission1.lowerBound !== submission1.upperBound && binarySearchError === false) {
    binarySearchStep += 1;
    if (errors.client1.respondToBinarySearchForChallenge[binarySearchStep]) {
      await checkErrorRevertEthers(client1.respondToBinarySearchForChallenge(), errors.client1.respondToBinarySearchForChallenge[binarySearchStep]);
      binarySearchError = true;
    } else {
      await checkSuccessEthers(
        client1.respondToBinarySearchForChallenge(),
        `Client 1 failed unexpectedly on respondToBinarySearchForChallenge${binarySearchStep}`
      );
    }
    if (errors.client2.respondToBinarySearchForChallenge[binarySearchStep]) {
      await checkErrorRevertEthers(client2.respondToBinarySearchForChallenge(), errors.client2.respondToBinarySearchForChallenge[binarySearchStep]);
      binarySearchError = true;
    } else {
      await checkSuccessEthers(
        client2.respondToBinarySearchForChallenge(),
        `Client2 failed unexpectedly on respondToBinarySearchForChallenge${binarySearchStep}`
      );
    }
    disputeRound = await repCycle.getDisputeRound(round1);
    submission1 = disputeRound[idx1];
  }

  if (errors.client1.respondToBinarySearchForChallenge[binarySearchStep] || errors.client2.respondToBinarySearchForChallenge[binarySearchStep]) {
    return;
  }

  if (errors.client1.confirmBinarySearchResult) {
    await checkErrorRevertEthers(client1.confirmBinarySearchResult(), errors.client1.confirmBinarySearchResult);
  } else {
    await checkSuccessEthers(client1.confirmBinarySearchResult(), "Client 1 failed unexpectedly on confirmBinarySearchResult");
  }
  if (errors.client2.confirmBinarySearchResult) {
    await checkErrorRevertEthers(client2.confirmBinarySearchResult(), errors.client2.confirmBinarySearchResult);
  } else {
    await checkSuccessEthers(client2.confirmBinarySearchResult(), "Client 2 failed unexpectedly on confirmBinarySearchResult");
  }

  if (errors.client1.confirmBinarySearchResult || errors.client2.confirmBinarySearchResult) {
    return;
  }

  // Respond to the challenge - usually, only one of these should work.
  // If both work, then the starting reputation is 0 and one client is lying
  // about whether the key already exists.
  if (errors.client1.respondToChallenge) {
    await checkErrorRevertEthers(client1.respondToChallenge(), errors.client1.respondToChallenge);
  } else {
    await checkSuccessEthers(client1.respondToChallenge(), "Client 1 failed unexpectedly on respondToChallenge");
  }
  if (errors.client2.respondToChallenge) {
    await checkErrorRevertEthers(client2.respondToChallenge(), errors.client2.respondToChallenge);
  } else {
    await checkSuccessEthers(client2.respondToChallenge(), "Client 2 failed unexpectedly on respondToChallenge");
  }
}

export async function finishReputationMiningCycle(colonyNetwork, test) {
  // Finish the current cycle. Can only do this at the start of a new cycle, if anyone has submitted a hash in this current cycle.
  const repCycle = await getActiveRepCycle(colonyNetwork);
  const nUniqueSubmittedHashes = await repCycle.getNUniqueSubmittedHashes();

  if (nUniqueSubmittedHashes.gtn(0)) {
    const blockTime = await currentBlockTime();
    const reputationMiningWindowOpenTimestamp = await repCycle.getReputationMiningWindowOpenTimestamp();
    const cycleTimeElapsed = new BN(blockTime).sub(reputationMiningWindowOpenTimestamp);
    const cycleTimeRemaining = new BN(MINING_CYCLE_DURATION).sub(cycleTimeElapsed).toNumber();

    await forwardTime(cycleTimeRemaining, test);
    const nInvalidatedHashes = await repCycle.getNInvalidatedHashes();
    if (nUniqueSubmittedHashes.sub(nInvalidatedHashes).eqn(1)) {
      await repCycle.confirmNewHash(nUniqueSubmittedHashes.eqn(1) ? 0 : 1); // Not a general solution - only works for one or two submissions.
      // But for now, that's okay.
    } else {
      // We shouldn't get here. If this fires during a test, you haven't finished writing the test.
      console.log("We're mid dispute process, and can't untangle from here");
      // process.exit(1);
      return false;
    }
  }

  return true;
}

export async function withdrawAllMinerStakes(colonyNetwork) {
  const tokenLockingAddress = await colonyNetwork.getTokenLocking();
  const tokenLocking = await ITokenLocking.at(tokenLockingAddress);
  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await IMetaColony.at(metaColonyAddress);
  const clnyAddress = await metaColony.getToken();
  const clny = await Token.at(clnyAddress);

  const accounts = await web3GetAccounts();
  await Promise.all(
    accounts.map(async user => {
      const info = await tokenLocking.getUserLock(clny.address, user);
      const stakedBalance = new BN(info.balance);

      if (stakedBalance.gt(new BN(0))) {
        if (user === accounts[5]) {
          expect(stakedBalance.gte(DEFAULT_STAKE), "Insufficient stake for MINER1").to.be.true;
          if (stakedBalance.gt(DEFAULT_STAKE)) {
            await tokenLocking.withdraw(clny.address, stakedBalance.sub(DEFAULT_STAKE), { from: user });
          }
        } else {
          await tokenLocking.withdraw(clny.address, stakedBalance, { from: user });
        }
      }

      const userBalance = await clny.balanceOf(user);
      if (userBalance.gt(new BN(0))) {
        await clny.burn(userBalance, { from: user });
      }
    })
  );
}

export async function removeSubdomainLimit(colonyNetwork) {
  // Replace addDomain with the addDomain implementation with no restrictions on depth of subdomains
  const noLimitSubdomains = await NoLimitSubdomains.new();
  const latestVersion = await colonyNetwork.getCurrentColonyVersion();
  const resolverAddress = await colonyNetwork.getColonyVersionResolver(latestVersion);
  const resolver = await Resolver.at(resolverAddress);
  await resolver.register("addDomain(uint256,uint256,uint256)", noLimitSubdomains.address);
}

export async function addTaskSkillEditingFunctions(colonyNetwork) {
  const taskSkillEditing = await TaskSkillEditing.new();
  const latestVersion = await colonyNetwork.getCurrentColonyVersion();
  const resolverAddress = await colonyNetwork.getColonyVersionResolver(latestVersion);
  const resolver = await Resolver.at(resolverAddress);
  await resolver.register("addTaskSkill(uint256,uint256)", taskSkillEditing.address);
  await resolver.register("removeTaskSkill(uint256,uint256)", taskSkillEditing.address);
}

export async function getChildSkillIndex(colonyNetwork, colony, _parentDomainId, _childDomainId) {
  const parentDomainId = new BN(_parentDomainId);
  const childDomainId = new BN(_childDomainId);

  if (parentDomainId.eq(childDomainId)) {
    return 0;
  }

  const parentDomain = await colony.getDomain(parentDomainId);
  const childDomain = await colony.getDomain(childDomainId);

  const parentDomainSkill = await colonyNetwork.getSkill(parentDomain.skillId);
  for (let i = 0; i < parentDomainSkill.children.length; i += 1) {
    if (parentDomainSkill.children[i] === childDomain.skillId) {
      return i;
    }
  }
  throw Error("Supplied child domain is not a child of the supplied parent domain");
}

export async function getColonyEditable(colony, colonyNetwork) {
  const colonyVersion = await colony.version();
  const colonyResolverAddress = await colonyNetwork.getColonyVersionResolver(colonyVersion);
  const colonyResolver = await Resolver.at(colonyResolverAddress);
  const contractEditing = await ContractEditing.new();
  await colonyResolver.register("setStorageSlot(uint256,bytes32)", contractEditing.address);
  const colonyUnderRecovery = await ContractEditing.at(colony.address);
  return colonyUnderRecovery;
}

export async function getWaitForNSubmissionsPromise(repCycleEthers, rootHash, nNodes, jrh, n) {
  return new Promise(function(resolve, reject) {
    repCycleEthers.on("ReputationRootHashSubmitted", async (_miner, _hash, _nNodes, _jrh, _entryIndex, event) => {
      const nSubmissions = await repCycleEthers.getNSubmissionsForHash(rootHash, nNodes, jrh);
      if (nSubmissions.toNumber() >= n) {
        event.removeListener();
        resolve();
      } else {
        await mineBlock();
      }
    });

    // After 60s, we throw a timeout error
    setTimeout(() => {
      reject(new Error("Timeout while waiting for 12 hash submissions"));
    }, 60 * 1000);
  });
}

export async function getRewardClaimSquareRootsAndProofs(client, tokenLocking, colony, payoutId, userAddress) {
  const payout = await colony.getRewardPayoutInfo(payoutId);

  const squareRoots = [0, 0, 0, 0, 0, 0, 0];

  const rootDomain = await colony.getDomain(1);
  const rootDomainSkill = rootDomain.skillId;

  const userReputationKey = makeReputationKey(colony.address, rootDomainSkill, userAddress);
  const userProof = await client.getReputationProofObject(userReputationKey);

  squareRoots[0] = bnSqrt(new BN(userProof.reputation.slice(2), 16));

  const colonyTokenAddress = await colony.getToken();

  const lock = await tokenLocking.getUserLock(colonyTokenAddress, userAddress);
  squareRoots[1] = bnSqrt(new BN(lock.balance, 10));

  const colonyWideReputationKey = makeReputationKey(colony.address, rootDomainSkill);
  const colonyProof = await client.getReputationProofObject(colonyWideReputationKey);
  squareRoots[2] = bnSqrt(new BN(colonyProof.reputation.slice(2), 16), true);

  squareRoots[3] = bnSqrt(new BN(payout.totalTokens, 10), true);

  squareRoots[4] = bnSqrt(squareRoots[0].mul(squareRoots[1])); // Numerator
  squareRoots[5] = bnSqrt(squareRoots[2].mul(squareRoots[3]), true); // Denominator

  squareRoots[6] = bnSqrt(new BN(payout.amount, 10));

  return { squareRoots, userProof };
}
