
import "Ownable.sol";
import "Modifiable.sol";
contract Destructible is Ownable, Modifiable {

  /// @notice check if the msg.sender is the owner and suicides the contract.
	function kill()
	onlyOwner
	{
		suicide(owner);
	}
}
