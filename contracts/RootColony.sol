
import "IColonyFactory.sol";
import "Destructible.sol";

contract RootColony is Destructible {

  IColonyFactory colonyFactory;
  uint coloniesNum;

  /// @notice registers a colony factory using an address
  /// @param _colonyFactoryAddress address used to locate the colony factory contract
  function registerColonyFactory(address _colonyFactoryAddress)
  refundEtherSentByAccident
  onlyOwner
  {
    colonyFactory = IColonyFactory(_colonyFactoryAddress);
  }

  /// @notice creates a Colony
  /// @param key_ the key to be used to keep track of the Colony
  function createColony(bytes32 key_)
  refundEtherSentByAccident
  throwIfIsEmptyBytes32(key_)
  {
    colonyFactory.createColony(key_);
    coloniesNum++;
  }

  /// @notice this function returns the amount of colonies created
  /// @return the amount of colonies created
  function countColonies()
  refundEtherSentByAccident
  constant returns (uint)
  {
    return coloniesNum;
  }

  /// @notice this function can be used to fetch the address of a Colony by a key.
  /// @param _key the key of the Colony created
  /// @return the address for the given key.
  function getColony(bytes32 _key)
  refundEtherSentByAccident
  throwIfIsEmptyBytes32(_key)
  constant returns (address)
  {
    return colonyFactory.colonies(_key);
  }
}
