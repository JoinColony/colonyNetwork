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

pragma solidity >=0.7.3; // ignore-swc-103
pragma experimental "ABIEncoderV2";

import "./../common/IRecovery.sol";
import "./../common/IBasicMetaTransaction.sol";

import "./ColonyNetworkDataTypes.sol";


/// @title Colony Network interface
/// @notice All externally available functions are available here and registered to work with EtherRouter Network contract
interface IColonyNetwork is ColonyNetworkDataTypes, IRecovery, IBasicMetaTransaction {

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
    ) external;

  /// @notice Get a replacement log entry (if set) for the log entry `_id` in the mining cycle that was at the address `_reputationMiningCycle`.
  /// @param _reputationMiningCycle The address of the reputation mining cycle we are asking about
  /// @param _id The log entry number we wish to see if there is a replacement for
  /// @return reputationLogEntry ReputationLogEntry instance with the details of the log entry (if it exists)
  function getReplacementReputationUpdateLogEntry(address _reputationMiningCycle, uint256 _id) external view returns
    (ReputationLogEntry memory reputationLogEntry);

  /// @notice Get whether any replacement log entries have been set for the supplied reputation mining cycle.
  /// @notice Used by the client to avoid doubling the number of RPC calls when syncing from scratch.
  /// @param _reputationMiningCycle The reputation mining cycle address we want to know if any entries have been replaced in.
  /// @return exists Boolean indicating whether there is a replacement log
  function getReplacementReputationUpdateLogsExist(address _reputationMiningCycle) external view returns (bool exists);

  /// @notice Get the Meta Colony address.
  /// @return colonyAddress The Meta colony address, if no colony was found, returns 0x0
  function getMetaColony() external view returns (address payable colonyAddress);

  /// @notice Get the number of colonies in the network.
  /// @return count The colony count
  function getColonyCount() external view returns (uint256 count);

  /// @notice Check if specific address is a colony created on colony network.
  /// @param _colony Address of the colony
  /// @return addressIsColony true if specified address is a colony, otherwise false
  function isColony(address _colony) external view returns (bool addressIsColony);

  /// @notice Adds a new skill to the global or local skills tree, under skill `_parentSkillId`.
  /// Only the Meta Colony is allowed to add a global skill, called via `IColony.addGlobalSkill`.
  /// Any colony is allowed to add a local skill and which is associated with a new domain via `IColony.addDomain`.
  /// @dev Errors if the parent skill does not exist or if this is called by an unauthorised sender.
  /// @param _parentSkillId Id of the skill under which the new skill will be added. If 0, a global skill is added with no parent.
  /// @return skillId Id of the added skill
  function addSkill(uint256 _parentSkillId) external returns (uint256 skillId);

  /// @notice Get the `nParents` and `nChildren` of skill with id `_skillId`.
  /// @param _skillId Id of the skill
  /// @return skill The Skill struct
  function getSkill(uint256 _skillId) external view returns (Skill memory skill);

  /// @notice Set deprecation status for a skill
  /// @param _skillId Id of the skill
  /// @param _deprecated Deprecation status
  /// @return changed Whether the deprecated state was changed
  function deprecateSkill(uint256 _skillId, bool _deprecated) external returns (bool changed);

  /// @notice Mark a skill as deprecated which stops new tasks and payments from using it.
  /// @dev This function is deprecated and will be removed in a future release
  /// @param _skillId Id of the skill
  function deprecateSkill(uint256 _skillId) external;

  /// @notice Initialise the local skills tree for a colony
  /// @return rootLocalSkillId The root local skill
  function initialiseRootLocalSkill() external returns (uint256 rootLocalSkillId);

  /// @notice Adds a reputation update entry to log.
  /// @dev Errors if it is called by anyone but a colony or if skill with id `_skillId` does not exist or.
  /// @param _user The address of the user for the reputation update
  /// @param _amount The amount of reputation change for the update, this can be a negative as well as a positive value
  /// @param _skillId The skill for the reputation update
  function appendReputationUpdateLog(address _user, int256 _amount, uint256 _skillId) external;

  /// @notice Get the number of skills in the network including both global and local skills.
  /// @return count The skill count
  function getSkillCount() external view returns (uint256 count);

  /// @notice Get the `skillId` of the reputation mining skill. Only set once the metacolony is set up.
  /// @return skillId The `skillId` of the reputation mining skill.
  function getReputationMiningSkillId() external view returns (uint256 skillId);

  /// @notice Sets the token locking address.
  /// This is only set once, and can't be changed afterwards.
  /// @param _tokenLockingAddress Address of the locking contract
  function setTokenLocking(address _tokenLockingAddress) external;

  /// @notice Get token locking contract address.
  /// @return lockingAddress Token locking contract address
  function getTokenLocking() external view returns (address lockingAddress);

  /// @notice Create the Meta Colony, same as a normal colony plus the root skill.
  /// @param _tokenAddress Address of the CLNY token
  function createMetaColony(address _tokenAddress) external;

  /// @notice Creates a new colony in the network, at version 3
  /// @dev This is now deprecated and will be removed in a future version
  /// @dev For the colony to mint tokens, token ownership must be transferred to the new colony
  /// @param _tokenAddress Address of an ERC20 token to serve as the colony token.
  /// @return colonyAddress Address of the newly created colony
  function createColony(address _tokenAddress) external returns (address colonyAddress);

  /// @notice Overload of the simpler `createColony` -- creates a new colony in the network with a variety of options, at version 4
  /// @dev This is now deprecated and will be removed in a future version
  /// @dev For the colony to mint tokens, token ownership must be transferred to the new colony
  /// @param _tokenAddress Address of an ERC20 token to serve as the colony token
  /// @param _version The version of colony to deploy (pass 0 for the current version)
  /// @param _colonyName The label to register (if null, no label is registered)
  /// @param _orbitdb DEPRECATED Currently a no-op
  /// @param _useExtensionManager DEPRECATED Currently a no-op
  /// @return colonyAddress Address of the newly created colony
  function createColony(address _tokenAddress, uint256 _version, string memory _colonyName, string memory _orbitdb, bool _useExtensionManager)
    external returns (address colonyAddress);

  /// @notice Creates a new colony in the network, with an optional ENS name
  /// @dev For the colony to mint tokens, token ownership must be transferred to the new colony
  /// @param _tokenAddress Address of an ERC20 token to serve as the colony token
  /// @param _version The version of colony to deploy (pass 0 for the current version)
  /// @param _colonyName The label to register (if null, no label is registered)
  /// @return colonyAddress Address of the newly created colony
  function createColony(address _tokenAddress, uint256 _version, string memory _colonyName)
    external returns (address colonyAddress);

  /// @notice Creates a new colony in the network, with an optional ENS name
  /// @dev For the colony to mint tokens, token ownership must be transferred to the new colony
  /// @param _tokenAddress Address of an ERC20 token to serve as the colony token
  /// @param _version The version of colony to deploy (pass 0 for the current version)
  /// @param _colonyName The label to register (if null, no label is registered)
  /// @param _metadata The metadata associated with the new colony
  /// @return colonyAddress Address of the newly created colony
  /// @dev We expect this function to only be used by the dapp
  function createColony(address _tokenAddress, uint256 _version, string memory _colonyName, string memory _metadata)
    external returns (address colonyAddress);

  /// @notice Adds a new Colony contract version and the address of associated `_resolver` contract. Secured function to authorised members.
  /// Allowed to be called by the Meta Colony only.
  /// @param _version The new Colony contract version
  /// @param _resolver Address of the `Resolver` contract which will be used with the underlying `EtherRouter` contract
  function addColonyVersion(uint256 _version, address _resolver) external;

  /// @notice Initialises the colony network by setting the first Colony version resolver to `_resolver` address.
  /// @dev Only allowed to be run once, by the Network owner before any Colony versions are added.
  /// @param _resolver Address of the resolver for Colony contract
  /// @param _version Version of the Colony contract the resolver represents
  function initialise(address _resolver, uint256 _version) external;

  /// @notice Get a colony address by its Id in the network.
  /// @param _id Id of the colony to get
  /// @return colonyAddress The colony address, if no colony was found, returns 0x0
  function getColony(uint256 _id) external view returns (address colonyAddress);

  /// @notice Returns the latest Colony contract version. This is the version used to create all new colonies.
  /// @return version The current / latest Colony contract version
  function getCurrentColonyVersion() external view returns (uint256 version);

  /// @notice Get the id of the parent skill at index `_parentSkillIndex` for skill with Id `_skillId`.
  /// @param _skillId Id of the skill
  /// @param _parentSkillIndex Index of the `skill.parents` array to get
  /// Note that not all parent skill ids are stored here. See `Skill.parents` member for definition on which parents are stored
  /// @return skillId Skill Id of the requested parent skill
  function getParentSkillId(uint256 _skillId, uint256 _parentSkillIndex) external view returns (uint256 skillId);

  /// @notice Get the id of the child skill at index `_childSkillIndex` for skill with Id `_skillId`.
  /// @param _skillId Id of the skill
  /// @param _childSkillIndex Index of the `skill.children` array to get
  /// @return skillId Skill Id of the requested child skill
  function getChildSkillId(uint256 _skillId, uint256 _childSkillIndex) external view returns (uint256 skillId);

  /// @notice Get the address of either the active or inactive reputation mining cycle, based on `active`. The active reputation mining cycle
  /// is the one currently under consideration by reputation miners. The inactive reputation cycle is the one with the log that is being appended to.
  /// @param _active Whether the user wants the active or inactive reputation mining cycle
  /// @return repMiningCycleAddress address of active or inactive ReputationMiningCycle
  function getReputationMiningCycle(bool _active) external view returns (address repMiningCycleAddress);

  /// @notice Calculate raw miner weight in WADs.
  /// @param _timeStaked Amount of time (in seconds) that the miner has staked their CLNY
  /// @param _submissonIndex Index of reputation hash submission (between 0 and 11)
  /// @return minerWeight The weight of miner reward
  function calculateMinerWeight(uint256 _timeStaked, uint256 _submissonIndex) external pure returns (uint256 minerWeight);

  /// @notice Get the `Resolver` address for Colony contract version `_version`.
  /// @param _version The Colony contract version
  /// @return resolverAddress Address of the `Resolver` contract
  function getColonyVersionResolver(uint256 _version) external view returns (address resolverAddress);

  /// @notice Set a new Reputation root hash and starts a new mining cycle. Can only be called by the ReputationMiningCycle contract.
  /// @param newHash The reputation root hash
  /// @param newNLeaves The updated leaves count value
  /// @param stakers Array of users who submitted or backed the hash, being accepted here as the new reputation root hash
  function setReputationRootHash(bytes32 newHash, uint256 newNLeaves, address[] memory stakers) external;

  /// @notice Starts a new Reputation Mining cycle. Explicitly called only the first time,
  /// subsequently called from within `setReputationRootHash`.
  function startNextCycle() external;

  /// @notice Creates initial inactive reputation mining cycle.
  function initialiseReputationMining() external;

  /// @notice Get the root hash of the current reputation state tree.
  /// @return rootHash The current Reputation Root Hash
  function getReputationRootHash() external view returns (bytes32 rootHash);

  /// @notice Get the number of leaves in the current reputation state tree.
  /// @dev I cannot see a reason why a user's client would need to call this - only stored to help with some edge cases in reputation mining dispute resolution.
  /// @return nLeaves uint256 The number of leaves in the state tree
  function getReputationRootHashNLeaves() external view returns (uint256 nLeaves);

  /// @notice Get the number of leaves in the current reputation state tree.
  /// @dev Deprecated, replaced by getReputationRootHashNLeaves which does the same thing but is more accurately named.
  /// @dev will be removed in a later version.
  /// @return nNodes uint256 The number of leaves in the state tree
  function getReputationRootHashNNodes() external view returns (uint256 nNodes);

  /// @notice Create and start a new `DutchAuction` for the entire amount of `_token` owned by the Colony Network.
  /// @param _token Address of the token held by the network to be auctioned
  function startTokenAuction(address _token) external;

  /// @notice Setup registrar with ENS and root node.
  /// @param _ens Address of ENS registrar
  /// @param _rootNode Namehash of the root node for the domain
  function setupRegistrar(address _ens, bytes32 _rootNode) external;

  /// @notice Register a "user.joincolony.eth" label.
  /// @param username The label to register
  /// @param orbitdb The path of the orbitDB database associated with the user profile
  function registerUserLabel(string memory username, string memory orbitdb) external;

  /// @notice Register a "colony.joincolony.eth" label. Can only be called by a Colony.
  /// @param colonyName The label to register.
  /// @param orbitdb The path of the orbitDB database associated with the colony name
  function registerColonyLabel(string memory colonyName, string memory orbitdb) external;

  /// @notice Update a colony's orbitdb address. Can only be called by a colony with a registered subdomain
  /// @param orbitdb The path of the orbitDB database to be associated with the colony
  function updateColonyOrbitDB(string memory orbitdb) external;

  /// @notice Update a user's orbitdb address. Can only be called by a user with a registered subdomain
  /// @param orbitdb The path of the orbitDB database to be associated with the user
  function updateUserOrbitDB(string memory orbitdb) external;

  /// @notice Retrieve the orbitdb address corresponding to a registered account.
  /// @param node The Namehash of the account being queried.
  /// @return orbitDB A string containing the address of the orbit database
  function getProfileDBAddress(bytes32 node) external view returns (string memory orbitDB);

  /// @notice Reverse lookup a username from an address.
  /// @param addr The address we wish to find the corresponding ENS domain for (if any)
  /// @return domain A string containing the colony-based ENS name corresponding to addr
  function lookupRegisteredENSDomain(address addr) external view returns(string memory domain);

  /// @notice Returns the address the supplied node resolves do, if we are the resolver.
  /// @param node The namehash of the ENS address being requested
  /// @return address The address the supplied node resolves to
  function addr(bytes32 node) external view returns (address);

  /// @notice Returns the address of the ENSRegistrar for the Network.
  /// @return address The address the ENSRegistrar resolves to
  function getENSRegistrar() external view returns (address);

  /// @notice Set the resolver to be used by new instances of ReputationMiningCycle.
  /// @param miningResolverAddress The address of the Resolver contract with the functions correctly wired.
  function setMiningResolver(address miningResolverAddress) external;

  /// @notice Get the resolver to be used by new instances of ReputationMiningCycle.
  /// @return miningResolverAddress The address of the mining cycle resolver currently used by new instances
  function getMiningResolver() external view returns (address miningResolverAddress);

  /// @notice Add a new extension resolver to the Extensions repository.
  /// @dev Can only be called by the MetaColony.
  /// @dev The extension version is queried from the resolver itself.
  /// @param extensionId keccak256 hash of the extension name, used as an indentifier
  /// @param resolver The deployed resolver containing the extension contract logic
  function addExtensionToNetwork(bytes32 extensionId, address resolver) external;

  /// @notice Install an extension in a colony. Can only be called by a Colony.
  /// @param extensionId keccak256 hash of the extension name, used as an indentifier
  /// @param version Version of the extension to install
  function installExtension(bytes32 extensionId, uint256 version) external;

  /// @notice Upgrade an extension in a colony. Can only be called by a Colony.
  /// @param extensionId keccak256 hash of the extension name, used as an indentifier
  /// @param newVersion Version of the extension to upgrade to (must be one greater than current)
  function upgradeExtension(bytes32 extensionId, uint256 newVersion) external;

  /// @notice Set the deprecation of an extension in a colony. Can only be called by a Colony.
  /// @param extensionId keccak256 hash of the extension name, used as an indentifier
  /// @param deprecated Whether to deprecate the extension or not
  function deprecateExtension(bytes32 extensionId, bool deprecated) external;

  /// @notice Uninstall an extension in a colony. Can only be called by a Colony.
  /// @param extensionId keccak256 hash of the extension name, used as an indentifier
  function uninstallExtension(bytes32 extensionId) external;

  /// @notice Get an extension's resolver.
  /// @param extensionId keccak256 hash of the extension name, used as an indentifier
  /// @param version Version of the extension
  /// @return resolver The address of the deployed resolver
  function getExtensionResolver(bytes32 extensionId, uint256 version) external view returns (address resolver);

  /// @notice Get an extension's installation.
  /// @param extensionId keccak256 hash of the extension name, used as an indentifier
  /// @param colony Address of the colony the extension is installed in
  /// @return installation The address of the installed extension
  function getExtensionInstallation(bytes32 extensionId, address colony) external view returns (address installation);

  /// @notice Return 1 / the fee to pay to the network. e.g. if the fee is 1% (or 0.01), return 100.
  /// @return _feeInverse The inverse of the network fee
  function getFeeInverse() external view returns (uint256 _feeInverse);

  /// @notice Set the colony network fee to pay. e.g. if the fee is 1% (or 0.01), pass 100 as `_feeInverse`.
  /// @param _feeInverse The inverse of the network fee to set
  function setFeeInverse(uint256 _feeInverse) external;

  /// @notice Get a token's status in the payout whitelist
  /// @param _token The token being queried
  /// @return status Will be `true` if token is whitelisted
  function getPayoutWhitelist(address _token) external view returns (bool status);

  /// @notice Set a token's status in the payout whitelist
  /// @param _token The token being set
  /// @param _status The whitelist status
  function setPayoutWhitelist(address _token, bool _status) external;

  /// @notice Function called to punish people who staked against a new reputation root hash that turned out to be incorrect.
  /// @dev While external, it can only be called successfully by the current ReputationMiningCycle.
  /// @param _stakers Array of the addresses of stakers to punish
  /// @param _amount Amount of stake to slash
  function punishStakers(address[] memory _stakers, uint256 _amount) external;

  /// @notice Stake CLNY to allow the staker to participate in reputation mining.
  /// @param _amount Amount of CLNY to stake for the purposes of mining
  function stakeForMining(uint256 _amount) external;

  /// @notice Unstake CLNY currently staked for reputation mining.
  /// @param _amount Amount of CLNY staked for mining to unstake
  function unstakeForMining(uint256 _amount) external;

  /// @notice returns how much CLNY _user has staked for the purposes of reputation mining
  /// @param _user The user to query
  /// @return _info The amount staked and the timestamp the stake was made at.
  function getMiningStake(address _user) external view returns (MiningStake memory _info);

  /// @notice Used to track that a user is eligible to claim a reward
  /// @dev Only callable by the active reputation mining cycle
  /// @param _recipient The address receiving the award
  /// @param _amount The amount of CLNY to be awarded
  function reward(address _recipient, uint256 _amount) external;

  /// @notice Used to burn tokens that are not needed to pay out rewards (because not every possible defence was made for all submissions)
  /// @dev Only callable by the active reputation mining cycle
  /// @param _amount The amount of CLNY to burn
  function burnUnneededRewards(uint256 _amount) external;

  /// @notice Used by a user to claim any mining rewards due to them. This will place them in their balance or pending balance, as appropriate.
  /// @dev Can be called by anyone, not just _recipient
  /// @param _recipient The user whose rewards to claim
  function claimMiningReward(address _recipient) external;

  /// @notice Called to set the total per-cycle reputation reward, which will be split between all miners.
  /// @dev Can only be called by the MetaColony.
  /// @param _amount The CLNY awarded per mining cycle to the miners
  function setReputationMiningCycleReward(uint256 _amount) external;

  /// @notice Called to get the total per-cycle reputation mining reward.
  /// @return amount The CLNY awarded per mining cycle to the miners
  function getReputationMiningCycleReward() external view returns (uint256 amount);

  /// @notice Called to deploy a token.
  /// @dev This is more expensive than deploying a token directly, but is able to be done via
  /// a metatransaction
  /// @param _name The name of the token
  /// @param _symbol The short 'ticket' symbol for the token
  /// @param _decimals The number of decimal places that 1 user-facing token can be divided up in to
  /// In the case of ETH, and most tokens, this is 18.
  function deployTokenViaNetwork(string memory _name, string memory _symbol, uint8 _decimals) external returns (address);

  /// @notice Called to deploy a token authority
  /// @dev This is more expensive than deploying a token directly, but is able to be done via
  /// a metatransaction
  /// @param _token The address of the otken
  /// @param _colony The address of the colony in control of the token
  /// @param allowedToTransfer An array of addresses that are allowed to transfer the token even if it's locked
  /// @return The address of the newly deployed TokenAuthority
  function deployTokenAuthority(address _token, address _colony, address[] memory allowedToTransfer) external returns (address);

  /// @notice Called to give or remove another address's permission to mine on your behalf
  /// @param _delegate The address you're giving or removing permission from
  /// @param _allowed Whether they are allowed (true) or not (false) to mine on your behalf
  function setMiningDelegate(address _delegate, bool _allowed) external;

  /// @notice Called to get the address _delegate is allowed to mine for
  /// @param _delegate The address that wants to mine
  /// @return delegator The address they are allowed to mine on behalf of
  function getMiningDelegator(address _delegate) external view returns (address delegator);

}
