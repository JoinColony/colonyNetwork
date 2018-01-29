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

import "../lib/dappsys/auth.sol";
import "./ERC20Extended.sol";
import "./IColonyNetwork.sol";


contract ColonyStorage is DSAuth {
  // When adding variables, do not make them public, otherwise all contracts that inherit from
  // this one will have the getters. Make custom getters in the contract that seems most appropriate,
  // and add it to IColony.sol

  address resolver;

  mapping (uint => Transaction) transactions;
  // Mapping function signature to 2 task roles whose approval is needed to execute
  mapping (bytes4 => uint8[2]) reviewers;
  // Maps transactions to roles and whether they've confirmed the transaction
  mapping (uint => mapping (uint => bool)) confirmations;
  uint transactionCount;

  struct Transaction {
    bytes data;
    uint value;
    bool executed;
  }

  address colonyNetworkAddress;
  ERC20Extended token;
  mapping (uint => Task) tasks;

  // Pots can be tied to tasks or to (in the future) domains, so giving them their own mapping.
  // Pot 1  can be thought of as the pot belonging to the colony itself that hasn't been assigned
  // to anything yet, but has had some siphoned off in to the reward pot.
  // Pot 0 is the pot containing funds that can be paid to holders of colony tokens in the future.
  mapping (uint => Pot) pots;

  // This keeps track of how much of the colony's funds that it owns have been moved into pots other than pot 0,
  // which (by definition) have also had the reward amount siphoned off and put in to pot 0.
  // TODO: This needs to be decremented whenever a payout occurs and the colony loses control of the funds.
  mapping (address => uint) nonRewardPotsTotal;

  mapping (uint => RatingSecrets) public taskWorkRatings;

  mapping (uint => Domain) public domains;

  uint taskCount;
  uint potCount;
  uint domainCount;

  struct Task {
    bytes32 specificationHash;
    bytes32 deliverableHash;
    bool finalized;
    bool cancelled;
    uint dueDate;
    uint payoutsWeCannotMake;
    uint potId;
    uint deliverableTimestamp;
    uint domainId;
    uint[] skillIds;

    // TODO switch this mapping to a uint8 when all role instances are uint8-s specifically ColonyFunding source
    mapping (uint => Role) roles; 
    // Maps a token to the sum of all payouts of it for this task
    mapping (address => uint) totalPayouts;
    // Maps task role ids (0,1,2..) to a token amount to be paid on task completion
    mapping (uint => mapping (address => uint)) payouts;
  }

  struct Role {
    // Address of the user for the given role
    address user;
    // Has the user work been rated
    bool rated;
    // Rating the user received
    uint8 rating;
  }

  struct RatingSecrets {
    uint256 count;
    uint256 timestamp;
    mapping (uint8 => bytes32) secret;
  }

  struct Pot {
    mapping (address => uint) balance;
    uint taskId;
  }

  struct Domain {
    uint skillId;
    uint potId;
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

  modifier self() {
    require(address(this) == msg.sender);
    _;
  }

  modifier selfOrCommonColony() {
    IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
    address commonColony = colonyNetworkContract.getColony("Common Colony");
    require(address(this) == msg.sender || address(this) == commonColony);
    _;
  }
}
