pragma solidity 0.7.3;
pragma experimental "ABIEncoderV2";

import "./PatriciaTreeBase.sol";
import "./IPatriciaTree.sol";


/// @title Patricia tree implementation
/// @notice More info at: https://github.com/chriseth/patricia-trie
contract PatriciaTree is IPatriciaTree, PatriciaTreeBase {

  using Data for Data.Tree;
  using Data for Data.Edge;
  using Data for Data.Label;
  using Bits for uint;

  function insert(bytes memory key, bytes memory value) public override {
    tree.insert(keccak256(key), value);
  }

  function getProof(bytes memory key) public view override returns (uint branchMask, bytes32[] memory _siblings) { // ignore-swc-127
    return getProofFunctionality(keccak256(key));
  }

  function getImpliedRoot(bytes memory key, bytes memory value, uint branchMask, bytes32[] memory siblings) public
  pure override returns (bytes32)
  {
    return getImpliedRootHashKey(key, value, branchMask, siblings);
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
