pragma solidity ^0.4.0;

import "IUpgradable.sol";


contract IColony is IUpgradable {
  address public rootColonyResolverAddress;
  address public eternalStorage;

  /// @notice returns user info based in a given address
  /// @param _user the address to be verified
  /// @return a boolean value indicating if the user is an owner
  function userIsInRole(address _user, uint _role) constant returns (bool);
}
