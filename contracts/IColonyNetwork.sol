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

pragma solidity ^0.4.21;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";


/// @title Colony Network interface
/// @notice All publicly available functions are available here and registered to work with EtherRouter Network contract
contract IColonyNetwork {

  /// @notice Event logged when a new colony is added
  /// @dev Emitted from `IColonyNetwork.createColony` function
  /// @param id The colony id in the network
  event ColonyAdded(uint256 indexed id);

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

  /// @notice Get the colony address by its `key`
  /// @param key The unique key of the required colony
  /// @return The colony address, if no colony was found, returns 0x0
  function getColony(bytes32 key) public view returns (address);

  /// @notice Get the number of colonies in the network
  /// @return The colony count
  function getColonyCount() public view returns (uint256);

  /// @notice Adds a new skill to the global or local skills tree, under skill `_parentSkillId`
  /// Only the Common Colony is allowed to add a global skill, called via `IColony.addGlobalSkill`
  /// Any colony is allowed to add a local skill and which is associated with a new domain via `IColony.addDomain`
  /// @dev Errors if the parent skill does not exist or if this is called by an unauthorised sender
  /// @param _parentSkillId Id of the skill under which the new skill will be added
  /// @param _globalSkill true if the new skill is global, false if it is local
  /// @return Id of the added skill
  function addSkill(uint256 _parentSkillId, bool _globalSkill) public returns (uint256);

  /// @notice Get the `nParents` and `nChildren` of skill with id `_skillId`
  /// @param _skillId Id of the skill
  /// @return uint256 `skill.nParents` i.e. the number of parent skills of skill with id `_skillId`
  /// @return uint256 `skill.nChildren` i.e. the number of child skills of skill with id `_skillId`
  function getSkill(uint256 _skillId) public view returns (uint256, uint256);

  /// @notice Checks if skill with id `_skillId` is a global skill
  /// @param _skillId Id of the skill
  /// @return true if skill with id `_skillId` is a global skill, false otherwise
  function isGlobalSkill(uint256 _skillId) public view returns (bool);

  /// @notice Adds a reputation update entry to log
  /// @dev Errors if it is called by anyone but a colony or if skill with id `_skillId` does not exist or 
  /// @param _user The address of the user for the reputation update
  /// @param _amount The amount of reputation change for the update, this can be a negative as well as a positive value
  /// @param _skillId The skill for the reputation update
  function appendReputationUpdateLog(address _user, int256 _amount, uint256 _skillId) public;

  /// @notice Get the number of skills in the network including both global and local skills
  /// @return The skill count
  function getSkillCount() public view returns (uint256);

  /// @notice Get the id of the root global skill
  /// @dev This is set once when the Common Colony is created
  /// @return The root global skill id
  function getRootGlobalSkillId() public view returns (uint256);

  /// @notice Creates a new colony in the network
  /// @dev Errors if there is already a colony with the specified `_name`
  /// Note that the token ownership (if there is one) has to be transferred to the newly created colony
  /// @param _name A unique key for the new colony
  /// @param _tokenAddress Address of an ERC20 token to serve as the colony token
  /// Additionally token can optionally support `mint` as defined in `ERC20Extended`
  /// Support for `mint` in mandatory only for the Common Colony Token
  function createColony(bytes32 _name, address _tokenAddress) public;

  /// @notice Adds a new Colony contract version and the address of associated `_resolver` contract. Secured function to authorised members
  /// @param _version The new Colony contract version
  /// @param _resolver Address of the `Resolver` contract which will be used with the underlying `EtherRouter` contract
  function addColonyVersion(uint256 _version, address _resolver) public;

  /// @notice Get a colony address by its Id in the network
  /// @param _idx Id of the colony to get
  /// @return The colony address, if no colony was found, returns 0x0
  function getColonyAt(uint256 _idx) public view returns (address);

  /// @notice Returns the latest Colony contract version. This is the version used to create all new colonies
  /// @return The current / latest Colony contract version
  function getCurrentColonyVersion() public view returns (uint256);

  /// @notice Upgrades a colony with key identifier: `_name` to a new Colony contract version `_newVersion`
  /// @dev Downgrades are not allowed, i.e. `_newVersion` should be higher than the currect colony version
  /// @param _name The unique colony identifier in the network
  /// @param _newVersion The target version for the upgrade
  function upgradeColony(bytes32 _name, uint256 _newVersion) public;

  /// @notice Get the id of the parent skill at index `_parentSkillIndex` for skill with Id `_skillId`
  /// @param _skillId Id of the skill
  /// @param _parentSkillIndex Index of the `skill.parents` array to get
  /// Note that not all parent skill ids are stored here. See `Skill.parents` member for definition on which parents are stored
  /// @return Skill Id of the requested parent skill
  function getParentSkillId(uint256 _skillId, uint256 _parentSkillIndex) public view returns (uint256);

  /// @notice Get the id of the child skill at index `_childSkillIndex` for skill with Id `_skillId`
  /// @param _skillId Id of the skill
  /// @param _childSkillIndex Index of the `skill.children` array to get
  /// @return Skill Id of the requested child skill
  function getChildSkillId(uint256 _skillId, uint256 _childSkillIndex) public view returns (uint256);

  /// @notice Get the length the the reputation update log for either the current active or inactive log
  /// @param activeLog True for the active log, false otherwise
  /// @return Reputation update log array length
  function getReputationUpdateLogLength(bool activeLog) public view returns (uint256);

  /// @notice Get the `Resolver` address for Colony contract version `_version`
  /// @param _version The Colony contract version
  /// @return Address of the `Resolver` contract
  function getColonyVersionResolver(uint256 _version) public view returns (address);

  /// @notice Get the `ReputationLogEntry` at index `_id` for either the currently active or inactive reputation update log 
  /// @param _id The reputation log members array index of the entry to get
  /// @param activeLog True for the active log, false otherwise
  /// @return user
  /// @return amount
  /// @return skillId
  /// @return colony
  /// @return nUpdates
  /// @return nPreviousUpdates
  function getReputationUpdateLogEntry(uint256 _id, bool activeLog) public view returns (address, int, uint256, address, uint256, uint256);
  
  /// @notice Allow a reputation miner to stake an `_amount` of CLNY tokens, which is required
  /// before they can submit a new reputation root hash via `ReputationMiningCycle.submitNewHash`
  /// @dev The Colony Network has to be authorised to transfer the `_amount` on behalf of the user prior to this call
  /// @param _amount Number of CLNY tokens to stake
  function deposit(uint256 _amount) public;
  
  /// @notice Allow a user who has staked CLNY tokens to withdraw them
  /// @dev Errors if the user has submitted a new reputation root hash or backed one someone else submitted in the current mining cycle
  /// @param amount CLNY tokens amount to withdraw
  function withdraw(uint256 amount) public;

  /// @notice Get the amount of staked CLNY tokens for user `_user` 
  /// @param _user Address of the user whose balance we want to get
  /// @return User stake balance
  function getStakedBalance(address _user) public view returns (uint256);

  /// @notice Set a new Reputation root hash and starts a new mining cycle. Can only be called by the ReputationMiningCycle contract.
  /// @param newHash The reputation root hash
  /// @param newNNodes The updated nodes count value
  /// @param stakers Array of users who submitted or backed the hash, being accepted here as the new reputation root hash
  function setReputationRootHash(bytes32 newHash, uint256 newNNodes, address[] stakers) public;

  /// @notice Starts a new Reputation Mining cycle
  function startNextCycle() public;

  /// @notice 
  /// @param stakers Array of the addresses of stakers to punish
  function punishStakers(address[] stakers) public;

  /// @notice 
  /// @return 
  function getReputationMiningCycle() public view returns (address);

  /// @notice
  /// @return 
  function getReputationRootHash() public view returns (bytes32);

  /// @notice
  /// @return 
  function getReputationRootHashNNodes() public view returns (uint256);

  /// @notice Create and start a new `DutchAuction` for the entire amount of `_token` owned by the Colony Network
  /// @param _token Address of the token held by the network to be auctioned
  function startTokenAuction(address _token) public;
}
