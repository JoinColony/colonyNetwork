
import "UpdatedColony.sol";
import "AbstractFactory.sol";
import "LocatorConsumer.sol";
import "Upgradable.sol";

contract NewColonyFactory is AbstractFactory, LocatorConsumer, Upgradable {

  function NewColonyFactory(address _locatorAddress)
  {
    locator = Locator(_locatorAddress);
    _KEY_ = "COLONY_FACTORY";
  }

  ///@notice creates a new colony
  ///@param _key used to retrieve colony address later
  function createColony(bytes32 _key, address _colonyOwner) {
    var colony = new UpdatedColony();
    colony.setArg(111);
    locator.update(_key, colony, _colonyOwner, 0, 0, 1);
  }
}
