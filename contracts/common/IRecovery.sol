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

import "./ContractRecoveryDataTypes.sol";


/// @title Recovery interface
/// @notice All externally available functions are available here and registered to work with EtherRouter Network contract
interface IRecovery is ContractRecoveryDataTypes {
  /// @notice Put colony network mining into recovery mode.
  /// Can only be called by user with recovery role.
  function enterRecoveryMode() external;

  /// @notice Exit recovery mode, can be called by anyone if enough whitelist approvals are given.
  function exitRecoveryMode() external;

  /// @notice Indicate approval to exit recovery mode.
  /// Can only be called by user with recovery role.
  function approveExitRecovery() external;

  /// @notice Is colony network in recovery mode.
  /// @return inRecoveryMode Return true if recovery mode is active, false otherwise
  function isInRecoveryMode() external view returns (bool inRecoveryMode);

  /// @notice Set new colony recovery role.
  /// Can be called by root.
  /// @param _user User we want to give a recovery role to
  function setRecoveryRole(address _user) external;

  /// @notice Remove colony recovery role.
  /// Can only be called by root role.
  /// @param _user User we want to remove recovery role from
  function removeRecoveryRole(address _user) external;

  /// @notice Return number of recovery roles.
  /// @return numRoles Number of users with the recovery role.
  function numRecoveryRoles() external view returns(uint64 numRoles);

  /// @notice Update value of arbitrary storage variable.
  /// Can only be called by user with recovery role.
  /// @param _slot Uint address of storage slot to be updated
  /// @param _value word of data to be set
  /// @dev certain critical variables are protected from editing in this function
  function setStorageSlotRecovery(uint256 _slot, bytes32 _value) external;

  /// @notice Check whether the supplied slot is a protected variable specific to this contract
  /// @param _slot The storage slot number to check.
  /// @dev No return value, but should throw if protected.
  /// @dev This is external, but is only expected to be called from ContractRecovery; no need to
  /// @dev expose this to any users.
  function checkNotAdditionalProtectedVariable(uint256 _slot) external view;
}
