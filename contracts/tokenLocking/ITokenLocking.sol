/*
  This file is part of The Colony Network.

  The Colony Network is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  The Colony Network is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with The Colony Network. If not, see <http://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.3; // ignore-swc-103
pragma experimental "ABIEncoderV2";

import "./TokenLockingDataTypes.sol";
import "./../common/IBasicMetaTransaction.sol";


interface ITokenLocking is TokenLockingDataTypes, IBasicMetaTransaction {

  /// @notice Set the ColonyNetwork contract address.
  /// @dev ColonyNetwork is used for checking if sender is a colony created on colony network.
  /// @param _colonyNetwork Address of the ColonyNetwork
  function setColonyNetwork(address _colonyNetwork) external;

  /// @notice Get ColonyNetwork address.
  /// @return networkAddress ColonyNetwork address
  function getColonyNetwork() external view returns (address networkAddress);

  /// @notice Locks everyones' tokens on `_token` address.
  /// @param _token Address of the token we want to lock
  /// @return lockCount Updated total token lock count
  function lockToken(address _token) external returns (uint256 lockCount);

  /// @notice Increments the lock counter to `_lockId` for the `_user` if user's lock count is less than `_lockId` by 1.
  /// Can only be called by a colony.
  /// @param _token Address of the token we want to unlock
  /// @param _user Address of the user
  /// @param _lockId Id of the lock we want to increment to
  function unlockTokenForUser(address _token, address _user, uint256 _lockId) external;

  /// @notice Increments sender's lock count to `_lockId`.
  /// @param _token Address of the token we want to increment lock count for
  /// @param _lockId Id of the lock user wants to increment to
  function incrementLockCounterTo(address _token, uint256 _lockId) external;

  /// @notice @deprecated
  /// @notice Deposit `_amount` of deposited tokens. Can only be called if user tokens are not locked.
  /// Before calling this function user has to allow that their tokens can be transferred by token locking contract.
  /// @param _token Address of the token to deposit
  /// @param _amount Amount to deposit
  function deposit(address _token, uint256 _amount) external;

  /// @notice Deposit `_amount` of colony tokens.
  /// Before calling this function user has to allow that their tokens can be transferred by token locking contract.
  /// @param _token Address of the token to deposit
  /// @param _amount Amount to deposit
  /// @param _force Pass true to forcibly unlock the token
  function deposit(address _token, uint256 _amount, bool _force) external;

  /// @notice Deposit `_amount` of colony tokens in the recipient's account. Goes into pendingBalance if token is locked.
  /// @param _token Address of the token to deposit
  /// @param _amount Amount to deposit
  /// @param _recipient User to receive the tokens
  function depositFor(address _token, uint256 _amount, address _recipient) external;

  /// @notice Transfer tokens to a recipient's pending balance. Can only be called if user tokens are not locked.
  /// @param _token Address of the token to transfer
  /// @param _amount Amount to transfer
  /// @param _recipient User to receive the tokens
  /// @param _force Pass true to forcibly unlock the token
  function transfer(address _token, uint256 _amount, address _recipient, bool _force) external;

  /// @notice @deprecated
  /// @notice Withdraw `_amount` of deposited tokens. Can only be called if user tokens are not locked.
  /// @param _token Address of the token to withdraw from
  /// @param _amount Amount to withdraw
  function withdraw(address _token, uint256 _amount) external;

  /// @notice Withdraw `_amount` of deposited tokens. Can only be called if user tokens are not locked.
  /// @param _token Address of the token to withdraw from
  /// @param _amount Amount to withdraw
  /// @param _force Pass true to forcibly unlock the token
  function withdraw(address _token, uint256 _amount, bool _force) external;

  /// @notice This function is deprecated and only exists to aid upgrades.
  /// @param _recipient The address to receive the reward
  /// @param _amount The amount to reward
  /// @dev It's a NOOP. You don't need to call this, and if you write a contract that does it will break in the future.
  function reward(address _recipient, uint256 _amount) external;

  /// @notice Allow the colony to obligate some amount of tokens as a stake.
  /// @dev Can only be called by a colony or colonyNetwork
  /// @param _user Address of the user that is allowing their holdings to be staked by the caller
  /// @param _amount Amount of that colony's internal token up to which we are willing to be obligated.
  /// @param _token The colony's internal token address
  function approveStake(address _user, uint256 _amount, address _token) external;

  /// @notice Obligate the user some amount of tokens as a stake.
  /// Can only be called by a colony or colonyNetwork.
  /// @param _user Address of the account we are obligating.
  /// @param _amount Amount of the colony's internal token we are obligating.
  /// @param _token The colony's internal token address
  function obligateStake(address _user, uint256 _amount, address _token) external;

  /// @notice Deobligate the user some amount of tokens, releasing the stake.
  /// Can only be called by a colony or colonyNetwork.
  /// @param _user Address of the account we are deobligating.
  /// @param _amount Amount of colony's internal token we are deobligating.
  /// @param _token The colony's internal token address
  function deobligateStake(address _user, uint256 _amount, address _token) external;

  /// @notice Transfer some amount of staked tokens.
  /// Can only be called by a colony or colonyNetwork.
  /// @param _user Address of the account we are taking.
  /// @param _amount Amount of colony's internal token we are taking.
  /// @param _token The colony's internal token address
  /// @param _recipient Recipient of the slashed tokens
  function transferStake(address _user, uint256 _amount, address _token, address _recipient) external;

  /// @notice Get global lock count for a specific token.
  /// @param _token Address of the token
  /// @return lockCount Global token lock count
  function getTotalLockCount(address _token) external view returns (uint256 lockCount);

  /// @notice Get user token lock info (lock count and deposited amount).
  /// @param _token Address of the token
  /// @param _user Address of the user
  /// @return lock Lock object containing:
  ///   `lockCount` User's token lock count,
  ///   `balance` User's deposited amount,
  ///   `DEPRECATED_timestamp` Timestamp of deposit (deprecated)
  ///   `pendingBalance` Tokens that have been sent to them, but are inaccessible until all locks are cleared and then these
  ///                    tokens are claimed
  function getUserLock(address _token, address _user) external view returns (Lock memory lock);

  /// @notice See the total amount of a user's obligation.
  /// @param _user Address of the obligated account.
  /// @param _token The token for which the user is obligated.
  /// @return obligation The total amount this user is obligated
  function getTotalObligation(address _user, address _token) external view returns (uint256 obligation);

  /// @notice See how much an address has approved another address to obligate on their behalf.
  /// @param _user Address of the account that has approved _approvee to obligate their funds.
  /// @param _token The token for which the user has provided the approval.
  /// @param _obligator The address that has been approved to obligate the funds.
  /// @return approval The total amount for this obligation
  function getApproval(address _user, address _token, address _obligator) external view returns (uint256 approval);

  /// @notice See how much a user is currently obligated by another.
  /// @param _user Address of the account that has had their funds obligated.
  /// @param _token The token for which the user has provided the approval.
  /// @param _obligator The address that obligated the funds (and therefore can slash or return them).
  /// @return approval The total amount for this obligation
  function getObligation(address _user, address _token, address _obligator) external view returns (uint256 approval);
}
