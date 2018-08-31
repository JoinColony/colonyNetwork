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


/// @title Colony Network interface
/// @notice All publicly available functions are available here and registered to work with EtherRouter Network contract
contract IColonyNetwork {

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

  // Implemented in DSAuth.sol
  /// @notice Set the `Authority` for the colony
  /// @param _authority The `Authority` contract address
  function setAuthority(address _authority) public;

  /// @notice Put colony network mining into recovery mode.
  /// Can only be called by user with recovery role.
  function enterRecoveryMode() public;

  /// @notice Exit recovery mode, can be called by anyone if enough whitelist approvals are given.
  function exitRecoveryMode() public;

  /// @notice Indicate approval to exit recovery mode.
  /// Can only be called by user with recovery role.
  function approveExitRecovery() public;

  /// @notice Is colony network mining in recovery mode
  /// @return inRecoveryMode Return true if recovery mode is active, false otherwise
  function isInRecoveryMode() public view returns (bool inRecoveryMode);

  /// @notice Sets reputation state
  /// @dev Can only be called in recovery mode
  /// @param _rootHash Reputation root hash
  /// @param _nNodes Number of nodes
  function setReputationState(bytes32 _rootHash, uint256 _nNodes) public;

  /// @notice Sets storage slot in reputation mining cycle contract
  /// @param _slot Id of the slot we want to change
  /// @param _value Value we want to set
  /// @param _active Active or inactive reputation mining cycle
  function setReputationMiningCycleStorageSlot(uint256 _slot, bytes32 _value, bool _active) public;

  /// @notice Set which update logs are work, on specified reputation mining cycle contract
  /// @dev Can only be called while mining cycle is in recovery mode
  /// @dev Logs will be ignored by mining client
  /// @param _reputationMiningCycle Address of the reputation mining cycle
  /// @param _updateLogs Array of indexes of the logs we want to ignore
  function setCorruptedReputationUpdateLogs(address _reputationMiningCycle, uint256[] _updateLogs) public;

  /// @notice Get corrupted/wrong update logs for specific mining cycle
  /// @param _reputationMiningCycle Address of reputation mining cycle
  /// @return updateLogs Array of indexes of update logs
  function getCorruptedReputationUpdateLogs(address _reputationMiningCycle) public view returns (uint256[] updateLogs);

  /// @notice Query if a contract implements an interface
  /// @param interfaceID The interface identifier, as specified in ERC-165
  /// @dev Interface identification is specified in ERC-165.
  /// @return `true` if the contract implements `interfaceID`
  function supportsInterface(bytes4 interfaceID) external pure returns (bool);

  /// @notice Get the Meta Colony address
  /// @return colonyAddress The Meta colony address, if no colony was found, returns 0x0
  function getMetaColony() public view returns (address colonyAddress);

  /// @notice Get the number of colonies in the network
  /// @return count The colony count
  function getColonyCount() public view returns (uint256 count);

  /// @notice Check if specific address is a colony created on colony network
  /// @param _colony Address of the colony
  /// @return isColony true if specified address is a colony, otherwise false
  function isColony(address _colony) public view returns (bool isColony);

  /// @notice Adds a new skill to the global or local skills tree, under skill `_parentSkillId`
  /// Only the Meta Colony is allowed to add a global skill, called via `IColony.addGlobalSkill`
  /// Any colony is allowed to add a local skill and which is associated with a new domain via `IColony.addDomain`
  /// @dev Errors if the parent skill does not exist or if this is called by an unauthorised sender
  /// @param _parentSkillId Id of the skill under which the new skill will be added
  /// @param _globalSkill true if the new skill is global, false if it is local
  /// @return skillId Id of the added skill
  function addSkill(uint256 _parentSkillId, bool _globalSkill) public returns (uint256 skillId);

  /// @notice Get the `nParents` and `nChildren` of skill with id `_skillId`
  /// @param _skillId Id of the skill
  /// @return nParents uint256 `skill.nParents` i.e. the number of parent skills of skill with id `_skillId`
  /// @return nChildren uint256 `skill.nChildren` i.e. the number of child skills of skill with id `_skillId`
  /// @return isGlobalSkill true if specified skill is a global skill, otherwise false
  function getSkill(uint256 _skillId) public view returns (uint256 nParents, uint256 nChildren, bool isGlobalSkill);

  /// @notice Adds a reputation update entry to log
  /// @dev Errors if it is called by anyone but a colony or if skill with id `_skillId` does not exist or
  /// @param _user The address of the user for the reputation update
  /// @param _amount The amount of reputation change for the update, this can be a negative as well as a positive value
  /// @param _skillId The skill for the reputation update
  function appendReputationUpdateLog(address _user, int256 _amount, uint256 _skillId) public;

  /// @notice Get the number of skills in the network including both global and local skills
  /// @return count The skill count
  function getSkillCount() public view returns (uint256 count);

  /// @notice Get the id of the root global skill
  /// @dev This is set once when the Meta Colony is created
  /// @return skillId, The root global skill id
  function getRootGlobalSkillId() public view returns (uint256 skillId);

  /// @notice Sets the token locking address
  /// This is only set once, and can't be changed afterwards
  /// @param _tokenLockingAddress Address of the locking contract
  function setTokenLocking(address _tokenLockingAddress) public;

  /// @notice Get token locking contract address
  /// @return lockingAddress Token locking contract address
  function getTokenLocking() public view returns (address lockingAddress);

  /// @notice Create the Meta Colony, same as a normal colony plus the root skill
  /// @param _tokenAddress Address of the CLNY token
  function createMetaColony(address _tokenAddress) public;

  /// @notice Creates a new colony in the network
  /// Note that the token ownership (if there is one) has to be transferred to the newly created colony
  /// @param _tokenAddress Address of an ERC20 token to serve as the colony token
  /// Additionally token can optionally support `mint` as defined in `ERC20Extended`
  /// Support for `mint` in mandatory only for the Meta Colony Token
  /// @return colonyAddress Address of the newly created colony
  function createColony(address _tokenAddress) public returns (address colonyAddress);

  /// @notice Adds a new Colony contract version and the address of associated `_resolver` contract. Secured function to authorised members
  /// @param _version The new Colony contract version
  /// @param _resolver Address of the `Resolver` contract which will be used with the underlying `EtherRouter` contract
  function addColonyVersion(uint256 _version, address _resolver) public;

  /// @notice Get a colony address by its Id in the network
  /// @param _id Id of the colony to get
  /// @return colonyAddress The colony address, if no colony was found, returns 0x0
  function getColony(uint256 _id) public view returns (address colonyAddress);

  /// @notice Returns the latest Colony contract version. This is the version used to create all new colonies
  /// @return version The current / latest Colony contract version
  function getCurrentColonyVersion() public view returns (uint256 version);

  /// @notice Get the id of the parent skill at index `_parentSkillIndex` for skill with Id `_skillId`
  /// @param _skillId Id of the skill
  /// @param _parentSkillIndex Index of the `skill.parents` array to get
  /// Note that not all parent skill ids are stored here. See `Skill.parents` member for definition on which parents are stored
  /// @return skillId Skill Id of the requested parent skill
  function getParentSkillId(uint256 _skillId, uint256 _parentSkillIndex) public view returns (uint256 skillId);

  /// @notice Get the id of the child skill at index `_childSkillIndex` for skill with Id `_skillId`
  /// @param _skillId Id of the skill
  /// @param _childSkillIndex Index of the `skill.children` array to get
  /// @return skillId Skill Id of the requested child skill
  function getChildSkillId(uint256 _skillId, uint256 _childSkillIndex) public view returns (uint256 skillId);

  /// @notice Get the address of either the active or inactive reputation mining cycle, based on `active`. The active reputation mining cycle
  /// is the one currently under consideration by reputation miners. The inactive reputation cycle is the one with the log that is being appended to
  /// @param _active Whether the user wants the active or inactive reputation mining cycle
  /// @return repMiningCycleAddress address of active or inactive ReputationMiningCycle
  function getReputationMiningCycle(bool _active) public view returns (address repMiningCycleAddress);

  /// @notice Get the `Resolver` address for Colony contract version `_version`
  /// @param _version The Colony contract version
  /// @return resolverAddress Address of the `Resolver` contract
  function getColonyVersionResolver(uint256 _version) public view returns (address resolverAddress);

  /// @notice Set a new Reputation root hash and starts a new mining cycle. Can only be called by the ReputationMiningCycle contract.
  /// @param newHash The reputation root hash
  /// @param newNNodes The updated nodes count value
  /// @param stakers Array of users who submitted or backed the hash, being accepted here as the new reputation root hash
  function setReputationRootHash(bytes32 newHash, uint256 newNNodes, address[] stakers) public;

  /// @notice Starts a new Reputation Mining cycle. Explicitly called only the first time,
  /// subsequently called from within `setReputationRootHash`
  function startNextCycle() public;

  /// @notice Creates initial inactive reputation mining cycle
  function initialiseReputationMining() public;

  /// @notice Get the root hash of the current reputation state tree
  /// @return rootHash bytes32 The current Reputation Root Hash
  function getReputationRootHash() public view returns (bytes32 rootHash);

  /// @notice Get the number of nodes in the current reputation state tree.
  /// @dev I cannot see a reason why a user's client would need to call this - only stored to help with some edge cases in reputation mining dispute resolution
  /// @return nNodes uint256 The number of nodes in the state tree
  function getReputationRootHashNNodes() public view returns (uint256 nNodes);

  /// @notice Create and start a new `DutchAuction` for the entire amount of `_token` owned by the Colony Network
  /// @param _token Address of the token held by the network to be auctioned
  function startTokenAuction(address _token) public;

  /// @notice Setup registrar with ENS and root node
  /// @param _ens Address of ENS registrar
  /// @param _rootNode Namehash of the root node for the domain
  function setupRegistrar(address _ens, bytes32 _rootNode) public;

  /// @notice Register a "user.joincolony.eth" label.
  /// @param username The label to register
  /// @param orbitdb  The path of the orbitDB database associated with the user profile
  function registerUserLabel(string username, string orbitdb) public;

  /// @notice Register a "colony.joincolony.eth" label. Can only be called by a Colony.
  /// @param colonyName The label to register.
  function registerColonyLabel(string colonyName) public;

  /// @notice Retrieve the orbitdb address corresponding to a registered account
  /// @param node The Namehash of the account being queried.
  /// @return orbitDB A string containing the address of the orbit database
  function getProfileDBAddress(bytes32 node) public view returns (string orbitDB);

  /// @notice Reverse lookup a username from an address.
  /// @param addr The address we wish to find the corresponding ENS domain for (if any)
  /// @return domain A string containing the colony-based ENS name corresponding to addr
  function lookupRegisteredENSDomain(address addr) public view returns(string domain);

  /// @notice Returns the address the supplied node resolves do, if we are the resolver
  /// @param node The namehash of the ENS address being requested
  /// @return address The address the supplied node resolves to
  function addr(bytes32 node) public view returns (address);

  /// @notice Set the resolver to be used by new instances of ReputationMiningCycle
  /// @param miningResolverAddress The address of the Resolver contract with the functions correctly wired.
  function setMiningResolver(address miningResolverAddress) public;

  /// @notice get the resolver to be used by new instances of ReputationMiningCycle
  /// @return miningResolverAddress The address of the mining cycle resolver currently used by new instances
  function getMiningResolver() public view returns (address miningResolverAddress);
}
