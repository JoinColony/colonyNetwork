# Evaluated Expenditure (`EvaluatedExpenditure`)

  
## Interface Methods

### ▸ `deprecate(bool _deprecated)`

Called when deprecating (or undeprecating) the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_deprecated|bool|Indicates whether the extension should be deprecated or undeprecated


### ▸ `finishUpgrade()`

Called when upgrading the extension




### ▸ `getMetatransactionNonce(address _userAddress):uint256 nonce`

Gets the next nonce for a meta-transaction


**Parameters**

|Name|Type|Description|
|---|---|---|
|_userAddress|address|The user's address

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nonce|uint256|The nonce

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


### ▸ `setExpenditurePayoutModifiers(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id, uint256[] memory _slots, int256[] memory _payoutModifiers)`

Sets the payout modifiers in given expenditure slots, using the arbitration permission


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which the extension has the arbitration permission
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_id|uint256|Expenditure identifier
|_slots|uint256[]|Array of slots to set payout modifiers
|_payoutModifiers|int256[]|Values (between +/- WAD) to modify the payout & reputation bonus


### ▸ `uninstall()`

Called when uninstalling the extension




### ▸ `version():uint256 _version`

Returns the version of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_version|uint256|The extension's version number