/*
  IMPLEMENTING TOKEN STANDARD BASED ON: https://github.com/ConsenSys/Tokens
*/
import "EternalStorage.sol";

library ColonyTokenLedger {

  // Manages records for colony tokens stored in the format:
  // sha3('balance:', address) -> uint256 tokenBalance , e.g. balance:0xd91cf6dac04d456edc5fcb6659dd8ddedbb26661 -> 340
  // sha3('allowance:', ownerAddress, spenderAddress) -> uint256 allowedAmount , e.g. allowed:0xd91cf6dac0..,0xdedbb26661 -> 20
  // sha3("TokenSymbol") -> bytes title e.g. 'CNY'
  // sha3("TokenTitle") -> bytes symbol e.g. 'Colony Token title'
  // sha3("TokensTotalSupply") -> uint256 totalSupplyTokens

  /// @notice set the ColonyTokenLedger symbol
  /// @param _symbol the symbol of the Colony Token
  function setTokensSymbol(address _storageContract, bytes _symbol)
  {
    EternalStorage(_storageContract).setBytesValue(sha3("TokenSymbol"), _symbol);
  }

  /// @notice set the ColonyTokenLedger title
  /// @param _title the title of the Colony Token
  function setTokensTitle(address _storageContract, bytes _title)
  {
    EternalStorage(_storageContract).setBytesValue(sha3("TokenTitle"), _title);
  }

  function totalSupply(address _storageContract)
  constant returns (uint256)
  {
    return EternalStorage(_storageContract).getUIntValue(sha3("TokensTotalSupply"));
  }

  /// @notice send `_value` token wei to `_to` from `msg.sender`
  /// @param _to The address of the recipient
  /// @param _value The amount of token wei to be transferred
  /// @return Whether the transfer was successful or not
  function transfer(address _storageContract, address _to, uint256 _value)
  returns (bool success)
  {
    var balanceSender = balanceOf(_storageContract, msg.sender);
    var balanceRecipient = balanceOf(_storageContract, _to);

    //Check if sender has enough balance and the recipient balance doesn't wrap over max (2^256 - 1)
    if (balanceSender >= _value && balanceRecipient + _value > balanceRecipient)
    {
      balanceSet(_storageContract, msg.sender, balanceSender - _value);
      balanceSet(_storageContract, _to, balanceRecipient + _value);

      return true;
    }
    else {
      return false;
    }
  }

  function transferFromColony(address _storageContract, address _to, uint256 _value)
  returns (bool success)
  {
    var balanceSender = balanceOf(_storageContract, this);
    var balanceRecipient = balanceOf(_storageContract, _to);

    //Check if sender has enough balance and the recipient balance doesn't wrap over max (2^256 - 1)
    if (balanceSender >= _value && balanceRecipient + _value > balanceRecipient)
    {
      balanceSet(_storageContract, this, balanceSender - _value);
      balanceSet(_storageContract, _to, balanceRecipient + _value);

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
  function transferFrom(address _storageContract, address _from, address _to, uint256 _value)
  returns (bool success)
  {
    var balanceSender = balanceOf(_storageContract, _from);
    var balanceRecipient = balanceOf(_storageContract, _to);
    var allowedValue = allowance(_storageContract, _from, msg.sender);

    //Check if sender has enough balance and the recipient balance doesn't wrap over max (2^256 - 1)
    if (balanceSender >= _value && allowedValue >= _value && (balanceRecipient + _value) > balanceRecipient)
    {
      balanceSet(_storageContract, _from, balanceSender - _value);
      balanceSet(_storageContract, _to, balanceRecipient + _value);
      allowanceSet(_storageContract, _from, msg.sender, allowedValue - _value);

      return true;
    }
    else {
      return false;
    }
  }

  /// @notice `msg.sender` approves `_spender` to spend `_value` tokens wei
  /// @param _spender The address of the account able to transfer the tokens wei
  /// @param _value The amount of wei to be approved for transfer
  function approve(address _storageContract, address _spender, uint256 _value)
  returns (bool success)
  {
    if(_value > totalSupply(_storageContract))
    return false;

    allowanceSet(_storageContract, msg.sender, _spender, _value);
    return true;
  }

  /// @param _owner The address of the account owning tokens wei
  /// @param _spender The address of the account able to transfer the tokens wei
  /// @return Amount of remaining tokens wei allowed to spent
  function allowance(address _storageContract, address _owner, address _spender)
  constant returns (uint256 remaining)
  {
    return EternalStorage(_storageContract).getUIntValue(sha3("allowance:", _owner, _spender));
  }

  function allowanceSet(address _storageContract, address _owner, address _spender, uint256 _amount)
  {
    EternalStorage(_storageContract).setUIntValue(sha3("allowance:", _owner, _spender), _amount);
  }

  /// @param _account The address from which the balance will be retrieved
  /// @return The balance
  function balanceOf(address _storageContract, address _account)
  constant returns (uint256 balance)
  {
    return EternalStorage(_storageContract).getUIntValue(sha3("balance:", _account));
  }

  function balanceSet(address _storageContract, address _account, uint256 _balance)
  {
    EternalStorage(_storageContract).setUIntValue(sha3("balance:", _account), _balance);
  }

  /// @notice this function is used to increase the amount of tokens available limited by `totalSupply`
  /// and assign it to the contract owner.
  /// @param _amount The amount to be increased in the upper bound totalSupply in token wei
  function generateTokensWei(address _storageContract, uint256 _amount)
  {
    if(_amount == 0) throw;

    var _totalSupply = totalSupply(_storageContract);
    if (_totalSupply + _amount < _amount) throw;
    _totalSupply+=_amount;

    var _colonyBalance = balanceOf(_storageContract, this);
    _colonyBalance+=_amount;

    balanceSet(_storageContract, this, _colonyBalance);
    EternalStorage(_storageContract).setUIntValue(sha3("TokensTotalSupply"), _totalSupply);
  }
}
