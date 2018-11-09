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

pragma solidity ^0.4.23;
pragma experimental "v0.5.0";


/// @title Recovery interface
/// @notice All publicly available functions are available here and registered to work with EtherRouter Network contract
contract IRecovery {
/// @notice Put colony network mining into recovery mode.
  /// Can only be called by user with recovery role.
  function enterRecoveryMode() public;

  /// @notice Exit recovery mode, can be called by anyone if enough whitelist approvals are given.
  function exitRecoveryMode() public;

  /// @notice Indicate approval to exit recovery mode.
  /// Can only be called by user with recovery role.
  function approveExitRecovery() public;

  /// @notice Is colony network in recovery mode
  /// @return inRecoveryMode Return true if recovery mode is active, false otherwise
  function isInRecoveryMode() public view returns (bool inRecoveryMode);

  /// @notice Set new colony recovery role.
  /// Can be called by owner.
  /// @param _user User we want to give a recovery role to
  function setRecoveryRole(address _user) public;

  /// @notice Remove colony recovery role.
  /// Can only be called by owner role.
  /// @param _user User we want to remove recovery role from
  function removeRecoveryRole(address _user) public;

  /// @notice Return number of recovery roles.
  /// @return numRoles Number of users with the recovery role (excluding owner)
  function numRecoveryRoles() public view returns(uint64 numRoles);

  /// @notice Update value of arbitrary storage variable.
  /// Can only be called by user with recovery role.
  /// @param _slot Uint address of storage slot to be updated
  /// @param _value Bytes32 word of data to be set
  /// @dev certain critical variables are protected from editing in this function
  function setStorageSlotRecovery(uint256 _slot, bytes32 _value) public;

  /// @notice Check whether the supplied slot is a protected variable specific to this contract
  /// @param _slot The storage slot number to check.
  /// @dev No return value, but should throw if protected.
  /// @dev This is public, but is only expected to be called from ContractRecovery; no need to
  /// @dev expose this to any users.
  function checkNotAdditionalProtectedVariable(uint256 _slot) public view;
}