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
import "../lib/dappsys/roles.sol";
import "./Authority.sol";
import "./IColony.sol";
import "./EtherRouter.sol";
import "./Token.sol";


contract ColonyNetworkStorage is DSAuth {
  address resolver;
  uint256 colonyCount;
  uint256 currentColonyVersion;
  // TODO: We can probably do better than having three colony-related mappings
  mapping (uint256 => address) _coloniesIndex;
  mapping (bytes32 => address) _colonies;
  mapping (address => bool) _isColony;
  // Maps colony contract versions to respective resolvers
  mapping (uint256 => address) colonyVersionResolver;

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
  mapping (uint256 => Skill) skills;
  uint256 skillCount;
  uint256 rootGlobalSkillId;

  struct ReputationLogEntry {
    address user;
    int amount;
    uint256 skillId;
    address colony;
    uint256 nUpdates;
    uint256 nPreviousUpdates;
  }

  mapping (uint => ReputationLogEntry[]) ReputationUpdateLogs;
  uint256 activeReputationUpdateLog;

  bytes32 reputationRootHash;
  mapping (address => uint) stakedBalances;
  address reputationMiningCycle;
  uint256 reputationRootHashNNodes;
}
