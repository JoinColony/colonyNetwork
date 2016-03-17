
import "AbstractFactory.sol";
import "LocatorConsumer.sol";

contract RootColony is LocatorConsumer {

  bytes32 constant _COLONY_FACTORY_ = "COLONY_FACTORY";

  address public owner;
  uint coloniesNum;
  mapping (uint => bytes32) private colonies;

  function RootColony(address _locatorAddress) {
    owner = msg.sender;
    locator = Locator(_locatorAddress);
  }

  // Creates a colony
  function createColony(bytes32 _key){

    if(_key == "") throw;

    var factory = locator.resolve(_COLONY_FACTORY_);
    var colonyFactory = AbstractFactory(factory);
    colonyFactory.createColony(_key, msg.sender);
    colonies[coloniesNum] = _key;
    coloniesNum++;
  }

  function countColonies() constant returns (uint)
  {
    return coloniesNum;
  }

  function getColony(bytes32 _key) constant returns (address)
  {
    return locator.resolve(_key);
  }
}
