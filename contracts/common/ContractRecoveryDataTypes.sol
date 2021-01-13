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

pragma solidity 0.7.3;


interface ContractRecoveryDataTypes {
  /// @notice Event logged when user gets/loses the recovery role.
  /// @param user The address being modified
  /// @param setTo The boolean indicating whether the role is being granted or revoked
  event RecoveryRoleSet(address indexed user, bool setTo);

  /// @notice Event logged when recovery mode is triggered.
  /// @param user The address that triggered recovery mode
  event RecoveryModeEntered(address user);

  /// @notice Event logged when recovery mode is left
  /// @param user The address that left recovery mode
  event RecoveryModeExited(address user);

  /// @notice Event logged when in recovery mode a storage slot is set
  /// @param user The address that set the storage slot
  /// @param slot The storage slot being modified
  /// @param fromValue The value the storage slot had before this transaction
  /// @param toValue The value the storage slot has after this transaction
  event RecoveryStorageSlotSet(address user, uint256 slot, bytes32 fromValue, bytes32 toValue);

  /// @notice Event logged when someone with recovery mode signals they are happy with the state
  /// and wish to leave recovery mode
  /// @param user The address signalling they are happy with the state
  event RecoveryModeExitApproved(address user);

}
