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

import "../lib/dappsys/math.sol";
import "./ERC20Extended.sol";
import "./IColony.sol";
import "./CommonStorage.sol";


contract ColonyNetworkStorage is CommonStorage, DSMath {
  // Number of colonies in the network
  uint256 colonyCount;
  // uint256 version number of the latest deployed Colony contract, used in creating new colonies
  uint256 currentColonyVersion;
  // Address of the Meta Colony
  address metaColony;
  // Address of token locking contract
  address tokenLocking;
  // Maps index to colony address
  mapping (uint256 => address) colonies;
  mapping (address => bool) _isColony;
  // Maps colony contract versions to respective resolvers
  mapping (uint256 => address) colonyVersionResolver;
  // Contains the address of the resolver for ReputationMiningCycle
  address miningCycleResolver;

  struct Skill {
    // total number of parent skills
    uint256 nParents;
    // total number of child skills
    uint256 nChildren;
    // array of `skill_id`s of parent skills starting from the 1st to `n`th, where `n` is an integer power of two larger than or equal to 1
    uint256[] parents;
    // array of `skill_id`s of all child skills
    uint256[] children;
    // `true` for a global skill reused across colonies or `false` for a skill mapped to a single colony's domain
    bool globalSkill;
  }
  // Contains all global and local skills in the network, mapping skillId to Skill. Where skillId is 1-based unique identifier
  mapping (uint256 => Skill) skills;
  // Number of skills in the network, including both global and local skills
  uint256 skillCount;
  // skillId of the root global skills tree
  uint256 rootGlobalSkillId;

  // Address of the currently active reputation mining cycle contract
  address activeReputationMiningCycle;
  // Address of the next active reputation mining cycle contract, which is where new reputation updates are put.
  address inactiveReputationMiningCycle;
  // The reputation root hash of the reputation state tree accepted at the end of the last completed update cycle
  bytes32 reputationRootHash;
  // The number of nodes in the reputation state tree that was accepted at the end of the last mining cycle
  uint256 reputationRootHashNNodes;
  // Mapping containing how much has been staked by each user
  mapping (address => uint) stakedBalances;

  // Mapping containing the last auction start timestamp for a token address
  mapping (address => uint) recentAuctions;

  // Address of the ENS registrar for joincolony.eth
  address ens;
  // Namehash of the root node that we administer (i.e. namehash("joincolony.eth"))
  bytes32 rootNode;
  // Namehash of the users node that we administer (i.e. namehash("user.joincolony.eth"))
  bytes32 userNode;
  // Namehash of the colony node that we administer (i.e. namehash("colony.joincolony.eth"))
  bytes32 colonyNode;
  // Mapping from colony address to claimed colony label
  mapping (address => string) colonyLabels;
  // Mapping from user address to claimed user label
  mapping (address => string) userLabels;

  struct ENSRecord {
    address addr;
    string orbitdb;
  }

  mapping (bytes32 => ENSRecord) records;

  struct ReputationLogEntry {
    address user;
    int amount;
    uint256 skillId;
    address colony;
    uint256 nUpdates;
    uint256 nPreviousUpdates;
  }
  mapping (address => mapping(uint256 => ReputationLogEntry)) replacementReputationUpdateLog;
  mapping (address => bool) replacementReputationUpdateLogsExist;

  // Using the same value as we did in Colony to (hopefully) avoid confusion.
  uint8 constant RECOVERY_ROLE = 2;

  modifier calledByColony() {
    require(_isColony[msg.sender], "colony-caller-must-be-colony");
    _;
  }

  modifier notCalledByColony() {
    require(!_isColony[msg.sender], "colony-caller-must-not-be-colony");
    _;
  }

  modifier recovery() {
    require(recoveryMode, "colony-not-in-recovery-mode");
    _;
  }

  modifier stoppable {
    require(!recoveryMode, "colony-in-recovery-mode");
    _;
  }

  modifier always {
    _;
  }
}
