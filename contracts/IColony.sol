pragma solidity ^0.4.17;


contract IColony {
  function version() public view returns (uint256);
  function setToken(address _token) public;
}
