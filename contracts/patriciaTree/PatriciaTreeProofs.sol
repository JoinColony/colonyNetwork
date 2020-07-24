pragma solidity ^0.5.8;
pragma experimental "ABIEncoderV2";

import {Data} from "./Data.sol";
import {Bits} from "./Bits.sol";


/// @title Functions related to checking Patricia Tree proofs
/// @notice More info at: https://github.com/chriseth/patricia-trie
contract PatriciaTreeProofs {
  using Bits for uint;
  using Data for Data.Edge;
  using Data for Data.Label;

  function getImpliedRootHashKey(bytes memory key, bytes memory value, uint256 branchMask, bytes32[] memory siblings) internal
  pure returns (bytes32)
  {
    bytes32 hash;
    (hash, ) = getImpliedRootFunctionality(keccak256(key), keccak256(value), branchMask, siblings);
    return hash;
  }

  function getImpliedRootNoHashKey(bytes32 key, bytes memory value, uint256 branchMask, bytes32[] memory siblings) internal
  pure returns (bytes32)
  {
    bytes32 hash;
    (hash, ) = getImpliedRootFunctionality(key, keccak256(value), branchMask, siblings);
    return hash;
  }

  function getFinalPairAndImpliedRootNoHash(bytes32 key, bytes memory value, uint256 branchMask, bytes32[] memory siblings) internal
  pure returns (bytes32, bytes32[2] memory)
  {
    return getImpliedRootFunctionality(key, keccak256(value), branchMask, siblings);
  }

  // solium-disable-next-line security/no-assign-params
  function getImpliedRootFunctionality(bytes32 keyHash, bytes32 valueHash, uint256 branchMask, bytes32[] memory siblings) private
  pure returns (bytes32, bytes32[2] memory)
  {
    Data.Label memory k = Data.Label(keyHash, 256);
    Data.Edge memory e;
    e.node = valueHash;
    bytes32[2] memory edgeHashes;

    for (uint i = 0; i < siblings.length; i++) {
      uint bitSet = branchMask.lowestBitSet();
      branchMask &= ~(uint(1) << bitSet);
      (k, e.label) = k.splitAt(255 - bitSet);
      uint bit;
      (bit, e.label) = e.label.chopFirstBit();
      edgeHashes[bit] = e.edgeHash();
      edgeHashes[1 - bit] = siblings[siblings.length - i - 1]; // ignore-swc-101
      e.node = keccak256(abi.encodePacked(edgeHashes));
    }
    if (branchMask == 0) {
      e.label = k;
    } else {
      uint lowestBitSet = branchMask.lowestBitSet();
      (k, e.label) = k.splitAt(255 - lowestBitSet);
      (, e.label) = e.label.chopFirstBit();
    }
    return (e.edgeHash(), edgeHashes);
  }
}
