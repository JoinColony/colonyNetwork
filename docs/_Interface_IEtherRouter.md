---
title: IEtherRouter
section: Interface
order: 1
---

  
## Interface Methods

### `setAuthority`

Sets the EtherRouter authority. Inherited from DSAuth.


**Parameters**

|Name|Type|Description|
|---|---|---|
|authority_|address|Address of the new DSAuthority instance


### `setOwner`

Sets the EtherRouter owner. Inherited from DSAuth.


**Parameters**

|Name|Type|Description|
|---|---|---|
|owner_|address|Address of the new owner


### `setResolver`

Sets the resolver address. This is used in the routing of all delegatecalls by the EtherRouter.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_resolver|address|Address of the new Resolver