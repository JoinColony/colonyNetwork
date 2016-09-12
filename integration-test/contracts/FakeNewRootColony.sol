import "IColonyFactory.sol";
import "Destructible.sol";
import "Modifiable.sol";
import "Ownable.sol";
import "EternalStorage.sol";
import "SecurityLibrary.sol";
import "ColonyLibrary.sol";


contract FakeNewRootColony is Destructible, Modifiable {

  IColonyFactory public colonyFactory;
  address public eternalStorageRoot;

  using ColonyLibrary for address;
  using SecurityLibrary for EternalStorage;

  /// @notice registers a eternal store contract using an address
  /// @param eternalStorage_ address used to locate the colony factory contract
  function registerEternalStorage(address eternalStorage_)
  onlyOwner
  {
    eternalStorageRoot = eternalStorage_;
  }

  function changeEternalStorageOwner(address newOnerAddress_)
  refundEtherSentByAccident
  throwIfAddressIsInvalid(newOnerAddress_)
  onlyOwner
  {
    Ownable(eternalStorageRoot).changeOwner(newOnerAddress_);
  }

  /// @notice registers a colony factory using an address
  /// @param _colonyFactoryAddress address used to locate the colony factory contract
  function registerColonyFactory(address _colonyFactoryAddress)
  refundEtherSentByAccident
  throwIfAddressIsInvalid(_colonyFactoryAddress)
  onlyOwner
  {
    colonyFactory = IColonyFactory(_colonyFactoryAddress);
  }

  /// @notice creates a Colony
  /// @param _key the key to be used to keep track of the Colony
  function createColony(bytes32 _key)
  refundEtherSentByAccident
  throwIfIsEmptyBytes32(_key)
  {
    // Initialise eternal storage and required initial values
    var eternalStorage = new EternalStorage();
    eternalStorage.addAdmin(msg.sender);
    // Note: we are assuming that the default values for 'TasksCount' and 'ReservedTokensWei' is returned as 0
    // Set the calling user as the first colony admin
    var colonyAddress = colonyFactory.createColony(_key, eternalStorage);
    Ownable(eternalStorage).changeOwner(colonyAddress);
    eternalStorageRoot.addColony(_key, colonyAddress);
  }

  /// @notice this function can be used to fetch the address of a Colony by a key.
  /// @param _key the key of the Colony created
  /// @return the address for the given key.
  function getColony(bytes32 _key)
  refundEtherSentByAccident
  throwIfIsEmptyBytes32(_key)
  constant returns (address)
  {
    return eternalStorageRoot.getColony(_key);
  }

  /// @notice this function can be used to fetch the address of a Colony by index.
  /// @param _idx the index of the Colony created
  /// @return the address for the given key.
  function getColonyAt(uint _idx)
  refundEtherSentByAccident
  constant returns (address)
  {
    return eternalStorageRoot.getColonyAt(_idx);
  }

  /// @notice this function can be used to get the index of a Colony by a key.
  /// @param _key the key of the Colony created
  /// @return the index for the given colony key.
  function getColonyIndex(bytes32 _key)
  refundEtherSentByAccident
  throwIfIsEmptyBytes32(_key)
  constant returns (uint256)
  {
    return eternalStorageRoot.getColonyIndex(_key);
  }

  function upgradeColony(bytes32 _key)
  refundEtherSentByAccident
  throwIfIsEmptyBytes32(_key)
  {
    address colonyAddress = this.getColony(_key);
    var upgradedColonyAddress = colonyFactory.upgradeColony(_key, colonyAddress);
    return eternalStorageRoot.upgradeColony(_key, upgradedColonyAddress);
  }

  /// @notice this function returns the amount of colonies created
  /// @return the amount of colonies created
  function countColonies()
  constant returns (uint256)
  {
    return eternalStorageRoot.coloniesCount();
  }
}
