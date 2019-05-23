---
title: IColonyNetwork
section: Interface
order: 2
---

  

## Interface Methods



### `addColonyVersion`

Adds a new Colony contract version and the address of associated `_resolver` contract. Secured function to authorised members



**Parameters**


|Name|Type|Description|
|---|---|---|
|_version|uint256| The new Colony contract version
|_resolver|address| Address of the `Resolver` contract which will be used with the underlying `EtherRouter` contract





### `addr`

Returns the address the supplied node resolves do, if we are the resolver



**Parameters**


|Name|Type|Description|
|---|---|---|
|node|bytes32| The namehash of the ENS address being requested



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|_undefined_|address|



### `addSkill`

Adds a new skill to the global or local skills tree, under skill `_parentSkillId`



**Parameters**


|Name|Type|Description|
|---|---|---|
|_parentSkillId|uint256| Id of the skill under which the new skill will be added. If 0, a global skill is added with no parent



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|skillId|uint256| Id of the added skill



### `appendReputationUpdateLog`

Adds a reputation update entry to log



**Parameters**


|Name|Type|Description|
|---|---|---|
|_user|address| The address of the user for the reputation update
|_amount|int256| The amount of reputation change for the update, this can be a negative as well as a positive value
|_skillId|uint256| The skill for the reputation update





### `calculateMinerWeight`

Calculate raw miner weight in WADs



**Parameters**


|Name|Type|Description|
|---|---|---|
|_timeStaked|uint256| Amount of time (in seconds) that the miner has staked their CLNY
|_submissonIndex|uint256| Index of reputation hash submission (between 0 and 11)



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|minerWeight|uint256| The weight of miner reward



### `createColony`

Creates a new colony in the network



**Parameters**


|Name|Type|Description|
|---|---|---|
|_tokenAddress|address| Address of an ERC20 token to serve as the colony token



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|_undefined_|address|



### `createMetaColony`

Create the Meta Colony, same as a normal colony plus the root skill



**Parameters**


|Name|Type|Description|
|---|---|---|
|_tokenAddress|address| Address of the CLNY token





### `deprecateSkill`

Mark a global skill as deprecated which stops new tasks and payments from using it.



**Parameters**


|Name|Type|Description|
|---|---|---|
|_skillId|uint256| Id of the skill





### `getChildSkillId`

Get the id of the child skill at index `_childSkillIndex` for skill with Id `_skillId`



**Parameters**


|Name|Type|Description|
|---|---|---|
|_skillId|uint256| Id of the skill
|_childSkillIndex|uint256| Index of the `skill.children` array to get



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|skillId|uint256| Skill Id of the requested child skill



### `getColony`

Get the number of colonies in the network



**Parameters**


|Name|Type|Description|
|---|---|---|
|_id|uint256|



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|colonyAddress|address|



### `getColonyCount`

Get the number of colonies in the network





**Return Parameters**


|Name|Type|Description|
|---|---|---|
|count|uint256| The colony 



### `getColonyVersionResolver`

Get the `Resolver` address for Colony contract version `_version`



**Parameters**


|Name|Type|Description|
|---|---|---|
|_version|uint256| The Colony contract version



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|resolverAddress|address| Address of the `Resolver` contract



### `getCurrentColonyVersion`

Returns the latest Colony contract version. This is the version used to create all new colonies





**Return Parameters**


|Name|Type|Description|
|---|---|---|
|version|uint256| The current / latest Colony contract 



### `getENSRegistrar`

Returns the address of the ENSRegistrar for the Network





**Return Parameters**


|Name|Type|Description|
|---|---|---|
|_undefined_|address|



### `getFeeInverse`

Return 1 / the fee to pay to the network. e.g. if the fee is 1% (or 0.01), return 100





**Return Parameters**


|Name|Type|Description|
|---|---|---|
|_feeInverse|uint256|



### `getMetaColony`

Get the Meta Colony address





**Return Parameters**


|Name|Type|Description|
|---|---|---|
|_undefined_|address|



### `getMiningResolver`

Get the resolver to be used by new instances of ReputationMiningCycle





**Return Parameters**


|Name|Type|Description|
|---|---|---|
|miningResolverAddress|address| The address of the mining cycle resolver currently used by new instances



### `getParentSkillId`

Get the id of the parent skill at index `_parentSkillIndex` for skill with Id `_skillId`



**Parameters**


|Name|Type|Description|
|---|---|---|
|_skillId|uint256| Id of the skill
|_parentSkillIndex|uint256| Index of the `skill.parents` array to get



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|skillId|uint256| Skill Id of the requested parent skill



### `getProfileDBAddress`

Retrieve the orbitdb address corresponding to a registered account



**Parameters**


|Name|Type|Description|
|---|---|---|
|node|bytes32| The Namehash of the account being queried.



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|orbitDB|string| A string containing the address of the orbit database



### `getReplacementReputationUpdateLogEntry`

Get a replacement log entry (if set) for the log entry _id in the mining cycle that was at the address _reputationMiningCycle



**Parameters**


|Name|Type|Description|
|---|---|---|
|_reputationMiningCycle|address| The address of the reputation mining cycle we are asking about
|_id|uint256| The log entry number we wish to see if there is a replacement for



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|reputationLogEntry|memory|



### `getReplacementReputationUpdateLogsExist`

Used by the client to avoid doubling the number of RPC calls when syncing from scratch.



**Parameters**


|Name|Type|Description|
|---|---|---|
|_reputationMiningCycle|address| The reputation mining cycle address we want to know if any entries have been replaced in.



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|_undefined_|bool|



### `getReputationMiningCycle`

Get the address of either the active or inactive reputation mining cycle, based on `active`. The active reputation mining cycle



**Parameters**


|Name|Type|Description|
|---|---|---|
|_active|bool| Whether the user wants the active or inactive reputation mining cycle



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|repMiningCycleAddress|address| address of active or inactive ReputationMiningCycle



### `getReputationMiningSkillId`

Get the skillId of the reputation mining skill. Only set once the metacolony is set up





**Return Parameters**


|Name|Type|Description|
|---|---|---|
|_undefined_|uint256|



### `getReputationRootHash`

Get the root hash of the current reputation state tree





**Return Parameters**


|Name|Type|Description|
|---|---|---|
|rootHash|bytes32| bytes32 The current Reputation Root Hash



### `getReputationRootHashNNodes`

Get the number of nodes in the current reputation state tree.





**Return Parameters**


|Name|Type|Description|
|---|---|---|
|nNodes|uint256| uint256 The number of nodes in the state tree



### `getSkill`

Get the `nParents` and `nChildren` of skill with id `_skillId`



**Parameters**


|Name|Type|Description|
|---|---|---|
|_skillId|uint256| Id of the skill



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|skill|memory| The Skill struct



### `getSkillCount`

Get the number of skills in the network including both global and local skills





**Return Parameters**


|Name|Type|Description|
|---|---|---|
|count|uint256| The skill 



### `getTokenLocking`

Get token locking contract address





**Return Parameters**


|Name|Type|Description|
|---|---|---|
|lockingAddress|address| Token locking contract address



### `initialise`

Initialises the colony network by setting the first Colony version resolver to `_resolver` address



**Parameters**


|Name|Type|Description|
|---|---|---|
|_resolver|address| Address of the resolver for Colony contract version 1





### `initialiseReputationMining`

Creates initial inactive reputation mining cycle







### `isColony`

Check if specific address is a colony created on colony network



**Parameters**


|Name|Type|Description|
|---|---|---|
|_colony|address| Address of the colony



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|addressIsColony|bool| true if specified address is a colony, otherwise false



### `lookupRegisteredENSDomain`

Reverse lookup a username from an address.



**Parameters**


|Name|Type|Description|
|---|---|---|
|addr|address| The 



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|domain|string| A string containing the colony-based ENS name corresponding to addr



### `registerColonyLabel`

Register a "colony.joincolony.eth" label. Can only be called by a Colony.



**Parameters**


|Name|Type|Description|
|---|---|---|
|colonyName|string| The label to register.
|orbitdb|string| The path of the orbitDB database associated with the colony name





### `registerUserLabel`

Register a "user.joincolony.eth" label.



**Parameters**


|Name|Type|Description|
|---|---|---|
|username|string| The label to register
|orbitdb|string| The path of the orbitDB database associated with the user profile





### `setFeeInverse`

Set the colony network fee to pay. e.g. if the fee is 1% (or 0.01), pass 100 as _feeInverse



**Parameters**


|Name|Type|Description|
|---|---|---|
|_feeInverse|uint256| The inverse of the network fee to set





### `setMiningResolver`

Set the resolver to be used by new instances of ReputationMiningCycle



**Parameters**


|Name|Type|Description|
|---|---|---|
|miningResolverAddress|address| The address of the Resolver contract with the functions correctly wired.





### `setReplacementReputationUpdateLogEntry`





**Parameters**


|Name|Type|Description|
|---|---|---|
|_reputationMiningCycle|address|
|_id|uint256|
|_user|address|
|_amount|int|
|_skillId|uint256|
|_colony|address|
|_nUpdates|uint128|
|_nPreviousUpdates|uint128|





### `setReputationRootHash`

Set a new Reputation root hash and starts a new mining cycle. Can only be called by the ReputationMiningCycle contract.



**Parameters**


|Name|Type|Description|
|---|---|---|
|newHash|bytes32| The reputation root hash
|newNNodes|uint256| The updated nodes count value
|stakers|memory| Array of users who submitted or backed the hash, being accepted here as the new reputation root hash
|reward|uint256| Amount of CLNY to be distributed as 





### `setTokenLocking`

Sets the token locking address



**Parameters**


|Name|Type|Description|
|---|---|---|
|_tokenLockingAddress|address| Address of the locking contract





### `setupRegistrar`

Setup registrar with ENS and root node



**Parameters**


|Name|Type|Description|
|---|---|---|
|_ens|address| Address of ENS registrar
|_rootNode|bytes32| Namehash of the root node for the domain





### `startNextCycle`

Starts a new Reputation Mining cycle. Explicitly called only the first time,







### `startTokenAuction`

Create and start a new `DutchAuction` for the entire amount of `_token` owned by the Colony Network



**Parameters**


|Name|Type|Description|
|---|---|---|
|_token|address| Address of the token held by the network to be auctioned





### `supportsInterface`

Query if a contract implements an interface



**Parameters**


|Name|Type|Description|
|---|---|---|
|interfaceID|bytes4| The interface identifier, as specified in ERC-165



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|_undefined_|bool|