
import "AColonyFactory.sol";
import "Colony.sol";
import "ColonyShare.sol";
import "TasksDB.sol";

contract ColonyFactory is AColonyFactory {

  function ColonyFactory(address _rootColonyResolver) {
    rootColonyResolver = _rootColonyResolver;
  }

  function createColony(address _owner, bytes32 _key, uint256 _initialSharesSupply) {
    var ledger = new ColonyShare(_owner, _initialSharesSupply);
    var tasks = new TasksDB(_owner);
    var colony = new Colony(_owner, _rootColonyResolver, _ledger, _tasks);
    colonies[_key] = colony;
  }

  function (){
    throw;
  }
}
