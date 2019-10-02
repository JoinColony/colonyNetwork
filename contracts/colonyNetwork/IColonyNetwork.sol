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

pragma solidity >=0.5.8; // ignore-swc-103
pragma experimental "ABIEncoderV2";

import "./../common/IRecovery.sol";
import "./ColonyNetworkDataTypes.sol";


/// @title Colony Network interface
/// @notice All publicly available functions are available here and registered to work with EtherRouter Network contract
contract IColonyNetwork is ColonyNetworkDataTypes, IRecovery {

  /// @notice Query if a contract implements an interface
  /// @param interfaceID The interface identifier, as specified in ERC-165
  /// @dev Interface identification is specified in ERC-165.
  /// @return status `true` if the contract implements `interfaceID`
  function supportsInterface(bytes4 interfaceID) external pure returns (bool status);

  /// @notice Set a replacement log entry if we're in recovery mode.
  /// @param _reputationMiningCycle The address of the reputation mining cycle that the log was in.
  /// @param _id The number of the log entry in the reputation mining cycle in question.
  /// @param _user The address of the user earning / losing the reputation
  /// @param _amount The amount of reputation being earned / lost
  /// @param _skillId The id of the origin skill for the reputation update
  /// @param _colony The address of the colony being updated
  /// @param _nUpdates The number of updates the log entry corresponds to
  /// @param _nPreviousUpdates The number of updates in the log before this entry
  /// @dev Note that strictly, `_nUpdates` and `_nPreviousUpdates` don't need to be set - they're only used during
  /// dispute resolution, which these replacement log entries are never used for. However, for ease of resyncing
  /// the client, we have decided to include them for now.
  function setReplacementReputationUpdateLogEntry(
    address _reputationMiningCycle,
    uint256 _id,
    address _user,
    int _amount,
    uint256 _skillId,
    address _colony,
    uint128 _nUpdates,
    uint128 _nPreviousUpdates
    ) public;

  /// @notice Get a replacement log entry (if set) for the log entry `_id` in the mining cycle that was at the address `_reputationMiningCycle`.
  /// @param _reputationMiningCycle The address of the reputation mining cycle we are asking about
  /// @param _id The log entry number we wish to see if there is a replacement for
  /// @return reputationLogEntry ReputationLogEntry instance with the details of the log entry (if it exists)
  function getReplacementReputationUpdateLogEntry(address _reputationMiningCycle, uint256 _id) public view returns
    (ReputationLogEntry memory reputationLogEntry);

  /// @notice Get whether any replacement log entries have been set for the supplied reputation mining cycle.
  /// @notice Used by the client to avoid doubling the number of RPC calls when syncing from scratch.
  /// @param _reputationMiningCycle The reputation mining cycle address we want to know if any entries have been replaced in.
  /// @return exists Boolean indicating whether there is a replacement log
  function getReplacementReputationUpdateLogsExist(address _reputationMiningCycle) public view returns (bool exists);

  /// @notice Get the Meta Colony address.
  /// @return colonyAddress The Meta colony address, if no colony was found, returns 0x0
  function getMetaColony() public view returns (address payable colonyAddress);

  /// @notice Get the number of colonies in the network.
  /// @return count The colony count
  function getColonyCount() public view returns (uint256 count);

  /// @notice Check if specific address is a colony created on colony network.
  /// @param _colony Address of the colony
  /// @return addressIsColony true if specified address is a colony, otherwise false
  function isColony(address _colony) public view returns (bool addressIsColony);

  /// @notice Adds a new skill to the global or local skills tree, under skill `_parentSkillId`.
  /// Only the Meta Colony is allowed to add a global skill, called via `IColony.addGlobalSkill`.
  /// Any colony is allowed to add a local skill and which is associated with a new domain via `IColony.addDomain`.
  /// @dev Errors if the parent skill does not exist or if this is called by an unauthorised sender.
  /// @param _parentSkillId Id of the skill under which the new skill will be added. If 0, a global skill is added with no parent.
  /// @return skillId Id of the added skill
  function addSkill(uint256 _parentSkillId) public returns (uint256 skillId);

  /// @notice Get the `nParents` and `nChildren` of skill with id `_skillId`.
  /// @param _skillId Id of the skill
  /// @return skill The Skill struct
  function getSkill(uint256 _skillId) public view returns (Skill memory skill);

  /// @notice Mark a global skill as deprecated which stops new tasks and payments from using it.
  /// @param _skillId Id of the skill
  function deprecateSkill(uint256 _skillId) public;

  /// @notice Adds a reputation update entry to log.
  /// @dev Errors if it is called by anyone but a colony or if skill with id `_skillId` does not exist or.
  /// @param _user The address of the user for the reputation update
  /// @param _amount The amount of reputation change for the update, this can be a negative as well as a positive value
  /// @param _skillId The skill for the reputation update
  function appendReputationUpdateLog(address _user, int256 _amount, uint256 _skillId) public;

  /// @notice Get the number of skills in the network including both global and local skills.
  /// @return count The skill count
  function getSkillCount() public view returns (uint256 count);

  /// @notice Get the `skillId` of the reputation mining skill. Only set once the metacolony is set up.
  /// @return skillId The `skillId` of the reputation mining skill.
  function getReputationMiningSkillId() public view returns (uint256 skillId);

  /// @notice Sets the token locking address.
  /// This is only set once, and can't be changed afterwards.
  /// @param _tokenLockingAddress Address of the locking contract
  function setTokenLocking(address _tokenLockingAddress) public;

  /// @notice Get token locking contract address.
  /// @return lockingAddress Token locking contract address
  function getTokenLocking() public view returns (address lockingAddress);

  /// @notice Create the Meta Colony, same as a normal colony plus the root skill.
  /// @param _tokenAddress Address of the CLNY token
  function createMetaColony(address _tokenAddress) public;

  /// @notice Creates a new colony in the network, at version 3
  /// @dev This is now deprecated and will be removed in a future version
  /// @dev For the colony to mint tokens, token ownership must be transferred to the new colony
  /// @param _tokenAddress Address of an ERC20 token to serve as the colony token.
  /// @return colonyAddress Address of the newly created colony
  function createColony(address _tokenAddress) public returns (address colonyAddress);

  /// @notice Overload of the simpler `createColony` -- creates a new colony in the network with a variety of options
  /// @dev For the colony to mint tokens, token ownership must be transferred to the new colony
  /// @param _tokenAddress Address of an ERC20 token to serve as the colony token
  /// @param _version The version of colony to deploy (pass 0 for the current version)
  /// @param _colonyName The label to register (if null, no label is registered)
  /// @param _orbitdb The path of the orbitDB database associated with the user profile
  /// @param _useExtensionManager If true, give the ExtensionManager the root role in the colony
  /// @return colonyAddress Address of the newly created colony
  function createColony(address _tokenAddress, uint256 _version, string memory _colonyName, string memory _orbitdb, bool _useExtensionManager)
    public returns (address colonyAddress);

  /// @notice Adds a new Colony contract version and the address of associated `_resolver` contract. Secured function to authorised members.
  /// Allowed to be called by the Meta Colony only.
  /// @param _version The new Colony contract version
  /// @param _resolver Address of the `Resolver` contract which will be used with the underlying `EtherRouter` contract
  function addColonyVersion(uint256 _version, address _resolver) public;

  /// @notice Initialises the colony network by setting the first Colony version resolver to `_resolver` address.
  /// @dev Only allowed to be run once, by the Network owner before any Colony versions are added.
  /// @param _resolver Address of the resolver for Colony contract
  /// @param _version Version of the Colony contract the resolver represents
  function initialise(address _resolver, uint256 _version) public;

  /// @notice Get a colony address by its Id in the network.
  /// @param _id Id of the colony to get
  /// @return colonyAddress The colony address, if no colony was found, returns 0x0
  function getColony(uint256 _id) public view returns (address colonyAddress);

  /// @notice Returns the latest Colony contract version. This is the version used to create all new colonies.
  /// @return version The current / latest Colony contract version
  function getCurrentColonyVersion() public view returns (uint256 version);

  /// @notice Get the id of the parent skill at index `_parentSkillIndex` for skill with Id `_skillId`.
  /// @param _skillId Id of the skill
  /// @param _parentSkillIndex Index of the `skill.parents` array to get
  /// Note that not all parent skill ids are stored here. See `Skill.parents` member for definition on which parents are stored
  /// @return skillId Skill Id of the requested parent skill
  function getParentSkillId(uint256 _skillId, uint256 _parentSkillIndex) public view returns (uint256 skillId);

  /// @notice Get the id of the child skill at index `_childSkillIndex` for skill with Id `_skillId`.
  /// @param _skillId Id of the skill
  /// @param _childSkillIndex Index of the `skill.children` array to get
  /// @return skillId Skill Id of the requested child skill
  function getChildSkillId(uint256 _skillId, uint256 _childSkillIndex) public view returns (uint256 skillId);

  /// @notice Get the address of either the active or inactive reputation mining cycle, based on `active`. The active reputation mining cycle
  /// is the one currently under consideration by reputation miners. The inactive reputation cycle is the one with the log that is being appended to.
  /// @param _active Whether the user wants the active or inactive reputation mining cycle
  /// @return repMiningCycleAddress address of active or inactive ReputationMiningCycle
  function getReputationMiningCycle(bool _active) public view returns (address repMiningCycleAddress);

  /// @notice Calculate raw miner weight in WADs.
  /// @param _timeStaked Amount of time (in seconds) that the miner has staked their CLNY
  /// @param _submissonIndex Index of reputation hash submission (between 0 and 11)
  /// @return minerWeight The weight of miner reward
  function calculateMinerWeight(uint256 _timeStaked, uint256 _submissonIndex) public pure returns (uint256 minerWeight);

  /// @notice Get the `Resolver` address for Colony contract version `_version`.
  /// @param _version The Colony contract version
  /// @return resolverAddress Address of the `Resolver` contract
  function getColonyVersionResolver(uint256 _version) public view returns (address resolverAddress);

  /// @notice This version of setReputationRootHash is deprecated and will be removed in a future release. It transparently
  /// calls the new version if it is called (essentially, removing the `reward` parameter.
  /// @param newHash The reputation root hash
  /// @param newNLeaves The updated leaves count value
  /// @param stakers Array of users who submitted or backed the hash, being accepted here as the new reputation root hash
  /// @param reward Amount of CLNY to be distributed as reward to miners (not used)
  function setReputationRootHash(bytes32 newHash, uint256 newNLeaves, address[] memory stakers, uint256 reward) public;

  /// @notice Set a new Reputation root hash and starts a new mining cycle. Can only be called by the ReputationMiningCycle contract.
  /// @param newHash The reputation root hash
  /// @param newNLeaves The updated leaves count value
  /// @param stakers Array of users who submitted or backed the hash, being accepted here as the new reputation root hash
  function setReputationRootHash(bytes32 newHash, uint256 newNLeaves, address[] memory stakers) public;

  /// @notice Starts a new Reputation Mining cycle. Explicitly called only the first time,
  /// subsequently called from within `setReputationRootHash`.
  function startNextCycle() public;

  /// @notice Creates initial inactive reputation mining cycle.
  function initialiseReputationMining() public;

  /// @notice Get the root hash of the current reputation state tree.
  /// @return rootHash The current Reputation Root Hash
  function getReputationRootHash() public view returns (bytes32 rootHash);

  /// @notice Get the number of leaves in the current reputation state tree.
  /// @dev I cannot see a reason why a user's client would need to call this - only stored to help with some edge cases in reputation mining dispute resolution.
  /// @return nLeaves uint256 The number of leaves in the state tree
  function getReputationRootHashNLeaves() public view returns (uint256 nLeaves);

  /// @notice Get the number of leaves in the current reputation state tree.
  /// @dev Deprecated, replaced by getReputationRootHashNLeaves which does the same thing but is more accurately named.
  /// @dev will be removed in a later version.
  /// @return nNodes uint256 The number of leaves in the state tree
  function getReputationRootHashNNodes() public view returns (uint256 nNodes);

  /// @notice Create and start a new `DutchAuction` for the entire amount of `_token` owned by the Colony Network.
  /// @param _token Address of the token held by the network to be auctioned
  function startTokenAuction(address _token) public;

  /// @notice Setup registrar with ENS and root node.
  /// @param _ens Address of ENS registrar
  /// @param _rootNode Namehash of the root node for the domain
  function setupRegistrar(address _ens, bytes32 _rootNode) public;

  /// @notice Register a "user.joincolony.eth" label.
  /// @param username The label to register
  /// @param orbitdb The path of the orbitDB database associated with the user profile
  function registerUserLabel(string memory username, string memory orbitdb) public;

  /// @notice Register a "colony.joincolony.eth" label. Can only be called by a Colony.
  /// @param colonyName The label to register.
  /// @param orbitdb The path of the orbitDB database associated with the colony name
  function registerColonyLabel(string memory colonyName, string memory orbitdb) public;

  /// @notice Update a colony's orbitdb address. Can only be called by a colony with a registered subdomain
  /// @param orbitdb The path of the orbitDB database to be associated with the colony
  function updateColonyOrbitDB(string memory orbitdb) public;

  /// @notice Update a user's orbitdb address. Can only be called by a user with a registered subdomain
  /// @param orbitdb The path of the orbitDB database to be associated with the user
  function updateUserOrbitDB(string memory orbitdb) public;

  /// @notice Retrieve the orbitdb address corresponding to a registered account.
  /// @param node The Namehash of the account being queried.
  /// @return orbitDB A string containing the address of the orbit database
  function getProfileDBAddress(bytes32 node) public view returns (string memory orbitDB);

  /// @notice Reverse lookup a username from an address.
  /// @param addr The address we wish to find the corresponding ENS domain for (if any)
  /// @return domain A string containing the colony-based ENS name corresponding to addr
  function lookupRegisteredENSDomain(address addr) public view returns(string memory domain);

  /// @notice Returns the address the supplied node resolves do, if we are the resolver.
  /// @param node The namehash of the ENS address being requested
  /// @return address The address the supplied node resolves to
  function addr(bytes32 node) public view returns (address);

  /// @notice Returns the address of the ENSRegistrar for the Network.
  /// @return address The address the ENSRegistrar resolves to
  function getENSRegistrar() public view returns (address);

  /// @notice Set the resolver to be used by new instances of ReputationMiningCycle.
  /// @param miningResolverAddress The address of the Resolver contract with the functions correctly wired.
  function setMiningResolver(address miningResolverAddress) public;

  /// @notice Get the resolver to be used by new instances of ReputationMiningCycle.
  /// @return miningResolverAddress The address of the mining cycle resolver currently used by new instances
  function getMiningResolver() public view returns (address miningResolverAddress);

  /// @notice Set the address for the ExtensionManager.
  /// @param _extensionManagerAddress Address of the ExtensionManager contract
  function setExtensionManager(address _extensionManagerAddress) public;

  /// @notice Get the address for the ExtensionManager.
  /// @return extensionManagerAddress Address of the ExtensionManager contract
  function getExtensionManager() public view returns (address extensionManagerAddress);

  /// @notice Add a new extension/version to the ExtensionManager.
  /// @dev Calls `ExtensionManager.addExtension`.
  /// @dev The extension version is queried from the resolver itself.
  /// @dev The _roles array can be set only for version == 1 (must be empty otherwise).
  /// @param _extensionId keccak256 hash of the extension name, used as an indentifier
  /// @param _resolver The deployed resolver containing the extension contract logic
  /// @param _roles An array containing the roles required by the extension
  function addExtension(bytes32 _extensionId, address _resolver, uint8[] memory _roles) public;

  /// @notice Return 1 / the fee to pay to the network. e.g. if the fee is 1% (or 0.01), return 100.
  /// @return _feeInverse The inverse of the network fee
  function getFeeInverse() public view returns (uint256 _feeInverse);

  /// @notice Set the colony network fee to pay. e.g. if the fee is 1% (or 0.01), pass 100 as `_feeInverse`.
  /// @param _feeInverse The inverse of the network fee to set
  function setFeeInverse(uint256 _feeInverse) public;

  /// @notice Function called to punish people who staked against a new reputation root hash that turned out to be incorrect.
  /// @dev While public, it can only be called successfully by the current ReputationMiningCycle.
  /// @param _stakers Array of the addresses of stakers to punish
  /// @param _amount Amount of stake to slash
  function punishStakers(address[] memory _stakers, uint256 _amount) public;

  /// @notice Stake CLNY to allow the staker to participate in reputation mining.
  /// @param _amount Amount of CLNY to stake for the purposes of mining
  function stakeForMining(uint256 _amount) public;

  /// @notice Unstake CLNY currently staked for reputation mining.
  /// @param _amount Amount of CLNY staked for mining to unstake
  function unstakeForMining(uint256 _amount) public;

  /// @notice returns how much CLNY _user has staked for the purposes of reputation mining
  /// @param _user The user to query
  /// @return _info The amount staked and the timestamp the stake was made at.
  function getMiningStake(address _user) public view returns (MiningStake memory _info);

  /// @notice Used to track that a user is eligible to claim a reward
  /// @dev Only callable by the active reputation mining cycle
  /// @param _recipient The address receiving the award
  /// @param _amount The amount of CLNY to be awarded
  function reward(address _recipient, uint256 _amount) public;

  /// @notice Used to burn tokens that are not needed to pay out rewards (because not every possible defence was made for all submissions)
  /// @dev Only callable by the active reputation mining cycle
  /// @param _amount The amount of CLNY to burn
  function burnUnneededRewards(uint256 _amount) public;

  /// @notice Used by a user to claim any mining rewards due to them. This will place them in their balance or pending balance, as appropriate.
  /// @dev Can be called by anyone, not just _recipient
  /// @param _recipient The user whose rewards to claim
  function claimMiningReward(address _recipient) public;

  /// @notice Called to set the metaColony stipend. This value will be the total amount of CLNY created for the metacolony in a single year. The
  /// corresponding `issueMetaColonyStipend` function can be called at any interval.
  /// @param _amount The amount of CLNY to issue to the metacolony every year
  /// @dev Can only be called by the MetaColony.
  function setAnnualMetaColonyStipend(uint256 _amount) public;

  /// @notice Called to issue the metaColony stipend. This public function can be called by anyone at any interval, and an appropriate amount of CLNY will
  /// be minted based on the time since the last time it was called.
  function issueMetaColonyStipend() public;

  /// @notice Called to set the total per-cycle reputation reward, which will be split between all miners.
  /// @dev Can only be called by the MetaColony.
  function setReputationMiningCycleReward(uint256 _amount) public;

  /// @notice Called to get the total per-cycle reputation mining reward.
  /// @return The CLNY awarded per mining cycle to the miners.
  function getReputationMiningCycleReward() public view returns (uint256);

  /// @notice Called to get the total per-cycle reputation mining reward.
  /// @return The CLNY awarded per year to the metacolony.
  function getAnnualMetaColonyStipend() public view returns (uint256);
}
