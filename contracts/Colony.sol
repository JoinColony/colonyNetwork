import "ColonyShareLedger.sol";
import "ColonyPaymentProvider.sol";

contract Colony {

	struct User
	{
			bool admin;  // if true, that person is an admin
	}

	struct Task
	{
			string name; //Short name
			string summary; //IPFS hash of the brief
			bool accepted; //Whether the work has been accepted
			uint eth; //Amount of ETH contributed to the task
			uint shares; //Amount of shares contributed to the task
	}

	// A dynamically-sized array of `Task` structs.
	Task[] public tasks;

	// Event to raise when a Task is completed and paid
	event TaskCompletedAndPaid (address _from, address indexed _to, uint256 indexed _ethValue, uint256 indexed _sharesValue);

	// Used to manage this colony's shares.
  ColonyShareLedger public shareLedger;
	address public rootColony;

 	// This declares a state variable that
	// stores a `User` struct for each possible address.
 	mapping(address => User) public users;

	function Colony(uint256 _totalSharesSupply) {
		users[tx.origin].admin=true;
		rootColony = msg.sender;
		shareLedger = new ColonyShareLedger(_totalSharesSupply, 'CNY', 'COLONY');
	}

	//Contribute ETH to a task
	function contribute(uint256 taskId) {
		var task = tasks[taskId];
		if (task.accepted != false) // check for non-existing task or completed task
				throw;
		task.eth += msg.value;
	}

	//Contribute Shares to a task
	function contributeShares(uint256 taskId, uint256 shares){
		var task = tasks[taskId];
		if (task.accepted != false) // check for non-existing task or completed task
				throw;
		task.shares += shares;

		shareLedger.transfer(this, shares);
	}

	function getUserInfo(address userAddress) constant returns (bool admin){
		admin=users[userAddress].admin;
	}

	//Make a task for some work to be done
  function makeTask(string name, string summary){
    tasks.push(Task({
        name: name,
        summary:summary,
        accepted: false,
        eth: 0,
				shares: 0
    }));
  }

  function updateTask(uint256 taskId, string name, string summary){
	    tasks[taskId].name = name;
	    tasks[taskId].summary = summary;
  }

  function getTask(uint256 taskId) constant returns (string name, string summary, bool accepted, uint eth, uint shares) {
  	var task = tasks[taskId];
	name = task.name;
	summary = task.summary;
	accepted = task.accepted;
	eth = task.eth;
	shares = task.shares;
  }

  function getNTasks() returns (uint) {
  	return tasks.length;
  }

  //Mark a task as completed, pay a user, pay root colony fee
  function completeAndPayTask(uint256 taskId, address paymentAddress){
  		if (tasks[taskId].accepted==true || taskId<0 || taskId >= tasks.length || users[msg.sender].admin==false)
  			throw;
		var task = tasks[taskId];
		task.accepted = true;

		if (task.eth > 0)
		{
			ColonyPaymentProvider.SettleTaskFees(task.eth, paymentAddress, rootColony);
		}

		if (task.shares > 0)
		{
			// Check if there are enough shares to pay up
			if (shareLedger.totalSupply() < task.shares)
				throw;

	    //bytes4 colonyConstrCallSig = bytes4(sha3("scheduleCall(bytes4,uint256)"));
			shareLedger.transfer(paymentAddress, ((task.shares * 95)/100));
	    shareLedger.transfer(rootColony, ((task.shares * 5)/100));
		}

		TaskCompletedAndPaid(this, paymentAddress, task.eth, task.shares);
  }

	function () {
			// This function gets executed if a
			// transaction with invalid data is sent to
			// the contract or just eth without data.
			// We revert the send so that no-one
			// accidentally loses money when using the
			// contract.
			throw;
	}
}
