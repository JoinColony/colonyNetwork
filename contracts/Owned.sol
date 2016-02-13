
contract Owned {
	modifier onlyOwner { if (msg.sender == owner) _ }
	address public owner = msg.sender;
}
