// SPDX-License-Identifier: GPL-2.0-or-later
// Mostly taken from Uniswap/v3-periphery repository, with payable removed and solidity version
// adjustments
pragma solidity 0.7.3;
pragma experimental "ABIEncoderV2";
import "./MetaTransactionMsgSender.sol";

abstract contract Multicall is MetaTransactionMsgSender {
    function multicall(bytes[] calldata data) public returns (bytes[] memory results) {
        // First off, is this a metatransaction?
        address sender = msgSender();
        bytes memory affix;
        if (msg.sender == address(this) && sender != address(this)){
            // If it's a metatransaction, we re-append the metatransaction identifier to each call we make
            affix = abi.encodePacked(METATRANSACTION_FLAG, sender);
        }

        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
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