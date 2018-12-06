pragma solidity ^0.4.16;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";

import {Data} from "./Data.sol";
import "./IPatriciaTreeBase.sol";


/// @title Interface for Patricia trees
/// @notice More info at: https://github.com/chriseth/patricia-trie
contract IPatriciaTree is IPatriciaTreeBase {

  /// @notice Insert the `key`/`value`in the appropriate place in the tree
  function insert(bytes key, bytes value) public;
}
