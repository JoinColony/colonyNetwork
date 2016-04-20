import "Modifiable.sol";
import "ColonyPaymentProvider.sol";
import "IUpgradable.sol";
import "ITaskDB.sol";
import "IRootColonyResolver.sol";
import "ITokenLedger.sol";

contract Colony is Modifiable, IUpgradable  {

  // Event to raise when a Task is completed and paid
  event TaskCompletedAndPaid (address _from, address _to, uint256 _ethValue, uint256 _tokensValue);

  modifier onlyAdminsOrigin {
    if (!this.getUserInfo(tx.origin)) throw;
    _
  }

  modifier onlyAdmins {
    if (!this.getUserInfo(msg.sender)) throw;
    _
  }

  struct User
  {
    bool admin;  // if true, that person is an admin
    bool _exists;
  }

  address owner;
  IRootColonyResolver public rootColonyResolver;
  ITokenLedger public tokenLedger;
  ITaskDB public taskDB;

 	// This declares a state variable that
	// stores a `User` struct for each possible address.

  mapping(address => User) users;
  uint public adminsCount;
  // keeping track of how many tokens are assigned to tasks by the colony itself (i.e. self-funding tasks).
  mapping(uint256 => uint256) reserved_tokens;
  uint256 public reservedTokensWei = 0;

  function Colony(
    address rootColonyResolverAddress_,
    address _tokenLedgerAddress,
    address _tasksDBAddress)
  {
    users[tx.origin] = User({admin: true, _exists: true});
    adminsCount = 1;
    rootColonyResolver = IRootColonyResolver(rootColonyResolverAddress_);
    tokenLedger = ITokenLedger(_tokenLedgerAddress);
    taskDB = ITaskDB(_tasksDBAddress);
  }

  /// @notice registers a new RootColonyResolver contract.
  /// Used to keep the reference of the RootColony.
  /// @param rootColonyResolverAddress_ the RootColonyResolver address
  function registerRootColonyResolver(address rootColonyResolverAddress_)
  onlyAdmins
  throwIfAddressIsInvalid(rootColonyResolverAddress_)
  {
    rootColonyResolver = IRootColonyResolver(rootColonyResolverAddress_);
  }

  /// @notice adds a new admin user to the colony
  /// @param newAdminAddress the address of the new admin user
  function addAdmin(address newAdminAddress)
  onlyAdmins
  {
    if(users[newAdminAddress]._exists && users[newAdminAddress].admin)
      throw;

    if(!users[newAdminAddress]._exists)
      adminsCount += 1;

    users[newAdminAddress] = User({admin: true, _exists: true});
  }

  /// @notice removes an admin from the colony
  /// @param adminAddress the address of the admin to be removed
  function removeAdmin(address adminAddress)
  onlyAdmins
  {
    if(!users[adminAddress]._exists) throw;
    if(users[adminAddress]._exists && !users[adminAddress].admin) throw;
    if(adminsCount == 1) throw;

    users[adminAddress].admin = false;
    adminsCount -= 1;
  }

  /// @notice registers a new ITaskDB contract
  /// @param _tasksDBAddress the address of the ITaskDB
  function registerTaskDB(address _tasksDBAddress)
  onlyAdmins
  throwIfAddressIsInvalid(_tasksDBAddress)
  {
    taskDB = ITaskDB(_tasksDBAddress);
  }

  /// @notice contribute ETH to a task
  /// @param taskId the task ID
	function contributeEth(uint256 taskId)
  onlyAdmins
  {
    var isTaskAccepted = taskDB.isTaskAccepted(taskId);
		if (isTaskAccepted)
			throw;

    taskDB.contributeEth(taskId, msg.value);
	}

	//Contribute Tokens to a task
	function contributeTokens(uint256 taskId, uint256 tokens)
  onlyAdmins
  {
    var isTaskAccepted = taskDB.isTaskAccepted(taskId);
    if (isTaskAccepted)
      throw;

    var tokensInWei = tokens * 1000000000000000000;
    // When a user funds a task, the actually is a transfer of tokens ocurring from their address to the colony's one.
    tokenLedger.transferFrom(msg.sender, this, tokensInWei);
    reserved_tokens[taskId] += tokensInWei;
    reservedTokensWei += tokensInWei;

    taskDB.contributeTokensWei(taskId, tokensInWei);
	}

  function contributeTokensFromPool(uint256 taskId, uint256 tokens)
  onlyAdmins
  {
    var isTaskAccepted = taskDB.isTaskAccepted(taskId);
    if (isTaskAccepted)
      throw;
    //When tasks are funded from the pool of unassigned tokens, no transfer takes place - we just mark them as
    //assigned.
    var tokensInWei = tokens * 1000000000000000000;
    if (reservedTokensWei + tokensInWei > tokenLedger.balanceOf(this))
      throw;
    reserved_tokens[taskId] += tokensInWei;
    reservedTokensWei += tokensInWei;

    taskDB.contributeTokensWei(taskId, tokensInWei);
  }

  /// @notice this function is used to generate Colony tokens
  /// @param _amount The amount of tokens to be generated
  function generateColonyTokens(uint256 _amount)
  onlyAdmins
  refundEtherSentByAccident
  {
    tokenLedger.generateTokensWei(_amount * 1000000000000000000);
  }

  /// @notice this function adds a task to the task DB.
  /// @param _name the task name
  /// @param _summary an IPFS hash
  function makeTask(
    string _name,
    string _summary
  )
  onlyAdmins
  {
      taskDB.makeTask(_name, _summary);
  }

  /// @notice this function updates the 'accepted' flag in the task
  /// @param _id the task id
  function acceptTask(uint256 _id)
  onlyAdmins
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
  onlyAdmins
  {
    taskDB.updateTask(_id, _name, _summary);
  }

  /// @notice set the colony tokens symbol
  /// @param symbol_ the symbol of the colony tokens
  function setTokensSymbol(bytes4 symbol_)
  refundEtherSentByAccident
  onlyAdmins
  {
    tokenLedger.setTokensSymbol(symbol_);
  }

  /// @notice set the colony tokens title
  /// @param title_ the title of the colony tokens
  function setTokensTitle(bytes32 title_)
  refundEtherSentByAccident
  onlyAdmins
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
  onlyAdmins
  {

    bool isTaskAccepted = taskDB.isTaskAccepted(taskId);
    if (isTaskAccepted || !users[msg.sender].admin)
    {
      throw;
    }

    taskDB.acceptTask(taskId);
    var (taskEth, taskTokens) = taskDB.getTaskBalance(taskId);
    if (taskEth > 0)
    {
      ColonyPaymentProvider.SettleTaskFees(taskEth, paymentAddress, rootColonyResolver.rootColonyAddress());
    }

    if (taskTokens > 0)
    {

      var payout = ((taskTokens * 95)/100);
      var fee = taskTokens - payout;
      tokenLedger.transfer(paymentAddress, payout);
      tokenLedger.transfer(rootColonyResolver.rootColonyAddress(), fee);

      reserved_tokens[taskId] -= taskTokens;
      reservedTokensWei -= taskTokens;
		}

    TaskCompletedAndPaid(this, paymentAddress, taskEth, taskTokens);
  }

  function upgrade(address newColonyAddress_)
  onlyAdminsOrigin
  {
    var tokensBalance = tokenLedger.balanceOf(this);
    if(tokensBalance > 0){
      tokenLedger.transfer(newColonyAddress_, tokensBalance);
    }

    tokenLedger.changeOwner(newColonyAddress_);
    taskDB.changeOwner(newColonyAddress_);

    selfdestruct(newColonyAddress_);
  }
}
