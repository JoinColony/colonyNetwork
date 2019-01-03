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

pragma solidity >=0.4.23;


contract ColonyDataTypes {
  // Events

  /// @notice Event logged when Colony is initialised
  /// @param colonyNetwork The Colony Network address
  /// @param token The Colony Token address
  event ColonyInitialised(address colonyNetwork, address token);

  /// @notice Event logged when Colony is initially bootstrapped
  /// @param users Array of address bootstraped with reputation
  /// @param amounts Amounts of reputation/tokens for every address
  event ColonyBootstrapped(address[] users, int[] amounts);

  /// @notice Event logged when colony is upgraded
  /// @param oldVersion The previous colony version
  /// @param newVersion The new colony version upgraded to
  event ColonyUpgraded(uint256 oldVersion, uint256 newVersion);

  /// @notice Event logged when the colony founder role is changed
  /// @param oldFounder The current founder delegating the role away
  /// @param newFounder User who is new new colony founder
  event ColonyFounderRoleSet(address oldFounder, address newFounder);

  /// @notice Event logged when a new user is assigned the colony admin role
  /// @param user The newly added colony admin user address
  event ColonyAdminRoleSet(address user);

  /// @notice Event logged when an existing colony admin is removed the colony admin role
  /// @param user The removed colony admin user address
  event ColonyAdminRoleRemoved(address user);

  /// @notice Event logged when colony funds, either tokens or ether, has been moved between funding pots
  /// @param fromPot The source funding pot
  /// @param toPot The targer funding pot
  /// @param amount The amount that was transferred
  /// @param token The token address being transferred
  event ColonyFundsMovedBetweenFundingPots(uint256 fromPot, uint256 toPot, uint256 amount, address token);

  /// @notice Event logged when colony funds are moved to the top-level domain pot
  /// @param token The token address
  /// @param fee The fee deducted for rewards
  /// @param payoutRemainder The remaining funds moved to the top-level domain pot
  event ColonyFundsClaimed(address token, uint256 fee, uint256 payoutRemainder);

  /// @notice Event logged when a new reward payout cycle has started
  /// @param rewardPayoutId The reward payout cycle id
  event RewardPayoutCycleStarted(uint256 rewardPayoutId);

  /// @notice Event logged when the reward payout cycle has ended
  /// @param rewardPayoutId The reward payout cycle id
  event RewardPayoutCycleEnded(uint256 rewardPayoutId);

  /// @notice Event logged when reward payout is claimed
  /// @param rewardPayoutId The reward payout cycle id
  /// @param user The user address who received the reward payout
  /// @param fee The fee deducted from payout
  /// @param rewardRemainder The remaining reward amount paid out to user
  event RewardPayoutClaimed(uint256 rewardPayoutId, address user, uint256 fee, uint256 rewardRemainder);

  /// @notice Event logged when the colony reward inverse is set
  /// @param rewardInverse The reward inverse value
  event ColonyRewardInverseSet(uint256 rewardInverse);

  /// @notice Event logged when a new task is added
  /// @param taskId The newly added task id
  event TaskAdded(uint256 taskId);

  /// @notice Event logged when a task's specification hash changes
  /// @param taskId Id of the task
  /// @param specificationHash New specification hash of the task
  event TaskBriefSet(uint256 taskId, bytes32 specificationHash);

  /// @notice Event logged when a task's due date changes
  /// @param taskId Id of the task
  /// @param dueDate New due date of the task
  event TaskDueDateSet(uint256 taskId, uint256 dueDate);

  /// @notice Event logged when a task's domain changes
  /// @param taskId Id of the task
  /// @param domainId New domain id of the task
  event TaskDomainSet(uint256 taskId, uint256 domainId);

  /// @notice Event logged when a task's skill changes
  /// @param taskId Id of the task
  /// @param skillId New skill id of the task
  event TaskSkillSet(uint256 taskId, uint256 skillId);

  /// @notice Event logged when a task's role user changes
  /// @param taskId Id of the task
  /// @param role Role of the user
  /// @param user User that fulfills the designated role
  event TaskRoleUserSet(uint256 taskId, TaskRole role, address user);

  /// @notice Event logged when a task payout changes
  /// @param taskId Id of the task
  /// @param role Task role whose payout is being changed
  /// @param token Token of the payout funding
  /// @param amount Amount of the payout funding
  event TaskPayoutSet(uint256 taskId, TaskRole role, address token, uint256 amount);

  /// @notice Event logged when a deliverable has been submitted for a task
  /// @param taskId Id of the task
  /// @param deliverableHash Hash of the work performed
  event TaskDeliverableSubmitted(uint256 taskId, bytes32 deliverableHash);

  /// @notice Event logged when a task has been completed. This is either because the dueDate has passed
  /// and the manager closed the task, or the worker has submitted the deliverable. In the
  /// latter case, TaskDeliverableSubmitted will also be emitted.
  event TaskCompleted(uint256 taskId);

  /// @notice Event logged when the rating of a role was revealed
  /// @param taskId Id of the task
  /// @param role Role that got rated
  /// @param rating Rating the role received
  event TaskWorkRatingRevealed(uint256 taskId, TaskRole role, uint8 rating);

  /// @notice Event logged when a task has been finalized
  /// @param taskId Id of the finalized task
  event TaskFinalized(uint256 taskId);

  /// @notice Event logged when a task payout is claimed
  /// @param taskId Id of the task
  /// @param role Task role for which the payout is being claimed
  /// @param token Token of the payout claim
  /// @param amount Amount of the payout claim
  event TaskPayoutClaimed(uint256 taskId, uint256 role, address token, uint256 amount);

  /// @notice Event logged when a task has been canceled
  /// @param taskId Id of the canceled task
  event TaskCanceled(uint256 taskId);

  /// @notice Event logged when a new Domain is added
  /// @param domainId Id of the newly-created Domain
  event DomainAdded(uint256 domainId);

  /// @notice Event logged when a new Pot is added
  /// @param potId Id of the newly-created Pot
  event PotAdded(uint256 potId);

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
    TaskStatus status;
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

  enum TaskRole { Manager, Evaluator, Worker }

  enum TaskStatus { Active, Cancelled, Finalized }

  enum ColonyRole { Founder, Admin }

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
    uint256 domainId;
  }

  struct Domain {
    uint256 skillId;
    uint256 potId;
  }
}
