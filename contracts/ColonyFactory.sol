
import "IColonyFactory.sol";
import "Colony.sol";
import "IterableMapping.sol";

contract ColonyFactory is IColonyFactory {

  event ColonyCreated(bytes32 colonyKey, address colonyAddress, address colonyOwner, uint now);
  event ColonyDeleted(bytes32 colonyKey, address colonyOwner, uint now);
  event ColonyUpgraded(address colonyAddress, address colonyOwner, uint now);

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

  /// @notice creates a Colony
  function createColony(bytes32 key_, address shareLedger_, address taskdb_)
  {
    var colony = new Colony(rootColonyResolverAddress, shareLedger_, taskdb_);

    var shareLedgerAsOwnable = Ownable(shareLedger_);
    shareLedgerAsOwnable.changeOwner(colony);

    var taskDBAsOwnable = Ownable(taskdb_);
    taskDBAsOwnable.changeOwner(colony);

    IterableMapping.insert(colonies, key_, colony);
    ColonyCreated(key_, colony, tx.origin, now);
  }

  function removeColony(bytes32 key_)
  refundEtherSentByAccident
  {
    IterableMapping.remove(colonies, key_);
    ColonyDeleted(key_, tx.origin, now);
  }

  function getColony(bytes32 key_) constant returns(address)
  {
    return IterableMapping.iterate_get(colonies, key_);
  }

  function upgradeColony(bytes32 key_, address colonyTemplateAddress_)
  {
    var colonyAddress = IterableMapping.iterate_get(colonies, key_);
    // Get the current colony and its taskDb
    Colony colony = Colony(colonyAddress);
    IShareLedger shareLedger = colony.shareLedger();
    ITaskDB taskDb = colony.taskDB();

    //TODO: create a colony from the colonyTemplateAddress_
    // Create a new Colony and attach existing TaskDB and ShareLedger to it.
    Colony colonyNew = new Colony(rootColonyResolverAddress, shareLedger, taskDb);
    taskDb.changeOwner(colonyNew);

    // Kill old colony. This will transfer its Ether value to the upgraded colony.
    //colony.kill(colonyNew);

    // Switch the colonies entry for key_ with the new Colony
    IterableMapping.insert(colonies, key_, colonyNew);

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
