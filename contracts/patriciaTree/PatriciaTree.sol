pragma solidity ^0.5.8;
pragma experimental "ABIEncoderV2";

import "./PatriciaTreeBase.sol";
import "./IPatriciaTree.sol";


/// @title Patricia tree implementation
/// @notice More info at: https://github.com/chriseth/patricia-trie
contract PatriciaTree is IPatriciaTree, PatriciaTreeBase {

  function insert(bytes memory key, bytes memory value) public {
    tree.insert(keccak256(key), value);
  }

  function getProof(bytes memory key) public view returns (uint branchMask, bytes32[] memory _siblings) { // ignore-swc-127
    return getProofFunctionality(keccak256(key));
  }

  function getImpliedRoot(bytes memory key, bytes memory value, uint branchMask, bytes32[] memory siblings) public
  pure returns (bytes32)
  {
    return getImpliedRootHashKey(key, value, branchMask, siblings);
  }


}
