# Streaming Payments / Salaries (`StreamingPayments`)

This expenditure enables ongoing "streaming" payments, useful for implementing
salaries. Users with the Administration and Funding permissions can create
streaming payments, indicating the tokens and amounts to be transferred
over a given interval of time. Users can then claim tokens continually, at
whatever frequency they choose.

  
## Interface Methods

### ▸ `addToken(uint256 _fundingPermissionDomainId, uint256 _fundingChildSkillIndex, uint256 _id, address _token, uint256 _amount)`

Add a new token/amount pair


**Parameters**

|Name|Type|Description|
|---|---|---|
|_fundingPermissionDomainId|uint256|The domain in which the caller holds the funding permission
|_fundingChildSkillIndex|uint256|The index linking the fundingPermissionDomainId to the domainId
|_id|uint256|The id of the streaming payment
|_token|address|The address of the token
|_amount|uint256|The amount to pay out


### ▸ `cancel(uint256 _adminPermissionDomainId, uint256 _adminChildSkillIndex, uint256 _id)`

Cancel the streaming payment, specifically by setting endTime to block.timestamp


**Parameters**

|Name|Type|Description|
|---|---|---|
|_adminPermissionDomainId|uint256|The domain in which the caller holds the admin permission
|_adminChildSkillIndex|uint256|The index linking the adminPermissionDomainId to the domainId
|_id|uint256|The id of the streaming payment


### ▸ `cancelAndWaive(uint256 _id, address[] memory _tokens)`

Cancel the streaming payment, specifically by setting endTime to block.timestamp, and waive claim to specified tokens already earned. Only callable by the recipient.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|The id of the streaming payment
|_tokens|address[]|The tokens to waive any claims to.


### ▸ `claim(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _fromChildSkillIndex, uint256 _toChildSkillIndex, uint256 _id, address[] memory _tokens)`

Claim a streaming payment


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domain in which the extension holds the funding & admin permissions
|_childSkillIndex|uint256|The index linking the permissionDomainId to the domainId the payment is in
|_fromChildSkillIndex|uint256|The linking the domainId to the fromPot domain
|_toChildSkillIndex|uint256|The linking the domainId to the toPot domain
|_id|uint256|The id of the streaming payment
|_tokens|address[]|The tokens to be paid out


### ▸ `create(uint256 _fundingPermissionDomainId, uint256 _fundingChildSkillIndex, uint256 _adminPermissionDomainId, uint256 _adminChildSkillIndex, uint256 _domainId, uint256 _startTime, uint256 _endTime, uint256 _interval, address _recipient, address[] memory _tokens, uint256[] memory _amounts)`

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
|_tokens|address[]|The tokens to be paid out
|_amounts|uint256[]|The amounts to be paid out (per _interval of time)


### ▸ `deprecate(bool _deprecated)`

Called when deprecating (or undeprecating) the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_deprecated|bool|Indicates whether the extension should be deprecated or undeprecated


### ▸ `finishUpgrade()`

Called when upgrading the extension




### ▸ `getAmountEntitledFromStart(uint256 _id, address _token):uint256 amount`

Get the amount entitled to claim from the start of the stream


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|The id of the streaming payment
|_token|address|The address of the token

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|amount|uint256|The amount entitled

### ▸ `getNumStreamingPayments():uint256 numPayments`

Get the total number of streaming payments



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|numPayments|uint256|The total number of streaming payments

### ▸ `getPaymentToken(uint256 _id, address _token):PaymentToken paymentToken`

Get the payment token struct by Id and token


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|The id of the streaming payment
|_token|address|The address of the token

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|paymentToken|PaymentToken|The payment token struct

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


### ▸ `setEndTime(uint256 _adminPermissionDomainId, uint256 _adminChildSkillIndex, uint256 _id, uint256 _endTime)`

Update the endTime, only if the new endTime is in the future


**Parameters**

|Name|Type|Description|
|---|---|---|
|_adminPermissionDomainId|uint256|The domain in which the caller holds the admin permission
|_adminChildSkillIndex|uint256|The index linking the adminPermissionDomainId to the domainId
|_id|uint256|The id of the streaming payment
|_endTime|uint256|The new endTime to set


### ▸ `setStartTime(uint256 _adminPermissionDomainId, uint256 _adminChildSkillIndex, uint256 _id, uint256 _startTime)`

Update the startTime, only if the current startTime is in the future


**Parameters**

|Name|Type|Description|
|---|---|---|
|_adminPermissionDomainId|uint256|The domain in which the caller holds the admin permission
|_adminChildSkillIndex|uint256|The index linking the adminPermissionDomainId to the domainId
|_id|uint256|The id of the streaming payment
|_startTime|uint256|The new startTime to set


### ▸ `setTokenAmount(uint256 _fundingPermissionDomainId, uint256 _fundingChildSkillIndex, uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _fromChildSkillIndex, uint256 _toChildSkillIndex, uint256 _id, address _token, uint256 _amount)`

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
|_token|address|The address of the token
|_amount|uint256|The new amount to pay out


### ▸ `uninstall()`

Called when uninstalling the extension




### ▸ `version():uint256 _version`

Returns the version of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_version|uint256|The extension's version number