import "Modifiable.sol";
import "ITaskDB.sol";
import "IRootColonyResolver.sol";
import "ColonyPaymentProvider.sol";
import "IShareLedger.sol";

contract Colony is Modifiable {

  // Event to raise when a Task is completed and paid
  event TaskCompletedAndPaid (address _from, address _to, uint256 _ethValue, uint256 _sharesValue);
  event ReservedShares (uint256 _taskId, uint256 shares);

  modifier onlyOwner {
    if ( !this.getUserInfo(msg.sender)) throw;
    _
  }

	struct User
	{
		bool admin;  // if true, that person is an admin
	}

  IRootColonyResolver public rootColonyResolver;
  IShareLedger public shareLedger;
  ITaskDB public taskDB;

 	// This declares a state variable that
	// stores a `User` struct for each possible address.

  mapping(address => User) public users;
  // keeping track of how many shares are assigned to tasks by the colony itself (i.e. self-funding tasks).
  mapping(uint256 => uint256) reserved_shares;
  uint256 public total_reserved_shares;

  function Colony(
    address rootColonyResolverAddress_,
    address _shareLedgerAddress,
    address _tasksDBAddress)
  {
    users[tx.origin].admin = true;
    rootColonyResolver = IRootColonyResolver(rootColonyResolverAddress_);
    shareLedger = IShareLedger(_shareLedgerAddress);
    taskDB = ITaskDB(_tasksDBAddress);
  }

  /// @notice registers a new RootColonyResolver contract.
  /// Used to keep the reference of the RootColony.
  /// @param rootColonyResolverAddress_ the RootColonyResolver address
  function registerRootColonyResolver(address rootColonyResolverAddress_)
  onlyOwner
  throwIfAddressIsInvalid(rootColonyResolverAddress_)
  {
    rootColonyResolver = IRootColonyResolver(rootColonyResolverAddress_);
  }

  /// @notice registers a new ITaskDB contract
  /// @param _tasksDBAddress the address of the ITaskDB
  function registerTaskDB(address _tasksDBAddress)
  onlyOwner
  throwIfAddressIsInvalid(_tasksDBAddress)
  {
    taskDB = ITaskDB(_tasksDBAddress);
  }

  /// @notice contribute ETH to a task
  /// @param taskId the task ID
	function contributeEth(uint256 taskId) {
    var isTaskAccepted = taskDB.isTaskAccepted(taskId);
		if (isTaskAccepted)
			throw;

    taskDB.contributeEth(taskId, msg.value);
	}

	//Contribute Shares to a task
	function contributeShares(uint256 taskId, uint256 shares) {
    var isTaskAccepted = taskDB.isTaskAccepted(taskId);
    if (isTaskAccepted)
      throw;

    if (this.getUserInfo(msg.sender))
    {
      // Throw if the colony is going to exceed its total supply of shares (considering the tasks it has already funded and the shares for current task).
      if ((total_reserved_shares + shares) > shareLedger.totalSupply())
        throw;

      // When the colony is self funding a task, shares are just being reserved.
      reserved_shares[taskId] += shares;
      total_reserved_shares += shares;

      ReservedShares(taskId, shares);
    }
    else
    {
      // When a user funds a task, the actually is a transfer of shares ocurring from their address to the colony's one.
      shareLedger.transferFrom(msg.sender, this, shares);
    }

    taskDB.contributeShares(taskId, shares);
	}

  function getReservedShares(uint256 _taskId)
  constant returns(uint256 _shares)
  {
    _shares = reserved_shares[_taskId];
  }

  /// @notice this function is used to generate Colony shares
  /// @param _amount The amount of shares to be generated
  function generateColonyShares(uint256 _amount)
  onlyOwner
  refundEtherSentByAccident
  {
    shareLedger.generateShares(_amount);
  }

  function getRootColony()
  constant returns(address)
  {
    return rootColonyResolver.rootColonyAddress();
  }

  /// @notice this function adds a task to the task DB.
  /// @param _name the task name
  /// @param _summary an IPFS hash
  function makeTask(
    string _name,
    string _summary
  )
  throwIfIsEmptyString(_name)
  {
      taskDB.makeTask(_name, _summary);
  }

  /// @notice this function updates the 'accepted' flag in the task
  /// @param _id the task id
  function acceptTask(uint256 _id)
  onlyOwner
  {
    taskDB.acceptTask(_id);
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
  throwIfIsEmptyString(_name)
  {
    taskDB.updateTask(_id, _name, _summary);
  }

  /// @notice set the colony shares symbol
  /// @param symbol_ the symbol of the colony shares
  function setSharesSymbol(bytes4 symbol_)
  refundEtherSentByAccident
  onlyOwner
  {
    shareLedger.setSharesSymbol(symbol_);
  }

  /// @notice set the colony shares title
  /// @param title_ the title of the colony shares
  function setSharesTitle(bytes32 title_)
  refundEtherSentByAccident
  onlyOwner
  {
    shareLedger.setSharesTitle(title_);
  }

	function getUserInfo(address userAddress)
  constant returns (bool admin)
  {
		return users[userAddress].admin;
	}

  //Mark a task as completed, pay a user, pay root colony fee
  function completeAndPayTask(uint256 taskId, address paymentAddress)
  onlyOwner
  {
    var isTaskAccepted = taskDB.isTaskAccepted(taskId);
    if (isTaskAccepted || users[msg.sender].admin == false)
			throw;

    var (taskEth, taskShares) = taskDB.getTaskBalance(taskId);
    taskDB.acceptTask(taskId);
		if (taskEth > 0)
		{
			ColonyPaymentProvider.SettleTaskFees(taskEth, paymentAddress, getRootColony());
		}

		if (taskShares > 0)
		{
			// Check if there are enough shares to pay up
			if (shareLedger.totalSupply() < taskShares)
				throw;

      var payout = ((taskShares * 95)/100);
      var fee = taskShares - payout;
			shareLedger.transfer(paymentAddress, payout);
	    shareLedger.transfer(getRootColony(), fee);

      reserved_shares[taskId] -= taskShares;
		}

		TaskCompletedAndPaid(this, paymentAddress, taskEth, taskShares);
  }
}
