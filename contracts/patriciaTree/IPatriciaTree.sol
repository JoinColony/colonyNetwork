pragma solidity >=0.8.14; // ignore-swc-103
pragma experimental "ABIEncoderV2";

import {Data} from "./Data.sol";
import "./IPatriciaTreeBase.sol";


interface IPatriciaTree is IPatriciaTreeBase {

  /// @notice Insert the `key`/`value`in the appropriate place in the tree
  function insert(bytes memory key, bytes memory value) external;

  /// @notice Returns the Merkle-proof for the given `key`
  /// @return branchMask Bitmask with high bits at the positions in the `key` where we have branch nodes (bit in key denotes direction)
  /// @return _siblings Hashes of sibling edges
  function getProof(bytes memory key) external view returns (uint branchMask, bytes32[] memory _siblings);

  /// @notice Calculates and returns a root hash for the `key`, `value`, `branchMask` and `siblings`
  /// @return rootHash The calculated hash
  function getImpliedRoot(bytes memory key, bytes memory value, uint256 branchMask, bytes32[] memory siblings)
    external pure returns (bytes32 rootHash);

}
