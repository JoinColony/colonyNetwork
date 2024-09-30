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
pragma experimental ABIEncoderV2;

contract ExtractCallData {
  // From https://ethereum.stackexchange.com/questions/131283/how-do-i-decode-call-data-in-solidity
  function extractCalldata(bytes memory calldataWithSelector) internal pure returns (bytes memory) {
    bytes memory calldataWithoutSelector;
    require(calldataWithSelector.length >= 4, "colony-calldata-too-short");

    assembly {
      let totalLength := mload(calldataWithSelector)
      let targetLength := sub(totalLength, 4)
      calldataWithoutSelector := mload(0x40)

      // Set the length of callDataWithoutSelector (initial length - 4)
      mstore(calldataWithoutSelector, targetLength)

      // Mark the memory space taken for callDataWithoutSelector as allocated
      mstore(0x40, add(calldataWithoutSelector, add(0x20, targetLength)))

      // Process first 32 bytes (we only take the last 28 bytes)
      mstore(add(calldataWithoutSelector, 0x20), shl(0x20, mload(add(calldataWithSelector, 0x20))))

      // Process all other data by chunks of 32 bytes
      for {
        let i := 0x1C
      } lt(i, targetLength) {
        i := add(i, 0x20)
      } {
        mstore(
          add(add(calldataWithoutSelector, 0x20), i),
          mload(add(add(calldataWithSelector, 0x20), add(i, 0x04)))
        )
      }
    }

    return calldataWithoutSelector;
  }
}
