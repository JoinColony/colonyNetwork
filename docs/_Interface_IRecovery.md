---
title: IRecovery
section: Interface
order: 6
---

  

## Interface Methods



### `approveExitRecovery`

Indicate approval to exit recovery mode.







### `checkNotAdditionalProtectedVariable`

Check whether the supplied slot is a protected variable specific to this contract



**Parameters**


|Name|Type|Description|
|---|---|---|
|_slot|uint256| The storage slot number to check.





### `enterRecoveryMode`

Put colony network mining into recovery mode.







### `exitRecoveryMode`

Exit recovery mode, can be called by anyone if enough whitelist approvals are given.







### `isInRecoveryMode`

Is colony network in recovery mode





**Return Parameters**


|Name|Type|Description|
|---|---|---|
|inRecoveryMode|bool| Return true if recovery mode is active, false otherwise



### `numRecoveryRoles`

Return number of recovery roles.





**Return Parameters**


|Name|Type|Description|
|---|---|---|
|numRoles|uint64| Number of users with the recovery role.



### `removeRecoveryRole`

Remove colony recovery role.



**Parameters**


|Name|Type|Description|
|---|---|---|
|_user|address| User we want to remove recovery role from





### `setRecoveryRole`

Set new colony recovery role.



**Parameters**


|Name|Type|Description|
|---|---|---|
|_user|address| User we want to give a recovery role to





### `setStorageSlotRecovery`

Update value of arbitrary storage variable.



**Parameters**


|Name|Type|Description|
|---|---|---|
|_slot|uint256| Uint address of storage slot to be updated
|_value|bytes32| Bytes32 word of data to be set