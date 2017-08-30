pragma solidity ^0.4.8;

import "./TokenLibrary.sol";
import "./TaskLibrary.sol";
import "./SecurityLibrary.sol";
import "./EternalStorage.sol";


contract Colony {

  modifier onlyAdminOrOwner {
    if (!(this.userIsInRole(msg.sender, 0) || this.userIsInRole(msg.sender, 1))) { throw; }
    _;
  }

  modifier onlyOwner {
    if (!this.userIsInRole(msg.sender, 0)) { throw; }
    _;
  }

  /// @notice throw if an address is invalid
  /// @param _target the address to check
  modifier throwIfAddressIsInvalid(address _target) {
    if(_target == 0x0) { throw; }
    _;
  }

  /// @notice throw if the id is invalid
  /// @param _id the ID to validate
  modifier throwIfIsEmptyString(string _id) {
    if(bytes(_id).length == 0) { throw; }
    _;
  }

  /// @notice throw if the id is invalid
  /// @param _id the ID to validate
  modifier throwIfIsEmptyBytes32(bytes32 _id) {
    if(_id == "") { throw; }
    _;
  }

  // Link libraries containing business logic to EternalStorage
  using TaskLibrary for address;
  using SecurityLibrary for address;
  using TokenLibrary for address;
  address public eternalStorage;
  // This property, exactly as defined, is used in build scripts. Take care when updating.
  // Version number should be upped with every change in Colony or its dependency contracts or libraries.
  uint256 public version = 4;
  bytes32 public name;

  function Colony(bytes32 _name)
  payable
  {
    name = _name;
    eternalStorage = new EternalStorage();
  }

  /// @notice returns the number of users in a given role for this colony
  function countUsersInRole(uint _role)
  constant returns(uint256)
  {
    return eternalStorage.countUsersInRole(_role);
  }

  /// @notice returns user info based in a given address
  /// @param _user the address to be verified
  /// @param _role the role to be verified
  /// @return a boolean value indicating if the user is in this role or not
  function userIsInRole(address _user, uint _role)
  constant returns (bool)
  {
    return eternalStorage.userIsInRole(_user, _role);
  }

  /// @notice adds a new user to a given role in this colony
  /// @param _user the address of the user
  /// @param _role the user role
  function addUserToRole(address _user, uint _role)
  onlyAdminOrOwner
  {
    eternalStorage.addUserToRole(_user, _role);
  }

  /// @notice removes an admin from the colony
  /// @param _user the address of the owner to be removed
  /// @param _role the role of the user to be removed
  function removeUserFromRole(address _user, uint _role)
  onlyAdminOrOwner
  {
    eternalStorage.removeUserFromRole(_user, _role);
  }

  /// @notice gets the reserved colony tokens for funding tasks
  /// This is to understand the amount of 'unavailable' tokens due to them been promised to be paid once a task completes.
  /// @return a uint value indicating if the amount of reserved colony tokens
  function reservedTokensWei()
  constant returns (uint256)
  {
    return eternalStorage.getReservedTokensWei();
  }

  /// @notice contribute ETH to a task
  /// @param taskId the task ID
  function contributeEthToTask(uint256 taskId)
  onlyAdminOrOwner
  payable
  {
    eternalStorage.contributeEthToTask(taskId, msg.value);
  }

  /// @notice contribute tokens from an admin to fund a task
  /// @param taskId the task ID
  /// @param tokensWei the amount of tokens wei to fund the task
  function contributeTokensWeiToTask(uint256 taskId, uint256 tokensWei)
  onlyAdminOrOwner
  {
    // When a user funds a task, the actually is a transfer of tokens ocurring from their address to the colony's one.
    if (eternalStorage.transfer(this, tokensWei)) {
      eternalStorage.contributeTokensWeiToTask(taskId, tokensWei);
    } else {
      throw;
    }
  }

  /// @notice contribute tokens from the colony pool to fund a task
  /// @param taskId the task ID
  /// @param tokensWei the amount of tokens wei to fund the task
  function setReservedTokensWeiForTask(uint256 taskId, uint256 tokensWei)
  onlyAdminOrOwner
  {
    // When tasks are funded from the pool of unassigned tokens,
    // no transfer takes place - we just mark them as assigned.
    var reservedTokensWei = eternalStorage.getReservedTokensWei();
    var tokenBalanceWei = eternalStorage.balanceOf(this);
    var availableTokensWei = tokenBalanceWei - reservedTokensWei;
    var taskReservedTokensWei = eternalStorage.getReservedTokensWeiForTask(taskId);
    if (tokensWei <= (taskReservedTokensWei + availableTokensWei)) {
      eternalStorage.setReservedTokensWeiForTask(taskId, tokensWei);
    } else {
      throw;
    }
  }

  /// @notice allows refunding of reserved tokens back into the colony pool for closed tasks
  /// @param taskId the task ID
  function removeReservedTokensWeiForTask(uint256 taskId)
  onlyAdminOrOwner
  {
    return eternalStorage.removeReservedTokensWeiForTask(taskId);
  }

  function getTaskCount()
  constant returns (uint256)
  {
    return eternalStorage.getTaskCount();
  }

  /// @notice this function adds a task to the task DB.
  /// @param _name the task name
  /// @param _summary an IPFS hash
  function makeTask(
    string _name,
    string _summary
  )
  onlyAdminOrOwner
  throwIfIsEmptyString(_name)
  {
      eternalStorage.makeTask(_name, _summary);
  }

  /// @notice this function updates the 'accepted' flag in the task
  /// @param _id the task id
  function acceptTask(uint256 _id)
  onlyAdminOrOwner
  {
    eternalStorage.acceptTask(_id);
  }

  /// @notice this function is used to update task title.
  /// @param _id the task id
  /// @param _name the task name
  function updateTaskTitle(uint256 _id, string _name)
  onlyAdminOrOwner
  throwIfIsEmptyString(_name)
  {
    eternalStorage.updateTaskTitle(_id, _name);
  }

  /// @notice this function is used to update task summary.
  /// @param _id the task id
  /// @param _summary an IPFS hash
  function updateTaskSummary(uint256 _id, string _summary)
  onlyAdminOrOwner
  throwIfIsEmptyString(_summary)
  {
    eternalStorage.updateTaskSummary(_id, _summary);
  }

  /// @notice set the colony tokens symbol
  /// @param symbol_ the symbol of the colony tokens
  function setTokensSymbol(bytes symbol_)
  onlyAdminOrOwner
  {
    eternalStorage.setTokensSymbol(symbol_);
  }

  /// @notice set the colony tokens title
  /// @param title_ the title of the colony tokens
  function setTokensTitle(bytes title_)
  onlyAdminOrOwner
  {
    eternalStorage.setTokensTitle(title_);
  }

  /// @notice mark a task as completed, pay the user who completed it and root colony fee
  /// @param taskId the task ID to be completed and paid
  /// @param paymentAddress the address of the user to be paid
  function completeAndPayTask(uint256 taskId, address paymentAddress)
  onlyAdminOrOwner
  {
    var (taskEth, taskTokens) = eternalStorage.getTaskBalance(taskId);

    // Check token balance is sufficient to pay the worker
    if (eternalStorage.balanceOf(this) < taskTokens) { return; }

    eternalStorage.acceptTask(taskId);

    if (taskEth > 0) {
      if (!paymentAddress.send(taskEth)) {
        throw;
      }
    }

    if (taskTokens > 0) {
      if (eternalStorage.transferFromColony(paymentAddress, taskTokens)) {
        eternalStorage.removeReservedTokensWeiForTask(taskId);
      } else {
        throw;
      }
    }
  }

  function transfer(address _to, uint256 _value)
  returns (bool success)
  {
    return eternalStorage.transfer(_to, _value);
  }

   function transferFrom(address _from, address _to, uint256 _value)
   returns (bool success)
   {
     return eternalStorage.transferFrom(_from, _to, _value);
   }

   function balanceOf(address _account)
   constant returns (uint256 balance)
   {
     return eternalStorage.balanceOf(_account);
   }

   function allowance(address _owner, address _spender)
   constant returns (uint256)
   {
     return eternalStorage.allowance(_owner, _spender);
   }

   function approve(address _spender, uint256 _value)
   returns (bool success)
   {
     return eternalStorage.approve(_spender, _value);
   }

  /// @notice this function is used to generate Colony tokens
  /// @param _tokensWei The amount of tokens wei to be generated
  function generateTokensWei(uint256 _tokensWei)
  onlyOwner
  {
    eternalStorage.generateTokensWei(_tokensWei);
  }

  function totalSupply()
  onlyAdminOrOwner
  constant returns (uint256)
  {
    return eternalStorage.totalSupply();
  }

  /// @notice upgrade the colony migrating its data to another colony instance
  /// @param newColonyAddress_ the address of the new colony instance
  function upgrade(address newColonyAddress_) {
    var tokensBalance = eternalStorage.balanceOf(this);
    if(tokensBalance > 0 && !eternalStorage.transferFromColony(newColonyAddress_, tokensBalance)) {
      throw;
    }

    selfdestruct(newColonyAddress_);
  }

  function ()
  payable
  {
      // Contracts that want to receive Ether with a plain "send" have to implement
      // a fallback function with the payable modifier. Contracts now throw if no payable
      // fallback function is defined and no function matches the signature.
  }
}
