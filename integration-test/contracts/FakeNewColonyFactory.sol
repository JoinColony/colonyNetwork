
import "IColonyFactory.sol";
import "FakeUpdatedColony.sol";
import "ColonyShareLedger.sol";

contract FakeNewColonyFactory is IColonyFactory {

  event ColonyCreated(bytes32 colonyKey, address colonyAddress, address colonyOwner, uint now);
  event ColonyDeleted(bytes32 colonyKey, address colonyOwner, uint now);
  event ColonyUpgraded(address colonyAddress, address colonyOwner, uint now);

  struct ColonyRecord {
    uint index;
    bool _exists;
  }

  struct ColonyMapping {
    mapping(bytes32 => ColonyRecord) catalog;
    address [] data;
  }

  ColonyMapping colonies;

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
  function createColony(bytes32 key_, address taskDB_)
  {
    var colonyIndex = colonies.data.length++;
    var shareLedger = new ColonyShareLedger();
    var colony = new FakeUpdatedColony(rootColonyResolverAddress, shareLedger, taskDB_);

    Ownable(taskDB_).changeOwner(colony);
    Ownable(shareLedger).changeOwner(colony);

    colonies.catalog[key_] = ColonyRecord({index: colonyIndex, _exists: true});
    colonies.data[colonyIndex] = colony;

    ColonyCreated(key_, colony, tx.origin, now);
  }

  function removeColony(bytes32 key_)
  refundEtherSentByAccident
  {
    colonies.catalog[key_]._exists = false;
    ColonyDeleted(key_, tx.origin, now);
  }

  function getColony(bytes32 key_) constant returns(address)
  {
    var colonyIndex = colonies.catalog[key_].index;
    return colonies.data[colonyIndex];
  }

  function getColonyAt(uint256 idx_) constant returns(address)
  {
    return colonies.data[idx_];
  }

/*
  function upgradeColony(bytes32 key_)
  {
    var colonyIndex = colonies.catalog[key_].index;
    var colonyAddress = colonies.data[colonyIndex];

    FakeUpdatedColony colony = FakeUpdatedColony(colonyAddress);
    var shareLedger = colony.shareLedger();
    var taskDB = colony.taskDB();
    //TODO: create a colony from the colonyTemplateAddress_
    // Create a new FakeUpdateColony and attach existing TaskDB and ShareLedger to it.
    FakeUpdatedColony colonyNew = new FakeUpdatedColony(rootColonyResolverAddress, shareLedger, taskDB);
    // Get the current colony and its taskDb
    colony.upgrade(colonyNew);

    // Switch the colonies entry for key_ with the new Colony
    colonies.data[colonyIndex] = colonyNew;

    ColonyUpgraded(colonyNew, tx.origin, now);
  }*/

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
