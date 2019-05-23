---
title: IMetaColony
section: Interface
order: 4
---

  

## Interface Methods



### `addGlobalSkill`

Add a new global skill





**Return Parameters**


|Name|Type|Description|
|---|---|---|
|skillId|uint256| Id of the added skill



### `addNetworkColonyVersion`

Adds a new Colony contract version and the address of associated `_resolver` contract. Secured function to authorised members



**Parameters**


|Name|Type|Description|
|---|---|---|
|_version|uint256| The new Colony contract version
|_resolver|address| Address of the `Resolver` contract which will be used with the underlying `EtherRouter` contract





### `deprecateGlobalSkill`

Mark a global skill as deprecated which stops new tasks and payments from using it



**Parameters**


|Name|Type|Description|
|---|---|---|
|_skillId|uint256| Id of the added skill





### `mintTokensForColonyNetwork`

Mints CLNY in the Meta Colony and transfers them to the colony network



**Parameters**


|Name|Type|Description|
|---|---|---|
|_wad|uint256| Amount to mint and transfer to the colony network





### `setNetworkFeeInverse`

Set the Colony Network fee inverse amount



**Parameters**


|Name|Type|Description|
|---|---|---|
|_feeInverse|uint256| Nonzero amount for the fee inverse