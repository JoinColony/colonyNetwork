---
title: ITokenLocking
section: Interface
order: 5
---

  
## Interface Methods

### ▸ **`approveStake(address _user, uint256 _amount, address _token)`**

Allow the colony to obligate some amount of tokens as a stake.

*Note: Can only be called by a colony or colonyNetwork*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|Address of the user that is allowing their holdings to be staked by the caller
|_amount|uint256|Amount of that colony's internal token up to which we are willing to be obligated.
|_token|address|The colony's internal token address


### ▸ **`deobligateStake(address _user, uint256 _amount, address _token)`**

Deobligate the user some amount of tokens, releasing the stake. Can only be called by a colony or colonyNetwork.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|Address of the account we are deobligating.
|_amount|uint256|Amount of colony's internal token we are deobligating.
|_token|address|The colony's internal token address


### ▸ **`deposit(address _token, uint256 _amount)`**

Deposit `_amount` of deposited tokens. Can only be called if user tokens are not locked. Before calling this function user has to allow that their tokens can be transferred by token locking contract.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token to deposit
|_amount|uint256|Amount to deposit


### ▸ **`deposit(address _token, uint256 _amount, bool _force)`**

Deposit `_amount` of colony tokens. Before calling this function user has to allow that their tokens can be transferred by token locking contract.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token to deposit
|_amount|uint256|Amount to deposit
|_force|bool|Pass true to forcibly unlock the token


### ▸ **`depositFor(address _token, uint256 _amount, address _recipient)`**

Deposit `_amount` of colony tokens in the recipient's account. Goes into pendingBalance if token is locked.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token to deposit
|_amount|uint256|Amount to deposit
|_recipient|address|User to receive the tokens


### ▸ **`getApproval(address _user, address _token, address _obligator):uint256 approval`**

See how much an address has approved another address to obligate on their behalf.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|Address of the account that has approved _approvee to obligate their funds.
|_token|address|The token for which the user has provided the approval.
|_obligator|address|The address that has been approved to obligate the funds.

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|approval|uint256|The total amount for this obligation

### ▸ **`getColonyNetwork():address networkAddress`**

Get ColonyNetwork address.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|networkAddress|address|ColonyNetwork address

### ▸ **`getObligation(address _user, address _token, address _obligator):uint256 approval`**

See how much a user is currently obligated by another.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|Address of the account that has had their funds obligated.
|_token|address|The token for which the user has provided the approval.
|_obligator|address|The address that obligated the funds (and therefore can slash or return them).

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|approval|uint256|The total amount for this obligation

### ▸ **`getTotalLockCount(address _token):uint256 lockCount`**

Get global lock count for a specific token.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|lockCount|uint256|Global token lock count

### ▸ **`getTotalObligation(address _user, address _token):uint256 obligation`**

See the total amount of a user's obligation.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|Address of the obligated account.
|_token|address|The token for which the user is obligated.

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|obligation|uint256|The total amount this user is obligated

### ▸ **`getUserLock(address _token, address _user):Lock lock`**

Get user token lock info (lock count and deposited amount).


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token
|_user|address|Address of the user

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|lock|Lock|Lock object containing:   `lockCount` User's token lock count,   `balance` User's deposited amount,   `DEPRECATED_timestamp` Timestamp of deposit (deprecated)   `pendingBalance` Tokens that have been sent to them, but are inaccessible until all locks are cleared and then these                    tokens are claimed

### ▸ **`incrementLockCounterTo(address _token, uint256 _lockId)`**

Increments sender's lock count to `_lockId`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token we want to increment lock count for
|_lockId|uint256|Id of the lock user wants to increment to


### ▸ **`lockToken(address _token):uint256 lockCount`**

Locks everyones' tokens on `_token` address.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token we want to lock

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|lockCount|uint256|Updated total token lock count

### ▸ **`obligateStake(address _user, uint256 _amount, address _token)`**

Obligate the user some amount of tokens as a stake. Can only be called by a colony or colonyNetwork.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|Address of the account we are obligating.
|_amount|uint256|Amount of the colony's internal token we are obligating.
|_token|address|The colony's internal token address


### ▸ **`reward(address _recipient, uint256 _amount)`**

This function is deprecated and only exists to aid upgrades.

*Note: It's a NOOP. You don't need to call this, and if you write a contract that does it will break in the future.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_recipient|address|The address to receive the reward
|_amount|uint256|The amount to reward


### ▸ **`setColonyNetwork(address _colonyNetwork)`**

Set the ColonyNetwork contract address.

*Note: ColonyNetwork is used for checking if sender is a colony created on colony network.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_colonyNetwork|address|Address of the ColonyNetwork


### ▸ **`transfer(address _token, uint256 _amount, address _recipient, bool _force)`**

Transfer tokens to a recipient's pending balance. Can only be called if user tokens are not locked.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token to transfer
|_amount|uint256|Amount to transfer
|_recipient|address|User to receive the tokens
|_force|bool|Pass true to forcibly unlock the token


### ▸ **`transferStake(address _user, uint256 _amount, address _token, address _recipient)`**

Transfer some amount of staked tokens. Can only be called by a colony or colonyNetwork.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|Address of the account we are taking.
|_amount|uint256|Amount of colony's internal token we are taking.
|_token|address|The colony's internal token address
|_recipient|address|Recipient of the slashed tokens


### ▸ **`unlockTokenForUser(address _token, address _user, uint256 _lockId)`**

Increments the lock counter to `_lockId` for the `_user` if user's lock count is less than `_lockId` by 1. Can only be called by a colony.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token we want to unlock
|_user|address|Address of the user
|_lockId|uint256|Id of the lock we want to increment to


### ▸ **`withdraw(address _token, uint256 _amount)`**

Withdraw `_amount` of deposited tokens. Can only be called if user tokens are not locked.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token to withdraw from
|_amount|uint256|Amount to withdraw


### ▸ **`withdraw(address _token, uint256 _amount, bool _force)`**

Withdraw `_amount` of deposited tokens. Can only be called if user tokens are not locked.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token to withdraw from
|_amount|uint256|Amount to withdraw
|_force|bool|Pass true to forcibly unlock the token