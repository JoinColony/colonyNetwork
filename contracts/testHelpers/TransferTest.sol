pragma solidity ^0.5.0;


contract TransferTest {
  constructor() public payable { }
  function() external payable { }

  function fireTransfer(address payable target, uint256 amount) public {
    target.transfer(amount);
  }

}
