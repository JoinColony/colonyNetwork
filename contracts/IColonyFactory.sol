
import "Destructible.sol";
contract IColonyFactory is Destructible {

  mapping(bytes32 => address) public colonies;

  /// @notice creates a Colony
  /// @param key_ the key to be used to keep track of the Colony
  function createColony(bytes32 key_, address taskdb);

  function removeColony(bytes32 key_);

  function getColony(bytes32 key_) constant returns(address);

  function upgradeColony(bytes32 colonyKey_, address colonyTemplateAddress_);

  address public rootColonyResolverAddress;

  /// @notice this function registers the address of the RootColonyResolver
  /// @param rootColonyResolverAddress_ the default root colony resolver address
  function registerRootColonyResolver(address rootColonyResolverAddress_);
}
