pragma solidity ^0.4.16;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";

import {Data} from "./Data.sol";


/// @title Interface for Patricia trees
/// @notice More info at: https://github.com/chriseth/patricia-trie
contract IPatriciaTree {

  /// @notice Get the root hash
  /// @dev This value is a keccak256 hash of the rootEdge: `keccak256(Edge.node, Edge.label.length, Edge.label.data)`
  /// @return rootHash The `bytes32` hash value
  function getRootHash() public view returns (bytes32 rootHash);

  /// @notice Get the root edge
  /// @return e The root `Data.Edge`
  function getRootEdge() public view returns (Data.Edge e);

  /// @notice Get the node with the given key
  /// @param hash The `keccak256` hash of the actual key
  /// @return n `Data.Node` for key `hash`
  function getNode(bytes32 hash) public view returns (Data.Node n);

  /// @notice Returns the Merkle-proof for the given `key`
  /// @return branchMask Bitmask with high bits at the positions in the `key` where we have branch nodes (bit in key denotes direction)
  /// @return _siblings Hashes of sibling edges
  function getProof(bytes key) public view returns (uint branchMask, bytes32[] _siblings);

  /// @notice Calculates and returns a root hash for the `key`, `value`, `branchMask` and `siblings`
  /// @return rootHash The calculated hash
  function getImpliedRoot(bytes key, bytes value, uint branchMask, bytes32[] siblings) public pure returns (bytes32 rootHash);

  /// @notice Insert the `key`/`value`in the appropriate place in the tree
  function insert(bytes32 key, bytes value) public;
}
