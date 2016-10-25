pragma solidity ^0.4.0;

import "IColonyFactory.sol";
import "IRootColonyResolver.sol";
import "Colony.sol";


contract ColonyFactory is IColonyFactory {

  modifier onlyRootColony(){
    if(msg.sender != IRootColonyResolver(rootColonyResolverAddress).rootColonyAddress()) { throw; }
    _;
  }

  /// @notice this function registers the address of the RootColonyResolver
  /// @param rootColonyResolverAddress_ the default root colony resolver address
  function registerRootColonyResolver(address rootColonyResolverAddress_)
  onlyOwner
  {
    rootColonyResolverAddress = rootColonyResolverAddress_;
  }

  function createColony(address eternalStorage)
  onlyRootColony
  returns(address)
  {
    return new Colony(rootColonyResolverAddress, eternalStorage);
  }

  function () {
   // This function gets executed if a
   // transaction with invalid data is sent to
   // the contract or just ether without data.
   // We revert the send so that no-one
   // accidentally loses money when using the
   // contract.
   throw;
  }
}
