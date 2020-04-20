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

pragma solidity >=0.5.8; // ignore-swc-103
pragma experimental "ABIEncoderV2";

import "./TokenLockingDataTypes.sol";


contract ITokenLocking is TokenLockingDataTypes {

  /// @notice Set the ColonyNetwork contract address.
  /// @dev ColonyNetwork is used for checking if sender is a colony created on colony network.
  /// @param _colonyNetwork Address of the ColonyNetwork
  function setColonyNetwork(address _colonyNetwork) public;

  /// @notice Get ColonyNetwork address.
  /// @return networkAddress ColonyNetwork address
  function getColonyNetwork() public view returns (address networkAddress);

  /// @notice Locks everyones' tokens on `_token` address.
  /// @param _token Address of the token we want to lock
  /// @return lockCount Updated total token lock count
  function lockToken(address _token) public returns (uint256 lockCount);

  /// @notice Increments the lock counter to `_lockId` for the `_user` if user's lock count is less than `_lockId` by 1.
  /// Can only be called by a colony.
  /// @param _token Address of the token we want to unlock
  /// @param _user Address of the user
  /// @param _lockId Id of the lock we want to increment to
  function unlockTokenForUser(address _token, address _user, uint256 _lockId) public;

  /// @notice Increments sender's lock count to `_lockId`.
  /// @param _token Address of the token we want to increment lock count for
  /// @param _lockId Id of the lock user wants to increment to
  function incrementLockCounterTo(address _token, uint256 _lockId) public;

  /// @notice DEPRECATED: Deposit `_amount` of colony tokens. Can only be called if user tokens are not locked.
  /// @param _token Address of the token to deposit
  /// @param _amount Amount to deposit
  function deposit(address _token, uint256 _amount) public;

  /// @notice Deposit `_amount` of colony tokens. Can only be called if user tokens are not locked.
  /// Before calling this function user has to allow that their tokens can be transferred by token locking contract.
  /// @param _token Address of the token to deposit
  /// @param _amount Amount to deposit
  /// @param _force Pass true to forcibly unlock the token
  function deposit(address _token, uint256 _amount, bool _force) public;

  /// @notice Claim any pending tokens. Can only be called if user tokens are not locked.
  /// @param _token Address of the token to withdraw from
  /// @param _force Pass true to forcibly unlock the token
  function claim(address _token, bool _force) public;

  /// @notice Transfer tokens to a recipient's pending balance. Can only be called if user tokens are not locked.
  /// @param _token Address of the token to transfer
  /// @param _amount Amount to transfer
  /// @param _recipient User to receive the tokens
  /// @param _force Pass true to forcibly unlock the token
  function transfer(address _token, uint256 _amount, address _recipient, bool _force) public;

  /// @notice DEPRECATED Withdraw `_amount` of deposited tokens. Can only be called if user tokens are not locked.
  /// @param _token Address of the token to withdraw from
  /// @param _amount Amount to withdraw
  function withdraw(address _token, uint256 _amount) public;

  /// @notice Withdraw `_amount` of deposited tokens. Can only be called if user tokens are not locked.
  /// @param _token Address of the token to withdraw from
  /// @param _amount Amount to withdraw
  /// @param _force Pass true to forcibly unlock the token
  function withdraw(address _token, uint256 _amount, bool _force) public;

  /// @notice Function called to punish people who staked against a new reputation root hash that turned out to be incorrect.
  /// @dev While public, it can only be called successfully by the current ReputationMiningCycle.
  /// @param _stakers Array of the addresses of stakers to punish
  /// @param _beneficiary Address of beneficiary to receive forfeited stake
  /// @param _amount Amount of stake to slash
  function punishStakers(address[] memory _stakers, address _beneficiary, uint256 _amount) public;

  /// @notice Allow the colony to obligate some amount of tokens as a stake.
  /// Can only be called by a colony.
  /// @param _colony Address of the colony we are willing to let obligate us.
  /// @param _amount Amount of that colony's internal token up to which we are willing to be obligated.
  /// @param _token The colony's internal token address
  function approveStake(address _colony, uint256 _amount, address _token) public;

  /// @notice Obligate the user some amount of tokens as a stake.
  /// Can only be called by a colony.
  /// @param _user Address of the account we are obligating.
  /// @param _amount Amount of the colony's internal token we are obligating.
  /// @param _token The colony's internal token address
  function obligateStake(address _user, uint256 _amount, address _token) public;

  /// @notice Deobligate the user some amount of tokens, releasing the stake.
  /// Can only be called by a colony.
  /// @param _user Address of the account we are deobligating.
  /// @param _amount Amount of colony's internal token we are deobligating.
  /// @param _token The colony's internal token address
  function deobligateStake(address _user, uint256 _amount, address _token) public;

  /// @notice Slash some amount of tokens.
  /// Can only be called by a colony.
  /// @param _user Address of the account we are slashing.
  /// @param _amount Amount of colony's internal token we are slashing.
  /// @param _token The colony's internal token address
  /// @param _beneficiary Recipient of the slashed tokens (pass 0x0 to send to the abyss).
  function slashStake(address _user, uint256 _amount, address _token, address _beneficiary) public;

  /// @notice Get global lock count for a specific token.
  /// @param _token Address of the token
  /// @return lockCount Global token lock count
  function getTotalLockCount(address _token) public view returns (uint256 lockCount);

  /// @notice Get user token lock info (lock count and deposited amount).
  /// @param _token Address of the token
  /// @param _user Address of the user
  /// @return lock Lock object containing:
  ///   `lockCount` User's token lock count,
  ///   `amount` User's deposited amount,
  ///   `timestamp` Timestamp of deposit.
  function getUserLock(address _token, address _user) public view returns (Lock memory lock);

  /// @notice See the total amount of a user's obligation.
  /// @param _user Address of the obligated account.
  /// @param _token The token for which the user is obligated.
  function getTotalObligation(address _user, address _token) public view returns (uint256);
}
