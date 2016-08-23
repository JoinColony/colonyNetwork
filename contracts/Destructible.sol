import "Ownable.sol";


contract Destructible is Ownable {

  /// @notice check if the msg.sender is the owner and suicides the contract.
	function kill(address newContract)
	onlyOwner
	{
		selfdestruct(newContract);
	}
}
