pragma solidity ^0.5.8;
pragma experimental "ABIEncoderV2";

import "./PatriciaTreeBase.sol";
import "./IPatriciaTreeNoHash.sol";


/// @title Patricia tree implementation
/// @notice More info at: https://github.com/chriseth/patricia-trie
contract PatriciaTreeNoHash is IPatriciaTreeNoHash, PatriciaTreeBase {

  function insert(bytes32 key, bytes memory value) public {
    tree.insert(key, value);
  }

  function getProof(bytes32 key) public view returns (uint branchMask, bytes32[] memory _siblings) {
    return getProofFunctionality(key);
  }

  function getImpliedRoot(bytes32 key, bytes memory value, uint branchMask, bytes32[] memory siblings) public
  pure returns (bytes32)
  {
    return getImpliedRootNoHashKey(key, value, branchMask, siblings);
  }

}
