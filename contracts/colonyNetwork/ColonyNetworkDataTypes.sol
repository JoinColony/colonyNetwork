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

pragma solidity 0.7.3;

interface ColonyNetworkDataTypes {
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

  /// @notice Event logged when the payout whitelist is updated
  /// @param token The token being set
  /// @param status The whitelist status
  event TokenWhitelisted(address token, bool status);

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

  /// @notice Event logged when the mining reward is set
  /// @param amount Amount of the reward
  event ReputationMiningRewardSet(uint256 amount);

  /// @notice Event logged when a reputation mining cycle completes
  /// @param hash The root hash of the newly accepted reputation state
  /// @param nLeaves The number of leaves in the reputation state
  event ReputationMiningCycleComplete(bytes32 hash, uint256 nLeaves);

  /// @notice Event logged when a new reputation root hash is set by the reputation mining process
  /// @param newHash The reputation root hash
  /// @param newNLeaves The updated leaves count value
  /// @param stakers Array of users who submitted or backed the hash accepted
  /// @param reward Amount of CLNY distributed as reward to miners
  event ReputationRootHashSet(bytes32 newHash, uint256 newNLeaves, address[] stakers, uint256 reward);

  /// @notice Event logged when the ENS registrar is initialised
  /// @param ens Address of ENS registrar
  /// @param rootNode Namehash of the root node for the domain
  event RegistrarInitialised(address ens, bytes32 rootNode);

  /// @notice Event logged when a "user.joincolony.eth" label is registered
  /// @param user The user address registered
  /// @param label The label registered
  event UserLabelRegistered(address indexed user, bytes32 label);

  /// @notice Event logged when a "colony.joincolony.eth" label is registered
  /// @param colony The colony address registered
  /// @param label The label registered
  event ColonyLabelRegistered(address indexed colony, bytes32 label);

  event ReputationMinerPenalised(address miner, uint256 tokensLost);

  /// @notice Event logged when a new extension resolver is added to the network
  /// @param extensionId The identifier for the extension
  /// @param version The version of the extension
  event ExtensionAddedToNetwork(bytes32 indexed extensionId, uint256 version);

  /// @notice Event logged when an extension is installed in a colony
  /// @param extensionId The identifier for the extension
  /// @param colony The address of the colony
  /// @param version The version of the extension
  event ExtensionInstalled(bytes32 indexed extensionId, address indexed colony, uint256 version);

  /// @notice Event logged when an extension is upgraded in a colony
  /// @param extensionId The identifier for the extension
  /// @param colony The address of the colony
  /// @param version The new version of the extension
  event ExtensionUpgraded(bytes32 indexed extensionId, address indexed colony, uint256 version);

  /// @notice Event logged when an extension is (un)deprecated in a colony
  /// @param extensionId The identifier for the extension
  /// @param colony The address of the colony
  /// @param deprecated Whether the extension is deprecated or not
  event ExtensionDeprecated(bytes32 indexed extensionId, address indexed colony, bool deprecated);

  /// @notice Event logged when an extension is uninstalled from a colony
  /// @param extensionId The identifier for the extension
  /// @param colony The address of the colony
  event ExtensionUninstalled(bytes32 indexed extensionId, address indexed colony);

  /// @notice Event logged when a token is deployed via transaction through the colony network
  /// @param tokenAddress The address of the token deployed
  event TokenDeployed(address tokenAddress);

  /// @notice Event logged when a token authority is deployed via transaction through the colony network
  /// @param tokenAuthorityAddress The address of the token authority deployed
  event TokenAuthorityDeployed(address tokenAuthorityAddress);

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

  struct MiningStake {
    uint256 amount;
    uint256 timestamp;
  }
}
