/*
  This file is part of The Colony Network.

  The Colony Network is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  The Colony Network is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with The Colony Network. If not, see <http://www.gnu.org/licenses/>.
*/

pragma solidity ^0.4.23;
pragma experimental "v0.5.0";


contract IReputationMiningCycle {

  /// @notice The getter for the disputeRounds mapping of array of dispute rounds.
  /// @param _round The dispute round to query
  /// @param _index The index in the dispute round to query
  /// @return The elements of the Submission struct for the submission requested. See ReputationMiningCycle.sol for the full description
  function getDisputeRounds(uint256 _round, uint256 _index) public view returns (
    bytes32 proposedNewRootHash,
    uint256 nNodes,
    uint256 lastResponseTimestamp,
    uint256 challengeStepCompleted,
    bytes32 jrh,
    bytes32 intermediateReputationHash,
    uint256 intermediateReputationNNodes,
    uint256 jrhNnodes,
    uint256 lowerBound,
    uint256 upperBound,
    uint256 providedPreviousReputationUID
    );

  /// @notice The getter for the hashSubmissions mapping, which keeps track of submissions by user.
  /// @param _user Address of the user
  /// @return The elements of the Submission struct for the submission requested. See ReputationMiningCycle.sol for the full description
  function getReputationHashSubmissions(address _user) public view returns (
    bytes32 proposedNewRootHash,
    uint256 nNodes,
    uint256 lastResponseTimestamp,
    uint256 challengeStepCompleted,
    bytes32 jrh,
    bytes32 intermediateReputationHash,
    uint256 intermediateReputationNNodes,
    uint256 jrhNnodes,
    uint256 lowerBound,
    uint256 upperBound,
    uint256 providedPreviousReputationUID
    );

  /// @notice Change value at specific slot
  /// @param _slot Index of the slot we want to change
  /// @param _value Value we want to set at `_slot`
  function setStorageSlotRecovery(uint256 _slot, bytes32 _value) public;

  /// @notice Get the hash for the corresponding entry.
  /// @param submitter The address that submitted the hash
  /// @param entryIndex The index of the entry that they used to submit the hash
  /// @param newHash The hash that they submitted
  /// @return entryHash The hash for the corresponding entry
  function getEntryHash(address submitter, uint256 entryIndex, bytes32 newHash) public pure returns (bytes32 entryHash);

  /// @notice Resets the timestamp that the submission window opens to `now`
  /// @dev only allowed to be called by ColonyNetwork
  function resetWindow() public;

  /// @notice Submit a new reputation root hash
  /// @param newHash The proposed new reputation root hash
  /// @param nNodes Number of nodes in tree with root `newHash`
  /// @param entryIndex The entry number for the given `newHash` and `nNodes`
  function submitRootHash(bytes32 newHash, uint256 nNodes, uint256 entryIndex) public;

  /// @notice Confirm a new reputation hash. The hash in question is either the only one that was submitted this cycle,
  /// or the last one standing after all others have been proved wrong.
  /// @param roundNumber The round number that the hash being confirmed is in as the only contendender. If only one hash was submitted, then this is zero.
  function confirmNewHash(uint256 roundNumber) public;

  /// @notice Invalidate a hash that has timed out relative to its opponent its current challenge step. Note that this can be called to 'invalidate'
  /// a nonexistent hash, if the round has an odd number of entrants and so the last hash is being given a bye to the next round.
  /// @param round The round number the hash being invalidated is in
  /// @param idx The index in the round that the hash being invalidated is in
  function invalidateHash(uint256 round, uint256 idx) public;

  /// @notice Respond to a binary search step, to eventually discover where two submitted hashes differ in their Justification trees.
  /// @param round The round number the hash we are responding on behalf of is in
  /// @param idx The index in the round that the hash we are responding on behalf of is in
  /// @param jhIntermediateValue The contents of the Justification Tree at the key given by `targetNode` (see function description). The value of `targetNode` is computed locally to establish what to submit to this function.
  /// @param branchMask The branchMask of the Merkle proof that `jhIntermediateValue` is the value at key `targetNode`
  /// @param siblings The siblings of the Merkle proof that `jhIntermediateValue` is the value at key `targetNode`
  function respondToBinarySearchForChallenge(uint256 round, uint256 idx, bytes jhIntermediateValue, uint branchMask, bytes32[] siblings) public;

  /// @notice Respond to challenge, to establish which (if either) of the two submissions facing off are correct.
  /// @param u A `uint256[10]` array. The elements of this array, in order are:
  /// * 1. The current round of the hash being responded on behalf of
  /// * 2. The current index in the round of the hash being responded on behalf of
  /// * 3. The branchMask of the proof that the reputation is in the reputation state tree for the reputation with the disputed change
  /// * 4. The number of nodes in the last reputation state that both submitted hashes agree on
  /// * 5. The branchMask of the proof that the last reputation state the submitted hashes agreed on is in this submitted hash's justification tree
  /// * 6. The number of nodes this hash considers to be present in the first reputation state the two hashes in this challenge disagree on
  /// * 7. The branchMask of the proof that reputation root hash of the first reputation state the two hashes in this challenge disagree on is in this submitted hash's justification tree
  /// * 8. The branchMask of the proof for the most recently added reputation state in this hash's state tree in the last reputation state the two hashes in this challenge agreed on
  /// * 9. A dummy variable that should be set to 0. If nonzero, transaction will still work but be slightly more expensive. For an explanation of why this is present, look at the corresponding solidity code.
  /// *10. The index of the log entry that the update in question was implied by. Each log entry can imply multiple reputation updates, and so we expect the clients to pass
  ///      the log entry index corresponding to the update to avoid us having to iterate over the log.
  /// *11. A dummy variable that should be set to 0. If nonzero, transaction will still work but be slightly more expensive. For an explanation of why this is present, look at the corresponding solidity code.
  /// @param _reputationKey The key of the reputation being changed that the disagreement is over.
  /// @param reputationSiblings The siblings of the Merkle proof that the reputation corresponding to `_reputationKey` is in the reputation state before and after the disagreement
  /// @param agreeStateReputationValue The value of the reputation at key `_reputationKey` in the last reputation state the submitted hashes agreed on
  /// @param agreeStateSiblings The siblings of the Merkle proof that the last reputation state the submitted hashes agreed on is in this submitted hash's justification tree
  /// @param disagreeStateReputationValue The value of the reputation at key `_reputationKey` in the first reputation state the submitted hashes disagree on
  /// @param disagreeStateSiblings The siblings of the Merkle proof that the first reputation state the submitted hashes disagreed on is in this submitted hash's justification tree
  /// @param previousNewReputationKey The key of the newest reputation added to the reputation tree in the last reputation state the submitted hashes agree on
  /// @param previousNewReputationValue The value of the newest reputation added to the reputation tree in the last reputation state the submitted hashes agree on
  /// @param previousNewReputationSiblings The siblings of the Merkle proof of the newest reputation added to the reputation tree in the last reputation state the submitted hashes agree on
  /// @dev If you know that the disagreement doesn't involve a new reputation being added, the arguments corresponding to the previous new reputation can be zeroed, as they will not be used. You must be sure
  /// that this is the case, however, otherwise you risk being found incorrect. Zeroed arguments will result in a cheaper call to this function.
  function respondToChallenge(
    uint256[11] u, //An array of 10 UINT Params, ordered as given above.
    bytes _reputationKey,
    bytes32[] reputationSiblings,
    bytes agreeStateReputationValue,
    bytes32[] agreeStateSiblings,
    bytes disagreeStateReputationValue,
    bytes32[] disagreeStateSiblings,
    bytes previousNewReputationKey,
    bytes previousNewReputationValue,
    bytes32[] previousNewReputationSiblings) public;

  /// @notice Submit the Justification Root Hash (JRH) for a submitted reputation hash.
  /// @param round The round that the hash is currently in.
  /// @param index The index in the round that the hash is currently in
  /// @param jrh The JRH being submitted
  /// @param branchMask1 The branchmask for the Merkle proof that the currently accepted reputation state (given by `ColonyNetwork.getReputationRootHash()` + `ColonyNetwork.getReputationRootHashNNodes()`, where `+` is concatenation) is at key 0x000..000 in the submitted JRH
  /// @param siblings1 The siblings for the same Merkle proof
  /// @param branchMask2 The branchmask for the Merkle proof that the proposed new reputation state is at the key corresponding to the number of transactions expected in this update in the submitted JRH. This key should be the number of decay transactions plus the number of transactions the log indicates are to happen.
  /// @param siblings2 The siblings for the same Merkle proof
  /// @dev The majority of calls to this function will have `round` equal to `0`. The exception to this is when a submitted hash is given a bye, in which case `round` will be nonzero.
  /// @dev Note that it is possible for this function to be required to be called in every round - the hash getting the bye can wait until they will also be awarded the bye in the next round, if
  /// one is going to exist. There is an incentive to do so from a gas-cost perspective, but they don't know for sure there's going to be a bye until the submission window has expired, so I think
  /// this is okay.
  function submitJustificationRootHash(
    uint256 round,
    uint256 index,
    bytes32 jrh,
    uint branchMask1,
    bytes32[] siblings1,
    uint branchMask2,
    bytes32[] siblings2) public;

  /// @notice Add a new entry to the reputation update log
  /// @param _user The address of the user having their reputation changed by this log entry
  /// @param _amount The amount by which the user's reputation is going to change. Can be positive or negative
  /// @param _skillId The skillId of the reputation being affected
  /// @param _colonyAddress The address of the colony the reputation is being affected in
  /// @param _nParents The number of parent skills the skill defined by the skillId has
  /// @param _nChildren The number of child skills the skill defined by the skillId has
  function appendReputationUpdateLog(
    address _user,
    int _amount,
    uint _skillId,
    address _colonyAddress,
    uint _nParents,
    uint _nChildren
    ) public;

  /// @notice Get the length of the ReputationUpdateLog stored on this instance of the ReputationMiningCycle contract
  /// @return nUpdates
  function getReputationUpdateLogLength() public view returns (uint nUpdates);

  /// @notice Get the `ReputationLogEntry` at index `_id`
  /// @param _id The reputation log members array index of the entry to get
  /// @return user The address of the user having their reputation changed by this log entry
  /// @return amount The amount by which the user's reputation is going to change
  /// @return skillId The skillId of the reputation being affected
  /// @return colony The address of the colony the reputation is being affected in
  /// @return nUpdates The number of updates this log entry implies (including updates to parents, children and colony-wide totals thereof)
  /// @return nPreviousUpdates The number of updates all previous entries in the log imply (including reputation decays, updates to parents, children, and colony-wide totals thereof)
  function getReputationUpdateLogEntry(uint256 _id) public view returns (
    address user,
    int256 amount,
    uint256 skillId,
    address colony,
    uint256 nUpdates,
    uint256 nPreviousUpdates
    );

  /// @notice Start the reputation log with the rewards for the stakers who backed the accepted new reputation root hash.
  /// @param stakers The array of stakers addresses to receive the reward.
  /// @param commonColonyAddress The address of the common colony, which the special mining skill is earned in
  /// @param reward The amount of reputation to be rewarded to each staker
  /// @dev Only callable by colonyNetwork
  /// @dev Note that the same address might be present multiple times in `stakers` - this is acceptable, and indicates the
  /// same address backed the same hash multiple times with different entries.
  function rewardStakersWithReputation(address[] stakers, address commonColonyAddress, uint reward, uint miningSkillId) public;

  /// @notice Get the timestamp that the current reputation mining window opened
  function getReputationMiningWindowOpenTimestamp() public view returns (uint256 timestamp);

  /// @notice Initialise this reputation mining cycle.
  /// @dev This will only be called once, by ColonyNetwork, in the same transaction that deploys this contract
  function initialise(address tokenLocking, address clnyToken) public;

  /// @notice Get the number of hashes that have been submitted this mining cycle
  function getNSubmittedHashes() public view returns (uint256 nSubmittedHashes);

  /// @notice Get the number of hashes that have been invalidated this mining cycle
  function getNInvalidatedHashes() public view returns (uint256 nInvalidatedHashes);

  /// @notice Get the address that made a particular submission
  /// @param hash The hash that was submitted
  /// @param nNodes The number of nodes that was submitted
  /// @param index The index of the submission - should be 0-11, as up to twelve submissions can be made.
  function getSubmittedHashes(bytes32 hash, uint256 nNodes, uint256 index) public view returns (address user);
}
