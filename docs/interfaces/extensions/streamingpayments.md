# Streaming Payments / Salaries (`StreamingPayments`)

  
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
|_id|uint256|
|_tokens|address[]|


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
|_deprecated|bool|


### ▸ `finishUpgrade()`

Called when upgrading the extension




### ▸ `getAmountEntitledFromStart(uint256 _id, address _token):uint256 uint256`




**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|
|_token|address|

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|uint256|uint256|

### ▸ `getNumStreamingPayments():uint256 uint256`





**Return Parameters**

|Name|Type|Description|
|---|---|---|
|uint256|uint256|

### ▸ `getPaymentToken(uint256 _id, address _token):PaymentToken paymentToken`




**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|
|_token|address|

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|paymentToken|PaymentToken|

### ▸ `getStreamingPayment(uint256 _id):StreamingPayment streamingPayment`




**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|streamingPayment|StreamingPayment|

### ▸ `identifier():bytes32 bytes32`

Returns the identifier of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|bytes32|bytes32|

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




**Parameters**

|Name|Type|Description|
|---|---|---|
|_fundingPermissionDomainId|uint256|
|_fundingChildSkillIndex|uint256|
|_permissionDomainId|uint256|
|_childSkillIndex|uint256|
|_fromChildSkillIndex|uint256|
|_toChildSkillIndex|uint256|
|_id|uint256|
|_token|address|
|_amount|uint256|


### ▸ `uninstall()`

Called when uninstalling the extension




### ▸ `version():uint256 uint256`

Returns the version of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|uint256|uint256|