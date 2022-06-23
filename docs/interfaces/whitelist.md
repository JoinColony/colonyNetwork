# Whitelist Extension (`Whitelist`)

Alongside the Coin Machine Extension, a colony may use the Whitelist extension to filter wallet addresses allowed to take part in a token sale on Coin Machine.

See [here](https://colony.gitbook.io/colony/extensions/whitelist) for more information.

  
## Interface Methods

### ▸ **`approveUsers(address[] memory _users, bool _status)`**

Sets user statuses in the whitelist


**Parameters**

|Name|Type|Description|
|---|---|---|
|_users|address[]|An array of user addresses
|_status|bool|The whitelist status to set


### ▸ **`deprecate(bool _deprecated)`**

Called when deprecating (or undeprecating) the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_deprecated|bool|Indicates whether the extension should be deprecated or undeprecated


### ▸ **`finishUpgrade()`**

Called when upgrading the extension




### ▸ **`getAgreementHash():string hash`**

Get the agreementHash



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|hash|string|The agreement hash

### ▸ **`getApproval(address _user):bool status`**

Get the user's approval status


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The address of the user

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|status|bool|The user's approval status

### ▸ **`getMetatransactionNonce(address userAddress):uint256 nonce`**

Gets the next nonce for a meta-transaction


**Parameters**

|Name|Type|Description|
|---|---|---|
|userAddress|address|The user's address

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nonce|uint256|The nonce

### ▸ **`getSignature(address _user):bool status`**

Get the user's signature status


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The address of the user

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|status|bool|The user's signature status

### ▸ **`getUseApprovals():bool useApprovals`**

Get the useApprovals boolean



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|useApprovals|bool|Whether `useApprovals` is `true`

### ▸ **`identifier():bytes32 identifier`**

Returns the identifier of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|identifier|bytes32|The extension's identifier

### ▸ **`initialise(bool _useApprovals, string memory _agreementHash)`**

Initialise the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_useApprovals|bool|Whether or not to require administrative approval
|_agreementHash|string|An agreement hash (such as an IPFS URI)


### ▸ **`install(address _colony)`**

Configures the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_colony|address|The colony in which the extension holds permissions


### ▸ **`isApproved(address _user):bool approved`**

Get the user's overall whitelist status


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The address of the user

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|approved|bool|Is `true` when the user is approved

### ▸ **`signAgreement(string memory _agreementHash)`**

The user's signature on the agreement


**Parameters**

|Name|Type|Description|
|---|---|---|
|_agreementHash|string|The agreement hash being signed


### ▸ **`uninstall()`**

Called when uninstalling the extension




### ▸ **`version():uint256 version`**

Returns the version of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|version|uint256|The extension's version number