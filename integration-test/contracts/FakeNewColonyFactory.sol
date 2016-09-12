import "IColonyFactory.sol";
import "IUpgradable.sol";
import "IRootColonyResolver.sol";
import "FakeUpdatedColony.sol";
import "Ownable.sol";
import "ColonyLibrary.sol";


contract FakeNewColonyFactory is IColonyFactory {

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

  function createColony(bytes32 key_, address eternalStorage)
  onlyRootColony
  returns(address)
  {
    return new FakeUpdatedColony(rootColonyResolverAddress, eternalStorage);
  }

  function upgradeColony(bytes32 key_, address colonyAddress)
  onlyRootColony
  returns(address)
  {
    if(!FakeUpdatedColony(colonyAddress).isUserAdmin(tx.origin)) {
      throw;
    }

    var colonyNew = new FakeUpdatedColony(rootColonyResolverAddress, FakeUpdatedColony(colonyAddress).eternalStorage());
    IUpgradable(colonyAddress).upgrade(colonyNew);
    return colonyNew;
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
