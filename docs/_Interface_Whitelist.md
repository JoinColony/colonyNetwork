## Interface Methods

### `approveUsers`

Sets user statuses in the whitelist


**Parameters**

|Name|Type|Description|
|---|---|---|
|_users|address[]|An array of user addresses
|_status|bool|The whitelist status to set


### `deprecate`

Called when deprecating (or undeprecating) the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_deprecated|bool|Indicates whether the extension should be deprecated or undeprecated


### `finishUpgrade`

Called when upgrading the extension




### `getAgreementHash`

Get the agreementHash



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|hash|string|The agreement hash

### `getApproval`

Get the user's approval status


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The address of the user

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|status|bool|The user's approval status

### `getMetatransactionNonce`

Gets the next nonce for a meta-transaction


**Parameters**

|Name|Type|Description|
|---|---|---|
|userAddress|address|The user's address

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nonce|uint256|The nonce

### `getSignature`

Get the user's signature status


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The address of the user

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|status|bool|The user's signature status

### `getUseApprovals`

Get the useApprovals boolean



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|useApprovals|bool|Whether `useApprovals` is `true`

### `identifier`

Returns the identifier of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|identifier|bytes32|The extension's identifier

### `initialise`

Initialise the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_useApprovals|bool|Whether or not to require administrative approval
|_agreementHash|string|An agreement hash (such as an IPFS URI)


### `install`

Configures the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_colony|address|The colony in which the extension holds permissions


### `isApproved`

Get the user's overall whitelist status


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The address of the user

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|approved|bool|Is `true` when the user is approved

### `signAgreement`

The user's signature on the agreement


**Parameters**

|Name|Type|Description|
|---|---|---|
|_agreementHash|string|The agreement hash being signed


### `uninstall`

Called when uninstalling the extension




### `version`

Returns the version of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|version|uint256|The extension's version number