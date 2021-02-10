pragma solidity 0.7.3;

import "../common/MultiChain.sol";

contract ChainId is MultiChain {
  function getChainId() view external returns (uint256) {
  	return chainId();
  }
}