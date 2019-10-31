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

pragma solidity >=0.5.8 <0.7.0;


contract ColonyNetworkDataTypes {
  /// @notice Event logged when the colony network is intialised. This is only ever emitted once in a network's lifetime
  /// @param resolver The Resolver contract address used by the Colony version 1
  event ColonyNetworkInitialised(address resolver);

  /// @notice Event logged when the Colony Network TokenLocking contract address is set
  /// @param tokenLocking Address of the TokenLocking contract
  event TokenLockingAddressSet(address tokenLocking);

  /// @notice Event logged when the Colony Network ReputationMiningCycleResolver contract address is set
  /// @param miningCycleResolver Resolver address for the ReputationMiningCycle contract
  event MiningCycleResolverSet(address miningCycleResolver);

  /// @notice Event logged when the network fee inverse is set
  /// @param feeInverse The network fee inverse value
  event NetworkFeeInverseSet(uint256 feeInverse);

  /// @notice Event logged when a new colony contract version is set
  /// @param version The new int colony version, e.g. 2, 3, 4, etc
  /// @param resolver The new colony contract resolver contract instance
  event ColonyVersionAdded(uint256 version, address resolver);

  /// @notice Event logged when the MetaColony is created
  /// @param metaColony Address of the MetaColony instance (i.e. EtherRouter)
  /// @param token Address of the associated CLNY token
  /// @param rootSkillId Id of the root skill of the global skills tree, normally this is 2
  /// Note that the speciat mining skill is created at rootSkillId + 1, so normally this is 3
  /// Skill id 1 is normally the local skill associate with meta colony domain 1
  event MetaColonyCreated(address metaColony, address token, uint256 rootSkillId);

  /// @notice Event logged when a new colony is added
  /// @dev Emitted from `IColonyNetwork.createColony` function
  /// @param colonyId The colony id in the network
  /// @param colonyAddress The colony address in the network
  /// @param token Address of the associated colony token
  event ColonyAdded(uint256 indexed colonyId, address indexed colonyAddress, address token);

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

  /// @notice Event logged when the Reputation mining process is initialised
  /// @param inactiveReputationMiningCycle Address of the newly created ReputationMiningCycle used in logging reputation changes
  event ReputationMiningInitialised(address inactiveReputationMiningCycle);

  /// @notice Event logged when a reputation mining cycle completes
  /// @param hash The root hash of the newly accepted reputation state
  /// @param nNodes The number of nodes in the reputation state
  event ReputationMiningCycleComplete(bytes32 hash, uint256 nNodes);

  /// @notice Event logged when a new reputation root hash is set by the reputation mining process
  /// @param newHash The reputation root hash
  /// @param newNNodes The updated nodes count value
  /// @param stakers Array of users who submitted or backed the hash accepted
  /// @param reward Amount of CLNY distributed as reward to miners
  event ReputationRootHashSet(bytes32 newHash, uint256 newNNodes, address[] stakers, uint256 reward);

  /// @notice Event logged when a "user.joincolony.eth" label is registered
  /// @param user The user address registered
  /// @param label The label registered
  event UserLabelRegistered(address indexed user, bytes32 label);

  /// @notice Event logged when a "colony.joincolony.eth" label is registered
  /// @param colony The colony address registered
  /// @param label The label registered
  event ColonyLabelRegistered(address indexed colony, bytes32 label);

  struct Skill {
    // total number of parent skills
    uint128 nParents;
    // total number of child skills
    uint128 nChildren;
    // array of `skill_id`s of parent skills starting from the 1st to `n`th, where `n` is an integer power of two larger than or equal to 1
    uint256[] parents;
    // array of `skill_id`s of all child skills
    uint256[] children;
    // `true` for a global skill reused across colonies or `false` for a skill mapped to a single colony's domain
    bool globalSkill;
    // `true` for a global skill that is deprecated
    bool deprecated;
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
    uint128 nUpdates;
    uint128 nPreviousUpdates;
  }
}
