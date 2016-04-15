import "Modifiable.sol";
import "ColonyPaymentProvider.sol";
import "IUpgradable.sol";
import "ITaskDB.sol";
import "IRootColonyResolver.sol";
import "ITokenLedger.sol";

contract Colony is Modifiable, IUpgradable  {

  // Event to raise when a Task is completed and paid
  event TaskCompletedAndPaid (address _from, address _to, uint256 _ethValue, uint256 _tokensValue);
  event ReservedTokens (uint256 _taskId, uint256 tokens);

  modifier onlyOwner {
    if ( !this.getUserInfo(msg.sender)) throw;
    _
  }

	struct User
	{
		bool admin;  // if true, that person is an admin
	}

  IRootColonyResolver public rootColonyResolver;
  ITokenLedger public tokenLedger;
  ITaskDB public taskDB;

 	// This declares a state variable that
	// stores a `User` struct for each possible address.

  mapping(address => User) public users;
  // keeping track of how many tokens are assigned to tasks by the colony itself (i.e. self-funding tasks).
  mapping(uint256 => uint256) reserved_tokens;
  uint256 public total_reserved_tokens;

  function Colony(
    address rootColonyResolverAddress_,
    address _tokenLedgerAddress,
    address _tasksDBAddress)
  {
    users[tx.origin].admin = true;
    rootColonyResolver = IRootColonyResolver(rootColonyResolverAddress_);
    tokenLedger = ITokenLedger(_tokenLedgerAddress);
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

	//Contribute Tokens to a task
	function contributeTokens(uint256 taskId, uint256 tokens) {
    var isTaskAccepted = taskDB.isTaskAccepted(taskId);
    if (isTaskAccepted)
      throw;

    if (this.getUserInfo(msg.sender))
    {
      // Throw if the colony is going to exceed its total supply of tokens (considering the tasks it has already funded and the tokens for current task).
      if ((total_reserved_tokens + tokens) > tokenLedger.totalSupply())
        throw;

      // When the colony is self funding a task, tokens are just being reserved.
      reserved_tokens[taskId] += tokens;
      total_reserved_tokens += tokens;

      ReservedTokens(taskId, tokens);
    }
    else
    {
      // When a user funds a task, the actually is a transfer of tokens ocurring from their address to the colony's one.
      tokenLedger.transferFrom(msg.sender, this, tokens);
    }

    taskDB.contributeTokens(taskId, tokens);
	}

  function getReservedTokens(uint256 _taskId)
  constant returns(uint256 _tokens)
  {
    _tokens = reserved_tokens[_taskId];
  }

  /// @notice this function is used to generate Colony tokens
  /// @param _amount The amount of tokens to be generated
  function generateColonyTokens(uint256 _amount)
  onlyOwner
  refundEtherSentByAccident
  {
    tokenLedger.generateTokens(_amount);
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

  /// @notice set the colony tokens symbol
  /// @param symbol_ the symbol of the colony tokens
  function setTokensSymbol(bytes4 symbol_)
  refundEtherSentByAccident
  onlyOwner
  {
    tokenLedger.setTokensSymbol(symbol_);
  }

  /// @notice set the colony tokens title
  /// @param title_ the title of the colony tokens
  function setTokensTitle(bytes32 title_)
  refundEtherSentByAccident
  onlyOwner
  {
    tokenLedger.setTokensTitle(title_);
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

    var (taskEth, taskTokens) = taskDB.getTaskBalance(taskId);
    taskDB.acceptTask(taskId);
		if (taskEth > 0)
		{
			ColonyPaymentProvider.SettleTaskFees(taskEth, paymentAddress, rootColonyResolver.rootColonyAddress());
		}

		if (taskTokens > 0)
		{
			// Check if there are enough tokens to pay up
			if (tokenLedger.totalSupply() < taskTokens)
				throw;

      var payout = ((taskTokens * 95)/100);
      var fee = taskTokens - payout;
			tokenLedger.transfer(paymentAddress, payout);
	    tokenLedger.transfer(rootColonyResolver.rootColonyAddress(), fee);

      reserved_tokens[taskId] -= taskTokens;
		}

		TaskCompletedAndPaid(this, paymentAddress, taskEth, taskTokens);
  }

  function upgrade(address newColonyAddress_) {

    if(!users[tx.origin].admin) throw;

    var sharesBalance = tokenLedger.balanceOf(this);
    if(sharesBalance > 0){
      tokenLedger.transfer(newColonyAddress_, sharesBalance);
    }

    tokenLedger.changeOwner(newColonyAddress_);
    taskDB.changeOwner(newColonyAddress_);

    selfdestruct(newColonyAddress_);
  }
}
