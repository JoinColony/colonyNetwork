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


/// @title Colony interface
/// @notice All publicly available functions are available here and registered to work with EtherRouter Network contract
contract IColony {
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

  /// @notice Event logged when a task has been canceled
  /// @param id Id of the canceled task
  event TaskCanceled(uint256 indexed id);

  /// @notice Event logged when a new reward payout cycle has started
  /// @param id Payout id
  event RewardPayoutCycleStarted(uint256 indexed id);

  /// @notice Event logged when a new Domain is added
  /// @param id Id of the newly-created Domain
  event DomainAdded(uint256 indexed id);

  /// @notice Event logged when a new Pot is added
  /// @param id Id of the newly-created Pot
  event PotAdded(uint256 indexed id);

  // Implemented in DSAuth.sol
  /// @notice Get the `Authority` for the colony
  /// @return authority The `Authority` contract address
  function authority() public view returns (address authority);

  /// @notice Get the colony `owner` address. This should be 0x0 at all times
  /// @dev Used for testing.
  /// @return owner Address of the colony owner
  function owner() public view returns (address owner);

  // Implemented in Colony.sol
  /// @notice Get the Colony contract version
  /// Starts from 1 and is incremented with every deployed contract change
  /// @return version Version number
  function version() public pure returns (uint256 version);

  /// @notice Upgrades a colony to a new Colony contract version `_newVersion`
  /// @dev Downgrades are not allowed, i.e. `_newVersion` should be higher than the currect colony version
  /// @param _newVersion The target version for the upgrade
  function upgrade(uint _newVersion) public;

  /// @notice Set the colony token. Secured function to authorised members
  /// @param _token Address of the token contract to use.
  /// Note that if the `mint` functionality is to be controlled through the colony,
  /// that control has to be transferred to the colony after this call
  function setToken(address _token) public;

  /// @notice Set new colony owner role.
  /// @dev There can only be one address assigned to owner role at a time.
  /// Whoever calls this function will lose their owner role
  /// Can be called by owner role.
  /// @param _user User we want to give an owner role to
  function setOwnerRole(address _user) public;

  /// @notice Set new colony admin role.
  /// Can be called by owner role or admin role.
  /// @param _user User we want to give an admin role to
  function setAdminRole(address _user) public;

  /// @notice Remove colony admin.
  /// Can only be called by owner role.
  /// @param _user User we want to remove admin role from
  function removeAdminRole(address _user) public;

  /// @notice Set new colony recovery role.
  /// Can be called by owner.
  /// @param _user User we want to give a recovery role to
  function setRecoveryRole(address _user) public;

  /// @notice Remove colony recovery role.
  /// Can only be called by owner role.
  /// @param _user User we want to remove recovery role from
  function removeRecoveryRole(address _user) public;

  /// @notice Return number of recovery roles.
  /// @return numRoles Number of users with the recovery role (excluding owner)
  function numRecoveryRoles() public view returns(uint64 numRoles);

  /// @notice Get the colony token
  /// @return tokenAddress Address of the token contract
  function getToken() public view returns (address tokenAddress);

  /// @notice Called once when the colony is created to initialise certain storage slot values
  /// @param _network Address of the colony network
  function initialiseColony(address _network) public;

  /// @notice Allows the colony to bootstrap itself by having initial reputation and token `_amount` assigned to users `_users`
  /// This reputation is assigned in the colony-wide domain. Secured function to authorised members
  /// @dev Only allowed to be called when `taskCount` is 0 by authorized addresses
  /// @param _users Array of address to bootstrap with reputation
  /// @param _amount Amount of reputation/tokens for every address
  function bootstrapColony(address[] _users, int[] _amount) public;

  /// @notice Mint `_wad` amount of colony tokens. Secured function to authorised members
  /// @param _wad Amount to mint
  function mintTokens(uint256 _wad) public;

  /// @notice Mints CLNY in the Meta Colony and transfers them to the colony network
  /// Only allowed to be called on the Meta Colony by the colony network
  /// @param _wad Amount to mint and transfer to the colony network
  function mintTokensForColonyNetwork(uint256 _wad) public;

  /// @notice Register colony's ENS label
  /// @param colonyName The label to register.
  function registerColonyLabel(string colonyName) public;

  /// @notice Add a new global skill, under skill `_parentSkillId`
  /// Can only be called from the Meta Colony
  /// @dev Calls `IColonyNetwork.addSkill`
  /// @param _parentSkillId Id of the skill under which the new skill will be added
  /// @return skillId Id of the added skill
  function addGlobalSkill(uint256 _parentSkillId) public returns (uint256 skillId);

  /// @notice Add a colony domain, and its respective local skill under skill with id `_parentSkillId`
  /// New funding pot is created and associated with the domain here
  /// @param _parentDomainId Id of the domain under which the new one will be added
  /// @dev Adding new domains is currently retricted to one level only, i.e. `_parentDomainId` has to be the root domain id: 1
  function addDomain(uint256 _parentDomainId) public;

  /// @notice Get the domain's local skill and funding pot id
  /// @param _id Id of the domain which details to get
  /// @return skillId The domain "local" skill id
  /// @return potId The domain's funding pot id
  function getDomain(uint256 _id) public view returns (uint256 skillId, uint256 potId);

  /// @notice Get the number of domains in the colony
  /// @return count The domain count. Min 1 as the root domain is created at the same time as the colony
  function getDomainCount() public view returns (uint256 count);

  /// @notice Helper function that can be used by a client to verify the correctness of a patricia proof they have been supplied with.
  /// @param key The key of the element the proof is for.
  /// @param value The value of the element that the proof is for.
  /// @param branchMask The branchmask of the proof
  /// @param siblings The siblings of the proof
  /// @return isValid True if the proof is valid, false otherwise.
  /// @dev For more detail about branchMask and siblings, examine the PatriciaTree implementation
  /// While public, likely only to be used by the Colony contracts, as it checks that the user is proving their own
  /// reputation in the current colony. The `verifyProof` function can be used to verify any proof, though this function
  /// is not currently exposed on the Colony's EtherRouter.
  function verifyReputationProof(bytes key, bytes value, uint256 branchMask, bytes32[] siblings) public view returns (bool isValid);

  /// @notice Put colony into recovery mode.
  /// Can only be called by user with recovery role.
  function enterRecoveryMode() public;

  /// @notice Update value of arbitrary storage variable.
  /// Can only be called by user with recovery role.
  /// @param _slot Uint address of storage slot to be updated
  /// @param _value Bytes32 word of data to be set
  /// @dev certain critical variables are protected from editing in this function
  function setStorageSlotRecovery(uint256 _slot, bytes32 _value) public;

  /// @notice Indicate approval to exit recovery mode.
  /// Can only be called by user with recovery role.
  function approveExitRecovery() public;

  /// @notice Exit recovery mode, can be called by anyone if enough whitelist approvals are given.
  /// @param _newVersion Resolver version to upgrade to (>= current version)
  function exitRecoveryMode(uint256 _newVersion) public;

  // Implemented in ColonyTask.sol
  /// @notice Make a new task in the colony. Secured function to authorised members
  /// @param _specificationHash Database identifier where the task specification is stored
  /// @param _domainId The domain where the task belongs
  /// @param _skillId The skill associated with the task, can set to 0 for no-op
  /// @param _dueDate The due date of the task, can set to 0 for no-op
  function makeTask(bytes32 _specificationHash, uint256 _domainId, uint256 _skillId, uint256 _dueDate) public;

  /// @notice Get the number of tasks in the colony
  /// @return count The task count
  function getTaskCount() public view returns (uint256 count);

  /// @notice Starts from 0 and is incremented on every co-reviewed task change via `executeTaskChange` call
  /// @param _id Id of the task
  /// @return nonce The current task change nonce value
  function getTaskChangeNonce(uint256 _id) public view returns (uint256 nonce);

  /// @notice Executes a task update transaction `_data` which is approved and signed by two of its roles (e.g. manager and worker)
  /// using the detached signatures for these users.
  /// @dev The Colony functions which require approval and the task roles to review these are set in `IColony.initialiseColony` at colony creation
  /// Upon successful execution the `taskChangeNonces` entry for the task is incremented
  /// @param _sigV recovery id
  /// @param _sigR r output of the ECDSA signature of the transaction
  /// @param _sigS s output of the ECDSA signature of the transaction
  /// @param _mode How the signature was generated - 0 for Geth-style (usual), 1 for Trezor-style (only Trezor does this)
  /// @param _value The transaction value, i.e. number of wei to be sent when the transaction is executed
  /// Currently we only accept 0 value transactions but this is kept as a future option
  /// @param _data The transaction data
  function executeTaskChange(
    uint8[] _sigV,
    bytes32[] _sigR,
    bytes32[] _sigS,
    uint8[] _mode,
    uint256 _value,
    bytes _data
    ) public;

  /// @notice Executes a task role update transaction `_data` which is approved and signed by two of addresses
  /// depending of which function we are calling. Allowed functions are `setTaskManagerRole`, `setTaskEvaluatorRole` and `setTaskWorkerRole`.
  /// Upon successful execution the `taskChangeNonces` entry for the task is incremented
  /// @param _sigV recovery id
  /// @param _sigR r output of the ECDSA signature of the transaction
  /// @param _sigS s output of the ECDSA signature of the transaction
  /// @param _mode How the signature was generated - 0 for Geth-style (usual), 1 for Trezor-style (only Trezor does this)
  /// @param _value The transaction value, i.e. number of wei to be sent when the transaction is executed
  /// Currently we only accept 0 value transactions but this is kept as a future option
  /// @param _data The transaction data
  function executeTaskRoleAssignment(
    uint8[] _sigV,
    bytes32[] _sigR,
    bytes32[] _sigS,
    uint8[] _mode,
    uint256 _value,
    bytes _data
    ) public;

  /// @notice Submit a hashed secret of the rating for work in task `_id` which was performed by user with task role id `_role`
  /// Allowed within 5 days period starting which whichever is first from either the deliverable being submitted or the dueDate been reached
  /// Allowed only for evaluator to rate worker and for worker to rate manager performance
  /// Once submitted ratings can not be changed or overwritten
  /// @param _id Id of the task
  /// @param _role Id of the role, as defined in `ColonyStorage` `MANAGER`, `EVALUATOR` and `WORKER` constants
  /// @param _ratingSecret `keccak256` hash of a salt and 0-50 rating score (in increments of 10, .e.g 0, 10, 20, 30, 40 or 50)
  /// Can be generated via `IColony.generateSecret` helper function
  function submitTaskWorkRating(uint256 _id, uint8 _role, bytes32 _ratingSecret) public;

  /// @notice Reveal the secret rating submitted in `IColony.submitTaskWorkRating` for task `_id` and task role with id `_role`
  /// Allowed within 5 days period starting which whichever is first from either both rating secrets being submitted
  /// (via `IColony.submitTaskWorkRating`) or the 5 day rating period expiring
  /// @dev Compares the `keccak256(_salt, _rating)` output with the previously submitted rating secret and if they match,
  /// sets the task role properties `rated` to `true` and `rating` to `_rating`
  /// @param _id Id of the task
  /// @param _role Id of the role, as defined in `ColonyStorage` `MANAGER`, `EVALUATOR` and `WORKER` constants
  /// @param _rating 0-50 rating score (in increments of 10, .e.g 0, 10, 20, 30, 40 or 50)
  /// @param _salt Salt value used to generate the rating secret
  function revealTaskWorkRating(uint256 _id, uint8 _role, uint8 _rating, bytes32 _salt) public;

  /// @notice Helper function used to generage consistently the rating secret using salt value `_salt` and value to hide `_value`
  /// @param _salt Salt value
  /// @param _value Value to hide
  /// @return secret `keccak256` hash of joint _salt and _value
  function generateSecret(bytes32 _salt, uint256 _value) public pure returns (bytes32 secret);

  /// @notice Get the `ColonyStorage.RatingSecrets` for task `_id`
  /// @param _id Id of the task
  /// @return nSecrets Number of secrets
  /// @return lastSubmittedAt Timestamp of the last submitted rating secret
  function getTaskWorkRatings(uint256 _id) public view returns (uint256 nSecrets, uint256 lastSubmittedAt);

  /// @notice Get the rating secret submitted for role `_role` in task `_id`
  /// @param _id Id of the task
  /// @param _role Id of the role, as defined in `ColonyStorage` `MANAGER`, `EVALUATOR` and `WORKER` constants
  /// @return secret Rating secret `bytes32` value
  function getTaskWorkRatingSecret(uint256 _id, uint8 _role) public view returns (bytes32 secret);

  /// @notice Assigning manager role
  /// Current manager and user we want to assign role to both need to agree
  /// User we want to set here also needs to be an admin
  /// @dev This function can only be called through `executeTaskRoleAssignment`
  /// @param _id Id of the task
  /// @param _user Address of the user we want to give a manager role to
  function setTaskManagerRole(uint256 _id, address _user) public;

  /// @notice Assigning evaluator role
  /// Can only be set if there is no one currently assigned to be an evaluator
  /// Manager of the task and user we want to assign role to both need to agree
  /// Managers can assign themselves to this role, if there is no one currently assigned to it
  /// @dev This function can only be called through `executeTaskRoleAssignment`
  /// @param _id Id of the task
  /// @param _user Address of the user we want to give a evaluator role to
  function setTaskEvaluatorRole(uint256 _id, address _user) public;

  /// @notice Assigning worker role
  /// Can only be set if there is no one currently assigned to be a worker
  /// Manager of the task and user we want to assign role to both need to agree
  /// @dev This function can only be called through `executeTaskRoleAssignment`
  /// @param _id Id of the task
  /// @param _user Address of the user we want to give a worker role to
  function setTaskWorkerRole(uint256 _id, address _user) public;

  /// @notice Removing evaluator role
  /// Agreed between manager and currently assigned evaluator
  /// @param _id Id of the task
  function removeTaskEvaluatorRole(uint256 _id) public;

  /// @notice Removing worker role
  /// Agreed between manager and currently assigned worker
  /// @param _id Id of the task
  function removeTaskWorkerRole(uint256 _id) public;

  /// @notice Set the skill for task `_id`
  /// @dev Currently we only allow one skill per task although we have provisioned for an array of skills in `Task` struct
  /// Allowed before a task is finalized
  /// @param _id Id of the task
  /// @param _skillId Id of the skill which has to be a global skill
  function setTaskSkill(uint256 _id, uint256 _skillId) public;

  /// @notice Set the domain for task `_id`
  /// @param _id Id of the task
  /// @param _domainId Id of the domain
  function setTaskDomain(uint256 _id, uint256 _domainId) public;

  /// @notice Set the hash for the task brief, aka task work specification, which identifies the task brief content in ddb
  /// Allowed before a task is finalized
  /// @param _id Id of the task
  /// @param _specificationHash Unique hash of the task brief in ddb
  function setTaskBrief(uint256 _id, bytes32 _specificationHash) public;

  /// @notice Set the due date on task `_id`. Allowed before a task is finalized
  /// @param _id Id of the task
  /// @param _dueDate Due date as seconds since unix epoch
  function setTaskDueDate(uint256 _id, uint256 _dueDate) public;

  /// @notice Submit the task deliverable, i.e. the output of the work performed for task `_id`
  /// Submission is allowed only to the assigned worker before the task due date. Submissions cannot be overwritten
  /// @dev Set the `task.deliverableHash` and `task.completionTimestamp` properties
  /// @param _id Id of the task
  /// @param _deliverableHash Unique hash of the task deliverable content in ddb
  function submitTaskDeliverable(uint256 _id, bytes32 _deliverableHash) public;

  /// @notice Submit the task deliverable for Worker and rating for Manager
  /// @dev Internally call `submitTaskDeliverable` and `submitTaskWorkRating` in sequence
  /// @param _id Id of the task
  /// @param _deliverableHash Unique hash of the task deliverable content in ddb
  /// @param _ratingSecret Rating secret for manager
  function submitTaskDeliverableAndRating(uint256 _id, bytes32 _deliverableHash, bytes32 _ratingSecret) public;

  /// @notice Called after task work rating is complete which closes the task and logs the respective reputation log updates
  /// Allowed to be called once per task. Secured function to authorised members
  /// @dev Set the `task.finalized` property to true
  /// @param _id Id of the task
  function finalizeTask(uint256 _id) public;

  /// @notice Cancel a task at any point before it is finalized. Secured function to authorised members
  /// Any funds assigned to its funding pot can be moved back to the domain via `IColony.moveFundsBetweenPots`
  /// @dev Set the `task.status` property to 1
  /// @param _id Id of the task
  function cancelTask(uint256 _id) public;

  /// @notice Mark a task as complete after the due date has passed.
  /// This allows the task to be rated and finalized (and funds recovered) even in the presence of a worker who has disappeared.
  /// Note that if the due date was not set, then this function will throw.
  /// @param _id Id of the task
  function completeTask(uint256 _id) public;

  /// @notice Get a task with id `_id`
  /// @param _id Id of the task
  /// @return specificationHash Task brief hash
  /// @return deliverableHash Task deliverable hash
  /// @return status Status property. 0 - Active. 1 - Cancelled. 2 - Finalized
  /// @return dueDate Due date
  /// @return payoutsWeCannotMake Number of payouts that cannot be completed with the current task funding
  /// @return potId Id of funding pot for task
  /// @return completionTimestamp Task completion timestamp
  /// @return domainId Task domain id, default is root colony domain with id 1
  /// @return skillIds Array of global skill ids assigned to task
  function getTask(uint256 _id) public view returns (
    bytes32 specificationHash,
    bytes32 deliverableHash,
    uint8 status,
    uint256 dueDate,
    uint256 payoutsWeCannotMake,
    uint256 potId,
    uint256 completionTimestamp,
    uint256 domainId,
    uint256[] skillIds
    );

  /// @notice Get the `Role` properties back for role `_role` in task `_id`
  /// @param _id Id of the task
  /// @param _role Id of the role, as defined in `ColonyStorage` `MANAGER`, `EVALUATOR` and `WORKER` constants
  /// @return user Address of the user for the given role
  /// @return rateFail Whether the user failed to rate their counterpart
  /// @return rating Rating the user received
  function getTaskRole(uint256 _id, uint8 _role) public view returns (address user, bool rateFail, uint8 rating);

  // Implemented in ColonyFunding.sol
  /// @notice Return 1 / the fee to pay to the network. e.g. if the fee is 1% (or 0.01), return 100
  /// @return feeInverse The inverse of the network fee
  function getFeeInverse() public pure returns (uint256 feeInverse);

  /// @notice Return 1 / the reward to pay out from revenue. e.g. if the fee is 1% (or 0.01), return 100
  /// @return rewardInverse The inverse of the reward
  function getRewardInverse() public pure returns (uint256 rewardInverse);

  /// @notice Get payout amount in `_token` denomination for role `_role` in task `_id`
  /// @param _id Id of the task
  /// @param _role Id of the role, as defined in `ColonyStorage` `MANAGER`, `EVALUATOR` and `WORKER` constants
  /// @param _token Address of the token, `0x0` value indicates Ether
  /// @return amount Payout amount
  function getTaskPayout(uint256 _id, uint8 _role, address _token) public view returns (uint256 amount);

  /// @notice Get total payout amount in `_token` denomination for task `_id`
  /// @param _id Id of the task
  /// @param _token Address of the token, `0x0` value indicates Ether
  /// @return amount Payout amount
  function getTotalTaskPayout(uint256 _id, address _token) public view returns (uint256 amount);

  /// @notice Set `_token` payout for manager in task `_id` to `_amount`
  /// @param _id Id of the task
  /// @param _token Address of the token, `0x0` value indicates Ether
  /// @param _amount Payout amount
  function setTaskManagerPayout(uint256 _id, address _token, uint256 _amount) public;

  /// @notice Set `_token` payout for evaluator in task `_id` to `_amount`
  /// @param _id Id of the task
  /// @param _token Address of the token, `0x0` value indicates Ether
  /// @param _amount Payout amount
  function setTaskEvaluatorPayout(uint256 _id, address _token, uint256 _amount) public;

  /// @notice Set `_token` payout for worker in task `_id` to `_amount`
  /// @param _id Id of the task
  /// @param _token Address of the token, `0x0` value indicates Ether
  /// @param _amount Payout amount
  function setTaskWorkerPayout(uint256 _id, address _token, uint256 _amount) public;

  /// @notice Set `_token` payout for all roles in task `_id` to the respective amounts
  /// @dev Can only call if evaluator and worker are unassigned or manager, otherwise need signature
  /// @param _id Id of the task
  /// @param _token Address of the token, `0x0` value indicates Ether
  /// @param _managerAmount Payout amount for manager
  /// @param _evaluatorAmount Payout amount for evaluator
  /// @param _workerAmount Payout amount for worker
  function setAllTaskPayouts(uint256 _id,address _token,uint256 _managerAmount,uint256 _evaluatorAmount,uint256 _workerAmount) public;

  /// @notice Claim the payout in `_token` denomination for work completed in task `_id` by contributor with role `_role`
  /// Allowed only by the contributors themselves after task is finalized. Here the network receives its fee from each payout.
  /// Ether fees go straight to the Meta Colony whereas Token fees go to the Network to be auctioned off.
  /// @param _id Id of the task
  /// @param _role Id of the role, as defined in `ColonyStorage` `MANAGER`, `EVALUATOR` and `WORKER` constants
  /// @param _token Address of the token, `0x0` value indicates Ether
  function claimPayout(uint256 _id, uint8 _role, address _token) public;

  /// @notice Start next reward payout for `_token`. All funds in the reward pot for `_token` will become unavailable.
  /// All tokens will be locked, and can be unlocked by calling `waiveRewardPayout` or `claimRewardPayout`.
  /// @param _token Address of the token used for reward payout
  /// @param key Some Reputation hash tree key
  /// @param value Reputation value
  /// @param branchMask The branchmask of the proof
  /// @param siblings The siblings of the proof
  function startNextRewardPayout(address _token, bytes key, bytes value, uint256 branchMask, bytes32[] siblings) public;

  /// @notice Claim the reward payout at `_payoutId`. User needs to provide their reputation and colony-wide reputation
  /// which will be proven via Merkle proof inside this function.
  /// Can only be called if payout is active, i.e if 60 days have not passed from its creation.
  /// Can only be called if next in queue
  /// @param _payoutId Id of the reward payout
  /// @param _squareRoots Square roots of values used in equation
  /// _squareRoots[0] - square root of user reputation
  /// _squareRoots[1] - square root of user tokens
  /// _squareRoots[2] - square root of total reputation
  /// _squareRoots[3] - square root of total tokens
  /// _squareRoots[4] - square root of numerator (user reputation * user tokens)
  /// _squareRoots[5] - square root of denominator (total reputation * total tokens)
  /// _squareRoots[6] - square root of payout amount
  /// @param key Some Reputation hash tree key
  /// @param value Reputation value
  /// @param branchMask The branchmask of the proof
  /// @param siblings The siblings of the proof
  function claimRewardPayout(
    uint256 _payoutId,
    uint256[7] _squareRoots,
    bytes key,
    bytes value,
    uint256 branchMask,
    bytes32[] siblings
    ) public;

  /// @notice Get useful information about specific reward payout
  /// @param _payoutId Id of the reward payout
  /// @return reputationState Reputation root hash at the time of creation
  /// @return colonyWideReputation Colony wide reputation in `reputationState`
  /// @return totalTokens Total colony tokens at the time of creation
  /// @return amount Total amount of tokens taken aside for reward payout
  /// @return tokenAddress Token address
  /// @return blockTimestamp Block number at the time of creation
  function getRewardPayoutInfo(uint256 _payoutId) public view returns (
    bytes32 reputationState,
    uint256 colonyWideReputation,
    uint256 totalTokens,
    uint256 amount,
    address tokenAddress,
    uint256 blockTimestamp
    );

  /// @notice Finalises the reward payout. Allows creation of next reward payouts for token that has been used in `_payoutId`
  /// Can only be called when reward payout cycle is finished i.e when 60 days have passed from its creation
  /// @param _payoutId Id of the reward payout
  function finalizeRewardPayout(uint256 _payoutId) public;

  /// @notice Get the `_token` balance of pot with id `_potId`
  /// @param _potId Id of the funding pot
  /// @param _token Address of the token, `0x0` value indicates Ether
  /// @return balance Funding pot balance
  function getPotBalance(uint256 _potId, address _token) public view returns (uint256 balance);

  /// @notice Move a given amount: `_amount` of `_token` funds from funding pot with id `_fromPot` to one with id `_toPot`.
  /// Secured function to authorised members
  /// @param _fromPot Funding pot id providing the funds
  /// @param _toPot Funding pot id receiving the funds
  /// @param _amount Amount of funds
  /// @param _token Address of the token, `0x0` value indicates Ether
  function moveFundsBetweenPots(uint256 _fromPot, uint256 _toPot, uint256 _amount, address _token) public;

  /// @notice Move any funds received by the colony in `_token` denomination to the top-level domain pot,
  /// siphoning off a small amount to the reward pot. If called against a colony's own token, no fee is taken
  /// @param _token Address of the token, `0x0` value indicates Ether
  function claimColonyFunds(address _token) public;

  /// @notice Get the total amount of tokens `_token` minus amount reserved to be paid to the reputation and token holders as rewards
  /// @param _token Address of the token, `0x0` value indicates Ether
  /// @return amount Total amount of tokens in pots other than the rewards pot (id 0)
  function getNonRewardPotsTotal(address _token) public view returns (uint256 amount);
}
