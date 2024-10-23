# Motions & Disputes Extension (`VotingReputation`)

This extension allows any member of your colony to propose a Motion to take an Action that will pass after a security delay unless somebody Objects. This applies to all Actions, such as creating an expenditure, managing funds, or managing teams.

_This is a Colony Extension which conforms to the extension interface found [here](icolonyextension.md)._

  
## Interface Methods

### ▸ `claimMisalignedReward(uint256 _motionId, uint256 _permissionDomainId, uint256 _childSkillIndex, address _staker, uint256 _vote)`

Claim the staker's reward from a motion that was created with v4 of the extension, and is now missing and cannot be interacted with via the normal claim function.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion
|_permissionDomainId|uint256|The domain where the extension has the arbitration permission
|_childSkillIndex|uint256|For the domain in which the motion is occurring
|_staker|address|The staker whose reward is being claimed
|_vote|uint256|The side being supported (0 = NAY, 1 = YAY)


### ▸ `claimReward(uint256 _motionId, uint256 _permissionDomainId, uint256 _childSkillIndex, address _staker, uint256 _vote)`

Claim the staker's reward


**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion
|_permissionDomainId|uint256|The domain where the extension has the arbitration permission
|_childSkillIndex|uint256|For the domain in which the motion is occurring
|_staker|address|The staker whose reward is being claimed
|_vote|uint256|The side being supported (0 = NAY, 1 = YAY)


### ▸ `createMotion(uint256 _domainId, uint256 _childSkillIndex, address _altTarget, bytes memory _action, bytes memory _key, bytes memory _value, uint256 _branchMask, bytes32[] memory _siblings)`

Create a motion


**Parameters**

|Name|Type|Description|
|---|---|---|
|_domainId|uint256|The domain where we vote on the motion
|_childSkillIndex|uint256|The childSkillIndex pointing to the domain of the action
|_altTarget|address|The contract to which we send the action (0x0 for the colony)
|_action|bytes|A bytes array encoding a function call
|_key|bytes|Reputation tree key for the root domain
|_value|bytes|Reputation tree value for the root domain
|_branchMask|uint256|The branchmask of the proof
|_siblings|bytes32[]|The siblings of the proof


### ▸ `deprecate(bool _deprecated)`

Called when deprecating (or undeprecating) the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_deprecated|bool|Indicates whether the extension should be deprecated or undeprecated


### ▸ `escalateMotion(uint256 _motionId, uint256 _newDomainId, uint256 _childSkillIndex, bytes memory _key, bytes memory _value, uint256 _branchMask, bytes32[] memory _siblings)`

Escalate a motion to a higher domain


**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion
|_newDomainId|uint256|The desired domain of escalation
|_childSkillIndex|uint256|For the current domain, relative to the escalated domain
|_key|bytes|Reputation tree key for the new domain
|_value|bytes|Reputation tree value for the new domain
|_branchMask|uint256|The branchmask of the proof
|_siblings|bytes32[]|The siblings of the proof


### ▸ `executeMetaTransaction(address userAddress, bytes memory payload, bytes32 sigR, bytes32 sigS, uint8 sigV):bytes returnData`

Executes a metatransaction targeting this contract


**Parameters**

|Name|Type|Description|
|---|---|---|
|userAddress|address|The address of the user that signed the metatransaction
|payload|bytes|The transaction data that will be executed if signature valid
|sigR|bytes32|The 'r' part of the signature
|sigS|bytes32|The 's' part of the signature
|sigV|uint8|The 'v' part of the signature

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|returnData|bytes|The return data of the executed transaction

### ▸ `failingExecutionAllowed(uint256 _motionId):bool _allowed`

Return whether a motion, assuming it's in the finalizable state, is allowed to finalize without the call executing successfully.

*Note: We are only expecting this to be called from finalize motion in the contracts. It is marked as external only so that the frontend can use it.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_allowed|bool|If motion is allowed to finalize without successful action

### ▸ `finalizeMotion(uint256 _motionId)`

Finalized a motion, executing its action if appropriate


**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion to finalize


### ▸ `finalizeMotionWithoutFailure(uint256 _motionId)`

Finalize a motion, executing its action if appropriate, without the call executing successfully


**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion to finalize


### ▸ `finishUpgrade()`

A function to be called after an upgrade has been done from v2 to v3.

*Note: Can only be called by the colony itself, and only expected to be called as part of the `upgrade()` call. Required to be external so it can be an external call.*



### ▸ `getActionSummary(bytes memory _action, address _altTarget):ActionSummary _summary`

Return a summary of the multicall action


**Parameters**

|Name|Type|Description|
|---|---|---|
|_action|bytes|The id of the motion
|_altTarget|address|The address of the altTarget, or 0x0 if none exists

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_summary|ActionSummary|A summary of the multicall

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

### ▸ `getColony():address colony`

Gets the address of the extension's colony



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colony|address|The address of the colony

### ▸ `getDeprecated():bool deprecated`

Gets the boolean indicating whether or not the extension is deprecated



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|deprecated|bool|Boolean indicating whether or not the extension is deprecated

### ▸ `getEscalationPeriod():uint256 _period`

Get the escalation period



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_period|uint256|The escalation period

### ▸ `getExpenditureMotionCount(bytes32 _structHash):uint256 _count`

DEPRECATED Get the count of active motions for an expenditure slot


**Parameters**

|Name|Type|Description|
|---|---|---|
|_structHash|bytes32|Hash of an expenditure id and slot

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_count|uint256|Number of motions

### ▸ `getExpenditureMotionLock(uint256 _expenditureId):uint256 _motionId`

Get the motion which holds the lock on an expenditure


**Parameters**

|Name|Type|Description|
|---|---|---|
|_expenditureId|uint256|The expenditureId

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The motion holding the lock

### ▸ `getExpenditurePastVote(uint256 _expenditureId):uint256 _vote`

Get the largest past vote on an expenditure

*Note: The previous version of this function which took an actionHash has been deprecated*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_expenditureId|uint256|The expenditureId

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_vote|uint256|The largest past vote on this variable

### ▸ `getExpenditurePastVotes_DEPRECATED(bytes32 _slotSignature):uint256 _vote`

DEPRECATED Get the largest past vote on an expenditure

*Note: This is deprecated, and allows visibility on to this variable for any v9 motions that are still ongoing.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_slotSignature|bytes32|The slot signature

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_vote|uint256|The largest past vote on this variable

### ▸ `getMaxVoteFraction():uint256 _fraction`

Get the max vote fraction



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_fraction|uint256|The max vote fraction

### ▸ `getMetatransactionNonce(address userAddress):uint256 nonce`

Gets the next metatransaction nonce for user that should be used targeting this contract


**Parameters**

|Name|Type|Description|
|---|---|---|
|userAddress|address|The address of the user that will sign the metatransaction

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nonce|uint256|The nonce that should be used for the next metatransaction

### ▸ `getMotion(uint256 _motionId):Motion _motion`

Get the data for a single motion


**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_motion|Motion|The motion struct

### ▸ `getMotionCount():uint256 _count`

Get the total motion count



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_count|uint256|The total motion count

### ▸ `getMotionState(uint256 _motionId):MotionState _motionState`

Get the current state of the motion


**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_motionState|MotionState|The current motion state

### ▸ `getRevealPeriod():uint256 _period`

Get the reveal period



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_period|uint256|The reveal period

### ▸ `getStake(uint256 _motionId, address _staker, uint256 _vote):uint256 _stake`

Get a user's stake on a motion


**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion
|_staker|address|The staker address
|_vote|uint256|The side being supported (0 = NAY, 1 = YAY)

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_stake|uint256|The user's stake

### ▸ `getStakePeriod():uint256 _period`

Get the stake period



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_period|uint256|The stake period

### ▸ `getStakerReward(uint256 _motionId, address _staker, uint256 _vote):uint256 _reward, uint256 _penalty`

Get the staker reward


**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion
|_staker|address|The staker's address
|_vote|uint256|The vote (0 = NAY, 1 = YAY)

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_reward|uint256|The staker reward (if any)
|_penalty|uint256|The reputation penalty (if any)

### ▸ `getSubmitPeriod():uint256 _period`

Get the submit period



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_period|uint256|The submit period

### ▸ `getTotalStakeFraction():uint256 _fraction`

Get the total stake fraction



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_fraction|uint256|The total stake fraction

### ▸ `getUserMinStakeFraction():uint256 _fraction`

Get the user min stake fraction



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_fraction|uint256|The user min stake fraction

### ▸ `getVoterReward(uint256 _motionId, uint256 _voterRep):uint256 _reward`

Get the voter reward

*Note: This function will only return an accurate value if in the reveal state. Otherwise, use getVoterRewardRange*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion
|_voterRep|uint256|The reputation the voter has in the domain

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_reward|uint256|The voter reward

### ▸ `getVoterRewardFraction():uint256 _fraction`

Get the voter reward fraction



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_fraction|uint256|The voter reward fraction

### ▸ `getVoterRewardRange(uint256 _motionId, uint256 _voterRep, address _voterAddress):uint256 _rewardMin, uint256 _rewardMax`

Get the range of potential rewards for a voter on a specific motion, intended to be used when the motion is in the reveal state. Once a motion is in the reveal state and the reward is known, getVoterReward should be used.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion
|_voterRep|uint256|The reputation the voter has in the domain
|_voterAddress|address|The address the user will be voting as

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_rewardMin|uint256|The voter reward range lower bound
|_rewardMax|uint256|The voter reward range upper bound

### ▸ `identifier():bytes32 identifier`

Returns the identifier of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|identifier|bytes32|The extension's identifier

### ▸ `initialise(uint256 _totalStakeFraction, uint256 _voterRewardFraction, uint256 _userMinStakeFraction, uint256 _maxVoteFraction, uint256 _stakePeriod, uint256 _submitPeriod, uint256 _revealPeriod, uint256 _escalationPeriod)`

Initialise the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_totalStakeFraction|uint256|The fraction of the domain's reputation we need to stake
|_voterRewardFraction|uint256|The fraction of the total stake paid out to voters as rewards
|_userMinStakeFraction|uint256|The minimum per-user stake as fraction of total stake
|_maxVoteFraction|uint256|The fraction of the domain's reputation which must submit for quick-end
|_stakePeriod|uint256|The length of the staking period in seconds
|_submitPeriod|uint256|The length of the submit period in seconds
|_revealPeriod|uint256|The length of the reveal period in seconds
|_escalationPeriod|uint256|The length of the escalation period in seconds


### ▸ `install(address _colony)`

Configures the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_colony|address|The colony in which the extension holds permissions


### ▸ `multicall(bytes[] calldata _data):bytes[] results`

Call multiple functions in the current contract and return the data from all of them if they all succeed

*Note: The `msg.value` should not be trusted for any method callable from multicall.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_data|bytes[]|The encoded function data for each of the calls to make to this contract

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|results|bytes[]|The results from each of the calls passed in via data

### ▸ `revealVote(uint256 _motionId, bytes32 _salt, uint256 _vote, bytes memory _key, bytes memory _value, uint256 _branchMask, bytes32[] memory _siblings)`

Reveal a vote secret for a motion


**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion
|_salt|bytes32|The salt used to hash the vote
|_vote|uint256|The side being supported (0 = NAY, 1 = YAY)
|_key|bytes|Reputation tree key for the staker/domain
|_value|bytes|Reputation tree value for the staker/domain
|_branchMask|uint256|The branchmask of the proof
|_siblings|bytes32[]|The siblings of the proof


### ▸ `stakeMotion(uint256 _motionId, uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _vote, uint256 _amount, bytes memory _key, bytes memory _value, uint256 _branchMask, bytes32[] memory _siblings)`

Stake on a motion


**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion
|_permissionDomainId|uint256|The domain where the extension has the arbitration permission
|_childSkillIndex|uint256|For the domain in which the motion is occurring
|_vote|uint256|The side being supported (0 = NAY, 1 = YAY)
|_amount|uint256|The amount of tokens being staked
|_key|bytes|Reputation tree key for the staker/domain
|_value|bytes|Reputation tree value for the staker/domain
|_branchMask|uint256|The branchmask of the proof
|_siblings|bytes32[]|The siblings of the proof


### ▸ `submitVote(uint256 _motionId, bytes32 _voteSecret, bytes memory _key, bytes memory _value, uint256 _branchMask, bytes32[] memory _siblings)`

Submit a vote secret for a motion


**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion
|_voteSecret|bytes32|The hashed vote secret
|_key|bytes|Reputation tree key for the staker/domain
|_value|bytes|Reputation tree value for the staker/domain
|_branchMask|uint256|The branchmask of the proof
|_siblings|bytes32[]|The siblings of the proof


### ▸ `uninstall()`

Called when uninstalling the extension




### ▸ `version():uint256 colonyVersion`

Get the Colony contract version. Starts from 1 and is incremented with every deployed contract change.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyVersion|uint256|Version number