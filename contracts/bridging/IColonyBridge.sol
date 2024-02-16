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

pragma solidity 0.8.23;
pragma experimental "ABIEncoderV2";

interface IColonyBridge {
  function supportedEvmChainId(uint256 _evmChainId) external pure returns (bool);

  function setColonyNetworkAddress(address _colonyNetwork) external;

  function getColonyNetworkAddress() external view returns (address);

  function setColonyBridgeAddress(uint256 evmChainId, address _colonyNetwork) external;

  function getColonyBridgeAddress(uint256 evmChainId) external view returns (address);

  function sendMessage(uint256 evmChainId, bytes memory payload) external returns (bool);
}
