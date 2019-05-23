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
|_user|address| The address of the user having their reputation changed by this log entry
|_amount|int256| The amount by which the user's reputation is going to change. Can be positive or negative
|_skillId|uint256| The skillId of the reputation being affected
|_colonyAddress|address| The address of the colony the reputation is being affected in
|_nParents|uint128| The number of parent skills the skill defined by the skillId has
|_nChildren|uint128| The number of child skills the skill defined by the skillId has





### `confirmBinarySearchResult`

This function ensures that the intermediate hashes saved are correct.



**Parameters**


|Name|Type|Description|
|---|---|---|
|round|uint256| The 
|idx|uint256| The index in the round that the hash we are responding on behalf of is in
|jhIntermediateValue|bytes| The contents of the Justification Tree at the key given by `targetNode` (see function description). The value of `targetNode` is computed locally to establish what to submit to this function.
|branchMask|uint256| The 
|siblings|memory| The 





### `confirmNewHash`

Confirm a new reputation hash. The hash in question is either the only one that was submitted this cycle,



**Parameters**


|Name|Type|Description|
|---|---|---|
|roundNumber|uint256| The round number that the hash being confirmed is in as the only contendender. If only one hash was submitted, then this is zero.





### `getDisputeRound`

The getter for the disputeRounds mapping



**Parameters**


|Name|Type|Description|
|---|---|---|
|_round|uint256| The dispute round to query



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|submissions|memory|



### `getEntryHash`

Get the hash for the corresponding entry.



**Parameters**


|Name|Type|Description|
|---|---|---|
|submitter|address| The address that submitted the hash
|entryIndex|uint256| The index of the entry that they used to submit the hash
|newHash|bytes32| The hash that they submitted



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|entryHash|bytes32| The hash for the corresponding entry



### `getNSubmissionsForHash`

Get the number of submissions miners made of a particular hash / nNodes / jrh combination



**Parameters**


|Name|Type|Description|
|---|---|---|
|hash|bytes32| The 
|nNodes|uint256| The number of nodes that was submitted
|jrh|bytes32| The JRH of that was submitted



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|count|uint256| The number of submissions - should be 0-12, as up to twelve submissions can be made



### `getReputationHashSubmission`

The getter for the hashSubmissions mapping, which keeps track of submissions by user.



**Parameters**


|Name|Type|Description|
|---|---|---|
|_user|address| Address of the user



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|submission|memory| the Submission struct for the 



### `getReputationUpdateLogEntry`

Get the `ReputationLogEntry` at index `_id`



**Parameters**


|Name|Type|Description|
|---|---|---|
|_id|uint256| The reputation log members array index of the entry to get



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|reputationUpdateLogEntry|memory| The Reputation Update Log Entry



### `getReputationUpdateLogLength`

Get the length of the ReputationUpdateLog stored on this instance of the ReputationMiningCycle contract





**Return Parameters**


|Name|Type|Description|
|---|---|---|
|nUpdates|uint128|



### `invalidateHash`

Invalidate a hash that has timed out relative to its opponent its current challenge step. Note that this can be called to 'invalidate'



**Parameters**


|Name|Type|Description|
|---|---|---|
|round|uint256| The 
|idx|uint256| The index in the round that the hash being invalidated is in





### `minerSubmittedEntryIndex`

Returns a boolean result of whether the miner has already submitted at this entry index



**Parameters**


|Name|Type|Description|
|---|---|---|
|_miner|address| The address that submitted the hash
|_index|uint256| The index of the entry that they used to submit the hash



**Return Parameters**


|Name|Type|Description|
|---|---|---|
|result|bool| Boolean whether the entryIndex was already submitted



### `resetWindow`

Resets the timestamp that the submission window opens to `now`







### `respondToBinarySearchForChallenge`

Respond to a binary search step, to eventually discover where two submitted hashes differ in their Justification trees.



**Parameters**


|Name|Type|Description|
|---|---|---|
|round|uint256| The 
|idx|uint256| The index in the round that the hash we are responding on behalf of is in
|jhIntermediateValue|bytes| The contents of the Justification Tree at the key given by `targetNode` (see function description). The value of `targetNode` is computed locally to establish what to submit to this function.
|branchMask|uint| The 
|siblings|memory| The 





### `submitRootHash`

Submit a new reputation root hash



**Parameters**


|Name|Type|Description|
|---|---|---|
|newHash|bytes32| The proposed new reputation root hash
|nNodes|uint256| Number of nodes in tree with root `newHash`
|jrh|bytes32| The justifcation root hash for this submission
|entryIndex|uint256| The entry number for the given `newHash` and `nNodes`