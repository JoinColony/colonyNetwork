pragma solidity ^0.4.23;

import "../lib/dappsys/auth.sol";


contract TokenLockingStorage is DSAuth {
  address resolver;

  // Address of ColonyNetwork contract
  address colonyNetwork;

  struct Lock {
    // Users lock count
    uint256 lockCount;
    // Deposited balance
    uint256 balance;
    // Timestamp of last deposit
    uint256 timestamp;
  }

  // Maps token to user to Lock struct
  mapping (address => mapping (address => Lock)) userLocks;

  // Maps token to total token lock count. If user token lock count is the same as global, that means that their tokens are unlocked.
  // If user token lock count is less than global, that means that their tokens are locked.
  // User's lock count should never be greater than total lock count.
  mapping (address => uint256) totalLockCount;
}
