/*
  IMPLEMENTING TOKEN STANDARD BASED ON: https://github.com/ConsenSys/Tokens
*/

import "AbstractShare.sol";
contract ColonyShare is AbstractShare {

  /// @notice if the owner initial supply is bigger than the total supply than it raises an error
  function ColonyShare(uint256 _totalSupply, string _symbol, string _name)
    refundEtherSentByAccident
  {
    balances[owner] = _totalSupply;
    total_supply = _totalSupply;
    name = _name;
    symbol = _symbol;
  }

  /// @notice verifies if the sender has enough balance, otherwise, raises an error
  /// @param _from sender of value
  /// @param _value The amount of token to be transferred
  modifier hasEnoughBalance(address _from, uint256 _value)
  {
    if(_value == 0) throw;
    if(balances[_from] < _value) throw;
    if(balances[_from] + _value < balances[_from]) throw;
    _
  }

  /// @notice raise an error if user sends ether by accident
  modifier refundEtherSentByAccident()
  {
      if(msg.value > 0) throw;
      _
  }

  /// @notice verifies if the address `_to` has enough balance approved from `_from` address
  /// @param _from approver of the transference
  /// @param _value The amount of token to be transferred
  modifier hasEnoughAllowedBalance(address _from, uint256 _value)
  {
    if(_value == 0) throw;
    if(allowed[_from][msg.sender] < _value) throw;
    if(allowed[_from][msg.sender] + _value < allowed[_from][msg.sender]) throw;
    _
  }

  /// @notice send `_value` token to `_to` from `msg.sender`
  /// @param _to The address of the recipient
  /// @param _value The amount of token to be transferred
  /// @return Whether the transfer was successful or not
  function transfer(address _to, uint256 _value)
    refundEtherSentByAccident
    hasEnoughBalance(msg.sender, _value)
  {
      balances[msg.sender] -= _value;
      balances[_to] += _value;

      Transfer(msg.sender, _to, _value);
  }

  /// @notice send `_value` token/s to `_to` from `_from` on the condition it is approved by `_from`
  /// @param _from The address of the sender
  /// @param _to The address of the recipient
  /// @param _value The amount of token to be transferred
  /// @return Whether the transfer was successful or not
  function transferFrom(address _from, address _to, uint256 _value)
    refundEtherSentByAccident
    hasEnoughBalance(_from, _value)
    hasEnoughAllowedBalance(_from, _value)
  {
      balances[_from] -= _value;
      balances[_to] += _value;

      allowed[_from][msg.sender] -= _value;

      Transfer(_from, _to, _value);
  }

  /// @notice `msg.sender` approves `_spender` to spend `_value` tokens
  /// @param _spender The address of the account able to transfer the tokens
  /// @param _value The amount of wei to be approved for transfer
  /// @return Whether the approval was successful or not
  function approve(address _spender, uint256 _value)
    refundEtherSentByAccident
  {
    if(_value > total_supply) throw;

    allowed[msg.sender][_spender] = _value;
    Approval(msg.sender, _spender, _value);
  }

  /// @param _owner The address of the account owning tokens
  /// @param _spender The address of the account able to transfer the tokens
  /// @return Amount of remaining tokens allowed to spent
  function allowance(address _owner, address _spender)
    refundEtherSentByAccident
    constant returns (uint256 remaining)
  {
    return allowed[_owner][_spender];
  }

  /// @param _owner The address from which the balance will be retrieved
  /// @return The balance
  function balanceOf(address _owner)
    refundEtherSentByAccident
    constant returns (uint256 balance)
  {
    return balances[_owner];
  }

  /// @notice this function is used to increase the amount of shares available limited by `total_supply`
  /// and assign it to the contract owner.
  /// @param _amount The amount to be increased in the upper bound total_supply
  function generateShares(uint256 _amount)
    onlyOwner
    refundEtherSentByAccident
  {
      if(_amount == 0) throw;
      if (total_supply + _amount < _amount) throw;

      total_supply += _amount;
      balances[owner] += _amount;
  }

  /// @return total amount of tokens
  function totalSupply()
    refundEtherSentByAccident
    constant returns (uint256 _total)
  {
    return total_supply;
  }

	function () {
			throw;
	}
}
