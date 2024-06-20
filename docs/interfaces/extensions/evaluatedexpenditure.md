# Evaluated Expenditure (`EvaluatedExpenditure`)

Evaluated Expenditures is a simple extension which allows the owner of an expenditure
to update the payout modifiers after the expenditure is locked, effectively enabling
the "evaluation" functionality we initially described as a part of the Tasks flow.
Without this extension, payout modifiers can only be set by the Arbitration permission
once the expenditure is locked, making it tedious to implement evaluation workflows.

_This is a Colony Extension which conforms to the extension interface found [here](icolonyextension.md)._

  
## Interface Methods

### ▸ `getMetatransactionNonce(address _user):uint256 nonce`

Gets the next nonce for a meta-transaction


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The user's address

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nonce|uint256|The nonce

### ▸ `identifier():bytes32 _identifier`

Returns the identifier of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_identifier|bytes32|The extension's identifier

### ▸ `setExpenditurePayoutModifiers(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id, uint256[] memory _slots, int256[] memory _payoutModifiers)`

Sets the payout modifiers in given expenditure slots, using the arbitration permission


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which the extension has the arbitration permission
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_id|uint256|Expenditure identifier
|_slots|uint256[]|Array of slots to set payout modifiers
|_payoutModifiers|int256[]|Values (between +/- WAD) to modify the payout & reputation bonus


### ▸ `version():uint256 _version`

Returns the version of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_version|uint256|The extension's version number