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

contract BridgeMock {
  event UserRequestForSignature(bytes32 indexed messageId, bytes encodedData);
  bool bridgeEnabled = true;
  address public messageSender;

  function requireToPassMessage(address _target, bytes memory _data, uint256 _gasLimit) public {
    require(bridgeEnabled, "bridge-not-working");
    emit UserRequestForSignature(
      keccak256(abi.encodePacked(_target, _data, block.timestamp)),
      abi.encode(_target, _data, _gasLimit, msg.sender)
    );
  }

  event RelayedMessage(address sender, address executor, bytes32 messageId, bool status);

  function execute(
    address _target,
    bytes memory _data,
    uint256 _gasLimit,
    bytes32 _messageId,
    address _sender
  ) public {
    require(messageSender == address(0), "bridge-no-nested-calls");
    messageSender = _sender;

    (bool success, bytes memory returndata) = address(_target).call{ gas: _gasLimit }(_data);

    // call failed
    if (!success) {
      if (returndata.length == 0) revert();
      assembly {
        revert(add(32, returndata), mload(returndata))
      }
    }

    messageSender = address(0);

    emit RelayedMessage(_sender, msg.sender, _messageId, success);
  }

  function setBridgeEnabled(bool val) public {
    bridgeEnabled = val;
  }
}
