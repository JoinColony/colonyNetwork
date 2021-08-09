pragma solidity 0.7.3;

import "../../lib/dappsys/math.sol";

abstract contract MetaTransactionMsgSender is DSMath {

  bytes32 constant METATRANSACTION_FLAG = keccak256("METATRANSACTION");

  function msgSender() internal view returns(address payable sender) {
    uint256 index = msg.data.length;
    if(msg.sender == address(this) && index >= 52) {
      bytes memory array = msg.data;
      bytes32 flag;
      assembly {
        flag := mload(add(array, sub(index, 20)))
      }
      if (flag != METATRANSACTION_FLAG){
        return msg.sender;
      }
      assembly {
        // Load the 32 bytes word from memory with the address on the lower 20 bytes, and mask those.
        sender := and(mload(add(array, index)), 0xffffffffffffffffffffffffffffffffffffffff)
      }
    } else {
      return msg.sender;
    }
  }
}