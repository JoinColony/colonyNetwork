pragma solidity ^0.4.15;


contract IColony {
  uint256 public version;

  function setToken(address _token);
  //function userIsInRole(address _user, uint _role) constant returns (bool);
  function upgrade(address newAddress);
}
