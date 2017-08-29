pragma solidity ^0.4.8;

import './IRootColonyResolver.sol';


contract RootColonyResolver is IRootColonyResolver {

  /// @notice this function takes an address (Supposedly, the ColonyNetwork address)
  /// @param _rootColonyAddress the ColonyNetwork address
  function registerRootColony(address _rootColonyAddress)
  onlyOwner
  {
    rootColonyAddress = _rootColonyAddress;
  }
}
