import web3Utils from "web3-utils";
import { getRandomString } from "../helpers/test-helper";

let MANAGER;
let EVALUATOR;
let WORKER;
let OTHER;
const MANAGER_ROLE = 0;
const EVALUATOR_ROLE = 1;
const WORKER_ROLE = 2;
// The base58 decoded, bytes32 converted value of the task ipfsHash
const SPECIFICATION_HASH = "9bb76d8e6c89b524d34a454b3140df28";
const SPECIFICATION_HASH_UPDATED = "9bb76d8e6c89b524d34a454b3140df29";
const DELIVERABLE_HASH = "9cc89e3e3d12a672d67a424b3640ce34";
const INITIAL_FUNDING = 360 * 1e18;
const MANAGER_PAYOUT = web3Utils.toBN(100 * 1e18);
const EVALUATOR_PAYOUT = web3Utils.toBN(50 * 1e18);
const WORKER_PAYOUT = web3Utils.toBN(200 * 1e18);
const MANAGER_RATING = 30;
const WORKER_RATING = 40;
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
  RATING_1_SALT,
  RATING_2_SALT,
  RATING_1_SECRET,
  RATING_2_SECRET
};
