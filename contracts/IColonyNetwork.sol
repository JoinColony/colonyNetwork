pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";


contract IColonyNetwork {
  function getColony(bytes32 key) public returns (address);
}
