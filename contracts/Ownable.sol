
contract Ownable {

  event OwnerChanged(address indexed _previousOwner, address indexed _newOwner, uint _now);
  address public owner = tx.origin;

  /// @notice check if the msg.sender is the owner of the contract
	modifier onlyOwner {
		if (tx.origin != owner) throw;
		_
	}

  /// @notice redefine the owner of the contract.
  /// @param _newOwner the address of the new owner of the contract.
  function changeOwner(address _newOwner)
  onlyOwner
  {
    if(_newOwner == 0x0) throw;

    OwnerChanged(owner, _newOwner, now);
    owner = _newOwner;
  }
}
