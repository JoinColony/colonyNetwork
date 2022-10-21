# Staked Expenditure (`StakedExpenditure`)

This extension allows users without the Administration permission to create
expenditures by posting a small stake. If the expenditure is refined and
finalized without issue, then the stake is returned. If for whatever reason
the creator is found to have acted inapproriately, they run the risk of losing
their stake.

  
## Interface Methods

### ▸ `cancelAndPunish(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _callerPermissionDomainId, uint256 _callerChildSkillIndex, uint256 _expenditureId, bool _punish)`

Can only be called by an arbitration user


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which the extension has the arbitration permission
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_callerPermissionDomainId|uint256|The domainId in which the caller has the arbitration permission
|_callerChildSkillIndex|uint256|The index that the `_domainId` is relative to `_callerPermissionDomainId`
|_expenditureId|uint256|The id of the expenditure
|_punish|bool|Whether the staker should be punished by losing an amount of reputation equal to the stake


### ▸ `cancelAndReclaimStake(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _expenditureId)`

Can only be called by expenditure owner while expenditure is in draft state


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which the extension has the arbitration permission
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_expenditureId|uint256|The id of the expenditure


### ▸ `deprecate(bool _deprecated)`

Called when deprecating (or undeprecating) the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_deprecated|bool|Indicates whether the extension should be deprecated or undeprecated


### ▸ `finishUpgrade()`

Called when upgrading the extension




### ▸ `getStake(uint256 _expenditureId):Stake stake`

Get the stake for an expenditure


**Parameters**

|Name|Type|Description|
|---|---|---|
|_expenditureId|uint256|The id of the expenditure to get the stake for

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|stake|Stake|The stake, a struct holding the staker's address and the stake amount

### ▸ `getStakeFraction():uint256 _stakeFraction`

Get the stake fraction



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_stakeFraction|uint256|The stake fraction

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


### ▸ `makeExpenditureWithStake(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId, bytes memory _key, bytes memory _value, uint256 _branchMask, bytes32[] memory _siblings)`

Make an expenditure by putting up a stake


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which the extension has the administration permission
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`,
|_domainId|uint256|The domain where the expenditure belongs
|_key|bytes|A reputation hash tree key, of the total reputation in _domainId
|_value|bytes|Reputation value indicating the total reputation in _domainId
|_branchMask|uint256|The branchmask of the proof
|_siblings|bytes32[]|The siblings of the proof


### ▸ `reclaimStake(uint256 _expenditureId)`

Reclaims the stake if the expenditure is finalized or cancelled


**Parameters**

|Name|Type|Description|
|---|---|---|
|_expenditureId|uint256|The id of the expenditure


### ▸ `setStakeFraction(uint256 _stakeFraction)`

Sets the stake fraction


**Parameters**

|Name|Type|Description|
|---|---|---|
|_stakeFraction|uint256|WAD-denominated fraction, used to determine stake as fraction of rep in domain


### ▸ `uninstall()`

Called when uninstalling the extension




### ▸ `version():uint256 _version`

Returns the version of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_version|uint256|The extension's version number