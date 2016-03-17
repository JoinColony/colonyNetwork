
import "AbstractRootColonyResolver.sol";
contract RootColonyResolver is AbstractRootColonyResolver {

  function setRootColonyAddress(address _rootColonyAddress) {
    rootColonyAddress = _rootColonyAddress;
  }

  function () {
    throw;
  }
}
