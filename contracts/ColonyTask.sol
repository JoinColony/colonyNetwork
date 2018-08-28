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

pragma solidity ^0.4.23;
pragma experimental "v0.5.0";

import "./ColonyStorage.sol";
import "./SafeMath.sol";


contract ColonyTask is ColonyStorage {
  uint256 constant RATING_COMMIT_TIMEOUT = 432000;
  uint256 constant RATING_REVEAL_TIMEOUT = 432000;

  event TaskAdded(uint256 indexed id);
  event TaskBriefChanged(uint256 indexed id, bytes32 specificationHash);
  event TaskDueDateChanged(uint256 indexed id, uint256 dueDate);
  event TaskDomainChanged(uint256 indexed id, uint256 domainId);
  event TaskSkillChanged(uint256 indexed id, uint256 skillId);
  event TaskRoleUserChanged(uint256 indexed id, uint8 role, address user);
  event TaskDeliverableSubmitted(uint256 indexed id, bytes32 deliverableHash);
  event TaskWorkRatingRevealed(uint256 indexed id, uint8 role, uint8 rating);
  event TaskFinalized(uint256 indexed id);
  event TaskCanceled(uint256 indexed id);
  event TaskCompleted(uint256 indexed id);

  modifier userCanRateRole(uint256 _id, uint8 _role) {
    // Manager rated by worker
    // Worker rated by evaluator
    if (_role == MANAGER) {
      require(tasks[_id].roles[WORKER].user == msg.sender, "colony-user-cannot-rate-task-manager");
    } else if (_role == WORKER) {
      require(tasks[_id].roles[EVALUATOR].user == msg.sender, "colony-user-cannot-rate-task-worker");
    } else {
      revert("colony-unsupported-role-to-rate");
    }
    _;
  }

  modifier ratingSecretDoesNotExist(uint256 _id, uint8 _role) {
    require(taskWorkRatings[_id].secret[_role] == "", "colony-task-rating-secret-already-exists");
    _;
  }

  modifier beforeDueDate(uint256 _id) {
    require(tasks[_id].dueDate >= now, "colony-task-due-date-passed");
    _;
  }

  modifier taskComplete(uint256 _id) {
    require(tasks[_id].completionTimestamp > 0, "colony-task-not-complete");
    _;
  }

  modifier taskNotComplete(uint256 _id) {
    require(tasks[_id].completionTimestamp == 0, "colony-task-complete");
    _;
  }

  modifier afterDueDate(uint256 _id) {
    uint dueDate = tasks[_id].dueDate;
    require(dueDate > 0, "colony-task-due-date-not-set");
    require(now >= dueDate, "colony-task-due-date-in-future");
    _;
  }

  modifier taskWorkRatingCommitOpen(uint256 _id) {
    RatingSecrets storage ratingSecrets = taskWorkRatings[_id];
    require(ratingSecrets.count < 2, "colony-task-rating-all-secrets-submitted");

    uint taskCompletionTime = tasks[_id].completionTimestamp;

    // Check we are within 5 days of the work submission time
    require(sub(now, taskCompletionTime) <= RATING_COMMIT_TIMEOUT, "colony-task-rating-secret-submit-period-closed");
    _;
  }

  modifier taskWorkRatingRevealOpen(uint256 _id) {
    RatingSecrets storage ratingSecrets = taskWorkRatings[_id];
    require(ratingSecrets.count <= 2, "colony-task-rating-more-secrets-submitted-than-expected");

    // If both ratings have been received, start the reveal period from the time of the last rating commit
    // Otherwise start the reveal period after the commit period has expired
    // In both cases, keep reveal period open for 5 days
    if (ratingSecrets.count == 2) {
      require(sub(now, ratingSecrets.timestamp) <= RATING_REVEAL_TIMEOUT, "colony-task-rating-secret-reveal-period-closed");
    } else if (ratingSecrets.count < 2) {
      uint taskCompletionTime = tasks[_id].completionTimestamp;
      require(sub(now, taskCompletionTime) > RATING_COMMIT_TIMEOUT, "colony-task-rating-secret-reveal-period-not-open");
      require(sub(now, taskCompletionTime) <= add(RATING_COMMIT_TIMEOUT, RATING_REVEAL_TIMEOUT), "colony-task-rating-secret-reveal-period-closed");
    }
    _;
  }

  modifier taskWorkRatingsComplete(uint256 _id) {
    require(taskWorkRatingsAssigned(_id) || taskWorkRatingsClosed(_id), "colony-task-ratings-incomplete");
    _;
  }

  function makeTask(bytes32 _specificationHash, uint256 _domainId, uint256 _skillId, uint256 _dueDate) public
  stoppable
  auth
  domainExists(_domainId)
  {
    taskCount += 1;
    potCount += 1;

    Task memory task;
    task.specificationHash = _specificationHash;
    task.potId = potCount;
    task.domainId = _domainId;
    task.skills = new uint256[](1);
    tasks[taskCount] = task;
    tasks[taskCount].roles[MANAGER].user = msg.sender;
    tasks[taskCount].roles[EVALUATOR].user = msg.sender;
    pots[potCount].taskId = taskCount;

    emit PotAdded(potCount);
    emit TaskAdded(taskCount);

    if (_skillId > 0) {
      this.setTaskSkill(taskCount, _skillId);
    }

    if (_dueDate > 0) {
      this.setTaskDueDate(taskCount, _dueDate);
    }

  }

  function getTaskCount() public view returns (uint256) {
    return taskCount;
  }

  function getTaskChangeNonce(uint256 _id) public view returns (uint256) {
    return taskChangeNonces[_id];
  }

  function executeTaskChange(
    uint8[] _sigV,
    bytes32[] _sigR,
    bytes32[] _sigS,
    uint8[] _mode,
    uint256 _value,
    bytes _data) public stoppable
  {
    require(_value == 0, "colony-task-change-non-zero-value");
    require(_sigR.length == _sigS.length && _sigR.length == _sigV.length, "colony-task-change-signatures-count-do-not-match");

    bytes4 sig;
    uint256 taskId;
    (sig, taskId) = deconstructCall(_data);
    require(taskId <= taskCount, "colony-task-does-not-exist");
    require(tasks[taskId].status != FINALIZED, "colony-task-finalized");
    require(!roleAssignmentSigs[sig], "colony-task-change-is-role-assignement");

    uint8 nSignaturesRequired;
    if (tasks[taskId].roles[reviewers[sig][0]].user == address(0) || tasks[taskId].roles[reviewers[sig][1]].user == address(0)) {
      // When one of the roles is not set, allow the other one to execute a change with just their signature
      nSignaturesRequired = 1;
    } else if (tasks[taskId].roles[reviewers[sig][0]].user == tasks[taskId].roles[reviewers[sig][1]].user) {
      // We support roles being assumed by the same user, in this case, allow them to execute a change with just their signature
      nSignaturesRequired = 1;
    } else {
      nSignaturesRequired = 2;
    }

    require(_sigR.length == nSignaturesRequired, "colony-task-change-does-not-meet-signatures-required");

    bytes32 msgHash = keccak256(abi.encodePacked(address(this), address(this), _value, _data, taskChangeNonces[taskId]));
    address[] memory reviewerAddresses = getReviewerAddresses(
      _sigV,
      _sigR,
      _sigS,
      _mode,
      msgHash
    );

    require(
      reviewerAddresses[0] == tasks[taskId].roles[reviewers[sig][0]].user ||
      reviewerAddresses[0] == tasks[taskId].roles[reviewers[sig][1]].user,
      "colony-task-signatures-do-not-match-reviewer-1"
    );

    if (nSignaturesRequired == 2) {
      require(reviewerAddresses[0] != reviewerAddresses[1], "colony-task-duplicate-reviewers");
      require(
        reviewerAddresses[1] == tasks[taskId].roles[reviewers[sig][0]].user ||
        reviewerAddresses[1] == tasks[taskId].roles[reviewers[sig][1]].user,
        "colony-task-signatures-do-not-match-reviewer-2"
      );
    }

    taskChangeNonces[taskId]++;
    require(executeCall(address(this), _value, _data), "colony-task-change-execution-failed");
  }

  function executeTaskRoleAssignment(
    uint8[] _sigV,
    bytes32[] _sigR,
    bytes32[] _sigS,
    uint8[] _mode,
    uint256 _value,
    bytes _data) public stoppable
  {
    require(_value == 0, "colony-task-role-assignment-non-zero-value");
    require(_sigR.length == _sigS.length && _sigR.length == _sigV.length, "colony-task-role-assignment-signatures-count-do-not-match");

    bytes4 sig;
    uint256 taskId;
    address userAddress;
    (sig, taskId, userAddress) = deconstructRoleChangeCall(_data);

    require(roleAssignmentSigs[sig], "colony-task-change-is-not-role-assignement");

    uint8 nSignaturesRequired;
    // If manager wants to set himself to a role
    if (userAddress == tasks[taskId].roles[MANAGER].user) {
      nSignaturesRequired = 1;
    } else {
      nSignaturesRequired = 2;
    }
    require(_sigR.length == nSignaturesRequired, "colony-task-role-assignment-does-not-meet-required-signatures");

    bytes32 msgHash = keccak256(abi.encodePacked(address(this), address(this), _value, _data, taskChangeNonces[taskId]));
    address[] memory reviewerAddresses = getReviewerAddresses(
      _sigV,
      _sigR,
      _sigS,
      _mode,
      msgHash
    );

    if (nSignaturesRequired == 1) {
      // Since we want to set a manager as an evaluator, require just manager's signature
      require(reviewerAddresses[0] == tasks[taskId].roles[MANAGER].user, "colony-task-role-assignment-not-signed-by-manager");
    } else {
      // One of signers must be a manager
      require(
        reviewerAddresses[0] == tasks[taskId].roles[MANAGER].user ||
        reviewerAddresses[1] == tasks[taskId].roles[MANAGER].user,
        "colony-task-role-assignment-not-signed-by-manager"
      );
      // One of the signers must be an address we want to set here
      require(userAddress == reviewerAddresses[0] || userAddress == reviewerAddresses[1], "colony-task-role-assignment-not-signed-by-new-user-for-role");
      // Require that signatures are not from the same address
      // This will never throw, because we require that manager is one of the signers,
      // and if manager is both signers, then `userAddress` must also be a manager, and if
      // `userAddress` is a manager, then we require 1 signature (will be kept for possible future changes)
      require(reviewerAddresses[0] != reviewerAddresses[1], "colony-task-role-assignment-duplicate-signatures");
    }

    taskChangeNonces[taskId]++;
    require(executeCall(address(this), _value, _data), "colony-task-role-assignment-execution-failed");
  }

  function submitTaskWorkRating(uint256 _id, uint8 _role, bytes32 _ratingSecret) public
  stoppable
  taskExists(_id)
  taskComplete(_id)
  userCanRateRole(_id, _role)
  ratingSecretDoesNotExist(_id, _role)
  taskWorkRatingCommitOpen(_id)
  {
    RatingSecrets storage ratingSecrets = taskWorkRatings[_id];
    ratingSecrets.count += 1;
    ratingSecrets.timestamp = now;
    ratingSecrets.secret[_role] = _ratingSecret;
  }

  function revealTaskWorkRating(uint256 _id, uint8 _role, uint8 _rating, bytes32 _salt) public
  stoppable
  taskWorkRatingRevealOpen(_id)
  {
    // MAYBE: we should hash these the other way around, i.e. generateSecret(_rating, _salt)
    bytes32 ratingSecret = generateSecret(_salt, _rating);
    require(ratingSecret == taskWorkRatings[_id].secret[_role], "colony-task-rating-secret-mismatch");

    TaskRatings rating = TaskRatings(_rating);
    require(rating != TaskRatings.None, "colony-task-rating-missing");
    tasks[_id].roles[_role].rating = rating;

    emit TaskWorkRatingRevealed(_id, _role, _rating);
  }

  function generateSecret(bytes32 _salt, uint256 _value) public pure returns (bytes32) {
    return keccak256(abi.encodePacked(_salt, _value));
  }

  function getTaskWorkRatings(uint256 _id) public view returns (uint256, uint256) {
    return (taskWorkRatings[_id].count, taskWorkRatings[_id].timestamp);
  }

  function getTaskWorkRatingSecret(uint256 _id, uint8 _role) public view returns (bytes32) {
    return taskWorkRatings[_id].secret[_role];
  }

  function setTaskManagerRole(uint256 _id, address _user) public
  stoppable
  self()
  isAdmin(_user)
  {
    setTaskRoleUser(_id, MANAGER, _user);
  }

  function setTaskEvaluatorRole(uint256 _id, address _user) public stoppable self {
    // Can only assign role if no one is currently assigned to it
    require(tasks[_id].roles[EVALUATOR].user == 0x0, "colony-task-evaluator-role-already-assigned");
    setTaskRoleUser(_id, EVALUATOR, _user);
  }

  function setTaskWorkerRole(uint256 _id, address _user) public stoppable self {
    // Can only assign role if no one is currently assigned to it
    require(tasks[_id].roles[WORKER].user == 0x0, "colony-task-worker-role-already-assigned");
    setTaskRoleUser(_id, WORKER, _user);
  }

  function removeTaskEvaluatorRole(uint256 _id) public stoppable self {
    setTaskRoleUser(_id, EVALUATOR, 0x0);
  }

  function removeTaskWorkerRole(uint256 _id) public stoppable self {
    setTaskRoleUser(_id, WORKER, 0x0);
  }

  function setTaskDomain(uint256 _id, uint256 _domainId) public
  stoppable
  taskExists(_id)
  taskNotFinalized(_id)
  domainExists(_domainId)
  confirmTaskRoleIdentity(_id, MANAGER)
  {
    tasks[_id].domainId = _domainId;

    emit TaskDomainChanged(_id, _domainId);
  }

  function setTaskSkill(uint256 _id, uint256 _skillId) public
  stoppable
  taskExists(_id)
  taskNotFinalized(_id)
  skillExists(_skillId)
  globalSkill(_skillId)
  self()
  {
    tasks[_id].skills[0] = _skillId;

    emit TaskSkillChanged(_id, _skillId);
  }

  function setTaskBrief(uint256 _id, bytes32 _specificationHash) public
  stoppable
  taskExists(_id)
  taskNotFinalized(_id)
  self()
  {
    tasks[_id].specificationHash = _specificationHash;

    emit TaskBriefChanged(_id, _specificationHash);
  }

  function setTaskDueDate(uint256 _id, uint256 _dueDate) public
  stoppable
  taskExists(_id)
  taskNotFinalized(_id)
  self()
  {
    tasks[_id].dueDate = _dueDate;

    emit TaskDueDateChanged(_id, _dueDate);
  }

  function submitTaskDeliverable(uint256 _id, bytes32 _deliverableHash) public
  stoppable
  taskExists(_id)
  taskNotComplete(_id)
  confirmTaskRoleIdentity(_id, WORKER)
  {
    tasks[_id].deliverableHash = _deliverableHash;
    markTaskCompleted(_id);
    emit TaskDeliverableSubmitted(_id, _deliverableHash);
  }

  function submitTaskDeliverableAndRating(uint256 _id, bytes32 _deliverableHash, bytes32 _ratingSecret) public
  stoppable
  {
    submitTaskDeliverable(_id, _deliverableHash);
    submitTaskWorkRating(_id, MANAGER, _ratingSecret);
  }

  function completeTask(uint256 _id) public
  stoppable
  taskExists(_id)
  taskNotComplete(_id)
  afterDueDate(_id)
  confirmTaskRoleIdentity(_id, MANAGER)
  {
    markTaskCompleted(_id);
  }

  function finalizeTask(uint256 _id) public
  stoppable
  taskExists(_id)
  taskComplete(_id)
  taskWorkRatingsComplete(_id)
  taskNotFinalized(_id)
  {
    if (!taskWorkRatingsAssigned(_id)) {
      assignWorkRating(_id);
    }

    Task storage task = tasks[_id];
    task.status = FINALIZED;

    for (uint8 roleId = 0; roleId <= 2; roleId++) {
      updateReputation(roleId, task);
    }

    emit TaskFinalized(_id);
  }

  function cancelTask(uint256 _id) public
  stoppable
  auth
  taskExists(_id)
  taskNotFinalized(_id)
  {
    tasks[_id].status = CANCELLED;

    emit TaskCanceled(_id);
  }

  function getTask(uint256 _id) public view returns (bytes32, bytes32, uint8, uint256, uint256, uint256, uint256, uint256, uint256[]) {
    Task storage t = tasks[_id];
    return (
      t.specificationHash,
      t.deliverableHash,
      t.status,
      t.dueDate,
      t.payoutsWeCannotMake,
      t.potId,
      t.completionTimestamp,
      t.domainId,
      t.skills
    );
  }

  function getTaskRole(uint256 _id, uint8 _role) public view returns (address, bool, uint8) {
    Role storage role = tasks[_id].roles[_role];
    return (role.user, role.rateFail, uint8(role.rating));
  }

  function markTaskCompleted(uint256 _id) internal {
    tasks[_id].completionTimestamp = now;
    emit TaskCompleted(_id);
  }

  function updateReputation(uint8 roleId, Task storage task) internal {
    IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
    Role storage role = task.roles[roleId];

    if (roleId == EVALUATOR) { // They had one job!
      role.rating = role.rateFail ? TaskRatings.Unsatisfactory : TaskRatings.Satisfactory;
    }

    uint payout = task.payouts[roleId][token];
    int reputation = getReputation(int(payout), uint8(role.rating), role.rateFail);

    colonyNetworkContract.appendReputationUpdateLog(role.user, reputation, domains[task.domainId].skillId);
    if (roleId == WORKER) {
      colonyNetworkContract.appendReputationUpdateLog(role.user, reputation, task.skills[0]);
    }
  }

  function getReputation(int payout, uint8 rating, bool rateFail) internal pure returns(int reputation) {
    require(rating > 0 && rating <= 3, "colony-task-rating-invalid");

    // -1, 1, 1.5 multipliers, -0.5 penalty
    int8[3] memory ratingMultipliers = [-2, 2, 3];
    int8 ratingDivisor = 2;

    reputation = SafeMath.mulInt(payout, ratingMultipliers[rating - 1]);
    reputation = SafeMath.subInt(reputation, rateFail ? payout : 0); // Deduct penalty for not rating
    reputation /= ratingDivisor; // We may lose one atom of reputation here :sad:
  }

  function getReviewerAddresses(
    uint8[] _sigV,
    bytes32[] _sigR,
    bytes32[] _sigS,
    uint8[] _mode,
    bytes32 msgHash
  ) internal pure returns (address[])
  {
    address[] memory reviewerAddresses = new address[](_sigR.length);
    for (uint i = 0; i < _sigR.length; i++) {
      // 0 'Normal' mode - geth, etc.
      // >0 'Trezor' mode
      // Correct incantation helpfully cribbed from https://github.com/trezor/trezor-mcu/issues/163#issuecomment-368435292
      bytes32 txHash;
      if (_mode[i] == 0) {
        txHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash));
      } else {
        txHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n\x20", msgHash));
      }

      reviewerAddresses[i] = ecrecover(txHash, _sigV[i], _sigR[i], _sigS[i]);
    }
    return reviewerAddresses;
  }

  // The address.call() syntax is no longer recommended, see:
  // https://github.com/ethereum/solidity/issues/2884
  function executeCall(address to, uint256 value, bytes data) internal returns (bool success) {
    assembly {
      success := call(gas, to, value, add(data, 0x20), mload(data), 0, 0)
      }
  }

  // Get the function signature and task id from the transaction bytes data
  // Note: Relies on the encoded function's first parameter to be the uint256 taskId
  function deconstructCall(bytes _data) internal pure returns (bytes4 sig, uint256 taskId) {
    assembly {
      sig := mload(add(_data, 0x20))
      taskId := mload(add(_data, 0x24)) // same as calldataload(72)
    }
  }

  function deconstructRoleChangeCall(bytes _data) internal pure returns (bytes4 sig, uint256 taskId, address userAddress) {
    assembly {
      sig := mload(add(_data, 0x20))
      taskId := mload(add(_data, 0x24)) // same as calldataload(72)
      userAddress := mload(add(_data, 0x44))
    }
  }

  function taskWorkRatingsAssigned(uint256 _id) internal view returns (bool) {
    return (tasks[_id].roles[WORKER].rating != TaskRatings.None) && (tasks[_id].roles[MANAGER].rating != TaskRatings.None);
  }

  function taskWorkRatingsClosed(uint256 _id) internal view returns (bool) {
    // More than 10 days from completion have passed
    return (
      tasks[_id].completionTimestamp > 0 && // If this is zero, the task isn't complete yet!
      sub(now, tasks[_id].completionTimestamp) > add(RATING_COMMIT_TIMEOUT, RATING_REVEAL_TIMEOUT)
    );
  }

  // In the event of a user not committing or revealing within the 10 day rating window,
  // their rating of their counterpart is assumed to be the highest possible
  // and they will receive a reputation penalty
  function assignWorkRating(uint256 _id) internal {
    require(taskWorkRatingsClosed(_id), "colony-task-ratings-not-closed");

    Role storage managerRole = tasks[_id].roles[MANAGER];
    Role storage workerRole = tasks[_id].roles[WORKER];
    Role storage evaluatorRole = tasks[_id].roles[EVALUATOR];

    if (workerRole.rating == TaskRatings.None) {
      evaluatorRole.rateFail = true;
      workerRole.rating = TaskRatings.Excellent;
    }

    if (managerRole.rating == TaskRatings.None) {
      workerRole.rateFail = true;
      managerRole.rating = TaskRatings.Excellent;
    }
  }

  // TODO: Check if we are changing a role before due date and before work has been submitted
  function setTaskRoleUser(uint256 _id, uint8 _role, address _user) private
  taskExists(_id)
  taskNotFinalized(_id)
  {
    tasks[_id].roles[_role] = Role({
      user: _user,
      rateFail: false,
      rating: TaskRatings.None
    });

    emit TaskRoleUserChanged(_id, _role, _user);
  }
}
