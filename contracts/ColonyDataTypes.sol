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


contract ColonyDataTypes {

  // Events
  /// @notice Event logged when a new task is added
  /// @param id The newly added task id
  event TaskAdded(uint256 indexed id);

  /// @notice Event logged when a task's specification hash changes
  /// @param id Id of the task
  /// @param specificationHash New specification hash of the task
  event TaskBriefChanged(uint256 indexed id, bytes32 specificationHash);

  /// @notice Event logged when a task's due date changes
  /// @param id Id of the task
  /// @param dueDate New due date of the task
  event TaskDueDateChanged(uint256 indexed id, uint256 dueDate);

  /// @notice Event logged when a task's domain changes
  /// @param id Id of the task
  /// @param domainId New domain id of the task
  event TaskDomainChanged(uint256 indexed id, uint256 domainId);

  /// @notice Event logged when a task's skill changes
  /// @param id Id of the task
  /// @param skillId New skill id of the task
  event TaskSkillChanged(uint256 indexed id, uint256 skillId);

  /// @notice Event logged when a task's role user changes
  /// @param id Id of the task
  /// @param role Role of the user
  /// @param user User that fulfills the designated role
  event TaskRoleUserChanged(uint256 indexed id, uint8 role, address user);

  /// @notice Event logged when a task's worker funding changes
  /// @param id Id of the task
  /// @param token Token of the payout funding
  /// @param amount Amount of the payout funding
  event TaskWorkerPayoutChanged(uint256 indexed id, address token, uint256 amount);

  /// @notice Event logged when a deliverable has been submitted for a task
  /// @param id Id of the task
  /// @param deliverableHash Hash of the work performed
  event TaskDeliverableSubmitted(uint256 indexed id, bytes32 deliverableHash);

  /// @notice Event logged when a task has been completed. This is either because the dueDate has passed
  /// and the manager closed the task, or the worker has submitted the deliverable. In the
  /// latter case, TaskDeliverableSubmitted will also be emitted.
  event TaskCompleted(uint256 indexed id);

  /// @notice Event logged when the rating of a role was revealed
  /// @param id Id of the task
  /// @param role Role that got rated
  /// @param rating Rating the role received
  event TaskWorkRatingRevealed(uint256 indexed id, uint8 role, uint8 rating);

  /// @notice Event logged when a task has been finalized
  /// @param id Id of the finalized task
  event TaskFinalized(uint256 indexed id);

  /// @notice Event logged when a task payout is claimed
  /// @param id Id of the task
  /// @param role Task role for which the payout is being claimed
  /// @param token Token of the payout claim
  /// @param amount Amount of the payout claim
  event TaskPayoutClaimed(uint256 indexed id, uint256 role, address token, uint256 amount);

  /// @notice Event logged when a task has been canceled
  /// @param id Id of the canceled task
  event TaskCanceled(uint256 indexed id);

  /// @notice Event logged when a new reward payout cycle has started
  /// @param id Payout id
  event RewardPayoutCycleStarted(uint256 indexed id);

  /// @notice Event logged when the reward payout cycle has ended
  /// @param id Payout id
  event RewardPayoutCycleEnded(uint256 indexed id);

  /// @notice Event logged when a new Domain is added
  /// @param id Id of the newly-created Domain
  event DomainAdded(uint256 indexed id);

  /// @notice Event logged when a new Pot is added
  /// @param id Id of the newly-created Pot
  event PotAdded(uint256 indexed id);

  struct RewardPayoutCycle {
    // Reputation root hash at the time of reward payout creation
    bytes32 reputationState;
    // Colony wide reputation
    uint256 colonyWideReputation;
    // Total tokens at the time of reward payout creation
    uint256 totalTokens;
    // Amount alocated for reward payout
    uint256 amount;
    // Token in which a reward is paid out with
    address tokenAddress;
    // Time of creation (in seconds)
    uint256 blockTimestamp;
  }

  struct Task {
    bytes32 specificationHash;
    bytes32 deliverableHash;
    uint8 status;
    uint256 dueDate;
    uint256 payoutsWeCannotMake;
    uint256 potId;
    uint256 completionTimestamp;
    uint256 domainId;
    uint256[] skills;

    mapping (uint8 => Role) roles;
    // Maps task role ids (0,1,2..) to a token amount to be paid on task completion
    mapping (uint8 => mapping (address => uint256)) payouts;
  }

  enum TaskRatings { None, Unsatisfactory, Satisfactory, Excellent }

  struct Role {
    // Address of the user for the given role
    address user;
    // Whether the user failed to submit their rating
    bool rateFail;
    // Rating the user received
    TaskRatings rating;
  }

  struct RatingSecrets {
    uint256 count;
    uint256 timestamp;
    mapping (uint8 => bytes32) secret;
  }

  struct Pot {
    mapping (address => uint256) balance;
    uint256 taskId;
  }

  struct Domain {
    uint256 skillId;
    uint256 potId;
  }
}
