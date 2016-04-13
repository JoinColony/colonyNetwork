
import 'IRootColonyResolver.sol';
contract RootColonyResolver is IRootColonyResolver {

  function RootColonyResolver()
  refundEtherSentByAccident
  {

  }

  /// @notice this function takes an address (Supposedly, the RootColony address)
  /// @param _rootColonyAddress the RootColony address
  function registerRootColony(address _rootColonyAddress)
  refundEtherSentByAccident
  onlyOwner
  {
    rootColonyAddress = _rootColonyAddress;
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
