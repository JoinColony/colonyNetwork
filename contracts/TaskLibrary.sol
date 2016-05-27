import "EternalStorage.sol";

library TaskLibrary {
  event TaskAdded(bytes32 key, uint256 count, uint256 when);
  event TaskUpdated(bytes32 key, uint256 when);

	modifier ifTasksExists(address _storageContract, uint256 _id) {
    if(!hasTask(_storageContract, _id)) throw;
	    _
	}

	modifier ifTasksNotAccepted(address _storageContract, uint256 _id) {
		if(isTaskAccepted(_storageContract, _id)) throw;
			_
	}

	/// @notice this function returns the number of tasks in the DB
	/// @return the number of tasks in DB
	function getTaskCount(address _storageContract) constant returns(uint256) {
		return EternalStorage(_storageContract).getUIntValue(sha3("TasksCount"));
	}

  /// @notice gets the reserved colony tokens for funding tasks.
  /// This is to understand the amount of 'unavailable' tokens due to them been promised to be paid once a task completes.
  function getReservedTokensWei(address _storageContract) constant returns(uint256)
  {
    return EternalStorage(_storageContract).getUIntValue(sha3("ReservedTokensWei"));
  }

  /// @notice gets the reserved colony tokens for funding tasks.
  /// @param tokensWei the token wei to set the value to.
  /// This is to understand the amount of 'unavailable' tokens due to them been promised to be paid once a task completes.
  function setReservedTokensWei(address _storageContract, uint256 tokensWei)
  {
    EternalStorage(_storageContract).setUIntValue(sha3("ReservedTokensWei"), tokensWei);
  }

  /// @notice this function adds a task to the task DB. Any ETH sent will be
  /// considered as a contribution to the task
  /// @param _name the task name
  /// @param _summary an IPFS hash
  function makeTask(
    address _storageContract,
    string _name,
    string _summary
  )
  {
    var idx = getTaskCount(_storageContract);
    //Short name for task
    EternalStorage(_storageContract).setStringValue(sha3("task_name", idx), _name);
    //IPFS hash of the brief
    EternalStorage(_storageContract).setStringValue(sha3("task_summary", idx), _summary);
    //Whether the work has been accepted
    EternalStorage(_storageContract).setBooleanValue(sha3("task_accepted", idx), false);
    //Amount of ETH contributed to the task
    EternalStorage(_storageContract).setUIntValue(sha3("task_eth", idx), 0);
    //Amount of tokens wei contributed to the task
    EternalStorage(_storageContract).setUIntValue(sha3("task_tokensWei", idx), 0);
    //Total number of tasks
    EternalStorage(_storageContract).setUIntValue(sha3("TasksCount"), idx + 1);

    TaskAdded(sha3("task_name", idx), getTaskCount(_storageContract), now);
  }

  /// @notice this task is useful when we need to know if a task exists
  /// @param _id the task id
  /// @return true - if the task if is valid, false - if the task id is invalid.
  function hasTask(address _storageContract, uint256 _id) constant returns(bool) {
    return (_id < getTaskCount(_storageContract));
  }

  /// @notice this function returns if a task was accepted
  /// @param _id the task id
  /// @return a flag indicating if the task was accepted or not
  function isTaskAccepted(
    address _storageContract,
    uint256 _id)
  ifTasksExists(_storageContract, _id)
  constant
  returns(bool)
  {
    return EternalStorage(_storageContract).getBooleanValue(sha3("task_accepted", _id));
  }

  /// @notice this function returns if a task was accepted
  /// @param _id the task id
  /// @return the amount of ether and the amount of tokens funding a task
  function getTaskBalance(
    address _storageContract,
    uint256 _id)
  ifTasksExists(_storageContract, _id)
  constant returns(uint256 _ether, uint256 _tokens)
  {
    var eth = EternalStorage(_storageContract).getUIntValue(sha3("task_eth", _id));
    var tokensWei = EternalStorage(_storageContract).getUIntValue(sha3("task_tokensWei", _id));
    return (eth, tokensWei);
  }

  /// @notice this function updates the 'accepted' flag in the task
  /// @param _id the task id
  function acceptTask(
    address _storageContract,
    uint256 _id)
  ifTasksExists(_storageContract, _id)
	ifTasksNotAccepted(_storageContract, _id)
  {
    EternalStorage(_storageContract).setBooleanValue(sha3("task_accepted", _id), true);
  }

  /// @notice this function is used to update task data.
  /// @param _id the task id
  /// @param _name the task name
  /// @param _summary an IPFS hash
  function updateTask(
    address _storageContract,
    uint256 _id,
    string _name,
    string _summary
  )
  ifTasksExists(_storageContract, _id)
	ifTasksNotAccepted(_storageContract, _id)
  {
    EternalStorage(_storageContract).setStringValue(sha3("task_name", _id), _name);
    EternalStorage(_storageContract).setStringValue(sha3("task_summary", _id), _summary);

    TaskUpdated(sha3("task_name", _id), now);
  }

  /// @notice this function takes ETH and add it to the task funds.
  /// @param _id the task id
  /// @param _amount the amount to contribute
  function contributeEthToTask(
    address _storageContract,
    uint256 _id,
    uint256 _amount)
  ifTasksExists(_storageContract, _id)
	ifTasksNotAccepted(_storageContract, _id)
  {
    var eth = EternalStorage(_storageContract).getUIntValue(sha3("task_eth", _id));
    if(eth + _amount <= eth) throw;
    EternalStorage(_storageContract).setUIntValue(sha3("task_eth", _id), eth+_amount);
  }

  /// @notice this function takes an amount of tokens and add it to the task funds.
  /// @param _id the task id
  /// @param _amount the amount of tokens wei to contribute
  function contributeTokensWeiToTask(
    address _storageContract,
    uint256 _id,
    uint256 _amount,
    bool isColonySelfFunded)
	ifTasksExists(_storageContract, _id)
	ifTasksNotAccepted(_storageContract, _id)
  {
    var tokensWei = EternalStorage(_storageContract).getUIntValue(sha3("task_tokensWei", _id));
    if(tokensWei + _amount <= tokensWei) throw;

    EternalStorage(_storageContract).setUIntValue(sha3("task_tokensWei", _id), tokensWei + _amount);

    // Logic to cater for funding tasks by the parent Colony itself (i.e. self-funding tasks).
    if (isColonySelfFunded)
    {
      var tokensWeiReserved = EternalStorage(_storageContract).getUIntValue(sha3("task_tokensWeiReserved", _id));
      var tokensWeiReservedTotal = EternalStorage(_storageContract).getUIntValue(sha3("ReservedTokensWei"));

      var updatedTokensWei = _amount;
      if (tokensWeiReserved > 0)
      {
        updatedTokensWei += tokensWeiReserved;
      }

      EternalStorage(_storageContract).setUIntValue(sha3("task_tokensWeiReserved", _id), updatedTokensWei);
      EternalStorage(_storageContract).setUIntValue(sha3("ReservedTokensWei"), tokensWeiReservedTotal + _amount);
    }
  }

  function removeReservedTokensWeiForTask(
    address _storageContract,
    uint256 _id)
	ifTasksExists(_storageContract, _id)
  {
    EternalStorage(_storageContract).deleteUIntValue(sha3("task_tokensWeiReserved", _id));
  }
}
