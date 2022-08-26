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


interface ColonyDataTypes {
  // Events

  /// @notice Event logged when Colony is initialised
  /// @param agent The address that is responsible for triggering this event
  /// @param colonyNetwork The Colony Network address
  /// @param token The Colony Token address
  event ColonyInitialised(address agent, address colonyNetwork, address token);

  /// @notice Event logged when Colony is initially bootstrapped
  /// @param agent The address that is responsible for triggering this event
  /// @param users Array of address bootstraped with reputation
  /// @param amounts Amounts of reputation/tokens for every address
  event ColonyBootstrapped(address agent, address[] users, int[] amounts);

  /// @notice Event logged when colony is upgraded
  /// @param agent The address that is responsible for triggering this event
  /// @param oldVersion The previous colony version
  /// @param newVersion The new colony version upgraded to
  event ColonyUpgraded(address agent, uint256 oldVersion, uint256 newVersion);

  /// @notice Event logged when a user/domain/role is granted or revoked
  /// @param agent The address that is responsible for triggering this event
  /// @param user The address of the user being affected
  /// @param domainId The domainId of the role
  /// @param role The role being granted/revoked
  /// @param setTo A boolean representing the action -- granted (`true`) or revoked (`false`)
  event ColonyRoleSet(address agent, address indexed user, uint256 indexed domainId, uint8 indexed role, bool setTo);

  /// @notice Event logged when colony funds, either tokens or ether, has been moved between funding pots
  /// @param agent The address that is responsible for triggering this event
  /// @param fromPot The source funding pot
  /// @param toPot The targer funding pot
  /// @param amount The amount that was transferred
  /// @param token The token address being transferred
  event ColonyFundsMovedBetweenFundingPots(address agent, uint256 indexed fromPot, uint256 indexed toPot, uint256 amount, address token);

  /// @notice Event logged when colony funds are moved to the top-level domain pot
  /// @param agent The address that is responsible for triggering this event
  /// @param token The token address
  /// @param fee The fee deducted for rewards
  /// @param payoutRemainder The remaining funds moved to the top-level domain pot
  event ColonyFundsClaimed(address agent, address token, uint256 fee, uint256 payoutRemainder);

  /// @notice Event logged when a new reward payout cycle has started
  /// @param agent The address that is responsible for triggering this event
  /// @param rewardPayoutId The reward payout cycle id
  event RewardPayoutCycleStarted(address agent, uint256 rewardPayoutId);

  /// @notice Event logged when the reward payout cycle has ended
  /// @param agent The address that is responsible for triggering this event
  /// @param rewardPayoutId The reward payout cycle id
  event RewardPayoutCycleEnded(address agent, uint256 rewardPayoutId);

  /// @notice Event logged when reward payout is claimed
  /// @param rewardPayoutId The reward payout cycle id
  /// @param user The user address who received the reward payout
  /// @param fee The fee deducted from payout
  /// @param rewardRemainder The remaining reward amount paid out to user
  event RewardPayoutClaimed(uint256 rewardPayoutId, address user, uint256 fee, uint256 rewardRemainder);

  /// @notice Event logged when the colony reward inverse is set
  /// @param agent The address that is responsible for triggering this event
  /// @param rewardInverse The reward inverse value
  event ColonyRewardInverseSet(address agent, uint256 rewardInverse);

  /// @notice Event logged when the default global claim delay is updated
  /// @param agent The address that is responsible for triggering this event
  /// @param globalClaimDelay The new default global claim delay
  event ExpenditureGlobalClaimDelaySet(address agent, uint256 globalClaimDelay);

  /// @notice Event logged when a new expenditure is added
  /// @param agent The address that is responsible for triggering this event
  /// @param expenditureId The newly added expenditure id
  event ExpenditureAdded(address agent, uint256 expenditureId);

  /// @notice Event logged when a new expenditure is transferred
  /// @param agent The address that is responsible for triggering this event
  /// @param expenditureId The expenditure id
  /// @param owner The new owner of the expenditure
  event ExpenditureTransferred(address agent, uint256 indexed expenditureId, address indexed owner);

  /// @notice Event logged when an expenditure has been cancelled
  /// @param agent The address that is responsible for triggering this event
  /// @param expenditureId Id of the cancelled expenditure
  event ExpenditureCancelled(address agent, uint256 indexed expenditureId);

  /// @notice Event logged when an expenditure has been locked
  /// @param agent The address that is responsible for triggering this event
  /// @param expenditureId Id of the locked expenditure
  event ExpenditureLocked(address agent, uint256 indexed expenditureId);

  /// @notice Event logged when an expenditure has been finalized
  /// @param agent The address that is responsible for triggering this event
  /// @param expenditureId Id of the finalized expenditure
  event ExpenditureFinalized(address agent, uint256 indexed expenditureId);

  /// @notice Event logged when expenditure metadata is set
  /// @param agent The address that is responsible for triggering this event
  /// @param expenditureId Id of the expenditure
  /// @param metadata IPFS hash of the metadata
  event ExpenditureMetadataSet(address agent, uint256 indexed expenditureId, string metadata);

  /// @notice Event logged when an expenditure's recipient is set
  /// @param agent The address that is responsible for triggering this event
  /// @param expenditureId Id of the expenditure
  /// @param slot Expenditure slot of the recipient
  /// @param recipient Address of the recipient
  event ExpenditureRecipientSet(address agent, uint256 indexed expenditureId, uint256 indexed slot, address indexed recipient);

  /// @notice Event logged when an expenditure's skill changes
  /// @param agent The address that is responsible for triggering this event
  /// @param expenditureId Id of the expenditure
  /// @param slot Slot receiving the skill
  /// @param skillId Id of the set skill
  event ExpenditureSkillSet(address agent, uint256 indexed expenditureId, uint256 indexed slot, uint256 indexed skillId);

  /// @notice Event logged when an expenditure payout changes
  /// @param agent The address that is responsible for triggering this event
  /// @param expenditureId Id of the expenditure
  /// @param slot Expenditure slot of the payout being changed
  /// @param token Token of the payout funding
  /// @param amount Amount of the payout funding
  event ExpenditurePayoutSet(address agent, uint256 indexed expenditureId, uint256 indexed slot, address indexed token, uint256 amount);

  /// @notice Event logged when an expenditure slot claim delay changes
  /// @param agent The address that is responsible for triggering this event
  /// @param expenditureId Id of the expenditure
  /// @param slot Expenditure slot being changed
  /// @param claimDelay Additional amount of time to hold the funds
  event ExpenditureClaimDelaySet(address agent, uint256 indexed expenditureId, uint256 indexed slot, uint256 claimDelay);

  /// @notice Event logged when an expenditure slot payout modifier changes
  /// @param agent The address that is responsible for triggering this event
  /// @param expenditureId Id of the expenditure
  /// @param slot Expenditure slot being changed
  /// @param payoutModifier The payout modifier for the slot
  event ExpenditurePayoutModifierSet(address agent, uint256 indexed expenditureId, uint256 indexed slot, int256 payoutModifier);

  /// @notice Event logged when a new payment is added
  /// @param agent The address that is responsible for triggering this event
  /// @param paymentId The newly added payment id
  event PaymentAdded(address agent, uint256 paymentId);

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

  /// @notice Event logged when tokens are minted
  /// @param agent The address that is responsible for triggering this event
  /// @param who The address being awarded the tokens
  /// @param amount The amount of tokens being awarded
  event TokensMinted(address agent, address who, uint256 amount);

  /// @notice Event logged when a payout is claimed, either from a Task or Payment
  /// @param agent The address that is responsible for triggering this event
  /// @param fundingPotId Id of the funding pot where payout comes from
  /// @param token Token of the payout claim
  /// @param amount Amount of the payout claimed, after network fee was deducted
  event PayoutClaimed(address agent, uint256 indexed fundingPotId, address token, uint256 amount);

  /// @notice Event logged when a task has been canceled
  /// @param taskId Id of the canceled task
  event TaskCanceled(uint256 indexed taskId);

  /// @notice Event logged when a new local skill is added
  /// @param agent The address that is responsible for triggering this event
  /// @param localSkillId Id of the newly-created local skill
  event LocalSkillAdded(address agent, uint256 localSkillId);

  /// @notice Event logged when a new local skill is added
  /// @param agent The address that is responsible for triggering this event
  /// @param localSkillId Id of the newly-created local skill
  /// @param deprecated Deprecation status of the local skill
  event LocalSkillDeprecated(address agent, uint256 localSkillId, bool deprecated);

  /// @notice Event logged when a new Domain is added
  /// @param agent The address that is responsible for triggering this event
  /// @param domainId Id of the newly-created Domain
  event DomainAdded(address agent, uint256 domainId);

  /// @notice Event logged when domain metadata is updated
  /// @param agent The address that is responsible for triggering this event
  /// @param domainId Id of the newly-created Domain
  /// @param metadata IPFS hash of the metadata
  event DomainMetadata(address agent, uint256 indexed domainId, string metadata);

  /// @notice Event logged when domain metadata is updated
  /// @param agent The address that is responsible for triggering this event
  /// @param domainId Id of the domain
  /// @param deprecated Whether or not the domain is deprecated
  event DomainDeprecated(address agent, uint256 indexed domainId, bool deprecated);

  /// @notice Event logged when Colony metadata is updated
  /// @param agent The address that is responsible for triggering this event
  /// @param metadata IPFS hash of the metadata
  event ColonyMetadata(address agent, string metadata);

  /// @notice Event logged when Colony metadata is updated via a delta
  /// @param agent The address that is responsible for triggering this event
  /// @param metadata IPFS hash of the delta
  event ColonyMetadataDelta(address agent, string metadata);

  /// @notice Event logged when a new FundingPot is added
  /// @param fundingPotId Id of the newly-created FundingPot
  event FundingPotAdded(uint256 fundingPotId);

  /// @notice Emit a metadata string for a transaction
  /// @param agent Agent emitting the annotation
  /// @param txHash Hash of transaction being annotated (0x0 for current tx)
  /// @param metadata IPFS hash of the metadata
  event Annotation(address indexed agent, bytes32 indexed txHash, string metadata);

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

  /// @notice Event logged when the colony burns tokens
  /// @param agent The address that is responsible for triggering this event
  /// @param token the address of the token being burned
  /// @param token the amount of the token being burned
  event TokensBurned(address agent, address token, uint256 amount);

  /// @notice Event emitted when the colony unlocks its native token through the
  /// provided function
  /// @param agent The address that is responsible for triggering this event
  event TokenUnlocked(address agent);

  /// @notice Event logged when a manual reputation reward/penalty is made
  /// @param agent The address that is responsible for triggering this event
  /// @param user The address that is having its reputation changed
  /// @param skillId The id of the skill the user is having their reputation changed in
  /// @param amount The (maximum) amount the address is having its reputation changed by
  event ArbitraryReputationUpdate(address agent, address user, uint256 skillId, int256 amount);

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
    // How many tokens remain to be paid out.
    uint256 amountRemaining;
    // Whether this payout is active or not.
    bool finalized;
  }

  struct Expenditure {
    ExpenditureStatus status;
    address owner;
    uint256 fundingPotId;
    uint256 domainId;
    uint256 finalizedTimestamp;
    uint256 globalClaimDelay;
  }

  struct ExpenditureSlot {
    address payable recipient;
    uint256 claimDelay;
    int256 payoutModifier;
    uint256[] skills;
  }

  enum ExpenditureStatus { Draft, Cancelled, Finalized, Locked }

  struct Payment {
    address payable recipient;
    bool finalized;
    uint256 fundingPotId;
    uint256 domainId;
    uint256[] skills;
  }

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
    // Maps task role ids (0,1,2..) to a token amount to be paid on task completion
    mapping (uint8 => mapping (address => uint256)) payouts;
  }

  enum TaskRatings { None, Unsatisfactory, Satisfactory, Excellent }

  enum TaskRole { Manager, Evaluator, Worker }

  enum TaskStatus { Active, Cancelled, Finalized }

  // Any new roles added should be added before NUMBER_OF_ROLES, which should always be the last entry in this enum
  enum ColonyRole { Recovery, Root, Arbitration, Architecture, ArchitectureSubdomain_DEPRECATED, Funding, Administration, NUMBER_OF_ROLES }

  struct Role {
    // Address of the user for the given role
    address payable user;
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

  // We do have 1 "special" funding pot with id 0 for rewards which will carry the "Unassigned" type.
  // as they are unrelated to other entities in the Colony the same way the remaining funding pots are releated to domains, tasks and payouts.
  enum FundingPotAssociatedType { Unassigned, Domain, Task, Payment, Expenditure }

  struct FundingPot {
    // Funding pots can store multiple token balances, for ETH use 0x0 address
    mapping (address => uint256) balance;
    // Funding pots can be associated with different fundable entities, for now these are: tasks, domains and payments.
    FundingPotAssociatedType associatedType;
    uint256 associatedTypeId;
    // Map any assigned payouts from this pot, note that in Tasks these are broken down to a more granular level on a per role basis
    mapping (address => uint256) payouts;
    uint256 payoutsWeCannotMake;
  }

  struct Domain {
    uint256 skillId;
    uint256 fundingPotId;
  }

  struct LocalSkill {
    bool exists;
  }
}
