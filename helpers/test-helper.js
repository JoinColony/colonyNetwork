/* globals artifacts */

const fs = require("fs");
const shortid = require("shortid");
const chai = require("chai");
const { asciiToHex, isBN } = require("web3-utils");
const BN = require("bn.js");
const { ethers } = require("ethers");
const { BigNumber } = require("bignumber.js");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

const {
  UINT256_MAX,
  MIN_STAKE,
  MINING_CYCLE_DURATION,
  DEFAULT_STAKE,
  CHALLENGE_RESPONSE_WINDOW_DURATION,
  FORKED_MAINNET_CHAINID,
  MAINNET_CHAINID,
  XDAI_CHAINID,
  FORKED_XDAI_CHAINID,
  CREATEX_ADDRESS,
  CURR_VERSION,
} = require("./constants");

const IColony = artifacts.require("IColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IMetaColony = artifacts.require("IMetaColony");
const ITokenLocking = artifacts.require("ITokenLocking");
const Token = artifacts.require("Token");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const NoLimitSubdomains = artifacts.require("NoLimitSubdomains");
const Resolver = artifacts.require("Resolver");
const ContractEditing = artifacts.require("ContractEditing");
const ColonyDomains = artifacts.require("ColonyDomains");
const EtherRouter = artifacts.require("EtherRouter");
const ChainId = artifacts.require("ChainId");

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

exports.getChainId = async function getChainId() {
  // Why do we do this? Because with the check-if-we-are-on-the-minign chain setup for
  // tests, we've introduced a new transaction in the setup process. This causes the
  // past-version-caching to fail, because we end up deploying different code to the same
  // addresses. This is a workaround for that, but should be considered temporary.
  const packet = {
    jsonrpc: "2.0",
    method: "eth_accounts",
    params: [],
    id: new Date().getTime(),
  };

  return new Promise((resolve, reject) => {
    ChainId.currentProvider.send(packet, async function (err, res) {
      if (err !== null) return reject(err);
      const accounts = res.result;
      const c = await ChainId.new({ from: accounts.slice(-1)[0] });
      const chainId = await c.getChainId();
      return resolve(chainId.toNumber());
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

    const TRUFFLE_PORT = 8545;
    const OTHER_RPC_PORT = 8546;

    let provider = new ethers.providers.StaticJsonRpcProvider(`http://127.0.0.1:${TRUFFLE_PORT}`);
    receipt = await provider.getTransactionReceipt(txid);
    if (!receipt) {
      provider = new ethers.providers.StaticJsonRpcProvider(`http://127.0.0.1:${OTHER_RPC_PORT}`);
      receipt = await provider.getTransactionReceipt(txid);
    }

    const tx = await provider.getTransaction(txid);
    let reason;
    try {
      const callResult = await provider.call(
        {
          from: tx.from,
          to: tx.to,
          data: tx.data,
          gas: ethers.utils.hexValue(tx.gasLimit),
          value: ethers.utils.hexValue(parseInt(tx.value, 10)),
        },
        receipt.blockNumber,
      );
      reason = web3.eth.abi.decodeParameter("string", callResult.slice(10));
    } catch (err2) {
      reason = web3.eth.abi.decodeParameter("string", err2.error.error.data.slice(10));
    }
    expect(reason).to.equal(errorMessage);
  }
  expect(receipt.status, `Transaction succeeded, but expected to fail with: ${errorMessage}`).to.equal(0);
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
  return helpers.time.latest();
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

exports.forwardTime = async function forwardTime(seconds, test, _web3provider) {
  if (typeof seconds !== "number") {
    throw new Error("typeof seconds is not a number");
  }

  if (!_web3provider) {
    const client = await exports.web3GetClient();
    if (client.indexOf("Hardhat") !== -1) {
      return helpers.time.increase(seconds);
    }
  }

  const web3provider = _web3provider || web3.currentProvider;
  // eslint-disable-next-line no-warning-comments
  // FIXME: not strictly correct, but it's late.
  // Should really call the rpc node with web3provider.send
  const client = await exports.web3GetClient();

  const p = new Promise((resolve, reject) => {
    if (client.indexOf("TestRPC") === -1 && client.indexOf("Hardhat") === -1) {
      resolve(test.skip());
    } else {
      // console.log(`Forwarding time with ${seconds}s ...`);
      web3provider.send(
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
          return web3provider.send(
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

exports.forwardTimeTo = async function forwardTimeTo(timestamp) {
  return helpers.time.increaseTo(timestamp);
};

exports.mineBlock = async function mineBlock() {
  return helpers.mine();
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

exports.snapshot = async function snapshot(provider) {
  return new Promise((resolve, reject) => {
    provider.send(
      {
        jsonrpc: "2.0",
        method: "evm_snapshot",
        params: [],
        id: new Date().getTime(),
      },
      (err, res) => {
        if (err) {
          return reject(err);
        }
        return resolve(res.result);
      },
    );
  });
};

exports.revert = async function revert(provider, snapshotId) {
  return new Promise((resolve, reject) => {
    provider.send(
      {
        jsonrpc: "2.0",
        method: "evm_revert",
        params: [snapshotId],
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

exports.hardhatSnapshot = async function hardhatSnapshot(provider) {
  const res = await provider.request({
    method: "evm_snapshot",
    params: [],
  });
  return res;
};

exports.hardhatRevert = async function hardhatRevert(provider, snapshotId) {
  await provider.request({
    method: "evm_revert",
    params: [snapshotId],
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

exports.makeTxAtTimestamp = async function makeTxAtTimestamp(f, args, timestamp) {
  await helpers.time.setNextBlockTimestamp(timestamp);
  return f(...args);
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

exports.getColonyNetworkEditable = async function getColonyNetworkEditable(colonyNetwork) {
  const networkAsEtherRouter = await EtherRouter.at(colonyNetwork.address);
  const resolverAddress = await networkAsEtherRouter.resolver();
  const colonyNetworkResolver = await Resolver.at(resolverAddress);
  const contractEditing = await ContractEditing.new();
  await colonyNetworkResolver.register("setStorageSlot(uint256,bytes32)", contractEditing.address);
  const colonyNetworkEditable = await ContractEditing.at(colonyNetwork.address);
  return colonyNetworkEditable;
};

exports.getWaitForNSubmissionsPromise = function getWaitForNSubmissionsPromise(repCycleEthers, fromBlock, rootHash, nLeaves, jrh, n) {
  if (!repCycleEthers || !fromBlock) {
    throw new Error("repCycleEthers and fromBlock must be defined when calling getWaitForNSubmissionsPromise");
  }

  return new Promise(function (resolve, reject) {
    const intervalId = setInterval(async () => {
      const filter = repCycleEthers.filters.ReputationRootHashSubmitted();
      const events = await repCycleEthers.queryFilter(filter, fromBlock);

      if (events.length > 0) {
        if (rootHash) {
          const nSubmissions = await repCycleEthers.getNSubmissionsForHash(rootHash, nLeaves, jrh);
          if (nSubmissions.toNumber() >= n) {
            clearInterval(intervalId);
            resolve();
          }
        } else {
          // Check all events
          await Promise.all(
            events.map(async (event) => {
              const nSubmissions = await repCycleEthers.getNSubmissionsForHash(event.args._newHash, event.args._nLeaves, event.args._jrh);
              if (nSubmissions.toNumber() >= n) {
                clearInterval(intervalId);
                resolve();
              }
            }),
          );
        }
      }
    }, 1000);

    // After 60s, throw a timeout error
    setTimeout(() => {
      clearInterval(intervalId);
      reject(new Error("Timeout while waiting for 12 hash submissions"));
    }, 60 * 1000);
  });
};

exports.getMiningCycleCompletePromise = function getMiningCycleCompletePromise(colonyNetworkEthers, fromBlock, oldHash, expectedHash) {
  if (!colonyNetworkEthers || !fromBlock) {
    throw new Error("colonyNetworkEthers and fromBlock must be defined when calling getMiningCycleCompletePromise");
  }

  return new Promise(function (resolve, reject) {
    const intervalId = setInterval(async () => {
      const filter = colonyNetworkEthers.filters.ReputationMiningCycleComplete();
      const events = await colonyNetworkEthers.queryFilter(filter, fromBlock);
      if (events.length > 0) {
        const event = events[events.length - 1];
        const newHash = event.args[0];
        if (oldHash) {
          expect(newHash).to.not.equal(oldHash, "The old and new hashes are the same");
        }
        if (expectedHash) {
          expect(newHash).to.equal(expectedHash, "The network root hash doesn't match the one submitted");
        }
        clearInterval(intervalId);
        resolve();
      }
    }, 1000);

    // After 30s, we throw a timeout error
    setTimeout(() => {
      clearInterval(intervalId);
      reject(new Error("ERROR: timeout while waiting for confirming hash"));
    }, 30 * 1000);
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

exports.getMultichainSkillId = function getMultichainSkillId(chainId, skillId) {
  if (chainId === XDAI_CHAINID || chainId === FORKED_XDAI_CHAINID) {
    return skillId;
  }
  return ethers.BigNumber.from(chainId).mul(ethers.BigNumber.from(2).pow(128)).add(ethers.BigNumber.from(skillId));
};

exports.upgradeColonyOnceThenToLatest = async function (colony) {
  // Assume that we need to do one 'proper' upgrade, and then we just
  // set the version to the desired version
  const currentVersion = await colony.version();
  await colony.upgrade(currentVersion.addn(1));

  const networkAddress = await colony.getColonyNetwork();
  const colonyNetwork = await IColonyNetwork.at(networkAddress);

  const editableColony = await exports.getColonyEditable(colony, colonyNetwork);
  const existingSlot = await exports.web3GetStorageAt(colony.address, 2);

  // Doing it this way preserves the items that share this storage slot with the address,
  // which are recoverymode related.
  const newestResolver = await colonyNetwork.getColonyVersionResolver(CURR_VERSION);

  const newSlotValue = existingSlot.slice(0, 26) + newestResolver.slice(2);

  await editableColony.setStorageSlot(2, newSlotValue);
};

exports.isMainnet = async function isMainnet() {
  const chainId = await exports.web3GetChainId();
  return chainId === MAINNET_CHAINID || chainId === FORKED_MAINNET_CHAINID;
};

exports.isXdai = async function isXdai() {
  const chainId = await exports.web3GetChainId();
  return chainId === XDAI_CHAINID || chainId === FORKED_XDAI_CHAINID;
};

exports.deployCreateXIfNeeded = async function deployCreateXIfNeeded() {
  // Deploy CreateX if it's not already deployed
  const createXCode = await web3.eth.getCode(CREATEX_ADDRESS);
  if (createXCode === "0x") {
    const accounts = await web3.eth.getAccounts();
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: "0xeD456e05CaAb11d66C4c797dD6c1D6f9A7F352b5",
      value: web3.utils.toWei("0.3", "ether"),
      gasPrice: web3.utils.toWei("1", "gwei"),
      gas: 300000,
    });
    const rawTx = fs
      .readFileSync("lib/createx/scripts/presigned-createx-deployment-transactions/signed_serialised_transaction_gaslimit_3000000_.json", {
        encoding: "utf8",
      })
      .replace(/"/g, "")
      .replace("\n", "");
    await web3.eth.sendSignedTransaction(rawTx);
  }
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
