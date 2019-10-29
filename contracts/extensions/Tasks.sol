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

pragma solidity 0.5.8;
pragma experimental ABIEncoderV2;

import "../../lib/dappsys/math.sol";
import "./../ColonyDataTypes.sol";
import "./../ColonyAuthority.sol";
import "./../IColony.sol";
import "./../IColonyNetwork.sol";


contract Tasks is DSMath {
  uint256 constant RATING_COMMIT_TIMEOUT = 5 days;
  uint256 constant RATING_REVEAL_TIMEOUT = 5 days;

  /// @notice Event logged when a new task is added
  /// @param taskId The newly added task id
  event TaskAdded(uint256 taskId);

  /// @notice Event logged when a task's specification hash changes
  /// @param taskId Id of the task
  /// @param specificationHash New specification hash of the task
  event TaskBriefSet(uint256 indexed taskId, bytes32 specificationHash);

  /// @notice Event logged when a task's due date changes
  /// @param taskId Id of the task
  /// @param dueDate New due date of the task
  event TaskDueDateSet(uint256 indexed taskId, uint256 dueDate);

  /// @notice Event logged when a deliverable has been submitted for a task
  /// @param taskId Id of the task
  /// @param deliverableHash Hash of the work performed
  event TaskDeliverableSubmitted(uint256 indexed taskId, bytes32 deliverableHash);

  /// @notice Event logged when a task has been completed. This is either because the dueDate has passed
  /// and the manager closed the task, or the worker has submitted the deliverable. In the
  /// latter case, TaskDeliverableSubmitted will also be emitted.
  event TaskCompleted(uint256 indexed taskId);

  /// @notice Event logged when the rating of a role was revealed
  /// @param taskId Id of the task
  /// @param role Role that got rated
  /// @param rating Rating the role received
  event TaskWorkRatingRevealed(uint256 indexed taskId, TaskRole indexed role, uint8 rating);

  enum TaskRatings { None, Unsatisfactory, Satisfactory, Excellent }
  enum TaskRole { Manager, Evaluator, Worker }

  struct Task {
    uint256 expenditureId;
    bytes32 specificationHash;
    bytes32 deliverableHash;
    uint256 dueDate;
    uint256 completionTimestamp;
    uint256 changeNonce;
  }

  struct Role {
    bool rateFail;
    TaskRatings rating;
  }

  struct RatingSecrets {
    uint256 count;
    uint256 timestamp;
    mapping (uint8 => bytes32) secret;
  }

  uint256 taskCount;
  mapping (uint256 => Task) tasks;
  mapping (uint256 => mapping (uint8 => Role)) taskRoles;
  mapping (uint256 => RatingSecrets) ratingSecrets;

  // Role assignment functions require special type of sign-off.
  // This keeps track of which functions are related to role assignment
  mapping (bytes4 => bool) roleAssignmentSigs;
  // Mapping function signature to 2 task roles whose approval is needed to execute
  mapping (bytes4 => TaskRole[2]) reviewers;

  IColony colony;

  constructor(address _colony) public {
    colony = IColony(_colony);

    roleAssignmentSigs[bytes4(keccak256("setTaskManagerRole(uint256,address,uint256,uint256)"))] = true;
    roleAssignmentSigs[bytes4(keccak256("setTaskEvaluatorRole(uint256,address)"))] = true;
    roleAssignmentSigs[bytes4(keccak256("setTaskWorkerRole(uint256,address)"))] = true;

    // Initialise the task update reviewers
    reviewers[bytes4(keccak256("setTaskBrief(uint256,bytes32)"))] = [TaskRole.Manager, TaskRole.Worker];
    reviewers[bytes4(keccak256("setTaskDueDate(uint256,uint256)"))] = [TaskRole.Manager, TaskRole.Worker];
    reviewers[bytes4(keccak256("setTaskSkill(uint256,uint256)"))] = [TaskRole.Manager, TaskRole.Worker];
    // We are setting a manager to both reviewers, but it will require just one signature from manager
    reviewers[bytes4(keccak256("setTaskManagerPayout(uint256,address,uint256)"))] = [TaskRole.Manager, TaskRole.Manager];
    reviewers[bytes4(keccak256("setTaskEvaluatorPayout(uint256,address,uint256)"))] = [TaskRole.Manager, TaskRole.Evaluator];
    reviewers[bytes4(keccak256("setTaskWorkerPayout(uint256,address,uint256)"))] = [TaskRole.Manager, TaskRole.Worker];
    reviewers[bytes4(keccak256("removeTaskEvaluatorRole(uint256)"))] = [TaskRole.Manager, TaskRole.Evaluator];
    reviewers[bytes4(keccak256("removeTaskWorkerRole(uint256)"))] = [TaskRole.Manager, TaskRole.Worker];
    reviewers[bytes4(keccak256("cancelTask(uint256)"))] = [TaskRole.Manager, TaskRole.Worker];
  }

  modifier self() {
    require(address(this) == msg.sender, "colony-task-not-self");
    _;
  }

  modifier isAdmin(address _user, uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId) {
    ColonyDataTypes.ColonyRole admin = ColonyDataTypes.ColonyRole.Administration;
    require(colony.hasInheritedUserRole(_user, _permissionDomainId, admin, _childSkillIndex, _domainId), "colony-task-not-admin");
    _;
  }

  modifier taskExists(uint256 _id) {
    require(_id > 0 && _id <= taskCount, "colony-task-does-not-exist");
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

  modifier confirmTaskRoleIdentity(uint256 _id, address _user, TaskRole _role) {
    require(msg.sender == getTaskRoleUser(_id, _role), "colony-task-role-identity-mismatch");
    _;
  }

  function executeTaskChange(
    uint8[] memory _sigV,
    bytes32[] memory _sigR,
    bytes32[] memory _sigS,
    uint8[] memory _mode,
    uint256 _value,
    bytes memory _data
  )
    public
  {
    require(_value == 0, "colony-task-change-non-zero-value");
    require(_sigR.length == _sigS.length && _sigR.length == _sigV.length, "colony-task-change-signatures-count-do-not-match");

    bytes4 sig;
    uint256 taskId;
    (sig, taskId) = deconstructCall(_data);
    require(taskId > 0 && taskId <= taskCount, "colony-task-does-not-exist");
    require(!roleAssignmentSigs[sig], "colony-task-change-is-role-assignment");

    ColonyDataTypes.ExpenditureStatus status = colony.getExpenditure(tasks[taskId].expenditureId).status;
    require(status != ColonyDataTypes.ExpenditureStatus.Finalized, "colony-task-finalized");

    uint8 nSignaturesRequired;
    address taskRole1User = getTaskRoleUser(taskId, TaskRole(reviewers[sig][0]));
    address taskRole2User = getTaskRoleUser(taskId, TaskRole(reviewers[sig][1]));
    if (taskRole1User == address(0) || taskRole2User == address(0)) {
      // When one of the roles is not set, allow the other one to execute a change with just their signature
      nSignaturesRequired = 1;
    } else if (taskRole1User == taskRole2User) {
      // We support roles being assumed by the same user, in this case, allow them to execute a change with just their signature
      nSignaturesRequired = 1;
    } else {
      nSignaturesRequired = 2;
    }
    require(_sigR.length == nSignaturesRequired, "colony-task-change-does-not-meet-signatures-required");

    bytes32 msgHash = keccak256(abi.encodePacked(address(this), address(this), _value, _data, tasks[taskId].changeNonce));
    address[] memory reviewerAddresses = getReviewerAddresses(_sigV, _sigR, _sigS, _mode, msgHash);

    require(
      reviewerAddresses[0] == taskRole1User || reviewerAddresses[0] == taskRole2User,
      "colony-task-signatures-do-not-match-reviewer-1"
    );

    if (nSignaturesRequired == 2) {
      require(reviewerAddresses[0] != reviewerAddresses[1], "colony-task-duplicate-reviewers");
      require(
        reviewerAddresses[1] == taskRole1User || reviewerAddresses[1] == taskRole2User,
        "colony-task-signatures-do-not-match-reviewer-2"
      );
    }

    tasks[taskId].changeNonce += 1;
    require(executeCall(address(this), _value, _data), "colony-task-change-execution-failed");
  }

  function executeTaskRoleAssignment(
    uint8[] memory _sigV,
    bytes32[] memory _sigR,
    bytes32[] memory _sigS,
    uint8[] memory _mode,
    uint256 _value,
    bytes memory _data
  )
    public
  {
    require(_value == 0, "colony-task-role-assignment-non-zero-value");
    require(_sigR.length == _sigS.length && _sigR.length == _sigV.length, "colony-task-role-assignment-signatures-count-do-not-match");

    bytes4 sig;
    uint256 taskId;
    address userAddress;
    (sig, taskId, userAddress) = deconstructRoleChangeCall(_data);
    require(taskId > 0 && taskId <= taskCount, "colony-task-does-not-exist");
    require(roleAssignmentSigs[sig], "colony-task-change-is-not-role-assignment");

    ColonyDataTypes.ExpenditureStatus status = colony.getExpenditure(tasks[taskId].expenditureId).status;
    require(status != ColonyDataTypes.ExpenditureStatus.Finalized, "colony-task-finalized");

    uint8 nSignaturesRequired;
    address manager = getTaskRoleUser(taskId, TaskRole.Manager);
    // If manager wants to set himself to a role
    if (userAddress == manager) {
      nSignaturesRequired = 1;
    } else {
      nSignaturesRequired = 2;
    }
    require(_sigR.length == nSignaturesRequired, "colony-task-role-assignment-does-not-meet-required-signatures");

    bytes32 msgHash = keccak256(abi.encodePacked(address(this), address(this), _value, _data, tasks[taskId].changeNonce));
    address[] memory reviewerAddresses = getReviewerAddresses(_sigV, _sigR, _sigS, _mode, msgHash);

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
      require(
        userAddress == reviewerAddresses[0] || userAddress == reviewerAddresses[1],
        "colony-task-role-assignment-not-signed-by-new-user-for-role"
      );
      // Require that signatures are not from the same address
      // This will never throw, because we require that manager is one of the signers,
      // and if manager is both signers, then `userAddress` must also be a manager, and if
      // `userAddress` is a manager, then we require 1 signature (will be kept for possible future changes)
      require(reviewerAddresses[0] != reviewerAddresses[1], "colony-task-role-assignment-duplicate-signatures");
    }

    tasks[taskId].changeNonce += 1;
    require(executeCall(address(this), _value, _data), "colony-task-role-assignment-execution-failed");
  }

  // Permissions pertain to the Administration role here
  function makeTask(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _callerPermissionDomainId,
    uint256 _callerChildSkillIndex,
    bytes32 _specificationHash,
    uint256 _domainId,
    uint256 _skillId,
    uint256 _dueDate
  )
    public
    isAdmin(msg.sender, _callerPermissionDomainId, _callerChildSkillIndex, _domainId)
  {
    uint256 expenditureId = colony.makeExpenditure(_permissionDomainId, _childSkillIndex, _domainId);

    taskCount += 1;
    tasks[taskCount].expenditureId = expenditureId;
    tasks[taskCount].specificationHash = _specificationHash;
    tasks[taskCount].dueDate = (_dueDate > 0) ? _dueDate : now + 90 days; // Note: can set dueDate in past?

    setTaskRoleUser(taskCount, TaskRole.Manager, msg.sender);
    setTaskRoleUser(taskCount, TaskRole.Evaluator, msg.sender);

    if (_skillId > 0) {
      this.setTaskSkill(taskCount, _skillId);
    }

    emit TaskAdded(taskCount);
    emit TaskDueDateSet(taskCount, tasks[taskCount].dueDate);
  }

  function submitTaskWorkRating(uint256 _id, TaskRole _role, bytes32 _secret)
    public
    taskComplete(_id)
  {
    if (_role == TaskRole.Manager) { // Manager rated by worker
      require(msg.sender == getTaskRoleUser(_id, TaskRole.Worker), "colony-user-cannot-rate-task-manager");
    } else if (_role == TaskRole.Worker) { // Worker rated by evaluator
      require(msg.sender == getTaskRoleUser(_id, TaskRole.Evaluator), "colony-user-cannot-rate-task-worker");
    } else {
      revert("colony-unsupported-role-to-rate");
    }

    require(sub(now, tasks[_id].completionTimestamp) <= RATING_COMMIT_TIMEOUT, "colony-task-rating-secret-submit-period-closed");
    require(ratingSecrets[_id].secret[uint8(_role)] == "", "colony-task-rating-secret-already-exists");

    ratingSecrets[_id].count += 1;
    ratingSecrets[_id].timestamp = now;
    ratingSecrets[_id].secret[uint8(_role)] = _secret;
  }

  function revealTaskWorkRating(uint256 _id, TaskRole _role, uint8 _rating, bytes32 _salt)
    public
  {
    assert(ratingSecrets[_id].count <= 2);

    // If both ratings have been received, start the reveal period from the time of the last rating commit
    // Otherwise start the reveal period after the commit period has expired
    // In both cases, keep reveal period open for 5 days
    if (ratingSecrets[_id].count == 2) {
      require(sub(now, ratingSecrets[_id].timestamp) <= RATING_REVEAL_TIMEOUT, "colony-task-rating-secret-reveal-period-closed");
    } else {
      uint taskCompletionTime = tasks[_id].completionTimestamp;
      require(sub(now, taskCompletionTime) > RATING_COMMIT_TIMEOUT, "colony-task-rating-secret-reveal-period-not-open");
      require(sub(now, taskCompletionTime) <= add(RATING_COMMIT_TIMEOUT, RATING_REVEAL_TIMEOUT), "colony-task-rating-secret-reveal-period-closed");
    }

    bytes32 secret = generateSecret(_salt, _rating);
    require(secret == ratingSecrets[_id].secret[uint8(_role)], "colony-task-rating-secret-mismatch");

    TaskRatings rating = TaskRatings(_rating);
    require(rating != TaskRatings.None, "colony-task-rating-missing");
    taskRoles[_id][uint8(_role)].rating = rating;

    emit TaskWorkRatingRevealed(_id, _role, _rating);
  }

  function generateSecret(bytes32 _salt, uint256 _value) public pure returns (bytes32) {
    return keccak256(abi.encodePacked(_salt, _value));
  }

  function getTaskWorkRatingSecretsInfo(uint256 _id) public view returns (uint256, uint256) {
    return (ratingSecrets[_id].count, ratingSecrets[_id].timestamp);
  }

  function getTaskWorkRatingSecret(uint256 _id, uint8 _role) public view returns (bytes32) {
    return ratingSecrets[_id].secret[_role];
  }

  // Note: the domain permissions arguments are placed at the end for consistency with the other role change functions
  function setTaskManagerRole(uint256 _id, address payable _user, uint256 _permissionDomainId, uint256 _childSkillIndex)
    public
    self
    isAdmin(_user, _permissionDomainId, _childSkillIndex, colony.getExpenditure(tasks[_id].expenditureId).domainId)
  {
    setTaskRoleUser(_id, TaskRole.Manager, _user);
  }

  function setTaskEvaluatorRole(uint256 _id, address payable _user) public self {
    // Can only assign role if no one is currently assigned to it
    require(getTaskRoleUser(_id, TaskRole.Evaluator) == address(0x0), "colony-task-evaluator-role-already-assigned");
    setTaskRoleUser(_id, TaskRole.Evaluator, _user);
  }

  function setTaskWorkerRole(uint256 _id, address payable _user) public self {
    // Can only assign role if no one is currently assigned to it
    require(getTaskRoleUser(_id, TaskRole.Worker) == address(0x0), "colony-task-worker-role-already-assigned");
    uint256[] memory skills = colony.getExpenditureSlot(tasks[_id].expenditureId, uint256(TaskRole.Worker)).skills;
    require(skills[0] > 0, "colony-task-skill-not-set"); // ignore-swc-110
    setTaskRoleUser(_id, TaskRole.Worker, _user);
  }

  function removeTaskEvaluatorRole(uint256 _id) public self {
    setTaskRoleUser(_id, TaskRole.Evaluator, address(0x0));
  }

  function removeTaskWorkerRole(uint256 _id) public self {
    setTaskRoleUser(_id, TaskRole.Worker, address(0x0));
  }

  function setTaskManagerPayout(uint256 _id, address _token, uint256 _amount) public self {
    colony.setExpenditurePayout(_id, uint256(TaskRole.Manager), _token, _amount);
  }

  function setTaskEvaluatorPayout(uint256 _id, address _token, uint256 _amount) public self {
    colony.setExpenditurePayout(_id, uint256(TaskRole.Evaluator), _token, _amount);
  }

  function setTaskWorkerPayout(uint256 _id, address _token, uint256 _amount) public self {
    colony.setExpenditurePayout(_id, uint256(TaskRole.Worker), _token, _amount);
  }

  function setAllTaskPayouts(
    uint256 _id,
    address _token,
    uint256 _managerAmount,
    uint256 _evaluatorAmount,
    uint256 _workerAmount
  )
    public
    confirmTaskRoleIdentity(_id, msg.sender, TaskRole.Manager)
  {

    address manager = getTaskRoleUser(_id, TaskRole.Manager);
    address evaluator = getTaskRoleUser(_id, TaskRole.Evaluator);
    address worker = getTaskRoleUser(_id, TaskRole.Worker);

    require(evaluator == manager || evaluator == address(0x0), "colony-funding-evaluator-already-set");
    require(worker == manager || worker == address(0x0), "colony-funding-worker-already-set");

    this.setTaskManagerPayout(_id, _token, _managerAmount);
    this.setTaskEvaluatorPayout(_id, _token, _evaluatorAmount);
    this.setTaskWorkerPayout(_id, _token, _workerAmount);
  }

  function setTaskSkill(uint256 _id, uint256 _skillId) public self {
    colony.setExpenditureSkill(tasks[_id].expenditureId, uint256(TaskRole.Worker), _skillId);
  }

  function setTaskBrief(uint256 _id, bytes32 _specificationHash)
    public
    self
    taskExists(_id)
    taskNotComplete(_id)
  {
    tasks[_id].specificationHash = _specificationHash;

    emit TaskBriefSet(_id, _specificationHash);
  }

  function setTaskDueDate(uint256 _id, uint256 _dueDate)
    public
    self
    taskExists(_id)
    taskNotComplete(_id)
  {
    tasks[_id].dueDate = _dueDate;

    emit TaskDueDateSet(_id, _dueDate);
  }

  function submitTaskDeliverable(uint256 _id, bytes32 _deliverableHash)
    public
    taskExists(_id)
    taskNotComplete(_id)
    confirmTaskRoleIdentity(_id, msg.sender, TaskRole.Worker)
  {
    tasks[_id].deliverableHash = _deliverableHash;
    tasks[_id].completionTimestamp = now;

    emit TaskDeliverableSubmitted(_id, _deliverableHash);
    emit TaskCompleted(_id);
  }

  function submitTaskDeliverableAndRating(uint256 _id, bytes32 _deliverableHash, bytes32 _secret) public {
    submitTaskDeliverable(_id, _deliverableHash);
    submitTaskWorkRating(_id, TaskRole.Manager, _secret);
  }

  function completeTask(uint256 _id)
    public
    taskExists(_id)
    taskNotComplete(_id)
    confirmTaskRoleIdentity(_id, msg.sender, TaskRole.Manager)
  {
    require(now >= tasks[_id].dueDate, "colony-task-due-date-in-future");
    tasks[_id].completionTimestamp = now;

    emit TaskCompleted(_id);
  }

  function cancelTask(uint256 _id)
    public
    self
    taskExists(_id)
    taskNotComplete(_id)
  {
    colony.cancelExpenditure(tasks[_id].expenditureId);
  }

  // Permissions pertain to the Arbitration role here
  function finalizeTask(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id)
    public
    taskExists(_id)
    taskComplete(_id)
  {
    colony.finalizeExpenditure(tasks[_id].expenditureId);

    assignWorkRatings(_id);

    for (uint8 roleId = 0; roleId <= 2; roleId++) {
      Role storage role = taskRoles[_id][roleId];
      assert(role.rating != TaskRatings.None);

      // Emit reputation penalty if unsatisfactory
      if (role.rating == TaskRatings.Unsatisfactory) {
        emitReputationPenalty(_permissionDomainId, _childSkillIndex, _id, roleId);
      }

      // Set payout modifier in all cases
      setPayoutModifier(_permissionDomainId, _childSkillIndex, _id, roleId);
    }
  }

  function getTaskCount() public view returns (uint256) {
    return taskCount;
  }

  function getTaskChangeNonce(uint256 _id) public view returns (uint256) {
    return tasks[_id].changeNonce;
  }

  function getTask(uint256 _id) public view returns (Task memory task) {
    task = tasks[_id];
  }

  function getTaskRole(uint256 _id, uint8 _role) public view returns (Role memory role) {
    role = taskRoles[_id][_role];
  }

  function getTaskRoleUser(uint256 _id, TaskRole _role) public view returns (address) {
    return colony.getExpenditureSlot(tasks[_id].expenditureId, uint256(_role)).recipient;
  }

  function emitReputationPenalty(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id, uint8 _roleId) internal {
    Role storage role = taskRoles[_id][_roleId];
    assert(role.rating == TaskRatings.Unsatisfactory);

    address user = getTaskRoleUser(_id, TaskRole(_roleId));
    address token = colony.getToken();
    uint256 payout = colony.getExpenditureSlotPayout(tasks[_id].expenditureId, uint256(_roleId), token);
    int256 reputation = -int256(add(mul(payout, 2), role.rateFail ? payout : 0) / 2);

    uint256 domainId = colony.getExpenditure(tasks[_id].expenditureId).domainId;
    colony.emitDomainReputationPenalty(_permissionDomainId, _childSkillIndex, domainId, user, reputation);

    // We do not penalise skill reputation if the worker did not rate -- calculate it again without the penalty.
    if (TaskRole(_roleId) == TaskRole.Worker) {
      uint256[] memory skills = colony.getExpenditureSlot(tasks[_id].expenditureId, uint256(_roleId)).skills;
      int256 reputationPerSkill = -int256(payout / max(skills.length, 1));

      for (uint i = 0; i < skills.length; i += 1) {
        colony.emitSkillReputationPenalty(_permissionDomainId, skills[i], user, reputationPerSkill);
      }
    }
  }

  function setPayoutModifier(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _id,
    uint8 _roleId
  )
    internal
  {
    Role storage role = taskRoles[_id][_roleId];
    uint256 payoutScalar;

    if (role.rating == TaskRatings.Satisfactory || role.rating == TaskRatings.Excellent) {
      payoutScalar = (role.rating == TaskRatings.Excellent) ? 3 : 2;
      payoutScalar -= role.rateFail ? 1 : 0;
      payoutScalar *= WAD / 2;
    }

    int256 payoutModifier = int256(payoutScalar) - int256(WAD);
    colony.setExpenditurePayoutModifier(_permissionDomainId, _childSkillIndex, tasks[_id].expenditureId, uint256(_roleId), payoutModifier);
  }

  function getReviewerAddresses(
    uint8[] memory _sigV,
    bytes32[] memory _sigR,
    bytes32[] memory _sigS,
    uint8[] memory _mode,
    bytes32 msgHash
  )
    internal
    pure
    returns (address[] memory)
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
  function executeCall(address to, uint256 value, bytes memory data) internal returns (bool success) {
    assembly {
      success := call(gas, to, value, add(data, 0x20), mload(data), 0, 0)
    }
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
    Role storage workerRole = taskRoles[_id][uint8(TaskRole.Worker)];
    Role storage managerRole = taskRoles[_id][uint8(TaskRole.Manager)];
    return (workerRole.rating != TaskRatings.None) && (managerRole.rating != TaskRatings.None);
  }

  function taskWorkRatingsClosed(uint256 _id) internal view returns (bool) {
    assert(tasks[_id].completionTimestamp > 0);
    assert(ratingSecrets[_id].count <= 2);
    if (ratingSecrets[_id].count == 2) {
      return sub(now, ratingSecrets[_id].timestamp) > RATING_REVEAL_TIMEOUT;
    } else {
      return sub(now, tasks[_id].completionTimestamp) > add(RATING_COMMIT_TIMEOUT, RATING_REVEAL_TIMEOUT);
    }
  }

  function assignWorkRatings(uint256 _id) internal {
    require(taskWorkRatingsAssigned(_id) || taskWorkRatingsClosed(_id), "colony-task-ratings-not-closed");

    // In the event of a user not committing/revealing within the rating window,
    // their rating of their counterpart is assumed to be the maximum
    // and they will receive a (payout/2) reputation penalty

    Role storage managerRole = taskRoles[_id][uint8(TaskRole.Manager)];
    Role storage workerRole = taskRoles[_id][uint8(TaskRole.Worker)];
    Role storage evaluatorRole = taskRoles[_id][uint8(TaskRole.Evaluator)];

    if (workerRole.rating == TaskRatings.None) {
      evaluatorRole.rating = TaskRatings.Unsatisfactory;
      evaluatorRole.rateFail = true;
      workerRole.rating = TaskRatings.Excellent;
    } else {
      evaluatorRole.rating = TaskRatings.Satisfactory;
    }

    if (managerRole.rating == TaskRatings.None) {
      workerRole.rateFail = true;
      managerRole.rating = TaskRatings.Excellent;
    }
  }

  function setTaskRoleUser(uint256 _id, TaskRole _role, address payable _user)
    private
    taskExists(_id)
    taskNotComplete(_id)
  {
    taskRoles[_id][uint8(_role)] = Role({
      rateFail: false,
      rating: TaskRatings.None
    });

    colony.setExpenditureRecipient(tasks[_id].expenditureId, uint256(_role), _user);
  }
}
