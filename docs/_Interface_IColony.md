---
title: IColony
section: Interface
order: 3
---

  
## Interface Methods

### `addDomain`

Add a colony domain, and its respective local skill under skill with id `_parentSkillId`. New funding pot is created and associated with the domain here.

*Note: Adding new domains is currently retricted to one level only, i.e. `_parentDomainId` has to be the root domain id: `1`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_parentDomainId|uint256|Id of the domain under which the new one will be added


### `addPayment`

Add a new payment in the colony. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`, (only used if `_permissionDomainId` is different to `_domainId`)
|_recipient|address|Address of the payment recipient
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Payout amount
|_domainId|uint256|The domain where the payment belongs
|_skillId|uint256|The skill associated with the payment

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|paymentId|uint256|Identifier of the newly created payment

### `approveStake`

Allow the _approvee to obligate some amount of tokens as a stake.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_approvee|address|Address of the account we are willing to let obligate us.
|_domainId|uint256|Domain in which we are willing to be obligated.
|_amount|uint256|Amount of internal token up to which we are willing to be obligated.


### `authority`

Get the `ColonyAuthority` for the colony.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyAuthority|address|The `ColonyAuthority` contract address

### `bootstrapColony`

Allows the colony to bootstrap itself by having initial reputation and token `_amount` assigned to `_users`. This reputation is assigned in the colony-wide domain. Secured function to authorised members.

*Note: Only allowed to be called when `taskCount` is `0` by authorized addresses.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_users|address[]|Array of address to bootstrap with reputation
|_amount|int[]|Amount of reputation/tokens for every address


### `cancelExpenditure`

Cancels the expenditure and prevents further editing. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier


### `cancelTask`

Cancel a task at any point before it is finalized. Secured function to authorised members. Any funds assigned to its funding pot can be moved back to the domain via `IColony.moveFundsBetweenPots`.

*Note: Set the `task.status` property to `1`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task


### `claimColonyFunds`

Move any funds received by the colony in `_token` denomination to the top-level domain pot, siphoning off a small amount to the reward pot. If called against a colony's own token, no fee is taken.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token, `0x0` value indicates Ether


### `claimExpenditurePayout`

Claim the payout for an expenditure slot. Here the network receives a fee from each payout.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier
|_slot|uint256|Number of the slot
|_token|address|Address of the token, `0x0` value indicates Ether


### `claimPayment`

Claim the payout in `_token` denomination for payment `_id`. Here the network receives its fee from each payout. Same as for tasks, ether fees go straight to the Meta Colony whereas Token fees go to the Network to be auctioned off.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Payment identifier
|_token|address|Address of the token, `0x0` value indicates Ether


### `claimRewardPayout`

Claim the reward payout at `_payoutId`. User needs to provide their reputation and colony-wide reputation which will be proven via Merkle proof inside this function. Can only be called if payout is active, i.e if 60 days have not passed from its creation. Can only be called if next in queue.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_payoutId|uint256|Id of the reward payout
|_squareRoots|uint256[7]|Square roots of values used in equation: `_squareRoots[0]` - square root of user reputation, `_squareRoots[1]` - square root of user tokens (deposited in TokenLocking), `_squareRoots[2]` - square root of total reputation, `_squareRoots[3]` - square root of total tokens, `_squareRoots[4]` - square root of numerator (user reputation * user tokens), `_squareRoots[5]` - square root of denominator (total reputation * total tokens), `_squareRoots[6]` - square root of payout amount.
|key|bytes|Some Reputation hash tree key
|value|bytes|Reputation value
|branchMask|uint256|The branchmask of the proof
|siblings|bytes32[]|The siblings of the proof


### `claimTaskPayout`

Claim the payout in `_token` denomination for work completed in task `_id` by contributor with role `_role`. Allowed only after task is finalized. Here the network receives its fee from each payout. Ether fees go straight to the Meta Colony whereas Token fees go to the Network to be auctioned off.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_role|uint8|Id of the role, as defined in TaskRole enum
|_token|address|Address of the token, `0x0` value indicates Ether


### `completeTask`

Mark a task as complete after the due date has passed. This allows the task to be rated and finalized (and funds recovered) even in the presence of a worker who has disappeared. Note that if the due date was not set, then this function will throw.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task


### `deobligateStake`

Deobligate the user some amount of tokens, releasing the stake.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|Address of the account we are deobligating.
|_domainId|uint256|Domain in which we are deobligating the user.
|_amount|uint256|Amount of internal token we are deobligating.


### `emitDomainReputationPenalty`

Emit a negative domain reputation update. Available only to Arbitration role holders


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I hold the Arbitration role
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_domainId|uint256|The domain where the user will lose reputation
|_user|address|The user who will lose reputation
|_amount|int256|The (negative) amount of reputation to lose


### `emitSkillReputationPenalty`

Emit a negative skill reputation update. Available only to Arbitration role holders in the root domain


**Parameters**

|Name|Type|Description|
|---|---|---|
|_skillId|uint256|The skill where the user will lose reputation
|_user|address|The user who will lose reputation
|_amount|int256|The (negative) amount of reputation to lose


### `executeTaskChange`

Executes a task update transaction `_data` which is approved and signed by two of its roles (e.g. manager and worker) using the detached signatures for these users.

*Note: The Colony functions which require approval and the task roles to review these are set in `IColony.initialiseColony` at colony creation. Upon successful execution the `taskChangeNonces` entry for the task is incremented.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_sigV|uint8[]|recovery id
|_sigR|bytes32[]|r output of the ECDSA signature of the transaction
|_sigS|bytes32[]|s output of the ECDSA signature of the transaction
|_mode|uint8[]|How the signature was generated - 0 for Geth-style (usual), 1 for Trezor-style (only Trezor does this)
|_value|uint256|The transaction value, i.e. number of wei to be sent when the transaction is executed Currently we only accept 0 value transactions but this is kept as a future option
|_data|bytes|The transaction data


### `executeTaskRoleAssignment`

Executes a task role update transaction `_data` which is approved and signed by two of addresses. depending of which function we are calling. Allowed functions are `setTaskManagerRole`, `setTaskEvaluatorRole` and `setTaskWorkerRole`. Upon successful execution the `taskChangeNonces` entry for the task is incremented.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_sigV|uint8[]|recovery id
|_sigR|bytes32[]|r output of the ECDSA signature of the transaction
|_sigS|bytes32[]|s output of the ECDSA signature of the transaction
|_mode|uint8[]|How the signature was generated - 0 for Geth-style (usual), 1 for Trezor-style (only Trezor does this)
|_value|uint256|The transaction value, i.e. number of wei to be sent when the transaction is executed Currently we only accept 0 value transactions but this is kept as a future option
|_data|bytes|The transaction data


### `finalizeExpenditure`

Finalizes the expenditure and prevents further editing. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier


### `finalizePayment`

Finalizes the payment and logs the reputation log updates. Allowed to be called once after payment is fully funded. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_id|uint256|Payment identifier


### `finalizeRewardPayout`

Finalises the reward payout. Allows creation of next reward payouts for token that has been used in `_payoutId`. Can only be called when reward payout cycle is finished i.e when 60 days have passed from its creation.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_payoutId|uint256|Id of the reward payout


### `finalizeTask`

Called after task work rating is complete which closes the task and logs the respective reputation log updates. Allowed to be called once per task. Secured function to authorised members.

*Note: Set the `task.finalized` property to true*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task


### `finishUpgrade`

A function to be called after an upgrade has been done from v2 to v3.

*Note: Can only be called by the colony itself, and only expected to be called as part of the `upgrade()` call. Required to be public so it can be an external call.*



### `generateSecret`

Helper function used to generage consistently the rating secret using salt value `_salt` and value to hide `_value`


**Parameters**

|Name|Type|Description|
|---|---|---|
|_salt|bytes32|Salt value
|_value|uint256|Value to hide

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|secret|bytes32|`keccak256` hash of joint _salt and _value

### `getApproval`

View an approval to obligate tokens.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|User allowing their tokens to be obligated.
|_obligator|address|Address of the account we are willing to let obligate us.
|_domainId|uint256|Domain in which we are willing to be obligated.

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|approval|uint256|

### `getColonyNetwork`

Returns the colony network address set on the Colony.

*Note: The colonyNetworkAddress we read here is set once, during `initialiseColony`.*


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyNetwork|address|The address of Colony Network instance

### `getDomain`

Get a domain by id.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the domain which details to get

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|domain|Domain|The domain

### `getDomainCount`

Get the number of domains in the colony.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The domain count. Min 1 as the root domain is created at the same time as the colony

### `getDomainFromFundingPot`

Get the domain corresponding to a funding pot


**Parameters**

|Name|Type|Description|
|---|---|---|
|_fundingPotId|uint256|Id of the funding pot

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|domainId|uint256|Id of the corresponding domain

### `getExpenditure`

Returns an existing expenditure.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|expenditure|Expenditure|The expenditure

### `getExpenditureCount`

Get the number of expenditures in the colony.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The expenditure count

### `getExpenditureSlot`

Returns an existing expenditure slot.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier
|_slot|uint256|Expenditure slot

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|expenditureSlot|ExpenditureSlot|The expenditure slot

### `getExpenditureSlotPayout`

Returns an existing expenditure slot's payout for a token.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier
|_slot|uint256|Expenditure slot
|_token|address|Token address

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|amount|uint256|Amount of the payout for that slot/token.

### `getFundingPot`

Get the non-mapping properties of a pot by id.

*Note: For the reward funding pot (e.g. id: 0) this returns (0, 0, 0).*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the pot which details to get

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|associatedType|FundingPotAssociatedType|The FundingPotAssociatedType value of the current funding pot, e.g. Domain, Task, Payout
|associatedTypeId|uint256|Id of the associated type, e.g. if associatedType = FundingPotAssociatedType.Domain, this refers to the domainId
|payoutsWeCannotMake|uint256|Number of payouts that cannot be completed with the current funding

### `getFundingPotBalance`

Get the `_token` balance of pot with id `_potId`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_potId|uint256|Id of the funding pot
|_token|address|Address of the token, `0x0` value indicates Ether

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|balance|uint256|Funding pot supply balance

### `getFundingPotCount`

Get the number of funding pots in the colony.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The funding pots count

### `getFundingPotPayout`

Get the assigned `_token` payouts of pot with id `_potId`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_potId|uint256|Id of the funding pot
|_token|address|Address of the token, `0x0` value indicates Ether

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|payout|uint256|Funding pot payout amount

### `getNonRewardPotsTotal`

Get the total amount of tokens `_token` minus amount reserved to be paid to the reputation and token holders as rewards.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token, `0x0` value indicates Ether

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|amount|uint256|Total amount of tokens in funding pots other than the rewards pot (id 0)

### `getObligation`

View an obligation of tokens.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|User whose tokens are obligated.
|_obligator|address|Address of the account who obligated us.
|_domainId|uint256|Domain in which we are obligated.

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|obligation|uint256|

### `getPayment`

Returns an exiting payment.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Payment identifier

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|payment|Payment|The Payment data structure

### `getPaymentCount`

Get the number of payments in the colony.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The payment count

### `getRewardInverse`

Return 1 / the reward to pay out from revenue. e.g. if the fee is 1% (or 0.01), return 100.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|rewardInverse|uint256|The inverse of the reward

### `getRewardPayoutInfo`

Get useful information about specific reward payout.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_payoutId|uint256|Id of the reward payout

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|rewardPayoutCycle|RewardPayoutCycle|RewardPayoutCycle, containing propertes:  `reputationState` Reputation root hash at the time of creation,  `colonyWideReputation` Colony wide reputation in `reputationState`,  `totalTokens` Total colony tokens at the time of creation,  `amount` Total amount of tokens taken aside for reward payout,  `tokenAddress` Token address,  `blockTimestamp` Block number at the time of creation.

### `getTask`

Get a task with id `_id`


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|specificationHash|bytes32|Task brief hash
|deliverableHash|bytes32|Task deliverable hash
|status|TaskStatus|TaskStatus property. 0 - Active. 1 - Cancelled. 2 - Finalized
|dueDate|uint256|Due date
|fundingPotId|uint256|Id of funding pot for task
|completionTimestamp|uint256|Task completion timestamp
|domainId|uint256|Task domain id, default is root colony domain with id 1
|skillIds|uint256[]|Array of global skill ids assigned to task

### `getTaskChangeNonce`

Starts from 0 and is incremented on every co-reviewed task change via `executeTaskChange` call.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nonce|uint256|The current task change nonce value

### `getTaskCount`

Get the number of tasks in the colony.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The task count

### `getTaskPayout`

Get payout amount in `_token` denomination for role `_role` in task `_id`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_role|uint8|Id of the role, as defined in TaskRole enum
|_token|address|Address of the token, `0x0` value indicates Ether

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|amount|uint256|Payout amount

### `getTaskRole`

Get the `Role` properties back for role `_role` in task `_id`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_role|uint8|Id of the role, as defined in TaskRole enum

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|role|Role|The Role

### `getTaskWorkRatingSecret`

Get the rating secret submitted for role `_role` in task `_id`


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_role|uint8|Id of the role, as defined in TaskRole enum

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|secret|bytes32|Rating secret `bytes32` value

### `getTaskWorkRatingSecretsInfo`

Get the `ColonyStorage.RatingSecrets` information for task `_id`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nSecrets|uint256|Number of secrets
|lastSubmittedAt|uint256|Timestamp of the last submitted rating secret

### `getToken`

Get the colony token.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|tokenAddress|address|Address of the token contract

### `getUserRoles`

Gets the bytes32 representation of the roles for a user in a given domain


**Parameters**

|Name|Type|Description|
|---|---|---|
|who|address|The user whose roles we want to get
|where|uint256|The domain where we want to get roles for

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|roles|bytes32|bytes32 representation of the roles

### `hasInheritedUserRole`

Check whether a given user has a given role for the colony, in a child domain. Calls the function of the same name on the colony's authority contract and an internal inheritence validator function


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The user whose role we want to check
|_domainId|uint256|Domain in which the caller has the role
|_role|ColonyRole|The role we want to check for
|_childSkillIndex|uint256|The index that the `_childDomainId` is relative to `_domainId`
|_childDomainId|uint256|The domain where we want to use the role

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|hasRole|bool|Boolean indicating whether the given user has the given role in domain

### `hasUserRole`

Check whether a given user has a given role for the colony. Calls the function of the same name on the colony's authority contract.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The user whose role we want to check
|_domainId|uint256|The domain where we want to check for the role
|_role|ColonyRole|The role we want to check for

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|hasRole|bool|Boolean indicating whether the given user has the given role in domain

### `initialiseColony`

Called once when the colony is created to initialise certain storage slot values.

*Note: Sets the reward inverse to the uint max 2**256 - 1.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_colonyNetworkAddress|address|Address of the colony network
|_token|address|Address of the colony ERC20 Token


### `makeExpenditure`

Add a new expenditure in the colony. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`, (only used if `_permissionDomainId` is different to `_domainId`)
|_domainId|uint256|The domain where the expenditure belongs

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|expenditureId|uint256|Identifier of the newly created expenditure

### `makeTask`

Make a new task in the colony. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_specificationHash|bytes32|Database identifier where the task specification is stored
|_domainId|uint256|The domain where the task belongs
|_skillId|uint256|The skill associated with the task, can set to `0` for no-op
|_dueDate|uint256|The due date of the task, can set to `0` for no-op


### `mintTokens`

Mint `_wad` amount of colony tokens. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_wad|uint256|Amount to mint


### `mintTokensFor`

Mint `_wad` amount of colony tokens and send to `_guy`. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_guy|address|Recipient of new tokens
|_wad|uint256|Amount to mint


### `moveFundsBetweenPots`

Move a given amount: `_amount` of `_token` funds from funding pot with id `_fromPot` to one with id `_toPot`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_fromChildSkillIndex|uint256|The child index in `_permissionDomainId` where we can find the domain for `_fromPotId`
|_toChildSkillIndex|uint256|The child index in `_permissionDomainId` where we can find the domain for `_toPotId`
|_fromPot|uint256|Funding pot id providing the funds
|_toPot|uint256|Funding pot id receiving the funds
|_amount|uint256|Amount of funds
|_token|address|Address of the token, `0x0` value indicates Ether


### `obligateStake`

Obligate the user some amount of tokens as a stake.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|Address of the account we are obligating.
|_domainId|uint256|Domain in which we are obligating the user.
|_amount|uint256|Amount of internal token we are obligating.


### `owner`

Get the colony `owner` address. This should be address(0x0) at all times.

*Note: Used for testing.*


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyOwner|address|Address of the colony owner

### `registerColonyLabel`

Register colony's ENS label.


**Parameters**

|Name|Type|Description|
|---|---|---|
|colonyName|string|The label to register.
|orbitdb|string|The path of the orbitDB database associated with the colony name


### `removeTaskEvaluatorRole`

Removing evaluator role. Agreed between manager and currently assigned evaluator.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task


### `removeTaskWorkerRole`

Removing worker role. Agreed between manager and currently assigned worker.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task


### `revealTaskWorkRating`

Reveal the secret rating submitted in `IColony.submitTaskWorkRating` for task `_id` and task role with id `_role`. Allowed within 5 days period starting which whichever is first from either both rating secrets being submitted (via `IColony.submitTaskWorkRating`) or the 5 day rating period expiring.

*Note: Compares the `keccak256(_salt, _rating)` output with the previously submitted rating secret and if they match, sets the task role properties `rated` to `true` and `rating` to `_rating`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_role|uint8|Id of the role, as defined in TaskRole enum
|_rating|uint8|0-50 rating score (in increments of 10, .e.g 0, 10, 20, 30, 40 or 50)
|_salt|bytes32|Salt value used to generate the rating secret


### `setAdministrationRole`

Set new colony admin role. Can be called by root role or architecture role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|Domain in which the caller has root/architecture role
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_user|address|User we want to give an admin role to
|_domainId|uint256|Domain in which we are giving user the role
|_setTo|bool|The state of the role permission (true assign the permission, false revokes it)


### `setAllTaskPayouts`

Set `_token` payout for all roles in task `_id` to the respective amounts.

*Note: Can only call if evaluator and worker are unassigned or manager, otherwise need signature.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_token|address|Address of the token, `0x0` value indicates Ether
|_managerAmount|uint256|Payout amount for manager
|_evaluatorAmount|uint256|Payout amount for evaluator
|_workerAmount|uint256|Payout amount for worker


### `setArbitrationRole`

Set new colony arbitration role. Can be called by root role or architecture role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|Domain in which the caller has root role
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_user|address|User we want to give an arbitration role to
|_domainId|uint256|Domain in which we are giving user the role
|_setTo|bool|The state of the role permission (true assign the permission, false revokes it)


### `setArchitectureRole`

Set new colony architecture role. Can be called by root role or architecture role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|Domain in which the caller has root/architecture role
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_user|address|User we want to give an architecture role to
|_domainId|uint256|Domain in which we are giving user the role
|_setTo|bool|The state of the role permission (true assign the permission, false revokes it)


### `setExpenditureClaimDelay`

Set the claim delay on an expenditure slot. Can only be called by Arbitration role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`, (only used if `_permissionDomainId` is different to `_domainId`)
|_id|uint256|Expenditure identifier
|_slot|uint256|Number of the slot
|_claimDelay|uint256|Time (in seconds) to delay claiming payout after finalization


### `setExpenditurePayout`

Set the token payout on an expenditure slot. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the expenditure
|_slot|uint256|Number of the slot
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Payout amount


### `setExpenditurePayoutModifier`

Set the payout modifier on an expenditure slot. Can only be called by Arbitration role.

*Note: Note that when determining payouts the payoutModifier is incremented by WAD and converted into payoutScalar*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`, (only used if `_permissionDomainId` is different to `_domainId`)
|_id|uint256|Expenditure identifier
|_slot|uint256|Number of the slot
|_payoutModifier|int256|Modifier to their payout (between -1 and 1, denominated in WADs, 0 means no modification)


### `setExpenditureRecipient`

Sets the recipient on an expenditure slot. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the expenditure
|_slot|uint256|Slot for the recipient address
|_recipient|address|Address of the recipient


### `setExpenditureSkill`

Sets the skill on an expenditure slot. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier
|_slot|uint256|Number of the slot
|_skillId|uint256|Id of the new skill to set


### `setFundingRole`

Set new colony funding role. Can be called by root role or architecture role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|Domain in which the caller has root/architecture role
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_user|address|User we want to give an funding role to
|_domainId|uint256|Domain in which we are giving user the role
|_setTo|bool|The state of the role permission (true assign the permission, false revokes it)


### `setPaymentPayout`

Sets the payout for a given token on an existing payment. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_id|uint256|Payment identifier
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Payout amount


### `setPaymentRecipient`

Sets the recipient on an existing payment. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_id|uint256|Payment identifier
|_recipient|address|Address of the payment recipient


### `setPaymentSkill`

Sets the skill on an existing payment. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_id|uint256|Payment identifier
|_skillId|uint256|Id of the new skill to set


### `setRewardInverse`

Set the reward inverse to pay out from revenue. e.g. if the fee is 1% (or 0.01), set 100.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_rewardInverse|uint256|The inverse of the reward


### `setRootRole`

Set new colony root role. Can be called by root role only.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|User we want to give an root role to
|_setTo|bool|The state of the role permission (true assign the permission, false revokes it)


### `setTaskBrief`

Set the hash for the task brief, aka task work specification, which identifies the task brief content in ddb. Allowed before a task is finalized.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_specificationHash|bytes32|Unique hash of the task brief in ddb


### `setTaskDueDate`

Set the due date on task `_id`. Allowed before a task is finalized.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_dueDate|uint256|Due date as seconds since unix epoch


### `setTaskEvaluatorPayout`

Set `_token` payout for evaluator in task `_id` to `_amount`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Payout amount


### `setTaskEvaluatorRole`

Assigning evaluator role. Can only be set if there is no one currently assigned to be an evaluator. Manager of the task and user we want to assign role to both need to agree. Managers can assign themselves to this role, if there is no one currently assigned to it.

*Note: This function can only be called through `executeTaskRoleAssignment`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_user|address|Address of the user we want to give a evaluator role to


### `setTaskManagerPayout`

Set `_token` payout for manager in task `_id` to `_amount`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Payout amount


### `setTaskManagerRole`

Assigning manager role. Current manager and user we want to assign role to both need to agree. User we want to set here also needs to be an admin. Note that the domain proof data comes at the end here to not interfere with the assembly argument unpacking.

*Note: This function can only be called through `executeTaskRoleAssignment`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_user|address|Address of the user we want to give a manager role to
|_permissionDomainId|uint256|The domain ID in which _user has the Administration permission
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`


### `setTaskSkill`

Set the skill for task `_id`.

*Note: Currently we only allow one skill per task although we have provisioned for an array of skills in `Task` struct. Allowed before a task is finalized.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_skillId|uint256|Id of the skill which has to be a global skill


### `setTaskWorkerPayout`

Set `_token` payout for worker in task `_id` to `_amount`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Payout amount


### `setTaskWorkerRole`

Assigning worker role. Can only be set if there is no one currently assigned to be a worker. Manager of the task and user we want to assign role to both need to agree.

*Note: This function can only be called through `executeTaskRoleAssignment`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_user|address|Address of the user we want to give a worker role to


### `startNextRewardPayout`

Add a new payment in the colony. Can only be called by users with root permission. All tokens will be locked, and can be unlocked by calling `waiveRewardPayout` or `claimRewardPayout`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token used for reward payout
|key|bytes|Some Reputation hash tree key
|value|bytes|Reputation value
|branchMask|uint256|The branchmask of the proof
|siblings|bytes32[]|The siblings of the proof


### `submitTaskDeliverable`

Submit the task deliverable, i.e. the output of the work performed for task `_id`. Submission is allowed only to the assigned worker before the task due date. Submissions cannot be overwritten.

*Note: Set the `task.deliverableHash` and `task.completionTimestamp` properties.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_deliverableHash|bytes32|Unique hash of the task deliverable content in ddb


### `submitTaskDeliverableAndRating`

Submit the task deliverable for Worker and rating for Manager.

*Note: Internally call `submitTaskDeliverable` and `submitTaskWorkRating` in sequence.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_deliverableHash|bytes32|Unique hash of the task deliverable content in ddb
|_ratingSecret|bytes32|Rating secret for manager


### `submitTaskWorkRating`

Submit a hashed secret of the rating for work in task `_id` which was performed by user with task role id `_role`. Allowed within 5 days period starting which whichever is first from either the deliverable being submitted or the dueDate been reached. Allowed only for evaluator to rate worker and for worker to rate manager performance. Once submitted ratings can not be changed or overwritten.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_role|uint8|Id of the role, as defined in TaskRole enum
|_ratingSecret|bytes32|`keccak256` hash of a salt and 0-50 rating score (in increments of 10, .e.g 0, 10, 20, 30, 40 or 50). Can be generated via `IColony.generateSecret` helper function.


### `transferExpenditure`

Updates the expenditure owner. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier
|_newOwner|address|New owner of expenditure


### `transferExpenditureViaArbitration`

Updates the expenditure owner. Can only be called by Arbitration role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`, (only used if `_permissionDomainId` is different to `_domainId`)
|_id|uint256|Expenditure identifier
|_newOwner|address|New owner of expenditure


### `transferStake`

Transfer some amount of obligated tokens. Can be called by the arbitration role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action.
|_childSkillIndex|uint256|The child index in `_permissionDomainId` where we can find `_domainId`.
|_obligator|address|Address of the account who set the obligation.
|_user|address|Address of the account we are transferring.
|_domainId|uint256|Domain in which we are transferring the tokens.
|_amount|uint256|Amount of internal token we are transferring.
|_recipient|address|Recipient of the transferred tokens.


### `updateColonyOrbitDB`

Update a colony's orbitdb address. Can only be called by a colony with a registered subdomain


**Parameters**

|Name|Type|Description|
|---|---|---|
|orbitdb|string|The path of the orbitDB database to be associated with the colony


### `upgrade`

Upgrades a colony to a new Colony contract version `_newVersion`.

*Note: Downgrades are not allowed, i.e. `_newVersion` should be higher than the currect colony version.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_newVersion|uint|The target version for the upgrade


### `verifyReputationProof`

Helper function that can be used by a client to verify the correctness of a patricia proof they have been supplied with.

*Note: For more detail about branchMask and siblings, examine the PatriciaTree implementation. While public, likely only to be used by the Colony contracts, as it checks that the user is proving their own reputation in the current colony. The `verifyProof` function can be used to verify any proof, though this function is not currently exposed on the Colony's EtherRouter.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|key|bytes|The key of the element the proof is for.
|value|bytes|The value of the element that the proof is for.
|branchMask|uint256|The branchmask of the proof
|siblings|bytes32[]|The siblings of the proof

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|isValid|bool|True if the proof is valid, false otherwise.

### `version`

Get the Colony contract version. Starts from 1 and is incremented with every deployed contract change.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyVersion|uint256|Version number