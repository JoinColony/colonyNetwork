## Interface Methods

### ▸ **`claimReward(uint256 _motionId, uint256 _permissionDomainId, uint256 _childSkillIndex, address _staker, uint256 _vote)`**

Claim the staker's reward


**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion
|_permissionDomainId|uint256|The domain where the extension has the arbitration permission
|_childSkillIndex|uint256|For the domain in which the motion is occurring
|_staker|address|The staker whose reward is being claimed
|_vote|uint256|The side being supported (0 = NAY, 1 = YAY)


### ▸ **`createClaimDelayAction(bytes memory action, uint256 value):bytes bytes`**




**Parameters**

|Name|Type|Description|
|---|---|---|
|action|bytes|
|value|uint256|

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|bytes|bytes|

### ▸ **`createDomainMotion(uint256 _domainId, uint256 _childSkillIndex, bytes memory _action, bytes memory _key, bytes memory _value, uint256 _branchMask, bytes32[] memory _siblings)`**

Create a motion in any domain


**Parameters**

|Name|Type|Description|
|---|---|---|
|_domainId|uint256|The domain where we vote on the motion
|_childSkillIndex|uint256|The childSkillIndex pointing to the domain of the action
|_action|bytes|A bytes array encoding a function call
|_key|bytes|Reputation tree key for the domain
|_value|bytes|Reputation tree value for the domain
|_branchMask|uint256|The branchmask of the proof
|_siblings|bytes32[]|The siblings of the proof


### ▸ **`createMotion(uint256 _domainId, uint256 _childSkillIndex, address _altTarget, bytes memory _action, bytes memory _key, bytes memory _value, uint256 _branchMask, bytes32[] memory _siblings)`**

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


### ▸ **`createRootMotion(address _altTarget, bytes memory _action, bytes memory _key, bytes memory _value, uint256 _branchMask, bytes32[] memory _siblings)`**

Create a motion in the root domain


**Parameters**

|Name|Type|Description|
|---|---|---|
|_altTarget|address|The contract to which we send the action (0x0 for the colony)
|_action|bytes|A bytes array encoding a function call
|_key|bytes|Reputation tree key for the root domain
|_value|bytes|Reputation tree value for the root domain
|_branchMask|uint256|The branchmask of the proof
|_siblings|bytes32[]|The siblings of the proof


### ▸ **`deprecate(bool _deprecated)`**

Called when deprecating (or undeprecating) the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_deprecated|bool|Indicates whether the extension should be deprecated or undeprecated


### ▸ **`escalateMotion(uint256 _motionId, uint256 _newDomainId, uint256 _childSkillIndex, bytes memory _key, bytes memory _value, uint256 _branchMask, bytes32[] memory _siblings)`**

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


### ▸ **`failingExecutionAllowed(uint256 _motionId):bool allowed`**

Return whether a motion, assuming it's in the finalizable state, is allowed to finalize without the call executing successfully.

*Note: We are only expecting this to be called from finalize motion in the contracts. It is marked as public only so that the frontend can use it.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|allowed|bool|Is `true` if the motion is allowed to be finalized

### ▸ **`finalizeMotion(uint256 _motionId)`**

Finalize a motion


**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion


### ▸ **`finishUpgrade()`**

Called when upgrading the extension




### ▸ **`getEscalationPeriod():uint256 period`**

Get the escalation period



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|period|uint256|The escalation period

### ▸ **`getExpenditureMotionCount(bytes32 _structHash):uint256 ongoing`**

Get the number of ongoing motions for a single expenditure / expenditure slot


**Parameters**

|Name|Type|Description|
|---|---|---|
|_structHash|bytes32|The hash of the expenditureId or expenditureId*expenditureSlot

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|ongoing|uint256|The number of ongoing motions

### ▸ **`getExpenditurePastVote(bytes32 _actionHash):uint256 largest`**

Get the largest past vote on a single expenditure variable


**Parameters**

|Name|Type|Description|
|---|---|---|
|_actionHash|bytes32|The hash of the particular expenditure action

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|largest|uint256|The largest past vote on this variable

### ▸ **`getMaxVoteFraction():uint256 fraction`**

Get the max vote fraction



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|fraction|uint256|The max vote fraction

### ▸ **`getMetatransactionNonce(address userAddress):uint256 nonce`**

Gets the next nonce for a meta-transaction


**Parameters**

|Name|Type|Description|
|---|---|---|
|userAddress|address|The user's address

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nonce|uint256|The nonce

### ▸ **`getMotion(uint256 _motionId):Motion motion`**

Get the data for a single motion


**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|motion|Motion|The motion struct

### ▸ **`getMotionCount():uint256 count`**

Get the total motion count



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The total motion count

### ▸ **`getMotionState(uint256 _motionId):MotionState state`**

Get the current state of the motion


**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|state|MotionState|The current motion state

### ▸ **`getRevealPeriod():uint256 period`**

Get the reveal period



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|period|uint256|The reveal period

### ▸ **`getStake(uint256 _motionId, address _staker, uint256 _vote):uint256 stake`**

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
|stake|uint256|The user's stake

### ▸ **`getStakePeriod():uint256 period`**

Get the stake period



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|period|uint256|The stake period

### ▸ **`getStakerReward(uint256 _motionId, address _staker, uint256 _vote):uint256 reward, uint256 penalty`**

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
|reward|uint256|The staker reward
|penalty|uint256|The reputation penalty (if any)

### ▸ **`getSubmitPeriod():uint256 period`**

Get the submit period



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|period|uint256|The submit period

### ▸ **`getTotalStakeFraction():uint256 fraction`**

Get the total stake fraction



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|fraction|uint256|The total stake fraction

### ▸ **`getUserMinStakeFraction():uint256 fraction`**

Get the user min stake fraction



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|fraction|uint256|The user min stake fraction

### ▸ **`getVoterReward(uint256 _motionId, uint256 _voterRep):uint256 reward`**

Get the voter reward NB This function will only return a meaningful value if in the reveal state. Prior to the reveal state, getVoterRewardRange should be used.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion
|_voterRep|uint256|The reputation the voter has in the domain

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|reward|uint256|The voter reward

### ▸ **`getVoterRewardFraction():uint256 fraction`**

Get the voter reward fraction



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|fraction|uint256|The voter reward fraction

### ▸ **`getVoterRewardRange(uint256 _motionId, uint256 _voterRep, address _voterAddress):uint256 min, uint256 max`**

Get the range of potential rewards for a voter on a specific motion, intended to be used when the motion is in the reveal state. Once a motion is in the reveal state the reward is known, and getVoterRewardRange should be used.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_motionId|uint256|The id of the motion
|_voterRep|uint256|The reputation the voter has in the domain
|_voterAddress|address|The address the user will be voting as

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|min|uint256|The voter reward range minimum
|max|uint256|The voter reward range maximum

### ▸ **`identifier():bytes32 identifier`**

Returns the identifier of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|identifier|bytes32|The extension's identifier

### ▸ **`initialise(uint256 _totalStakeFraction, uint256 _voterRewardFraction, uint256 _userMinStakeFraction, uint256 _maxVoteFraction, uint256 _stakePeriod, uint256 _submitPeriod, uint256 _revealPeriod, uint256 _escalationPeriod)`**

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


### ▸ **`install(address _colony)`**

Install the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_colony|address|Base colony for the installation


### ▸ **`revealVote(uint256 _motionId, bytes32 _salt, uint256 _vote, bytes memory _key, bytes memory _value, uint256 _branchMask, bytes32[] memory _siblings)`**

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


### ▸ **`stakeMotion(uint256 _motionId, uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _vote, uint256 _amount, bytes memory _key, bytes memory _value, uint256 _branchMask, bytes32[] memory _siblings)`**

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


### ▸ **`submitVote(uint256 _motionId, bytes32 _voteSecret, bytes memory _key, bytes memory _value, uint256 _branchMask, bytes32[] memory _siblings)`**

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


### ▸ **`uninstall()`**

Called when uninstalling the extension




### ▸ **`version():uint256 version`**

Returns the version of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|version|uint256|The extension's version number