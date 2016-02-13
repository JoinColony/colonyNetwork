
import "Owned.sol";
contract Mortal is Owned {
	function kill() onlyOwner {
		suicide(owner);
	}
}
