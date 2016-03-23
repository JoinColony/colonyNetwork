
import "IColonyFactory.sol";
import "Colony.sol";
import "TaskDB.sol";

contract ColonyFactory is IColonyFactory {

  event ColonyCreated(address colonyAddress, address colonyOwner, uint now);

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
  /// @param key_ the key to be used to keep track of the Colony
  function createColony(bytes32 key_)
  refundEtherSentByAccident
  throwIfIsEmptyBytes32(key_)
  {
    if(colonies[key_] != 0x0) throw;

    TaskDB taskDB = new TaskDB();
    Colony colony = new Colony(rootColonyResolverAddress, taskDB);
    taskDB.changeOwner(colony);

    colonies[key_] = colony;
    ColonyCreated(colony, tx.origin, now);
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
