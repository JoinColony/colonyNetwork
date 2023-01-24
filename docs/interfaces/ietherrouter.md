# Ether Router (IEtherRouter)

## Interface Methods

### ▸ `setAuthority(address authority_)`

Sets the EtherRouter authority. Inherited from DSAuth.

**Parameters**

| Name        | Type    | Description                             |
| ----------- | ------- | --------------------------------------- |
| authority\_ | address | Address of the new DSAuthority instance |

### ▸ `setOwner(address owner_)`

Sets the EtherRouter owner. Inherited from DSAuth.

**Parameters**

| Name    | Type    | Description              |
| ------- | ------- | ------------------------ |
| owner\_ | address | Address of the new owner |

### ▸ `setResolver(address _resolver)`

Sets the resolver address. This is used in the routing of all delegatecalls by the EtherRouter.

**Parameters**

| Name       | Type    | Description                 |
| ---------- | ------- | --------------------------- |
| \_resolver | address | Address of the new Resolver |
