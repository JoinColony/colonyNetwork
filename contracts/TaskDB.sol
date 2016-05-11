library TaskDB {

	struct Task
	{
		string name; //Short name
		string summary; //IPFS hash of the brief
		bool accepted; //Whether the work has been accepted
		uint256 eth; //Amount of ETH contributed to the task
		uint256 tokensWei; //Amount of tokens wei contributed to the task
	}

	modifier ifTasksExists(Task[] storage tasks, uint256 _id) {
    if(!hasTask(tasks, _id)) throw;
	    _
	  }

  /// @notice this function adds a task to the task DB. Any ETH sent will be
  /// considered as a contribution to the task
  /// @param _name the task name
  /// @param _summary an IPFS hash
  function makeTask(
    Task[] storage tasks,
    string _name,
    string _summary
  )
  {
    var taskId = tasks.length++;
    tasks[taskId] = Task({
      name         : _name,
    	summary       : _summary,
    	accepted      : false,
    	eth           : 0,
    	tokensWei     : 0
    });
  }

  /// @notice this task is useful when we need to know if a task exists
  /// @param _id the task id
  /// @return true - if the task if is valid, false - if the task id is invalid.
  function hasTask(Task[] storage tasks, uint256 _id) constant returns(bool) {
    return (!(_id >= tasks.length));
  }

  /// @notice this function returns if a task was accepted
  /// @param _id the task id
  /// @return a flag indicating if the task was accepted or not
  function isTaskAccepted(
    Task[] storage tasks,
    uint256 _id)
  ifTasksExists(tasks, _id)
  constant
  returns(bool)
  {
    return (tasks[_id].accepted);
  }

  /// @notice this function returns if a task was accepted
  /// @param _id the task id
  /// @return the amount of ether and the amount of tokens funding a task
  function getTaskBalance(
    Task[] storage tasks,
    uint256 _id)
  ifTasksExists(tasks, _id)
  constant returns(uint256 _ether, uint256 _tokens)
  {
    var task = tasks[_id];
    return (task.eth, task.tokensWei);
  }

  /// @notice this function updates the 'accepted' flag in the task
  /// @param _id the task id
  function acceptTask(
    Task[] storage tasks,
    uint256 _id)
  ifTasksExists(tasks, _id)
  {
    if(tasks[_id].accepted) throw;
    tasks[_id].accepted = true;
  }

  /// @notice this function is used to update task data.
  /// @param _id the task id
  /// @param _name the task name
  /// @param _summary an IPFS hash
  function updateTask(
    Task[] storage tasks,
    uint256 _id,
    string _name,
    string _summary
  )
  ifTasksExists(tasks, _id)
  {
    if(tasks[_id].accepted) throw;

    tasks[_id].name = _name;
    tasks[_id].summary = _summary;
  }

  /// @notice this function returns the attributes of a task
  /// @param _id the task id
  /// @return the name, a flag indicating if the task was accepted or not,
  /// a hash pointing to the summary of a task (IPFS hash), the amount of ether
  /// it holds, the amount of tokens wei it holds
  function getTask(
    Task[] storage tasks,
    uint256 _id)
  ifTasksExists(tasks, _id)
  constant returns (
      string _name,
      string _summary,
      bool _accepted,
      uint256 _eth,
      uint256 _tokensWei
  )
  {
    var task = tasks[_id];
    return (
      task.name,
      task.summary,
      task.accepted,
      task.eth,
      task.tokensWei
    );
  }

  /// @notice this function takes ETH and add it to the task funds.
  /// @param _id the task id
  /// @param _amount the amount to contribute
  function contributeEth(
    Task[] storage tasks,
    uint256 _id,
    uint256 _amount)
  ifTasksExists(tasks, _id)
  {
    if(tasks[_id].eth + _amount <= tasks[_id].eth) throw;
    if(tasks[_id].accepted) throw;

    tasks[_id].eth += _amount;
  }

  /// @notice this function takes an amount of tokens and add it to the task funds.
  /// @param _id the task id
  /// @param _amount the amount of tokens wei to contribute
  function contributeTokensWei(
    Task[] storage tasks,
    uint256 _id,
    uint256 _amount)
	ifTasksExists(tasks, _id)
  {
    if(tasks[_id].tokensWei + _amount <= tasks[_id].tokensWei) throw;
    if(tasks[_id].accepted) throw;

    tasks[_id].tokensWei += _amount;
  }
}
