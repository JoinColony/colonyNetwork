/*
  IMPLEMENTING TOKEN STANDARD BASED ON: https://github.com/ConsenSys/Tokens
*/

import "ITokenLedger.sol";

contract ColonyTokenLedger is ITokenLedger {

  function ColonyTokenLedger()
  refundEtherSentByAccident
  {

  }

  /// @notice verifies if the sender has enough balance, otherwise, raises an error
  /// @param _from sender of value
  /// @param _value The amount of token wei to be transferred
    modifier hasEnoughBalance(address _from, uint256 _value)
    {
      if(_value == 0) throw;
      if(balances[_from] < _value) throw;
      if(balances[_from] + _value < balances[_from]) throw;
      _
    }

  /// @notice verifies if the address msg.sender has enough balance approved from `_from` address
  /// @param _from approver of the transference
  /// @param _value The amount of token wei to be transferred
  modifier hasEnoughAllowedBalance(address _from, uint256 _value)
  {
    if(_value == 0) throw;
    if(allowed[_from][msg.sender] < _value) throw;
    if(allowed[_from][msg.sender] + _value < allowed[_from][msg.sender]) throw;
    _
  }

  /// @notice set the ColonyTokenLedger symbol
  /// @param _symbol the symbol of the Colony Token
  function setTokensSymbol(bytes4 _symbol)
  onlyOwner
  refundEtherSentByAccident
  {
    symbol = _symbol;
  }

  /// @notice set the ColonyTokenLedger title
  /// @param _title the title of the Colony Token
  function setTokensTitle(bytes32 _title)
  onlyOwner
  refundEtherSentByAccident
  {
    title = _title;
  }

  /// @notice send `_value` token wei to `_to` from `msg.sender`
  /// @param _to The address of the recipient
  /// @param _value The amount of token wei to be transferred
  /// @return Whether the transfer was successful or not
  function transfer(address _to, uint256 _value)
  refundEtherSentByAccident
  returns (bool success)
  {
    //Check if sender has enough balance and the recipient balance doesn't wrap over max (2^256 - 1)
    if (balances[msg.sender] >= _value && balances[_to] + _value > balances[_to]) {
      balances[msg.sender] -= _value;
      balances[_to] += _value;
      Transfer(msg.sender, _to, _value);
      return true;
    }
    else {
      return false;
    }
  }

  /// @notice send `_value` token/s  wei to `_to` from `_from` on the condition it is approved by `_from`
  /// @param _from The address of the sender
  /// @param _to The address of the recipient
  /// @param _value The amount of token wei to be transferred
  function transferFrom(address _from, address _to, uint256 _value)
  refundEtherSentByAccident
  hasEnoughAllowedBalance(_from, _value)
  {
      balances[_from] -= _value;
      balances[_to] += _value;

      allowed[_from][msg.sender] -= _value;

      Transfer(_from, _to, _value);
  }

  /// @notice `msg.sender` approves `_spender` to spend `_value` tokens wei
  /// @param _spender The address of the account able to transfer the tokens wei
  /// @param _value The amount of wei to be approved for transfer
  function approve(address _spender, uint256 _value)
  refundEtherSentByAccident
  {
    if(_value > totalSupply) throw;

    allowed[msg.sender][_spender] = _value;
    Approval(msg.sender, _spender, _value);
  }

  /// @param _owner The address of the account owning tokens wei
  /// @param _spender The address of the account able to transfer the tokens wei
  /// @return Amount of remaining tokens wei allowed to spent
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

  /// @notice this function is used to increase the amount of tokens available limited by `totalSupply`
  /// and assign it to the contract owner.
  /// @param _amount The amount to be increased in the upper bound totalSupply in token wei
  function generateTokensWei(uint256 _amount)
  onlyOwner
  refundEtherSentByAccident
  {
      if(_amount == 0) throw;
      if (totalSupply + _amount < _amount) throw;

      totalSupply += _amount;
      balances[owner] += _amount;
  }

	function () {
			// This function gets executed if a
			// transaction with invalid data is sent to
			// the contract or just ether without data.
			// We revert the send so that no-one
			// accidentally loses money when using the
			// contract.
			throw;
	}
}
