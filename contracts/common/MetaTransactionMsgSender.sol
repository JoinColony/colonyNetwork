// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.25;

import { DSMath } from "../../lib/dappsys/math.sol";

abstract contract MetaTransactionMsgSender is DSMath {
  bytes32 constant METATRANSACTION_FLAG = keccak256("METATRANSACTION");

  function msgSender() internal view returns (address payable sender) {
    if (isMetatransaction()) {
      bytes memory array = msg.data;
      uint256 index = msg.data.length;
      assembly {
        // Load the 32 bytes word from memory with the address on the lower 20 bytes, and mask those.
        sender := and(mload(add(array, index)), 0xffffffffffffffffffffffffffffffffffffffff)
      }
    } else {
      return payable(msg.sender);
    }
  }

  function isMetatransaction() internal view returns (bool) {
    uint256 index = msg.data.length;
    if (msg.sender == address(this) && index >= 52) {
      bytes memory array = msg.data;
      bytes32 flag;
      assembly {
        flag := mload(add(array, sub(index, 20)))
      }
      return flag == METATRANSACTION_FLAG;
    }
    return false;
  }
}
