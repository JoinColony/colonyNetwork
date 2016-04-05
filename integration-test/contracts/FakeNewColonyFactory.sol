
import "IColonyFactory.sol";
import "FakeUpdatedColony.sol";
//import "TaskDB.sol";
import "ColonyShareLedger.sol";

contract FakeNewColonyFactory is IColonyFactory {

  event ColonyCreated(address colonyAddress, address colonyOwner, uint now);
  event ColonyDeleted(bytes32 colonyKey, address colonyOwner, uint now);
  event ColonyUpgraded(address colonyAddress, address colonyOwner, uint now);

  function FakeNewColonyFactory()
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

  /// @notice creates a Colony
  /// @param key_ the key to be used to keep track of the Colony
  function createColony(bytes32 key_, address taskdb)
  refundEtherSentByAccident
  throwIfIsEmptyBytes32(key_)
  {
    if(colonies[key_] != 0x0) throw;

    var shareLedger = new ColonyShareLedger();
    FakeUpdatedColony colony = new FakeUpdatedColony(rootColonyResolverAddress, shareLedger, taskdb);

    shareLedger.changeOwner(colony);
    var taskDBAsOwnable = Ownable(taskdb);
    taskDBAsOwnable.changeOwner(colony);

    colonies[key_] = colony;
    ColonyCreated(colony, tx.origin, now);
  }

  function removeColony(bytes32 key_)
  refundEtherSentByAccident
  throwIfIsEmptyBytes32(key_)
  {
    delete colonies[key_];
    ColonyDeleted(key_, tx.origin, now);
  }

  function getColony(bytes32 key_) constant returns(address)
  {
    return colonies[key_];
  }

  function upgradeColony(bytes32 key_, address colonyTemplateAddress_)
  {
    address colonyAddress = colonies[key_];
    // Get the current colony and its taskDb
    FakeUpdatedColony colony = FakeUpdatedColony(colonyAddress);
    ITaskDB taskDb = colony.taskDB();
    IShareLedger shareLedger = colony.shareLedger();

    //TODO: create a colony from the colonyTemplateAddress_
    // Create a new Colony and attach existing TaskDB and ShareLedger to it.
    FakeUpdatedColony colonyNew = new FakeUpdatedColony(rootColonyResolverAddress, shareLedger, taskDb);
    taskDb.changeOwner(colonyNew);

    // Kill old colony. This will transfer its Ether value to the upgraded colony.
    //colony.kill(colonyNew);

    // Switch the colonies entry for key_ with the new Colony
    colonies[key_] = colonyNew;

    ColonyUpgraded(colonyNew, tx.origin, now);
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
