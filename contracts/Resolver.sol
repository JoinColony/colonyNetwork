import "Colony.sol";
import "ColonyShareLedger.sol";
import "RootColony.sol";
import "TaskDB.sol";

contract Resolver {

  // Maps the function signature (4 bytes) to a pointer
  struct Pointer { address destination; uint outsize; }
  mapping (bytes4 => Pointer) public lookup;

  function Resolver() {
    ColonyShareLedger shareLedger = new ColonyShareLedger();
    lookup[bytes4(sha3("transfer(address,uint256)"))] = Pointer(address(shareLedger), 0);
    lookup[bytes4(sha3("generateShares(uint256)"))] = Pointer(address(shareLedger), 0);
    lookup[bytes4(sha3("setSharesSymbol(bytes4)"))] = Pointer(address(shareLedger), 0);
    lookup[bytes4(sha3("setSharesTitle(bytes32)"))] = Pointer(address(shareLedger), 0);

    TaskDB taskDb = new TaskDB();
    lookup[bytes4(sha3("makeTask(bytes32,bytes32)"))] = Pointer(address(taskDb), 32);
    lookup[bytes4(sha3("getTask(uint256)"))] = Pointer(address(taskDb), 1000);
  }
}
