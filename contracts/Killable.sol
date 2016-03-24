
import "Ownable.sol";
contract Killable is Ownable {
	function kill()
		onlyOwner
	{
		suicide(owner);
	}
}
