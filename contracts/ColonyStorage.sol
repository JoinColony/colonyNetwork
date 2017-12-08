pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";

import "../lib/dappsys/auth.sol";
import "./ERC20Extended.sol";


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

  uint taskCount;
  uint potCount;

  struct Task {
    bytes32 specificationHash;
    bytes32 deliverableHash;
    bool accepted;
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

  modifier taskExists(uint256 _id) {
    require(_id <= taskCount);
    _;
  }

  modifier taskNotAccepted(uint256 _id) {
    require(!tasks[_id].accepted);
    _;
  }

  modifier taskAccepted(uint256 _id) {
    require(tasks[_id].accepted);
    _;
  }

  modifier self() {
    require(address(this) == msg.sender);
    _;
  }

}
