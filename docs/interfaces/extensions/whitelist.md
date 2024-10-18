# Whitelist Extension (`Whitelist`)

Alongside the Coin Machine Extension, a colony may use the Whitelist extension to filter wallet addresses allowed to take part in a token sale on Coin Machine.

See [here](https://colony.gitbook.io/colony/extensions/whitelist) for more information.

_This is a Colony Extension which conforms to the extension interface found [here](icolonyextension.md)._

  
## Interface Methods

### ▸ `approveUsers(address[] memory _users, bool _status)`

Sets user statuses in the whitelist


**Parameters**

|Name|Type|Description|
|---|---|---|
|_users|address[]|An array of user addresses
|_status|bool|The whitelist status to set


### ▸ `authority():DSAuthority authority`

Get the authority of the contract



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|authority|DSAuthority|The authority of the contract

### ▸ `deprecate(bool _deprecated)`

Called when deprecating (or undeprecating) the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_deprecated|bool|Indicates whether the extension should be deprecated or undeprecated


### ▸ `executeMetaTransaction(address _user, bytes memory _payload, bytes32 _sigR, bytes32 _sigS, uint8 _sigV):bytes returnData`

Main function to be called when user wants to execute meta transaction. The actual function to be called should be passed as param with name functionSignature Here the basic signature recovery is being used. Signature is expected to be generated using personal_sign method.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|Address of user trying to do meta transaction
|_payload|bytes|Function call to make via meta transaction
|_sigR|bytes32|R part of the signature
|_sigS|bytes32|S part of the signature
|_sigV|uint8|V part of the signature

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|returnData|bytes|Return data returned by the actual function called

### ▸ `finishUpgrade()`

A function to be called after an upgrade has been done from v2 to v3.

*Note: Can only be called by the colony itself, and only expected to be called as part of the `upgrade()` call. Required to be external so it can be an external call.*



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


### ▸ `install(address _colony)`

Configures the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_colony|address|The colony in which the extension holds permissions


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

### ▸ `owner():address owner`

Get the owner of the contract



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|owner|address|The owner of the contract

### ▸ `setOwner(address owner_)`

Set the owner of the contract


**Parameters**

|Name|Type|Description|
|---|---|---|
|owner_|address|The new owner of the contract


### ▸ `signAgreement(string memory _agreementHash)`

The user's signature on the agreement


**Parameters**

|Name|Type|Description|
|---|---|---|
|_agreementHash|string|The agreement hash being signed


### ▸ `uninstall()`

Called when uninstalling the extension




### ▸ `verify(address _user, uint256 _nonce, uint256 _chainId, bytes memory _payload, bytes32 _sigR, bytes32 _sigS, uint8 _sigV):bool bool`

Verifies the signature for the metatransaction


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|Address of user trying to do meta transaction
|_nonce|uint256|Nonce of the user
|_chainId|uint256|Chain id where the signature is valid for
|_payload|bytes|Function call to make via meta transaction
|_sigR|bytes32|R part of the signature
|_sigS|bytes32|S part of the signature
|_sigV|uint8|V part of the signature

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|bool|bool|indicating if the signature is valid or not

### ▸ `version():uint256 colonyVersion`

Get the Colony contract version. Starts from 1 and is incremented with every deployed contract change.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyVersion|uint256|Version number