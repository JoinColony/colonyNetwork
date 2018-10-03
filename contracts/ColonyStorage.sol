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

import "../lib/dappsys/auth.sol";
import "../lib/dappsys/math.sol";
import "./ERC20Extended.sol";
import "./IColonyNetwork.sol";
import "./Authority.sol";
import "./PatriciaTree/PatriciaTreeProofs.sol";


contract ColonyStorage is DSAuth, DSMath {
  // When adding variables, do not make them public, otherwise all contracts that inherit from
  // this one will have the getters. Make custom getters in the contract that seems most appropriate,
  // and add it to IColony.sol

  event DomainAdded(uint256 indexed id);
  event PotAdded(uint256 indexed id);

  address resolver;
  address colonyNetworkAddress;
  ERC20Extended token;

  // Mapping function signature to 2 task roles whose approval is needed to execute
  mapping (bytes4 => uint8[2]) reviewers;

  // Role assignment functions require special type of sign-off.
  // This keeps track of which functions are related to role assignment
  mapping (bytes4 => bool) roleAssignmentSigs;

  mapping (uint256 => Task) tasks;

  // Pots can be tied to tasks or domains, so giving them their own mapping.
  // Pot 1 can be thought of as the pot belonging to the colony itself that hasn't been assigned
  // to anything yet, but has had some siphoned off in to the reward pot.
  // Pot 0 is the 'reward' pot containing funds that can be paid to holders of colony tokens in the future.
  mapping (uint256 => Pot) pots;

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

  // Keeps track of all reward payout cycles
  mapping (uint256 => RewardPayoutCycle) rewardPayoutCycles;
  // Active payouts for particular token address. Assures that one token is used for only one active payout
  mapping (address => bool) activeRewardPayouts;

  // This keeps track of how much of the colony's funds that it owns have been moved into pots other than pot 0,
  // which (by definition) have also had the reward amount siphoned off and put in to pot 0.
  // This is decremented whenever a payout occurs and the colony loses control of the funds.
  mapping (address => uint256) nonRewardPotsTotal;

  mapping (uint256 => RatingSecrets) public taskWorkRatings;

  mapping (uint256 => Domain) public domains;

  uint256 taskCount;
  uint256 potCount;
  uint256 domainCount;

  // Colony-wide roles
  uint8 constant OWNER_ROLE = 0;
  uint8 constant ADMIN_ROLE = 1;
  uint8 constant RECOVERY_ROLE = 2;

  // Task Roles
  uint8 constant MANAGER = 0;
  uint8 constant EVALUATOR = 1;
  uint8 constant WORKER = 2;

  // Task States
  uint8 constant ACTIVE = 0;
  uint8 constant CANCELLED = 1;
  uint8 constant FINALIZED = 2;

  // Variables for recovery mode
  bool recoveryMode;
  uint64 recoveryRolesCount;
  uint64 recoveryApprovalCount;
  uint256 recoveryEditedTimestamp;
  mapping (address => uint256) recoveryApprovalTimestamps;

  // Mapping task id to current "active" nonce for executing task changes
  mapping (uint256 => uint256) taskChangeNonces;

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

    // TODO switch this mapping to a uint8 when all role instances are uint8-s specifically ColonyFunding source
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

  modifier confirmTaskRoleIdentity(uint256 _id, uint8 _role) {
    Role storage role = tasks[_id].roles[_role];
    require(msg.sender == role.user, "colony-task-role-identity-mismatch");
    _;
  }

  modifier taskExists(uint256 _id) {
    require(_id <= taskCount, "colony-task-does-not-exist");
    _;
  }

  modifier taskNotFinalized(uint256 _id) {
    require(tasks[_id].status != FINALIZED, "colony-task-already-finalized");
    _;
  }

  modifier taskFinalized(uint256 _id) {
    require(tasks[_id].status == FINALIZED, "colony-task-not-finalized");
    _;
  }

  modifier globalSkill(uint256 _skillId) {
    IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
    bool isGlobalSkill;
    (, , isGlobalSkill) = colonyNetworkContract.getSkill(_skillId);
    require(isGlobalSkill, "colony-not-global-skill");
    _;
  }

  modifier skillExists(uint256 _skillId) {
    IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
    require(_skillId <= colonyNetworkContract.getSkillCount(), "colony-skill-does-not-exist");
    _;
  }

  modifier domainExists(uint256 _domainId) {
    require(_domainId <= domainCount, "colony-domain-does-not-exist");
    _;
  }

  modifier isInBootstrapPhase() {
    require(taskCount == 0, "colony-not-in-bootstrap-mode");
    _;
  }

  modifier isAdmin(address _user) {
    require(Authority(authority).hasUserRole(_user, ADMIN_ROLE), "colony-not-admin");
    _;
  }

  modifier recovery() {
    require(recoveryMode, "colony-not-in-recovery-mode");
    _;
  }

  modifier stoppable() {
    require(!recoveryMode, "colony-in-recovery-mode");
    _;
  }

  modifier self() {
    require(address(this) == msg.sender, "colony-not-self");
    _;
  }
}
