---
title: ITokenLocking
section: Interface
order: 5
---

  
## Interface Methods

### `deposit`

Deposit `_amount` of colony tokens. Can only be called if user tokens are not locked. Before calling this function user has to allow that their tokens can be transferred by token locking contract.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token to deposit
|_amount|uint256|Amount to deposit


### `getColonyNetwork`

Get ColonyNetwork address.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|networkAddress|address|ColonyNetwork address

### `getTotalLockCount`

Get global lock count for a specific token.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|lockCount|uint256|Global token lock count

### `getUserLock`

Get user token lock info (lock count and deposited amount).


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token
|_user|address|Address of the user

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|lock|Lock|Lock object containing:   `lockCount` User's token lock count,   `amount` User's deposited amount,   `timestamp` Timestamp of deposit.

### `incrementLockCounterTo`

Increments sender's lock count to `_lockId`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token we want to increment lock count for
|_lockId|uint256|Id of the lock user wants to increment to


### `lockToken`

Locks everyones' tokens on `_token` address.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token we want to lock

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|lockCount|uint256|Updated total token lock count

### `punishStakers`

Function called to punish people who staked against a new reputation root hash that turned out to be incorrect.

*Note: While public, it can only be called successfully by the current ReputationMiningCycle.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_stakers|address[]|Array of the addresses of stakers to punish
|_beneficiary|address|Address of beneficiary to receive forfeited stake
|_amount|uint256|Amount of stake to slash


### `setColonyNetwork`

Set the ColonyNetwork contract address.

*Note: ColonyNetwork is used for checking if sender is a colony created on colony network.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_colonyNetwork|address|Address of the ColonyNetwork


### `unlockTokenForUser`

Increments the lock counter to `_lockId` for the `_user` if user's lock count is less than `_lockId` by 1. Can only be called by a colony.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token we want to unlock
|_user|address|Address of the user
|_lockId|uint256|Id of the lock we want to increment to


### `withdraw`

Withdraw `_amount` of deposited tokens. Can only be called if user tokens are not locked.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token to withdraw from
|_amount|uint256|Amount to withdraw