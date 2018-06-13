/* eslint-disable no-console */
import shortid from "shortid";
import { assert } from "chai";
import web3Utils from "web3-utils";
import ethUtils from "ethereumjs-util";
import fs from "fs";

export function web3GetNetwork() {
  return new Promise((resolve, reject) => {
    web3.version.getNetwork((err, res) => {
      if (err !== null) return reject(err);
      return resolve(res);
    });
  });
}

export function web3GetClient() {
  return new Promise((resolve, reject) => {
    web3.version.getNode((err, res) => {
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

// eslint-disable-next-line no-unused-vars
export async function checkErrorRevert(promise, errMsg) {
  // There is a discrepancy between how ganache-cli handles errors
  // (throwing an exception all the way up to these tests) and how geth/parity handle them
  // (still making a valid transaction and returning a txid). For the explanation of why
  // See https://github.com/ethereumjs/testrpc/issues/39
  //
  // Obviously, we want our tests to pass on all, so this is a bit of a problem.
  // We have to have this special function that we use to catch the error.
  let tx;
  let receipt;
  try {
    tx = await promise;
    receipt = await web3GetTransactionReceipt(tx);
  } catch (err) {
    // TODO: Check errMsg == err.Error or wherever truffle decides ot put this
    ({ tx, receipt } = err);
  }

  // Check the receipt `status` to ensure transaction failed.
  assert.equal(receipt.status, 0x00);
}

export function checkErrorNonPayableFunction(tx) {
  assert.equal(tx, "Error: Cannot send value to non-payable function");
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

export async function createSignatures(colony, taskId, signers, value, data) {
  const sourceAddress = colony.address;
  const destinationAddress = colony.address;
  const nonce = await colony.getTaskChangeNonce.call(taskId);
  const accountsJson = JSON.parse(fs.readFileSync("./ganache-accounts.json", "utf8"));
  const input = `0x${sourceAddress.slice(2)}${destinationAddress.slice(2)}${web3Utils.padLeft(value.toString("16"), "64", "0")}${data.slice(
    2
  )}${web3Utils.padLeft(nonce.toString("16"), "64", "0")}`; // eslint-disable-line max-len
  const sigV = [];
  const sigR = [];
  const sigS = [];
  const msgHash = web3Utils.soliditySha3(input);

  for (let i = 0; i < signers.length; i += 1) {
    const user = signers[i].toString();
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
  const nonce = await colony.getTaskChangeNonce.call(taskId);
  const accountsJson = JSON.parse(fs.readFileSync("./ganache-accounts.json", "utf8"));
  const input = `0x${sourceAddress.slice(2)}${destinationAddress.slice(2)}${web3Utils.padLeft(value.toString("16"), "64", "0")}${data.slice(
    2
  )}${web3Utils.padLeft(nonce.toString("16"), "64", "0")}`; // eslint-disable-line max-len
  const sigV = [];
  const sigR = [];
  const sigS = [];
  const msgHash = web3Utils.soliditySha3(input);

  for (let i = 0; i < signers.length; i += 1) {
    const user = signers[i].toString();
    const privKey = accountsJson.private_keys[user];
    const prefixedMessageHash = web3Utils.soliditySha3("\x19Ethereum Signed Message:\n\x20", msgHash);
    const sig = ethUtils.ecsign(Buffer.from(prefixedMessageHash.slice(2), "hex"), Buffer.from(privKey, "hex"));
    sigV.push(sig.v);
    sigR.push(`0x${sig.r.toString("hex")}`);
    sigS.push(`0x${sig.s.toString("hex")}`);
  }

  return { sigV, sigR, sigS };
}

export function bnSqrt(bn) {
  let a = bn.add(web3Utils.toBN(1)).div(web3Utils.toBN(2));
  let b = bn;
  while (a.lt(b)) {
    b = a;
    a = bn
      .div(a)
      .add(a)
      .div(web3Utils.toBN(2));
  }
  return b;
}
