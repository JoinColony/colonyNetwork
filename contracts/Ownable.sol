
contract Ownable {
	modifier onlyOwner {
		if (msg.sender != owner) throw;
		_ 
	}
	address public owner = msg.sender;
}
