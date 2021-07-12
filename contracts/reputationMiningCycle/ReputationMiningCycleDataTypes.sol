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

pragma solidity 0.7.3;


interface ReputationMiningCycleDataTypes {

  struct ReputationLogEntry {
    address user;
    int256 amount;
    uint256 skillId;
    address colony;
    uint128 nUpdates;
    uint128 nPreviousUpdates;
  }

  struct Submission {
    bytes32 proposedNewRootHash;          // The hash that the submitter is proposing as the next reputation hash
    uint256 nLeaves;                      // The number of leaves in the reputation tree being proposed as the next reputation hash
    bytes32 jrh;                          // The Justification Root Hash corresponding to this submission.
    uint256 jrhNLeaves;                   // The number of leaves in the tree the JRH is the root of.
  }

  struct DisputedEntry {
    address firstSubmitter;               // Address of the first miner who proposed the referenced Submission
    uint256 lastResponseTimestamp;        // If nonzero, the last time that a valid response was received corresponding to this
                                          // submission during the challenge process - either binary searching for the challenge,
                                          // responding to the challenge itself or submitting the JRH
    uint256 challengeStepCompleted;       // How many valid responses have been received corresponding to this submission during
                                          // the challenge process.
    bytes32 intermediateReputationHash;   // The hash this submission hash has as a leaf node in the tree the JRH is the root of where
                                          // this submission and its opponent differ for the first time.
    uint256 intermediateReputationNLeaves; // The number of leaves in the reputation tree in the reputation state where this submission and
                                          // its opponent first differ.
    uint256 lowerBound;                   // During the binary search, the lowest index in the justification tree that might still be the
                                          // first place where the two submissions differ.
    uint256 upperBound;                   // During the binary search, the highest index in the justification tree that might still be the
                                          // first place where the two submissions differ.
                                          // When the binary search is complete, lowerBound and upperBound are equal
    bytes32 targetHashDuringSearch;       // The hash we are requesting proofs for as the next stage of the binary search, if it is running
    bytes32 hash1;                        // The hash that is the immediate child on the left hand side of the last hash that was proved during
                                          // the binary search
    bytes32 hash2;                        // The hash that is the immediate child on the right hand side of the last hash that was proved during
                                          // the binary search
                                          // These two hashes are compared, and depending on whether the hashes on the LHS are the same or not,
                                          // determines which part of the tree the search continues down looking for the first discrepancy in the
                                          // Justification tree.
  }


  enum DisputeStages { ConfirmJRH, BinarySearchResponse, BinarySearchConfirm, RespondToChallenge, InvalidateHash, ConfirmNewHash }

  event ReputationRootHashSubmitted(address _miner, bytes32 _newHash, uint256 _nLeaves, bytes32 _jrh, uint256 _entryIndex);
  event JustificationRootHashConfirmed(bytes32 _newHash, uint256 _nLeaves, bytes32 _jrh);
  event BinarySearchConfirmed(bytes32 _newHash, uint256 _nLeaves, bytes32 _jrh, uint256 _firstDisagreeIdx);
  event ChallengeCompleted(bytes32 _newHash, uint256 _nLeaves, bytes32 _jrh);
  event HashInvalidated(bytes32 _newHash, uint256 _nLeaves, bytes32 _jrh);
  event BinarySearchStep(bytes32 _newHash, uint256 _nLeaves, bytes32 _jrh);

  /// @notice Event logged when a reputation UID is proven to be correct in a challenge
  event ProveUIDSuccess(uint256 previousNewReputationUID, uint256 _disagreeStateReputationUID, bool _existingUID);

  /// @notice Event logged when a reputation value is proven to be correct in a challenge
  event ProveValueSuccess(int256 _agreeStateReputationValue, int256 _disagreeStateReputationValue, int256 _originReputationValue);
}
