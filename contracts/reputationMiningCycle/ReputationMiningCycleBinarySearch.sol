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

pragma solidity 0.5.8;
pragma experimental "ABIEncoderV2";

import "../../lib/dappsys/math.sol";
import "../colonyNetwork/IColonyNetwork.sol";
import "../patriciaTree/PatriciaTreeProofs.sol";
import "../tokenLocking/ITokenLocking.sol";
import "./ReputationMiningCycleStorage.sol";
import "./ReputationMiningCycleCommon.sol";


contract ReputationMiningCycleBinarySearch is ReputationMiningCycleCommon {
  function respondToBinarySearchForChallenge(
    uint256 round,
    uint256 idx,
    bytes memory jhIntermediateValue,
    bytes32[] memory siblings
  ) public
  {
    require(idx < disputeRounds[round].length, "colony-reputation-mining-index-beyond-round-length");
    require(disputeRounds[round][idx].lowerBound != disputeRounds[round][idx].upperBound, "colony-reputation-mining-challenge-not-active");
    require(
      responsePossible(DisputeStages.BinarySearchResponse, disputeRounds[round][idx].lastResponseTimestamp),
      "colony-reputation-mining-user-ineligible-to-respond"
    );

    uint256 targetNode = disputeRounds[round][idx].lowerBound;
    bytes32 targetHashDuringSearch = disputeRounds[round][idx].targetHashDuringSearch;
    bytes32 impliedRoot;
    bytes32[2] memory lastSiblings;

    Submission storage submission = reputationHashSubmissions[disputeRounds[round][idx].firstSubmitter];
    // Check proof is the right length
    uint256 expectedLength = expectedProofLength(submission.jrhNLeaves, disputeRounds[round][idx].lowerBound) -
      (disputeRounds[round][idx].challengeStepCompleted - 1); // We expect shorter proofs the more chanllenge rounds we've done so far
    require(expectedLength == siblings.length, "colony-reputation-mining-invalid-binary-search-proof-length");
    // Because branchmasks are used from the end, we can just get the whole branchmask. We will run out of siblings before we run out of
    // branchmask, if everything is working right.
    uint256 branchMask = expectedBranchMask(submission.jrhNLeaves, disputeRounds[round][idx].lowerBound);

    (impliedRoot, lastSiblings) = getFinalPairAndImpliedRootNoHash(
      bytes32(targetNode),
      jhIntermediateValue,
      branchMask,
      siblings
    );
    require(impliedRoot == targetHashDuringSearch, "colony-reputation-mining-invalid-binary-search-response");
    // If require hasn't thrown, proof is correct.
    // Process the consequences
    processBinaryChallengeSearchResponse(round, idx, jhIntermediateValue, lastSiblings);
    // Reward the user
    rewardResponder(msg.sender);

    emit BinarySearchStep(submission.proposedNewRootHash, submission.nLeaves, submission.jrh);
  }

  function confirmBinarySearchResult(
    uint256 round,
    uint256 idx,
    bytes memory jhIntermediateValue,
    bytes32[] memory siblings
  ) public
  {
    require(idx < disputeRounds[round].length, "colony-reputation-mining-index-beyond-round-length");
    Submission storage submission = reputationHashSubmissions[disputeRounds[round][idx].firstSubmitter];
    require(submission.jrhNLeaves != 0, "colony-reputation-jrh-hash-not-verified");
    require(disputeRounds[round][idx].lowerBound == disputeRounds[round][idx].upperBound, "colony-reputation-binary-search-incomplete");
    require(
      2**(disputeRounds[round][idx].challengeStepCompleted - 2) <= submission.jrhNLeaves,
      "colony-reputation-binary-search-result-already-confirmed"
    );
    require(
      responsePossible(DisputeStages.BinarySearchConfirm, disputeRounds[round][idx].lastResponseTimestamp),
      "colony-reputation-mining-user-ineligible-to-respond"
    );

    // uint256 targetNode = disputeRounds[round][idx].lowerBound;
    uint256 branchMask = expectedBranchMask(submission.jrhNLeaves, disputeRounds[round][idx].lowerBound);
    bytes32 impliedRoot = getImpliedRootNoHashKey(bytes32(disputeRounds[round][idx].lowerBound), jhIntermediateValue, branchMask, siblings);
    require(impliedRoot == submission.jrh, "colony-reputation-mining-invalid-binary-search-confirmation");
    bytes32 intermediateReputationHash;
    uint256 intermediateReputationNLeaves;
    assembly {
      intermediateReputationHash := mload(add(jhIntermediateValue, 0x20))
      intermediateReputationNLeaves := mload(add(jhIntermediateValue, 0x40))
    }
    disputeRounds[round][idx].intermediateReputationHash = intermediateReputationHash;
    disputeRounds[round][idx].intermediateReputationNLeaves = intermediateReputationNLeaves;
    while (2**(disputeRounds[round][idx].challengeStepCompleted - 2) <= submission.jrhNLeaves) {
      disputeRounds[round][idx].challengeStepCompleted += 1;
    }
    disputeRounds[round][idx].lastResponseTimestamp = now;

    rewardResponder(msg.sender);

    emit BinarySearchConfirmed(submission.proposedNewRootHash, submission.nLeaves, submission.jrh, disputeRounds[round][idx].lowerBound);
  }

  function processBinaryChallengeSearchResponse(
    uint256 round,
    uint256 idx,
    bytes memory jhIntermediateValue,
    bytes32[2] memory lastSiblings
  ) internal
  {
    disputeRounds[round][idx].lastResponseTimestamp = now;
    disputeRounds[round][idx].challengeStepCompleted += 1;
    // Save our intermediate hash
    bytes32 intermediateReputationHash;
    uint256 intermediateReputationNLeaves;
    assembly {
      intermediateReputationHash := mload(add(jhIntermediateValue, 0x20))
      intermediateReputationNLeaves := mload(add(jhIntermediateValue, 0x40))
    }
    disputeRounds[round][idx].intermediateReputationHash = intermediateReputationHash;
    disputeRounds[round][idx].intermediateReputationNLeaves = intermediateReputationNLeaves;

    disputeRounds[round][idx].hash1 = lastSiblings[0];
    disputeRounds[round][idx].hash2 = lastSiblings[1];

    uint256 opponentIdx = getOpponentIdx(idx);
    if (disputeRounds[round][opponentIdx].challengeStepCompleted == disputeRounds[round][idx].challengeStepCompleted ) {
      // Our opponent answered this challenge already.
      // Compare our intermediateReputationHash to theirs to establish how to move the bounds.
      processBinaryChallengeSearchStep(round, idx);
    }
  }

  function processBinaryChallengeSearchStep(uint256 round, uint256 idx) internal {
    uint256 opponentIdx = getOpponentIdx(idx);
    uint256 searchWidth = (disputeRounds[round][idx].upperBound - disputeRounds[round][idx].lowerBound) + 1;
    uint256 searchWidthNextPowerOfTwo = nextPowerOfTwoInclusive(searchWidth);
    if (
      disputeRounds[round][opponentIdx].hash1 == disputeRounds[round][idx].hash1
      )
    {
      disputeRounds[round][idx].lowerBound += searchWidthNextPowerOfTwo/2;
      disputeRounds[round][opponentIdx].lowerBound += searchWidthNextPowerOfTwo/2;
      disputeRounds[round][idx].targetHashDuringSearch = disputeRounds[round][idx].hash2;
      disputeRounds[round][opponentIdx].targetHashDuringSearch = disputeRounds[round][opponentIdx].hash2;
    } else {
      disputeRounds[round][idx].upperBound -= (searchWidth - searchWidthNextPowerOfTwo/2);
      disputeRounds[round][opponentIdx].upperBound -= (searchWidth - searchWidthNextPowerOfTwo/2);
      disputeRounds[round][idx].targetHashDuringSearch = disputeRounds[round][idx].hash1;
      disputeRounds[round][opponentIdx].targetHashDuringSearch = disputeRounds[round][opponentIdx].hash1;
    }
    // We need to keep the intermediate hashes so that we can figure out what type of dispute we are resolving later
    // If the number of nodes in the reputation state are different, then we are disagreeing on whether this log entry
    // corresponds to an existing reputation entry or not.
    // If the hashes are different, then it's a calculation error.
    // However, the intermediate hashes saved might not be the ones that correspond to the first disagreement, based on how exactly the last
    // step of the binary challenge came to be.

    // If complete, mark that the binary search is completed (but the intermediate hashes may or may not be correct) by setting
    // challengeStepCompleted to the maximum it could be for the number of nodes we had to search through, plus one to indicate
    // they've submitted their jrh
    Submission storage submission = reputationHashSubmissions[disputeRounds[round][idx].firstSubmitter];
    if (disputeRounds[round][idx].lowerBound == disputeRounds[round][idx].upperBound) {
      if (2**(disputeRounds[round][idx].challengeStepCompleted-1) < submission.jrhNLeaves) {
        disputeRounds[round][idx].challengeStepCompleted += 1;
        disputeRounds[round][opponentIdx].challengeStepCompleted += 1;
      }
    }

    // Our opponent responded to this step of the challenge before we did, so we should
    // reset their 'last response' time to now, as they aren't able to respond
    // to the next challenge before they know what it is!
    disputeRounds[round][opponentIdx].lastResponseTimestamp = now;
  }
}