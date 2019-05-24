---
title: IReputationMiningCycle
section: Interface
order: 7
---

  
## Interface Methods

### `appendReputationUpdateLog`

Add a new entry to the reputation update log


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The address of the user having their reputation changed by this log entry
|_amount|int256|The amount by which the user's reputation is going to change. Can be positive or negative
|_skillId|uint256|The skillId of the reputation being affected
|_colonyAddress|address|The address of the colony the reputation is being affected in
|_nParents|uint128|The number of parent skills the skill defined by the skillId has
|_nChildren|uint128|The number of child skills the skill defined by the skillId has


### `challengeRoundComplete`

Get whether a challenge round is complete


**Parameters**

|Name|Type|Description|
|---|---|---|
|round|uint256|umber The round number that the hash being confirmed is in as the only contendender. If only one hash was submitted, then this is zero.

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|complete|bool|

### `confirmBinarySearchResult`

This function ensures that the intermediate hashes saved are correct.


**Parameters**

|Name|Type|Description|
|---|---|---|
|round|uint256|The round number the hash we are responding on behalf of is in
|idx|uint256|The index in the round that the hash we are responding on behalf of is in
|jhIntermediateValue|bytes|The contents of the Justification Tree at the key given by `targetNode` (see function description). The value of `targetNode` is computed locally to establish what to submit to this function.
|branchMask|uint256|The branchMask of the Merkle proof that `jhIntermediateValue` is the value at key `targetNode`
|siblings|bytes32[]|The siblings of the Merkle proof that `jhIntermediateValue` is the value at key `targetNode`


### `confirmJustificationRootHash`

Verify the Justification Root Hash (JRH) for a submitted reputation hash is plausible


**Parameters**

|Name|Type|Description|
|---|---|---|
|round|uint256|The round that the hash is currently in.
|index|uint256|The index in the round that the hash is currently in
|branchMask1|uint|The branchmask for the Merkle proof that the currently accepted reputation state (given by `ColonyNetwork.getReputationRootHash()` + `ColonyNetwork.getReputationRootHashNNodes()`, where `+` is concatenation) is at key 0x000..000 in the submitted JRH
|siblings1|bytes32[]|The siblings for the same Merkle proof
|branchMask2|uint|The branchmask for the Merkle proof that the proposed new reputation state is at the key corresponding to the number of transactions expected in this update in the submitted JRH. This key should be the number of decay transactions plus the number of transactions the log indicates are to happen.
|siblings2|bytes32[]|The siblings for the same Merkle proof


### `confirmNewHash`

Confirm a new reputation hash. The hash in question is either the only one that was submitted this cycle, or the last one standing after all others have been proved wrong.


**Parameters**

|Name|Type|Description|
|---|---|---|
|roundNumber|uint256|The round number that the hash being confirmed is in as the only contendender. If only one hash was submitted, then this is zero.


### `getDecayConstant`

Get the reputation decay constant.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|numerator|uint256|
|denominator|uint256|

### `getDisputeRound`

The getter for the disputeRounds mapping


**Parameters**

|Name|Type|Description|
|---|---|---|
|_round|uint256|The dispute round to query

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|submissions|undefined[]|

### `getEntryHash`

Get the hash for the corresponding entry.


**Parameters**

|Name|Type|Description|
|---|---|---|
|submitter|address|The address that submitted the hash
|entryIndex|uint256|The index of the entry that they used to submit the hash
|newHash|bytes32|The hash that they submitted

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|entryHash|bytes32|The hash for the corresponding entry

### `getMiningWindowDuration`

Get the length of the mining window in seconds



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|miningWindowDuration|uint256|

### `getMinStake`

Get the minimum stake of CLNY required to mine



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|minStake|uint256|

### `getNInvalidatedHashes`

Get the number of hashes that have been invalidated this mining cycle



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nInvalidatedHashes|uint256|

### `getNSubmissionsForHash`

Get the number of submissions miners made of a particular hash / nNodes / jrh combination


**Parameters**

|Name|Type|Description|
|---|---|---|
|hash|bytes32|The hash that was submitted
|nNodes|uint256|The number of nodes that was submitted
|jrh|bytes32|The JRH of that was submitted

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The number of submissions - should be 0-12, as up to twelve submissions can be made

### `getNUniqueSubmittedHashes`

Get the number of unique hashes that have been submitted this mining cycle



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nUniqueSubmittedHashes|uint256|

### `getReputationHashSubmission`

The getter for the hashSubmissions mapping, which keeps track of submissions by user.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|Address of the user

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|submission|submission|the Submission struct for the submission requested. See ReputationMiningCycleDataTypes.sol for the full description

### `getReputationMiningWindowOpenTimestamp`

Get the timestamp that the current reputation mining window opened



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|timestamp|uint256|

### `getReputationUpdateLogEntry`

Get the `ReputationLogEntry` at index `_id`


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|The reputation log members array index of the entry to get

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|reputationUpdateLogEntry|reputationUpdateLogEntry|The Reputation Update Log Entry

### `getReputationUpdateLogLength`

Get the length of the ReputationUpdateLog stored on this instance of the ReputationMiningCycle contract



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nUpdates|uint128|

### `getSubmissionUser`

Get the address that made a particular submission


**Parameters**

|Name|Type|Description|
|---|---|---|
|hash|bytes32|The hash that was submitted
|nNodes|uint256|The number of nodes that was submitted
|jrh|bytes32|The JRH of that was submitted
|index|uint256|The index of the submission - should be 0-11, as up to twelve submissions can be made.

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|user|address|

### `initialise`

Initialise this reputation mining cycle.

*Note: This will only be called once, by ColonyNetwork, in the same transaction that deploys this contract*

**Parameters**

|Name|Type|Description|
|---|---|---|
|tokenLocking|address|
|clnyToken|address|


### `invalidateHash`

Invalidate a hash that has timed out relative to its opponent its current challenge step. Note that this can be called to 'invalidate' a nonexistent hash, if the round has an odd number of entrants and so the last hash is being given a bye to the next round.


**Parameters**

|Name|Type|Description|
|---|---|---|
|round|uint256|The round number the hash being invalidated is in
|idx|uint256|The index in the round that the hash being invalidated is in


### `minerSubmittedEntryIndex`

Returns a boolean result of whether the miner has already submitted at this entry index


**Parameters**

|Name|Type|Description|
|---|---|---|
|_miner|address|The address that submitted the hash
|_index|uint256|The index of the entry that they used to submit the hash

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|result|bool|Boolean whether the entryIndex was already submitted

### `resetWindow`

Resets the timestamp that the submission window opens to `now`

*Note: only allowed to be called by ColonyNetwork*



### `respondToBinarySearchForChallenge`

Respond to a binary search step, to eventually discover where two submitted hashes differ in their Justification trees.


**Parameters**

|Name|Type|Description|
|---|---|---|
|round|uint256|The round number the hash we are responding on behalf of is in
|idx|uint256|The index in the round that the hash we are responding on behalf of is in
|jhIntermediateValue|bytes|The contents of the Justification Tree at the key given by `targetNode` (see function description). The value of `targetNode` is computed locally to establish what to submit to this function.
|branchMask|uint|The branchMask of the Merkle proof that `jhIntermediateValue` is the value at key `targetNode`
|siblings|bytes32[]|The siblings of the Merkle proof that `jhIntermediateValue` is the value at key `targetNode`


### `respondToChallenge`




**Parameters**

|Name|Type|Description|
|---|---|---|
|u|uint256[]|
|b32|bytes32[]|
|reputationSiblings|bytes32[]|
|agreeStateSiblings|bytes32[]|
|disagreeStateSiblings|bytes32[]|
|previousNewReputationSiblings|bytes32[]|
|userOriginReputationSiblings|bytes32[]|
|childReputationSiblings|bytes32[]|
|adjacentReputationSiblings|bytes32[]|


### `rewardStakersWithReputation`

Start the reputation log with the rewards for the stakers who backed the accepted new reputation root hash.


**Parameters**

|Name|Type|Description|
|---|---|---|
|stakers|address[]|The array of stakers addresses to receive the reward.
|weights|uint256[]|The array of weights determining the proportion of reward to go to each staker
|metaColonyAddress|address|The address of the meta colony, which the special mining skill is earned in
|reward|uint256|The amount of reputation to be rewarded to each staker
|miningSkillId|uint256|


### `submitRootHash`

Submit a new reputation root hash


**Parameters**

|Name|Type|Description|
|---|---|---|
|newHash|bytes32|The proposed new reputation root hash
|nNodes|uint256|Number of nodes in tree with root `newHash`
|jrh|bytes32|The justifcation root hash for this submission
|entryIndex|uint256|The entry number for the given `newHash` and `nNodes`