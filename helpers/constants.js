import web3Utils from "web3-utils";
import { getRandomString } from "../helpers/test-helper";

let MANAGER;
let EVALUATOR;
let WORKER;
let OTHER;
const MANAGER_ROLE = 0;
const EVALUATOR_ROLE = 1;
const WORKER_ROLE = 2;
// The base58 decoded, bytes32 converted hex value of a test task ipfsHash "QmNSUYVKDSvPUnRLKmuxk9diJ6yS96r1TrAXzjTiBcCLAL"
const SPECIFICATION_HASH = "0x017dfd85d4f6cb4dcd715a88101f7b1f06cd1e009b2327a0809d01eb9c91f231";
// The above bytes32 hash where the last raw byte was changed from 1 -> 2
const SPECIFICATION_HASH_UPDATED = "0x017dfd85d4f6cb4dcd715a88101f7b1f06cd1e009b2327a0809d01eb9c91f232";
// The base58 decoded, bytes32 converted hex value of a test task ipfsHash "qmv8ndh7ageh9b24zngaextmuhj7aiuw3scc8hkczvjkww"
const DELIVERABLE_HASH = "0xfb027a4d64f29d83e27769cb05d945e67ef7396fa1bd73ef53f065311fd3313e";
const INITIAL_FUNDING = 360 * 1e18;
const MANAGER_PAYOUT = web3Utils.toBN(100 * 1e18);
const EVALUATOR_PAYOUT = web3Utils.toBN(50 * 1e18);
const WORKER_PAYOUT = web3Utils.toBN(200 * 1e18);
const MANAGER_RATING = 2;
const WORKER_RATING = 3;
const RATING_MULTIPLIER = { 1: -1, 2: 1, 3: 1.5 };
const SECONDS_PER_DAY = 86400;
const RATING_1_SALT = web3Utils.soliditySha3(getRandomString(10));
const RATING_2_SALT = web3Utils.soliditySha3(getRandomString(10));
const RATING_1_SECRET = web3Utils.soliditySha3(RATING_1_SALT, MANAGER_RATING);
const RATING_2_SECRET = web3Utils.soliditySha3(RATING_2_SALT, WORKER_RATING);

module.exports = {
  MANAGER: MANAGER || web3.eth.accounts[0],
  EVALUATOR: EVALUATOR || web3.eth.accounts[1],
  WORKER: WORKER || web3.eth.accounts[2],
  OTHER: OTHER || web3.eth.accounts[3],
  MANAGER_ROLE,
  EVALUATOR_ROLE,
  WORKER_ROLE,
  SPECIFICATION_HASH,
  SPECIFICATION_HASH_UPDATED,
  DELIVERABLE_HASH,
  SECONDS_PER_DAY,
  INITIAL_FUNDING,
  MANAGER_PAYOUT,
  EVALUATOR_PAYOUT,
  WORKER_PAYOUT,
  MANAGER_RATING,
  WORKER_RATING,
  RATING_MULTIPLIER,
  RATING_1_SALT,
  RATING_2_SALT,
  RATING_1_SECRET,
  RATING_2_SECRET
};
