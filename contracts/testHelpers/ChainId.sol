pragma solidity 0.7.3;


contract ChainId {
  function getChainId() pure external returns (uint256) {
    uint256 id;
    assembly {
      id := chainid()
    }
    return id;
  }
}