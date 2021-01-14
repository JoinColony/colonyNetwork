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

pragma solidity 0.7.3;
pragma experimental "ABIEncoderV2";

import "./ColonyStorage.sol";


contract ColonyTask is ColonyStorage {
  uint256 constant RATING_COMMIT_TIMEOUT = 5 days;
  uint256 constant RATING_REVEAL_TIMEOUT = 5 days;

  modifier userCanRateRole(uint256 _id, TaskRole _role) {
    // Manager rated by worker
    // Worker rated by evaluator
    if (_role == TaskRole.Manager) {
      require(tasks[_id].roles[uint8(TaskRole.Worker)].user == msg.sender, "colony-user-cannot-rate-task-manager");
    } else if (_role == TaskRole.Worker) {
      require(tasks[_id].roles[uint8(TaskRole.Evaluator)].user == msg.sender, "colony-user-cannot-rate-task-worker");
    } else {
      revert("colony-unsupported-role-to-rate");
    }
    _;
  }

  modifier ratingSecretDoesNotExist(uint256 _id, TaskRole _role) {
    require(taskWorkRatings[_id].secret[uint8(_role)] == "", "colony-task-rating-secret-already-exists");
    _;
  }

  modifier afterDueDate(uint256 _id) {
    uint dueDate = tasks[_id].dueDate;
    /* require(dueDate > 0, "colony-task-due-date-not-set"); */
    require(block.timestamp >= dueDate, "colony-task-due-date-in-future");
    _;
  }

  modifier taskWorkRatingCommitOpen(uint256 _id) {
    RatingSecrets storage ratingSecrets = taskWorkRatings[_id];
    require(ratingSecrets.count < 2, "colony-task-rating-all-secrets-submitted");

    uint taskCompletionTime = tasks[_id].completionTimestamp;

    // Check we are within 5 days of the work submission time
    require(sub(block.timestamp, taskCompletionTime) <= RATING_COMMIT_TIMEOUT, "colony-task-rating-secret-submit-period-closed");
    _;
  }

  modifier taskWorkRatingRevealOpen(uint256 _id) {
    RatingSecrets storage ratingSecrets = taskWorkRatings[_id];
    require(ratingSecrets.count <= 2, "colony-task-rating-more-secrets-submitted-than-expected");

    // If both ratings have been received, start the reveal period from the time of the last rating commit
    // Otherwise start the reveal period after the commit period has expired
    // In both cases, keep reveal period open for 5 days
    if (ratingSecrets.count == 2) {
      require(sub(block.timestamp, ratingSecrets.timestamp) <= RATING_REVEAL_TIMEOUT, "colony-task-rating-secret-reveal-period-closed");
    } else if (ratingSecrets.count < 2) {
      uint taskCompletionTime = tasks[_id].completionTimestamp;
      require(sub(block.timestamp, taskCompletionTime) > RATING_COMMIT_TIMEOUT, "colony-task-rating-secret-reveal-period-not-open");
      require(sub(block.timestamp, taskCompletionTime) <= add(RATING_COMMIT_TIMEOUT, RATING_REVEAL_TIMEOUT), "colony-task-rating-secret-reveal-period-closed");
    }
    _;
  }

  modifier taskWorkRatingsComplete(uint256 _id) {
    require(taskWorkRatingsAssigned(_id) || taskWorkRatingsClosed(_id), "colony-task-ratings-incomplete");
    _;
  }

  modifier taskFunded(uint256 _id) {
    FundingPot storage fundingPot = fundingPots[tasks[_id].fundingPotId];
    require(fundingPot.payoutsWeCannotMake == 0, "colony-task-not-funded");
    _;
  }

  function makeTask(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    bytes32 _specificationHash,
    uint256 _domainId,
    uint256 _skillId,
    uint256 _dueDate
  ) public
  stoppable
  authDomain(_permissionDomainId, _childSkillIndex, _domainId)
  {
    taskCount += 1;

    fundingPotCount += 1;
    fundingPots[fundingPotCount].associatedType = FundingPotAssociatedType.Task;
    fundingPots[fundingPotCount].associatedTypeId = taskCount;

    tasks[taskCount].specificationHash = _specificationHash;
    tasks[taskCount].fundingPotId = fundingPotCount;
    tasks[taskCount].domainId = _domainId;
    tasks[taskCount].skills = new uint256[](1);
    tasks[taskCount].roles[uint8(TaskRole.Manager)].user = msg.sender;
    tasks[taskCount].roles[uint8(TaskRole.Evaluator)].user = msg.sender;

    if (_skillId > 0) {
      this.setTaskSkill(taskCount, _skillId);
    }

    uint256 dueDate = _dueDate;
    if (dueDate == 0) {
      // If / When restoring due date to optional status in the future, be sure to go uncomment the relevant line in `afterDueDate` that checks the
      // due date has been set.
      dueDate = block.timestamp + 90 days;
    }
    this.setTaskDueDate(taskCount, dueDate);

    emit FundingPotAdded(fundingPotCount);
    emit TaskAdded(msg.sender, taskCount);
  }

  function getTaskCount() public view returns (uint256) {
    return taskCount;
  }

  function getTaskChangeNonce(uint256 _id) public view returns (uint256) {
    return taskChangeNonces[_id];
  }

  function executeTaskChange(
    uint8[] memory _sigV,
    bytes32[] memory _sigR,
    bytes32[] memory _sigS,
    uint8[] memory _mode,
    uint256 _value,
    bytes memory _data) public stoppable
  {
    require(_value == 0, "colony-task-change-non-zero-value");
    require(_sigR.length == _sigS.length && _sigR.length == _sigV.length, "colony-task-change-signatures-count-do-not-match");

    bytes4 sig;
    uint256 taskId;
    (sig, taskId) = deconstructCall(_data);
    require(taskId > 0 && taskId <= taskCount, "colony-task-does-not-exist");
    require(tasks[taskId].status != TaskStatus.Finalized, "colony-task-finalized");
    require(!roleAssignmentSigs[sig], "colony-task-change-is-role-assignment");

    uint8 nSignaturesRequired;
    uint8 taskRole1 = uint8(reviewers[sig][0]);
    uint8 taskRole2 = uint8(reviewers[sig][1]);
    if (tasks[taskId].roles[taskRole1].user == address(0) || tasks[taskId].roles[taskRole2].user == address(0)) {
      // When one of the roles is not set, allow the other one to execute a change with just their signature
      nSignaturesRequired = 1;
    } else if (tasks[taskId].roles[taskRole1].user == tasks[taskId].roles[taskRole2].user) {
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
      reviewerAddresses[0] == tasks[taskId].roles[taskRole1].user ||
      reviewerAddresses[0] == tasks[taskId].roles[taskRole2].user,
      "colony-task-signatures-do-not-match-reviewer-1"
    );

    if (nSignaturesRequired == 2) {
      require(reviewerAddresses[0] != reviewerAddresses[1], "colony-task-duplicate-reviewers");
      require(
        reviewerAddresses[1] == tasks[taskId].roles[taskRole1].user ||
        reviewerAddresses[1] == tasks[taskId].roles[taskRole2].user,
        "colony-task-signatures-do-not-match-reviewer-2"
      );
    }

    taskChangeNonces[taskId]++;
    require(executeCall(address(this), _value, _data), "colony-task-change-execution-failed");

    emit TaskChangedViaSignatures(reviewerAddresses);
  }

  function executeTaskRoleAssignment(
    uint8[] memory _sigV,
    bytes32[] memory _sigR,
    bytes32[] memory _sigS,
    uint8[] memory _mode,
    uint256 _value,
    bytes memory _data) public stoppable
  {
    require(_value == 0, "colony-task-role-assignment-non-zero-value");
    require(_sigR.length == _sigS.length && _sigR.length == _sigV.length, "colony-task-role-assignment-signatures-count-do-not-match");

    bytes4 sig;
    uint256 taskId;
    address userAddress;
    (sig, taskId, userAddress) = deconstructRoleChangeCall(_data);

    require(roleAssignmentSigs[sig], "colony-task-change-is-not-role-assignment");

    uint8 nSignaturesRequired;
    address manager = tasks[taskId].roles[uint8(TaskRole.Manager)].user;
    // If manager wants to set himself to a role
    if (userAddress == manager) {
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
      require(reviewerAddresses[0] == manager, "colony-task-role-assignment-not-signed-by-manager");
    } else {
      // One of signers must be a manager
      require(
        reviewerAddresses[0] == manager ||
        reviewerAddresses[1] == manager,
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

    emit TaskChangedViaSignatures(reviewerAddresses);
  }

  function submitTaskWorkRating(uint256 _id, TaskRole _role, bytes32 _ratingSecret) public
  stoppable
  taskComplete(_id)
  userCanRateRole(_id, _role)
  ratingSecretDoesNotExist(_id, _role)
  taskWorkRatingCommitOpen(_id)
  {
    require(_ratingSecret != "", "colony-task-rating-secret-missing");
    RatingSecrets storage ratingSecrets = taskWorkRatings[_id];
    ratingSecrets.count += 1;
    ratingSecrets.timestamp = block.timestamp;
    ratingSecrets.secret[uint8(_role)] = _ratingSecret;
  }

  function revealTaskWorkRating(uint256 _id, TaskRole _role, uint8 _rating, bytes32 _salt) public
  stoppable
  taskWorkRatingRevealOpen(_id)
  {
    // MAYBE: we should hash these the other way around, i.e. generateSecret(_rating, _salt)
    bytes32 ratingSecret = generateSecret(_salt, _rating);
    require(ratingSecret == taskWorkRatings[_id].secret[uint8(_role)], "colony-task-rating-secret-mismatch");

    TaskRatings rating = TaskRatings(_rating);
    require(rating != TaskRatings.None, "colony-task-rating-missing");
    tasks[_id].roles[uint8(_role)].rating = rating;

    emit TaskWorkRatingRevealed(msg.sender, _id, _role, _rating);
  }

  function generateSecret(bytes32 _salt, uint256 _value) public pure returns (bytes32) {
    return keccak256(abi.encodePacked(_salt, _value));
  }

  function getTaskWorkRatingSecretsInfo(uint256 _id) public view returns (uint256, uint256) {
    return (taskWorkRatings[_id].count, taskWorkRatings[_id].timestamp);
  }

  function getTaskWorkRatingSecret(uint256 _id, uint8 _role) public view returns (bytes32) {
    return taskWorkRatings[_id].secret[_role];
  }

  function setTaskManagerRole(uint256 _id, address payable _user, uint256 _permissionDomainId, uint256 _childSkillIndex) public
  stoppable
  self()
  isAdmin(_permissionDomainId, _childSkillIndex, _id, _user)
  {
    setTaskRoleUser(_id, TaskRole.Manager, _user);
  }

  function setTaskEvaluatorRole(uint256 _id, address payable _user) public stoppable self {
    // Can only assign role if no one is currently assigned to it
    Role storage evaluatorRole = tasks[_id].roles[uint8(TaskRole.Evaluator)];
    require(evaluatorRole.user == address(0x0), "colony-task-evaluator-role-already-assigned");
    setTaskRoleUser(_id, TaskRole.Evaluator, _user);
  }

  function setTaskWorkerRole(uint256 _id, address payable _user) public stoppable self {
    // Can only assign role if no one is currently assigned to it
    Role storage workerRole = tasks[_id].roles[uint8(TaskRole.Worker)];
    require(workerRole.user == address(0x0), "colony-task-worker-role-already-assigned");
    require(tasks[_id].skills[0] > 0, "colony-task-skill-not-set"); // ignore-swc-110
    setTaskRoleUser(_id, TaskRole.Worker, _user);
  }

  function removeTaskEvaluatorRole(uint256 _id) public stoppable self {
    setTaskRoleUser(_id, TaskRole.Evaluator, address(0x0));
  }

  function removeTaskWorkerRole(uint256 _id) public stoppable self {
    setTaskRoleUser(_id, TaskRole.Worker, address(0x0));
  }

  function setTaskSkill(uint256 _id, uint256 _skillId) public
  stoppable
  taskExists(_id)
  skillExists(_skillId)
  taskNotComplete(_id)
  validGlobalSkill(_skillId)
  self()
  {
    tasks[_id].skills[0] = _skillId;
    // We only allow setting of the first skill here. If we allow more in the future, make sure to have a hard limit that comfortably limits
    // respondToChallenge's gas.
    emit TaskSkillSet(_id, _skillId);
  }

  function setTaskBrief(uint256 _id, bytes32 _specificationHash) public
  stoppable
  taskExists(_id)
  taskNotComplete(_id)
  self()
  {
    tasks[_id].specificationHash = _specificationHash;

    emit TaskBriefSet(_id, _specificationHash);
  }

  function setTaskDueDate(uint256 _id, uint256 _dueDate) public
  stoppable
  taskExists(_id)
  taskNotComplete(_id)
  self()
  {
    require (_dueDate > 0, "colony-task-due-date-cannot-be-zero");
    tasks[_id].dueDate = _dueDate;

    emit TaskDueDateSet(_id, _dueDate);
  }

  function submitTaskDeliverable(uint256 _id, bytes32 _deliverableHash) public
  stoppable
  taskExists(_id)
  taskNotComplete(_id)
  confirmTaskRoleIdentity(_id, TaskRole.Worker)
  {
    tasks[_id].deliverableHash = _deliverableHash;
    markTaskCompleted(_id);
    emit TaskDeliverableSubmitted(msg.sender, _id, _deliverableHash);
  }

  function submitTaskDeliverableAndRating(uint256 _id, bytes32 _deliverableHash, bytes32 _ratingSecret) public
  stoppable
  {
    submitTaskDeliverable(_id, _deliverableHash);
    submitTaskWorkRating(_id, TaskRole.Manager, _ratingSecret);
  }

  function completeTask(uint256 _id) public
  stoppable
  taskExists(_id)
  taskNotComplete(_id)
  afterDueDate(_id)
  confirmTaskRoleIdentity(_id, TaskRole.Manager)
  {
    markTaskCompleted(_id);
  }

  function finalizeTask(uint256 _id) public
  stoppable
  taskComplete(_id)
  taskWorkRatingsComplete(_id)
  taskFunded(_id)
  taskNotFinalized(_id)
  {
    if (!taskWorkRatingsAssigned(_id)) {
      assignWorkRating(_id);
    } else {
      // If worker has a rating, the evaluator did their job.
      Role storage evaluatorRole = tasks[_id].roles[uint8(TaskRole.Evaluator)];
      evaluatorRole.rating = TaskRatings.Satisfactory;
    }

    Task storage task = tasks[_id];
    task.status = TaskStatus.Finalized;

    for (uint8 roleId = 0; roleId <= 2; roleId++) {
      updateReputation(TaskRole(roleId), task);
    }

    emit TaskFinalized(msg.sender, _id);
  }

  function cancelTask(uint256 _id) public
  stoppable
  taskExists(_id)
  taskNotComplete(_id)
  self()
  {
    tasks[_id].status = TaskStatus.Cancelled;

    emit TaskCanceled(_id);
  }

  function getTask(uint256 _id) public view returns (
    bytes32,
    bytes32,
    TaskStatus,
    uint256,
    uint256,
    uint256,
    uint256,
    uint256[] memory)
  {
    Task storage t = tasks[_id];
    return (
      t.specificationHash,
      t.deliverableHash,
      t.status,
      t.dueDate,
      t.fundingPotId,
      t.completionTimestamp,
      t.domainId,
      t.skills
    );
  }

  function getTaskRole(uint256 _id, uint8 _role) public view returns (Role memory role) {
    role = tasks[_id].roles[_role];
  }

  function markTaskCompleted(uint256 _id) internal {
    tasks[_id].completionTimestamp = block.timestamp;
    emit TaskCompleted(msg.sender, _id);
  }

  function updateReputation(TaskRole taskRole, Task storage task) internal {
    IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
    uint8 roleId = uint8(taskRole);
    Role storage role = task.roles[roleId];

    uint256 payout = task.payouts[roleId][token];
    int256 reputation = getReputation(payout, role.rating, role.rateFail);

    colonyNetworkContract.appendReputationUpdateLog(role.user, reputation, domains[task.domainId].skillId);
    if (taskRole == TaskRole.Worker) {
      if (role.rateFail) {
        // If the worker failed to rate, we do not penalise the reputation being earned for the skill in
        // question, so recalculate it without the penalty.
        reputation = getReputation(payout, role.rating, false);
      }
      int256 nSkills = 0;
      for (uint i = 0; i < task.skills.length; i += 1) {
        if (task.skills[i] > 0 ) {
          nSkills += 1;
        }
      }

      assert(nSkills > 0);

      int256 reputationPerSkill = reputation / nSkills;

      for (uint i = 0; i < task.skills.length; i += 1) {
        if (task.skills[i] > 0) {
          colonyNetworkContract.appendReputationUpdateLog(role.user, reputationPerSkill, task.skills[i]);
        }
      }
    }
  }

  function getReputation(uint256 payout, TaskRatings rating, bool rateFail) internal pure returns (int256) {
    assert(rating != TaskRatings.None);

    bool negative = (rating == TaskRatings.Unsatisfactory);
    uint256 reputation = mul(payout, (rating == TaskRatings.Excellent) ? 3 : 2);

    if (rateFail) {
      reputation = negative ? add(reputation, payout) : sub(reputation, payout);
    }

    // We may lose one atom of reputation here :sad:
    return int256(reputation / 2) * (negative ? int256(-1) : int256(1));
  }

  function getReviewerAddresses(
    uint8[] memory _sigV,
    bytes32[] memory _sigR,
    bytes32[] memory _sigS,
    uint8[] memory _mode,
    bytes32 msgHash
  ) internal pure returns (address[] memory)
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

  // Get the function signature and task id from the transaction bytes data
  // Note: Relies on the encoded function's first parameter to be the uint256 taskId
  function deconstructCall(bytes memory _data) internal pure returns (bytes4 sig, uint256 taskId) {
    assembly {
      sig := mload(add(_data, 0x20))
      taskId := mload(add(_data, 0x24)) // same as calldataload(72)
    }
  }

  function deconstructRoleChangeCall(bytes memory _data) internal pure returns (bytes4 sig, uint256 taskId, address userAddress) {
    assembly {
      sig := mload(add(_data, 0x20))
      taskId := mload(add(_data, 0x24)) // same as calldataload(72)
      userAddress := mload(add(_data, 0x44))
    }
  }

  function taskWorkRatingsAssigned(uint256 _id) internal view returns (bool) {
    Role storage workerRole = tasks[_id].roles[uint8(TaskRole.Worker)];
    Role storage managerRole = tasks[_id].roles[uint8(TaskRole.Manager)];
    return (workerRole.rating != TaskRatings.None) && (managerRole.rating != TaskRatings.None);
  }

  function taskWorkRatingsClosed(uint256 _id) internal view returns (bool) {
    // More than 10 days from completion have passed
    return (
      tasks[_id].completionTimestamp > 0 && // If this is zero, the task isn't complete yet!
      sub(block.timestamp, tasks[_id].completionTimestamp) > add(RATING_COMMIT_TIMEOUT, RATING_REVEAL_TIMEOUT)
    );
  }

  // In the event of a user not committing or revealing within the 10 day rating window,
  // their rating of their counterpart is assumed to be the highest possible
  // and they will receive a reputation penalty
  function assignWorkRating(uint256 _id) internal {
    require(taskWorkRatingsClosed(_id), "colony-task-ratings-not-closed");

    Role storage managerRole = tasks[_id].roles[uint8(TaskRole.Manager)];
    Role storage workerRole = tasks[_id].roles[uint8(TaskRole.Worker)];
    Role storage evaluatorRole = tasks[_id].roles[uint8(TaskRole.Evaluator)];

    if (workerRole.rating == TaskRatings.None) {
      workerRole.rating = TaskRatings.Satisfactory;
      // The evaluator had one job!
      evaluatorRole.rateFail = true;
      evaluatorRole.rating = TaskRatings.Unsatisfactory;
    } else {
      evaluatorRole.rating = TaskRatings.Satisfactory;
    }

    if (managerRole.rating == TaskRatings.None) {
      workerRole.rateFail = true;
      managerRole.rating = TaskRatings.Satisfactory;
    }
  }

  function setTaskRoleUser(uint256 _id, TaskRole _role, address payable _user) private
  taskExists(_id)
  taskNotComplete(_id)
  {
    tasks[_id].roles[uint8(_role)] = Role({
      user: _user,
      rateFail: false,
      rating: TaskRatings.None
    });

    emit TaskRoleUserSet(_id, _role, _user);
  }
}
