// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.27;

import { DSMath } from "../../lib/dappsys/math.sol";

abstract contract MetaTransactionMsgSender is DSMath {
  bytes32 constant METATRANSACTION_FLAG = keccak256("METATRANSACTION");
  uint256 constant METATRANSACTION_DATA_MIN_LENGTH = 32 + 20;
  // Where 32 is the length of METATRANSACTION_FLAG in bytes
  // Where 20 is the length of an address in bytes

  function msgSender() internal view returns (address payable sender) {
    uint256 index = msg.data.length;
    if (msg.sender == address(this) && index >= METATRANSACTION_DATA_MIN_LENGTH) {
      bytes memory array = msg.data;
      bytes32 flag;
      assembly {
        flag := mload(add(array, sub(index, 20)))
      }
      if (flag != METATRANSACTION_FLAG) {
        return payable(msg.sender);
      }
      assembly {
        // Load the 32 bytes word from memory with the address on the lower 20 bytes, and mask those.
        sender := and(mload(add(array, index)), 0xffffffffffffffffffffffffffffffffffffffff)
      }
    } else {
      return payable(msg.sender);
    }
  }
}
