pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";

import "./IColonyNetwork.sol";
import "./ColonyStorage.sol";
import "./IColony.sol";


contract ColonyTask is ColonyStorage {
  event TaskAdded(uint256 indexed id);

  modifier skillExists(uint256 _skillId){
    IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
    require(_skillId < colonyNetworkContract.getSkillCount());
    _;
  }

  function makeTask(bytes32 _specificationHash) public
  auth
  {
    taskCount += 1;
    potCount += 1;
    address[] memory _roles = new address[](3);
    uint[] memory _skillIds = new uint[](1);

    _roles[0] = msg.sender;
    tasks[taskCount] = Task({
      specificationHash: _specificationHash,
      deliverableHash: "",
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
    TaskAdded(taskCount);
  }

  function getTaskCount() public view returns (uint) {
    return taskCount;
  }

  function proposeTaskChange(bytes _data, uint _value, uint8 _role) public returns (uint transactionId) {
    var (sig, taskId) = deconstructCall(_data);

    Task storage task = tasks[taskId];
    require(task.roles[_role] == msg.sender);
    require(!task.accepted);

    uint8[2] storage _reviewers = reviewers[sig];
    require(_reviewers[0] != 0 || _reviewers[1] != 0);
    require(_reviewers[0] == _role || _reviewers[1] == _role);

    transactionId = IColony(this).submitTransaction(_data, _value, _role);
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

    IColony(this).confirmTransaction(_transactionId, _role);
  }

  // Get the function signature and task id from the transaction bytes data
  // Note: Relies on the encoded function's first parameter to be the uint256 taskId
  function deconstructCall(bytes _data) internal returns (bytes4 sig, uint256 taskId) {
    assembly {
      sig := mload(add(_data, 0x20))
      taskId := mload(add(_data, add(0x20, 4))) // same as calldataload(72)
    }
  }

  // TODO: Once the due date has passed or the worker has made their submission, the evaluator may rate the work
  // TODO: Once three days have elapsed, no more objections or disputes can be raised.
  // TODO: In the event of a user not committing or revealing within a reasonable time,
  // their rating of their counterpart is assumed to be the highest possible and they receive a mildly negative rating
  function submitTaskWorkRating(uint _id, uint8 _role, bytes32 _ratingSecret) public 
  confirmTaskRoleIdentity(_id, _role)
  {
    taskWorkRatings[_id][_role] = _ratingSecret;
  }

  // TODO: Maybe refactor the setTaskEvaluator and setTaskWorker into the same function. 

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

  function setTaskBrief(uint256 _id, bytes32 _specificationHash) public
  self()
  taskExists(_id)
  taskNotAccepted(_id)
  {
    tasks[_id].specificationHash = _specificationHash;
  }

  function setTaskDueDate(uint256 _id, uint256 _dueDate) public
  self()
  taskExists(_id)
  taskNotAccepted(_id)
  {
    tasks[_id].dueDate = _dueDate;
  }

  function setTaskDeliverable(uint256 _id, bytes32 _deliverableHash) public
  taskExists(_id)
  taskNotAccepted(_id)
  onlyTaskWorker(_id)
  {
    tasks[_id].deliverableHash = _deliverableHash;
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

  function getTask(uint256 _id) public view
  returns (bytes32, bytes32, bool, bool, uint, uint, uint, uint)
  {
    Task storage t = tasks[_id];
    return (t.specificationHash, t.deliverableHash, t.accepted, t.cancelled, t.dueDate, t.payoutsWeCannotMake, t.potId, t.domainId);
  }

  function getTaskRolesCount(uint _id) public view
  returns (uint rolesCount)
  {
    address[] storage _roles = tasks[_id].roles;
    rolesCount = _roles.length;
  }

  function getTaskRoleAddress (uint _id, uint8 _role) public view
  returns (address)
  {
    return tasks[_id].roles[_role];
  }

  function getTaskWorkRating(uint _id, uint8 _role) public view 
  returns (bytes32)
  {
    return taskWorkRatings[_id][_role];
  }
}
