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

import "../lib/dappsys/math.sol";
import "./IColonyNetwork.sol";
import "./ColonyStorage.sol";
import "./IColony.sol";
import "./SafeMath.sol";


contract ColonyTask is ColonyStorage, DSMath {
  uint256 constant RATING_COMMIT_TIMEOUT = 432000;
  uint256 constant RATING_REVEAL_TIMEOUT = 432000;

  event TaskAdded(uint256 indexed id);
  event TaskBriefChanged(uint256 indexed id, bytes32 specificationHash);
  event TaskDueDateChanged(uint256 indexed id, uint256 dueDate);
  event TaskDomainChanged(uint256 indexed id, uint256 domainId);
  event TaskSkillChanged(uint256 indexed id, uint256 skillId);
  event TaskRoleUserChanged(uint256 indexed id, uint8 role, address user);
  event TaskFinalized(uint256 indexed id);
  event TaskCanceled(uint256 indexed id);

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
    require(tasks[_id].roles[WORKER].rating != TaskRatings.None);
    require(tasks[_id].roles[MANAGER].rating != TaskRatings.None);
    _;
  }

  function makeTask(bytes32 _specificationHash, uint256 _domainId) public
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
    tasks[taskCount].roles[MANAGER] = Role({
      user: msg.sender,
      rateFail: false,
      rating: TaskRatings.None
    });

    pots[potCount].taskId = taskCount;

    emit TaskAdded(taskCount);
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
    bytes _data) public
  {
    require(_value == 0);
    require(_sigR.length == _sigS.length && _sigR.length == _sigV.length);

    bytes4 sig;
    uint256 taskId;
    (sig, taskId) = deconstructCall(_data);
    require(!tasks[taskId].finalized);

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
    
    require(_sigR.length == nSignaturesRequired);

    bytes32 msgHash = keccak256(abi.encodePacked(address(this), address(this), _value, _data, taskChangeNonces[taskId]));
    address[] memory reviewerAddresses = new address[](nSignaturesRequired);
    for (uint i = 0; i < nSignaturesRequired; i++) {
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

    require(reviewerAddresses[0] == tasks[taskId].roles[reviewers[sig][0]].user || reviewerAddresses[0] == tasks[taskId].roles[reviewers[sig][1]].user);
    
    if (nSignaturesRequired == 2) {
      require(reviewerAddresses[0] != reviewerAddresses[1]);
      require(reviewerAddresses[1] == tasks[taskId].roles[reviewers[sig][0]].user || reviewerAddresses[1] == tasks[taskId].roles[reviewers[sig][1]].user);
    }
    
    taskChangeNonces[taskId]++;
    require(executeCall(address(this), _value, _data));
  }

  // The address.call() syntax is no longer recommended, see:
  // https://github.com/ethereum/solidity/issues/2884
  function executeCall(address to, uint256 value, bytes data) internal returns (bool success) {
    assembly {
      success := call(gas, to, value, add(data, 0x20), mload(data), 0, 0)
      }
  }

  function submitTaskWorkRating(uint256 _id, uint8 _role, bytes32 _ratingSecret) public
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
  taskWorkRatingRevealOpen(_id)
  {
    // MAYBE: we should hash these the other way around, i.e. generateSecret(_rating, _salt)
    bytes32 ratingSecret = generateSecret(_salt, _rating);
    require(ratingSecret == taskWorkRatings[_id].secret[_role]);

    TaskRatings rating = TaskRatings(_rating);
    require(rating != TaskRatings.None, "Cannot rate None!");
    tasks[_id].roles[_role].rating = rating;
  }

  // In the event of a user not committing or revealing within the 10 day rating window,
  // their rating of their counterpart is assumed to be the highest possible
  // and they will receive a reputation penalty
  function assignWorkRating(uint256 _id) public
  taskWorkRatingsClosed(_id)
  {
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

  function generateSecret(bytes32 _salt, uint256 _value) public pure returns (bytes32) {
    return keccak256(abi.encodePacked(_salt, _value));
  }

  function getTaskWorkRatings(uint256 _id) public view returns (uint256, uint256) {
    return (taskWorkRatings[_id].count, taskWorkRatings[_id].timestamp);
  }

  function getTaskWorkRatingSecret(uint256 _id, uint8 _role) public view returns (bytes32) {
    return taskWorkRatings[_id].secret[_role];
  }

  // TODO: Restrict function visibility to whoever submits the approved Transaction from Client
  // Note task assignment is agreed off-chain
  function setTaskRoleUser(uint256 _id, uint8 _role, address _user) public
  taskExists(_id)
  taskNotFinalized(_id)
  {
    require(tasks[_id].roles[MANAGER].user == msg.sender);
    tasks[_id].roles[_role] = Role({
      user: _user,
      rateFail: false,
      rating: TaskRatings.None
    });

    emit TaskRoleUserChanged(_id, _role, _user);
  }

  function setTaskDomain(uint256 _id, uint256 _domainId) public
  taskExists(_id)
  taskNotFinalized(_id)
  domainExists(_domainId)
  {
    require(tasks[_id].roles[MANAGER].user == msg.sender);
    tasks[_id].domainId = _domainId;

    emit TaskDomainChanged(_id, _domainId);
  }

  // TODO: Restrict function visibility to whoever submits the approved Transaction from Client
  // Maybe just the administrator is adequate for the skill?
  function setTaskSkill(uint256 _id, uint256 _skillId) public
  taskExists(_id)
  taskNotFinalized(_id)
  skillExists(_skillId)
  globalSkill(_skillId)
  {
    require(tasks[_id].roles[MANAGER].user == msg.sender);

    tasks[_id].skills[0] = _skillId;

    emit TaskSkillChanged(_id, _skillId);
  }

  function setTaskBrief(uint256 _id, bytes32 _specificationHash) public
  self()
  taskExists(_id)
  taskNotFinalized(_id)
  {
    tasks[_id].specificationHash = _specificationHash;

    emit TaskBriefChanged(_id, _specificationHash);
  }

  function setTaskDueDate(uint256 _id, uint256 _dueDate) public
  self()
  taskExists(_id)
  taskNotFinalized(_id)
  {
    tasks[_id].dueDate = _dueDate;

    emit TaskDueDateChanged(_id, _dueDate);
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
  taskWorkRatingsAssigned(_id)
  taskNotFinalized(_id)
  {
    Task storage task = tasks[_id];
    IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);

    task.finalized = true;

    for (uint8 roleId = 0; roleId <= 2; roleId++) {
      Role storage role = task.roles[roleId];
      TaskRatings rating = (roleId == EVALUATOR) ? TaskRatings.Satisfactory : role.rating;
      uint payout = task.payouts[roleId][token];

      int reputation = getReputation(int(payout), uint8(rating), role.rateFail);

      colonyNetworkContract.appendReputationUpdateLog(role.user, reputation, domains[task.domainId].skillId);

      if (roleId == WORKER) {
        colonyNetworkContract.appendReputationUpdateLog(role.user, reputation, task.skills[0]);

        if (rating == TaskRatings.Unsatisfactory) {
          task.payouts[roleId][token] = 0;
          task.totalPayouts[token] = sub(task.totalPayouts[token], payout);
        }
      }
    }

    emit TaskFinalized(_id);
  }

  function cancelTask(uint256 _id) public
  auth
  taskExists(_id)
  taskNotFinalized(_id)
  {
    tasks[_id].cancelled = true;

    emit TaskCanceled(_id);
  }

  function getTask(uint256 _id) public view returns (bytes32, bytes32, bool, bool, uint256, uint256, uint256, uint256, uint256, uint256[]) {
    Task storage t = tasks[_id];
    return (t.specificationHash, t.deliverableHash, t.finalized, t.cancelled, t.dueDate, t.payoutsWeCannotMake, t.potId, t.deliverableTimestamp, t.domainId, t.skills);
  }

  function getTaskRole(uint256 _id, uint8 _role) public view returns (address, bool, uint8) {
    Role storage role = tasks[_id].roles[_role];
    return (role.user, role.rateFail, uint8(role.rating));
  }

  function getReputation(int payout, uint8 rating, bool rateFail) internal pure returns(int reputation) {
    require(rating > 0 && rating <= 3, "Invalid rating");

    // -1, 1, 1.5 multipliers, -0.5 penalty
    int8[3] memory ratingMultipliers = [-2, 2, 3];
    int8 ratingDivisor = 2;

    reputation = SafeMath.mulInt(payout, ratingMultipliers[rating - 1]);
    reputation = SafeMath.subInt(reputation, rateFail ? payout : 0); // Deduct penalty for not rating
    reputation /= ratingDivisor; // We may lose one atom of reputation here :sad:
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
