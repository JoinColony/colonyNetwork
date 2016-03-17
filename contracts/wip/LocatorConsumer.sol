
import "Locator.sol";
import "Ownable.sol";
contract LocatorConsumer is Ownable {

  Locator locator;
  function setLocator(address _locatorAddress)
    onlyOwner
  {
    locator = Locator(_locatorAddress);
  }

  function getLocatorAddress() constant returns (address) {
    return locator;
  }
}
