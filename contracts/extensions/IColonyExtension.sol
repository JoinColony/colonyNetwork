// SPDX-License-Identifier: GPL-3.0-or-later
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

pragma solidity 0.8.25;
pragma experimental ABIEncoderV2;
import { IBasicMetaTransaction } from "./../common/IBasicMetaTransaction.sol";

interface IColonyExtension is IBasicMetaTransaction {
  /// @notice Returns the identifier of the extension
  /// @return identifier The extension's identifier
  function identifier() external pure returns (bytes32 identifier);

  /// @notice Returns the version of the extension
  /// @return version The extension's version number
  function version() external pure virtual returns (uint256 version);

  /// @notice Configures the extension
  /// @param _colony The colony in which the extension holds permissions
  function install(address _colony) external virtual;

  /// @notice Called when upgrading the extension (can be a no-op)
  function finishUpgrade() external virtual;

  /// @notice Called when deprecating (or undeprecating) the extension
  /// @param _deprecated Indicates whether the extension should be deprecated or undeprecated
  function deprecate(bool _deprecated) external virtual;

  /// @notice Called when uninstalling the extension
  function uninstall() external virtual;

  /// @notice Gets the bytes32 representation of the roles authorized to call a function
  /// @param _sig The function signature
  /// @return roles bytes32 representation of the authorized roles
  function getCapabilityRoles(bytes4 _sig) external view virtual returns (bytes32 roles);

  /// @notice Gets the boolean indicating whether or not the extension is deprecated
  /// @return deprecated Boolean indicating whether or not the extension is deprecated
  function getDeprecated() external view returns (bool deprecated);

  /// @notice Gets the address of the extension's colony
  /// @return colony The address of the colony
  function getColony() external view returns (address colony);

  /// @notice Call multiple functions in the current contract and return the data from all of them if they all succeed
  /// @dev The `msg.value` should not be trusted for any method callable from multicall.
  /// @param _data The encoded function data for each of the calls to make to this contract
  /// @return results The results from each of the calls passed in via data
  function multicall(bytes[] calldata _data) external virtual returns (bytes[] memory results);
}
