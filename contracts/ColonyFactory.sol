import "IColonyFactory.sol";
import "IUpgradable.sol";
import "IRootColonyResolver.sol";
import "Colony.sol";
import "Ownable.sol";
import "ColonyLibrary.sol";

contract ColonyFactory is IColonyFactory {

  event ColonyCreated(bytes32 colonyKey, address colonyAddress, address colonyOwner, uint now);
  event ColonyUpgraded(address colonyAddress, address colonyOwner, uint now);

  using ColonyLibrary for address;

  modifier onlyRootColony(){
    if(msg.sender != IRootColonyResolver(rootColonyResolverAddress).rootColonyAddress()) throw;
    _
  }

  function ColonyFactory()
  refundEtherSentByAccident
  {
  }

  /// @notice this function registers the address of the RootColonyResolver
  /// @param rootColonyResolverAddress_ the default root colony resolver address
  function registerRootColonyResolver(address rootColonyResolverAddress_)
  refundEtherSentByAccident
  onlyOwner
  {
    rootColonyResolverAddress = rootColonyResolverAddress_;
  }

  function registerEternalStorage(address eternalStorage_)
  refundEtherSentByAccident
  onlyOwner
  {
    eternalStorageRoot = eternalStorage_;
  }

  function changeEternalStorageOwner(address _newColonyFactory)
  refundEtherSentByAccident
  onlyRootColony
  {
    Ownable(eternalStorageRoot).changeOwner(_newColonyFactory);
  }

  function createColony(bytes32 key_, address tokenLedger_, address eternalStorage)
  throwIfIsEmptyBytes32(key_)
  throwIfAddressIsInvalid(tokenLedger_)
  onlyRootColony
  {
    var colony = new Colony(rootColonyResolverAddress, tokenLedger_, eternalStorage);

    Ownable(tokenLedger_).changeOwner(colony);
    Ownable(eternalStorage).changeOwner(colony);
    eternalStorageRoot.addColony(key_, colony);

    ColonyCreated(key_, colony, tx.origin, now);
  }

  function getColony(bytes32 key_) constant returns(address)
  {
    return eternalStorageRoot.getColony(key_);
  }

  function getColonyAt(uint256 idx_) constant returns(address)
  {
    return eternalStorageRoot.getColonyAt(idx_);
  }

  function upgradeColony(bytes32 key_)
  onlyRootColony
  {
    address colonyAddress = eternalStorageRoot.getColony(key_);
    if(!Colony(colonyAddress).isUserAdmin(tx.origin)) throw;

    address tokenLedger = Colony(colonyAddress).tokenLedger();
    address eternalStorage = Colony(colonyAddress).eternalStorage();

    Colony colonyNew = new Colony(rootColonyResolverAddress, tokenLedger, eternalStorage);
    IUpgradable(colonyAddress).upgrade(colonyNew);

    eternalStorageRoot.upgradeColony(key_, colonyNew);

    ColonyUpgraded(colonyNew, tx.origin, now);
  }

  function countColonies() constant returns (uint256)
  {
    return eternalStorageRoot.coloniesCount();
  }

  function () {
    // This function gets executed if a
    // transaction with invalid data is sent to
    // the contract or just ether without data.
    // We revert the send so that no-one
    // accidentally loses money when using the
    // contract.
    throw;
  }
}
