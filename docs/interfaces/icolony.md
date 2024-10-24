# Colony (`IColony`)

The main body of functionality of a colony. If extensions can be thought of
as "applications", providing specific functionality, then this contract can
be thought of as the "operating system", providing "system calls" for managing
a colony's underlying resources, such as managing roles & permissions,
creating new domains and expenditures, and moving resources throughout a
colony. Extensions express their functionality by calling these functions
on the colony on which they are installed, and users with the proper
permissions can call these functions directly.

  
## Interface Methods

### ▸ `addDomain(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _parentDomainId)`

Add a colony domain, and its respective local skill under skill with id `_parentSkillId`. New funding pot is created and associated with the domain here.

*Note: Adding new domains is currently retricted to one level only, i.e. `_parentDomainId` has to be the root domain id: `1`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_parentDomainId|uint256|Id of the domain under which the new one will be added


### ▸ `addDomain(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _parentDomainId, string memory _metadata)`

Add a colony domain, and its respective local skill under skill with id `_parentSkillId`. New funding pot is created and associated with the domain here.

*Note: Adding new domains is currently retricted to one level only, i.e. `_parentDomainId` has to be the root domain id: `1`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_parentDomainId|uint256|Id of the domain under which the new one will be added
|_metadata|string|Metadata relating to the domain. Expected to be the IPFS hash of a JSON blob, but not enforced by the contracts.


### ▸ `addLocalSkill()`

Add a new local skill for the colony. Secured function to authorised members.




### ▸ `annotateTransaction(bytes32 _txHash, string memory _metadata)`

Emit a metadata string for a transaction


**Parameters**

|Name|Type|Description|
|---|---|---|
|_txHash|bytes32|Hash of transaction being annotated (0x0 for current tx)
|_metadata|string|String of metadata for tx


### ▸ `approveStake(address _approvee, uint256 _domainId, uint256 _amount)`

Allow the _approvee to obligate some amount of tokens as a stake.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_approvee|address|Address of the account we are willing to let obligate us.
|_domainId|uint256|Domain in which we are willing to be obligated.
|_amount|uint256|Amount of internal token up to which we are willing to be obligated.


### ▸ `authority():address colonyAuthority`

Get the `ColonyAuthority` for the colony.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyAuthority|address|The `ColonyAuthority` contract address

### ▸ `bootstrapColony(address[] memory _users, int[] memory _amount)`

Allows the colony to bootstrap itself by having initial reputation and token `_amount` assigned to `_users`. This reputation is assigned in the colony-wide domain. Secured function to authorised members.

*Note: Only allowed to be called when `taskCount` is `0` by authorized addresses.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_users|address[]|Array of address to bootstrap with reputation
|_amount|int[]|Amount of reputation/tokens for every address


### ▸ `burnTokens(address token, uint256 amount)`

Burn tokens held by the colony. Can only burn tokens held in the root funding pot.


**Parameters**

|Name|Type|Description|
|---|---|---|
|token|address|The address of the token to burn
|amount|uint256|The amount of tokens to burn


### ▸ `cancelExpenditure(uint256 _id)`

Cancels the expenditure and prevents further editing. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier


### ▸ `cancelExpenditureViaArbitration(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id)`

Cancels the expenditure and prevents further editing.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`, (only used if `_permissionDomainId` is different to `_domainId`)
|_id|uint256|Expenditure identifier


### ▸ `claimColonyFunds(address _token)`

Move any funds received by the colony in `_token` denomination to the top-level domain pot, siphoning off a small amount to the reward pot. If called against a colony's own token, no fee is taken.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token, `0x0` value indicates Ether


### ▸ `claimDomainFunds(address _token, uint256 _domainId)`

Move any funds received by the colony for a specific domain to that domain's pot Currently no fees are taken


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token, `0x0` value indicates Ether
|_domainId|uint256|Id of the domain


### ▸ `claimExpenditurePayout(uint256 _id, uint256 _slot, address _token)`

This function is deprecated and will be removed in a future version


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier
|_slot|uint256|Number of the slot
|_token|address|Address of the token, `0x0` value indicates Ether


### ▸ `claimExpenditurePayout(uint256 _id, uint256 _slot, uint256 _chainId, address _token)`

Claim the payout for an expenditure slot. Here the network receives a fee from each payout.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier
|_slot|uint256|Number of the slot
|_chainId|uint256|The chainId of the token
|_token|address|Address of the token, `0x0` value indicates Ether


### ▸ `claimRewardPayout(uint256 _payoutId, uint256[7] memory _squareRoots, bytes memory key, bytes memory value, uint256 branchMask, bytes32[] memory siblings)`

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


### ▸ `createProxyColony(uint256 _destinationChainId, bytes32 _salt)`

Create a proxy colony on another chain


**Parameters**

|Name|Type|Description|
|---|---|---|
|_destinationChainId|uint256|Chain id of the destination chain
|_salt|bytes32|The colony creation salt that was used on creation of the colony


### ▸ `deobligateStake(address _user, uint256 _domainId, uint256 _amount)`

Deobligate the user some amount of tokens, releasing the stake.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|Address of the account we are deobligating.
|_domainId|uint256|Domain in which we are deobligating the user.
|_amount|uint256|Amount of internal token we are deobligating.


### ▸ `deprecateDomain(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId, bool _deprecated)`

Deprecate a domain, preventing certain actions from happening there


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_domainId|uint256|Id of the domain being deprecated
|_deprecated|bool|Whether or not the domain is deprecated


### ▸ `deprecateExtension(bytes32 extensionId, bool deprecated)`

Set the deprecation of an extension in a colony. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|extensionId|bytes32|keccak256 hash of the extension name, used as an indentifier
|deprecated|bool|Whether to deprecate the extension or not


### ▸ `deprecateLocalSkill(uint256 localSkillId, bool deprecated)`

Deprecate a local skill for the colony. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|localSkillId|uint256|Id for the local skill
|deprecated|bool|Deprecation status to set for the skill


### ▸ `editAllowedDomainTokenReceipt(uint256 _domainId, address _token, uint256 _amount, bool _add)`

Add or remove an amount from the amount of a reputation earning token that a domain can receive


**Parameters**

|Name|Type|Description|
|---|---|---|
|_domainId|uint256|Id of the domain
|_token|address|Address of the token
|_amount|uint256|Amount to add or remove
|_add|bool|Whether to add or remove the amount. True is add, false is remove


### ▸ `editColony(string memory _metadata)`

Called to change the metadata associated with a colony. Expected to be a IPFS hash of a JSON blob, but not enforced to any degree by the contracts


**Parameters**

|Name|Type|Description|
|---|---|---|
|_metadata|string|IPFS hash of the metadata


### ▸ `editColonyByDelta(string memory _metadataDelta)`

Called to change the metadata associated with a colony. Expected to be a IPFS hash of a delta to a JSON blob, but not enforced to any degree by the contracts


**Parameters**

|Name|Type|Description|
|---|---|---|
|_metadataDelta|string|IPFS hash of the metadata delta


### ▸ `editDomain(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId, string memory _metadata)`

Add a colony domain, and its respective local skill under skill with id `_parentSkillId`. New funding pot is created and associated with the domain here.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_domainId|uint256|Id of the domain being edited
|_metadata|string|Metadata relating to the domain. Expected to be the IPFS hash of a JSON blob, but not enforced by the contracts.


### ▸ `emitDomainReputationPenalty(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId, address _user, int256 _amount)`

Emit a negative domain reputation update. Available only to Arbitration role holders


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I hold the Arbitration role
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_domainId|uint256|The domain where the user will lose reputation
|_user|address|The user who will lose reputation
|_amount|int256|The (negative) amount of reputation to lose


### ▸ `emitDomainReputationReward(uint256 _domainId, address _user, int256 _amount)`

Emit a positive domain reputation update. Available only to Root role holders


**Parameters**

|Name|Type|Description|
|---|---|---|
|_domainId|uint256|The domain where the user will gain reputation
|_user|address|The user who will gain reputation
|_amount|int256|The (positive) amount of reputation to gain


### ▸ `emitSkillReputationPenalty(uint256 _skillId, address _user, int256 _amount)`

Emit a negative skill reputation update. Available only to Arbitration role holders in the root domain


**Parameters**

|Name|Type|Description|
|---|---|---|
|_skillId|uint256|The skill where the user will lose reputation
|_user|address|The user who will lose reputation
|_amount|int256|The (negative) amount of reputation to lose


### ▸ `emitSkillReputationReward(uint256 _skillId, address _user, int256 _amount)`

Emit a positive skill reputation update. Available only to Root role holders


**Parameters**

|Name|Type|Description|
|---|---|---|
|_skillId|uint256|The skill where the user will gain reputation
|_user|address|The user who will gain reputation
|_amount|int256|The (positive) amount of reputation to gain


### ▸ `exchangeProxyHeldTokensViaLiFi(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId, bytes memory _txdata, uint256 _value, uint256 _chainId, address _token, uint256 _amount)`

Exchange funds between two tokens, potentially between chains The tokens being swapped are held by a proxy contract


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The child index in `_permissionDomainId` where we can find `_domainId`
|_domainId|uint256|Id of the domain
|_txdata|bytes|Transaction data for the exchange
|_value|uint256|Value of the transaction
|_chainId|uint256|The chainId of the token
|_token|address|Address of the token. If the native token is being swapped, can be anything and _amount should be 0.
|_amount|uint256|Amount of tokens to exchange


### ▸ `exchangeTokensViaLiFi(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId, bytes memory _txdata, uint256 _value, address _token, uint256 _amount)`

Exchange funds between two tokens, potentially between chains


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The child index in `_permissionDomainId` where we can find `_domainId`
|_domainId|uint256|Id of the domain
|_txdata|bytes|Transaction data for the exchange
|_value|uint256|Value of the transaction
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Amount of tokens to exchange


### ▸ `finalizeExpenditure(uint256 _id)`

Finalizes the expenditure and allows for funds to be claimed. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier


### ▸ `finalizeExpenditureViaArbitration(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id)`

Finalizes the expenditure and allows for funds to be claimed. Can only be called by Arbitration role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`,
|_id|uint256|Expenditure identifier


### ▸ `finalizeRewardPayout(uint256 _payoutId)`

Finalises the reward payout. Allows creation of next reward payouts for token that has been used in `_payoutId`. Can only be called when reward payout cycle is finished i.e when 60 days have passed from its creation.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_payoutId|uint256|Id of the reward payout


### ▸ `finishUpgrade()`

A function to be called after an upgrade has been done from v2 to v3.

*Note: Can only be called by the colony itself, and only expected to be called as part of the `upgrade()` call. Required to be external so it can be an external call.*



### ▸ `getAllowedDomainTokenReceipt(uint256 _domainId, address _token):uint256 uint256`

Get the amount of a reputation earning token that a domain can receive


**Parameters**

|Name|Type|Description|
|---|---|---|
|_domainId|uint256|Id of the domain
|_token|address|Address of the token

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|uint256|uint256|amount Amount of the token that the domain can receive

### ▸ `getApproval(address _user, address _obligator, uint256 _domainId):uint256 approval`

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

### ▸ `getCapabilityRoles(bytes4 _sig):bytes32 roles`

Gets the bytes32 representation of the roles authorized to call a function


**Parameters**

|Name|Type|Description|
|---|---|---|
|_sig|bytes4|The function signature

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|roles|bytes32|bytes32 representation of the authorized roles

### ▸ `getColonyNetwork():address colonyNetwork`

Returns the colony network address set on the Colony.

*Note: The colonyNetworkAddress we read here is set once, during `initialiseColony`.*


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyNetwork|address|The address of Colony Network instance

### ▸ `getDomain(uint256 _id):Domain domain`

Get a domain by id.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the domain which details to get

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|domain|Domain|The domain

### ▸ `getDomainCount():uint256 count`

Get the number of domains in the colony.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The domain count. Min 1 as the root domain is created at the same time as the colony

### ▸ `getDomainFromFundingPot(uint256 _fundingPotId):uint256 domainId`

Get the domain corresponding to a funding pot


**Parameters**

|Name|Type|Description|
|---|---|---|
|_fundingPotId|uint256|Id of the funding pot

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|domainId|uint256|Id of the corresponding domain

### ▸ `getExpenditure(uint256 _id):Expenditure expenditure`

Returns an existing expenditure.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|expenditure|Expenditure|The expenditure

### ▸ `getExpenditureCount():uint256 count`

Get the number of expenditures in the colony.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The expenditure count

### ▸ `getExpenditureSlot(uint256 _id, uint256 _slot):ExpenditureSlot expenditureSlot`

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

### ▸ `getExpenditureSlotPayout(uint256 _id, uint256 _slot, address _token):uint256 amount`

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

### ▸ `getFundingPot(uint256 _id):FundingPotAssociatedType associatedType, uint256 associatedTypeId, uint256 payoutsWeCannotMake`

Get the non-mapping properties of a pot by id.

*Note: For the reward funding pot (e.g. id: 0) this returns (0, 0, 0).*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the pot which details to get

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|associatedType|FundingPotAssociatedType|The FundingPotAssociatedType value of the current funding pot, e.g. Domain, Expenditure
|associatedTypeId|uint256|Id of the associated type, e.g. if associatedType = FundingPotAssociatedType.Domain, this refers to the domainId
|payoutsWeCannotMake|uint256|Number of payouts that cannot be completed with the current funding

### ▸ `getFundingPotBalance(uint256 _potId, address _token):uint256 balance`

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

### ▸ `getFundingPotCount():uint256 count`

Get the number of funding pots in the colony.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The funding pots count

### ▸ `getFundingPotPayout(uint256 _potId, address _token):uint256 payout`

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

### ▸ `getFundingPotProxyBalance(uint256 _potId, uint256 _chainId, address _token):uint256 balance`

Get the balance of a funding pot for a specific token on a specific chain


**Parameters**

|Name|Type|Description|
|---|---|---|
|_potId|uint256|Id of the funding pot
|_chainId|uint256|Chain id of the token
|_token|address|Address of the token, `0x0` value indicates Ether

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|balance|uint256|Balance of the funding pot

### ▸ `getLocalSkill(uint256 localSkillId):LocalSkill localSkill`

Get the local skill


**Parameters**

|Name|Type|Description|
|---|---|---|
|localSkillId|uint256|Id for the local skill

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|localSkill|LocalSkill|The local skill

### ▸ `getNonRewardPotsTotal(address _token):uint256 amount`

Get the total amount of tokens `_token` minus amount reserved to be paid to the reputation and token holders as rewards.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token, `0x0` value indicates Ether

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|amount|uint256|Total amount of tokens in funding pots other than the rewards pot (id 0)

### ▸ `getObligation(address _user, address _obligator, uint256 _domainId):uint256 obligation`

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

### ▸ `getPayment(uint256 _id):Payment payment`

Returns an exiting payment.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Payment identifier

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|payment|Payment|The Payment data structure

### ▸ `getPaymentCount():uint256 count`

Get the number of payments in the colony.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The payment count

### ▸ `getRewardInverse():uint256 rewardInverse`

Return 1 / the reward to pay out from revenue. e.g. if the fee is 1% (or 0.01), return 100.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|rewardInverse|uint256|The inverse of the reward

### ▸ `getRewardPayoutInfo(uint256 _payoutId):RewardPayoutCycle rewardPayoutCycle`

Get useful information about specific reward payout.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_payoutId|uint256|Id of the reward payout

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|rewardPayoutCycle|RewardPayoutCycle|RewardPayoutCycle, containing propertes:  `reputationState` Reputation root hash at the time of creation,  `colonyWideReputation` Colony wide reputation in `reputationState`,  `totalTokens` Total colony tokens at the time of creation,  `amount` Total amount of tokens taken aside for reward payout,  `tokenAddress` Token address,  `blockTimestamp` Block number at the time of creation.

### ▸ `getRootLocalSkill():uint256 rootLocalSkill`

Get the root local skill id



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|rootLocalSkill|uint256|The root local skill id

### ▸ `getTask(uint256 _id):bytes32 specificationHash, bytes32 deliverableHash, TaskStatus status, uint256 dueDate, uint256 fundingPotId, uint256 completionTimestamp, uint256 domainId, uint256[] skillIds`

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

### ▸ `getTaskChangeNonce(uint256 _id):uint256 nonce`

Starts from 0 and is incremented on every co-reviewed task change via `executeTaskChange` call.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the task

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nonce|uint256|The current task change nonce value

### ▸ `getTaskCount():uint256 count`

Get the number of tasks in the colony.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The task count

### ▸ `getTaskRole(uint256 _id, uint8 _role):Role role`

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

### ▸ `getTaskWorkRatingSecret(uint256 _id, uint8 _role):bytes32 secret`

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

### ▸ `getTaskWorkRatingSecretsInfo(uint256 _id):uint256 nSecrets, uint256 lastSubmittedAt`

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

### ▸ `getToken():address tokenAddress`

Get the colony token.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|tokenAddress|address|Address of the token contract

### ▸ `getTokenApproval(address token, address spender):uint256 amount`

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

### ▸ `getTotalTokenApproval(address token):uint256 amount`

Get the current total approval amount across all spenders


**Parameters**

|Name|Type|Description|
|---|---|---|
|token|address|The address of the token which was approved

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|amount|uint256|The total token approval amount

### ▸ `getUserRoles(address _user, uint256 _domain):bytes32 roles`

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

### ▸ `hasInheritedUserRole(address _user, uint256 _domainId, ColonyRole _role, uint256 _childSkillIndex, uint256 _childDomainId):bool hasRole`

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

### ▸ `hasUserRole(address _user, uint256 _domainId, ColonyRole _role):bool hasRole`

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

### ▸ `initialiseColony(address _colonyNetworkAddress, address _token)`

Called once when the colony is created to initialise certain storage slot values.

*Note: Sets the reward inverse to the uint max 2**256 - 1.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_colonyNetworkAddress|address|Address of the colony network
|_token|address|Address of the colony ERC20 Token


### ▸ `initialiseRootLocalSkill()`

Initialise the local skill tree for the colony.




### ▸ `installExtension(bytes32 extensionId, uint256 version)`

Install an extension to the colony. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|extensionId|bytes32|keccak256 hash of the extension name, used as an indentifier
|version|uint256|The new extension version to install


### ▸ `lockExpenditure(uint256 _id)`

Locks the expenditure and prevents further editing. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier


### ▸ `lockToken():uint256 timesLocked`

Lock the colony's token. Can only be called by a network-managed extension.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|timesLocked|uint256|The amount of times the token was locked

### ▸ `makeArbitraryTransaction(address _to, bytes memory _action):bool success`

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

### ▸ `makeArbitraryTransactions(address[] memory _targets, bytes[] memory _actions, bool _strict):bool success`

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

### ▸ `makeExpenditure(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId):uint256 expenditureId`

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

### ▸ `makeProxyArbitraryTransactions(uint256 chainId, address[] memory _destinations, bytes[] memory _actions)`

Execute arbitrary transactions on behalf of the Colony via a proxy colony on another chain

*Note: If proxy colony not already deployed, will do nothing*

**Parameters**

|Name|Type|Description|
|---|---|---|
|chainId|uint256|The chainId of the proxy colony
|_destinations|address[]|Array of addresses to be targeted
|_actions|bytes[]|Array of Bytes arrays encoding the function calls and arguments


### ▸ `makeSingleArbitraryTransaction(address _target, bytes memory _action):bool success`

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

### ▸ `mintTokens(uint256 _wad)`

Mint `_wad` amount of colony tokens. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_wad|uint256|Amount to mint


### ▸ `mintTokensFor(address _guy, uint256 _wad)`

Mint `_wad` amount of colony tokens and send to `_guy`. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_guy|address|Recipient of new tokens
|_wad|uint256|Amount to mint


### ▸ `moveFundsBetweenPots(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId, uint256 _fromChildSkillIndex, uint256 _toChildSkillIndex, uint256 _fromPot, uint256 _toPot, uint256 _amount, address _token)`

Move a given amount: `_amount` of `_token` funds from funding pot with id `_fromPot` to one with id `_toPot`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The child index in _permissionDomainId where I will be taking this action
|_domainId|uint256|The domain where I am taking this action, pointed to by _permissionDomainId and _childSkillIndex
|_fromChildSkillIndex|uint256|In the array of child skills for the skill associated with the domain pointed to by _permissionDomainId + _childSkillIndex,         the index of the skill associated with the domain that contains _fromPot
|_toChildSkillIndex|uint256|The same, but for the _toPot which the funds are being moved to
|_fromPot|uint256|Funding pot id providing the funds
|_toPot|uint256|Funding pot id receiving the funds
|_amount|uint256|Amount of funds
|_token|address|Address of the token, `0x0` value indicates Ether


### ▸ `moveFundsBetweenPots(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId, uint256 _fromChildSkillIndex, uint256 _toChildSkillIndex, uint256 _fromPot, uint256 _toPot, uint256 _amount, uint256 _chainId, address _token)`

Move a given amount: `_amount` of `_token` funds from funding pot with id `_fromPot` to one with id `_toPot`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The child index in _permissionDomainId where I will be taking this action
|_domainId|uint256|The domain where I am taking this action, pointed to by _permissionDomainId and _childSkillIndex
|_fromChildSkillIndex|uint256|In the array of child skills for the skill associated with the domain pointed to by _permissionDomainId + _childSkillIndex,         the index of the skill associated with the domain that contains _fromPot
|_toChildSkillIndex|uint256|The same, but for the _toPot which the funds are being moved to
|_fromPot|uint256|Funding pot id providing the funds
|_toPot|uint256|Funding pot id receiving the funds
|_amount|uint256|Amount of funds
|_chainId|uint256|The chainId of the token
|_token|address|Address of the token, `0x0` value indicates Ether


### ▸ `moveFundsBetweenPots(uint256 _permissionDomainId, uint256 _fromChildSkillIndex, uint256 _toChildSkillIndex, uint256 _fromPot, uint256 _toPot, uint256 _amount, address _token)`

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


### ▸ `obligateStake(address _user, uint256 _domainId, uint256 _amount)`

Obligate the user some amount of tokens as a stake.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|Address of the account we are obligating.
|_domainId|uint256|Domain in which we are obligating the user.
|_amount|uint256|Amount of internal token we are obligating.


### ▸ `owner():address colonyOwner`

Get the colony `owner` address. This should be address(0x0) at all times.

*Note: Used for testing.*


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyOwner|address|Address of the colony owner

### ▸ `recordClaimedFundsFromBridge(uint256 _chainId, address _token, uint256 _domainId, uint256 _amount)`

Used by the bridge to indicate that funds have been claimed on another chain.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_chainId|uint256|Chain id of the chain where the funds were claimed
|_token|address|Address of the token, `0x0` value indicates Ether
|_domainId|uint256|Id of the domain where the funds were claimed
|_amount|uint256|Amount of funds claimed


### ▸ `registerColonyLabel(string memory colonyName, string memory orbitdb)`

Register colony's ENS label.


**Parameters**

|Name|Type|Description|
|---|---|---|
|colonyName|string|The label to register.
|orbitdb|string|The path of the orbitDB database associated with the colony name


### ▸ `setAdministrationRole(uint256 _permissionDomainId, uint256 _childSkillIndex, address _user, uint256 _domainId, bool _setTo)`

Set new colony admin role. Can be called by root role or architecture role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|Domain in which the caller has root/architecture role
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_user|address|User we want to give an admin role to
|_domainId|uint256|Domain in which we are giving user the role
|_setTo|bool|The state of the role permission (true assign the permission, false revokes it)


### ▸ `setArbitrationRole(uint256 _permissionDomainId, uint256 _childSkillIndex, address _user, uint256 _domainId, bool _setTo)`

Set new colony arbitration role. Can be called by root role or architecture role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|Domain in which the caller has root role
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_user|address|User we want to give an arbitration role to
|_domainId|uint256|Domain in which we are giving user the role
|_setTo|bool|The state of the role permission (true assign the permission, false revokes it)


### ▸ `setArchitectureRole(uint256 _permissionDomainId, uint256 _childSkillIndex, address _user, uint256 _domainId, bool _setTo)`

Set new colony architecture role. Can be called by root role or architecture role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|Domain in which the caller has root/architecture role
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_user|address|User we want to give an architecture role to
|_domainId|uint256|Domain in which we are giving user the role
|_setTo|bool|The state of the role permission (true assign the permission, false revokes it)


### ▸ `setDefaultGlobalClaimDelay(uint256 _globalClaimDelay)`

Update the default global claim delay for expenditures


**Parameters**

|Name|Type|Description|
|---|---|---|
|_globalClaimDelay|uint256|The new default global claim delay


### ▸ `setExpenditureClaimDelay(uint256 _id, uint256 _slot, uint256 _claimDelay)`

Sets the claim delay on an expenditure slot. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier
|_slot|uint256|Number of the slot
|_claimDelay|uint256|Duration of time (in seconds) to delay


### ▸ `setExpenditureClaimDelays(uint256 _id, uint256[] memory _slots, uint256[] memory _claimDelays)`

Sets the claim delays in given expenditure slots. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier
|_slots|uint256[]|Array of slots to set claim delays
|_claimDelays|uint256[]|Durations of time (in seconds) to delay


### ▸ `setExpenditureMetadata(uint256 _id, string memory _metadata)`

Sets the metadata for an expenditure. Can only be called by expenditure owner.

*Note: Can only be called while expenditure is in draft state.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the expenditure
|_metadata|string|IPFS hash of the metadata


### ▸ `setExpenditureMetadata(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id, string memory _metadata)`

Sets the metadata for an expenditure. Can only be called by Arbitration role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`,
|_id|uint256|Id of the expenditure
|_metadata|string|IPFS hash of the metadata


### ▸ `setExpenditurePayout(uint256 _id, uint256 _slot, address _token, uint256 _amount)`

Set the token payout on an expenditure slot. Can only be called by expenditure owner.

*Note: Can only be called while expenditure is in draft state.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the expenditure
|_slot|uint256|Number of the slot
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Payout amount


### ▸ `setExpenditurePayout(uint256 _id, uint256 _slot, uint256 _chainId, address _token, uint256 _amount)`

Set the token payout on an expenditure slot. Can only be called by expenditure owner.

*Note: Can only be called while expenditure is in draft state.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the expenditure
|_slot|uint256|Number of the slot
|_chainId|uint256|The chainId of the token
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Payout amount


### ▸ `setExpenditurePayout(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id, uint256 _slot, address _token, uint256 _amount)`

This function is deprecated and will be removed in a future version


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_id|uint256|Id of the expenditure
|_slot|uint256|The slot to set the payout
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Payout amount


### ▸ `setExpenditurePayout(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id, uint256 _slot, uint256 _chainId, address _token, uint256 _amount)`

Set the token payout in a given expenditure slot. Can only be called by an Arbitration user.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_id|uint256|Id of the expenditure
|_slot|uint256|The slot to set the payout
|_chainId|uint256|The chainId of the token
|_token|address|Address of the token, `0x0` value indicates Ether
|_amount|uint256|Payout amount


### ▸ `setExpenditurePayoutModifiers(uint256 _id, uint256[] memory _slots, int256[] memory _payoutModifiers)`

Sets the payout modifiers in given expenditure slots. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier
|_slots|uint256[]|Array of slots to set payout modifiers
|_payoutModifiers|int256[]|Values (between +/- WAD) to modify the payout & reputation bonus


### ▸ `setExpenditurePayouts(uint256 _id, uint256[] memory _slots, address _token, uint256[] memory _amounts)`

Set the token payouts in given expenditure slots. Can only be called by expenditure owner.

*Note: Can only be called while expenditure is in draft state.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the expenditure
|_slots|uint256[]|Array of slots to set payouts
|_token|address|Address of the token, `0x0` value indicates Ether
|_amounts|uint256[]|Payout amounts


### ▸ `setExpenditureRecipient(uint256 _id, uint256 _slot, address _recipient)`

Sets the recipient on an expenditure slot. Can only be called by expenditure owner.

*Note: Can only be called while expenditure is in draft state.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the expenditure
|_slot|uint256|Slot for the recipient address
|_recipient|address|Address of the recipient


### ▸ `setExpenditureRecipients(uint256 _id, uint256[] memory _slots, address[] memory _recipients)`

Sets the recipients in given expenditure slots. Can only be called by expenditure owner.

*Note: Can only be called while expenditure is in draft state.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Id of the expenditure
|_slots|uint256[]|Array of slots to set recipients
|_recipients|address[]|Addresses of the recipients


### ▸ `setExpenditureSkill(uint256 _id, uint256 _slot, uint256 _skillId)`

Sets the skill on an expenditure slot. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier
|_slot|uint256|Number of the slot
|_skillId|uint256|Id of the new skill to set


### ▸ `setExpenditureSkills(uint256 _id, uint256[] memory _slots, uint256[] memory _skillIds)`

Sets the skill on an expenditure slot. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier
|_slots|uint256[]|Array of slots to set skills
|_skillIds|uint256[]|Ids of the new skills to set


### ▸ `setExpenditureState(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id, uint256 _storageSlot, bool[] memory _mask, bytes32[] memory _keys, bytes32 _value)`

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


### ▸ `setFundingRole(uint256 _permissionDomainId, uint256 _childSkillIndex, address _user, uint256 _domainId, bool _setTo)`

Set new colony funding role. Can be called by root role or architecture role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|Domain in which the caller has root/architecture role
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_user|address|User we want to give an funding role to
|_domainId|uint256|Domain in which we are giving user the role
|_setTo|bool|The state of the role permission (true assign the permission, false revokes it)


### ▸ `setRewardInverse(uint256 _rewardInverse)`

Set the reward inverse to pay out from revenue. e.g. if the fee is 1% (or 0.01), set 100.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_rewardInverse|uint256|The inverse of the reward


### ▸ `setRootRole(address _user, bool _setTo)`

Set new colony root role. Can be called by root role only.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|User we want to give an root role to
|_setTo|bool|The state of the role permission (true assign the permission, false revokes it)


### ▸ `setUserRoles(uint256 _permissionDomainId, uint256 _childSkillIndex, address _user, uint256 _domainId, bytes32 _roles)`

Set several roles in one transaction. Can be called by root role or architecture role.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|Domain in which the caller has root/architecture role
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`
|_user|address|User we want to give a role to
|_domainId|uint256|Domain in which we are giving user the role
|_roles|bytes32|Byte array representing the desired role setting (1 for on, 0 for off)


### ▸ `startNextRewardPayout(address _token, bytes memory key, bytes memory value, uint256 branchMask, bytes32[] memory siblings)`

Add a new payment in the colony. Can only be called by users with root permission. All tokens will be locked, and can be unlocked by calling `waiveRewardPayout` or `claimRewardPayout`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|Address of the token used for reward payout
|key|bytes|Some Reputation hash tree key
|value|bytes|Reputation value
|branchMask|uint256|The branchmask of the proof
|siblings|bytes32[]|The siblings of the proof


### ▸ `transferExpenditure(uint256 _id, address _newOwner)`

Updates the expenditure owner. Can only be called by expenditure owner.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|Expenditure identifier
|_newOwner|address|New owner of expenditure


### ▸ `transferExpenditureViaArbitration(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id, address _newOwner)`

Updates the expenditure owner. Can only be called by Arbitration role.

*Note: This is now deprecated and will be removed in a future version*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_domainId` is relative to `_permissionDomainId`, (only used if `_permissionDomainId` is different to `_domainId`)
|_id|uint256|Expenditure identifier
|_newOwner|address|New owner of expenditure


### ▸ `transferStake(uint256 _permissionDomainId, uint256 _childSkillIndex, address _obligator, address _user, uint256 _domainId, uint256 _amount, address _recipient)`

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


### ▸ `uninstallExtension(bytes32 extensionId)`

Uninstall an extension from a colony. Secured function to authorised members.

*Note: This is a permanent action -- re-installing the extension will deploy a new contract*

**Parameters**

|Name|Type|Description|
|---|---|---|
|extensionId|bytes32|keccak256 hash of the extension name, used as an indentifier


### ▸ `unlockToken()`

unlock the native colony token, if possible




### ▸ `unlockTokenForUser(address user, uint256 lockId)`

Unlock the colony's token for a user. Can only be called by a network-managed extension.


**Parameters**

|Name|Type|Description|
|---|---|---|
|user|address|The user to unlock
|lockId|uint256|The specific lock to unlock


### ▸ `updateApprovalAmount(address token, address spender)`

Update the internal bookkeeping around external ERC20 approvals


**Parameters**

|Name|Type|Description|
|---|---|---|
|token|address|The address of the token which was approved
|spender|address|The account we have approved


### ▸ `updateColonyOrbitDB(string memory orbitdb)`

Update a colony's orbitdb address. Can only be called by a colony with a registered subdomain


**Parameters**

|Name|Type|Description|
|---|---|---|
|orbitdb|string|The path of the orbitDB database to be associated with the colony


### ▸ `upgrade(uint _newVersion)`

Upgrades a colony to a new Colony contract version `_newVersion`.

*Note: Downgrades are not allowed, i.e. `_newVersion` should be higher than the currect colony version.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_newVersion|uint|The target version for the upgrade


### ▸ `upgradeExtension(bytes32 extensionId, uint256 newVersion)`

Upgrade an extension in a colony. Secured function to authorised members.


**Parameters**

|Name|Type|Description|
|---|---|---|
|extensionId|bytes32|keccak256 hash of the extension name, used as an indentifier
|newVersion|uint256|The version to upgrade to (must be one larger than the current version)


### ▸ `userCanSetRoles(address _user, uint256 _domainId, uint256 _childSkillIndex, uint256 _childDomainId):bool canSet`

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

### ▸ `validateDomainInheritance(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _childDomainId):bool valid`

Evaluates a "domain proof" which checks that childDomainId is part of the subtree starting at permissionDomainId


**Parameters**

|Name|Type|Description|
|---|---|---|
|_permissionDomainId|uint256|The domainId in which I have the permission to take this action
|_childSkillIndex|uint256|The index that the `_childDomainId` is relative to `_permissionDomainId`
|_childDomainId|uint256|The domainId which some action is taking place in that requires the permission that is held in _permissionDomainId

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|valid|bool|True if the proof is valid, false otherwise.

### ▸ `verifyReputationProof(bytes memory key, bytes memory value, uint256 branchMask, bytes32[] memory siblings):bool isValid`

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

### ▸ `version():uint256 colonyVersion`

Get the Colony contract version. Starts from 1 and is incremented with every deployed contract change.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyVersion|uint256|Version number