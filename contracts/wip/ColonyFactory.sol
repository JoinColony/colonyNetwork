
import "Colony.sol";
import "AbstractFactory.sol";
import "LocatorConsumer.sol";
import "Upgradable.sol";

contract ColonyFactory is AbstractFactory, LocatorConsumer, Upgradable {

  function ColonyFactory(address _locatorAddress)
  {
    locator = Locator(_locatorAddress);
    _KEY_ = "COLONY_FACTORY";
    locator.update(_KEY_, this, msg.sender, 0, 0, 1);
    locator.use(_KEY_);
  }

  ///@notice creates a new colony
  ///@param _key used to retrieve colony address later
  function createColony(bytes32 _key, address _colonyOwner) {
    var colony = new Colony();
    colony.setArg(555);
    locator.update(_key, colony, _colonyOwner, 0, 0, 1);
  }
}
