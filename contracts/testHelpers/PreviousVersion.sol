// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.23;

contract Version3 {
  function version() external pure returns (uint256) {
    return 3;
  }
}

contract Version4 {
  function version() external pure returns (uint256) {
    return 4;
  }
}
