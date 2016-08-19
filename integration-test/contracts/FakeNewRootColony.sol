import "IColonyFactory.sol";
import "Destructible.sol";
import "Modifiable.sol";
import "EternalStorage.sol";
import "SecurityLibrary.sol";

contract FakeNewRootColony is Destructible, Modifiable {

  IColonyFactory public colonyFactory;
  using SecurityLibrary for EternalStorage;

  /// @notice registers a colony factory using an address
  /// @param _colonyFactoryAddress address used to locate the colony factory contract
  function registerColonyFactory(address _colonyFactoryAddress)
  refundEtherSentByAccident
  onlyOwner
  {
    colonyFactory = IColonyFactory(_colonyFactoryAddress);
  }

  function moveColonyFactoryStorage(address newColonyFactory)
  refundEtherSentByAccident
  onlyOwner
  {
    colonyFactory.changeEternalStorageOwner(newColonyFactory);
  }

  /// @notice creates a Colony
  /// @param key_ the key to be used to keep track of the Colony
  function createColony(bytes32 key_)
  refundEtherSentByAccident
  throwIfIsEmptyBytes32(key_)
  {
    // Initialise eternal storage and required initial values
    var eternalStorage = new EternalStorage();
    // Note: we are assuming that the default values for 'TasksCount' and 'ReservedTokensWei' is returned as 0
    // Set the calling user as the first colony admin
    eternalStorage.setBooleanValue(sha3('admin:', msg.sender), true);
    eternalStorage.setUIntValue(sha3("AdminsCount"), 1);
    eternalStorage.changeOwner(colonyFactory);

    colonyFactory.createColony(key_, eternalStorage);
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

  function getColonyIndex(bytes32 _key)
  refundEtherSentByAccident
  throwIfIsEmptyBytes32(_key)
  constant returns (uint256)
  {
    return colonyFactory.getColonyIndex(_key);
  }

  function upgradeColony(bytes32 _key)
  refundEtherSentByAccident
  throwIfIsEmptyBytes32(_key)
  {
    address colonyAddress = this.getColony(_key);
    return colonyFactory.upgradeColony(_key, colonyAddress);
  }

  /// @notice this function returns the amount of colonies created
  /// @return the amount of colonies created
  function countColonies()
  constant returns (uint256)
  {
    return colonyFactory.countColonies();
  }
}
