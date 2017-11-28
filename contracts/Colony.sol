pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";

import "../lib/dappsys/auth.sol";
import "../lib/dappsys/math.sol";
import "./ERC20Extended.sol";
import "./IColony.sol";
import "./IColonyNetwork.sol";
import "./TransactionReviewer.sol";


contract Colony is DSAuth, DSMath, TransactionReviewer {
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
    bool accepted;
    bool cancelled;
    uint dueDate;
    uint payoutsWeCannotMake;
    uint potId;
    uint domainId;
    address[] roles; // index mapping 0 => manager, 1 => evaluator, 2 => worker, 3.. => other roles
    uint[] skillIds;

    // Maps a token to the sum of all payouts of it for this task
    mapping (address => uint) totalPayouts;
    // Maps task role ids (0,1,2..) to a token amount to be paid on task completion
    mapping (uint => mapping (address => uint)) payouts;
  }

  struct Pot {
    mapping (address => uint) balance;
    uint taskId;
  }

  modifier taskExists(uint256 _id) {
    require(_id <= taskCount);
    _;
  }

  modifier taskNotAccepted(uint256 _id) {
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

  modifier skillExists(uint256 _skillId){
    IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
    require(_skillId < colonyNetworkContract.skillCount());
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
    uint[] memory _skillIds = new uint[](1);

    _roles[0] = msg.sender;
    tasks[taskCount] = Task({
      ipfsDecodedHash: _ipfsDecodedHash,
      roles: _roles,
      accepted: false,
      cancelled: false,
      dueDate: 0,
      payoutsWeCannotMake: 0,
      potId: potCount,
      domainId: 0,
      skillIds: _skillIds
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
  taskExists(_id)
  taskNotAccepted(_id)
  {
    tasks[_id].roles[1] = _evaluator;
  }

  // TODO: Restrict function visibility to whoever submits the approved Transaction from Client
  // Note task assignment is agreed off-chain
  function setTaskWorker(uint256 _id, address _worker) public
  taskExists(_id)
  taskNotAccepted(_id)
  {
    tasks[_id].roles[2] = _worker;
  }

  // TODO: Restrict function visibility to whoever submits the approved Transaction from Client
  // Maybe just the administrator is adequate for the skill?
  function setTaskSkill(uint _id, uint _skillId) public
  taskExists(_id)
  taskNotAccepted(_id)
  skillExists(_skillId)
  {
    tasks[_id].skillIds[0] = _skillId;
  }

  function setTaskBrief(uint256 _id, bytes32 _ipfsDecodedHash) public
  self()
  taskExists(_id)
  taskNotAccepted(_id)
  {
    tasks[_id].ipfsDecodedHash = _ipfsDecodedHash;
  }

  function setTaskDueDate(uint256 _id, uint256 _dueDate) public
  self()
  taskExists(_id)
  taskNotAccepted(_id)
  {
    tasks[_id].dueDate = _dueDate;
  }


  function acceptTask(uint256 _id) public
  auth
  taskExists(_id)
  taskNotAccepted(_id)
  {
    tasks[_id].accepted = true;
    IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
    Task storage task = tasks[_id];
    uint skillId = task.skillIds[0];
    int sign = _id % 2 == 0 ? -1 : int8(1); // TODO: Remove this hack to allow us to test -ve reputation change
    int reputationChange = 10 * sign; // TODO: Replace with actual reputation change
    colonyNetworkContract.appendReputationUpdateLog(tasks[_id].roles[2], reputationChange, skillId);
    // TODO Reputation changes for other relevant roles, domains.
  }

  function cancelTask(uint256 _id) public
  auth
  taskExists(_id)
  taskNotAccepted(_id)
  {
    tasks[_id].cancelled = true;
  }

  function getTaskRolesCount(uint _id) public view
  returns (uint rolesCount)
  {
    address[] storage _roles = tasks[_id].roles;
    rolesCount = _roles.length;
  }

  function getTaskRoleAddress (uint _id, uint _role) public view
  returns (address)
  {
    return tasks[_id].roles[_role];
  }


  function initialiseColony(address _address) public {
    require(colonyNetworkAddress == 0x0);
    colonyNetworkAddress = _address;
    potCount = 1;

    // Initialise the task update reviewers
    setFunctionReviewers(0xda4db249, 0, 2); // setTaskBrief => manager, worker
    setFunctionReviewers(0xcae960fe, 0, 2); // setTaskDueDate => manager, worker
    setFunctionReviewers(0xbe2320af, 0, 2); // setTaskPayout => manager, worker
  }

  function mintTokens(uint128 _wad) public
  auth
  {
    return token.mint(_wad);
  }

  function addSkill(uint _parentSkillId) public {
    // TODO Secure this function.
    IColonyNetwork colonyNetwork = IColonyNetwork(colonyNetworkAddress);
    return colonyNetwork.addSkill(_parentSkillId);
  }
}
