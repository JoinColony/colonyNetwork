# Colony Extension (`IColonyExtension`)

Colony extensions are free-standing contracts which augment Colonies with
additional functionality. In addition to their specific functionality,
all extensions conform to a standard interface, defined in this file.

  
## Interface Methods

### ▸ `deprecate(bool _deprecated)`

Called when deprecating (or undeprecating) the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_deprecated|bool|Indicates whether the extension should be deprecated or undeprecated


### ▸ `executeMetaTransaction(address userAddress, bytes memory payload, bytes32 sigR, bytes32 sigS, uint8 sigV):bytes returnData`

Executes a metatransaction targeting this contract


**Parameters**

|Name|Type|Description|
|---|---|---|
|userAddress|address|The address of the user that signed the metatransaction
|payload|bytes|The transaction data that will be executed if signature valid
|sigR|bytes32|The 'r' part of the signature
|sigS|bytes32|The 's' part of the signature
|sigV|uint8|The 'v' part of the signature

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|returnData|bytes|The return data of the executed transaction

### ▸ `finishUpgrade()`

Called when upgrading the extension (can be a no-op)




### ▸ `getCapabilityRoles(bytes4 _sig):bytes32 roles`

Gets the bytes32 representation of the roles authorized to call a function


**Parameters**

|Name|Type|Description|
|---|---|---|
|_sig|bytes4|The function signature

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|roles|bytes32|bytes32 representation of the authorized roles

### ▸ `getColony():address colony`

Gets the address of the extension's colony



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colony|address|The address of the colony

### ▸ `getDeprecated():bool deprecated`

Gets the boolean indicating whether or not the extension is deprecated



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|deprecated|bool|Boolean indicating whether or not the extension is deprecated

### ▸ `getMetatransactionNonce(address userAddress):uint256 nonce`

Gets the next metatransaction nonce for user that should be used targeting this contract


**Parameters**

|Name|Type|Description|
|---|---|---|
|userAddress|address|The address of the user that will sign the metatransaction

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nonce|uint256|The nonce that should be used for the next metatransaction

### ▸ `identifier():bytes32 identifier`

Returns the identifier of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|identifier|bytes32|The extension's identifier

### ▸ `install(address _colony)`

Configures the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_colony|address|The colony in which the extension holds permissions


### ▸ `multicall(bytes[] calldata _data):bytes[] results`

Call multiple functions in the current contract and return the data from all of them if they all succeed

*Note: The `msg.value` should not be trusted for any method callable from multicall.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_data|bytes[]|The encoded function data for each of the calls to make to this contract

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|results|bytes[]|The results from each of the calls passed in via data

### ▸ `uninstall()`

Called when uninstalling the extension




### ▸ `version():uint256 version`

Returns the version of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|version|uint256|The extension's version number