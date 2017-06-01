pragma solidity ^0.4.8;

import "./Destructible.sol";


contract IColonyFactory is Destructible {
  address public rootColonyResolverAddress;

  /// @notice creates a Colony
  /// @param eternalStorage the eternalStorage used by the contract
  function createColony(address eternalStorage) returns(address);

  /// @notice this function registers the address of the RootColonyResolver
  /// @param rootColonyResolverAddress the default root colony resolver address
  function registerRootColonyResolver(address rootColonyResolverAddress);
}
