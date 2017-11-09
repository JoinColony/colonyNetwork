pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";

import "../lib/dappsys/auth.sol";
import "../lib/dappsys/math.sol";
import "./ERC20Extended.sol";
import "./IColony.sol";
import "./IColonyNetwork.sol";
import "./TransactionReviewer.sol";


contract Colony is DSAuth, DSMath, IColony, TransactionReviewer {
  address resolver;
  address colonyNetworkAddress;
  ERC20Extended public token;
  mapping (uint => Task) public tasks;

  // Pots can be tied to tasks or to (in the future) domains, so giving them their own mapping.
  // Pot 1  can be thought of as the pot belonging to the colony itself that hasn't been assigned
  // to anything yet, but has had some siphoned off in to the reward pot.
  // Pot 0 is the pot containing funds that can be paid to holders of colony tokens in the future.
  mapping (uint => Pot) pots;

  // This keeps track of how much of the colony's funds that it owns have been moved into pots other than pot 0,
  // which (by definition) have also had the reward amount siphoned off and put in to pot 0.
  // TODO: This needs to be decremented whenever a payout occurs and the colony loses control of the funds.
  mapping (address => uint) public nonRewardPotsTotal;

  uint public taskCount;
  uint public potCount;

  // This function, exactly as defined, is used in build scripts. Take care when updating.
  // Version number should be upped with every change in Colony or its dependency contracts or libraries.
  function version() public view returns (uint256) { return 5; }

  struct Task {
    bytes32 ipfsDecodedHash;
    address[] roles; // index mapping 0 => manager, 1 => evaluator, 2 => worker, 3.. => other roles
    uint dueDate;
    bool accepted;
    bool cancelled;
    uint payoutsWeCannotMake;
    uint potId;
    // Maps a token to the sum of all payouts of it for this task
    mapping (address => uint) totalPayouts;
    // Maps task role ids (0,1,2..) to a token amount to be paid on task completion
    mapping (uint => mapping (address => uint)) payouts;
  }

  struct Pot {
    mapping (address => uint) balance;
    uint taskId;
  }

  modifier tasksExists(uint256 _id) {
    require(_id <= taskCount);
    _;
  }

  modifier tasksNotAccepted(uint256 _id) {
    require(!tasks[_id].accepted);
    _;
  }

  modifier taskAccepted(uint256 _id) {
    require(tasks[_id].accepted);
    _;
  }

  modifier self() {
    require(address(this) == msg.sender);
    _;
  }

  function setToken(address _token) public
  auth
  {
    token = ERC20Extended(_token);
  }

  function makeTask(bytes32 _ipfsDecodedHash) public
  auth
  {
    taskCount += 1;
    potCount += 1;
    address[] memory _roles = new address[](3);
    _roles[0] = msg.sender;
    tasks[taskCount] = Task({
      ipfsDecodedHash: _ipfsDecodedHash,
      roles: _roles,
      accepted: false,
      cancelled: false,
      dueDate: 0,
      payoutsWeCannotMake: 0,
      potId: potCount
    });
    pots[potCount].taskId = taskCount;
  }

  function proposeTaskChange(bytes _data, uint _value, uint8 _role) public returns (uint transactionId) {
    var (sig, taskId) = deconstructCall(_data);

    Task storage task = tasks[taskId];
    require(task.roles[_role] == msg.sender);
    require(!task.accepted);

    uint8[2] storage _reviewers = reviewers[sig];
    require(_reviewers[0] != 0 || _reviewers[1] != 0);
    require(_reviewers[0] == _role || _reviewers[1] == _role);

    transactionId = submitTransaction(_data, _value, _role);
  }

  function approveTaskChange(uint _transactionId, uint8 _role) public {
    Transaction storage _transaction = transactions[_transactionId];
    bytes memory _data = _transaction.data;
    var (sig, taskId) = deconstructCall(_data);

    Task storage task = tasks[taskId];
    require(task.roles[_role] == msg.sender);
    require(!task.accepted);

    uint8[2] storage _reviewers = reviewers[sig];
    require(_reviewers[0] != 0 || _reviewers[1] != 0);
    require(_reviewers[0] == _role || _reviewers[1] == _role);

    confirmTransaction(_transactionId, _role);
  }

  // Get the function signature and task id from the transaction bytes data
  // Note: Relies on the encoded function's first parameter to be the uint256 taskId
  function deconstructCall(bytes _data) internal returns (bytes4 sig, uint256 taskId) {
    assembly {
      sig := mload(add(_data, 0x20))
      taskId := mload(add(_data, add(0x20, 4))) // same as calldataload(72)
    }
  }

  // TODO: Restrict function visibility to whoever submits the approved Transaction from Client
  // Note task assignment is agreed off-chain
  function setTaskEvaluator(uint256 _id, address _evaluator) public
  tasksExists(_id)
  tasksNotAccepted(_id)
  {
    tasks[_id].roles[1] = _evaluator;
  }

  // TODO: Restrict function visibility to whoever submits the approved Transaction from Client
  // Note task assignment is agreed off-chain
  function setTaskWorker(uint256 _id, address _worker) public
  tasksExists(_id)
  tasksNotAccepted(_id)
  {
    tasks[_id].roles[2] = _worker;
  }

  function setTaskBrief(uint256 _id, bytes32 _ipfsDecodedHash) public
  self()
  tasksExists(_id)
  tasksNotAccepted(_id)
  {
    tasks[_id].ipfsDecodedHash = _ipfsDecodedHash;
  }

  function setTaskDueDate(uint256 _id, uint256 _dueDate) public
  self()
  tasksExists(_id)
  tasksNotAccepted(_id)
  {
    tasks[_id].dueDate = _dueDate;
  }

  function setTaskPayout(uint _id, uint _role, address _token, uint _amount) public
  self()
  tasksExists(_id)
  tasksNotAccepted(_id)
  {
    Task storage task = tasks[_id];
    uint currentAmount = task.payouts[_role][_token];
    task.payouts[_role][_token] = _amount;

    uint currentTotalAmount = task.totalPayouts[_token];
    task.totalPayouts[_token] = add(sub(currentTotalAmount, currentAmount), _amount);
    updateTaskPayoutsWeCannotMakeAfterBudgetChange(_id, _token, currentTotalAmount);
  }

  function updateTaskPayoutsWeCannotMakeAfterPotChange(uint256 _id, address _token, uint _prev) internal {
    Task storage task = tasks[_id];
    uint totalTokenPayout = task.totalPayouts[_token];
    uint tokenPot = pots[task.potId].balance[_token];
    if (_prev >= totalTokenPayout) {                                   // If the old amount in the pot was enough to pay for the budget
      if (tokenPot < totalTokenPayout) {                               // And the new amount in the pot is not enough to pay for the budget...
        task.payoutsWeCannotMake += 1;                                  // Then this is a set of payouts we cannot make that we could before.
      }
    } else {                                                            // If this 'else' is running, then the old amount in the pot could not pay for the budget
      if (tokenPot >= totalTokenPayout) {                             // And the new amount in the pot can pay for the budget
        task.payoutsWeCannotMake -= 1;                                  // Then this is a set of payouts we can make that we could not before.
      }
    }
  }

  function updateTaskPayoutsWeCannotMakeAfterBudgetChange(uint256 _id, address _token, uint _prev) internal {
    Task storage task = tasks[_id];
    uint totalTokenPayout = task.totalPayouts[_token];
    uint tokenPot = pots[task.potId].balance[_token];
    if (tokenPot >= _prev) {                                          // If the amount in the pot was enough to pay for the old budget...
      if (tokenPot < totalTokenPayout) {                              // And the amount is not enough to pay for the new budget...
        task.payoutsWeCannotMake += 1;                                 // Then this is a set of payouts we cannot make that we could before.
      }
    } else {                                                           // If this 'else' is running, then the amount in the pot was not enough to pay for the old budget
      if (tokenPot >= totalTokenPayout) {                             // And the amount is enough to pay for the new budget...
        task.payoutsWeCannotMake -= 1;                                 // Then this is a set of payouts we can make that we could not before.
      }
    }
  }

  function acceptTask(uint256 _id) public
  auth
  tasksExists(_id)
  tasksNotAccepted(_id)
  {
    tasks[_id].accepted = true;
  }

  function cancelTask(uint256 _id) public
  auth
  tasksExists(_id)
  tasksNotAccepted(_id)
  {
    tasks[_id].cancelled = true;
  }

  function getTask(uint256 _id) public view
  returns (bytes32, uint, bool, bool, uint, uint, uint)
  {
    Task storage task = tasks[_id];
    uint rolesCount = task.roles.length;

    return (task.ipfsDecodedHash,
      rolesCount,
      task.accepted,
      task.cancelled,
      task.dueDate,
      task.payoutsWeCannotMake,
      task.potId
    );
  }

  function getTaskRoleAddress (uint _id, uint _role) public view
  returns (address)
  {
    return tasks[_id].roles[_role];
  }

  // To get all payouts for a task iterate over roles.length
  function getTaskPayout(uint _id, uint _role, address _token) public view
  returns (uint)
  {
    Task storage task = tasks[_id];
    return task.payouts[_role][_token];
  }

  function claimPayout(uint _id, uint _role, address _token) public
  taskAccepted(_id)
  {
    Task storage task = tasks[_id];
    require(task.roles[_role] == msg.sender);
    uint payout = task.payouts[_role][_token];
    task.payouts[_role][_token] = 0;
    task.totalPayouts[_token] = sub(task.totalPayouts[_token], payout);
    pots[task.potId].balance[_token] = sub(pots[task.potId].balance[_token], payout);
    nonRewardPotsTotal[_token] = sub(nonRewardPotsTotal[_token], payout);
    uint fee = payout / getFeeInverse();
    uint remainder = sub(payout, fee);
    if (_token == 0x0) {
      // Payout ether
      task.roles[_role].transfer(remainder);
      // Fee goes directly to Common Colony
      IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
      address commonColonyAddress = colonyNetworkContract.getColony("Common Colony");
      commonColonyAddress.transfer(fee);
    } else {
      // Payout token
      // TODO: If it's a whitelisted token, it goes straight to the commonColony
      // If it's any other token, goes to the colonyNetwork contract first to be auctioned.
      ERC20Extended payoutToken = ERC20Extended(_token);
      payoutToken.transfer(task.roles[_role], remainder);
      payoutToken.transfer(colonyNetworkAddress, fee);
    }
  }

  function getPotBalance(uint256 _potId, address _token) public view returns (uint256) {
    return pots[_potId].balance[_token];
  }

  function moveFundsBetweenPots(uint _fromPot, uint _toPot, uint _amount, address _token) public
  auth
  {
    // Prevent people moving funds from the pot for paying out token holders
    require(_fromPot > 0);
    require(_toPot <= potCount); // Only allow sending to created pots
    if (pots[_fromPot].taskId > 0) {
      Task storage task = tasks[pots[_fromPot].taskId];
      require(task.accepted == false || task.totalPayouts[_token] == 0);
      // i.e. if this pot is associated with a task, prevent money being taken from the pot if the task
      // has been accepted, unless everyone has been paid out.
    }
    // TODO: At some point, funds have to be unable to be removed from tasks (until everyone's been paid and
    // extra funds can be reclaimed)
    assert(pots[_fromPot].balance[_token] >= _amount); // TODO do we need this? we're using safemath...
    uint fromPotPreviousAmount = pots[_fromPot].balance[_token];
    uint toPotPreviousAmount = pots[_toPot].balance[_token];
    pots[_fromPot].balance[_token] = sub(fromPotPreviousAmount, _amount);
    pots[_toPot].balance[_token] = add(toPotPreviousAmount, _amount);
    uint fromTaskId = pots[_fromPot].taskId;
    uint toTaskId = pots[_toPot].taskId;
    updateTaskPayoutsWeCannotMakeAfterPotChange(toTaskId, _token, toPotPreviousAmount);
    updateTaskPayoutsWeCannotMakeAfterPotChange(fromTaskId, _token, fromPotPreviousAmount);
  }

  function claimColonyFunds(address _token) public {
    uint toClaim;
    uint feeToPay;
    uint remainder;
    if (_token == 0x0) {
      // It's ether
      toClaim = sub(sub(address(this).balance, nonRewardPotsTotal[_token]), pots[0].balance[_token]);
    } else {
      // Assume it's an ERC 20 token.
      ERC20Extended targetToken = ERC20Extended(_token);
      toClaim = sub(sub(targetToken.balanceOf(this), nonRewardPotsTotal[_token]), pots[0].balance[_token]);
    }
    feeToPay = toClaim / getRewardInverse();
    if (token == _token) { // Well this line isn't easy to understand
      // Basically, if we're using our own tokens, then we don't siphon off a chunk for rewards
      feeToPay = 0;
    }
    remainder = sub(toClaim, feeToPay);
    nonRewardPotsTotal[_token] = add(nonRewardPotsTotal[_token], remainder);
    pots[1].balance[_token] = add(pots[1].balance[_token], remainder);
    pots[0].balance[_token] = add(pots[0].balance[_token], feeToPay);
  }

  function getFeeInverse() public pure returns (uint) {
    // Return 1 / the fee to pay to the network.
    // e.g. if the fee is 1% (or 0.01), return 100
    // TODO: refer to ColonyNetwork
    return 100;
  }

  function getRewardInverse() public pure returns (uint) {
    // Return 1 / the reward to pay out from revenue.
    // e.g. if the fee is 1% (or 0.01), return 100
    // TODO: Make settable by colony
    return 100;
  }

  function initialiseColony(address _address) public {
    require (colonyNetworkAddress==0x0);
    colonyNetworkAddress = _address;
    potCount = 1;
  }

  function mintTokens(uint128 _wad) public
  auth
  {
    return token.mint(_wad);
  }

}
