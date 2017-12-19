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

const RATING_1 = 30;
const RATING_2 = 40;
let RATING_1_SALT = RATING_1_SALT || sha3(testHelper.getRandomString(5));
let RATING_2_SALT = RATING_2_SALT || sha3(testHelper.getRandomString(5));
let MANAGER = MANAGER || web3.eth.accounts[0];

module.exports = {
    MANAGER,
    MANAGER_ROLE,
    EVALUATOR_ROLE,
    WORKER_ROLE,
    SPECIFICATION_HASH,
    SPECIFICATION_HASH_UPDATED,
    DELIVERABLE_HASH,
    SECONDS_PER_DAY,
    RATING_1,
    RATING_2,
    RATING_1_SALT,
    RATING_2_SALT
};