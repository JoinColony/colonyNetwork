---
title: IMetaColony
section: Interface
order: 4
---

  
## Interface Methods

### `addExtension`

Add a new extension/version to the ExtensionManager.

*Note: Calls `IExtensionManager.addExtension`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_manager|address|Address of the ExtensionManager contract
|_extensionId|bytes32|keccak256 hash of the extension name, used as an indentifier
|_resolver|address|The deployed resolver containing the extension contract logic
|_roles|uint8[]|An array containing the roles required by the extension


### `addGlobalSkill`

Add a new global skill.

*Note: Calls `IColonyNetwork.addSkill`.*


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|skillId|uint256|Id of the added skill

### `addNetworkColonyVersion`

Adds a new Colony contract version and the address of associated `_resolver` contract. Secured function to authorised members.

*Note: Calls `IColonyNetwork.addColonyVersion`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_version|uint256|The new Colony contract version
|_resolver|address|Address of the `Resolver` contract which will be used with the underlying `EtherRouter` contract


### `deprecateGlobalSkill`

Mark a global skill as deprecated which stops new tasks and payments from using it.

*Note: Calls `IColonyNetwork.deprecateSkill`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_skillId|uint256|Id of the added skill


### `mintTokensForColonyNetwork`

Mints CLNY in the Meta Colony and transfers them to the colony network. Only allowed to be called on the Meta Colony by the colony network.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_wad|uint256|Amount to mint and transfer to the colony network


### `setAnnualMetaColonyStipend`

Called to set the metaColony stipend. This value will be the total amount of CLNY created for the metacolony in a single year.

*Note: Calls the corresponding function on the ColonyNetwork.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_amount|uint256|The amount of CLNY to issue to the metacolony every year


### `setNetworkFeeInverse`

Set the Colony Network fee inverse amount.

*Note: Calls `IColonyNetwork.setFeeInverse`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_feeInverse|uint256|Nonzero amount for the fee inverse


### `setReputationMiningCycleReward`

Called to set the total per-cycle reputation reward, which will be split between all miners.

*Note: Calls the corresponding function on the ColonyNetwork.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_amount|uint256|