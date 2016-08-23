import "Destructible.sol";


contract IColonyFactory is Destructible {
  address public rootColonyResolverAddress;

  address public eternalStorageRoot;

  /// @notice creates a Colony
  /// @param key the key to be used to keep track of the Colony
  function createColony(bytes32 key, address eternalStorage);

  /// @notice get the address of a colony by key
  /// @param key the key of the colony
  /// @return returns the address of a colony by key
  function getColony(bytes32 key) constant returns(address);

  /// @notice get the address of a colony by key
  /// @return returns the address of a colony by key
  function getColonyAt(uint256 idx) constant returns(address);

  /// @notice get the index of a colony by key
  /// @return returns the colony index
  function getColonyIndex(bytes32 key) constant returns(uint256);

  /// @notice upgrade a colony by key and template address
  /// @param key the key of the colony to be upgraded
  /// @param colonyAddress the address of the colony to be upgraded
  function upgradeColony(bytes32 key, address colonyAddress);

  /// @notice this function registers the address of the RootColonyResolver
  /// @param rootColonyResolverAddress the default root colony resolver address
  function registerRootColonyResolver(address rootColonyResolverAddress);

  /// @notice registers the address of EternalStorage
  function registerEternalStorage(address eternalStorage);

  /// @notice this function moves ownership of EternalStorage to another factory contract
  /// @param newColonyFactory the new factory contract
  function changeEternalStorageOwner(address newColonyFactory);

  /// @notice this function returns the number of colonies in storage
  function countColonies() constant returns (uint256);
}
