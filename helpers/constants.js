import testHelper from '../helpers/test-helper';
import sha3 from 'solidity-sha3';

const SECONDS_PER_DAY = 86400;
const MANAGER_ROLE = 0;
const EVALUATOR_ROLE = 1;
const WORKER_ROLE = 2;
// The base58 decoded, bytes32 converted value of the task ipfsHash
const SPECIFICATION_HASH = '9bb76d8e6c89b524d34a454b3140df28';
const SPECIFICATION_HASH_UPDATED = '9bb76d8e6c89b524d34a454b3140df29';
const DELIVERABLE_HASH = '9cc89e3e3d12a672d67a424b3640ce34';
const MANAGER_PAYOUT = 100 * 1e18;
const WORKER_PAYOUT = 200 * 1e18;
const MANAGER_RATING = 30;
const WORKER_RATING = 40;
let RATING_1_SALT = RATING_1_SALT || sha3(testHelper.getRandomString(5));
let RATING_2_SALT = RATING_2_SALT || sha3(testHelper.getRandomString(5));
let MANAGER = MANAGER || web3.eth.accounts[0];
let EVALUATOR = EVALUATOR || web3.eth.accounts[1];
let WORKER = WORKER || web3.eth.accounts[2];
let OTHER = OTHER || web3.eth.accounts[3];

module.exports = {
    MANAGER,
    EVALUATOR, 
    WORKER,
    OTHER,
    MANAGER_ROLE,
    EVALUATOR_ROLE,
    WORKER_ROLE,
    SPECIFICATION_HASH,
    SPECIFICATION_HASH_UPDATED,
    DELIVERABLE_HASH,
    SECONDS_PER_DAY,
    MANAGER_PAYOUT,
    WORKER_PAYOUT,
    MANAGER_RATING,
    WORKER_RATING,
    RATING_1_SALT,
    RATING_2_SALT
};