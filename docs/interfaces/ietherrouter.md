# Ether Router (`IEtherRouter`)

Ether Router is an internal contract used to implement upgradability. A
proxy contract, this contract provides consistent storage while allowing for
function calls to be dispatched to other contracts. This allows for a colony's
state to remain constant while upgrading the function logic available to users.

  
## Interface Methods

### ▸ `setAuthority(address authority_)`

Sets the EtherRouter authority. Inherited from DSAuth.


**Parameters**

|Name|Type|Description|
|---|---|---|
|authority_|address|Address of the new DSAuthority instance


### ▸ `setOwner(address owner_)`

Sets the EtherRouter owner. Inherited from DSAuth.


**Parameters**

|Name|Type|Description|
|---|---|---|
|owner_|address|Address of the new owner


### ▸ `setResolver(address _resolver)`

Sets the resolver address. This is used in the routing of all delegatecalls by the EtherRouter.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_resolver|address|Address of the new Resolver