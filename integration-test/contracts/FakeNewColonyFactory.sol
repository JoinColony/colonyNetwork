import "IColonyFactory.sol";
import "IUpgradable.sol";
import "IRootColonyResolver.sol";
import "FakeUpdatedColony.sol";
import "Ownable.sol";
import "ColonyLibrary.sol";

contract FakeNewColonyFactory is IColonyFactory {

  using ColonyLibrary for address;

  modifier onlyRootColony(){
    if(msg.sender != IRootColonyResolver(rootColonyResolverAddress).rootColonyAddress()) { throw; }
    _
  }

  /// @notice this function registers the address of the RootColonyResolver
  /// @param rootColonyResolverAddress_ the default root colony resolver address
  function registerRootColonyResolver(address rootColonyResolverAddress_)
  onlyOwner
  {
    rootColonyResolverAddress = rootColonyResolverAddress_;
  }

  function registerEternalStorage(address eternalStorage_)
  onlyOwner
  {
    eternalStorageRoot = eternalStorage_;
  }

  function changeEternalStorageOwner(address _newColonyFactory)
  onlyRootColony
  {
    Ownable(eternalStorageRoot).changeOwner(_newColonyFactory);
  }

  function createColony(bytes32 key_, address eternalStorage)
  onlyRootColony
  {
    var colony = new FakeUpdatedColony(rootColonyResolverAddress, eternalStorage);

    Ownable(eternalStorage).changeOwner(colony);
    eternalStorageRoot.addColony(key_, colony);
  }

  function getColony(bytes32 key_) constant returns(address)
  {
    return eternalStorageRoot.getColony(key_);
  }

  function getColonyAt(uint256 idx_) constant returns(address)
  {
    return eternalStorageRoot.getColonyAt(idx_);
  }

  function getColonyIndex(bytes32 key_) constant returns(uint256)
  {
    return eternalStorageRoot.getColonyIndex(key_);
  }

  function upgradeColony(bytes32 key_, address colonyAddress)
  onlyRootColony
  {
    eternalStorageRoot.getColony(key_);
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
