# Whitelist Extension (`Whitelist`)

Alongside the Coin Machine Extension, a colony may use the Whitelist extension to filter wallet addresses allowed to take part in a token sale on Coin Machine.

See [here](https://colony.gitbook.io/colony/extensions/whitelist) for more information.

  
## Interface Methods

### ▸ `approveUsers(address[] memory _users, bool _status)`

Sets user statuses in the whitelist


**Parameters**

|Name|Type|Description|
|---|---|---|
|_users|address[]|An array of user addresses
|_status|bool|The whitelist status to set


### ▸ `getAgreementHash():string _hash`

Get the agreementHash



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_hash|string|The agreement hash

### ▸ `getApproval(address _user):bool _status`

Get the user's approval status


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The address of the user

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_status|bool|The user's approval status

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

### ▸ `getSignature(address _user):bool _status`

Get the user's signature status


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The address of the user

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_status|bool|The user's signature status

### ▸ `getUseApprovals():bool _useApprovals`

Get the useApprovals boolean



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_useApprovals|bool|Whether `useApprovals` is `true`

### ▸ `identifier():bytes32 _identifier`

Returns the identifier of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_identifier|bytes32|The extension's identifier

### ▸ `initialise(bool _useApprovals, string memory _agreementHash)`

Initialise the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_useApprovals|bool|Whether or not to require administrative approval
|_agreementHash|string|An agreement hash (such as an IPFS URI)


### ▸ `isApproved(address _user):bool _approved`

Get the user's overall whitelist status


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The address of the user

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_approved|bool|Is `true` when the user is approved

### ▸ `signAgreement(string memory _agreementHash)`

The user's signature on the agreement


**Parameters**

|Name|Type|Description|
|---|---|---|
|_agreementHash|string|The agreement hash being signed


### ▸ `version():uint256 _version`

Returns the version of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_version|uint256|The extension's version number