# Colony Network (`IColonyNetwork`)

  
## Interface Methods

### ▸ **`addColonyVersion(uint256 _version, address _resolver)`**

Adds a new Colony contract version and the address of associated `_resolver` contract. Secured function to authorised members. Allowed to be called by the Meta Colony only.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_version|uint256|The new Colony contract version
|_resolver|address|Address of the `Resolver` contract which will be used with the underlying `EtherRouter` contract


### ▸ **`addExtensionToNetwork(bytes32 extensionId, address resolver)`**

Add a new extension resolver to the Extensions repository.

*Note: Can only be called by the MetaColony.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|extensionId|bytes32|keccak256 hash of the extension name, used as an indentifier
|resolver|address|The deployed resolver containing the extension contract logic


### ▸ **`addSkill(uint256 _parentSkillId):uint256 skillId`**

Adds a new skill to the global or local skills tree, under skill `_parentSkillId`. Only the Meta Colony is allowed to add a global skill, called via `IColony.addGlobalSkill`. Any colony is allowed to add a local skill and which is associated with a new domain via `IColony.addDomain`.

*Note: Errors if the parent skill does not exist or if this is called by an unauthorised sender.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_parentSkillId|uint256|Id of the skill under which the new skill will be added. If 0, a global skill is added with no parent.

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|skillId|uint256|Id of the added skill

### ▸ **`addr(bytes32 node):address address`**

Returns the address the supplied node resolves do, if we are the resolver.


**Parameters**

|Name|Type|Description|
|---|---|---|
|node|bytes32|The namehash of the ENS address being requested

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|address|address|The address the supplied node resolves to

### ▸ **`appendReputationUpdateLog(address _user, int256 _amount, uint256 _skillId)`**

Adds a reputation update entry to log.

*Note: Errors if it is called by anyone but a colony or if skill with id `_skillId` does not exist or.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The address of the user for the reputation update
|_amount|int256|The amount of reputation change for the update, this can be a negative as well as a positive value
|_skillId|uint256|The skill for the reputation update


### ▸ **`burnUnneededRewards(uint256 _amount)`**

Used to burn tokens that are not needed to pay out rewards (because not every possible defence was made for all submissions)

*Note: Only callable by the active reputation mining cycle*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_amount|uint256|The amount of CLNY to burn


### ▸ **`calculateMinerWeight(uint256 _timeStaked, uint256 _submissonIndex):uint256 minerWeight`**

Calculate raw miner weight in WADs.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_timeStaked|uint256|Amount of time (in seconds) that the miner has staked their CLNY
|_submissonIndex|uint256|Index of reputation hash submission (between 0 and 11)

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|minerWeight|uint256|The weight of miner reward

### ▸ **`claimMiningReward(address _recipient)`**

Used by a user to claim any mining rewards due to them. This will place them in their balance or pending balance, as appropriate.

*Note: Can be called by anyone, not just _recipient*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_recipient|address|The user whose rewards to claim


### ▸ **`createColony(address _tokenAddress):address colonyAddress`**

Creates a new colony in the network, at version 3

*Note: This is now deprecated and will be removed in a future version*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_tokenAddress|address|Address of an ERC20 token to serve as the colony token.

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyAddress|address|Address of the newly created colony

### ▸ **`createColony(address _tokenAddress, uint256 _version, string memory _colonyName):address colonyAddress`**

Creates a new colony in the network, with an optional ENS name

*Note: For the colony to mint tokens, token ownership must be transferred to the new colony*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_tokenAddress|address|Address of an ERC20 token to serve as the colony token
|_version|uint256|The version of colony to deploy (pass 0 for the current version)
|_colonyName|string|The label to register (if null, no label is registered)

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyAddress|address|Address of the newly created colony

### ▸ **`createColony(address _tokenAddress, uint256 _version, string memory _colonyName, string memory _metadata):address colonyAddress`**

Creates a new colony in the network, with an optional ENS name

*Note: For the colony to mint tokens, token ownership must be transferred to the new colony*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_tokenAddress|address|Address of an ERC20 token to serve as the colony token
|_version|uint256|The version of colony to deploy (pass 0 for the current version)
|_colonyName|string|The label to register (if null, no label is registered)
|_metadata|string|The metadata associated with the new colony

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyAddress|address|Address of the newly created colony

### ▸ **`createColony(address _tokenAddress, uint256 _version, string memory _colonyName, string memory _orbitdb, bool _useExtensionManager):address colonyAddress`**

Overload of the simpler `createColony` -- creates a new colony in the network with a variety of options, at version 4

*Note: This is now deprecated and will be removed in a future version*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_tokenAddress|address|Address of an ERC20 token to serve as the colony token
|_version|uint256|The version of colony to deploy (pass 0 for the current version)
|_colonyName|string|The label to register (if null, no label is registered)
|_orbitdb|string|DEPRECATED Currently a no-op
|_useExtensionManager|bool|DEPRECATED Currently a no-op

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyAddress|address|Address of the newly created colony

### ▸ **`createMetaColony(address _tokenAddress)`**

Create the Meta Colony, same as a normal colony plus the root skill.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_tokenAddress|address|Address of the CLNY token


### ▸ **`deployTokenAuthority(address _token, address _colony, address[] memory allowedToTransfer):address tokenAuthority`**

Called to deploy a token authority

*Note: This is more expensive than deploying a token directly, but is able to be done via a metatransaction*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|The address of the otken
|_colony|address|The address of the colony in control of the token
|allowedToTransfer|address[]|An array of addresses that are allowed to transfer the token even if it's locked

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|tokenAuthority|address|The address of the newly deployed TokenAuthority

### ▸ **`deployTokenViaNetwork(string memory _name, string memory _symbol, uint8 _decimals):address token`**

Called to deploy a token.

*Note: This is more expensive than deploying a token directly, but is able to be done via a metatransaction*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_name|string|The name of the token
|_symbol|string|The short 'ticket' symbol for the token
|_decimals|uint8|The number of decimal places that 1 user-facing token can be divided up in to In the case of ETH, and most tokens, this is 18.

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|token|address|The address of the newly deployed token

### ▸ **`deprecateExtension(bytes32 extensionId, bool deprecated)`**

Set the deprecation of an extension in a colony. Can only be called by a Colony.


**Parameters**

|Name|Type|Description|
|---|---|---|
|extensionId|bytes32|keccak256 hash of the extension name, used as an indentifier
|deprecated|bool|Whether to deprecate the extension or not


### ▸ **`deprecateSkill(uint256 _skillId)`**

Mark a skill as deprecated which stops new tasks and payments from using it.

*Note: This function is deprecated and will be removed in a future release*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_skillId|uint256|Id of the skill


### ▸ **`deprecateSkill(uint256 _skillId, bool _deprecated):bool changed`**

Set deprecation status for a skill


**Parameters**

|Name|Type|Description|
|---|---|---|
|_skillId|uint256|Id of the skill
|_deprecated|bool|Deprecation status

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|changed|bool|Whether the deprecated state was changed

### ▸ **`getChildSkillId(uint256 _skillId, uint256 _childSkillIndex):uint256 skillId`**

Get the id of the child skill at index `_childSkillIndex` for skill with Id `_skillId`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_skillId|uint256|Id of the skill
|_childSkillIndex|uint256|Index of the `skill.children` array to get

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|skillId|uint256|Skill Id of the requested child skill

### ▸ **`getColony(uint256 _id):address colonyAddress`**

Get a colony address by its Id in the network.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the colony to get

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyAddress|address|The colony address, if no colony was found, returns 0x0

### ▸ **`getColonyCount():uint256 count`**

Get the number of colonies in the network.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The colony count

### ▸ **`getColonyVersionResolver(uint256 _version):address resolverAddress`**

Get the `Resolver` address for Colony contract version `_version`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_version|uint256|The Colony contract version

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|resolverAddress|address|Address of the `Resolver` contract

### ▸ **`getCurrentColonyVersion():uint256 version`**

Returns the latest Colony contract version. This is the version used to create all new colonies.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|version|uint256|The current / latest Colony contract version

### ▸ **`getENSRegistrar():address address`**

Returns the address of the ENSRegistrar for the Network.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|address|address|The address the ENSRegistrar resolves to

### ▸ **`getExtensionInstallation(bytes32 extensionId, address colony):address installation`**

Get an extension's installation.


**Parameters**

|Name|Type|Description|
|---|---|---|
|extensionId|bytes32|keccak256 hash of the extension name, used as an indentifier
|colony|address|Address of the colony the extension is installed in

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|installation|address|The address of the installed extension

### ▸ **`getExtensionResolver(bytes32 extensionId, uint256 version):address resolver`**

Get an extension's resolver.


**Parameters**

|Name|Type|Description|
|---|---|---|
|extensionId|bytes32|keccak256 hash of the extension name, used as an indentifier
|version|uint256|Version of the extension

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|resolver|address|The address of the deployed resolver

### ▸ **`getFeeInverse():uint256 _feeInverse`**

Return 1 / the fee to pay to the network. e.g. if the fee is 1% (or 0.01), return 100.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_feeInverse|uint256|The inverse of the network fee

### ▸ **`getMetaColony():address colonyAddress`**

Get the Meta Colony address.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyAddress|address|The Meta colony address, if no colony was found, returns 0x0

### ▸ **`getMiningDelegator(address _delegate):address delegator`**

Called to get the address _delegate is allowed to mine for


**Parameters**

|Name|Type|Description|
|---|---|---|
|_delegate|address|The address that wants to mine

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|delegator|address|The address they are allowed to mine on behalf of

### ▸ **`getMiningResolver():address miningResolverAddress`**

Get the resolver to be used by new instances of ReputationMiningCycle.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|miningResolverAddress|address|The address of the mining cycle resolver currently used by new instances

### ▸ **`getMiningStake(address _user):MiningStake _info`**

returns how much CLNY _user has staked for the purposes of reputation mining


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The user to query

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_info|MiningStake|The amount staked and the timestamp the stake was made at.

### ▸ **`getParentSkillId(uint256 _skillId, uint256 _parentSkillIndex):uint256 skillId`**

Get the id of the parent skill at index `_parentSkillIndex` for skill with Id `_skillId`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_skillId|uint256|Id of the skill
|_parentSkillIndex|uint256|Index of the `skill.parents` array to get Note that not all parent skill ids are stored here. See `Skill.parents` member for definition on which parents are stored

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|skillId|uint256|Skill Id of the requested parent skill

### ▸ **`getPayoutWhitelist(address _token):bool status`**

Get a token's status in the payout whitelist


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|The token being queried

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|status|bool|Will be `true` if token is whitelisted

### ▸ **`getProfileDBAddress(bytes32 node):string orbitDB`**

Retrieve the orbitdb address corresponding to a registered account.


**Parameters**

|Name|Type|Description|
|---|---|---|
|node|bytes32|The Namehash of the account being queried.

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|orbitDB|string|A string containing the address of the orbit database

### ▸ **`getReplacementReputationUpdateLogEntry(address _reputationMiningCycle, uint256 _id):ReputationLogEntry reputationLogEntry`**

Get a replacement log entry (if set) for the log entry `_id` in the mining cycle that was at the address `_reputationMiningCycle`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_reputationMiningCycle|address|The address of the reputation mining cycle we are asking about
|_id|uint256|The log entry number we wish to see if there is a replacement for

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|reputationLogEntry|ReputationLogEntry|ReputationLogEntry instance with the details of the log entry (if it exists)

### ▸ **`getReplacementReputationUpdateLogsExist(address _reputationMiningCycle):bool exists`**

Used by the client to avoid doubling the number of RPC calls when syncing from scratch.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_reputationMiningCycle|address|The reputation mining cycle address we want to know if any entries have been replaced in.

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|exists|bool|Boolean indicating whether there is a replacement log

### ▸ **`getReputationMiningCycle(bool _active):address repMiningCycleAddress`**

Get the address of either the active or inactive reputation mining cycle, based on `active`. The active reputation mining cycle is the one currently under consideration by reputation miners. The inactive reputation cycle is the one with the log that is being appended to.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_active|bool|Whether the user wants the active or inactive reputation mining cycle

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|repMiningCycleAddress|address|address of active or inactive ReputationMiningCycle

### ▸ **`getReputationMiningCycleReward():uint256 amount`**

Called to get the total per-cycle reputation mining reward.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|amount|uint256|The CLNY awarded per mining cycle to the miners

### ▸ **`getReputationMiningSkillId():uint256 skillId`**

Get the `skillId` of the reputation mining skill. Only set once the metacolony is set up.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|skillId|uint256|The `skillId` of the reputation mining skill.

### ▸ **`getReputationRootHash():bytes32 rootHash`**

Get the root hash of the current reputation state tree.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|rootHash|bytes32|The current Reputation Root Hash

### ▸ **`getReputationRootHashNLeaves():uint256 nLeaves`**

Get the number of leaves in the current reputation state tree.

*Note: I cannot see a reason why a user's client would need to call this - only stored to help with some edge cases in reputation mining dispute resolution.*


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nLeaves|uint256|uint256 The number of leaves in the state tree

### ▸ **`getReputationRootHashNNodes():uint256 nNodes`**

Get the number of leaves in the current reputation state tree.

*Note: Deprecated, replaced by getReputationRootHashNLeaves which does the same thing but is more accurately named.*


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nNodes|uint256|uint256 The number of leaves in the state tree

### ▸ **`getSkill(uint256 _skillId):Skill skill`**

Get the `nParents` and `nChildren` of skill with id `_skillId`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_skillId|uint256|Id of the skill

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|skill|Skill|The Skill struct

### ▸ **`getSkillCount():uint256 count`**

Get the number of skills in the network including both global and local skills.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The skill count

### ▸ **`getTokenLocking():address lockingAddress`**

Get token locking contract address.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|lockingAddress|address|Token locking contract address

### ▸ **`initialise(address _resolver, uint256 _version)`**

Initialises the colony network by setting the first Colony version resolver to `_resolver` address.

*Note: Only allowed to be run once, by the Network owner before any Colony versions are added.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_resolver|address|Address of the resolver for Colony contract
|_version|uint256|Version of the Colony contract the resolver represents


### ▸ **`initialiseReputationMining()`**

Creates initial inactive reputation mining cycle.




### ▸ **`initialiseRootLocalSkill():uint256 rootLocalSkillId`**

Initialise the local skills tree for a colony



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|rootLocalSkillId|uint256|The root local skill

### ▸ **`installExtension(bytes32 extensionId, uint256 version)`**

Install an extension in a colony. Can only be called by a Colony.


**Parameters**

|Name|Type|Description|
|---|---|---|
|extensionId|bytes32|keccak256 hash of the extension name, used as an indentifier
|version|uint256|Version of the extension to install


### ▸ **`isColony(address _colony):bool addressIsColony`**

Check if specific address is a colony created on colony network.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_colony|address|Address of the colony

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|addressIsColony|bool|true if specified address is a colony, otherwise false

### ▸ **`lookupRegisteredENSDomain(address addr):string domain`**

Reverse lookup a username from an address.


**Parameters**

|Name|Type|Description|
|---|---|---|
|addr|address|The address we wish to find the corresponding ENS domain for (if any)

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|domain|string|A string containing the colony-based ENS name corresponding to addr

### ▸ **`punishStakers(address[] memory _stakers, uint256 _amount)`**

Function called to punish people who staked against a new reputation root hash that turned out to be incorrect.

*Note: While external, it can only be called successfully by the current ReputationMiningCycle.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_stakers|address[]|Array of the addresses of stakers to punish
|_amount|uint256|Amount of stake to slash


### ▸ **`registerColonyLabel(string memory colonyName, string memory orbitdb)`**

Register a "colony.joincolony.eth" label. Can only be called by a Colony.


**Parameters**

|Name|Type|Description|
|---|---|---|
|colonyName|string|The label to register.
|orbitdb|string|The path of the orbitDB database associated with the colony name


### ▸ **`registerUserLabel(string memory username, string memory orbitdb)`**

Register a "user.joincolony.eth" label.


**Parameters**

|Name|Type|Description|
|---|---|---|
|username|string|The label to register
|orbitdb|string|The path of the orbitDB database associated with the user profile


### ▸ **`reward(address _recipient, uint256 _amount)`**

Used to track that a user is eligible to claim a reward

*Note: Only callable by the active reputation mining cycle*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_recipient|address|The address receiving the award
|_amount|uint256|The amount of CLNY to be awarded


### ▸ **`setFeeInverse(uint256 _feeInverse)`**

Set the colony network fee to pay. e.g. if the fee is 1% (or 0.01), pass 100 as `_feeInverse`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_feeInverse|uint256|The inverse of the network fee to set


### ▸ **`setMiningDelegate(address _delegate, bool _allowed)`**

Called to give or remove another address's permission to mine on your behalf


**Parameters**

|Name|Type|Description|
|---|---|---|
|_delegate|address|The address you're giving or removing permission from
|_allowed|bool|Whether they are allowed (true) or not (false) to mine on your behalf


### ▸ **`setMiningResolver(address miningResolverAddress)`**

Set the resolver to be used by new instances of ReputationMiningCycle.


**Parameters**

|Name|Type|Description|
|---|---|---|
|miningResolverAddress|address|The address of the Resolver contract with the functions correctly wired.


### ▸ **`setPayoutWhitelist(address _token, bool _status)`**

Set a token's status in the payout whitelist


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|The token being set
|_status|bool|The whitelist status


### ▸ **`setReplacementReputationUpdateLogEntry(address _reputationMiningCycle, uint256 _id, address _user, int _amount, uint256 _skillId, address _colony, uint128 _nUpdates, uint128 _nPreviousUpdates)`**

Set a replacement log entry if we're in recovery mode.

*Note: Note that strictly, `_nUpdates` and `_nPreviousUpdates` don't need to be set - they're only used during dispute resolution, which these replacement log entries are never used for. However, for ease of resyncing the client, we have decided to include them for now.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_reputationMiningCycle|address|The address of the reputation mining cycle that the log was in.
|_id|uint256|The number of the log entry in the reputation mining cycle in question.
|_user|address|The address of the user earning / losing the reputation
|_amount|int|The amount of reputation being earned / lost
|_skillId|uint256|The id of the origin skill for the reputation update
|_colony|address|The address of the colony being updated
|_nUpdates|uint128|The number of updates the log entry corresponds to
|_nPreviousUpdates|uint128|The number of updates in the log before this entry


### ▸ **`setReputationMiningCycleReward(uint256 _amount)`**

Called to set the total per-cycle reputation reward, which will be split between all miners.

*Note: Can only be called by the MetaColony.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_amount|uint256|The CLNY awarded per mining cycle to the miners


### ▸ **`setReputationRootHash(bytes32 newHash, uint256 newNLeaves, address[] memory stakers)`**

Set a new Reputation root hash and starts a new mining cycle. Can only be called by the ReputationMiningCycle contract.


**Parameters**

|Name|Type|Description|
|---|---|---|
|newHash|bytes32|The reputation root hash
|newNLeaves|uint256|The updated leaves count value
|stakers|address[]|Array of users who submitted or backed the hash, being accepted here as the new reputation root hash


### ▸ **`setTokenLocking(address _tokenLockingAddress)`**

Sets the token locking address. This is only set once, and can't be changed afterwards.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_tokenLockingAddress|address|Address of the locking contract


### ▸ **`setupRegistrar(address _ens, bytes32 _rootNode)`**

Setup registrar with ENS and root node.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_ens|address|Address of ENS registrar
|_rootNode|bytes32|Namehash of the root node for the domain


### ▸ **`stakeForMining(uint256 _amount)`**

Stake CLNY to allow the staker to participate in reputation mining.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_amount|uint256|Amount of CLNY to stake for the purposes of mining


### ▸ **`startNextCycle()`**

Starts a new Reputation Mining cycle. Explicitly called only the first time, subsequently called from within `setReputationRootHash`.




### ▸ **`startTokenAuction(address _token)`**

Create and start a new `DutchAuction` for the entire amount of `_token` owned by the Colony Network.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token held by the network to be auctioned


### ▸ **`supportsInterface(bytes4 interfaceID):bool status`**

Query if a contract implements an interface

*Note: Interface identification is specified in ERC-165.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|interfaceID|bytes4|The interface identifier, as specified in ERC-165

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|status|bool|`true` if the contract implements `interfaceID`

### ▸ **`uninstallExtension(bytes32 extensionId)`**

Uninstall an extension in a colony. Can only be called by a Colony.


**Parameters**

|Name|Type|Description|
|---|---|---|
|extensionId|bytes32|keccak256 hash of the extension name, used as an indentifier


### ▸ **`unstakeForMining(uint256 _amount)`**

Unstake CLNY currently staked for reputation mining.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_amount|uint256|Amount of CLNY staked for mining to unstake


### ▸ **`updateColonyOrbitDB(string memory orbitdb)`**

Update a colony's orbitdb address. Can only be called by a colony with a registered subdomain


**Parameters**

|Name|Type|Description|
|---|---|---|
|orbitdb|string|The path of the orbitDB database to be associated with the colony


### ▸ **`updateUserOrbitDB(string memory orbitdb)`**

Update a user's orbitdb address. Can only be called by a user with a registered subdomain


**Parameters**

|Name|Type|Description|
|---|---|---|
|orbitdb|string|The path of the orbitDB database to be associated with the user


### ▸ **`upgradeExtension(bytes32 extensionId, uint256 newVersion)`**

Upgrade an extension in a colony. Can only be called by a Colony.


**Parameters**

|Name|Type|Description|
|---|---|---|
|extensionId|bytes32|keccak256 hash of the extension name, used as an indentifier
|newVersion|uint256|Version of the extension to upgrade to (must be one greater than current)