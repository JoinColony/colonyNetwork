
import "Destructible.sol";
import "IterableMapping.sol";

contract IColonyFactory is Destructible {

  address public rootColonyResolverAddress;
  IterableMapping.itmap public colonies;

  /// @notice creates a Colony
  /// @param key_ the key to be used to keep track of the Colony
  /// @param shareLedger_ the address of the ColonyShareLedger to this Colony
  function createColony(bytes32 key_, address shareLedger_, address taskdb_);

  /// @notice removes a colony from the colonies mapping
  /// @param key_ the key of the colony to be removed
  function removeColony(bytes32 key_);

  /// @notice get the address of a colony by key
  /// @param key_ the key of the colony
  /// @return returns the address of a colony by key
  function getColony(bytes32 key_) constant returns(address);

  /// @notice upgrade a colony by key and template address
  /// @param key_ the key of the colony to be upgraded
  /// @param colonyTemplateAddress_ the address of the new colonyTemplateAddress_
  function upgradeColony(bytes32 key_, address colonyTemplateAddress_);

  /// @notice this function registers the address of the RootColonyResolver
  /// @param rootColonyResolverAddress_ the default root colony resolver address
  function registerRootColonyResolver(address rootColonyResolverAddress_);
}
