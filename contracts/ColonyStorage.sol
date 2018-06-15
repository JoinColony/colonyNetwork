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
import "./ERC20Extended.sol";
import "./IColonyNetwork.sol";


contract ColonyStorage is DSAuth {
  // When adding variables, do not make them public, otherwise all contracts that inherit from
  // this one will have the getters. Make custom getters in the contract that seems most appropriate,
  // and add it to IColony.sol

  address resolver;
  address colonyNetworkAddress;
  ERC20Extended token;

  // Mapping function signature to 2 task roles whose approval is needed to execute
  mapping (bytes4 => uint8[2]) reviewers;
  uint256 taskChangeNonce; // Made obsolete in #203

  mapping (uint256 => Task) tasks;

  // Pots can be tied to tasks or domains, so giving them their own mapping.
  // Pot 1 can be thought of as the pot belonging to the colony itself that hasn't been assigned
  // to anything yet, but has had some siphoned off in to the reward pot.
  // Pot 0 is the 'reward' pot containing funds that can be paid to holders of colony tokens in the future.
  mapping (uint256 => Pot) pots;

  struct RewardPayoutCycle {
    // Reputation root hash at the time of reward payout creation
    bytes32 reputationState;
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
  // Incremented every time a reward payout is created. Used for comparing with `userRewardPayoutCount`
  // to ensure that rewards are claimed in the right order.
  // Can be used for iterating over all reward payouts (excluding index 0)
  uint256 globalRewardPayoutCount;
  // Keeps track of how many payouts are claimed by the particular user.
  // Can be incremented either by waiving or claiming the reward.
  mapping (address => uint256) userRewardPayoutCount;

  // This keeps track of how much of the colony's funds that it owns have been moved into pots other than pot 0,
  // which (by definition) have also had the reward amount siphoned off and put in to pot 0.
  // This is decremented whenever a payout occurs and the colony loses control of the funds.
  mapping (address => uint256) nonRewardPotsTotal;

  mapping (uint256 => RatingSecrets) public taskWorkRatings;

  mapping (uint256 => Domain) public domains;

  uint256 taskCount;
  uint256 potCount;
  uint256 domainCount;

  uint8 constant MANAGER = 0;
  uint8 constant EVALUATOR = 1;
  uint8 constant WORKER = 2;

  // Mapping task id to current "active" nonce for executing task changes
  mapping (uint256 => uint256) taskChangeNonces;

  struct Task {
    bytes32 specificationHash;
    bytes32 deliverableHash;
    bool finalized;
    bool cancelled;
    uint256 dueDate;
    uint256 payoutsWeCannotMake;
    uint256 potId;
    uint256 deliverableTimestamp;
    uint256 domainId;
    uint256[] skills;

    // TODO switch this mapping to a uint8 when all role instances are uint8-s specifically ColonyFunding source
    mapping (uint256 => Role) roles;
    // Maps a token to the sum of all payouts of it for this task
    mapping (address => uint256) totalPayouts;
    // Maps task role ids (0,1,2..) to a token amount to be paid on task completion
    mapping (uint256 => mapping (address => uint256)) payouts;
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

  modifier isManager(uint256 _id) {
    Task storage task = tasks[_id];
    require(task.roles[0].user == msg.sender);
    _;
  }

  modifier taskExists(uint256 _id) {
    require(_id <= taskCount);
    _;
  }

  modifier taskNotFinalized(uint256 _id) {
    require(!tasks[_id].finalized);
    _;
  }

  modifier taskFinalized(uint256 _id) {
    require(tasks[_id].finalized);
    _;
  }

  modifier globalSkill(uint256 _skillId) {
    IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
    require(colonyNetworkContract.isGlobalSkill(_skillId));
    _;
  }

  modifier localSkill(uint256 _skillId) {
    IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
    require(!colonyNetworkContract.isGlobalSkill(_skillId));
    _;
  }

  modifier skillExists(uint256 _skillId) {
    IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
    require(_skillId <= colonyNetworkContract.getSkillCount());
    _;
  }

  modifier domainExists(uint256 _domainId) {
    require(_domainId <= domainCount);
    _;
  }

  modifier isInBootstrapPhase() {
    require(taskCount == 0);
    _;
  }

  modifier self() {
    require(address(this) == msg.sender);
    _;
  }
}
