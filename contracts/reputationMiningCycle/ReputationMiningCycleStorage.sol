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

import "./../../lib/dappsys/auth.sol";
import "./../reputationMiningCycle/ReputationMiningCycleDataTypes.sol";

// ignore-file-swc-131
// ignore-file-swc-108


contract ReputationMiningCycleStorage is ReputationMiningCycleDataTypes, DSAuth {
  // From DSAuth there is authority and owner at storage slots 0 and 1 respectively
  // These are not used but are necessary for alignment when casting from EtherRouter

  // Address of the Resolver contract used by EtherRouter for lookups and routing
  address resolver; // Storage slot 2

  address payable colonyNetworkAddress; // Storage slot 3
  address tokenLockingAddress; // Storage slot 4
  address clnyTokenAddress; // Storage slot 5

  ReputationLogEntry[] reputationUpdateLog; // Storage slot 6
  mapping (bytes32 => mapping(uint256 => mapping(bytes32 => address[]))) submittedHashes; // Storage slot 7
  // Maps the addresses of miners making submissions on to the submissions they made
  mapping (address => Submission) reputationHashSubmissions; // Storage slot 8
  uint256 reputationMiningWindowOpenTimestamp; // Storage slot 9
  // Maps dispute rounds onto individual submissions indexed in an array
  // Each DisputeEntry corresponds to a Submission in reputationHashSubmissions
  mapping (uint256 => DisputedEntry[]) disputeRounds; // Storage slot 10

  // Tracks the number of submissions in each round that have completed their challenge, one way or the other.
  // This might be that they passed the challenge, it might be that their opponent passed (and therefore by implication,
  // they failed), or it might be that they timed out
  mapping (uint256 => uint256) nHashesCompletedChallengeRound; // Storage slot 11
  // A flaw with this is that if someone spams lots of nonsense transactions, then 'good' users still have to come along and
  // explicitly complete the pairings. But if they get the tokens that were staked in order to make the submission, maybe
  // that's okay...?

  // Number of unique hashes submitted
  uint256 nUniqueSubmittedHashes = 0; // Storage slot 12
  uint256 nInvalidatedHashes = 0; // Storage slot 13

  // Records for which addresses, for which entries have been accepted
  // Otherwise, people could keep submitting the same entry.
  mapping (address => mapping(uint256 => bool)) submittedEntries; // Storage slot 14

  int256 constant MAX_INT128 = 2**127 - 1;
  int256 constant MIN_INT128 = (2**127)*(-1);

  uint256 firstIncompleteRound; // Storage slot 15

  // Tracks whether the address in question has helped during a challenge / response process
  mapping (address => bool) respondedToChallenge;  // Storage slot 16

  uint256 stakeLost; // Storage slot 17
  uint256 rewardsPaidOut; // Storage slot 18
  uint256 cachedDisputeRewardSize; // Storage slot 19
}
