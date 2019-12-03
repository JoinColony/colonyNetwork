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

pragma solidity 0.5.8;

import "../lib/dappsys/math.sol";
import "./ERC20Extended.sol";
import "./IColonyNetwork.sol";
import "./ColonyAuthority.sol";
import "./PatriciaTree/PatriciaTreeProofs.sol";
import "./CommonStorage.sol";
import "./ColonyDataTypes.sol";

// ignore-file-swc-131
// ignore-file-swc-108

contract ColonyStorage is CommonStorage, ColonyDataTypes, ColonyNetworkDataTypes, DSMath {
  uint256 constant COLONY_NETWORK_SLOT = 6;

  // When adding variables, do not make them public, otherwise all contracts that inherit from
  // this one will have the getters. Make custom getters in the contract that seems most appropriate,
  // and add it to IColony.sol

  address colonyNetworkAddress; // Storage slot 6
  address token; // Storage slot 7
  uint256 rewardInverse; // Storage slot 8

  uint256 taskCount; // Storage slot 9
  uint256 fundingPotCount; // Storage slot 10
  uint256 domainCount; // Storage slot 11

  // Mapping function signature to 2 task roles whose approval is needed to execute
  mapping (bytes4 => TaskRole[2]) reviewers; // Storage slot 12

  // Role assignment functions require special type of sign-off.
  // This keeps track of which functions are related to role assignment
  mapping (bytes4 => bool) roleAssignmentSigs; // Storage slot 13

  mapping (uint256 => Task) tasks; // Storage slot 14

  // FundingPots can be tied to tasks or domains, so giving them their own mapping.
  // FundingPot 1 can be thought of as the pot belonging to the colony itself that hasn't been assigned
  // to anything yet, but has had some siphoned off in to the reward pot.
  // FundingPot 0 is the 'reward' pot containing funds that can be paid to holders of colony tokens in the future.
  mapping (uint256 => FundingPot) fundingPots; // Storage slot 15

  // Keeps track of all reward payout cycles
  mapping (uint256 => RewardPayoutCycle) rewardPayoutCycles; // Storage slot 16
  // Active payouts for particular token address. Assures that one token is used for only one active payout
  mapping (address => bool) activeRewardPayouts; // Storage slot 17

  // This keeps track of how much of the colony's funds that it owns have been moved into funding pots other than pot 0,
  // which (by definition) have also had the reward amount siphoned off and put in to pot 0.
  // This is decremented whenever a payout occurs and the colony loses control of the funds.
  mapping (address => uint256) nonRewardPotsTotal; // Storage slot 18

  mapping (uint256 => RatingSecrets) public taskWorkRatings; // Storage slot 19

  mapping (uint256 => Domain) public domains; // Storage slot 20

  // Mapping task id to current "active" nonce for executing task changes
  mapping (uint256 => uint256) taskChangeNonces; // Storage slot 21

  uint256 paymentCount; // Storage slot 22
  mapping (uint256 => Payment) payments; // Storage slot 23

  uint256 expenditureCount; // Storage slot 24
  mapping (uint256 => Expenditure) expenditures; // Storage slot 25
  mapping (uint256 => mapping (uint256 => ExpenditureSlot)) expenditureSlots; // Storage slot 26
  mapping (uint256 => mapping (uint256 => mapping (address => uint256))) expenditureSlotPayouts; // Storage slot 27

  address _relayHub; // Slot 28
}
