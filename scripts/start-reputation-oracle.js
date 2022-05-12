#!/usr/bin/env node

/*
 * Start the Reputation Miner/Oracle for local development
 * DO NOT USE IN PRODUCTION
 */

const path = require("path");
const { exec } = require("child_process");
const http = require("http");

const { etherRouterAddress } = require("../etherrouter-address.json"); // eslint-disable-line import/no-unresolved

const reputationOraclePath = path.resolve(__dirname, "../packages/reputation-miner");

async function start() {
  const ganacheAccounts = await getGanacheAccounts();
  const command =
    `node ${reputationOraclePath}/bin/index.js --minerAddress="${ganacheAccounts[5]}" ` +
    `--colonyNetworkAddress="${etherRouterAddress}" --syncFrom=1 --processingDelay=1 --dbPath ./reputations.sqlite`;
  const proc = exec(command, { cwd: path.resolve(__dirname, "..") });
  proc.stdout.pipe(process.stdout);
  proc.stderr.pipe(process.stderr);
}

async function getGanacheAccounts() {
  const requestAccounts = JSON.stringify({
    jsonrpc: "2.0",
    method: "eth_accounts",
    params: [],
    id: 1,
  });
  const response = await new Promise((resolve, reject) => {
    const req = http.request(
      "http://127.0.0.1:8545",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      },
      (res) => {
        res.setEncoding("utf8");
        res.on("data", (chunk) => resolve(JSON.parse(chunk)));
      }
    );
    req.on("error", () => reject(new Error("Could not connect to RPC endpoint")));
    req.write(requestAccounts);
    req.end();
  });
  return response.result;
}

start();
