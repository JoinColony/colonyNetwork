import "Destructible.sol";

contract IColonyFactory is Destructible {

  address public rootColonyResolverAddress;
  address public eternalStorageRoot;

  /// @notice creates a Colony
  /// @param key_ the key to be used to keep track of the Colony
  function createColony(bytes32 key_, address eternalStorage_);

  /// @notice get the address of a colony by key
  /// @param key_ the key of the colony
  /// @return returns the address of a colony by key
  function getColony(bytes32 key_) constant returns(address);

  /// @notice get the address of a colony by key
  /// @return returns the address of a colony by key
  function getColonyAt(uint256 idx_) constant returns(address);

  /// @notice get the index of a colony by key
  /// @return returns the colony index
  function getColonyIndex(bytes32 key_) constant returns(uint256);

  /// @notice upgrade a colony by key and template address
  /// @param key_ the key of the colony to be upgraded
  /// @param colonyAddress_ the address of the colony to be upgraded
  function upgradeColony(bytes32 key_, address colonyAddress_);

  /// @notice this function registers the address of the RootColonyResolver
  /// @param rootColonyResolverAddress_ the default root colony resolver address
  function registerRootColonyResolver(address rootColonyResolverAddress_);

  /// @notice registers the address of EternalStorage
  function registerEternalStorage(address eternalStorage_);

  /// @notice this function moves ownership of EternalStorage to another factory contract
  /// @param newColonyFactory_ the new factory contract
  function changeEternalStorageOwner(address newColonyFactory_);

  /// @notice this function returns the number of colonies in storage
  function countColonies() constant returns (uint256);
}
