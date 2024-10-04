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

import { MetaTransactionMsgSender } from "./MetaTransactionMsgSender.sol";
import { EIP712MetaTransactionDataTypes } from "./EIP712MetaTransactionDataTypes.sol";

contract EIP712MetaTransaction is MetaTransactionMsgSender, EIP712MetaTransactionDataTypes {
  string constant EIP_712_PREFIX = "\x19\x01";
  bytes32 private constant TYPE_HASH =
    keccak256("EIP712Domain(string name,string version,address verifyingContract,bytes32 salt)");
  function domainSeparator() public view returns (bytes32) {
    return
      keccak256(
        abi.encode(
          TYPE_HASH,
          keccak256("Colony"),
          keccak256("1"),
          address(this),
          keccak256(abi.encode(block.chainid))
        )
      );
  }

  function checkEIP712MetaTransaction(
    bytes32 digest,
    EIP712Signature memory _signature
  ) internal view {
    require(_signature.deadline >= block.timestamp, "colony-token-expired-deadline");
    address recoveredAddress = ecrecover(digest, _signature.v, _signature.r, _signature.s);
    require(
      recoveredAddress != address(0) && recoveredAddress == _signature.signer,
      "colony-invalid-signature"
    );
  }

  function sendMetaTransaction(
    bytes memory _payload,
    address _user
  ) internal returns (bytes memory returnData) {
    // Append _user at the end to extract it from calling context
    bool success;
    (success, returnData) = address(this).call(
      abi.encodePacked(_payload, METATRANSACTION_FLAG, _user)
    );
    require(success, "colony-metatx-function-call-unsuccessful");
    return returnData;
  }
}
