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
  uint256 constant RATING_COMMIT_TIMEOUT = 432000;
  uint256 constant RATING_REVEAL_TIMEOUT = 432000;

  event TaskAdded(uint256 indexed id);

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
    // Work has been rated or more than 10 days from work submission have passed
    require(
      tasks[_id].roles[MANAGER].rating != 0 && tasks[_id].roles[WORKER].rating != 0 ||
      sub(now, taskCompletionTime) > add(RATING_COMMIT_TIMEOUT, RATING_REVEAL_TIMEOUT)
    );
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
    task.domains = new uint256[](1);
    task.skills = new uint256[](1);
    tasks[taskCount] = task;
    tasks[taskCount].roles[MANAGER] = Role({
      user: msg.sender,
      rating: 0
    });

    pots[potCount].taskId = taskCount;
    setTaskDomain(taskCount, _domainId);

    TaskAdded(taskCount);
  }

  function getTaskCount() public view returns (uint256) {
    return taskCount;
  }

  function proposeTaskChange(bytes _data, uint256 _value, uint8 _role) public returns (uint256 transactionId) {
    var (sig, taskId) = deconstructCall(_data);

    Task storage task = tasks[taskId];
    require(task.roles[_role].user == msg.sender);
    require(!task.finalized);

    uint8[2] storage _reviewers = reviewers[sig];
    require(_reviewers[0] != 0 || _reviewers[1] != 0);
    require(_reviewers[0] == _role || _reviewers[1] == _role);

    transactionId = IColony(this).submitTransaction(_data, _value, _role);
  }

  function approveTaskChange(uint256 _transactionId, uint8 _role) public {
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
    bytes32 ratingSecret = generateSecret(_salt, _rating);
    require(ratingSecret == taskWorkRatings[_id].secret[_role]);
    require(_rating >= 1 && _rating <= 3);

    Role storage role = tasks[_id].roles[_role];
    role.rating = _rating;
  }

  function generateSecret(bytes32 _salt, uint256 _value) public pure returns (bytes32) {
    return keccak256(_salt, _value);
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
    tasks[_id].roles[_role] = Role({
      user: _user,
      rating: 0
    });
  }

  function setTaskDomain(uint256 _id, uint256 _domainId) public
  taskExists(_id)
  taskNotFinalized(_id)
  domainExists(_domainId)
  {
    tasks[_id].domains[0] = _domainId;
  }

  // TODO: Restrict function visibility to whoever submits the approved Transaction from Client
  // Maybe just the administrator is adequate for the skill?
  function setTaskSkill(uint256 _id, uint256 _skillId) public
  taskExists(_id)
  taskNotFinalized(_id)
  skillExists(_skillId)
  globalSkill(_skillId)
  {
    tasks[_id].skills[0] = _skillId;
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
  taskWorkRatingsClosed(_id)
  taskNotFinalized(_id)
  {
    Task storage task = tasks[_id];
    IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);

    int8[3] memory ratingMultiplicator = [-10, 10, 15];

    for (uint8 roleId = 0; roleId <= 2; roleId++) {
      uint payout = task.payouts[roleId][token];
      Role storage role = task.roles[roleId];

      uint8 submittedRating;

      // Evaluator does not get rated by other users, so we always assign 2
      if (roleId == EVALUATOR) {
        submittedRating = 2;
        role.rating = 2;
      } else if (role.rating == 0) {
        // If submitted rating was 0, we assign the highest possible rating.
        submittedRating = 0;
        role.rating = 3;
      }

      int reputation = SafeMath.mulInt(int(payout), (int(ratingMultiplicator[role.rating - 1]))) / 10;

      // // Give reputation according to role's rating
      colonyNetworkContract.appendReputationUpdateLog(role.user, reputation, task.domains[0]);

      if (roleId == WORKER) {
        colonyNetworkContract.appendReputationUpdateLog(role.user, reputation, task.skills[0]);
      }

      // Finally, assign reputation penalities if a role didn't submit rating on time
      if (submittedRating == 0 && roleId == MANAGER) {
        // Worker is penalized in domain and skill
        colonyNetworkContract.appendReputationUpdateLog(
          task.roles[WORKER].user,
          -int(task.payouts[WORKER][token] / 2),
          task.skills[0]
        );
        colonyNetworkContract.appendReputationUpdateLog(
          task.roles[WORKER].user,
          -int(task.payouts[WORKER][token] / 2),
          task.domains[0]
        );
      } else if (submittedRating == 0 && roleId == WORKER) {
        // Evaluator is penalized in domain
        colonyNetworkContract.appendReputationUpdateLog(
          task.roles[EVALUATOR].user,
          -int(task.payouts[EVALUATOR][token] / 2),
          task.domains[0]
        );
      }

      // If the work was rejeced with rating 1, don't pay out worker's reward
      if (roleId == WORKER && role.rating == 1) {
        task.payouts[roleId][token] = 0;
        task.totalPayouts[token] = sub(task.totalPayouts[token], payout);
      }
    }

    task.finalized = true;
  }

  function cancelTask(uint256 _id) public
  auth
  taskExists(_id)
  taskNotFinalized(_id)
  {
    tasks[_id].cancelled = true;
  }

  function getTask(uint256 _id) public view returns (bytes32, bytes32, bool, bool, uint256, uint256, uint256, uint256) {
    Task storage t = tasks[_id];
    return (t.specificationHash, t.deliverableHash, t.finalized, t.cancelled, t.dueDate, t.payoutsWeCannotMake, t.potId, t.deliverableTimestamp);
  }

  function getTaskRole(uint256 _id, uint8 _idx) public view returns (address, uint8) {
    Role storage role = tasks[_id].roles[_idx];
    return (role.user, role.rating);
  }

  function getTaskSkill(uint256 _id, uint256 _idx) public view returns (uint256) {
    return tasks[_id].skills[_idx];
  }

  function getTaskDomain(uint256 _id, uint256 _idx) public view returns (uint256) {
    return tasks[_id].domains[_idx];
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
