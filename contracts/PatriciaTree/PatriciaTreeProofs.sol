pragma solidity ^0.4.16;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";

import {Data} from "./Data.sol";
import {Bits} from "./Bits.sol";

/// @title Functions related to checking Patricia Tree proofs
/// @notice More info at: https://github.com/chriseth/patricia-trie
contract PatriciaTreeProofs {
  using Bits for uint;
  using Data for Data.Edge;
  using Data for Data.Label;

  function getImpliedRoot(bytes key, bytes value, uint branchMask, bytes32[] siblings) public view returns (bytes32) { // solium-disable-line security/no-assign-params
    Data.Label memory k = Data.Label(keccak256(key), 256);
    Data.Edge memory e;
    e.node = keccak256(value);
    for (uint i = 0; branchMask != 0; i++) {
      uint bitSet = branchMask.lowestBitSet();
      branchMask &= ~(uint(1) << bitSet);
      (k, e.label) = k.splitAt(255 - bitSet);
      uint bit;
      (bit, e.label) = e.label.chopFirstBit();
      bytes32[2] memory edgeHashes;
      edgeHashes[bit] = e.edgeHash();
      edgeHashes[1 - bit] = siblings[siblings.length - i - 1];
      e.node = keccak256(abi.encodePacked(edgeHashes));
    }
    e.label = k;
    return e.edgeHash();
  }
}
