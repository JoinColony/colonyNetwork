import "Destructible.sol";


contract IColonyFactory is Destructible {
  address public rootColonyResolverAddress;

  /// @notice creates a Colony
  /// @param key the key to be used to keep track of the Colony
  function createColony(bytes32 key, address eternalStorage) returns(address);

  /// @notice this function registers the address of the RootColonyResolver
  /// @param rootColonyResolverAddress the default root colony resolver address
  function registerRootColonyResolver(address rootColonyResolverAddress);
}
