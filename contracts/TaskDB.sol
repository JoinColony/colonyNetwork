
import "ITaskDB.sol";

contract TaskDB is ITaskDB {

  event ReceivedShares(uint256 indexed taskId, uint256 indexed amount, uint256 indexed when);
  event ReceivedEther(uint256 indexed taskId, uint256 indexed amount, uint256 indexed when);
  event TaskAdded(uint256 indexed id, uint256 indexed when);
  event TaskUpdated(uint256 indexed id, uint256 indexed when);

  function TaskDB()
  refundEtherSentByAccident { }

  modifier ifTasksExists(uint256 _id) {
    if(!hasTask(_id)) throw;
    _
  }

	struct Task
	{
		string name; //Short name
		string summary; //IPFS hash of the brief
		bool accepted; //Whether the work has been accepted
		uint256 eth; //Amount of ETH contributed to the task
		uint256 shares; //Amount of shares contributed to the task
	}

	// A dynamically-sized array of `Task` structs.
	Task[] public tasks;

  /// @notice this function adds a task to the task DB. Any ETH sent will be
  /// considered as a contribution to the task
  /// @param _name the task name
  /// @param _summary an IPFS hash
  function addTask(
    string _name,
    string _summary
  )
  onlyOwner
  throwIfIsEmptyString(_name)
  {
    var taskId = tasks.length++;
    tasks[taskId] = Task({
      name         : _name,
    	summary       : _summary,
    	accepted      : false,
    	eth           : 0,
    	shares        : 0
    });

    TaskAdded(taskId, now);
  }

  /// @notice this function returns the number of tasks in the DB
  /// @return the number of tasks in DB
  function count() constant returns(uint256) {
    return tasks.length;
  }

  /// @notice this task is useful when we need to know if a task exists
  /// @param _id the task id
  /// @return true - if the task if is valid, false - if the task id is invalid.
  function hasTask(uint256 _id) constant returns(bool) {
    return (!(_id >= tasks.length));
  }

  /// @notice this function returns if a task was accepted
  /// @param _id the task id
  /// @return a flag indicating if the task was accepted or not
  function isTaskAccepted(uint256 _id)
  ifTasksExists(_id)
  constant returns(bool)
  {
    return (tasks[_id].accepted);
  }

  /// @notice this function returns if a task was accepted
  /// @param _id the task id
  /// @return the amount of ether and the amount of shares funding a task
  function getTaskBalance(uint256 _id)
  ifTasksExists(_id)
  constant returns(uint256 _ether, uint256 _shares)
  {
    var task = tasks[_id];
    return (task.eth, task.shares);
  }

  /// @notice this function updates the 'accepted' flag in the task
  /// @param _id the task id
  function acceptTask(uint256 _id)
  onlyOwner
  ifTasksExists(_id)
  {
    if(tasks[_id].accepted) throw;
    tasks[_id].accepted = true;
  }

  /// @notice this function is used to update task data.
  /// @param _id the task id
  /// @param _name the task name
  /// @param _summary an IPFS hash
  function updateTask(
    uint256 _id,
    string _name,
    string _summary
  )
  onlyOwner
  ifTasksExists(_id)
  throwIfIsEmptyString(_name)
  {
    if(tasks[_id].accepted) throw;

    tasks[_id].name = _name;
    tasks[_id].summary = _summary;

    TaskUpdated(_id, now);
  }

  /// @notice this function returns the attributes of a task
  /// @param _id the task id
  /// @return the name, a flag indicating if the task was accepted or not,
  /// a hash pointing to the summary of a task (IPFS hash), the amount of ether
  /// it holds, the amount of shares it holds
  function getTask(uint256 _id)
  ifTasksExists(_id)
  constant returns (
      string _name,
      string _summary,
      bool _accepted,
      uint256 _eth,
      uint256 _shares
  )
  {
    var task = tasks[_id];
    return (
      task.name,
      task.summary,
      task.accepted,
      task.eth,
      task.shares
    );
  }

  /// @notice this function takes ETH and add it to the task funds.
  /// @param _id the task id
  /// @param _amount the amount to contribute
  function contributeEth(uint256 _id, uint256 _amount)
  onlyOwner
  ifTasksExists(_id)
  {
    if(tasks[_id].eth + _amount <= tasks[_id].eth) throw;
    if(tasks[_id].accepted) throw;

    tasks[_id].eth += _amount;
    ReceivedEther(_id, _amount, now);
  }

  /// @notice this function takes an amount of shares and add it to the task funds.
  /// @param _id the task id
  /// @param _amount the amount of shares to contribute
  function contributeShares(uint256 _id, uint256 _amount)
  onlyOwner
  ifTasksExists(_id)
  {
    if(tasks[_id].shares + _amount <= tasks[_id].shares) throw;
    if(tasks[_id].accepted) throw;

    tasks[_id].shares += _amount;
    ReceivedShares(_id, _amount, now);
  }
}
