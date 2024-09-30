# One Transaction Payment Extension (`OneTxPayment`)

Ordinarily payments require more than one transaction, because the payment lifecycle requires more than one permissioned [role](../../tldr/permissions.md).

In some use cases, there might be a need for one authorized individual to be able to create, funds, and finalize a payment within a single transaction.

The `OneTxPayment` extension adds this functionality by adding a `makePayment` function which requires the caller to have *both* `Funding` and administration ability within the domain of the payment.

Extension therefore requires `Administration` and `Funding` roles to function.

_Note: if you deployed your Colony using the Dapp, the `OneTxPayment` extension is already installed for you_

_This is a Colony Extension which conforms to the extension interface found [here](icolonyextension.md)._

  
## Interface Methods

### ▸ `finishUpgrade()`

Called when upgrading the extension




### ▸ `getCapabilityRoles(bytes4 _sig):bytes32 _roles`

Return the permissions required for each function


**Parameters**

|Name|Type|Description|
|---|---|---|
|_sig|bytes4|The function signature

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_roles|bytes32|The byte32 of permissions required

### ▸ `getMetatransactionNonce(address _user):uint256 _nonce`

Gets the next nonce for a meta-transaction


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The user's address

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_nonce|uint256|The nonce

### ▸ `identifier():bytes32 _identifier`

Returns the identifier of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_identifier|bytes32|The extension's identifier

### ▸ `makePayment(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _callerPermissionDomainId, uint256 _callerChildSkillIndex, address[] memory _workers, address[] memory _tokens, uint256[] memory _amounts, uint256 _domainId, uint256 _skillId)`

Completes a colony payment in a single transaction

*Note: Assumes that each entity holds administration and funding roles in the root domain*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which the _contract_ has permissions to add a payment and fund it
|_childSkillIndex|uint256|Index of the _permissionDomainId skill.children array to get
|_callerPermissionDomainId|uint256|The domainId in which the _caller_ has the administration permission (must have funding in root)
|_callerChildSkillIndex|uint256|Index of the _callerPermissionDomainId skill.children array to get
|_workers|address[]|The addresses of the recipients of the payment
|_tokens|address[]|Addresses of the tokens the payments are being made in. 0x00 for Ether.
|_amounts|uint256[]|amounts of the tokens being paid out
|_domainId|uint256|The domainId the payment should be coming from
|_skillId|uint256|The skillId that the payment should be marked with, possibly awarding reputation in this skill.


### ▸ `makePaymentFundedFromDomain(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _callerPermissionDomainId, uint256 _callerChildSkillIndex, address[] memory _workers, address[] memory _tokens, uint256[] memory _amounts, uint256 _domainId, uint256 _skillId)`

Completes a colony payment in a single transaction

*Note: Assumes that each entity holds administration and funding roles in the same domain,   although contract and caller can have the permissions in different domains. Payment is taken from domain funds - if the domain does not have sufficient funds, call will fail.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which the _contract_ has permissions to add a payment and fund it
|_childSkillIndex|uint256|Index of the _permissionDomainId skill.children array to get
|_callerPermissionDomainId|uint256|The domainId in which the _caller_ has permissions to add a payment and fund it
|_callerChildSkillIndex|uint256|Index of the _callerPermissionDomainId skill.children array to get
|_workers|address[]|The addresses of the recipients of the payment
|_tokens|address[]|The addresses of the token the payments are being made in. 0x00 for Ether.
|_amounts|uint256[]|The amounts of the tokens being paid out
|_domainId|uint256|The domainId the payment should be coming from
|_skillId|uint256|The skillId that the payment should be marked with, possibly awarding reputation in this skill.


### ▸ `version():uint256 _version`

Returns the version of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_version|uint256|The extension's version number