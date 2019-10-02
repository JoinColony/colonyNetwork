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

import "./../../lib/dappsys/math.sol";
import "./../colony/IMetaColony.sol";
import "./../common/CommonStorage.sol";
import "./../common/ERC20Extended.sol";
import "./ColonyNetworkDataTypes.sol";

// ignore-file-swc-131
// ignore-file-swc-108


contract ColonyNetworkStorage is CommonStorage, ColonyNetworkDataTypes, DSMath {
  // Number of colonies in the network
  uint256 colonyCount; // Storage slot 6
  // uint256 version number of the latest deployed Colony contract, used in creating new colonies
  uint256 currentColonyVersion; // Storage slot 7
  // Address of the Meta Colony
  address metaColony; // Storage slot 8
  // Address of token locking contract
  address tokenLocking; // Storage slot 9
  // Network fee inverse value, e.g 5% => 100/5=20, 1% => 100/1=100 etc.
  uint256 feeInverse; // Storage slot 10
  // Number of skills in the network, including both global and local skills
  uint256 skillCount; // Storage slot 11
  // skillId of the mining skill
  uint256 reputationMiningSkillId; // Storage slot 12

  // The reputation root hash of the reputation state tree accepted at the end of the last completed update cycle
  bytes32 reputationRootHash; // Storage slot 13
  // The number of leaves in the reputation state tree that was accepted at the end of the last mining cycle
  uint256 reputationRootHashNLeaves; // Storage slot 14

  // Contains the address of the resolver for ReputationMiningCycle
  address miningCycleResolver; // Storage slot 15
  // Address of the currently active reputation mining cycle contract
  address activeReputationMiningCycle; // Storage slot 16
  // Address of the next active reputation mining cycle contract, which is where new reputation updates are put.
  address inactiveReputationMiningCycle; // Storage slot 17

  // Maps index to colony address
  mapping (uint256 => address) colonies; // Storage slot 18
  mapping (address => bool) _isColony; // Storage slot 19
  // Maps colony contract versions to respective resolvers
  mapping (uint256 => address) colonyVersionResolver; // Storage slot 20
  // Contains all global and local skills in the network, mapping skillId to Skill. Where skillId is 1-based unique identifier
  mapping (uint256 => Skill) skills; // Storage slot 21

  // Mapping containing how much has been staked by each user
  mapping (address => uint) stakedBalances; // Storage slot 22

  // Mapping containing the last auction start timestamp for a token address
  mapping (address => uint) recentAuctions; // Storage slot 23

  // Address of the ENS registrar for joincolony.eth
  address ens; // Storage slot 24
  // Namehash of the root node that we administer (i.e. namehash("joincolony.eth"))
  bytes32 rootNode; // Storage slot 25
  // Namehash of the users node that we administer (i.e. namehash("user.joincolony.eth"))
  bytes32 userNode; // Storage slot 26
  // Namehash of the colony node that we administer (i.e. namehash("colony.joincolony.eth"))
  bytes32 colonyNode; // Storage slot 27
  // Mapping from colony address to claimed colony label
  mapping (address => string) colonyLabels; // Storage slot 28
  // Mapping from user address to claimed user label
  mapping (address => string) userLabels; // Storage slot 29

  mapping (bytes32 => ENSRecord) records; // Storage slot 30
  mapping (address => mapping(uint256 => ReputationLogEntry)) replacementReputationUpdateLog; // Storage slot 31
  mapping (address => bool) replacementReputationUpdateLogsExist; // Storage slot 32
  mapping (address => MiningStake) miningStakes; // Storage slot 33
  mapping (address => uint256) pendingMiningRewards; // Storage slot 34

  uint256 totalMinerRewardPerCycle; // Storage slot 35
  uint256 annualMetaColonyStipend; // Storage slot 36
  uint256 lastMetaColonyStipendIssued; // Storage slot 37

  address extensionManagerAddress; // Storage slot 33

  modifier calledByColony() {
    require(_isColony[msg.sender], "colony-caller-must-be-colony");
    _;
  }

  modifier notCalledByColony() {
    require(!_isColony[msg.sender], "colony-caller-must-not-be-colony");
    _;
  }

  modifier calledByMetaColony() {
    require(msg.sender == metaColony, "colony-caller-must-be-meta-colony");
    _;
  }
}
