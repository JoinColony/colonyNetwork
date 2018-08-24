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

import "../lib/dappsys/auth.sol";

// TODO: Can we handle all possible disputes regarding the very first hash that should be set?
// Currently, at the very least, we can't handle a dispute if the very first entry is disputed.
// A possible workaround would be to 'kick off' reputation mining with a known dummy state...


contract ReputationMiningCycleStorage is DSAuth {
  // Address of the Resolver contract used by EtherRouter for lookups and routing
  address resolver;

  ReputationLogEntry[] reputationUpdateLog;
  struct ReputationLogEntry {
    address user;
    int amount;
    uint256 skillId;
    address colony;
    uint256 nUpdates;
    uint256 nPreviousUpdates;
  }
  address colonyNetworkAddress;
  address tokenLockingAddress;
  address clnyTokenAddress;
  // TODO: Do we need both these mappings?
  mapping (bytes32 => mapping( uint256 => address[])) submittedHashes;
  mapping (address => Submission) reputationHashSubmissions;
  uint256 reputationMiningWindowOpenTimestamp;
  mapping (uint256 => Submission[]) disputeRounds;

  // Tracks the number of submissions in each round that have completed their challenge, one way or the other.
  // This might be that they passed the challenge, it might be that their opponent passed (and therefore by implication,
  // they failed), or it might be that they timed out
  mapping (uint256 => uint256) nHashesCompletedChallengeRound;
  // A flaw with this is that if someone spams lots of nonsense transactions, then 'good' users still have to come along and
  // explicitly complete the pairings. But if they get the tokens that were staked in order to make the submission, maybe
  // that's okay...?

  // Number of unique hashes submitted
  uint256 nSubmittedHashes = 0;
  uint256 nInvalidatedHashes = 0;

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
    uint256 jrhNnodes;                    // The number of nodes in the tree the JRH is the root of.
    uint256 lowerBound;                   // During the binary search, the lowest index in the justification tree that might still be the
                                          // first place where the two submissions differ.
    uint256 upperBound;                   // During the binary search, the highest index in the justification tree that might still be the
                                          // first place where the two submissions differ.
                                          // When the binary search is complete, lowerBound and upperBound are equal
    uint256 provedPreviousReputationUID;  // If the disagreement between this submission and its opponent is related to the insertion of a
                                          // new leaf, the submitters also submit proof of a reputation in a state that the two agree on. The
                                          // UID that reputation has is stored here, and whichever submission proves the higher existing UID is
                                          // deemed correct, assuming it also matches the UID for the new reputation being inserted.
  }

  // Records for which hashes, for which addresses, for which entries have been accepted
  // Otherwise, people could keep submitting the same entry.
  mapping (bytes32 => mapping(address => mapping(uint256 => bool))) submittedEntries;

}
