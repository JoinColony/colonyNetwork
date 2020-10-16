pragma solidity 0.7.3;
pragma experimental "ABIEncoderV2";


library Bits {
  // Bits library
  // Subset of the bits library found at https://github.com/ethereum/solidity-examples
  // only these parts are used by the PatriciaTree implementation, so removed the unused functions
  // for brevity

  uint constant internal ONE = uint(1);

  /// @notice Computes the index of the highest bit set in 'self'.
  /// Returns the highest bit set as an `uint8`
  /// @param self The `uint256` to find the highest bit set in
  /// @dev Requires that `self != 0`.
  function highestBitSet(uint self) internal pure returns (uint8 highest) {
    require(self != 0, "colony-patricia-tree-zero-self");
    uint val = self;
    for (uint8 i = 128; i >= 1; i >>= 1) {
      if (val & (ONE << i) - 1 << i != 0) {
        highest += i;
        val >>= i;
      }
    }
  }

  /// @notice Computes the index of the lowest bit set in 'self'.
  /// Returns the lowest bit set as an `uint8`
  /// @param self The `uint256` to find the lowest bit set in
  /// @dev Requires that `self != 0`.
  function lowestBitSet(uint self) internal pure returns (uint8 lowest) {
    require(self != 0, "colony-patricia-tree-zero-self");
    uint val = self;
    for (uint8 i = 128; i >= 1; i >>= 1) {
      if (val & (ONE << i) - 1 == 0) { // ignore-swc-101 TODO: this one also only shows up if analysing PatricaTree.sol
        lowest += i;
        val >>= i;
      }
    }
  }

}
