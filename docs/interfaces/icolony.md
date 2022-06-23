# Colony (`IColony`)


## Interface Methods

### ▸ **`addDomain(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _parentDomainId)`**

Add a colony domain, and its respective local skill under skill with id `_parentSkillId`. New funding pot is created and associated with the domain here.

*Note: Adding new domains is currently retricted to one level only, i.e. `_parentDomainId` has to be the root domain id: `1`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_parentDomainId|uint256|Id of the domain under which the new one will be added


### ▸ **`addDomain(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _parentDomainId, string memory _metadata)`**

Add a colony domain, and its respective local skill under skill with id `_parentSkillId`. New funding pot is created and associated with the domain here.

*Note: Adding new domains is currently retricted to one level only, i.e. `_parentDomainId` has to be the root domain id: `1`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_parentDomainId|uint256|Id of the domain under which the new one will be added
|_metadata|string|Metadata relating to the domain. Expected to be the IPFS hash of a JSON blob, but not enforced by the contracts.


### ▸ **`addLocalSkill()`**

Add a new local skill for the colony. Secured function to authorised members.




### ▸ **`addPayment(uint256 _permissionDomainId, uint256 _childSkillIndex, address _recipient, address _token, uint256 _amount, uint256 _domainId, uint256 _skillId):uint256 paymentId`**

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

### ▸ **`annotateTransaction(bytes32 _txHash, string memory _metadata)`**

Emit a metadata string for a transaction


**Parameters**

|Name|Type|Description|
|---|---|---|
|_txHash|bytes32|Hash of transaction being annotated (0x0 for current tx)
|_metadata|string|String of metadata for tx


### ▸ **`approveStake(address _approvee, uint256 _domainId, uint256 _amount)`**

Allow the _approvee to obligate some amount of tokens as a stake.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_approvee|address|Address of the account we are willing to let obligate us.
|_domainId|uint256|Domain in which we are willing to be obligated.
|_amount|uint256|Amount of internal token up to which we are willing to be obligated.


### ▸ **`authority():address colonyAuthority`**

Get the `ColonyAuthority` for the colony.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyAuthority|address|The `ColonyAuthority` contract address

### ▸ **`bootstrapColony(address[] memory _users, int[] memory _amount)`**

Allows the colony to bootstrap itself by having initial reputation and token `_amount` assigned to `_users`. This reputation is assigned in the colony-wide domain. Secured function to authorised members.

*Note: Only allowed to be called when `taskCount` is `0` by authorized addresses.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_users|address[]|Array of address to bootstrap with reputation
|_amount|int[]|Amount of reputation/tokens for every address


### ▸ **`burnTokens(address token, uint256 amount)`**

Burn tokens held by the colony. Can only burn tokens held in the root funding pot.


**Parameters**

|Name|Type|Description|
|---|---|---|
|token|address|The address of the token to burn
|amount|uint256|The amount of tokens to burn


### ▸ **`cancelExpenditure(uint256 _id)`**

Cancels the expenditure and prevents further editing. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier


### ▸ **`cancelTask(uint256 _id)`**

Cancel a task at any point before it is finalized. Secured function to authorised members. Any funds assigned to its funding pot can be moved back to the domain via `IColony.moveFundsBetweenPots`.

*Note: Set the `task.status` property to `1`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task


### ▸ **`claimColonyFunds(address _token)`**

Move any funds received by the colony in `_token` denomination to the top-level domain pot, siphoning off a small amount to the reward pot. If called against a colony's own token, no fee is taken.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token, `0x0` value indicates Ether


### ▸ **`claimExpenditurePayout(uint256 _id, uint256 _slot, address _token)`**

Claim the payout for an expenditure slot. Here the network receives a fee from each payout.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier
|_slot|uint256|Number of the slot
|_token|address|Address of the token, `0x0` value indicates Ether


### ▸ **`claimPayment(uint256 _id, address _token)`**

Claim the payout in `_token` denomination for payment `_id`. Here the network receives its fee from each payout. Same as for tasks, ether fees go straight to the Meta Colony whereas Token fees go to the Network to be auctioned off.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Payment identifier
|_token|address|Address of the token, `0x0` value indicates Ether


### ▸ **`claimRewardPayout(uint256 _payoutId, uint256[[object Object]] memory _squareRoots, bytes memory key, bytes memory value, uint256 branchMask, bytes32[] memory siblings)`**

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


### ▸ **`claimTaskPayout(uint256 _id, uint8 _role, address _token)`**

Claim the payout in `_token` denomination for work completed in task `_id` by contributor with role `_role`. Allowed only after task is finalized. Here the network receives its fee from each payout. Ether fees go straight to the Meta Colony whereas Token fees go to the Network to be auctioned off.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_role|uint8|Id of the role, as defined in TaskRole enum
|_token|address|Address of the token, `0x0` value indicates Ether


### ▸ **`completeTask(uint256 _id)`**

Mark a task as complete after the due date has passed. This allows the task to be rated and finalized (and funds recovered) even in the presence of a worker who has disappeared. Note that if the due date was not set, then this function will throw.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task


### ▸ **`deobligateStake(address _user, uint256 _domainId, uint256 _amount)`**

Deobligate the user some amount of tokens, releasing the stake.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|Address of the account we are deobligating.
|_domainId|uint256|Domain in which we are deobligating the user.
|_amount|uint256|Amount of internal token we are deobligating.


### ▸ **`deprecateDomain(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId, bool _deprecated)`**

Deprecate a domain, preventing certain actions from happening there


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_domainId|uint256|Id of the domain being deprecated
|_deprecated|bool|Whether or not the domain is deprecated


### ▸ **`deprecateExtension(bytes32 extensionId, bool deprecated)`**

Set the deprecation of an extension in a colony. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|extensionId|bytes32|keccak256 hash of the extension name, used as an indentifier
|deprecated|bool|Whether to deprecate the extension or not


### ▸ **`deprecateLocalSkill(uint256 localSkillId, bool deprecated)`**

Deprecate a local skill for the colony. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|localSkillId|uint256|Id for the local skill
|deprecated|bool|Deprecation status to set for the skill


### ▸ **`editColony(string memory _metadata)`**

Called to change the metadata associated with a colony. Expected to be a IPFS hash of a JSON blob, but not enforced to any degree by the contracts


**Parameters**

|Name|Type|Description|
|---|---|---|
|_metadata|string|IPFS hash of the metadata


### ▸ **`editColonyByDelta(string memory _metadataDelta)`**

Called to change the metadata associated with a colony. Expected to be a IPFS hash of a delta to a JSON blob, but not enforced to any degree by the contracts


**Parameters**

|Name|Type|Description|
|---|---|---|
|_metadataDelta|string|IPFS hash of the metadata delta


### ▸ **`editDomain(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId, string memory _metadata)`**

Add a colony domain, and its respective local skill under skill with id `_parentSkillId`. New funding pot is created and associated with the domain here.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_domainId|uint256|Id of the domain being edited
|_metadata|string|Metadata relating to the domain. Expected to be the IPFS hash of a JSON blob, but not enforced by the contracts.


### ▸ **`emitDomainReputationPenalty(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId, address _user, int256 _amount)`**

Emit a negative domain reputation update. Available only to Arbitration role holders


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I hold the Arbitration role
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_domainId|uint256|The domain where the user will lose reputation
|_user|address|The user who will lose reputation
|_amount|int256|The (negative) amount of reputation to lose


### ▸ **`emitDomainReputationReward(uint256 _domainId, address _user, int256 _amount)`**

Emit a positive domain reputation update. Available only to Root role holders


**Parameters**

|Name|Type|Description|
|---|---|---|
|_domainId|uint256|The domain where the user will gain reputation
|_user|address|The user who will gain reputation
|_amount|int256|The (positive) amount of reputation to gain


### ▸ **`emitSkillReputationPenalty(uint256 _skillId, address _user, int256 _amount)`**

Emit a negative skill reputation update. Available only to Arbitration role holders in the root domain


**Parameters**

|Name|Type|Description|
|---|---|---|
|_skillId|uint256|The skill where the user will lose reputation
|_user|address|The user who will lose reputation
|_amount|int256|The (negative) amount of reputation to lose


### ▸ **`emitSkillReputationReward(uint256 _skillId, address _user, int256 _amount)`**

Emit a positive skill reputation update. Available only to Root role holders


**Parameters**

|Name|Type|Description|
|---|---|---|
|_skillId|uint256|The skill where the user will gain reputation
|_user|address|The user who will gain reputation
|_amount|int256|The (positive) amount of reputation to gain


### ▸ **`executeTaskChange(uint8[] memory _sigV, bytes32[] memory _sigR, bytes32[] memory _sigS, uint8[] memory _mode, uint256 _value, bytes memory _data)`**

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


### ▸ **`executeTaskRoleAssignment(uint8[] memory _sigV, bytes32[] memory _sigR, bytes32[] memory _sigS, uint8[] memory _mode, uint256 _value, bytes memory _data)`**

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


### ▸ **`finalizeExpenditure(uint256 _id)`**

Finalizes the expenditure and allows for funds to be claimed. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier


### ▸ **`finalizePayment(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id)`**

Finalizes the payment and logs the reputation log updates. Allowed to be called once after payment is fully funded. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_id|uint256|Payment identifier


### ▸ **`finalizeRewardPayout(uint256 _payoutId)`**

Finalises the reward payout. Allows creation of next reward payouts for token that has been used in `_payoutId`. Can only be called when reward payout cycle is finished i.e when 60 days have passed from its creation.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_payoutId|uint256|Id of the reward payout


### ▸ **`finalizeTask(uint256 _id)`**

Called after task work rating is complete which closes the task and logs the respective reputation log updates. Allowed to be called once per task. Secured function to authorised members.

*Note: Set the `task.finalized` property to true*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task


### ▸ **`finishUpgrade()`**

A function to be called after an upgrade has been done from v2 to v3.

*Note: Can only be called by the colony itself, and only expected to be called as part of the `upgrade()` call. Required to be external so it can be an external call.*



### ▸ **`generateSecret(bytes32 _salt, uint256 _value):bytes32 secret`**

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

### ▸ **`getApproval(address _user, address _obligator, uint256 _domainId):uint256 approval`**

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
|approval|uint256|The amount the user has approved

### ▸ **`getCapabilityRoles(bytes4 _sig):bytes32 roles`**

Gets the bytes32 representation of the roles authorized to call a function


**Parameters**

|Name|Type|Description|
|---|---|---|
|_sig|bytes4|The function signature

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|roles|bytes32|bytes32 representation of the authorized roles

### ▸ **`getColonyNetwork():address colonyNetwork`**

Returns the colony network address set on the Colony.

*Note: The colonyNetworkAddress we read here is set once, during `initialiseColony`.*


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyNetwork|address|The address of Colony Network instance

### ▸ **`getDomain(uint256 _id):Domain domain`**

Get a domain by id.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the domain which details to get

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|domain|Domain|The domain

### ▸ **`getDomainCount():uint256 count`**

Get the number of domains in the colony.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The domain count. Min 1 as the root domain is created at the same time as the colony

### ▸ **`getDomainFromFundingPot(uint256 _fundingPotId):uint256 domainId`**

Get the domain corresponding to a funding pot


**Parameters**

|Name|Type|Description|
|---|---|---|
|_fundingPotId|uint256|Id of the funding pot

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|domainId|uint256|Id of the corresponding domain

### ▸ **`getExpenditure(uint256 _id):Expenditure expenditure`**

Returns an existing expenditure.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|expenditure|Expenditure|The expenditure

### ▸ **`getExpenditureCount():uint256 count`**

Get the number of expenditures in the colony.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The expenditure count

### ▸ **`getExpenditureSlot(uint256 _id, uint256 _slot):ExpenditureSlot expenditureSlot`**

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

### ▸ **`getExpenditureSlotPayout(uint256 _id, uint256 _slot, address _token):uint256 amount`**

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

### ▸ **`getFundingPot(uint256 _id):FundingPotAssociatedType associatedType, uint256 associatedTypeId, uint256 payoutsWeCannotMake`**

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

### ▸ **`getFundingPotBalance(uint256 _potId, address _token):uint256 balance`**

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

### ▸ **`getFundingPotCount():uint256 count`**

Get the number of funding pots in the colony.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The funding pots count

### ▸ **`getFundingPotPayout(uint256 _potId, address _token):uint256 payout`**

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

### ▸ **`getNonRewardPotsTotal(address _token):uint256 amount`**

Get the total amount of tokens `_token` minus amount reserved to be paid to the reputation and token holders as rewards.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token, `0x0` value indicates Ether

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|amount|uint256|Total amount of tokens in funding pots other than the rewards pot (id 0)

### ▸ **`getObligation(address _user, address _obligator, uint256 _domainId):uint256 obligation`**

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
|obligation|uint256|The amount that is currently obligated

### ▸ **`getPayment(uint256 _id):Payment payment`**

Returns an exiting payment.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Payment identifier

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|payment|Payment|The Payment data structure

### ▸ **`getPaymentCount():uint256 count`**

Get the number of payments in the colony.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The payment count

### ▸ **`getRewardInverse():uint256 rewardInverse`**

Return 1 / the reward to pay out from revenue. e.g. if the fee is 1% (or 0.01), return 100.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|rewardInverse|uint256|The inverse of the reward

### ▸ **`getRewardPayoutInfo(uint256 _payoutId):RewardPayoutCycle rewardPayoutCycle`**

Get useful information about specific reward payout.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_payoutId|uint256|Id of the reward payout

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|rewardPayoutCycle|RewardPayoutCycle|RewardPayoutCycle, containing propertes:  `reputationState` Reputation root hash at the time of creation,  `colonyWideReputation` Colony wide reputation in `reputationState`,  `totalTokens` Total colony tokens at the time of creation,  `amount` Total amount of tokens taken aside for reward payout,  `tokenAddress` Token address,  `blockTimestamp` Block number at the time of creation.

### ▸ **`getRootLocalSkill():uint256 rootLocalSkill`**

Get the root local skill id



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|rootLocalSkill|uint256|The root local skill id

### ▸ **`getTask(uint256 _id):bytes32 specificationHash, bytes32 deliverableHash, TaskStatus status, uint256 dueDate, uint256 fundingPotId, uint256 completionTimestamp, uint256 domainId, uint256[] skillIds`**

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

### ▸ **`getTaskChangeNonce(uint256 _id):uint256 nonce`**

Starts from 0 and is incremented on every co-reviewed task change via `executeTaskChange` call.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nonce|uint256|The current task change nonce value

### ▸ **`getTaskCount():uint256 count`**

Get the number of tasks in the colony.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The task count

### ▸ **`getTaskPayout(uint256 _id, uint8 _role, address _token):uint256 amount`**

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

### ▸ **`getTaskRole(uint256 _id, uint8 _role):Role role`**

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

### ▸ **`getTaskWorkRatingSecret(uint256 _id, uint8 _role):bytes32 secret`**

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

### ▸ **`getTaskWorkRatingSecretsInfo(uint256 _id):uint256 nSecrets, uint256 lastSubmittedAt`**

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

### ▸ **`getToken():address tokenAddress`**

Get the colony token.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|tokenAddress|address|Address of the token contract

### ▸ **`getTokenApproval(address token, address spender):uint256 amount`**

Get the current approval amount


**Parameters**

|Name|Type|Description|
|---|---|---|
|token|address|The address of the token which was approved
|spender|address|The account we have approved

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|amount|uint256|The token approval amount

### ▸ **`getTotalTokenApproval(address token):uint256 amount`**

Get the current total approval amount across all spenders


**Parameters**

|Name|Type|Description|
|---|---|---|
|token|address|The address of the token which was approved

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|amount|uint256|The total token approval amount

### ▸ **`getUserRoles(address _user, uint256 _domain):bytes32 roles`**

Gets the bytes32 representation of the roles for a user in a given domain


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The user whose roles we want to get
|_domain|uint256|The domain we want to get roles in

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|roles|bytes32|bytes32 representation of the held roles

### ▸ **`hasInheritedUserRole(address _user, uint256 _domainId, ColonyRole _role, uint256 _childSkillIndex, uint256 _childDomainId):bool hasRole`**

Check whether a given user has a given role for the colony, in a child domain. Calls the function of the same name on the colony's authority contract and an internal inheritance validator function


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

### ▸ **`hasUserRole(address _user, uint256 _domainId, ColonyRole _role):bool hasRole`**

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

### ▸ **`initialiseColony(address _colonyNetworkAddress, address _token)`**

Called once when the colony is created to initialise certain storage slot values.

*Note: Sets the reward inverse to the uint max 2**256 - 1.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_colonyNetworkAddress|address|Address of the colony network
|_token|address|Address of the colony ERC20 Token


### ▸ **`initialiseRootLocalSkill()`**

Initialise the local skill tree for the colony.




### ▸ **`installExtension(bytes32 extensionId, uint256 version)`**

Install an extension to the colony. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|extensionId|bytes32|keccak256 hash of the extension name, used as an indentifier
|version|uint256|The new extension version to install


### ▸ **`lockExpenditure(uint256 _id)`**

Locks the expenditure and prevents further editing. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier


### ▸ **`lockToken():uint256 timesLocked`**

Lock the colony's token. Can only be called by a network-managed extension.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|timesLocked|uint256|The amount of times the token was locked

### ▸ **`makeArbitraryTransaction(address _to, bytes memory _action):bool success`**

Execute arbitrary transaction on behalf of the Colony


**Parameters**

|Name|Type|Description|
|---|---|---|
|_to|address|Contract to receive the function call (cannot be this contract, network or token locking)
|_action|bytes|Bytes array encoding the function call and arguments

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|success|bool|Boolean indicating whether the transaction succeeded

### ▸ **`makeArbitraryTransactions(address[] memory _targets, bytes[] memory _actions, bool _strict):bool success`**

Execute arbitrary transactions on behalf of the Colony in series


**Parameters**

|Name|Type|Description|
|---|---|---|
|_targets|address[]|Array of addressed to be targeted
|_actions|bytes[]|Array of Bytes arrays encoding the function calls and arguments
|_strict|bool|Boolean indicating whether if one transaction fails, the whole call to this function should fail.

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|success|bool|Boolean indicating whether the transactions succeeded

### ▸ **`makeExpenditure(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId):uint256 expenditureId`**

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

### ▸ **`makeSingleArbitraryTransaction(address _target, bytes memory _action):bool success`**

Executes a single arbitrary transaction

*Note: Only callable by the colony itself. If you wish to use this functionality, you should use the makeAbitraryTransactions function*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_target|address|Contract to receive the function call
|_action|bytes|Bytes array encoding the function call and arguments

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|success|bool|Boolean indicating whether the transactions succeeded

### ▸ **`makeTask(uint256 _permissionDomainId, uint256 _childSkillIndex, bytes32 _specificationHash, uint256 _domainId, uint256 _skillId, uint256 _dueDate)`**

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


### ▸ **`mintTokens(uint256 _wad)`**

Mint `_wad` amount of colony tokens. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_wad|uint256|Amount to mint


### ▸ **`mintTokensFor(address _guy, uint256 _wad)`**

Mint `_wad` amount of colony tokens and send to `_guy`. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_guy|address|Recipient of new tokens
|_wad|uint256|Amount to mint


### ▸ **`moveFundsBetweenPots(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId, uint256 _fromChildSkillIndex, uint256 _toChildSkillIndex, uint256 _fromPot, uint256 _toPot, uint256 _amount, address _token)`**

Move a given amount: `_amount` of `_token` funds from funding pot with id `_fromPot` to one with id `_toPot`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The child index in _permissionDomainId where I will be taking this action
|_domainId|uint256|The domain where I am taking this action, pointed to by _permissionDomainId and _childSkillIndex
|_fromChildSkillIndex|uint256|In the array of child skills for the skill associated with the domain pointed to by _permissionDomainId + _childSkillIndex, the index of the skill associated with the domain that contains _fromPot
|_toChildSkillIndex|uint256|The same, but for the _toPot which the funds are being moved to
|_fromPot|uint256|Funding pot id providing the funds
|_toPot|uint256|Funding pot id receiving the funds
|_amount|uint256|Amount of funds
|_token|address|Address of the token, `0x0` value indicates Ether


### ▸ **`moveFundsBetweenPots(uint256 _permissionDomainId, uint256 _fromChildSkillIndex, uint256 _toChildSkillIndex, uint256 _fromPot, uint256 _toPot, uint256 _amount, address _token)`**

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


### ▸ **`obligateStake(address _user, uint256 _domainId, uint256 _amount)`**

Obligate the user some amount of tokens as a stake.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|Address of the account we are obligating.
|_domainId|uint256|Domain in which we are obligating the user.
|_amount|uint256|Amount of internal token we are obligating.


### ▸ **`owner():address colonyOwner`**

Get the colony `owner` address. This should be address(0x0) at all times.

*Note: Used for testing.*


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyOwner|address|Address of the colony owner

### ▸ **`registerColonyLabel(string memory colonyName, string memory orbitdb)`**

Register colony's ENS label.


**Parameters**

|Name|Type|Description|
|---|---|---|
|colonyName|string|The label to register.
|orbitdb|string|The path of the orbitDB database associated with the colony name


### ▸ **`removeTaskEvaluatorRole(uint256 _id)`**

Removing evaluator role. Agreed between manager and currently assigned evaluator.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task


### ▸ **`removeTaskWorkerRole(uint256 _id)`**

Removing worker role. Agreed between manager and currently assigned worker.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task


### ▸ **`revealTaskWorkRating(uint256 _id, uint8 _role, uint8 _rating, bytes32 _salt)`**

Reveal the secret rating submitted in `IColony.submitTaskWorkRating` for task `_id` and task role with id `_role`. Allowed within 5 days period starting which whichever is first from either both rating secrets being submitted (via `IColony.submitTaskWorkRating`) or the 5 day rating period expiring.

*Note: Compares the `keccak256(_salt, _rating)` output with the previously submitted rating secret and if they match, sets the task role properties `rated` to `true` and `rating` to `_rating`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_role|uint8|Id of the role, as defined in TaskRole enum
|_rating|uint8|0-50 rating score (in increments of 10, .e.g 0, 10, 20, 30, 40 or 50)
|_salt|bytes32|Salt value used to generate the rating secret


### ▸ **`setAdministrationRole(uint256 _permissionDomainId, uint256 _childSkillIndex, address _user, uint256 _domainId, bool _setTo)`**

Set new colony admin role. Can be called by root role or architecture role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|Domain in which the caller has root/architecture role
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_user|address|User we want to give an admin role to
|_domainId|uint256|Domain in which we are giving user the role
|_setTo|bool|The state of the role permission (true assign the permission, false revokes it)


### ▸ **`setAllTaskPayouts(uint256 _id, address _token, uint256 _managerAmount, uint256 _evaluatorAmount, uint256 _workerAmount)`**

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


### ▸ **`setArbitrationRole(uint256 _permissionDomainId, uint256 _childSkillIndex, address _user, uint256 _domainId, bool _setTo)`**

Set new colony arbitration role. Can be called by root role or architecture role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|Domain in which the caller has root role
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_user|address|User we want to give an arbitration role to
|_domainId|uint256|Domain in which we are giving user the role
|_setTo|bool|The state of the role permission (true assign the permission, false revokes it)


### ▸ **`setArchitectureRole(uint256 _permissionDomainId, uint256 _childSkillIndex, address _user, uint256 _domainId, bool _setTo)`**

Set new colony architecture role. Can be called by root role or architecture role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|Domain in which the caller has root/architecture role
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_user|address|User we want to give an architecture role to
|_domainId|uint256|Domain in which we are giving user the role
|_setTo|bool|The state of the role permission (true assign the permission, false revokes it)


### ▸ **`setDefaultGlobalClaimDelay(uint256 _globalClaimDelay)`**

Update the default global claim delay for expenditures


**Parameters**

|Name|Type|Description|
|---|---|---|
|_globalClaimDelay|uint256|The new default global claim delay


### ▸ **`setExpenditureClaimDelay(uint256 _id, uint256 _slot, uint256 _claimDelay)`**

Sets the claim delay on an expenditure slot. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier
|_slot|uint256|Number of the slot
|_claimDelay|uint256|Duration of time (in seconds) to delay


### ▸ **`setExpenditureClaimDelays(uint256 _id, uint256[] memory _slots, uint256[] memory _claimDelays)`**

Sets the claim delays in given expenditure slots. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier
|_slots|uint256[]|Array of slots to set claim delays
|_claimDelays|uint256[]|Durations of time (in seconds) to delay


### ▸ **`setExpenditureMetadata(uint256 _id, string memory _metadata)`**

Sets the metadata for an expenditure. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the expenditure
|_metadata|string|IPFS hash of the metadata


### ▸ **`setExpenditureMetadata(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id, string memory _metadata)`**

Sets the metadata for an expenditure. Can only be called by Arbitration role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`,
|_id|uint256|Id of the expenditure
|_metadata|string|IPFS hash of the metadata


### ▸ **`setExpenditurePayout(uint256 _id, uint256 _slot, address _token, uint256 _amount)`**

Set the token payout on an expenditure slot. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the expenditure
|_slot|uint256|Number of the slot
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Payout amount


### ▸ **`setExpenditurePayoutModifiers(uint256 _id, uint256[] memory _slots, int256[] memory _payoutModifiers)`**

Sets the payout modifiers in given expenditure slots. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier
|_slots|uint256[]|Array of slots to set payout modifiers
|_payoutModifiers|int256[]|Values (between +/- WAD) to modify the payout & reputation bonus


### ▸ **`setExpenditurePayouts(uint256 _id, uint256[] memory _slots, address _token, uint256[] memory _amounts)`**

Set the token payouts in given expenditure slots. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the expenditure
|_slots|uint256[]|Array of slots to set payouts
|_token|address|Address of the token, `0x0` value indicates Ether
|_amounts|uint256[]|Payout amounts


### ▸ **`setExpenditureRecipient(uint256 _id, uint256 _slot, address _recipient)`**

Sets the recipient on an expenditure slot. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the expenditure
|_slot|uint256|Slot for the recipient address
|_recipient|address|Address of the recipient


### ▸ **`setExpenditureRecipients(uint256 _id, uint256[] memory _slots, address[] memory _recipients)`**

Sets the recipients in given expenditure slots. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the expenditure
|_slots|uint256[]|Array of slots to set recipients
|_recipients|address[]|Addresses of the recipients


### ▸ **`setExpenditureSkill(uint256 _id, uint256 _slot, uint256 _skillId)`**

Sets the skill on an expenditure slot. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier
|_slot|uint256|Number of the slot
|_skillId|uint256|Id of the new skill to set


### ▸ **`setExpenditureSkills(uint256 _id, uint256[] memory _slots, uint256[] memory _skillIds)`**

Sets the skill on an expenditure slot. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier
|_slots|uint256[]|Array of slots to set skills
|_skillIds|uint256[]|Ids of the new skills to set


### ▸ **`setExpenditureState(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id, uint256 _storageSlot, bool[] memory _mask, bytes32[] memory _keys, bytes32 _value)`**

Set arbitrary state on an expenditure slot. Can only be called by Arbitration role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`, (only used if `_permissionDomainId` is different to `_domainId`)
|_id|uint256|Expenditure identifier
|_storageSlot|uint256|Number of the top-level storage slot (25, 26, or 27)
|_mask|bool[]|Array of booleans indicated whether a key is a mapping (F) or an array index (T).
|_keys|bytes32[]|Array of additional keys (for mappings & arrays)
|_value|bytes32|Value to set at location


### ▸ **`setFundingRole(uint256 _permissionDomainId, uint256 _childSkillIndex, address _user, uint256 _domainId, bool _setTo)`**

Set new colony funding role. Can be called by root role or architecture role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|Domain in which the caller has root/architecture role
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_user|address|User we want to give an funding role to
|_domainId|uint256|Domain in which we are giving user the role
|_setTo|bool|The state of the role permission (true assign the permission, false revokes it)


### ▸ **`setPaymentPayout(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id, address _token, uint256 _amount)`**

Sets the payout for a given token on an existing payment. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_id|uint256|Payment identifier
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Payout amount


### ▸ **`setPaymentRecipient(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id, address _recipient)`**

Sets the recipient on an existing payment. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_id|uint256|Payment identifier
|_recipient|address|Address of the payment recipient


### ▸ **`setPaymentSkill(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id, uint256 _skillId)`**

Sets the skill on an existing payment. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_id|uint256|Payment identifier
|_skillId|uint256|Id of the new skill to set


### ▸ **`setRewardInverse(uint256 _rewardInverse)`**

Set the reward inverse to pay out from revenue. e.g. if the fee is 1% (or 0.01), set 100.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_rewardInverse|uint256|The inverse of the reward


### ▸ **`setRootRole(address _user, bool _setTo)`**

Set new colony root role. Can be called by root role only.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|User we want to give an root role to
|_setTo|bool|The state of the role permission (true assign the permission, false revokes it)


### ▸ **`setTaskBrief(uint256 _id, bytes32 _specificationHash)`**

Set the hash for the task brief, aka task work specification, which identifies the task brief content in ddb. Allowed before a task is finalized.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_specificationHash|bytes32|Unique hash of the task brief in ddb


### ▸ **`setTaskDueDate(uint256 _id, uint256 _dueDate)`**

Set the due date on task `_id`. Allowed before a task is finalized.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_dueDate|uint256|Due date as seconds since unix epoch


### ▸ **`setTaskEvaluatorPayout(uint256 _id, address _token, uint256 _amount)`**

Set `_token` payout for evaluator in task `_id` to `_amount`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Payout amount


### ▸ **`setTaskEvaluatorRole(uint256 _id, address _user)`**

Assigning evaluator role. Can only be set if there is no one currently assigned to be an evaluator. Manager of the task and user we want to assign role to both need to agree. Managers can assign themselves to this role, if there is no one currently assigned to it.

*Note: This function can only be called through `executeTaskRoleAssignment`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_user|address|Address of the user we want to give a evaluator role to


### ▸ **`setTaskManagerPayout(uint256 _id, address _token, uint256 _amount)`**

Set `_token` payout for manager in task `_id` to `_amount`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Payout amount


### ▸ **`setTaskManagerRole(uint256 _id, address _user, uint256 _permissionDomainId, uint256 _childSkillIndex)`**

Assigning manager role. Current manager and user we want to assign role to both need to agree. User we want to set here also needs to be an admin. Note that the domain proof data comes at the end here to not interfere with the assembly argument unpacking.

*Note: This function can only be called through `executeTaskRoleAssignment`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_user|address|Address of the user we want to give a manager role to
|_permissionDomainId|uint256|The domain ID in which _user has the Administration permission
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`


### ▸ **`setTaskSkill(uint256 _id, uint256 _skillId)`**

Set the skill for task `_id`.

*Note: Currently we only allow one skill per task although we have provisioned for an array of skills in `Task` struct. Allowed before a task is finalized.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_skillId|uint256|Id of the skill which has to be a global skill


### ▸ **`setTaskWorkerPayout(uint256 _id, address _token, uint256 _amount)`**

Set `_token` payout for worker in task `_id` to `_amount`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Payout amount


### ▸ **`setTaskWorkerRole(uint256 _id, address _user)`**

Assigning worker role. Can only be set if there is no one currently assigned to be a worker. Manager of the task and user we want to assign role to both need to agree.

*Note: This function can only be called through `executeTaskRoleAssignment`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_user|address|Address of the user we want to give a worker role to


### ▸ **`setUserRoles(uint256 _permissionDomainId, uint256 _childSkillIndex, address _user, uint256 _domainId, bytes32 _roles)`**

Set several roles in one transaction. Can be called by root role or architecture role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|Domain in which the caller has root/architecture role
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_user|address|User we want to give a role to
|_domainId|uint256|Domain in which we are giving user the role
|_roles|bytes32|Byte array representing the desired role setting (1 for on, 0 for off)


### ▸ **`startNextRewardPayout(address _token, bytes memory key, bytes memory value, uint256 branchMask, bytes32[] memory siblings)`**

Add a new payment in the colony. Can only be called by users with root permission. All tokens will be locked, and can be unlocked by calling `waiveRewardPayout` or `claimRewardPayout`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token used for reward payout
|key|bytes|Some Reputation hash tree key
|value|bytes|Reputation value
|branchMask|uint256|The branchmask of the proof
|siblings|bytes32[]|The siblings of the proof


### ▸ **`submitTaskDeliverable(uint256 _id, bytes32 _deliverableHash)`**

Submit the task deliverable, i.e. the output of the work performed for task `_id`. Submission is allowed only to the assigned worker before the task due date. Submissions cannot be overwritten.

*Note: Set the `task.deliverableHash` and `task.completionTimestamp` properties.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_deliverableHash|bytes32|Unique hash of the task deliverable content in ddb


### ▸ **`submitTaskDeliverableAndRating(uint256 _id, bytes32 _deliverableHash, bytes32 _ratingSecret)`**

Submit the task deliverable for Worker and rating for Manager.

*Note: Internally call `submitTaskDeliverable` and `submitTaskWorkRating` in sequence.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_deliverableHash|bytes32|Unique hash of the task deliverable content in ddb
|_ratingSecret|bytes32|Rating secret for manager


### ▸ **`submitTaskWorkRating(uint256 _id, uint8 _role, bytes32 _ratingSecret)`**

Submit a hashed secret of the rating for work in task `_id` which was performed by user with task role id `_role`. Allowed within 5 days period starting which whichever is first from either the deliverable being submitted or the dueDate been reached. Allowed only for evaluator to rate worker and for worker to rate manager performance. Once submitted ratings can not be changed or overwritten.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task
|_role|uint8|Id of the role, as defined in TaskRole enum
|_ratingSecret|bytes32|`keccak256` hash of a salt and 0-50 rating score (in increments of 10, .e.g 0, 10, 20, 30, 40 or 50). Can be generated via `IColony.generateSecret` helper function.


### ▸ **`transferExpenditure(uint256 _id, address _newOwner)`**

Updates the expenditure owner. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier
|_newOwner|address|New owner of expenditure


### ▸ **`transferExpenditureViaArbitration(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id, address _newOwner)`**

Updates the expenditure owner. Can only be called by Arbitration role.

*Note: This is now deprecated and will be removed in a future version*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`, (only used if `_permissionDomainId` is different to `_domainId`)
|_id|uint256|Expenditure identifier
|_newOwner|address|New owner of expenditure


### ▸ **`transferStake(uint256 _permissionDomainId, uint256 _childSkillIndex, address _obligator, address _user, uint256 _domainId, uint256 _amount, address _recipient)`**

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


### ▸ **`uninstallExtension(bytes32 extensionId)`**

Uninstall an extension from a colony. Secured function to authorised members.

*Note: This is a permanent action -- re-installing the extension will deploy a new contract*

**Parameters**

|Name|Type|Description|
|---|---|---|
|extensionId|bytes32|keccak256 hash of the extension name, used as an indentifier


### ▸ **`unlockToken()`**

unlock the native colony token, if possible




### ▸ **`unlockTokenForUser(address user, uint256 lockId)`**

Unlock the colony's token for a user. Can only be called by a network-managed extension.


**Parameters**

|Name|Type|Description|
|---|---|---|
|user|address|The user to unlock
|lockId|uint256|The specific lock to unlock


### ▸ **`updateApprovalAmount(address token, address spender)`**

Update the internal bookkeeping around external ERC20 approvals


**Parameters**

|Name|Type|Description|
|---|---|---|
|token|address|The address of the token which was approved
|spender|address|The account we have approved


### ▸ **`updateColonyOrbitDB(string memory orbitdb)`**

Update a colony's orbitdb address. Can only be called by a colony with a registered subdomain


**Parameters**

|Name|Type|Description|
|---|---|---|
|orbitdb|string|The path of the orbitDB database to be associated with the colony


### ▸ **`upgrade(uint _newVersion)`**

Upgrades a colony to a new Colony contract version `_newVersion`.

*Note: Downgrades are not allowed, i.e. `_newVersion` should be higher than the currect colony version.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_newVersion|uint|The target version for the upgrade


### ▸ **`upgradeExtension(bytes32 extensionId, uint256 newVersion)`**

Upgrade an extension in a colony. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|extensionId|bytes32|keccak256 hash of the extension name, used as an indentifier
|newVersion|uint256|The version to upgrade to (must be one larger than the current version)


### ▸ **`userCanSetRoles(address _user, uint256 _domainId, uint256 _childSkillIndex, uint256 _childDomainId):bool canSet`**

Check whether a given user can modify roles in the target domain `_childDomainId`. Mostly a convenience function to provide a uniform interface for extension contracts validating permissions


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The user whose permissions we want to check
|_domainId|uint256|Domain in which the caller has the role (currently Root or Architecture)
|_childSkillIndex|uint256|The index that the `_childDomainId` is relative to `_domainId`
|_childDomainId|uint256|The domain where we want to edit roles

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|canSet|bool|Boolean indicating whether the given user is allowed to edit roles in the target domain.

### ▸ **`verifyReputationProof(bytes memory key, bytes memory value, uint256 branchMask, bytes32[] memory siblings):bool isValid`**

Helper function that can be used by a client to verify the correctness of a patricia proof they have been supplied with.

*Note: For more detail about branchMask and siblings, examine the PatriciaTree implementation. While external, likely only to be used by the Colony contracts, as it checks that the user is proving their own reputation in the current colony. The `verifyProof` function can be used to verify any proof, though this function is not currently exposed on the Colony's EtherRouter.*

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

### ▸ **`version():uint256 colonyVersion`**

Get the Colony contract version. Starts from 1 and is incremented with every deployed contract change.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyVersion|uint256|Version number
