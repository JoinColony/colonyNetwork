
import "AColonyFactory.sol";

contract RootColony is LocatorConsumer {

  address public colonyFactoryAddress;
  address public owner;
  uint coloniesNum;

  function RootColony(address _colonyFactory) {
    owner = msg.sender;
    locator = Locator(_locatorAddress);
  }

  function setColonyFactoryAddress(address _colonyFactoryAddress) {
    colonyFactoryAddress = _colonyFactoryAddress;
  }

  // Creates a colony
  function createColony(bytes32 _key, uint256 _initialSharesSupply) {
    if(_key == "") throw;
    var colonyFactory = AColonyFactory(colonyFactoryAddress);
    colonyFactoryAddress.createColony(msg.sender, _key, _initialSharesSupply);
    coloniesNum++;
  }

  function countColonies() constant returns (uint)
  {
    return coloniesNum;
  }

  function getColony(bytes32 _key) constant returns (address)
  {
    var colonyFactory = AColonyFactory(colonyFactoryAddress);
    return colonyFactory.colonies[_key];
  }
}
