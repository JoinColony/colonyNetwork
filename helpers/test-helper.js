/* globals artifacts */
/* eslint-disable no-console */
import shortid from "shortid";
import { assert } from "chai";
import web3Utils from "web3-utils";
import ethUtils from "ethereumjs-util";
import BN from "bn.js";
import fs from "fs";

import { UINT256_MAX, MIN_STAKE, MINING_CYCLE_DURATION } from "./constants";

const IColony = artifacts.require("IColony");
const ITokenLocking = artifacts.require("ITokenLocking");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");

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
    assert.equal(reason, errorMessage);
  }
  // Check the receipt `status` to ensure transaction failed.
  assert.isFalse(receipt.status, `Transaction succeeded, but expected error ${errorMessage}`);
}

export async function checkErrorRevertEthers(promise, errorMessage) {
  const tx = await promise;
  const txid = tx.hash;

  const receipt = await web3GetTransactionReceipt(txid);
  assert.isFalse(receipt.status, `Transaction succeeded, but expected to fail with: ${errorMessage}`);

  const response = await web3GetRawCall({ from: tx.from, to: tx.to, data: tx.data, gas: tx.gasLimit.toNumber(), value: tx.value.toNumber() });
  const reason = extractReasonString(response);
  assert.equal(reason, errorMessage);
}

export async function checkSuccessEthers(promise, errorMessage) {
  const tx = await promise;
  const txid = tx.hash;

  const receipt = await web3GetTransactionReceipt(txid);
  if (receipt.status) {
    return;
  }
  const response = await web3GetRawCall({ from: tx.from, to: tx.to, data: tx.data, gas: tx.gasLimit.toNumber(), value: tx.value.toNumber() });
  const reason = extractReasonString(response);
  assert.isTrue(receipt.status, `${errorMessage} with error ${reason}`);
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
  const name = web3Utils.asciiToHex(getRandomString(5));
  const symbol = web3Utils.asciiToHex(getRandomString(3));
  return [name, symbol];
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
  return assert.exists(event);
}

export async function expectAllEvents(tx, eventNames) {
  const { logs } = await tx;
  const events = eventNames.every(eventName => logs.find(e => e.event === eventName));
  return assert.isTrue(events);
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

export function getFunctionSignature(sig) {
  return web3Utils.sha3(sig).slice(0, 10);
}

export async function createSignatures(colony, taskId, signers, value, data) {
  const sourceAddress = colony.address;
  const destinationAddress = colony.address;
  const nonce = await colony.getTaskChangeNonce(taskId);
  const accountsJson = JSON.parse(fs.readFileSync("./ganache-accounts.json", "utf8"));

  const input = `0x${sourceAddress.slice(2)}${destinationAddress.slice(2)}${web3Utils.padLeft(value.toString(16), "64", "0")}${data.slice(
    2
  )}${web3Utils.padLeft(nonce.toString(16), "64", "0")}`; // eslint-disable-line max-len
  const sigV = [];
  const sigR = [];
  const sigS = [];
  const msgHash = web3Utils.soliditySha3(input);

  for (let i = 0; i < signers.length; i += 1) {
    let user = signers[i].toString();
    user = user.toLowerCase();
    const privKey = accountsJson.private_keys[user];
    const prefixedMessageHash = await ethUtils.hashPersonalMessage(Buffer.from(msgHash.slice(2), "hex")); // eslint-disable-line no-await-in-loop
    const sig = await ethUtils.ecsign(prefixedMessageHash, Buffer.from(privKey, "hex")); // eslint-disable-line no-await-in-loop

    sigV.push(sig.v);
    sigR.push(`0x${sig.r.toString("hex")}`);
    sigS.push(`0x${sig.s.toString("hex")}`);
  }

  return { sigV, sigR, sigS };
}

export async function createSignaturesTrezor(colony, taskId, signers, value, data) {
  const sourceAddress = colony.address;
  const destinationAddress = colony.address;
  const nonce = await colony.getTaskChangeNonce(taskId);
  const accountsJson = JSON.parse(fs.readFileSync("./ganache-accounts.json", "utf8"));
  const input = `0x${sourceAddress.slice(2)}${destinationAddress.slice(2)}${web3Utils.padLeft(value.toString(16), "64", "0")}${data.slice(
    2
  )}${web3Utils.padLeft(nonce.toString(16), "64", "0")}`; // eslint-disable-line max-len
  const sigV = [];
  const sigR = [];
  const sigS = [];
  const msgHash = web3Utils.soliditySha3(input);

  for (let i = 0; i < signers.length; i += 1) {
    let user = signers[i].toString();
    user = user.toLowerCase();
    const privKey = accountsJson.private_keys[user];
    const prefixedMessageHash = web3Utils.soliditySha3("\x19Ethereum Signed Message:\n\x20", msgHash);
    const sig = ethUtils.ecsign(Buffer.from(prefixedMessageHash.slice(2), "hex"), Buffer.from(privKey, "hex"));
    sigV.push(sig.v);
    sigR.push(`0x${sig.r.toString("hex")}`);
    sigS.push(`0x${sig.s.toString("hex")}`);
  }

  return { sigV, sigR, sigS };
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
  return `0x${(new BN(value.toString())).toString(16, 64)}${(new BN(reputationId)).toString(16, 64)}`; // eslint-disable-line
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
    const entryHash = await repCycle.getEntryHash(account, i, hash); // eslint-disable-line no-await-in-loop
    const target = new BN(timestamp).sub(reputationMiningWindowOpenTimestamp).mul(constant);
    if (new BN(entryHash.slice(2), 16).lt(target)) {
      return i;
    }
  }
  return new Error("No valid submission found");
}

export async function submitAndForwardTimeToDispute(clients, test) {
  await forwardTime(MINING_CYCLE_DURATION / 2, test);
  for (let i = 0; i < clients.length; i += 1) {
    await clients[i].addLogContentsToReputationTree(); // eslint-disable-line no-await-in-loop
    const tx = await clients[i].submitRootHash(); // eslint-disable-line no-await-in-loop
    await tx.wait(); // eslint-disable-line no-await-in-loop
  }
  await forwardTime(MINING_CYCLE_DURATION / 2, test);
}

export async function runBinarySearch(client1, client2) {
  // Loop while doing the binary search, checking we were successful at each point
  // Binary search will error when it is complete.
  let noError = true;
  while (noError) {
    let transactionObject;
    transactionObject = await client1.respondToBinarySearchForChallenge(); // eslint-disable-line no-await-in-loop
    let tx = await web3GetTransactionReceipt(transactionObject.hash); // eslint-disable-line no-await-in-loop
    if (!tx.status) {
      noError = false;
    }
    transactionObject = await client2.respondToBinarySearchForChallenge(); // eslint-disable-line no-await-in-loop
    tx = await web3GetTransactionReceipt(transactionObject.hash); // eslint-disable-line no-await-in-loop
    if (!tx.status) {
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
    await repCycle.submitRootHash("0x00", 0, "0x00", 10, { from: minerAddress });
  }
  await repCycle.confirmNewHash(0);
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
    const submission1 = await repCycle.getDisputeRounds(round1, idx1);
    const submission2 = await repCycle.getDisputeRounds(round2, idx2);

    if (new BN(submission1.challengeStepCompleted).gt(new BN(submission2.challengeStepCompleted))) {
      toInvalidateIdx = idx2;
    } else {
      // Note that if they're equal, they're both going to be invalidated, so we can call
      // either
      toInvalidateIdx = idx1;
    }
    // Forward time, so that whichever has failed to respond by now has timed out.
    await forwardTime(600, test);
  } else {
    // idx1.modn returns a javascript number, which is surprising!
    toInvalidateIdx = idx1.mod(2) === 1 ? idx1.sub(1) : idx1.add(1);
  }

  const accounts = await web3GetAccounts();
  return repCycle.invalidateHash(round1, toInvalidateIdx, { from: accounts[5] });
}

async function navigateChallenge(colonyNetwork, client1, client2, errors) {
  const repCycle = await getActiveRepCycle(colonyNetwork);
  const [round1, idx1] = await client1.getMySubmissionRoundAndIndex();
  const submission1before = await repCycle.getDisputeRounds(round1, idx1);

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
  assert.isTrue(round1.eq(round2), "Clients do not have submissions in the same round");
  const submission2before = await repCycle.getDisputeRounds(round2, idx2);
  assert.isTrue(
    idx1.sub(idx2).pow(2).eq(1), // eslint-disable-line prettier/prettier
    "Clients are not facing each other in this round"
  );
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

  let submission1 = await repCycle.getDisputeRounds(round1, idx1);
  let binarySearchStep = -1;
  let binarySearchError = false;
  while (submission1.lowerBound !== submission1.upperBound && binarySearchError === false) {
    binarySearchStep += 1;
    if (errors.client1.respondToBinarySearchForChallenge[binarySearchStep]) {
      await checkErrorRevertEthers(client1.respondToBinarySearchForChallenge(), errors.client1.respondToBinarySearchForChallenge[binarySearchStep]); // eslint-disable-line no-await-in-loop
      binarySearchError = true;
    } else {
      // eslint-disable-next-line no-await-in-loop
      await checkSuccessEthers(
        client1.respondToBinarySearchForChallenge(),
        `Client 1 failed unexpectedly on respondToBinarySearchForChallenge${binarySearchStep}`
      );
    }
    if (errors.client2.respondToBinarySearchForChallenge[binarySearchStep]) {
      await checkErrorRevertEthers(client2.respondToBinarySearchForChallenge(), errors.client2.respondToBinarySearchForChallenge[binarySearchStep]); // eslint-disable-line no-await-in-loop
      binarySearchError = true;
    } else {
      // eslint-disable-next-line no-await-in-loop
      await checkSuccessEthers(
        client2.respondToBinarySearchForChallenge(),
        `Client2 failed unexpectedly on respondToBinarySearchForChallenge${binarySearchStep}`
      );
    }
    submission1 = await repCycle.getDisputeRounds(round1, idx1); // eslint-disable-line no-await-in-loop
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
