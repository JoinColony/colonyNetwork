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

pragma solidity 0.5.8;

import "./GSN/GSNRecipient.sol";


contract ColonyGSNRecipient is GSNRecipient {
  function acceptRelayedCall(
    address relay,
    address from,
    bytes calldata encodedFunction,
    uint256 transactionFee,
    uint256 gasPrice,
    uint256 gasLimit,
    uint256 nonce,
    bytes calldata approvalData,
    uint256 maxPossibleCharge
  )
  external
  view
  returns (uint256, bytes memory)
  {
    return (0, "0x00");
  }

  function _preRelayedCall(bytes memory context) internal returns (bytes32) {
    return "0x00";
  }

  function _postRelayedCall(
    bytes memory context,
    bool success,
    uint256 actualCharge,
    bytes32 preRetVal
  ) internal
  {
    return;
  }
}
