---
title: IReputationMiningCycle
section: Interface
order: 7
---

  
## Interface Methods

### `appendReputationUpdateLog`

Add a new entry to the reputation update log.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The address of the user having their reputation changed by this log entry
|_amount|int256|The amount by which the user's reputation is going to change. Can be positive or negative.
|_skillId|uint256|The skillId of the reputation being affected
|_colonyAddress|address|The address of the colony the reputation is being affected in
|_nParents|uint128|The number of parent skills the skill defined by the skillId has
|_nChildren|uint128|The number of child skills the skill defined by the skillId has


### `challengeRoundComplete`

Get whether a challenge round is complete.


**Parameters**

|Name|Type|Description|
|---|---|---|
|round|uint256|The round number to check

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|complete|bool|Boolean indicating whether the given round challenge is complete

### `confirmBinarySearchResult`

This function ensures that the intermediate hashes saved are correct.


**Parameters**

|Name|Type|Description|
|---|---|---|
|round|uint256|The round number the hash we are responding on behalf of is in
|idx|uint256|The index in the round that the hash we are responding on behalf of is in
|jhIntermediateValue|bytes|The contents of the Justification Tree at the key given by `targetLeaf` (see function description). The value of `targetLeaf` is computed locally to establish what to submit to this function.
|siblings|bytes32[]|The siblings of the Merkle proof that `jhIntermediateValue` is the value at key `targetLeaf`


### `confirmJustificationRootHash`

Verify the Justification Root Hash (JRH) for a submitted reputation hash is plausible.

*Note: The majority of calls to this function will have `round` equal to `0`. The exception to this is when a submitted hash is given a bye, in which case `round` will be nonzero.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|round|uint256|The round that the hash is currently in.
|index|uint256|The index in the round that the hash is currently in
|siblings1|bytes32[]|The siblings for the same Merkle proof
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
|numerator|uint256|The numerator of the decay constant
|denominator|uint256|The denominator of the decay constant

### `getDisputeRewardSize`

Returns the amount of CLNY given for defending a hash during the current dispute cycle



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_reward|uint256|uint256 The amount of CLNY given.

### `getDisputeRound`

The getter for the disputeRounds mapping.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_round|uint256|The dispute round to query

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|submissions|DisputedEntry[]|An array of DisputedEntrys struct for the round. See ReputationMiningCycleDataTypes for the full description of the properties.

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

Get the length of the mining window in seconds.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|miningWindowDuration|uint256|Duration of the reputation mining window in seconds

### `getMinStake`

Get the minimum stake of CLNY required to mine.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|minStake|uint256|The minimum stake amount

### `getNInvalidatedHashes`

Get the number of hashes that have been invalidated this mining cycle.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nInvalidatedHashes|uint256|Number of invalidated hashes in this mining cycle

### `getNSubmissionsForHash`

Get the number of submissions miners made of a particular hash / nLeaves / jrh combination.


**Parameters**

|Name|Type|Description|
|---|---|---|
|hash|bytes32|The hash that was submitted
|nLeaves|uint256|The number of leaves that was submitted
|jrh|bytes32|The JRH of that was submitted

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|count|uint256|The number of submissions - should be 0-12, as up to twelve submissions can be made

### `getNUniqueSubmittedHashes`

Get the number of unique hash/nleaves/jrh sets that have been submitted this mining cycle.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nUniqueSubmittedHashes|uint256|Number of unique hash/nleaves/jrh sets in this cycle

### `getReputationHashSubmission`

The getter for the hashSubmissions mapping, which keeps track of submissions by user.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|Address of the user

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|submission|Submission|the Submission struct for the submission requested. See ReputationMiningCycleDataTypes.sol for the full description.

### `getReputationMiningWindowOpenTimestamp`

Get the timestamp that the current reputation mining window opened.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|timestamp|uint256|The timestamp

### `getReputationUpdateLogEntry`

Get the `ReputationLogEntry` at index `_id`.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_id|uint256|The reputation log members array index of the entry to get

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|reputationUpdateLogEntry|ReputationLogEntry|The Reputation Update Log Entry

### `getReputationUpdateLogLength`

Get the length of the ReputationUpdateLog stored on this instance of the ReputationMiningCycle contract.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nUpdates|uint256|

### `getResponsePossible`

Returns whether the caller is able to currently respond to a dispute stage.


**Parameters**

|Name|Type|Description|
|---|---|---|
|stage|disputeStages|The dispute stage in question. Practically, this is a number that indexes in to the corresponding enum in ReputationMiningCycleDataTypes
|since|uint256|The timestamp the last response for the submission in the dispute in question was made at.

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|possible|bool|bool Whether the user can respond at the current time.

### `getSubmissionUser`

Get the address that made a particular submission.


**Parameters**

|Name|Type|Description|
|---|---|---|
|hash|bytes32|The hash that was submitted
|nLeaves|uint256|The number of leaves that was submitted
|jrh|bytes32|The JRH of that was submitted
|index|uint256|The index of the submission - should be 0-11, as up to twelve submissions can be made.

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|user|address|Address of the user that submitted the hash / nLeaves/ jrh at index

### `initialise`

Initialise this reputation mining cycle.

*Note: This will only be called once, by ColonyNetwork, in the same transaction that deploys this contract.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|tokenLocking|address|Address of the TokenLocking contract
|clnyToken|address|Address of the CLNY token


### `invalidateHash`

Invalidate a hash that has timed out relative to its opponent its current challenge step. Note that this can be called to 'invalidate' a nonexistent hash, if the round has an odd number of entrants and so the last hash is being given a bye to the next round.


**Parameters**

|Name|Type|Description|
|---|---|---|
|round|uint256|The round number the hash being invalidated is in
|idx|uint256|The index in the round that the hash being invalidated is in


### `minerSubmittedEntryIndex`

Returns a boolean result of whether the miner has already submitted at this entry index.


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

Resets the timestamp that the submission window opens to `now`.

*Note: only allowed to be called by ColonyNetwork.*



### `respondToBinarySearchForChallenge`

Respond to a binary search step, to eventually discover where two submitted hashes differ in their Justification trees.


**Parameters**

|Name|Type|Description|
|---|---|---|
|round|uint256|The round number the hash we are responding on behalf of is in
|idx|uint256|The index in the round that the hash we are responding on behalf of is in
|jhIntermediateValue|bytes|The contents of the Justification Tree at the key given by `targetLeaf` (see function description). The value of `targetLeaf` is computed locally to establish what to submit to this function.
|siblings|bytes32[]|The siblings of the Merkle proof that `jhIntermediateValue` is the value at key `targetLeaf`


### `respondToChallenge`

Respond to challenge, to establish which (if either) of the two submissions facing off are correct.

*Note: note that these are all bytes32; the address should be left padded from 20 bytes to 32 bytes. Strictly, I do not believe the padding matters, but you should use 0s for your own sanity!*

**Parameters**

|Name|Type|Description|
|---|---|---|
|u|uint256[26]|A `uint256[27]` array. The elements of this array, in order are: * 1. The current round of the hash being responded on behalf of * 2. The current index in the round of the hash being responded on behalf of * 3. The branchMask of the proof that the reputation is in the reputation state tree for the reputation with the disputed change * 4. The number of leaves in the last reputation state that both submitted hashes agree on * 5. The branchMask of the proof that the last reputation state the submitted hashes agreed on is in this submitted hash's justification tree * 6. The number of leaves this hash considers to be present in the first reputation state the two hashes in this challenge disagree on * 7. The branchMask of the proof that reputation root hash of the first reputation state the two hashes in this challenge disagree on is in this submitted hash's justification tree * 8. The index of the log entry that the update in question was implied by. Each log entry can imply multiple reputation updates, and so we expect the clients to pass      the log entry index corresponding to the update to avoid us having to iterate over the log. * 9. A dummy variable that should be set to 0. If nonzero, transaction will still work but be slightly more expensive. For an explanation of why this is present, look at the corresponding solidity code. * 10. Origin skill reputation branch mask. Nonzero for child reputation updates. * 11. The amount of reputation that the entry in the tree under dispute has in the agree state * 12. The UID that the entry in the tree under dispute has in the agree state * 13. The amount of reputation that the entry in the tree under dispute has in the disagree state * 14. The UID that the entry in the tree under dispute has in the disagree state * 15. The amount of reputation that the user's origin reputation entry in the tree has in the state being disputed * 16. The UID that the user's origin reputation entry in the tree has in the state being disputed * 17. The branchMask of the proof that the child reputation for the user being updated is in the agree state * 18. The amount of reputation that the child reputation for the user being updated is in the agree state * 19. The UID of the child reputation for the user being updated in the agree state * 20. A dummy variable that should be set to 0. If nonzero, transaction will still work but be slightly more expensive. For an explanation of why this is present, look at the corresponding solidity code. * 21. The branchMask of the proof that the reputation adjacent to the new reputation being inserted is in the agree state * 22. The amount of reputation that the reputation adjacent to a new reputation being inserted has in the agree state * 23. The UID of the reputation adjacent to the new reputation being inserted * 24. A dummy variable that should be set to 0. If nonzero, transaction will still work but be slightly more expensive. For an explanation of why this is present, look at the corresponding solidity code. * 25. The value of the reputation that would be origin-adjacent that proves that the origin reputation does not exist in the tree * 26. The value of the reputation that would be child-adjacent that proves that the child reputation does not exist in the tree
|b32|bytes32[7]|A `bytes32[8]` array. The elements of this array, in order are: * 1. The colony address in the key of the reputation being changed that the disagreement is over. * 2. The skillid in the key of the reputation being changed that the disagreement is over. * 3. The user address in the key of the reputation being changed that the disagreement is over. * 4. The keccak256 hash of the key of the reputation being changed that the disagreement is over. * 5. The keccak256 hash of the key for a reputation already in the tree adjacent to the new reputation being inserted, if required. * 6. The keccak256 hash of the key of the reputation that would be origin-adjacent that proves that the origin reputation does not exist in the tree * 7. The keccak256 hash of the key of the reputation that would be child-adjacent that proves that the child reputation does not exist in the tree
|reputationSiblings|bytes32[]|The siblings of the Merkle proof that the reputation corresponding to `_reputationKey` is in the reputation state before and after the disagreement
|agreeStateSiblings|bytes32[]|The siblings of the Merkle proof that the last reputation state the submitted hashes agreed on is in this submitted hash's justification tree
|disagreeStateSiblings|bytes32[]|The siblings of the Merkle proof that the first reputation state the submitted hashes disagreed on is in this submitted hash's justification tree
|userOriginReputationSiblings|bytes32[]|Nonzero for child updates only. The siblings of the Merkle proof of the user's origin skill reputation added to the reputation tree in the last reputation state the submitted hashes agree on
|childReputationSiblings|bytes32[]|Nonzero for child updates of a colony-wide global skill. The siblings of the Merkle proof of the child skill reputation of the user in the same skill this global update is for
|adjacentReputationSiblings|bytes32[]|Nonzero for updates involving insertion of a new skill. The siblings of the Merkle proof of a reputation in the agree state that ends adjacent to the new reputation


### `rewardStakersWithReputation`

Start the reputation log with the rewards for the stakers who backed the accepted new reputation root hash.

*Note: Only callable by colonyNetwork. Note that the same address might be present multiple times in `stakers` - this is acceptable, and indicates the same address backed the same hash multiple times with different entries.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|stakers|address[]|The array of stakers addresses to receive the reward.
|weights|uint256[]|The array of weights determining the proportion of reward to go to each staker
|metaColonyAddress|address|The address of the meta colony, which the special mining skill is earned in
|reward|uint256|The amount of reputation to be rewarded to each staker
|miningSkillId|uint256|Skill id of the special mining skill


### `submitRootHash`

Submit a new reputation root hash.


**Parameters**

|Name|Type|Description|
|---|---|---|
|newHash|bytes32|The proposed new reputation root hash
|nLeaves|uint256|Number of leaves in tree with root `newHash`
|jrh|bytes32|The justifcation root hash for this submission
|entryIndex|uint256|The entry number for the given `newHash` and `nLeaves`


### `userInvolvedInMiningCycle`

Returns whether a particular address has been involved in the current mining cycle. This might be from submitting a hash, or from defending one during a dispute.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The address whose involvement is being queried

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|involved|bool|Whether the address has been involved in the current mining cycle