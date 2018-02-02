/*
  This file is part of The Colony Network.

  The Colony Network is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  The Colony Network is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with The Colony Network. If not, see <http://www.gnu.org/licenses/>.
*/

pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";

import "../lib/dappsys/math.sol";
import "./IColonyNetwork.sol";
import "./ColonyStorage.sol";
import "./IColony.sol";
import "./SafeMath.sol";


contract ColonyTask is ColonyStorage, DSMath {
  uint8 constant MANAGER = 0;
  uint8 constant EVALUATOR = 1;
  uint8 constant WORKER = 2;

  uint256 constant RATING_COMMIT_TIMEOUT = 432000;
  uint256 constant RATING_REVEAL_TIMEOUT = 432000;

  event TaskAdded(uint256 indexed id);

  modifier skillExists(uint256 _skillId){
    IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
    require(_skillId < colonyNetworkContract.getSkillCount());
    _;
  }

  modifier confirmTaskRoleIdentity(uint256 _id, uint8 _role) {
    Role storage role = tasks[_id].roles[_role];
    require(msg.sender == role.user);
    _;
  }

  modifier userCanRateRole(uint256 _id, uint8 _role) {
    // Manager rated by worker
    // Worker rated by evaluator
    if (_role == MANAGER) {
      require(tasks[_id].roles[WORKER].user == msg.sender);
    } else if (_role == WORKER) {
      require(tasks[_id].roles[EVALUATOR].user == msg.sender);
    } else {
      revert();
    }
    _;    
  }

  modifier ratingSecretDoesNotExist(uint256 _id, uint8 _role) {
    require(taskWorkRatings[_id].secret[_role] == "");
    _;
  }

  modifier workNotSubmitted(uint256 _id) {
    require(tasks[_id].deliverableTimestamp == 0);
    _;
  }

  modifier beforeDueDate(uint256 _id) {
    require(tasks[_id].dueDate >= now);
    _;
  }

  modifier taskWorkRatingCommitOpen(uint256 _id) {
    RatingSecrets storage ratingSecrets = taskWorkRatings[_id];
    require(ratingSecrets.count < 2);

    // Check we are either past the due date or work has already been submitted
    uint taskCompletionTime = tasks[_id].deliverableTimestamp != 0 ? tasks[_id].deliverableTimestamp : tasks[_id].dueDate;
    require(taskCompletionTime > 0 && taskCompletionTime <= now);

    // Check we are within 5 days of the work submission time
    require(sub(now, taskCompletionTime) <= RATING_COMMIT_TIMEOUT);
    _;
  }

  modifier taskWorkRatingRevealOpen(uint256 _id) {
    RatingSecrets storage ratingSecrets = taskWorkRatings[_id];
    require(ratingSecrets.count <= 2);
    
    // If both ratings have been received, start the reveal period from the time of the last rating commit
    // Otherwise start the reveal period after the commit period has expired
    // In both cases, keep reveal period open for 5 days
    if (ratingSecrets.count == 2) {
      require(sub(now, ratingSecrets.timestamp) <= RATING_REVEAL_TIMEOUT);
    } else if (ratingSecrets.count < 2) {
      uint taskCompletionTime = tasks[_id].deliverableTimestamp != 0 ? tasks[_id].deliverableTimestamp : tasks[_id].dueDate;
      require(sub(now, taskCompletionTime) > RATING_COMMIT_TIMEOUT);
      require(sub(now, taskCompletionTime) <= add(RATING_COMMIT_TIMEOUT, RATING_REVEAL_TIMEOUT));
    }
    _;
  }

  modifier taskWorkRatingsClosed(uint256 _id) {
    uint taskCompletionTime = tasks[_id].deliverableTimestamp != 0 ? tasks[_id].deliverableTimestamp : tasks[_id].dueDate;
    require(sub(now, taskCompletionTime) > add(RATING_COMMIT_TIMEOUT, RATING_REVEAL_TIMEOUT)); // More than 10 days from work submission have passed
    _;
  }

  modifier taskWorkRatingsAssigned(uint256 _id) {
    require(tasks[_id].roles[WORKER].rated);
    require(tasks[_id].roles[MANAGER].rated);
    _;
  }

  function makeTask(bytes32 _specificationHash) public
  auth
  {
    taskCount += 1;
    potCount += 1;
    uint[] memory _skillIds = new uint[](1);
    
    tasks[taskCount] = Task({
      specificationHash: _specificationHash,
      deliverableHash: "",
      finalized: false,
      cancelled: false,
      dueDate: 0,
      payoutsWeCannotMake: 0,
      potId: potCount,
      deliverableTimestamp: 0,
      domainId: 0,
      skillIds: _skillIds
    });

    tasks[taskCount].roles[MANAGER] = Role({
      user: msg.sender,
      rated: false,
      rating: 0
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
    require(task.roles[_role].user == msg.sender);
    require(!task.finalized);

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
    require(task.roles[_role].user == msg.sender);
    require(!task.finalized);

    uint8[2] storage _reviewers = reviewers[sig];
    require(_reviewers[0] != 0 || _reviewers[1] != 0);
    require(_reviewers[0] == _role || _reviewers[1] == _role);

    IColony(this).confirmTransaction(_transactionId, _role);
  }

  function submitTaskWorkRating(uint _id, uint8 _role, bytes32 _ratingSecret) public 
  userCanRateRole(_id, _role)
  ratingSecretDoesNotExist(_id, _role)
  taskWorkRatingCommitOpen(_id)
  {
    RatingSecrets storage ratingSecrets = taskWorkRatings[_id];
    ratingSecrets.count += 1;
    ratingSecrets.timestamp = now;
    ratingSecrets.secret[_role] = _ratingSecret;
  }

  function revealTaskWorkRating(uint _id, uint8 _role, uint8 _rating, bytes32 _salt) public 
  taskWorkRatingRevealOpen(_id)
  {
    bytes32 ratingSecret = generateSecret(_salt, _rating);
    require(ratingSecret == taskWorkRatings[_id].secret[_role]);
    
    Role storage role = tasks[_id].roles[_role];
    role.rated = true;
    role.rating = _rating;
  }

  // In the event of a user not committing or revealing within the 10 day rating window, 
  // their rating of their counterpart is assumed to be the highest possible 
  // and their own rating is decreased by 5 (e.g. 0.5 points)
  function assignWorkRating(uint _id) public
  taskWorkRatingsClosed(_id)
  {
    Role storage managerRole = tasks[_id].roles[MANAGER];
    Role storage workerRole = tasks[_id].roles[WORKER];

    if (!workerRole.rated) {
      workerRole.rated = true;
      workerRole.rating = 50;
    }

    if (!managerRole.rated) {
      managerRole.rated = true;
      managerRole.rating = 50;
      workerRole.rating = (workerRole.rating > 5) ? (workerRole.rating - 5) : 0;
    }
  }

  function generateSecret(bytes32 _salt, uint256 _value) public pure returns (bytes32) {
    return keccak256(_salt, _value);
  }

  function getTaskWorkRatings(uint _id) public view returns (uint256, uint256) {
    return (taskWorkRatings[_id].count, taskWorkRatings[_id].timestamp);
  }

  function getTaskWorkRatingSecret(uint _id, uint8 _role) public view returns (bytes32) {
    return taskWorkRatings[_id].secret[_role];
  }

  // TODO: Restrict function visibility to whoever submits the approved Transaction from Client
  // Note task assignment is agreed off-chain
  function setTaskRoleUser(uint256 _id, uint8 _role, address _user) public
  taskExists(_id)
  taskNotFinalized(_id)
  {
    tasks[_id].roles[_role] = Role({
      user: _user,
      rated: false,
      rating: 0
    });
  }

  // TODO: Restrict function visibility to whoever submits the approved Transaction from Client
  // Maybe just the administrator is adequate for the skill?
  function setTaskSkill(uint _id, uint _skillId) public
  taskExists(_id)
  taskNotFinalized(_id)
  skillExists(_skillId)
  {
    tasks[_id].skillIds[0] = _skillId;
  }

  function setTaskBrief(uint256 _id, bytes32 _specificationHash) public
  self()
  taskExists(_id)
  taskNotFinalized(_id)
  {
    tasks[_id].specificationHash = _specificationHash;
  }

  function setTaskDueDate(uint256 _id, uint256 _dueDate) public
  self()
  taskExists(_id)
  taskNotFinalized(_id)
  {
    tasks[_id].dueDate = _dueDate;
  }

  function submitTaskDeliverable(uint256 _id, bytes32 _deliverableHash) public
  taskExists(_id)
  taskNotFinalized(_id)
  beforeDueDate(_id)
  workNotSubmitted(_id)
  confirmTaskRoleIdentity(_id, WORKER)
  {
    tasks[_id].deliverableHash = _deliverableHash;
    tasks[_id].deliverableTimestamp = now;
  }

  function finalizeTask(uint256 _id) public
  auth
  taskExists(_id)
  taskWorkRatingsAssigned(_id)
  taskNotFinalized(_id)
  {
    Task storage task = tasks[_id];
    Role storage managerRole = task.roles[MANAGER];
    Role storage workerRole = task.roles[WORKER];

    task.finalized = true;

    IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
    uint skillId = task.skillIds[0];

    uint managerPayout = task.payouts[MANAGER][token];
    uint workerPayout = task.payouts[WORKER][token];

    // NOTE: Ratings are already 10 multiplied because of the requirement to support 0.5 subtraction of rating values
    // NOTE: reputation change amount is hereby limited to MAXINT/50
    int managerReputation = SafeMath.mulInt(int(managerPayout), (int(managerRole.rating)*2 - 50)) / 50;
    //TODO: Change the skillId to represent the task domain
    colonyNetworkContract.appendReputationUpdateLog(managerRole.user, managerReputation, skillId);

    // NOTE: reputation change amount is hereby limited to MAXINT/30
    int workerReputation = SafeMath.mulInt(int(workerPayout), (int(workerRole.rating)*2 - 50)) / 30;
    colonyNetworkContract.appendReputationUpdateLog(workerRole.user, workerReputation, skillId);
    // TODO Reputation changes for other relevant roles, domains.
  }

  function cancelTask(uint256 _id) public
  auth
  taskExists(_id)
  taskNotFinalized(_id)
  {
    tasks[_id].cancelled = true;
  }

  function getTask(uint256 _id) public view
  returns (bytes32, bytes32, bool, bool, uint, uint, uint, uint, uint)
  {
    Task storage t = tasks[_id];
    return (t.specificationHash, t.deliverableHash, t.finalized, t.cancelled, t.dueDate, t.payoutsWeCannotMake, t.potId, t.deliverableTimestamp, t.domainId);
  }

  function getTaskRole(uint _id, uint8 _role) public view returns (address, bool, uint8) {
    Role storage role = tasks[_id].roles[_role];
    return (role.user, role.rated, role.rating);
  }

  // Get the function signature and task id from the transaction bytes data
  // Note: Relies on the encoded function's first parameter to be the uint256 taskId
  function deconstructCall(bytes _data) internal pure returns (bytes4 sig, uint256 taskId) {
    assembly {
      sig := mload(add(_data, 0x20))
      taskId := mload(add(_data, add(0x20, 4))) // same as calldataload(72)
    }
  }
}
