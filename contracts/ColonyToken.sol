/*
  IMPLEMENTING TOKEN STANDARD BASED ON: https://github.com/ConsenSys/Tokens
*/
import "AbstractToken.sol";
contract ColonyToken is AbstractToken{

  uint256 total_supply;
  string public name;
  string public symbol;

  mapping (address => uint256) balances;
  mapping (address => mapping (address => uint256)) allowed;

  function ColonyToken(uint256 _ownerAmount, uint256 _totalSupply,
    string _symbol, string _name)
  {

    if(_ownerAmount < 0) throw;
    if(_totalSupply < 0) throw;

    balances[owner] = _ownerAmount;
    total_supply = _totalSupply;
    name = _name;
    symbol = _symbol;
  }

  modifier hasEnoughBalance(address _from, uint256 _value)
  {
    if(_value <= 0) throw;
    if(balances[_from] < _value) throw;
    if(balances[_from] + _value < balances[_from]) throw;
    _
  }

  modifier hasEnoughAllowedBalance(address _from, address _to, uint256 _value)
  {
    if(_value <= 0) throw;
    if(allowed[_from][_to] < _value) throw;
    if(allowed[_from][_to] + _value < allowed[_from][_to]) throw;
    _
  }


  function transfer(address _to, uint256 _value)
    hasEnoughBalance(msg.sender, _value)
  {
      balances[msg.sender] -= _value;
      balances[_to] += _value;

      Transfer(msg.sender, _to, _value);
  }

  function transferFrom(address _from, address _to, uint256 _value)
    hasEnoughBalance(_from, _value)
    hasEnoughAllowedBalance(_from, _to, _value)
  {
      balances[_to] += _value;
      balances[_from] -= _value;
      allowed[_from][_to] -= _value;

      Transfer(_from, _to, _value);
  }

  function approve(address _spender, uint256 _value)
  {
      if(_value <= 0) throw;

      allowed[msg.sender][_spender] = _value;
      Approval(msg.sender, _spender, _value);
  }

  function allowance(address _owner, address _spender)
    constant returns (uint256 remaining)
  {
    return allowed[_owner][_spender];
  }

  function balanceOf(address _owner)
    constant returns (uint256 balance)
  {
    return balances[_owner];
  }

  function totalSupply()
    constant returns (uint256 _total)
  {
    return total_supply;
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
