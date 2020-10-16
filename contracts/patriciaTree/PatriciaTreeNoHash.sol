pragma solidity 0.7.3;
pragma experimental "ABIEncoderV2";

import "./PatriciaTreeBase.sol";
import "./IPatriciaTreeNoHash.sol";


/// @title Patricia tree implementation
/// @notice More info at: https://github.com/chriseth/patricia-trie
contract PatriciaTreeNoHash is IPatriciaTreeNoHash, PatriciaTreeBase {

  using Data for Data.Tree;
  using Data for Data.Edge;
  using Data for Data.Label;
  using Bits for uint;

  function insert(bytes32 key, bytes memory value) public override {
    tree.insert(key, value);
  }

  function getProof(bytes32 key) public view override returns (uint branchMask, bytes32[] memory _siblings) {
    return getProofFunctionality(key);
  }

  function getImpliedRoot(bytes32 key, bytes memory value, uint branchMask, bytes32[] memory siblings) public
  pure override returns (bytes32)
  {
    return getImpliedRootNoHashKey(key, value, branchMask, siblings);
  }

  function getRootHash() public view override(IPatriciaTreeBase, PatriciaTreeBase) returns (bytes32) {
    return super.getRootHash();
  }

  function getRootEdge() public view override(IPatriciaTreeBase, PatriciaTreeBase) returns (Data.Edge memory e) {
    return super.getRootEdge();
  }

  function getNode(bytes32 hash) public view override(IPatriciaTreeBase, PatriciaTreeBase) returns (Data.Node memory n) {
    return super.getNode(hash);
  }
}
