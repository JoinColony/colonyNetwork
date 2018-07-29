/* eslint-disable no-console */
import shortid from "shortid";
import { assert } from "chai";
import web3Utils from "web3-utils";
import ethUtils from "ethereumjs-util";
import BN from "bn.js";
import fs from "fs";

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
  assert.equal(receipt.status, 0x00, `Transaction succeeded, but expected error ${errorMessage}`);
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
  return [getRandomString(5), getRandomString(3), 18];
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
      console.log(`Forwarding time with ${seconds}s ...`);
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
    const prefixedMessageHash = ethUtils.hashPersonalMessage(Buffer.from(msgHash.slice(2), "hex"));
    const sig = ethUtils.ecsign(prefixedMessageHash, Buffer.from(privKey, "hex"));

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
  let a = bn.add(web3Utils.toBN(1)).div(web3Utils.toBN(2));
  let b = bn;
  while (a.lt(b)) {
    b = a;
    a = bn
      .div(a)
      .add(a)
      .div(web3Utils.toBN(2));
  }

  if (isGreater && b.mul(b).lt(bn)) {
    b = b.addn(1);
  }
  return b;
}

export function makeReputationKey(colonyAddress, skill, accountAddress = undefined) {
  let key = `0x`;
  key += `${new BN(colonyAddress.slice(2), 16).toString(16, 40)}`; // Colony address as bytes
  key += `${new BN(skill).toString(16, 64)}`; // SkillId as uint256
  if (accountAddress === undefined) {
    key += `${new BN(0, 16).toString(16, 40)}`; // Colony address as 0 bytes
  } else {
    key += `${new BN(accountAddress.slice(2), 16).toString(16, 40)}`; // User address as bytes
  }
  return key;
}

export function makeReputationValue(value, repuationId) {
  return `0x${(new BN(value.toString())).toString(16, 64)}${(new BN(repuationId)).toString(16, 64)}`; // eslint-disable-line
}

export async function findIndexAndSubmitRootHash(client, byteCutoff = 0x00, nIter = 1000) {
  const rootHash = await client.getRootHash();
  const repCycle = await client.getActiveRepCycle();
  let entryIndex = 1;

  for (let i = 1; i < nIter; i += 1) {
    const hash = await repCycle.getEntryHash(client.realWallet.address, i, rootHash); // eslint-disable-line no-await-in-loop
    if (parseInt(hash.substring(2, 4), 16) <= byteCutoff) {
      entryIndex = i;
    }
  }
  await client.submitRootHash(entryIndex);
  return entryIndex;
}
