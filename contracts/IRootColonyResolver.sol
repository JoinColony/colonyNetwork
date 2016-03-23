
import "Destructible.sol";
contract IRootColonyResolver is Destructible {

  address public rootColonyAddress;
  
  /// @notice this function takes an address (Supposedly, the RootColony address)
  /// @param _rootColonyAddress the RootColony address
  function registerRootColony(address _rootColonyAddress);
}
