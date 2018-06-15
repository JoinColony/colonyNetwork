pragma solidity ^0.4.23;

import "../lib/dappsys/auth.sol";


contract TokenLockingStorage is DSAuth {
  address resolver;

  // Address of ColonyNetwork contract
  address colonyNetwork;

  struct TokenLock {
    // Amount of deposited tokens
    uint256 amount;
    // user token lock counter
    uint256 count;
  }

  // Maps token to user to TokenLock struct
  mapping (address => mapping (address => TokenLock)) userTokenLocks;

  // Maps token to total token lock count. If user token lock count is the same as global, that means that their tokens are unlocked.
  // If user token lock count is less than global, that means that their tokens are locked.
  // It must not happend that user lock count is greater than global lock count
  mapping (address => uint256) totalTokenLockCount;
}
