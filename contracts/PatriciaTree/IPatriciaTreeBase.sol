pragma solidity >=0.5.8; // ignore-swc-103
pragma experimental "ABIEncoderV2";

import {Data} from "./Data.sol";


/// @title Interface for Patricia trees
/// @notice More info at: https://github.com/chriseth/patricia-trie
contract IPatriciaTreeBase {

  /// @notice Get the root hash
  /// @dev This value is a keccak256 hash of the rootEdge: `keccak256(Edge.node, Edge.label.length, Edge.label.data)`
  /// @return rootHash The `bytes32` hash value
  function getRootHash() public view returns (bytes32 rootHash);

  /// @notice Get the root edge
  /// @return e The root `Data.Edge`
  function getRootEdge() public view returns (Data.Edge memory e);

  /// @notice Get the node with the given key
  /// @param hash The `keccak256` hash of the actual key
  /// @return n `Data.Node` for key `hash`
  function getNode(bytes32 hash) public view returns (Data.Node memory n);
}
