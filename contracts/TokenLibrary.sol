pragma solidity ^0.4.0;

import "EternalStorage.sol";


library TokenLibrary {

  // Manages records for colony tokens stored in the format:
  // keccak256('balance:', address) -> uint256 tokenBalance , e.g. balance:0xd91cf6dac04d456edc5fcb6659dd8ddedbb26661 -> 340
  // keccak256('allowance:', ownerAddress, spenderAddress) -> uint256 allowedAmount , e.g. allowed:0xd91cf6dac0..,0xdedbb26661 -> 20
  // keccak256("TokenSymbol") -> bytes title e.g. 'CNY'
  // keccak256("TokenTitle") -> bytes symbol e.g. 'Colony Token title'
  // keccak256("TokensTotalSupply") -> uint256 totalSupplyTokens

  // keccak256("onhold:", address) -> uint256 tokens , e.g. onhold:0xd91cf6dac04d456edc5fcb6659dd8ddedbb26661 -> 340

  /// @notice set the Token symbol
  /// @param _symbol the symbol of the Colony Token
  function setTokensSymbol(address _storageContract, bytes _symbol) {
    EternalStorage(_storageContract).setBytesValue(keccak256("TokenSymbol"), _symbol);
  }

  /// @notice set the Token title
  /// @param _title the title of the Colony Token
  function setTokensTitle(address _storageContract, bytes _title) {
    EternalStorage(_storageContract).setBytesValue(keccak256("TokenTitle"), _title);
  }

  function totalSupply(address _storageContract)
  constant returns (uint256)
  {
    return EternalStorage(_storageContract).getUIntValue(keccak256("TokensTotalSupply"));
  }

  /// @notice send `_value` token wei to `_to` from `msg.sender`
  /// @param _to The address of the recipient
  /// @param _value The amount of token wei to be transferred
  /// @return Whether the transfer was successful or not
  function transfer(address _storageContract, address _to, uint256 _value, bool _isRecipientLocked)
  returns (bool success)
  {
    var balanceSender = balanceOf(_storageContract, msg.sender);
    var balanceRecipient = balanceOf(_storageContract, _to);

    if(_isRecipientLocked){
      var onHoldBalance = onHoldBalanceOf(_storageContract, _to);
      if (balanceSender < _value
        || onHoldBalance + _value <= onHoldBalance
        || balanceRecipient + _value + onHoldBalance <= balanceRecipient){
        return false;
      }
      else{
        balanceSet(_storageContract, msg.sender, balanceSender - _value);
        onHoldBalanceSet(_storageContract, _to, onHoldBalance + _value);
        return true;
      }
    }
    else{
      //Check if sender has enough balance and the recipient balance doesn't wrap over max (2^256 - 1)
      if (balanceSender < _value || balanceRecipient + _value <= balanceRecipient) {
        return false;
      }
      else{
        balanceSet(_storageContract, msg.sender, balanceSender - _value);
        balanceSet(_storageContract, _to, balanceRecipient + _value);
        return true;
      }
    }
  }

  function transferFromColony(address _storageContract, address _to, uint256 _value, bool _isRecipientLocked)
  returns (bool success) {
    var balanceSender = balanceOf(_storageContract, this);
    var balanceRecipient = balanceOf(_storageContract, _to);

    if(_isRecipientLocked){
      var onHoldBalance = onHoldBalanceOf(_storageContract, _to);
      if (balanceSender < _value
        || onHoldBalance + _value <= onHoldBalance
        || balanceRecipient + _value + onHoldBalance <= balanceRecipient) {
        return false;
      }
      else{
        balanceSet(_storageContract, this, balanceSender - _value);
        onHoldBalanceSet(_storageContract, _to, onHoldBalance + _value);
        return true;
      }
    }
    else{
      //Check if sender has enough balance and the recipient balance doesn't wrap over max (2^256 - 1)
      if (balanceSender < _value || balanceRecipient + _value <= balanceRecipient) {
        return false;
      }
      else{
        balanceSet(_storageContract, this, balanceSender - _value);
        balanceSet(_storageContract, _to, balanceRecipient + _value);
        return true;
      }
    }
  }

  /// @notice send `_value` token/s  wei to `_to` from `_from` on the condition it is approved by `_from`
  /// @param _from The address of the sender
  /// @param _to The address of the recipient
  /// @param _value The amount of token wei to be transferred
  function transferFrom(address _storageContract, address _from, address _to, uint256 _value, bool _isRecipientLocked)
  returns (bool success)
  {
    var balanceSender = balanceOf(_storageContract, _from);
    var balanceRecipient = balanceOf(_storageContract, _to);
    var allowedValue = allowance(_storageContract, _from, msg.sender);

    if(_isRecipientLocked){
      var onHoldBalance = onHoldBalanceOf(_storageContract, _to);
      if (balanceSender < _value
        || allowedValue < _value
        || onHoldBalance + _value <= onHoldBalance
        || balanceRecipient + _value + onHoldBalance <= balanceRecipient) {
        return false;
      }
      else{
        balanceSet(_storageContract, _from, balanceSender - _value);
        onHoldBalanceSet(_storageContract, _to, onHoldBalance + _value);
        allowanceSet(_storageContract, _from, msg.sender, allowedValue - _value);
        return true;
      }
    }
    else{
      //Check if sender has enough balance and the recipient balance doesn't wrap over max (2^256 - 1)
      if (balanceSender < _value
        || allowedValue < _value
        || balanceRecipient + _value <= balanceRecipient) {
        return false;
      }
      else{
        balanceSet(_storageContract, _from, balanceSender - _value);
        balanceSet(_storageContract, _to, balanceRecipient + _value);
        allowanceSet(_storageContract, _from, msg.sender, allowedValue - _value);
        return true;
      }
    }
  }

  /// @notice `msg.sender` approves `_spender` to spend `_value` tokens wei
  /// @param _spender The address of the account able to transfer the tokens wei
  /// @param _value The amount of wei to be approved for transfer
  function approve(address _storageContract, address _spender, uint256 _value)
  returns (bool success)
  {
    if(_value > totalSupply(_storageContract)) {
      return false;
    }

    allowanceSet(_storageContract, msg.sender, _spender, _value);
    return true;
  }

  /// @param _owner The address of the account owning tokens wei
  /// @param _spender The address of the account able to transfer the tokens wei
  /// @return Amount of remaining tokens wei allowed to spent
  function allowance(address _storageContract, address _owner, address _spender)
  constant returns (uint256 remaining)
  {
    return EternalStorage(_storageContract).getUIntValue(keccak256("allowance:", _owner, _spender));
  }

  function allowanceSet(address _storageContract, address _owner, address _spender, uint256 _amount) {
    EternalStorage(_storageContract).setUIntValue(keccak256("allowance:", _owner, _spender), _amount);
  }

  /// @param _account The address from which the balance will be retrieved
  /// @return The balance
  function balanceOf(address _storageContract, address _account)
  constant returns (uint256 balance)
  {
    return EternalStorage(_storageContract).getUIntValue(keccak256("balance:", _account));
  }

  function balanceSet(address _storageContract, address _account, uint256 _balance) {
    EternalStorage(_storageContract).setUIntValue(keccak256("balance:", _account), _balance);
  }

  function onHoldBalanceOf(address _storageContract, address _account)
  constant returns (uint256 balance)
  {
    return EternalStorage(_storageContract).getUIntValue(keccak256("onhold:", _account));
  }

  function onHoldBalanceSet(address _storageContract, address _account, uint256 _balance)
  {
    var onHoldBalance = EternalStorage(_storageContract).getUIntValue(keccak256("onhold:", _account));
    EternalStorage(_storageContract).setUIntValue(keccak256("onhold:", _account), onHoldBalance + _balance);
  }

  function releaseTokens(address _storageContract, address _account){
    var onHoldBalance = onHoldBalanceOf(_storageContract, _account);
    if (onHoldBalance > 0) {
      EternalStorage(_storageContract).setUIntValue(keccak256("onhold:", _account), 0);

      var balance = balanceOf(_storageContract, _account);
      EternalStorage(_storageContract).setUIntValue(keccak256("balance:", _account), balance + onHoldBalance);
    }
  }

  /// @notice this function is used to increase the amount of tokens available limited by `totalSupply`
  /// and assign it to the contract owner.
  /// @param _amount The amount to be increased in the upper bound totalSupply in token wei
  function generateTokensWei(address _storageContract, uint256 _amount) {
    if(_amount == 0) { throw; }

    var _totalSupply = totalSupply(_storageContract);
    if (_totalSupply + _amount < _amount) { throw; }
    _totalSupply += _amount;

    var _colonyBalance = balanceOf(_storageContract, this);
    _colonyBalance += _amount;

    balanceSet(_storageContract, this, _colonyBalance);
    EternalStorage(_storageContract).setUIntValue(keccak256("TokensTotalSupply"), _totalSupply);
  }
}
