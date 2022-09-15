# Token Supplier (`TokenSupplier`)

  
## Interface Methods

### ▸ `deprecate(bool _deprecated)`

Called when deprecating (or undeprecating) the extension (currently a no-op)


**Parameters**

|Name|Type|Description|
|---|---|---|
|_deprecated|bool|


### ▸ `finishUpgrade()`

Called when upgrading the extension (currently a no-op)




### ▸ `getLastPinged():uint256 uint256`





**Return Parameters**

|Name|Type|Description|
|---|---|---|
|uint256|uint256|

### ▸ `getLastRateUpdate():uint256 uint256`





**Return Parameters**

|Name|Type|Description|
|---|---|---|
|uint256|uint256|

### ▸ `getMetatransactionNonce(address userAddress):uint256 nonce`




**Parameters**

|Name|Type|Description|
|---|---|---|
|userAddress|address|

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nonce|uint256|

### ▸ `getTokenIssuanceRate():uint256 uint256`





**Return Parameters**

|Name|Type|Description|
|---|---|---|
|uint256|uint256|

### ▸ `getTokenSupplyCeiling():uint256 uint256`





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

### ▸ `initialise(uint256 _tokenSupplyCeiling, uint256 _tokenIssuanceRate)`

Initialise the extension, must be called before any tokens can be issued


**Parameters**

|Name|Type|Description|
|---|---|---|
|_tokenSupplyCeiling|uint256|Total amount of tokens to issue
|_tokenIssuanceRate|uint256|Number of tokens to issue per day


### ▸ `install(address _colony)`

Configures the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_colony|address|The colony in which the extension holds permissions


### ▸ `issueTokens()`

Issue the appropriate amount of tokens




### ▸ `setTokenIssuanceRate(uint256 _tokenIssuanceRate)`




**Parameters**

|Name|Type|Description|
|---|---|---|
|_tokenIssuanceRate|uint256|


### ▸ `setTokenSupplyCeiling(uint256 _tokenSupplyCeiling)`

Update the tokenSupplyCeiling, cannot set below current tokenSupply


**Parameters**

|Name|Type|Description|
|---|---|---|
|_tokenSupplyCeiling|uint256|Total amount of tokens to issue


### ▸ `uninstall()`

Called when uninstalling the extension




### ▸ `version():uint256 uint256`

Returns the version of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|uint256|uint256|