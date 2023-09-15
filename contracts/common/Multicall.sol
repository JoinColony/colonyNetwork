// SPDX-License-Identifier: GPL-2.0-or-later
// Mostly taken from Uniswap/v3-periphery repository, with payable removed and solidity version
// adjustments
pragma solidity 0.8.21;
pragma experimental "ABIEncoderV2";
import {MetaTransactionMsgSender} from "./MetaTransactionMsgSender.sol";

abstract contract Multicall is MetaTransactionMsgSender {
  bytes4 constant multicallSig = bytes4(keccak256("multicall(bytes[])"));

  function multicall(bytes[] calldata data) public returns (bytes[] memory results) {
    // First off, is this a metatransaction?
    address sender = msgSender();
    bytes memory affix;
    if (msg.sender == address(this) && sender != address(this)) {
      // If it's a metatransaction, we re-append the metatransaction identifier to each call we make
      affix = abi.encodePacked(METATRANSACTION_FLAG, sender);
    }

    results = new bytes[](data.length);
    for (uint256 i; i < data.length; i++) {
      require(bytes4(data[i]) != multicallSig, "colony-multicall-cannot-multicall");
      // Slither is technically right here, but only one is (fully) under the user's control, and I
      // don't think this type of pattern is exploitable here, anyway (because we're not hashing the
      // result and using it to verify something).
      // slither-disable-next-line encode-packed-collision
      (bool success, bytes memory result) = address(this).delegatecall(abi.encodePacked(data[i], affix));

      if (!success) {
        // Next 5 lines from https://ethereum.stackexchange.com/a/83577
        if (result.length < 68) revert();
        assembly {
          result := add(result, 0x04)
        }
        revert(abi.decode(result, (string)));
      }

      results[i] = result;
    }
  }
}
