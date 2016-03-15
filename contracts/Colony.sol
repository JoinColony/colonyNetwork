import "ColonyShareLedger.sol";

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
	event TaskCompletedAndPaid (address indexed _from, address indexed _to, uint256 indexed _value);

	// Used to manage this colony's shares.
  address public shareLedger;
	address public rootColony;

 	// This declares a state variable that
	// stores a `User` struct for each possible address.
 	mapping(address => User) public users;

	function Colony() {
		users[tx.origin].admin=true;
		rootColony = msg.sender;
		shareLedger = new ColonyShareLedger(0, 'CNY', 'Colony');
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

  //Mark a task as completed, pay a user
  function completeAndPayTask(uint256 taskId, address paymentAddress){
  		if (tasks[taskId].accepted==true || taskId<0 || taskId >= tasks.length || users[msg.sender].admin==false)
  			throw;
		var task = tasks[taskId];
		task.accepted = true;

	//ColonyPaymentProvider.SettleTaskFees(task.eth, paymentAddress, rootColony);
		// Pay the task Ether and Shares value -5% to task completor
		paymentAddress.send((task.eth * 95)/100);
		// Pay root colony 5% fee
		rootColony.send((task.eth * 5)/100);

		//var t = ColonyShareLedger.at(shareLedger);

		//if (t.totalSupply < task.shares)
		//throw;
		//shareLedger.transfer(paymentAddress, ((task.shares * 95)/100));
    //shareLedger.transfer(rootColony, ((task.shares * 5)/100));
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
