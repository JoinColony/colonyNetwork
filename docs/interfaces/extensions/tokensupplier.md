# Token Supplier (`TokenSupplier`)

A simple extension which allows a colony to automatically manage the
token supply. A colony can configure a maximum supply and a rate of issuance,
at which point anyone can continually mint tokens and have them sent
to the colony.

  
## Interface Methods

### ▸ `deprecate(bool _deprecated)`

Called when deprecating (or undeprecating) the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_deprecated|bool|Indicates whether the extension should be deprecated or undeprecated


### ▸ `finishUpgrade()`

Called when upgrading the extension (currently a no-op)




### ▸ `getLastPinged():uint256 lastPinged`

Get the time of the last token minting event



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|lastPinged|uint256|The timestamp of the last ping

### ▸ `getLastRateUpdate():uint256 lastUpdate`

Get the time of the last change in issuance rate



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|lastUpdate|uint256|The timestamp of the last update

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

### ▸ `getTokenIssuanceRate():uint256 issuanceRate`

Get the token issuance rate



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|issuanceRate|uint256|The token issuance rate

### ▸ `getTokenSupplyCeiling():uint256 supplyCeiling`

Get the token supply ceiling



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|supplyCeiling|uint256|The token supply ceiling

### ▸ `identifier():bytes32 _identifier`

Returns the identifier of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_identifier|bytes32|The extension's identifier

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

Update the tokenIssuanceRate


**Parameters**

|Name|Type|Description|
|---|---|---|
|_tokenIssuanceRate|uint256|Number of tokens to issue per day


### ▸ `setTokenSupplyCeiling(uint256 _tokenSupplyCeiling)`

Update the tokenSupplyCeiling, cannot set below current tokenSupply


**Parameters**

|Name|Type|Description|
|---|---|---|
|_tokenSupplyCeiling|uint256|Total amount of tokens to issue


### ▸ `uninstall()`

Called when uninstalling the extension




### ▸ `version():uint256 _version`

Returns the version of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_version|uint256|The extension's version number