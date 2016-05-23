import "IColonyFactory.sol";
import "Destructible.sol";
import "Modifiable.sol";
import "ColonyTokenLedger.sol";
import "EternalStorage.sol";

contract FakeNewRootColony is Destructible, Modifiable {

  IColonyFactory public colonyFactory;
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
    var tokenLedger = new ColonyTokenLedger();
    tokenLedger.changeOwner(colonyFactory);

    var eternalStorage = new EternalStorage();
    eternalStorage.setUIntValue(sha3('TasksCount'), 0);
    eternalStorage.changeOwner(colonyFactory);

    colonyFactory.createColony(key_, tokenLedger, eternalStorage);
    coloniesNum++;
  }

  function removeColony(bytes32 key_)
  refundEtherSentByAccident
  throwIfIsEmptyBytes32(key_)
  {
    colonyFactory.removeColony(key_);
    coloniesNum --;
  }

  /// @notice this function can be used to fetch the address of a Colony by a key.
  /// @param _key the key of the Colony created
  /// @return the address for the given key.
  function getColony(bytes32 _key)
  refundEtherSentByAccident
  throwIfIsEmptyBytes32(_key)
  constant returns (address)
  {
    return colonyFactory.getColony(_key);
  }

  /// @notice this function can be used to fetch the address of a Colony by index.
  /// @param _idx the index of the Colony created
  /// @return the address for the given key.
  function getColonyAt(uint _idx)
  refundEtherSentByAccident
  constant returns (address)
  {
    return colonyFactory.getColonyAt(_idx);
  }

  function upgradeColony(bytes32 _key)
  refundEtherSentByAccident
  throwIfIsEmptyBytes32(_key)
  {
    return colonyFactory.upgradeColony(_key);
  }

  /// @notice this function returns the amount of colonies created
  /// @return the amount of colonies created
  function countColonies()
  constant returns (uint)
  {
    return coloniesNum;
  }
}
