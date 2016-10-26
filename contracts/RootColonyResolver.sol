pragma solidity ^0.4.0;

import 'IRootColonyResolver.sol';


contract RootColonyResolver is IRootColonyResolver {

  /// @notice this function takes an address (Supposedly, the RootColony address)
  /// @param _rootColonyAddress the RootColony address
  function registerRootColony(address _rootColonyAddress)
  onlyOwner
  {
    rootColonyAddress = _rootColonyAddress;
  }
}
