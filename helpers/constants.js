const { soliditySha3 } = require("web3-utils");
const BN = require("bn.js");
const shortid = require("shortid");
const { ethers } = require("ethers");

const HASHZERO = ethers.constants.HashZero;
const ADDRESS_ZERO = ethers.constants.AddressZero;

const UINT256_MAX = new BN(0).notn(256);
const UINT128_MAX = new BN(0).notn(128);
const INT256_MAX = new BN(0).notn(255);
const INT256_MIN = new BN(2).pow(new BN(255)).mul(new BN(-1));
const INT128_MAX = new BN(2).pow(new BN(127)).sub(new BN(1));
const INT128_MIN = new BN(2).pow(new BN(127)).mul(new BN(-1));

const CURR_VERSION = 15;

const RECOVERY_ROLE = 0;
const ROOT_ROLE = 1;
const ARBITRATION_ROLE = 2;
const ARCHITECTURE_ROLE = 3;
// const ARCHITECTURE_SUBDOMAIN_ROLE = 4; Deprecated
const FUNDING_ROLE = 5;
const ADMINISTRATION_ROLE = 6;

const MANAGER_ROLE = 0;
const EVALUATOR_ROLE = 1;
const WORKER_ROLE = 2;

// The base58 decoded, bytes32 converted hex value of a test task ipfsHash "QmNSUYVKDSvPUnRLKmuxk9diJ6yS96r1TrAXzjTiBcCLAL"
const SPECIFICATION_HASH = "0x017dfd85d4f6cb4dcd715a88101f7b1f06cd1e009b2327a0809d01eb9c91f231";
// The above bytes32 hash where the last raw byte was changed from 1 -> 2
const SPECIFICATION_HASH_UPDATED = "0x017dfd85d4f6cb4dcd715a88101f7b1f06cd1e009b2327a0809d01eb9c91f232";
// The base58 decoded, bytes32 converted hex value of a test task ipfsHash "qmv8ndh7ageh9b24zngaextmuhj7aiuw3scc8hkczvjkww"
const DELIVERABLE_HASH = "0xfb027a4d64f29d83e27769cb05d945e67ef7396fa1bd73ef53f065311fd3313e";

const IPFS_HASH = "QmTfCejgo2wTwqnDJs8Lu1pCNeCrCDuE4GAwkna93zdd7d";

const WAD = new BN(10).pow(new BN(18));
const MIN_STAKE = WAD.muln(2000);
const DEFAULT_STAKE = MIN_STAKE.muln(1000);
const REWARD = WAD.muln(0); // No reward currently

const INITIAL_FUNDING = WAD.muln(360);
const MANAGER_PAYOUT = WAD.muln(100);
const EVALUATOR_PAYOUT = WAD.muln(50);
const WORKER_PAYOUT = WAD.muln(200);
const MAX_PAYOUT = UINT128_MAX;

const MANAGER_RATING = 2;
const WORKER_RATING = 2;
const RATING_MULTIPLIER = { 1: -1, 2: 1, 3: 1.5 };

const RATING_1_SALT = soliditySha3({ type: "string", value: shortid.generate() });
const RATING_2_SALT = soliditySha3({ type: "string", value: shortid.generate() });
const RATING_1_SECRET = soliditySha3(RATING_1_SALT, MANAGER_RATING);
const RATING_2_SECRET = soliditySha3(RATING_2_SALT, WORKER_RATING);

const ACTIVE_TASK_STATE = 0;
const CANCELLED_TASK_STATE = 1;
const FINALIZED_TASK_STATE = 2;

const SECONDS_PER_HOUR = 60 * 60;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

const MINING_CYCLE_DURATION = 60 * 60 * 1; // 1 hour
const CHALLENGE_RESPONSE_WINDOW_DURATION = 60 * 20; // Twenty minutes
const ALL_ENTRIES_ALLOWED_END_OF_WINDOW = 60 * 10; // Ten minutes
const DECAY_RATE = {
  NUMERATOR:    new BN("999679150010889"), // eslint-disable-line prettier/prettier
  DENOMINATOR: new BN("1000000000000000"),
};

const SLOT0 = 0;
const SLOT1 = 1;
const SLOT2 = 2;

const XDAI_CHAINID = 100;
const FORKED_XDAI_CHAINID = 265669100;
const MAINNET_CHAINID = 1;
const FORKED_MAINNET_CHAINID = 2656691;

const CREATEX_ADDRESS = "0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed";

module.exports = {
  UINT256_MAX,
  UINT128_MAX,
  INT256_MIN,
  INT256_MAX,
  INT128_MAX,
  INT128_MIN,
  CURR_VERSION,
  RECOVERY_ROLE,
  ROOT_ROLE,
  ARBITRATION_ROLE,
  ARCHITECTURE_ROLE,
  FUNDING_ROLE,
  ADMINISTRATION_ROLE,
  MANAGER_ROLE,
  EVALUATOR_ROLE,
  WORKER_ROLE,
  SPECIFICATION_HASH,
  SPECIFICATION_HASH_UPDATED,
  DELIVERABLE_HASH,
  WAD,
  MIN_STAKE,
  DEFAULT_STAKE,
  REWARD,
  INITIAL_FUNDING,
  MANAGER_PAYOUT,
  EVALUATOR_PAYOUT,
  WORKER_PAYOUT,
  MAX_PAYOUT,
  MANAGER_RATING,
  WORKER_RATING,
  RATING_MULTIPLIER,
  RATING_1_SALT,
  RATING_2_SALT,
  RATING_1_SECRET,
  RATING_2_SECRET,
  ACTIVE_TASK_STATE,
  CANCELLED_TASK_STATE,
  FINALIZED_TASK_STATE,
  SECONDS_PER_HOUR,
  SECONDS_PER_DAY,
  MINING_CYCLE_DURATION,
  CHALLENGE_RESPONSE_WINDOW_DURATION,
  ALL_ENTRIES_ALLOWED_END_OF_WINDOW,
  DECAY_RATE,
  IPFS_HASH,
  HASHZERO,
  ADDRESS_ZERO,
  SLOT0,
  SLOT1,
  SLOT2,
  XDAI_CHAINID,
  FORKED_XDAI_CHAINID,
  MAINNET_CHAINID,
  FORKED_MAINNET_CHAINID,
  CREATEX_ADDRESS,
};
