/* globals artifacts */
const shortid = require("shortid");
const chai = require("chai");
const { asciiToHex, isBN } = require("web3-utils");
const BN = require("bn.js");
const { ethers } = require("ethers");
const { BigNumber } = require("bignumber.js");

const { UINT256_MAX, MIN_STAKE, MINING_CYCLE_DURATION, DEFAULT_STAKE, CHALLENGE_RESPONSE_WINDOW_DURATION } = require("./constants");

const IColony = artifacts.require("IColony");
const IMetaColony = artifacts.require("IMetaColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ITokenLocking = artifacts.require("ITokenLocking");
const Token = artifacts.require("Token");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const NoLimitSubdomains = artifacts.require("NoLimitSubdomains");
const TaskSkillEditing = artifacts.require("TaskSkillEditing");
const Resolver = artifacts.require("Resolver");
const ContractEditing = artifacts.require("ContractEditing");
const ColonyDomains = artifacts.require("ColonyDomains");

const { expect } = chai;

exports.web3GetNetwork = async function web3GetNetwork() {
  return new Promise((resolve, reject) => {
    web3.eth.net.getId((err, res) => {
      if (err !== null) return reject(err);
      return resolve(res);
    });
  });
};

exports.web3GetClient = async function web3GetClient() {
  return new Promise((resolve, reject) => {
    web3.eth.getNodeInfo((err, res) => {
      if (err !== null) return reject(err);
      return resolve(res);
    });
  });
};

exports.web3GetBalance = async function web3GetBalance(account) {
  return new Promise((resolve, reject) => {
    web3.eth.getBalance(account, (err, res) => {
      if (err !== null) return reject(err);
      return resolve(res);
    });
  });
};

exports.web3GetStorageAt = async function web3GetStorageAt(address, position) {
  return new Promise((resolve, reject) => {
    web3.eth.getStorageAt(address, position, (err, res) => {
      if (err !== null) return reject(err);
      return resolve(res);
    });
  });
};

exports.web3GetTransaction = async function web3GetTransaction(txid) {
  return new Promise((resolve, reject) => {
    web3.eth.getTransaction(txid, (err, res) => {
      if (err !== null) return reject(err);
      return resolve(res);
    });
  });
};

exports.web3GetTransactionReceipt = async function web3GetTransactionReceipt(txid) {
  return new Promise((resolve, reject) => {
    web3.eth.getTransactionReceipt(txid, (err, res) => {
      if (err !== null) return reject(err);
      return resolve(res);
    });
  });
};

exports.web3GetFirstTransactionHashFromLastBlock = async function web3GetFirstTransactionHashFromLastBlock() {
  return new Promise((resolve, reject) => {
    web3.eth.getBlock("latest", true, (err, res) => {
      if (err !== null) return reject(err);
      return resolve(res.transactions[0].hash);
    });
  });
};

exports.web3GetCode = async function web3GetCode(a) {
  return new Promise((resolve, reject) => {
    web3.eth.getCode(a, (err, res) => {
      if (err !== null) return reject(err);
      return resolve(res);
    });
  });
};

exports.web3GetAccounts = async function web3GetAccounts() {
  return new Promise((resolve, reject) => {
    web3.eth.getAccounts((err, res) => {
      if (err !== null) return reject(err);
      return resolve(res);
    });
  });
};

exports.web3GetChainId = async function web3GetChainId() {
  const packet = {
    jsonrpc: "2.0",
    method: "eth_chainId",
    params: [],
    id: new Date().getTime(),
  };

  return new Promise((resolve, reject) => {
    web3.currentProvider.send(packet, (err, res) => {
      if (err !== null) return reject(err);
      return resolve(parseInt(res.result, 16));
    });
  });
};

exports.web3SignTypedData = function web3SignTypedData(address, typedData) {
  const packet = {
    jsonrpc: "2.0",
    method: "eth_signTypedData",
    params: [address, typedData],
    id: new Date().getTime(),
  };

  return new Promise((resolve, reject) => {
    web3.currentProvider.send(packet, (err, res) => {
      if (err !== null) return reject(err);
      return resolve(res.result);
    });
  });
};

exports.web3GetRawCall = function web3GetRawCall(params, blockTag) {
  const packet = {
    jsonrpc: "2.0",
    method: "eth_call",
    params: [params, blockTag],
    id: new Date().getTime(),
  };

  return new Promise((resolve, reject) => {
    web3.currentProvider.send(packet, (err, res) => {
      if (err !== null) return reject(err);
      return resolve(res);
    });
  });
};

// Borrowed from `truffle` https://github.com/trufflesuite/truffle/blob/next/packages/truffle-contract/lib/reason.js
exports.extractReasonString = function extractReasonString(res) {
  if (!res || (!res.error && !res.result)) return "";

  const errorStringHash = "0x08c379a0";

  const isObject = res && typeof res === "object" && res.error && res.error.data;
  const isString = res && typeof res === "object" && typeof res.result === "string";

  if (isObject) {
    if (res && res.error && res.error.data) {
      const hash = res.error.data;
      if (hash.includes(errorStringHash)) {
        return web3.eth.abi.decodeParameter("string", hash.slice(10));
      }
    }
  } else if (isString && res.result.includes(errorStringHash)) {
    return web3.eth.abi.decodeParameter("string", res.result.slice(10));
  }
  return "";
};

exports.checkErrorRevert = async function checkErrorRevert(promise, errorMessage) {
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
      receipt = await exports.web3GetTransactionReceipt(txid);
      // Check the receipt `status` to ensure transaction failed.
    }
    expect(receipt.status, `Transaction succeeded, but expected error ${errorMessage}`).to.be.false;
  } catch (err) {
    if (err.toString().indexOf("AssertionError: Transaction succeeded, but expected error") === 0) {
      throw err;
    }
    ({ reason } = err);
    expect(reason).to.equal(errorMessage);
  }
};

exports.checkErrorRevertEthers = async function checkErrorRevertEthers(promise, errorMessage) {
  let receipt;
  try {
    receipt = await promise;
  } catch (err) {
    const txid = err.transactionHash;
    const tx = await exports.web3GetTransaction(txid);
    receipt = await exports.web3GetTransactionReceipt(txid);

    const response = await exports.web3GetRawCall(
      {
        from: tx.from,
        to: tx.to,
        data: tx.input,
        gas: ethers.utils.hexValue(tx.gas),
        value: ethers.utils.hexValue(parseInt(tx.value, 10)),
      },
      ethers.utils.hexValue(receipt.blockNumber),
    );
    const reason = exports.extractReasonString(response);
    expect(reason).to.equal(errorMessage);
    return;
  }

  expect(receipt.status, `Transaction succeeded, but expected to fail with: ${errorMessage}`).to.be.zero;
};

// Sometimes we might have to use this function because of
// https://github.com/trufflesuite/truffle/issues/4900
// Once that's fixed, hopefully we can get rid of it
exports.checkErrorRevertEstimateGas = async function checkErrorRevertTruffleWorkaround(promise, errorMessage) {
  try {
    await promise;
  } catch (err) {
    expect(err.toString()).to.contain(errorMessage);
  }
};

exports.checkSuccessEthers = async function checkSuccessEthers(promise, errorMessage) {
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
  const tx = await exports.web3GetTransaction(txid);
  const response = await exports.web3GetRawCall({ from: tx.from, to: tx.to, data: tx.input, gas: tx.gas, value: tx.value });
  const reason = exports.extractReasonString(response);
  expect(receipt.status, `${errorMessage} with error ${reason}`).to.equal(1);
};

exports.getRandomString = function getRandomString(_length) {
  const length = _length || 7;
  let randString = "";
  while (randString.length < length) {
    randString += shortid.generate().replace(/_/g, "").toLowerCase();
  }
  return randString.slice(0, length);
};

exports.getTokenArgs = function getTokenArgs() {
  const name = asciiToHex(exports.getRandomString(5));
  const symbol = asciiToHex(exports.getRandomString(3));
  return [name, symbol, 18];
};

exports.currentBlockTime = async function currentBlockTime() {
  const p = new Promise((resolve, reject) => {
    web3.eth.getBlock("latest", (err, res) => {
      if (err) {
        return reject(err);
      }
      return resolve(res.timestamp);
    });
  });
  return p;
};

exports.currentBlock = async function currentBlock() {
  const p = new Promise((resolve, reject) => {
    web3.eth.getBlock("latest", (err, res) => {
      if (err) {
        return reject(err);
      }
      return resolve(res);
    });
  });
  return p;
};

exports.getBlock = async function getBlock(blockNumber) {
  const p = new Promise((resolve, reject) => {
    web3.eth.getBlock(blockNumber, (err, res) => {
      if (err) {
        return reject(err);
      }
      return resolve(res);
    });
  });
  return p;
};

exports.getBlockTime = async function getBlockTime(blockNumber = "latest") {
  const p = new Promise((resolve, reject) => {
    web3.eth.getBlock(blockNumber, (err, res) => {
      if (err) {
        return reject(err);
      }
      return resolve(res.timestamp);
    });
  });
  return p;
};

function hexlifyAndPad(input) {
  let i = input;
  if (i.toString) {
    i = i.toString();
  }
  i = ethers.BigNumber.from(i);
  return ethers.utils.hexZeroPad(ethers.utils.hexlify(i), 32);
}

exports.expectEvent = async function expectEvent(tx, nameOrSig, args) {
  const matches = await eventMatches(tx, nameOrSig, args);
  if (matches.indexOf(true) === -1) {
    throw Error(`No matching event was found for ${nameOrSig} with args ${args}`);
  }
};

exports.expectNoEvent = async function expectNoEvent(tx, nameOrSig, args) {
  const matches = await eventMatches(tx, nameOrSig, args);
  if (matches.indexOf(true) !== -1) {
    throw Error(`A matching event was found for ${nameOrSig} with args ${args}`);
  }
};

async function eventMatches(tx, nameOrSig, args) {
  const re = /\((.*)\)/;
  let eventMatch;
  if (nameOrSig.match(re)) {
    // i.e. if the passed nameOrSig has () in it, we assume it's a signature
    const { rawLogs } = await tx.receipt;
    const canonicalSig = nameOrSig.replace(/ indexed/g, "");
    const topic = web3.utils.soliditySha3(canonicalSig);
    const events = rawLogs.filter((e) => e.topics[0] === topic);
    eventMatch = await Promise.all(
      events.map((e) => {
        // Set up an abi so we decode correctly, including indexed topics
        const event = e;
        const abi = [`event ${nameOrSig}`];
        const iface = new ethers.utils.Interface(abi);

        event.args = iface.parseLog(event).args;
        return eventMatchArgs(event, args);
      }),
    );
  } else {
    const { logs } = await tx;
    const events = logs.filter((e) => e.event === nameOrSig);
    eventMatch = await Promise.all(events.map((e) => eventMatchArgs(e, args)));
  }
  return eventMatch;
}

async function eventMatchArgs(event, args) {
  for (let i = 0; i < args.length; i += 1) {
    let arg = args[i];
    if (arg === null) {
      continue; // eslint-disable-line no-continue
    }
    if (arg.constructor.name === "BN" || event.args[i].constructor.name === "BN") {
      if (ethers.utils.isHexString(arg)) {
        arg = ethers.BigNumber.from(arg).toString();
      }
      if (arg.toString() !== event.args[i].toString()) {
        return false;
      }
    } else if (typeof arg === "object") {
      if (JSON.stringify(arg) !== JSON.stringify(event.args[i])) {
        return false;
      }
    } else if (typeof arg === "string" && !ethers.utils.isHexString(event.args[i])) {
      if (arg !== event.args[i]) {
        return false;
      }
    } else if (typeof arg === "boolean") {
      if (arg !== event.args[i]) {
        return false;
      }
    } else if (typeof arg === "number") {
      if (hexlifyAndPad(arg) !== hexlifyAndPad(event.args[i])) {
        return false;
      }
    } else if (typeof arg === "string" && arg.length <= 66) {
      if (hexlifyAndPad(arg) !== hexlifyAndPad(event.args[i])) {
        return false;
      }
    } else if (arg !== event.args[i]) {
      return false;
    }
  }
  return true;
}

exports.expectAllEvents = async function expectAllEvents(tx, eventNames) {
  const { logs } = await tx;
  const events = eventNames.every((eventName) => logs.find((e) => e.event === eventName));
  return expect(events).to.be.true;
};

exports.forwardTime = async function forwardTime(seconds, test) {
  if (typeof seconds !== "number") {
    throw new Error("typeof seconds is not a number");
  }
  const client = await exports.web3GetClient();
  const p = new Promise((resolve, reject) => {
    if (client.indexOf("TestRPC") === -1 && client.indexOf("Hardhat") === -1) {
      resolve(test.skip());
    } else {
      // console.log(`Forwarding time with ${seconds}s ...`);
      web3.currentProvider.send(
        {
          jsonrpc: "2.0",
          method: "evm_increaseTime",
          params: [seconds],
          id: 0,
        },
        (err) => {
          if (err) {
            return reject(err);
          }
          return web3.currentProvider.send(
            {
              jsonrpc: "2.0",
              method: "evm_mine",
              params: [],
              id: 0,
            },
            (err2, res) => {
              if (err2) {
                return reject(err2);
              }
              return resolve(res);
            },
          );
        },
      );
    }
  });
  return p;
};

exports.forwardTimeTo = async function forwardTimeTo(timestamp, test) {
  const lastBlockTime = await exports.getBlockTime("latest");
  const amountToForward = new BN(timestamp).sub(new BN(lastBlockTime));
  // Forward that much
  await exports.forwardTime(amountToForward.toNumber(), test);
};

exports.mineBlock = async function mineBlock(timestamp) {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "evm_mine",
        params: timestamp ? [timestamp] : [],
        id: new Date().getTime(),
      },
      (err) => {
        if (err) {
          return reject(err);
        }
        return resolve();
      },
    );
  });
};

exports.getHardhatAutomine = async function checkHardhatAutomine() {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "hardhat_getAutomine",
        params: [],
        id: new Date().getTime(),
      },
      (err, res) => {
        if (err) {
          return reject(err);
        }
        return resolve(Boolean(res.result));
      },
    );
  });
};

exports.stopMining = async function stopMining() {
  const client = await exports.web3GetClient();
  if (client.indexOf("Hardhat") !== -1) {
    return new Promise((resolve, reject) => {
      web3.currentProvider.send(
        {
          jsonrpc: "2.0",
          method: "evm_setAutomine",
          params: [false],
          id: new Date().getTime(),
        },
        async (err) => {
          if (err) {
            return reject(err);
          }
          // Wait until actually reports that it's stopped mining
          while (await exports.getHardhatAutomine()) {
            await exports.sleep(1000);
          }
          return resolve();
        },
      );
    });
  }

  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "miner_stop",
        params: [],
        id: new Date().getTime(),
      },
      (err) => {
        if (err) {
          return reject(err);
        }
        return resolve();
      },
    );
  });
};

exports.startMining = async function startMining() {
  const client = await exports.web3GetClient();
  if (client.indexOf("Hardhat") !== -1) {
    return new Promise((resolve, reject) => {
      web3.currentProvider.send(
        {
          jsonrpc: "2.0",
          method: "evm_setAutomine",
          params: [true],
          id: new Date().getTime(),
        },
        (err) => {
          if (err) {
            return reject(err);
          }
          return resolve();
        },
      );
    });
  }

  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "miner_start",
        params: [],
        id: new Date().getTime(),
      },
      (err) => {
        if (err) {
          return reject(err);
        }
        return resolve();
      },
    );
  });
};

exports.makeTxAtTimestamp = async function makeTxAtTimestamp(f, args, timestamp, test) {
  const client = await exports.web3GetClient();
  if (client.indexOf("TestRPC") === -1) {
    test.skip();
  }
  await exports.stopMining();
  let mined;
  // Send the transaction to the RPC endpoint. This might be a truffle contract object, which doesn't
  // return until the transaction has been mined... but we've stopped mining. So we can't await it
  // now. But if we `mineBlock` straight away, the transaction might not have pecolated all the way through
  // to the pending transaction pool, especially on CI.

  // I have tried lots of better ways to solve this problem. The problem is, while mining is stopped, the
  // 'pending' block isn't updated and, even when mining, in some cases it is interpreted to mean 'latest' in
  // ganache cli. The sender's nonce isn't updated, the number of pending transactions is not updated... I'm at a
  // loss for how to do this better.
  // This works for ethers and truffle
  const promise = f(...args);
  // Chaining these directly on the above declaration doesn't work in the case of being passed an ethers function
  // (They don't seem to return the original promise, somehow?)
  promise
    .then(() => {
      mined = true;
    })
    .catch(() => {
      mined = true;
    });
  while (!mined) {
    // eslint-disable-next-line no-await-in-loop
    await exports.mineBlock(timestamp);
  }
  // Turn auto-mining back on
  await exports.startMining();

  // Tests are written assuming all future blocks will be from this time, which used to be
  // how ganache operated. It's not any more, so explicitly forward time.
  await exports.forwardTimeTo(timestamp, test);

  return promise;
};

exports.bnSqrt = function bnSqrt(bn, isGreater) {
  let a = bn.addn(1).divn(2);
  let b = bn;
  while (a.lt(b)) {
    b = a;
    a = bn.div(a).add(a).divn(2);
  }

  if (isGreater && b.mul(b).lt(bn)) {
    b = b.addn(1);
  }
  return b;
};

exports.makeReputationKey = function makeReputationKey(colonyAddress, skillBN, accountAddress = undefined) {
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
};

// Note: value can be anything with a `.toString()` method -- a string, number, or BN.
exports.makeReputationValue = function makeReputationValue(value, reputationId) {
  return `0x${new BN(value.toString()).toString(16, 64)}${new BN(reputationId).toString(16, 64)}`;
};

exports.getValidEntryNumber = async function getValidEntryNumber(colonyNetwork, account, hash, startingEntryNumber = 1) {
  const repCycle = await exports.getActiveRepCycle(colonyNetwork);

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
  const timestamp = await exports.currentBlockTime();
  for (let i = startingEntryNumber; i <= nIter; i += 1) {
    const entryHash = await repCycle.getEntryHash(account, i, hash);
    const target = new BN(timestamp).sub(reputationMiningWindowOpenTimestamp).mul(constant);
    if (new BN(entryHash.slice(2), 16).lt(target)) {
      return i;
    }
  }
  return new Error("No valid submission found");
};

exports.submitAndForwardTimeToDispute = async function submitAndForwardTimeToDispute(clients, test) {
  // For there to be a dispute we need at least 2 competing submisssions
  expect(clients.length).to.be.above(1);

  await exports.forwardTime(MINING_CYCLE_DURATION / 2, test);
  for (let i = 0; i < clients.length; i += 1) {
    await clients[i].addLogContentsToReputationTree();
    await clients[i].submitRootHash();
  }
  await exports.forwardTime(MINING_CYCLE_DURATION / 2, test);

  // If there are multiple submissions, ensure they are all different
  const submissionsPromise = clients.map(async (client) => {
    const rootHash = await client.getRootHash();
    const nLeaves = await client.getRootHashNLeaves();
    const jrh = await client.justificationTree.getRootHash();
    return rootHash + nLeaves + jrh;
  });

  const submissions = await Promise.all(submissionsPromise);
  const uniqueSubmissions = [...new Set(submissions)];
  expect(submissions.length, "Submissions from clients are equal, surprisingly").to.be.equal(uniqueSubmissions.length);
};

exports.runBinarySearch = async function runBinarySearch(client1, client2, test) {
  // Loop while doing the binary search, checking we were successful at each point
  // Binary search will error when it is complete.
  let noError = true;
  while (noError) {
    await exports.forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION, test);
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
};

exports.getActiveRepCycle = async function getActiveRepCycle(colonyNetwork) {
  const addr = await colonyNetwork.getReputationMiningCycle(true);
  const repCycle = await IReputationMiningCycle.at(addr);
  return repCycle;
};

exports.advanceMiningCycleNoContest = async function advanceMiningCycleNoContest({ colonyNetwork, client, minerAddress, test }) {
  await exports.forwardTime(MINING_CYCLE_DURATION + CHALLENGE_RESPONSE_WINDOW_DURATION, test);
  const repCycle = await exports.getActiveRepCycle(colonyNetwork);

  if (client !== undefined) {
    await client.addLogContentsToReputationTree();
    await client.submitRootHash();
    await client.confirmNewHash();
  } else {
    const accounts = await exports.web3GetAccounts();
    minerAddress = minerAddress || accounts[5]; // eslint-disable-line no-param-reassign
    try {
      await repCycle.submitRootHash("0x00", 0, "0x00", 1, { from: minerAddress });
    } catch (err) {
      console.log("advanceMiningCycleNoContest error thrown by .submitRootHash", err);
    }
    await repCycle.confirmNewHash(0, { from: minerAddress });
  }
};

exports.accommodateChallengeAndInvalidateHashViaTimeout = async function accommodateChallengeAndInvalidateHashViaTimeout(
  colonyNetwork,
  _test,
  client1,
) {
  const repCycle = await exports.getActiveRepCycle(colonyNetwork);
  const [round1, idx1] = await client1.getMySubmissionRoundAndIndex();
  // Make a submission from client1
  const submission1before = await repCycle.getReputationHashSubmission(client1.minerAddress);
  await exports.forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION, this);

  // Submit JRH for submission 1 if needed
  // We only do this if client2 is defined so that we test JRH submission in rounds other than round 0.
  if (submission1before.jrhNLeaves === "0") {
    await exports.checkSuccessEthers(client1.confirmJustificationRootHash(), "Client 1 was unable to confirmJustificationRootHash");
  } else {
    await exports.checkSuccessEthers(client1.respondToBinarySearchForChallenge(), "Client 1 was unable to respondToBinarySearchForChallenge");
  }

  // Timeout the other client
  await exports.forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION, this);

  const toInvalidateIdx = idx1.mod(2).eq(1) ? idx1.sub(1) : idx1.add(1);
  const accounts = await exports.web3GetAccounts();
  const minerAddress = accounts[5];

  return repCycle.invalidateHash(round1, toInvalidateIdx, { from: minerAddress });
};

exports.accommodateChallengeAndInvalidateHash = async function accommodateChallengeAndInvalidateHash(colonyNetwork, test, client1, client2, _errors) {
  let toInvalidateIdx;
  const repCycle = await exports.getActiveRepCycle(colonyNetwork);
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
    await exports.forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION * 2, test); // First window is the response window, second window is the invalidate window
  } else {
    toInvalidateIdx = idx1.mod(2).eq(1) ? idx1.sub(1) : idx1.add(1);
  }
  await exports.forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);

  const signingAddress = await client1.realWallet.getAddress();
  return repCycle.invalidateHash(round1, toInvalidateIdx, { from: signingAddress });
};

async function navigateChallenge(colonyNetwork, client1, client2, errors) {
  const repCycle = await exports.getActiveRepCycle(colonyNetwork);
  const [round1, idx1] = await client1.getMySubmissionRoundAndIndex();
  const submission1before = await repCycle.getReputationHashSubmission(client1.minerAddress);

  await exports.forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION);

  // Submit JRH for submission 1 if needed
  // We only do this if client2 is defined so that we test JRH submission in rounds other than round 0.
  if (submission1before.jrhNLeaves === "0") {
    if (errors.client1.confirmJustificationRootHash) {
      await exports.checkErrorRevertEthers(client1.confirmJustificationRootHash(), errors.client1.confirmJustificationRootHash);
    } else {
      await exports.checkSuccessEthers(client1.confirmJustificationRootHash(), "Client 1 failed unexpectedly on confirmJustificationRootHash");
    }
  }

  const [round2, idx2] = await client2.getMySubmissionRoundAndIndex();
  expect(round1.eq(round2), "Clients do not have submissions in the same round").to.be.true;
  const submission2before = await repCycle.getReputationHashSubmission(client2.minerAddress);
  expect(
    idx1.sub(idx2).pow(2).eq(1), // eslint-disable-line prettier/prettier
    "Clients are not facing each other in this round",
  ).to.be.true;

  await exports.forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION);

  if (submission2before.jrhNLeaves === "0") {
    if (errors.client2.confirmJustificationRootHash) {
      await exports.checkErrorRevertEthers(client2.confirmJustificationRootHash(), errors.client2.confirmJustificationRootHash);
    } else {
      await exports.checkSuccessEthers(client2.confirmJustificationRootHash(), "Client 2 failed unexpectedly on confirmJustificationRootHash");
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
    await exports.forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION);
    binarySearchStep += 1;
    if (errors.client1.respondToBinarySearchForChallenge[binarySearchStep]) {
      await exports.checkErrorRevertEthers(
        client1.respondToBinarySearchForChallenge(),
        errors.client1.respondToBinarySearchForChallenge[binarySearchStep],
      );
      binarySearchError = true;
    } else {
      await exports.checkSuccessEthers(
        client1.respondToBinarySearchForChallenge(),
        `Client 1 failed unexpectedly on respondToBinarySearchForChallenge${binarySearchStep}`,
      );
    }
    if (errors.client2.respondToBinarySearchForChallenge[binarySearchStep]) {
      await exports.checkErrorRevertEthers(
        client2.respondToBinarySearchForChallenge(),
        errors.client2.respondToBinarySearchForChallenge[binarySearchStep],
      );
      binarySearchError = true;
    } else {
      await exports.checkSuccessEthers(
        client2.respondToBinarySearchForChallenge(),
        `Client2 failed unexpectedly on respondToBinarySearchForChallenge${binarySearchStep}`,
      );
    }
    disputeRound = await repCycle.getDisputeRound(round1);
    submission1 = disputeRound[idx1];
  }

  if (errors.client1.respondToBinarySearchForChallenge[binarySearchStep] || errors.client2.respondToBinarySearchForChallenge[binarySearchStep]) {
    return;
  }

  await exports.forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION);

  if (errors.client1.confirmBinarySearchResult) {
    await exports.checkErrorRevertEthers(client1.confirmBinarySearchResult(), errors.client1.confirmBinarySearchResult);
  } else {
    await exports.checkSuccessEthers(client1.confirmBinarySearchResult(), "Client 1 failed unexpectedly on confirmBinarySearchResult");
  }
  if (errors.client2.confirmBinarySearchResult) {
    await exports.checkErrorRevertEthers(client2.confirmBinarySearchResult(), errors.client2.confirmBinarySearchResult);
  } else {
    await exports.checkSuccessEthers(client2.confirmBinarySearchResult(), "Client 2 failed unexpectedly on confirmBinarySearchResult");
  }

  if (errors.client1.confirmBinarySearchResult || errors.client2.confirmBinarySearchResult) {
    return;
  }

  await exports.forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION);

  // Respond to the challenge - usually, only one of these should work.
  // If both work, then the starting reputation is 0 and one client is lying
  // about whether the key already exists.
  if (errors.client1.respondToChallenge) {
    await exports.checkErrorRevertEthers(client1.respondToChallenge(), errors.client1.respondToChallenge);
  } else {
    await exports.checkSuccessEthers(client1.respondToChallenge(), "Client 1 failed unexpectedly on respondToChallenge");
  }
  if (errors.client2.respondToChallenge) {
    await exports.checkErrorRevertEthers(client2.respondToChallenge(), errors.client2.respondToChallenge);
  } else {
    await exports.checkSuccessEthers(client2.respondToChallenge(), "Client 2 failed unexpectedly on respondToChallenge");
  }
}

exports.finishReputationMiningCycle = async function finishReputationMiningCycle(colonyNetwork, test) {
  // Finish the current cycle. Can only do this at the start of a new cycle, if anyone has submitted a hash in this current cycle.
  const repCycle = await exports.getActiveRepCycle(colonyNetwork);
  const nUniqueSubmittedHashes = await repCycle.getNUniqueSubmittedHashes();

  if (nUniqueSubmittedHashes.gtn(0)) {
    const nInvalidatedHashes = await repCycle.getNInvalidatedHashes();
    if (nUniqueSubmittedHashes.sub(nInvalidatedHashes).eqn(1)) {
      const roundNumber = nUniqueSubmittedHashes.eqn(1) ? 0 : 1; // Not a general solution - only works for one or two submissions.
      const disputeRound = await repCycle.getDisputeRound(roundNumber);
      const timestamp = disputeRound[0].lastResponseTimestamp;
      await exports.forwardTimeTo(parseInt(timestamp, 10) + MINING_CYCLE_DURATION, test);

      const accounts = await exports.web3GetAccounts();
      const minerAddress = accounts[5];

      await repCycle.confirmNewHash(roundNumber, { from: minerAddress });
      // But for now, that's okay.
    } else {
      // We shouldn't get here. If this fires during a test, you haven't finished writing the test.
      console.log("We're mid dispute process, and can't untangle from here");
      // process.exit(1);
      return false;
    }
  }

  return true;
};

exports.withdrawAllMinerStakes = async function withdrawAllMinerStakes(colonyNetwork) {
  const tokenLockingAddress = await colonyNetwork.getTokenLocking();
  const tokenLocking = await ITokenLocking.at(tokenLockingAddress);
  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await IMetaColony.at(metaColonyAddress);
  const clnyAddress = await metaColony.getToken();
  const clny = await Token.at(clnyAddress);

  const accounts = await exports.web3GetAccounts();
  await Promise.all(
    accounts.map(async (user) => {
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
    }),
  );
};

exports.removeSubdomainLimit = async function removeSubdomainLimit(colonyNetwork) {
  // Replace addDomain with the addDomain implementation with no restrictions on depth of subdomains
  const noLimitSubdomains = await NoLimitSubdomains.new();
  const latestVersion = await colonyNetwork.getCurrentColonyVersion();
  const resolverAddress = await colonyNetwork.getColonyVersionResolver(latestVersion);
  const resolver = await Resolver.at(resolverAddress);
  await resolver.register("addDomain(uint256,uint256,uint256)", noLimitSubdomains.address);
};

exports.restoreSubdomainLimit = async function restoreSubdomainLimit(colonyNetwork) {
  const originalSubdomains = await ColonyDomains.new();
  const latestVersion = await colonyNetwork.getCurrentColonyVersion();
  const resolverAddress = await colonyNetwork.getColonyVersionResolver(latestVersion);
  const resolver = await Resolver.at(resolverAddress);
  await resolver.register("addDomain(uint256,uint256,uint256)", originalSubdomains.address);
};

exports.addTaskSkillEditingFunctions = async function addTaskSkillEditingFunctions(colonyNetwork) {
  const taskSkillEditing = await TaskSkillEditing.new();
  const latestVersion = await colonyNetwork.getCurrentColonyVersion();
  const resolverAddress = await colonyNetwork.getColonyVersionResolver(latestVersion);
  const resolver = await Resolver.at(resolverAddress);
  await resolver.register("addTaskSkill(uint256,uint256)", taskSkillEditing.address);
  await resolver.register("removeTaskSkill(uint256,uint256)", taskSkillEditing.address);
};

exports.getChildSkillIndex = async function getChildSkillIndex(colonyNetwork, colony, _parentDomainId, _childDomainId) {
  const parentDomainId = new BN(_parentDomainId);
  const childDomainId = new BN(_childDomainId);

  if (parentDomainId.eq(childDomainId)) {
    return UINT256_MAX;
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
};

exports.getColonyEditable = async function getColonyEditable(colony, colonyNetwork) {
  const colonyVersion = await colony.version();
  const colonyResolverAddress = await colonyNetwork.getColonyVersionResolver(colonyVersion);
  const colonyResolver = await Resolver.at(colonyResolverAddress);
  const contractEditing = await ContractEditing.new();
  await colonyResolver.register("setStorageSlot(uint256,bytes32)", contractEditing.address);
  const colonyUnderRecovery = await ContractEditing.at(colony.address);
  return colonyUnderRecovery;
};

exports.getWaitForNSubmissionsPromise = async function getWaitForNSubmissionsPromise(repCycleEthers, rootHash, nLeaves, jrh, n) {
  return new Promise(function (resolve, reject) {
    repCycleEthers.on("ReputationRootHashSubmitted", async (_miner, _hash, _nLeaves, _jrh, _entryIndex, event) => {
      let nSubmissions;
      // We want to see when our hash hits N submissions
      // If we've passed in our hash, we check how many submissions that hash has
      // If not, we're waiting for N submissions from any hash
      if (rootHash) {
        nSubmissions = await repCycleEthers.getNSubmissionsForHash(rootHash, nLeaves, jrh);
      } else {
        nSubmissions = await repCycleEthers.getNSubmissionsForHash(_hash, _nLeaves, _jrh);
      }
      if (nSubmissions.toNumber() >= n) {
        event.removeListener();
        resolve();
      } else {
        await exports.mineBlock();
      }
    });

    // After 60s, we throw a timeout error
    setTimeout(() => {
      reject(new Error("Timeout while waiting for 12 hash submissions"));
    }, 60 * 1000);
  });
};

exports.getMiningCycleCompletePromise = async function getMiningCycleCompletePromise(colonyNetworkEthers, oldHash, expectedHash) {
  return new Promise(function (resolve, reject) {
    colonyNetworkEthers.on("ReputationMiningCycleComplete", async (_hash, _nLeaves, event) => {
      const colonyNetwork = await IColonyNetwork.at(colonyNetworkEthers.address);
      const newHash = await colonyNetwork.getReputationRootHash();
      if (oldHash) {
        expect(newHash).to.not.equal(oldHash, "The old and new hashes are the same");
      }
      if (expectedHash) {
        expect(newHash).to.equal(expectedHash, "The network root hash doesn't match the one submitted");
      }
      event.removeListener();
      resolve();
    });

    // After 30s, we throw a timeout error
    setTimeout(() => {
      reject(new Error("ERROR: timeout while waiting for confirming hash"));
    }, 30000);
  });
};

exports.encodeTxData = async function encodeTxData(colony, functionName, args) {
  const convertedArgs = [];
  args.forEach((arg) => {
    if (Number.isInteger(arg)) {
      const convertedArg = ethers.BigNumber.from(arg);
      convertedArgs.push(convertedArg);
    } else if (isBN(arg) || BigNumber.isBigNumber(arg)) {
      // Can use isBigNumber from utils once https://github.com/ethereum/web3.js/issues/2835 sorted
      const convertedArg = ethers.BigNumber.from(arg.toString());
      convertedArgs.push(convertedArg);
    } else {
      convertedArgs.push(arg);
    }
  });

  const txData = await colony.contract.methods[functionName](...convertedArgs).encodeABI();
  return txData;
};

exports.getRewardClaimSquareRootsAndProofs = async function getRewardClaimSquareRootsAndProofs(client, tokenLocking, colony, payoutId, userAddress) {
  const payout = await colony.getRewardPayoutInfo(payoutId);

  const squareRoots = [0, 0, 0, 0, 0, 0, 0];

  const rootDomain = await colony.getDomain(1);
  const rootDomainSkill = rootDomain.skillId;

  const userReputationKey = exports.makeReputationKey(colony.address, rootDomainSkill, userAddress);
  const userProof = await client.getReputationProofObject(userReputationKey);

  squareRoots[0] = exports.bnSqrt(new BN(userProof.reputation.slice(2), 16));

  const colonyTokenAddress = await colony.getToken();

  const lock = await tokenLocking.getUserLock(colonyTokenAddress, userAddress);
  squareRoots[1] = exports.bnSqrt(new BN(lock.balance, 10));

  const colonyWideReputationKey = exports.makeReputationKey(colony.address, rootDomainSkill);
  const colonyProof = await client.getReputationProofObject(colonyWideReputationKey);
  squareRoots[2] = exports.bnSqrt(new BN(colonyProof.reputation.slice(2), 16), true);

  squareRoots[3] = exports.bnSqrt(new BN(payout.totalTokens, 10), true);

  squareRoots[4] = exports.bnSqrt(squareRoots[0].mul(squareRoots[1])); // Numerator
  squareRoots[5] = exports.bnSqrt(squareRoots[2].mul(squareRoots[3]), true); // Denominator

  squareRoots[6] = exports.bnSqrt(new BN(payout.amount, 10));

  return { squareRoots, userProof };
};

exports.bn2bytes32 = function bn2bytes32(x, size = 64) {
  return `0x${x.toString(16, size)}`;
};

exports.rolesToBytes32 = function rolesToBytes32(roles) {
  return `0x${new BN(roles.map((role) => new BN(1).shln(role)).reduce((a, b) => a.or(b), new BN(0))).toString(16, 64)}`;
};

exports.sleep = function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

class TestAdapter {
  constructor() {
    this.outputs = [];
  }

  // eslint-disable-next-line class-methods-use-this
  error(line) {
    console.log(line);
  }

  log(line) {
    this.outputs.push(line);
  }
}

exports.TestAdapter = TestAdapter;
