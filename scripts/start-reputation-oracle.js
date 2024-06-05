#!/usr/bin/env node

/*
 * Start the Reputation Miner/Oracle for local development
 * DO NOT USE IN PRODUCTION
 */

const path = require("path");
const { exec } = require("child_process");
// const http = require("http");
const axios = require("axios");

const { etherRouterAddress } = require("../etherrouter-address.json"); // eslint-disable-line import/no-unresolved

const reputationOraclePath = path.resolve(__dirname, "../packages/reputation-miner");

async function start() {
  const hardhatAccounts = await getHardhatAccounts();
  const command =
    `node ${reputationOraclePath}/bin/index.js --minerAddress="${hardhatAccounts[5]}" ` +
    `--colonyNetworkAddress="${etherRouterAddress}" --syncFrom=1 --processingDelay=1 --dbPath ./reputations.sqlite`;
  const proc = exec(command, { cwd: path.resolve(__dirname, "..") });
  proc.stdout.pipe(process.stdout);
  proc.stderr.pipe(process.stderr);
}

async function getHardhatAccounts() {
  try {
    const {
      data: { result },
    } = await axios.post("http://127.0.0.1:8545", {
      jsonrpc: "2.0",
      method: "eth_accounts",
      params: [],
      id: 1,
    });
    return result;
  } catch (e) {
    throw new Error(`Could not connect to local hardhat instance. Error was: ${e.message}`);
  }
}

start();
