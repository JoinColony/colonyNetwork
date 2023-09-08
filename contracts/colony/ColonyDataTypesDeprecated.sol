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

pragma solidity 0.8.21;


interface ColonyDataTypesDeprecated {

/// @notice Event logged when a new task is added
  /// @param agent The address that is responsible for triggering this event
  /// @param taskId The newly added task id
  event TaskAdded(address agent, uint256 taskId);

  /// @notice Event logged when a task's specification hash changes
  /// @param taskId Id of the task
  /// @param specificationHash New specification hash of the task
  event TaskBriefSet(uint256 indexed taskId, bytes32 specificationHash);

  /// @notice Event logged when a task's due date changes
  /// @param taskId Id of the task
  /// @param dueDate New due date of the task
  event TaskDueDateSet(uint256 indexed taskId, uint256 dueDate);

  /// @notice Event logged when a task's skill changes
  /// @param taskId Id of the task
  /// @param skillId New skill id of the task
  event TaskSkillSet(uint256 indexed taskId, uint256 indexed skillId);

  /// @notice Event logged when a task's role user changes
  /// @param taskId Id of the task
  /// @param role Role of the user
  /// @param user User that fulfills the designated role
  event TaskRoleUserSet(uint256 indexed taskId, TaskRole role, address indexed user);

  /// @notice Event logged when a task payout changes
  /// @param taskId Id of the task
  /// @param role Task role whose payout is being changed
  /// @param token Token of the payout funding
  /// @param amount Amount of the payout funding
  event TaskPayoutSet(uint256 indexed taskId, TaskRole role, address token, uint256 amount);

  /// @notice Event logged when task data is changed via signed messages by those involved
  /// @param reviewerAddresses Array of addresses that signed off this change.
  event TaskChangedViaSignatures(address[] reviewerAddresses);

  /// @notice Event logged when a deliverable has been submitted for a task
  /// @param agent The address that is responsible for triggering this event
  /// @param taskId Id of the task
  /// @param deliverableHash Hash of the work performed
  event TaskDeliverableSubmitted(address agent, uint256 indexed taskId, bytes32 deliverableHash);

  /// @notice Event logged when a task has been completed. This is either because the dueDate has passed
  /// and the manager closed the task, or the worker has submitted the deliverable. In the
  /// latter case, TaskDeliverableSubmitted will also be emitted.
  /// @param agent The address that is responsible for triggering this event
  /// @param taskId The id of the task being completed
  event TaskCompleted(address agent, uint256 indexed taskId);

  /// @notice Event logged when the rating of a role was revealed
  /// @param agent The address that is responsible for triggering this event
  /// @param taskId Id of the task
  /// @param role Role that got rated
  /// @param rating Rating the role received
  event TaskWorkRatingRevealed(address agent, uint256 indexed taskId, TaskRole role, uint8 rating);

  /// @notice Event logged when a task has been finalized
  /// @param agent The address that is responsible for triggering this event
  /// @param taskId Id of the finalized task
  event TaskFinalized(address agent, uint256 indexed taskId);

  /// @notice Event logged when a task has been canceled
  /// @param taskId Id of the canceled task
  event TaskCanceled(uint256 indexed taskId);

  /// @notice Event logged when a new payment is added
  /// @param agent The address that is responsible for triggering this event
  /// @param paymentId The newly added payment id
  event PaymentAdded(address agent, uint256 paymentId);

  /// @notice Event logged when a payment has its payout set
  /// @param agent The address that is responsible for triggering this event
  /// @param paymentId Id of the payment
  /// @param token Token of the payout
  /// @param amount Amount of token to be paid out
  event PaymentPayoutSet(address agent, uint256 indexed paymentId, address token, uint256 amount);

  /// @notice Event logged when a payment has its skill set
  /// @param agent The address that is responsible for triggering this event
  /// @param paymentId Id of the payment
  /// @param skillId Token of the payout
  event PaymentSkillSet(address agent, uint256 indexed paymentId, uint256 skillId);

  /// @notice Event logged when a payment has its recipient set
  /// @param agent The address that is responsible for triggering this event
  /// @param paymentId Id of the payment
  /// @param recipient Address to receive the payout
  event PaymentRecipientSet(address agent, uint256 indexed paymentId, address recipient);

  /// @notice Event logged when a payment is finalised
  /// @param agent The address that is responsible for triggering this event
  /// @param paymentId Id of the payment
  event PaymentFinalized(address agent, uint256 indexed paymentId);

  enum TaskRatings { None, Unsatisfactory, Satisfactory, Excellent }
  enum TaskRole { Manager, Evaluator, Worker }
  enum TaskStatus { Active, Cancelled, Finalized }

  struct Task {
    bytes32 specificationHash;
    bytes32 deliverableHash;
    TaskStatus status;
    uint256 dueDate;
    uint256 fundingPotId;
    uint256 completionTimestamp;
    uint256 domainId;
    uint256[] skills;
    mapping (uint8 => Role) roles;
    mapping (uint8 => mapping (address => uint256)) payouts;
  }

  struct Role {
    address payable user;
    bool rateFail;
    TaskRatings rating;
  }

  struct RatingSecrets {
    uint256 count;
    uint256 timestamp;
    mapping (uint8 => bytes32) secret;
  }

  struct Payment {
    address payable recipient;
    bool finalized;
    uint256 fundingPotId;
    uint256 domainId;
    uint256[] skills;
  }
}
