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

pragma solidity >=0.4.23;


contract ReputationMiningCycleDataTypes {

  struct ReputationLogEntry {
    address user;
    int256 amount;
    uint256 skillId;
    address colony;
    uint256 nUpdates;
    uint256 nPreviousUpdates;
  }

  struct Submission {
    bytes32 proposedNewRootHash;          // The hash that the submitter is proposing as the next reputation hash
    uint256 nNodes;                       // The number of nodes in the reputation tree being proposed as the next reputation hash
    uint256 lastResponseTimestamp;        // If nonzero, the last time that a valid response was received corresponding to this
                                          // submission during the challenge process - either binary searching for the challenge,
                                          // responding to the challenge itself or submitting the JRH
    uint256 challengeStepCompleted;       // How many valid responses have been received corresponding to this submission during
                                          // the challenge process.
    bytes32 jrh;                          // The Justification Root Hash corresponding to this submission.
    bytes32 intermediateReputationHash;   // The hash this submission hash has as a leaf node in the tree the JRH is the root of where
                                          // this submission and its opponent differ for the first time.
    uint256 intermediateReputationNNodes; // The number of nodes in the reputation tree in the reputation state where this submission and
                                          // its opponent first differ.
    uint256 jrhNNodes;                    // The number of nodes in the tree the JRH is the root of.
    uint256 lowerBound;                   // During the binary search, the lowest index in the justification tree that might still be the
                                          // first place where the two submissions differ.
    uint256 upperBound;                   // During the binary search, the highest index in the justification tree that might still be the
                                          // first place where the two submissions differ.
                                          // When the binary search is complete, lowerBound and upperBound are equal
    uint256 provedPreviousReputationUID;  // If the disagreement between this submission and its opponent is related to the insertion of a
                                          // new leaf, the submitters also submit proof of a reputation in a state that the two agree on. The
                                          // UID that reputation has is stored here, and whichever submission proves the higher existing UID is
                                          // deemed correct, assuming it also matches the UID for the new reputation being inserted.
    bytes32 targetHashDuringSearch;       // The hash we are requesting proofs for as the next stage of the binary search, if it is running
    bytes32 hash1;                        // The hash that is the immediate child on the left hand side of the last hash that was proved during
                                          // the binary search
    bytes32 hash2;                        // The hash that is the immediate child on the right hand side of the last hash that was proved during
                                          // the binary search
                                          // These two hashes are compared, and depending on whether the hashes on the LHS are the same or not, 
                                          // determines which part of the tree the search continues down looking for the first discrepancy in the 
                                          // Justification tree.
  }

  /// @notice Event logged when a reputation UID is proven to be correct in a challenge
  event ProveUIDSuccess(uint256 previousNewReputationUID, uint256 _disagreeStateReputationUID, bool existingUID);
  
  /// @notice Event logged when a reputation value is proven to be correct in a challenge
  event ProveValueSuccess(int256 _agreeStateReputationValue, int256 _disagreeStateReputationValue, int256 _originReputationValue);
}
