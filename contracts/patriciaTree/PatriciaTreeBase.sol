pragma solidity 0.7.3;
pragma experimental "ABIEncoderV2";

import {Data} from "./Data.sol";
import {Bits} from "./Bits.sol";
import "./PatriciaTreeProofs.sol";


/// @title Patricia tree implementation
/// @notice More info at: https://github.com/chriseth/patricia-trie
contract PatriciaTreeBase is PatriciaTreeProofs {

  using Data for Data.Tree;
  using Data for Data.Edge;
  using Data for Data.Label;
  using Bits for uint;

  Data.Tree internal tree;

  function getRootHash() public view virtual returns (bytes32) {
    return tree.root;
  }

  function getRootEdge() public view virtual returns (Data.Edge memory e) {
    e = tree.rootEdge;
  }

  function getNode(bytes32 hash) public view virtual returns (Data.Node memory n) {
    n = tree.nodes[hash];
  }

  function getProofFunctionality(bytes32 key) internal view returns (uint branchMask, bytes32[] memory _siblings) {
    require(tree.root != 0, "colony-patricia-tree-zero-tree-root");
    Data.Label memory k = Data.Label(key, 256);
    Data.Edge memory e = tree.rootEdge;
    bytes32[256] memory siblings;
    uint length;
    uint numSiblings;
    while (true) {
      Data.Label memory prefix;
      Data.Label memory suffix;
      (prefix, suffix) = k.splitCommonPrefix(e.label);
      assert(prefix.length == e.label.length); // I.e. never an unseen branch ignore-swc-110
      if (suffix.length == 0) {
        // Found it
        break;
      }
      length += prefix.length;
      branchMask |= uint(1) << 255 - length;
      length += 1;
      uint256 head;
      Data.Label memory tail;
      (head, tail) = suffix.chopFirstBit();
      siblings[numSiblings++] = tree.nodes[e.node].children[1 - head].edgeHash();
      e = tree.nodes[e.node].children[head];
      k = tail;
    }
    if (numSiblings > 0) {
      _siblings = new bytes32[](numSiblings);
      for (uint i = 0; i < numSiblings; i++) {
        _siblings[i] = siblings[i];
      }
    }
  }
}
