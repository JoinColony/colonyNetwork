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

pragma solidity 0.8.21;

contract BridgeMock {
  event UserRequestForSignature(bytes32 indexed messageId, bytes encodedData);

  function requireToPassMessage(
    address _target,
    bytes memory _data,
    uint256 _gasLimit
  ) public {
    emit UserRequestForSignature(
      keccak256(abi.encodePacked(_target, _data, block.timestamp)),
      abi.encode(_target, _data, _gasLimit, msg.sender)
    );
  }

  event RelayedMessage(
    address sender,
    address executor,
    bytes32 messageId,
    bool status
  );

  function execute(
    address _target,
    bytes memory _data,
    uint256 _gasLimit,
    bytes32 _messageId,
    address _sender
  ) public {
    bool success;
    assembly {
      // call contract at address a with input mem[in…(in+insize))
      //   providing g gas and v wei and output area mem[out…(out+outsize))
      //   returning 0 on error (eg. out of gas) and 1 on success

      // call(g,     a,  v,     in,              insize,      out, outsize)
      success := call(
        _gasLimit,
        _target,
        0,
        add(_data, 0x20),
        mload(_data),
        0,
        0
      )
    }

    emit RelayedMessage(_sender, msg.sender, _messageId, success);
  }
}
