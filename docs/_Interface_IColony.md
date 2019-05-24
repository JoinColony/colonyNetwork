---
title: IColony
section: Interface
order: 3
---

  
## Interface Methods

### `addDomain`

Add a colony domain, and its respective local skill under skill with id `_parentSkillId` New funding pot is created and associated with the domain here

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the _domainId is relative to _permissionDomainId
|_parentDomainId|uint256|Id of the domain under which the new one will be added


### `addPayment`

Add a new payment in the colony. Secured function to authorised members

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the _domainId is relative to _permissionDomainId
|_recipient|address|Address of the payment recipient
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Payout amount
|_domainId|uint256|The domain where the payment belongs
|_skillId|uint256|The skill associated with the payment

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|paymentId|uint256|Identifier of the newly created payment

### `authority`

Get the `ColonyAuthority` for the colony


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyAuthority|address|The `ColonyAuthority` contract address

### `bootstrapColony`

Allows the colony to bootstrap itself by having initial reputation and token `_amount` assigned to users `_users`

**Parameters**

|Name|Type|Description|
|---|---|---|
|_users|memory|Array of address to bootstrap with reputation
|_amount|memory|Amount of reputation/tokens for every address


### `cancelTask`

Cancel a task at any point before it is finalized. Secured function to authorised members Any funds assigned to its funding pot can be moved back to the domain via `IColony.moveFundsBetweenPots`

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task


### `claimColonyFunds`

Move any funds received by the colony in `_token` denomination to the top-level domain pot, siphoning off a small amount to the reward pot. If called against a colony's own token, no fee is taken

**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token, `0x0` value indicates Ether


### `claimPayment`

Claim the payout in `_token` denomination for payment `_id`. Here the network receives its fee from each payout. Same as for tasks, ether fees go straight to the Meta Colony whereas Token fees go to the Network to be auctioned off.

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Payment identifier
|_token|address|Address of the token, `0x0` value indicates Ether


### `claimRewardPayout`



**Parameters**

|Name|Type|Description|
|---|---|---|
|_payoutId|uint256|
|_squareRoots|memory|
|key|bytes|
|value|bytes|
|branchMask|uint256|
|siblings|memory|


### `claimTaskPayout`

Claim the payout in `_token` denomination for work completed in task `_id` by contributor with role `_role` Allowed only after task is finalized. Here the network receives its fee from each payout. Ether fees go straight to the Meta Colony whereas Token fees go to the Network to be auctioned off.

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_role|uint8|Id of the role, as defined in TaskRole enum
|_token|address|Address of the token, `0x0` value indicates Ether


### `completeTask`

Mark a task as complete after the due date has passed. This allows the task to be rated and finalized (and funds recovered) even in the presence of a worker who has disappeared.

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task


### `executeTaskChange`



**Parameters**

|Name|Type|Description|
|---|---|---|
|_sigV|memory|
|_sigR|memory|
|_sigS|memory|
|_mode|memory|
|_value|uint256|
|_data|bytes|


### `executeTaskRoleAssignment`

Executes a task role update transaction `_data` which is approved and signed by two of addresses

**Parameters**

|Name|Type|Description|
|---|---|---|
|_sigV|memory|recovery id
|_sigR|memory|r output of the ECDSA signature of the transaction
|_sigS|memory|s output of the ECDSA signature of the transaction
|_mode|memory|How the signature was generated - 0 for Geth-style (usual), 1 for Trezor-style (only Trezor does this)
|_value|uint256|The transaction value, i.e. number of wei to be sent when the transaction is executed
|_data|bytes|The transaction data


### `finalizePayment`

Finalizes the payment and logs the reputation log updates

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the _domainId is relative to _permissionDomainId
|_id|uint256|Payment identifier


### `finalizeRewardPayout`

Finalises the reward payout. Allows creation of next reward payouts for token that has been used in `_payoutId` Can only be called when reward payout cycle is finished i.e when 60 days have passed from its creation

**Parameters**

|Name|Type|Description|
|---|---|---|
|_payoutId|uint256|Id of the reward payout


### `finalizeTask`

Called after task work rating is complete which closes the task and logs the respective reputation log updates

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task


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

### `getColonyNetwork`

Returns the colony network address set on the Colony


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyNetwork|address|The address of Colony Network instance

### `getDomain`

Get a domain by id

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the domain which details to get

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|domain|memory|The domain

### `getDomainCount`

Get the number of domains in the colony


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The domain count. Min 1 as the root domain is created at the same time as the colony

### `getFundingPot`

Get the non-mapping properties of a pot by id

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the pot which details to get

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|associatedType|memory|
|associatedTypeId|uint256|
|payoutsWeCannotMake|uint256|Number of payouts that cannot be completed with the current funding

### `getFundingPotBalance`

Get the `_token` balance of pot with id `_potId`

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

Get the number of funding pots in the colony


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The funding pots count

### `getFundingPotPayout`

Get the assigned `_token` payouts of pot with id `_potId`

**Parameters**

|Name|Type|Description|
|---|---|---|
|_potId|uint256|Id of the funding pot
|_token|address|Address of the token, `0x0` value indicates Ether

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|payout|uint256|

### `getNonRewardPotsTotal`

Get the total amount of tokens `_token` minus amount reserved to be paid to the reputation and token holders as rewards

**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token, `0x0` value indicates Ether

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|amount|uint256|Total amount of tokens in funding pots other than the rewards pot (id 0)

### `getPayment`

Returns an exiting payment

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Payment identifier

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|payment|memory|The Payment data structure

### `getPaymentCount`

Get the number of payments in the colony


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The payment count

### `getRewardInverse`

Return 1 / the reward to pay out from revenue. e.g. if the fee is 1% (or 0.01), return 100


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|rewardInverse|uint256|The inverse of the reward

### `getRewardPayoutInfo`

Get useful information about specific reward payout

**Parameters**

|Name|Type|Description|
|---|---|---|
|_payoutId|uint256|Id of the reward payout

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|rewardPayoutCycle|memory|

### `getTask`

Get the number of tasks in the colony

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|specificationHash|bytes32|
|deliverableHash|bytes32|
|status|memory|
|dueDate|uint256|
|fundingPotId|uint256|
|completionTimestamp|uint256|
|domainId|uint256|
|skillIds|memory|

### `getTaskChangeNonce`

Starts from 0 and is incremented on every co-reviewed task change via `executeTaskChange` call

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nonce|uint256|The current task change nonce value

### `getTaskCount`

Get the number of tasks in the colony


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The task count

### `getTaskPayout`

Get payout amount in `_token` denomination for role `_role` in task `_id`

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

Get the `Role` properties back for role `_role` in task `_id`

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_role|uint8|Id of the role, as defined in TaskRole enum

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|role|memory|The Role

### `getTaskWorkRatingSecret`

Get the `ColonyStorage.RatingSecrets` information for task `_id`

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_role|uint8|

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|secret|bytes32|

### `getTaskWorkRatingSecretsInfo`

Get the `ColonyStorage.RatingSecrets` information for task `_id`

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

Get the colony token


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|tokenAddress|address|Address of the token contract

### `hasUserRole`

Check whether a given user has a given role for the colony.

**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The user whose role we want to check
|_domainId|uint256|The domain where we want to check for the role
|_role|memory|The role we want to check for

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|hasRole|bool|

### `initialiseColony`

Called once when the colony is created to initialise certain storage slot values

**Parameters**

|Name|Type|Description|
|---|---|---|
|_colonyNetworkAddress|address|Address of the colony network
|_token|address|Address of the colony ERC20 Token


### `makeTask`

Make a new task in the colony. Secured function to authorised members

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the _domainId is relative to _permissionDomainId
|_specificationHash|bytes32|Database identifier where the task specification is stored
|_domainId|uint256|The domain where the task belongs
|_skillId|uint256|The skill associated with the task, can set to 0 for no-op
|_dueDate|uint256|The due date of the task, can set to 0 for no-op


### `mintTokens`

Mint `_wad` amount of colony tokens. Secured function to authorised members

**Parameters**

|Name|Type|Description|
|---|---|---|
|_wad|uint256|Amount to mint


### `moveFundsBetweenPots`

Move a given amount: `_amount` of `_token` funds from funding pot with id `_fromPot` to one with id `_toPot`.

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_fromChildSkillIndex|uint256|The child index in _permissionDomainId where we can find the domain for _fromPotId
|_toChildSkillIndex|uint256|The child index in _permissionDomainId where we can find the domain for _toPotId
|_fromPot|uint256|Funding pot id providing the funds
|_toPot|uint256|Funding pot id receiving the funds
|_amount|uint256|Amount of funds
|_token|address|Address of the token, `0x0` value indicates Ether


### `owner`

Get the colony `owner` address. This should be address(0x0) at all times


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyOwner|address|Address of the colony owner

### `registerColonyLabel`

Register colony's ENS label

**Parameters**

|Name|Type|Description|
|---|---|---|
|colonyName|string|The label to register.
|orbitdb|string|The path of the orbitDB database associated with the colony name


### `removeTaskEvaluatorRole`

Removing evaluator role Agreed between manager and currently assigned evaluator

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task


### `removeTaskWorkerRole`

Removing worker role Agreed between manager and currently assigned worker

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task


### `revealTaskWorkRating`

Reveal the secret rating submitted in `IColony.submitTaskWorkRating` for task `_id` and task role with id `_role` Allowed within 5 days period starting which whichever is first from either both rating secrets being submitted (via `IColony.submitTaskWorkRating`) or the 5 day rating period expiring

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
|_childSkillIndex|uint256|The index that the _domainId is relative to _permissionDomainId
|_user|address|User we want to give an admin role to
|_domainId|uint256|Domain in which we are giving user the role
|_setTo|bool|The state of the role permission (true assign the permission, false revokes it)


### `setAllTaskPayouts`

Set `_token` payout for all roles in task `_id` to the respective amounts

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_token|address|Address of the token, `0x0` value indicates Ether
|_managerAmount|uint256|Payout amount for manager
|_evaluatorAmount|uint256|Payout amount for evaluator
|_workerAmount|uint256|Payout amount for worker


### `setArchitectureRole`

Set new colony architecture role. Can be called by root role or architecture role.

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|Domain in which the caller has root/architecture role
|_childSkillIndex|uint256|The index that the _domainId is relative to _permissionDomainId
|_user|address|User we want to give an architecture role to
|_domainId|uint256|Domain in which we are giving user the role
|_setTo|bool|The state of the role permission (true assign the permission, false revokes it)


### `setFundingRole`

Set new colony funding role. Can be called by root role or architecture role.

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|Domain in which the caller has root/architecture role
|_childSkillIndex|uint256|The index that the _domainId is relative to _permissionDomainId
|_user|address|User we want to give an funding role to
|_domainId|uint256|Domain in which we are giving user the role
|_setTo|bool|The state of the role permission (true assign the permission, false revokes it)


### `setPaymentDomain`

Sets the domain on an existing payment. Secured function to authorised members

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the _domainId is relative to _permissionDomainId
|_id|uint256|Payment identifier
|_domainId|uint256|Id of the new domain to set


### `setPaymentPayout`

Sets the payout for a given token on an existing payment. Secured function to authorised members

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the _domainId is relative to _permissionDomainId
|_id|uint256|Payment identifier
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Payout amount


### `setPaymentRecipient`

Sets the recipient on an existing payment. Secured function to authorised members

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the _domainId is relative to _permissionDomainId
|_id|uint256|Payment identifier
|_recipient|address|Address of the payment recipient


### `setPaymentSkill`

Sets the skill on an existing payment. Secured function to authorised members

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the _domainId is relative to _permissionDomainId
|_id|uint256|Payment identifier
|_skillId|uint256|Id of the new skill to set


### `setRewardInverse`

Set the reward inverse to pay out from revenue. e.g. if the fee is 1% (or 0.01), set 100

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

Set the hash for the task brief, aka task work specification, which identifies the task brief content in ddb Allowed before a task is finalized

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_specificationHash|bytes32|Unique hash of the task brief in ddb


### `setTaskDomain`

Set the domain for task `_id`

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_domainId|uint256|Id of the domain


### `setTaskDueDate`

Set the due date on task `_id`. Allowed before a task is finalized

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_dueDate|uint256|Due date as seconds since unix epoch


### `setTaskEvaluatorPayout`

Set `_token` payout for evaluator in task `_id` to `_amount`

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Payout amount


### `setTaskEvaluatorRole`

Assigning evaluator role Can only be set if there is no one currently assigned to be an evaluator Manager of the task and user we want to assign role to both need to agree Managers can assign themselves to this role, if there is no one currently assigned to it

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_user|address|Address of the user we want to give a evaluator role to


### `setTaskManagerPayout`

Set `_token` payout for manager in task `_id` to `_amount`

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Payout amount


### `setTaskManagerRole`

Assigning manager role Current manager and user we want to assign role to both need to agree User we want to set here also needs to be an admin Note that the domain proof data comes at the end here to not interfere with the assembly argument unpacking

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_user|address|Address of the user we want to give a manager role to
|_permissionDomainId|uint256|The domain ID in which _user has the Administration permission
|_childSkillIndex|uint256|The index that the _domainId is relative to _permissionDomainId


### `setTaskSkill`

Set the skill for task `_id`

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_skillId|uint256|Id of the skill which has to be a global skill


### `setTaskWorkerPayout`

Set `_token` payout for worker in task `_id` to `_amount`

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Payout amount


### `setTaskWorkerRole`

Assigning worker role Can only be set if there is no one currently assigned to be a worker Manager of the task and user we want to assign role to both need to agree

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
|siblings|memory|The siblings of the proof


### `submitTaskDeliverable`

Submit the task deliverable, i.e. the output of the work performed for task `_id` Submission is allowed only to the assigned worker before the task due date. Submissions cannot be overwritten

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_deliverableHash|bytes32|Unique hash of the task deliverable content in ddb


### `submitTaskDeliverableAndRating`

Submit the task deliverable for Worker and rating for Manager

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_deliverableHash|bytes32|Unique hash of the task deliverable content in ddb
|_ratingSecret|bytes32|Rating secret for manager


### `submitTaskWorkRating`

Submit a hashed secret of the rating for work in task `_id` which was performed by user with task role id `_role` Allowed within 5 days period starting which whichever is first from either the deliverable being submitted or the dueDate been reached Allowed only for evaluator to rate worker and for worker to rate manager performance Once submitted ratings can not be changed or overwritten

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_role|uint8|Id of the role, as defined in TaskRole enum
|_ratingSecret|bytes32|`keccak256` hash of a salt and 0-50 rating score (in increments of 10, .e.g 0, 10, 20, 30, 40 or 50)


### `upgrade`

Upgrades a colony to a new Colony contract version `_newVersion`

**Parameters**

|Name|Type|Description|
|---|---|---|
|_newVersion|uint|The target version for the upgrade


### `verifyReputationProof`

Helper function that can be used by a client to verify the correctness of a patricia proof they have been supplied with.

**Parameters**

|Name|Type|Description|
|---|---|---|
|key|bytes|The key of the element the proof is for.
|value|bytes|The value of the element that the proof is for.
|branchMask|uint256|The branchmask of the proof
|siblings|memory|The siblings of the proof

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|isValid|bool|True if the proof is valid, false otherwise.

### `version`

Get the Colony contract version Starts from 1 and is incremented with every deployed contract change


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyVersion|uint256|Version number