pragma solidity ^0.4.15;


contract IColony {
  function version() constant returns (uint256);
  function setToken(address _token);
}
