# Streaming Payments / Salaries (`StreamingPayments`)

This expenditure enables ongoing "streaming" payments, useful for implementing
salaries. Users with the Administration and Funding permissions can create
streaming payments, indicating the tokens and amounts to be transferred
over a given interval of time. Users can then claim tokens continually, at
whatever frequency they choose.

_This is a Colony Extension which conforms to the extension interface found [here](icolonyextension.md)._

  
## Interface Methods

### ▸ `authority():address colonyAuthority`

Get the `ColonyAuthority` for the colony.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyAuthority|address|The `ColonyAuthority` contract address

### ▸ `cancel(uint256 _adminPermissionDomainId, uint256 _adminChildSkillIndex, uint256 _id)`

Cancel the streaming payment, specifically by setting endTime to block.timestamp


**Parameters**

|Name|Type|Description|
|---|---|---|
|_adminPermissionDomainId|uint256|The domain in which the caller holds the admin permission
|_adminChildSkillIndex|uint256|The index linking the adminPermissionDomainId to the domainId
|_id|uint256|The id of the streaming payment


### ▸ `cancelAndWaive(uint256 _id)`

Cancel the streaming payment, specifically by setting endTime to block.timestamp, and waive claim to tokens already earned. Only callable by the recipient.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|The id of the streaming payment


### ▸ `claim(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _fromChildSkillIndex, uint256 _toChildSkillIndex, uint256 _id)`

Claim a streaming payment


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domain in which the extension holds the funding & admin permissions
|_childSkillIndex|uint256|The index linking the permissionDomainId to the domainId the payment is in
|_fromChildSkillIndex|uint256|The linking the domainId to the fromPot domain
|_toChildSkillIndex|uint256|The linking the domainId to the toPot domain
|_id|uint256|The id of the streaming payment


### ▸ `create(uint256 _fundingPermissionDomainId, uint256 _fundingChildSkillIndex, uint256 _adminPermissionDomainId, uint256 _adminChildSkillIndex, uint256 _domainId, uint256 _startTime, uint256 _endTime, uint256 _interval, address _recipient, address _token, uint256 _amount)`

Creates a new streaming payment


**Parameters**

|Name|Type|Description|
|---|---|---|
|_fundingPermissionDomainId|uint256|The domain in which the caller holds the funding permission
|_fundingChildSkillIndex|uint256|The index linking the fundingPermissionDomainId to the domainId
|_adminPermissionDomainId|uint256|The domain in which the caller holds the admin permission
|_adminChildSkillIndex|uint256|The index linking the adminPermissionDomainId to the domainId
|_domainId|uint256|The domain out of which the streaming payment will be paid
|_startTime|uint256|The time at which the payment begins paying out
|_endTime|uint256|The time at which the payment ends paying out
|_interval|uint256|The period of time over which _amounts are paid out
|_recipient|address|The recipient of the streaming payment
|_token|address|The token to be paid out
|_amount|uint256|The amount to be paid out (per _interval of time)


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



### ▸ `getAmountClaimableLifetime(uint256 _id):uint256 amount`

Get the amount claimable in the lifetime of the stream


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|The id of the streaming payment

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|amount|uint256|The amount claimable

### ▸ `getAmountEntitledFromStart(uint256 _id):uint256 amount`

Get the amount entitled to claim from the start of the stream


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|The id of the streaming payment

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|amount|uint256|The amount entitled

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

### ▸ `getNUnresolvedStreamingPayments():uint256 nUnresolvedPayments`

Get the number of unresolved streaming payments



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nUnresolvedPayments|uint256|The number of unresolved streaming payments

### ▸ `getNumStreamingPayments():uint256 numPayments`

Get the total number of streaming payments



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|numPayments|uint256|The total number of streaming payments

### ▸ `getStreamingPayment(uint256 _id):StreamingPayment streamingPayment`

Get the streaming payment struct by Id


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|The id of the streaming payment

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|streamingPayment|StreamingPayment|The streaming payment struct

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

### ▸ `owner():address colonyOwner`

Get the colony `owner` address. This should be address(0x0) at all times.

*Note: Used for testing.*


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyOwner|address|Address of the colony owner

### ▸ `setEndTime(uint256 _adminPermissionDomainId, uint256 _adminChildSkillIndex, uint256 _id, uint256 _endTime)`

Update the endTime, only if the new endTime is in the future


**Parameters**

|Name|Type|Description|
|---|---|---|
|_adminPermissionDomainId|uint256|The domain in which the caller holds the admin permission
|_adminChildSkillIndex|uint256|The index linking the adminPermissionDomainId to the domainId
|_id|uint256|The id of the streaming payment
|_endTime|uint256|The new endTime to set


### ▸ `setOwner(address owner_)`

Set the owner of the contract


**Parameters**

|Name|Type|Description|
|---|---|---|
|owner_|address|The new owner of the contract


### ▸ `setStartTime(uint256 _adminPermissionDomainId, uint256 _adminChildSkillIndex, uint256 _id, uint256 _startTime)`

Update the startTime, only if the current startTime is in the future


**Parameters**

|Name|Type|Description|
|---|---|---|
|_adminPermissionDomainId|uint256|The domain in which the caller holds the admin permission
|_adminChildSkillIndex|uint256|The index linking the adminPermissionDomainId to the domainId
|_id|uint256|The id of the streaming payment
|_startTime|uint256|The new startTime to set


### ▸ `setTokenAmount(uint256 _fundingPermissionDomainId, uint256 _fundingChildSkillIndex, uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _fromChildSkillIndex, uint256 _toChildSkillIndex, uint256 _id, uint256 _amount, uint256 _interval)`

Update the token amount to be paid out. Claims existing payout prior to the change


**Parameters**

|Name|Type|Description|
|---|---|---|
|_fundingPermissionDomainId|uint256|The domain in which the caller holds the funding permission
|_fundingChildSkillIndex|uint256|The index linking the fundingPermissionDomainId to the domainId
|_permissionDomainId|uint256|The domain in which the extension holds the funding & admin permissions
|_childSkillIndex|uint256|The index linking the permissionDomainId to the domainId
|_fromChildSkillIndex|uint256|The linking the domainId to the fromPot domain
|_toChildSkillIndex|uint256|The linking the domainId to the toPot domain
|_id|uint256|The id of the streaming payment
|_amount|uint256|The new amount to pay out
|_interval|uint256|The new interval over which _amount is paid out


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