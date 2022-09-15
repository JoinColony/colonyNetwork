# Funding Queue (`FundingQueue`)

  
## Interface Methods

### ▸ `backProposal(uint256 _id, uint256 _backing, uint256 _currPrevId, uint256 _newPrevId, bytes memory _key, bytes memory _value, uint256 _branchMask, bytes32[] memory _siblings)`




**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|
|_backing|uint256|
|_currPrevId|uint256|
|_newPrevId|uint256|
|_key|bytes|
|_value|bytes|
|_branchMask|uint256|
|_siblings|bytes32[]|


### ▸ `cancelProposal(uint256 _id, uint256 _prevId)`




**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|
|_prevId|uint256|


### ▸ `createProposal(uint256 _domainId, uint256 _fromChildSkillIndex, uint256 _toChildSkillIndex, uint256 _fromPot, uint256 _toPot, uint256 _totalRequested, address _token)`




**Parameters**

|Name|Type|Description|
|---|---|---|
|_domainId|uint256|
|_fromChildSkillIndex|uint256|
|_toChildSkillIndex|uint256|
|_fromPot|uint256|
|_toPot|uint256|
|_totalRequested|uint256|
|_token|address|


### ▸ `deprecate(bool _deprecated)`

Called when deprecating (or undeprecating) the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_deprecated|bool|


### ▸ `finishUpgrade()`

Called when upgrading the extension




### ▸ `getMetatransactionNonce(address userAddress):uint256 nonce`




**Parameters**

|Name|Type|Description|
|---|---|---|
|userAddress|address|

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nonce|uint256|

### ▸ `getNextProposalId(uint256 _id):uint256 uint256`




**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|uint256|uint256|

### ▸ `getProposal(uint256 _id):Proposal proposal`




**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|proposal|Proposal|

### ▸ `getProposalCount():uint256 uint256`





**Return Parameters**

|Name|Type|Description|
|---|---|---|
|uint256|uint256|

### ▸ `getSupport(uint256 _id, address _supporter):uint256 uint256`




**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|
|_supporter|address|

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|uint256|uint256|

### ▸ `identifier():bytes32 bytes32`

Returns the identifier of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|bytes32|bytes32|

### ▸ `install(address _colony)`

Configures the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_colony|address|The colony in which the extension holds permissions


### ▸ `pingProposal(uint256 _id)`




**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|


### ▸ `reclaimStake(uint256 _id)`




**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|


### ▸ `stakeProposal(uint256 _id, bytes memory _key, bytes memory _value, uint256 _branchMask, bytes32[] memory _siblings)`




**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|
|_key|bytes|
|_value|bytes|
|_branchMask|uint256|
|_siblings|bytes32[]|


### ▸ `uninstall()`

Called when uninstalling the extension




### ▸ `version():uint256 uint256`

Returns the version of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|uint256|uint256|