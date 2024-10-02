// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.27;

contract TransferTest {
  constructor() payable {
    // solhint-disable-line no-empty-blocks
  }

  function fireTransfer(address payable target, uint256 amount) public {
    target.transfer(amount); // ignore-swc-105 - this is a test file, and is meant to do this!
  }
}
