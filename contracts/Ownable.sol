
contract Ownable {
	modifier onlyOwner {
		if (tx.origin != owner) throw;
		_
	}
	address public owner = tx.origin;
}
