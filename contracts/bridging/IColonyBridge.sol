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
pragma experimental "ABIEncoderV2";

interface IColonyBridge {
  /// @notice Function that checks whether a chain with the supplied evmChainId is supported
  /// @param _evmChainId The chain id to check
  /// @return bool Whether the chain is supported
  function supportedEvmChainId(uint256 _evmChainId) external view returns (bool);

  /// @notice Function to set the colony network address that the bridge will interact with
  /// @param _colonyNetwork The address of the colony network
  function setColonyNetworkAddress(address _colonyNetwork) external;

  /// @notice Function to get the colony network address that the bridge is interacting with
  /// @return address The address of the colony network
  function colonyNetwork() external view returns (address);

  /// @notice Function to set the address of the instance of this contract on other chains, that
  /// this contract will expect to receive messages from
  /// @param _evmChainId The chain id to set the address for
  /// @param _colonyBridge The address of the colony bridge contract on the other chain
  function setColonyBridgeAddress(uint256 _evmChainId, address _colonyBridge) external;

  /// @notice Function to get the address of the instance of this contract on other chains
  /// @param evmChainId The chain id to get the address for
  function getColonyBridgeAddress(uint256 evmChainId) external view returns (address);

  /// @notice Function to send a message to the colony bridge on another chain
  /// @param evmChainId The chain id to send the message to
  /// @param payload The message payload
  /// @return bool Whether the message was sent successfully (to the best of the contract's knowledge,
  /// in terms of the underlying bridge implementation)
  function sendMessage(uint256 evmChainId, bytes memory payload) external returns (bool);
}
