# Funding Queue (`FundingQueue`)

Funding Queues are a core mechanic described in the Colony whitepaper,
allowing for teams to allocate resources in a distributed manner. Members of
a colony can make and back funding proposals, requesting that some number of tokens be
transferred between domains. The more reputation backing a proposal, the more
quickly the proposal is fulfilled, up to a maximum of half of the source domain's
assets per week. By creating and bacing funding proposals throughout the colony,
a steady flow of resources from the root through the domains can be achieved.

  
## Interface Methods

### ▸ `backProposal(uint256 _id, uint256 _backing, uint256 _currPrevId, uint256 _newPrevId, bytes memory _key, bytes memory _value, uint256 _branchMask, bytes32[] memory _siblings)`

Back a funding proposal and advance it along the list


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|The proposal Id
|_backing|uint256|The amount of backing to give the proposal (up to user's reputation)
|_currPrevId|uint256|The current previous proposal in the list
|_newPrevId|uint256|The new previous proposal after we re-arrange
|_key|bytes|A reputation hash tree key, of the caller's reputation in _domainId
|_value|bytes|Reputation value indicating the caller's reputation in _domainId
|_branchMask|uint256|The branchmask of the proof
|_siblings|bytes32[]|The siblings of the proof


### ▸ `cancelProposal(uint256 _id, uint256 _prevId)`

Cancel a funding proposal and remove from linked list


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|The proposal Id
|_prevId|uint256|The id of the preceding proposal in the linked list


### ▸ `createProposal(uint256 _domainId, uint256 _fromChildSkillIndex, uint256 _toChildSkillIndex, uint256 _fromPot, uint256 _toPot, uint256 _totalRequested, address _token)`

Create a new funding proposal


**Parameters**

|Name|Type|Description|
|---|---|---|
|_domainId|uint256|The domain the extension has the funding permission
|_fromChildSkillIndex|uint256|The index of the fromPot's domain in _domainId.children[]
|_toChildSkillIndex|uint256|The index of the toPot's domain in _domainId.children[]
|_fromPot|uint256|Funding pot id providing the funds
|_toPot|uint256|Funding pot id receiving the funds
|_totalRequested|uint256|The total amount being requested
|_token|address|


### ▸ `deprecate(bool _deprecated)`

Called when deprecating (or undeprecating) the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_deprecated|bool|Indicates whether the extension should be deprecated or undeprecated


### ▸ `finishUpgrade()`

Called when upgrading the extension




### ▸ `getMetatransactionNonce(address userAddress):uint256 nonce`

Gets the next nonce for a meta-transaction


**Parameters**

|Name|Type|Description|
|---|---|---|
|userAddress|address|The user's address

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nonce|uint256|The nonce

### ▸ `getNextProposalId(uint256 _id):uint256 nextId`

Gets the id of the next proposal in the list


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|The proposal Id

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nextId|uint256|The next proposal Id in the list

### ▸ `getProposal(uint256 _id):Proposal proposal`

Get the proposal struct for a given proposal


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|The proposal Id

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|proposal|Proposal|The proposal struct

### ▸ `getProposalCount():uint256 count`

Get the total number of proposals



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The count

### ▸ `getSupport(uint256 _id, address _supporter):uint256 support`

Gets the reputation support from a user to a proposal


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|The proposal Id
|_supporter|address|

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|support|uint256|

### ▸ `identifier():bytes32 _identifier`

Returns the identifier of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_identifier|bytes32|The extension's identifier

### ▸ `install(address _colony)`

Configures the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_colony|address|The colony in which the extension holds permissions


### ▸ `pingProposal(uint256 _id)`

Transfer the marginal funds


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|The proposal Id


### ▸ `reclaimStake(uint256 _id)`

Reclaim the stake after the proposal is funded


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|The proposal Id


### ▸ `stakeProposal(uint256 _id, bytes memory _key, bytes memory _value, uint256 _branchMask, bytes32[] memory _siblings)`

Stake a funding proposal


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|The proposal Id
|_key|bytes|A reputation hash tree key, of the total reputation in _domainId
|_value|bytes|Reputation value indicating the total reputation in _domainId
|_branchMask|uint256|The branchmask of the proof
|_siblings|bytes32[]|The siblings of the proof


### ▸ `uninstall()`

Called when uninstalling the extension




### ▸ `version():uint256 _version`

Returns the version of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_version|uint256|The extension's version number