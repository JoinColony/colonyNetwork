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
pragma experimental "ABIEncoderV2";


contract ColonyNetworkDataTypes {
  /// @notice Event logged when a new colony is added
  /// @dev Emitted from `IColonyNetwork.createColony` function
  /// @param colonyId The colony id in the network
  /// @param colonyAddress The colony address in the network
  event ColonyAdded(uint256 indexed colonyId, address indexed colonyAddress);

  /// @notice Event logged when a new skill is added
  /// @dev Emitted from `IColonyNetwork.addSkill` function
  /// @param skillId The skill id
  /// @param parentSkillId The id of the parent skill under which this new skill is added
  event SkillAdded(uint256 skillId, uint256 parentSkillId);

  /// @notice Event logged when a new auction is created and started
  /// @dev Emitted from `IColonyNetwork.startTokenAuction` function
  /// @param auction Address of the created auction contract
  /// @param token Address of the token for auction
  /// @param quantity Quantity of `token` to auction
  event AuctionCreated(address auction, address token, uint256 quantity);

  /// @notice Event logged when a reputation mining cycle completes
  /// @param hash The root hash of the newly accepted reputation state
  /// @param nNodes The number of nodes in the reputation state
  event ReputationMiningCycleComplete(bytes32 hash, uint256 nNodes);

  event UserLabelRegistered(address indexed user, bytes32 label);
  event ColonyLabelRegistered(address indexed colony, bytes32 label);

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

  struct ENSRecord {
    address addr;
    string orbitdb;
  }

  struct ReputationLogEntry {
    address user;
    int amount;
    uint256 skillId;
    address colony;
    uint256 nUpdates;
    uint256 nPreviousUpdates;
  }
}
