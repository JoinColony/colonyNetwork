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

pragma solidity >=0.5.8; // ignore-swc-103
pragma experimental "ABIEncoderV2";

import "./ReputationMiningCycleDataTypes.sol";


contract IReputationMiningCycle is ReputationMiningCycleDataTypes {
  /// @notice The getter for the disputeRounds mapping.
  /// @param _round The dispute round to query
  /// @return submissions An array of DisputedEntrys struct for the round.
  /// See ReputationMiningCycleDataTypes for the full description of the properties.
  function getDisputeRound(uint256 _round) public view returns (DisputedEntry[] memory submissions);

  /// @notice The getter for the hashSubmissions mapping, which keeps track of submissions by user.
  /// @param _user Address of the user
  /// @return submission the Submission struct for the submission requested. See ReputationMiningCycleDataTypes.sol for the full description.
  function getReputationHashSubmission(address _user) public view returns (Submission memory submission);

  /// @notice Get the hash for the corresponding entry.
  /// @param submitter The address that submitted the hash
  /// @param entryIndex The index of the entry that they used to submit the hash
  /// @param newHash The hash that they submitted
  /// @return entryHash The hash for the corresponding entry
  function getEntryHash(address submitter, uint256 entryIndex, bytes32 newHash) public pure returns (bytes32 entryHash);

  /// @notice Returns a boolean result of whether the miner has already submitted at this entry index.
  /// @param _miner The address that submitted the hash
  /// @param _index The index of the entry that they used to submit the hash
  /// @return result Boolean whether the entryIndex was already submitted
  function minerSubmittedEntryIndex(address _miner, uint256 _index) public view returns (bool result);

  /// @notice Resets the timestamp that the submission window opens to `now`.
  /// @dev only allowed to be called by ColonyNetwork.
  function resetWindow() public;

  /// @notice Submit a new reputation root hash.
  /// @param newHash The proposed new reputation root hash
  /// @param nNodes Number of nodes in tree with root `newHash`
  /// @param jrh The justifcation root hash for this submission
  /// @param entryIndex The entry number for the given `newHash` and `nNodes`
  function submitRootHash(bytes32 newHash, uint256 nNodes, bytes32 jrh, uint256 entryIndex) public;

  /// @notice Get whether a challenge round is complete.
  /// @param round The round number to check
  /// @return complete Boolean indicating whether the given round challenge is complete
  function challengeRoundComplete(uint256 round) public view returns (bool complete);

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
  /// @param siblings The siblings of the Merkle proof that `jhIntermediateValue` is the value at key `targetNode`
  function respondToBinarySearchForChallenge(
    uint256 round,
    uint256 idx,
    bytes memory jhIntermediateValue,
    bytes32[] memory siblings) public;

  /// @notice Confirm the result of a binary search - depending on how exactly the binary search finished, the saved binary search intermediate state might be incorrect.
  /// @notice This function ensures that the intermediate hashes saved are correct.
  /// @param round The round number the hash we are responding on behalf of is in
  /// @param idx The index in the round that the hash we are responding on behalf of is in
  /// @param jhIntermediateValue The contents of the Justification Tree at the key given by `targetNode` (see function description). The value of `targetNode` is computed locally to establish what to submit to this function.
  /// @param siblings The siblings of the Merkle proof that `jhIntermediateValue` is the value at key `targetNode`
  function confirmBinarySearchResult(
    uint256 round,
    uint256 idx,
    bytes memory jhIntermediateValue,
    bytes32[] memory siblings) public;

  /// @notice Respond to challenge, to establish which (if either) of the two submissions facing off are correct.
  /// @param u A `uint256[27]` array. The elements of this array, in order are:
  /// * 1. The current round of the hash being responded on behalf of
  /// * 2. The current index in the round of the hash being responded on behalf of
  /// * 3. The branchMask of the proof that the reputation is in the reputation state tree for the reputation with the disputed change
  /// * 4. The number of nodes in the last reputation state that both submitted hashes agree on
  /// * 5. The branchMask of the proof that the last reputation state the submitted hashes agreed on is in this submitted hash's justification tree
  /// * 6. The number of nodes this hash considers to be present in the first reputation state the two hashes in this challenge disagree on
  /// * 7. The branchMask of the proof that reputation root hash of the first reputation state the two hashes in this challenge disagree on is in this submitted hash's justification tree
  /// * 8. The index of the log entry that the update in question was implied by. Each log entry can imply multiple reputation updates, and so we expect the clients to pass
  ///      the log entry index corresponding to the update to avoid us having to iterate over the log.
  /// * 9. A dummy variable that should be set to 0. If nonzero, transaction will still work but be slightly more expensive. For an explanation of why this is present, look at the corresponding solidity code.
  /// * 10. Origin skill reputation branch mask. Nonzero for child reputation updates.
  ///
  /// * 11. The amount of reputation that the entry in the tree under dispute has in the agree state
  /// * 12. The UID that the entry in the tree under dispute has in the agree state
  /// * 13. The amount of reputation that the entry in the tree under dispute has in the disagree state
  /// * 14. The UID that the entry in the tree under dispute has in the disagree state
  /// * 15. The amount of reputation that the user's origin reputation entry in the tree has in the state being disputed
  /// * 16. The UID that the user's origin reputation entry in the tree has in the state being disputed
  /// * 17. The branchMask of the proof that the child reputation for the user being updated is in the agree state
  /// * 18. The amount of reputation that the child reputation for the user being updated is in the agree state
  /// * 19. The UID of the child reputation for the user being updated in the agree state
  /// * 20. A dummy variable that should be set to 0. If nonzero, transaction will still work but be slightly more expensive. For an explanation of why this is present, look at the corresponding solidity code.
  /// * 21. The branchMask of the proof that the reputation adjacent to the new reputation being inserted is in the agree state
  /// * 22. The amount of reputation that the reputation adjacent to a new reputation being inserted has in the agree state
  /// * 23. The UID of the reputation adjacent to the new reputation being inserted
  /// * 24. A dummy variable that should be set to 0. If nonzero, transaction will still work but be slightly more expensive. For an explanation of why this is present, look at the corresponding solidity code.
  /// * 25. The value of the reputation that would be origin-adjacent that proves that the origin reputation does not exist in the tree
  /// * 26. The value of the reputation that would be child-adjacent that proves that the child reputation does not exist in the tree
  /// @param b32 A `bytes32[8]` array. The elements of this array, in order are:
  /// * 1. The colony address in the key of the reputation being changed that the disagreement is over.
  /// * 2. The skillid in the key of the reputation being changed that the disagreement is over.
  /// * 3. The user address in the key of the reputation being changed that the disagreement is over.
  /// * 4. The keccak256 hash of the key of the reputation being changed that the disagreement is over.
  /// * 5. The keccak256 hash of the key for a reputation already in the tree adjacent to the new reputation being inserted, if required.
  /// * 6. The keccak256 hash of the key of the reputation that would be origin-adjacent that proves that the origin reputation does not exist in the tree
  /// * 7. The keccak256 hash of the key of the reputation that would be child-adjacent that proves that the child reputation does not exist in the tree
  /// @dev note that these are all bytes32; the address should be left padded from 20 bytes to 32 bytes. Strictly, I do not believe the padding matters, but you should use 0s for your own sanity!
  /// @param reputationSiblings The siblings of the Merkle proof that the reputation corresponding to `_reputationKey` is in the reputation state before and after the disagreement
  /// @param agreeStateSiblings The siblings of the Merkle proof that the last reputation state the submitted hashes agreed on is in this submitted hash's justification tree
  /// @param disagreeStateSiblings The siblings of the Merkle proof that the first reputation state the submitted hashes disagreed on is in this submitted hash's justification tree
  /// @param userOriginReputationSiblings Nonzero for child updates only. The siblings of the Merkle proof of the user's origin skill reputation added to the reputation tree in the last reputation state the submitted hashes agree on
  /// @param childReputationSiblings Nonzero for child updates of a colony-wide global skill. The siblings of the Merkle proof of the child skill reputation of the user in the same skill this global update is for
  /// @param adjacentReputationSiblings Nonzero for updates involving insertion of a new skill. The siblings of the Merkle proof of a reputation in the agree state that ends adjacent to the new reputation
  /// @dev If you know that the disagreement doesn't involve a new reputation being added, the arguments corresponding to the previous new reputation can be zeroed, as they will not be used. You must be sure
  /// that this is the case, however, otherwise you risk being found incorrect. Zeroed arguments will result in a cheaper call to this function.
  function respondToChallenge(
    uint256[26] memory u, //An array of 26 UINT Params, ordered as given above.
    bytes32[7] memory b32,
    bytes32[] memory reputationSiblings,
    bytes32[] memory agreeStateSiblings,
    bytes32[] memory disagreeStateSiblings,
    bytes32[] memory userOriginReputationSiblings,
    bytes32[] memory childReputationSiblings,
    bytes32[] memory adjacentReputationSiblings) public;

  /// @notice Verify the Justification Root Hash (JRH) for a submitted reputation hash is plausible.
  /// @param round The round that the hash is currently in.
  /// @param index The index in the round that the hash is currently in
  /// @param siblings1 The siblings for the same Merkle proof
  /// @param siblings2 The siblings for the same Merkle proof
  /// @dev The majority of calls to this function will have `round` equal to `0`. The exception to this is when a submitted hash is given a bye, in which case `round` will be nonzero.
  /// @dev Note that it is possible for this function to be required to be called in every round - the hash getting the bye can wait until they will also be awarded the bye in the next round, if
  /// one is going to exist. There is an incentive to do so from a gas-cost perspective, but they don't know for sure there's going to be a bye until the submission window has expired, so I think
  /// this is okay.
  function confirmJustificationRootHash(
    uint256 round,
    uint256 index,
    bytes32[] memory siblings1,
    bytes32[] memory siblings2) public;

  /// @notice Add a new entry to the reputation update log.
  /// @param _user The address of the user having their reputation changed by this log entry
  /// @param _amount The amount by which the user's reputation is going to change. Can be positive or negative.
  /// @param _skillId The skillId of the reputation being affected
  /// @param _colonyAddress The address of the colony the reputation is being affected in
  /// @param _nParents The number of parent skills the skill defined by the skillId has
  /// @param _nChildren The number of child skills the skill defined by the skillId has
  function appendReputationUpdateLog(
    address _user,
    int256 _amount,
    uint256 _skillId,
    address _colonyAddress,
    uint128 _nParents,
    uint128 _nChildren
    ) public;

  /// @notice Get the length of the ReputationUpdateLog stored on this instance of the ReputationMiningCycle contract.
  /// @return nUpdates
  function getReputationUpdateLogLength() public view returns (uint256 nUpdates);

  /// @notice Get the `ReputationLogEntry` at index `_id`.
  /// @param _id The reputation log members array index of the entry to get
  /// @return reputationUpdateLogEntry The Reputation Update Log Entry
  function getReputationUpdateLogEntry(uint256 _id) public view returns (ReputationLogEntry memory reputationUpdateLogEntry);

  /// @notice Start the reputation log with the rewards for the stakers who backed the accepted new reputation root hash.
  /// @param stakers The array of stakers addresses to receive the reward.
  /// @param weights The array of weights determining the proportion of reward to go to each staker
  /// @param metaColonyAddress The address of the meta colony, which the special mining skill is earned in
  /// @param reward The amount of reputation to be rewarded to each staker
  /// @param miningSkillId Skill id of the special mining skill
  /// @dev Only callable by colonyNetwork.
  /// Note that the same address might be present multiple times in `stakers` - this is acceptable, and indicates the
  /// same address backed the same hash multiple times with different entries.
  function rewardStakersWithReputation(
    address[] memory stakers,
    uint256[] memory weights,
    address metaColonyAddress,
    uint256 reward,
    uint256 miningSkillId
    ) public;

  /// @notice Get the timestamp that the current reputation mining window opened.
  /// @return timestamp The timestamp
  function getReputationMiningWindowOpenTimestamp() public view returns (uint256 timestamp);

  /// @notice Initialise this reputation mining cycle.
  /// @dev This will only be called once, by ColonyNetwork, in the same transaction that deploys this contract.
  /// @param tokenLocking Address of the TokenLocking contract
  /// @param clnyToken Address of the CLNY token
  function initialise(address tokenLocking, address clnyToken) public;

  /// @notice Get the number of unique hash/nnodes/jrh sets that have been submitted this mining cycle.
  /// @return nUniqueSubmittedHashes Number of unique hash/nnodes/jrh sets in this cycle
  function getNUniqueSubmittedHashes() public view returns (uint256 nUniqueSubmittedHashes);

  /// @notice Get the number of hashes that have been invalidated this mining cycle.
  /// @return nInvalidatedHashes Number of invalidated hashes in this mining cycle
  function getNInvalidatedHashes() public view returns (uint256 nInvalidatedHashes);

  /// @notice Get the minimum stake of CLNY required to mine.
  /// @return minStake The minimum stake amount
  function getMinStake() public pure returns (uint256 minStake);

  /// @notice Get the length of the mining window in seconds.
  /// @return miningWindowDuration Duration of the reputation mining window in seconds
  function getMiningWindowDuration() public pure returns (uint256 miningWindowDuration);

  /// @notice Get the reputation decay constant.
  /// @return numerator The numerator of the decay constant
  /// @return denominator The denominator of the decay constant
  function getDecayConstant() public pure returns (uint256 numerator, uint256 denominator);

  /// @notice Get the address that made a particular submission.
  /// @param hash The hash that was submitted
  /// @param nNodes The number of nodes that was submitted
  /// @param jrh The JRH of that was submitted
  /// @param index The index of the submission - should be 0-11, as up to twelve submissions can be made.
  /// @return user Address of the user that submitted the hash / nNodes/ jrh at index
  function getSubmissionUser(bytes32 hash, uint256 nNodes, bytes32 jrh, uint256 index) public view returns (address user);

  /// @notice Get the number of submissions miners made of a particular hash / nNodes / jrh combination.
  /// @param hash The hash that was submitted
  /// @param nNodes The number of nodes that was submitted
  /// @param jrh The JRH of that was submitted
  /// @return count The number of submissions - should be 0-12, as up to twelve submissions can be made
  function getNSubmissionsForHash(bytes32 hash, uint256 nNodes, bytes32 jrh) public view returns (uint256 count);
}
