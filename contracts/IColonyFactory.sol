
import "Destructible.sol";
import "Modifiable.sol";

contract IColonyFactory is Destructible, Modifiable {

  address public rootColonyResolverAddress;

  /// @notice creates a Colony
  /// @param key_ the key to be used to keep track of the Colony
  function createColony(bytes32 key_, address tokenLedger_, address taskdb_);

  /// @notice removes a colony from the colonies mapping
  /// @param key_ the key of the colony to be removed
  function removeColony(bytes32 key_);

  /// @notice get the address of a colony by key
  /// @param key_ the key of the colony
  /// @return returns the address of a colony by key
  function getColony(bytes32 key_) constant returns(address);

  /// @notice get the address of a colony by key
  /// @return returns the address of a colony by key
  function getColonyAt(uint256 idx_) constant returns(address);

  /// @notice upgrade a colony by key and template address
  /// @param key_ the key of the colony to be upgraded
  function upgradeColony(bytes32 key_);

  /// @notice this function registers the address of the RootColonyResolver
  /// @param rootColonyResolverAddress_ the default root colony resolver address
  function registerRootColonyResolver(address rootColonyResolverAddress_);
}
