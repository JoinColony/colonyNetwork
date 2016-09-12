import "Destructible.sol";


contract IColonyFactory is Destructible {
  address public rootColonyResolverAddress;

  /// @notice creates a Colony
  /// @param key the key to be used to keep track of the Colony
  function createColony(bytes32 key, address eternalStorage) returns(address);

  /// @notice upgrade a colony by key and template address
  /// @param key the key of the colony to be upgraded
  /// @param colonyAddress the address of the colony to be upgraded
  function upgradeColony(bytes32 key, address colonyAddress) returns(address);

  /// @notice this function registers the address of the RootColonyResolver
  /// @param rootColonyResolverAddress the default root colony resolver address
  function registerRootColonyResolver(address rootColonyResolverAddress);
}
