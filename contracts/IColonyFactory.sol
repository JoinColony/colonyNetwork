
import "Destructible.sol";
contract IColonyFactory is Destructible {

  mapping(bytes32 => address) public colonies;

  /// @notice creates a Colony
  /// @param key_ the key to be used to keep track of the Colony
  /// @param owner_ the owner of the Colony
  /// @param initialSharesSupply_ the colony initial shares supply
  function createColony(
    bytes32 key_,
    address owner_,
    uint256 initialSharesSupply_
  );

  address public rootColonyResolverAddress;

  /// @notice this function registers the address of the RootColonyResolver
  /// @param rootColonyResolverAddress_ the default root colony resolver address
  function registerRootColonyResolver(address rootColonyResolverAddress_);
}
