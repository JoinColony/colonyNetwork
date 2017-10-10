pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";

import "../lib/dappsys/erc20.sol";


contract ERC20Extended is ERC20 {
  function mint(uint128 wad) public;
}
