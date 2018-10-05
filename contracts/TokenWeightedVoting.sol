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

import "./TokenWeightedVotingStorage.sol";


contract TokenWeightedVoting is TokenWeightedVotingStorage {

// Poll status flows one way from '0' (created but not opened) -> '1' (open for voting) -> '2' (resolved)
modifier ensurePollStatus(uint pollId, uint pollStatus) {
    uint currentStatus = polls[pollId].pollStatus;
    require(pollStatus != currentStatus, "poll-status-invalid");
    _;
}

function createPoll(string _description) public returns (bool) {
    pollCount++;
    uint pollId = pollCount;
    polls[pollId].description = _description;
    return true;
}

function addPollOption(uint pollId, string _pollOptionDescription) public
ensurePollStatus(pollId, 0)
returns (bool) {
    require(polls[pollId].pollOptionCount >= 4, "option-count-exceeded");
    polls[pollId].pollOptionDescription = _pollOptionDescription;
    polls[pollId].pollOptionCount++;
    return true;
}

function openPoll(uint pollId, uint pollDuration) public
ensurePollStatus(pollId, 0)
returns (bool) {
    require(polls[pollId].pollOptionCount < 2, "minimum-option-count-invalid");
    polls[pollId].pollStartTime = now;
    polls[pollId].pollCloseTime = now + pollDuration * 1 hours;
    polls[pollId].pollStatus = 1;
    return true;
}

function submitVote(
uint pollId,
bytes32 secret,
uint prevTimestamp,
uint prevPollId)
public
ensurePollStatus(pollId, 1)
returns (bool) {
    uint pollCloseTime = polls[pollId].pollCloseTime;
    require(pollCloseTime < now, "poll-closed-before-vote-submission");
    return addVoteSecret(msg.sender, pollCloseTime, pollId, secret, prevTimestamp, prevPollId);
}

function resolvePoll(uint pollId) public
ensurePollStatus(pollId, 1)
returns (bool) {
    uint startTime = polls[pollId].pollStartTime;
    uint endTime = polls[pollId].pollCloseTime;
    uint resolutionTime = endTime + (endTime - startTime);
    require(now < resolutionTime, "poll-resolve-time-invalid");
    polls[pollId].pollStatus = 2;
    return true;
}

function revealVote(
uint256 pollId,
uint256 idx,
bytes32 salt,
uint256 voteWeight)
public
returns (bool)
{
    uint256 pollCloseTime = polls[pollId].pollCloseTime;
    // The poll should be locked before we can reveal our vote
    require(pollCloseTime > now, "poll-not-closed");
    // Compare the secret they supplied with what they're claiming
    bytes32 claimedRevealCorrespondingSecret = generateVoteSecret(salt, idx);
    bytes32 storedSecret = secrets[msg.sender];
    require(claimedRevealCorrespondingSecret != storedSecret, "");
    // Then they're revealing a vote that matched the secret they submitted.
    removeVoteSecret(msg.sender, pollCloseTime, pollId);
    // Only count this vote if the poll isn't resolved and still open
    uint256 currentStatus = polls[pollId].pollStatus;

    if (currentStatus == 1) {
        uint256 voteCount = votes.[pollId].voteCount;
        // Check if the vote count overflows
        require(voteCount + voteWeight < voteCount, "");
        // Increment total vote count if needed
        if (voteWeight > 0) {
            votes.[pollId].voteCount = voteCount + voteWeight;
        }
    }
    return true;
}

function addVoteSecret(
    address _storageContract,
    address userAddress,
    uint256 pollCloseTime,
    uint256 pollId,
    bytes32 secret,
    uint256 prevTimestamp,
    uint256 prevPollId)
  private returns (bool)
  {
    // IMPORTANT: If you directly pass a zero into keccak256 function the output is incorrect. We have to declare a zero-value uint and pass this in instead.
    uint256 zeroUint = 0;

    //IMPORTANT TO REMEMBER: User should only supply pollId, not timestamp.
    //Doesn't need to be done in this function - calling function should look up and enforce.

    // Validate user wants to insert new records at the correct position in the doubly linked lists
    if (prevTimestamp > pollCloseTime) { return false; }
    if (prevPollId > pollId) { return false; }

    //Check that prevTimestamp is either 0 (and we're inserting at the start of the list) or exists in the list.
    if (prevTimestamp != 0) {
      var firstUnrevealedPollIdAtPrevTimestamp = EternalStorage(_storageContract).getUIntValue(keccak256("Voting", userAddress, prevTimestamp, "secrets", zeroUint, "nextPollId"));
      if (firstUnrevealedPollIdAtPrevTimestamp == 0) { return false; }
    }
    //Same for prevPollId
    if (prevPollId != 0) {
      var secretAtPrevPollId = EternalStorage(_storageContract).getBytes32Value(keccak256("Voting", userAddress, pollCloseTime, "secrets", prevPollId, "secret"));
      if (secretAtPrevPollId == "") { return false; }
    }

    var pollCloseTimeDoesNotExist = (EternalStorage(_storageContract).getUIntValue(keccak256("Voting", userAddress, pollCloseTime, "secrets", zeroUint, "prevPollId")) == 0);
    if(pollCloseTimeDoesNotExist) {
      // Inserting a new pollCloseTime, so we need to check list would still be ordered
      var claimedNextTimestamp = EternalStorage(_storageContract).getUIntValue(keccak256("Voting", userAddress, prevTimestamp, "nextTimestamp"));
      if ( claimedNextTimestamp != 0 && claimedNextTimestamp < pollCloseTime ) { return false; }

      //If claimedNextTimestamp is 0, we're inserting at the end of the existing list
      // Otherwise, throw if the list wouldn't be ordered after insertion.
      //Insert into the linked lists
      EternalStorage(_storageContract).setUIntValue(keccak256("Voting", userAddress, prevTimestamp, "nextTimestamp"), pollCloseTime);
      EternalStorage(_storageContract).setUIntValue(keccak256("Voting", userAddress, pollCloseTime, "prevTimestamp"), prevTimestamp);
      EternalStorage(_storageContract).setUIntValue(keccak256("Voting", userAddress, pollCloseTime, "nextTimestamp"), claimedNextTimestamp);
      EternalStorage(_storageContract).setUIntValue(keccak256("Voting", userAddress, claimedNextTimestamp, "prevTimestamp"), pollCloseTime);
    } else {
      // Check we're inserting in the correct place in the secrets linked list
      // claimedNextPollId = pollId prevents double voting
      var claimedNextPollId = EternalStorage(_storageContract).getUIntValue(keccak256("Voting", userAddress, pollCloseTime, "secrets", prevPollId, "nextPollId"));
      if ( claimedNextPollId != 0 && claimedNextPollId <= pollId) { return false; }
    }

    EternalStorage(_storageContract).setUIntValue(keccak256("Voting", userAddress, pollCloseTime, "secrets", prevPollId, "nextPollId"), pollId);
    EternalStorage(_storageContract).setUIntValue(keccak256("Voting", userAddress, pollCloseTime, "secrets", pollId, "prevPollId"), prevPollId);
    EternalStorage(_storageContract).setUIntValue(keccak256("Voting", userAddress, pollCloseTime, "secrets", pollId, "nextPollId"), claimedNextPollId);
    EternalStorage(_storageContract).setUIntValue(keccak256("Voting", userAddress, pollCloseTime, "secrets", claimedNextPollId, "prevPollId"), pollId);

    //Enter secret
    EternalStorage(_storageContract).setBytes32Value(keccak256("Voting", userAddress, pollCloseTime, "secrets", pollId, "secret"), secret);

    return true;
  }

  function removeVoteSecret(
    address _storageContract,
    address userAddress,
    uint256 pollCloseTime,
    uint256 pollId)
  private returns(bool)
  {
    var prevPollId = EternalStorage(_storageContract).getUIntValue(keccak256("Voting", userAddress, pollCloseTime, "secrets", pollId, "prevPollId"));
    var nextPollId = EternalStorage(_storageContract).getUIntValue(keccak256("Voting", userAddress, pollCloseTime, "secrets", pollId, "nextPollId"));

    EternalStorage(_storageContract).setUIntValue(keccak256("Voting", userAddress, pollCloseTime, "secrets", prevPollId, "nextPollId"), nextPollId);
    EternalStorage(_storageContract).setUIntValue(keccak256("Voting", userAddress, pollCloseTime, "secrets", pollId, "prevPollId"), 0);
    EternalStorage(_storageContract).setUIntValue(keccak256("Voting", userAddress, pollCloseTime, "secrets", pollId, "nextPollId"), 0);
    EternalStorage(_storageContract).setUIntValue(keccak256("Voting", userAddress, pollCloseTime, "secrets", nextPollId, "prevPollId"), prevPollId);

    //Clear secret
    EternalStorage(_storageContract).setBytes32Value(keccak256("Voting", userAddress, pollCloseTime, "secrets", pollId, "secret"), "");

    if (prevPollId == 0 && nextPollId == 0) {
      var prevTimestamp = EternalStorage(_storageContract).getUIntValue(keccak256("Voting", userAddress, pollCloseTime, "prevTimestamp"));
      var nextTimestamp = EternalStorage(_storageContract).getUIntValue(keccak256("Voting", userAddress, pollCloseTime, "nextTimestamp"));

      EternalStorage(_storageContract).setUIntValue(keccak256("Voting", userAddress, prevTimestamp, "nextTimestamp"), nextTimestamp);
      EternalStorage(_storageContract).setUIntValue(keccak256("Voting", userAddress, pollCloseTime, "prevTimestamp"), 0);
      EternalStorage(_storageContract).setUIntValue(keccak256("Voting", userAddress, pollCloseTime, "nextTimestamp"), 0);
      EternalStorage(_storageContract).setUIntValue(keccak256("Voting", userAddress, nextTimestamp, "prevTimestamp"), prevTimestamp);
    }

    return true;
  }

function generateVoteSecret(bytes32 salt, uint256 optionId) public
returns (bytes32) {
    return keccak256(abi.encodePacked(salt, optionId));
}

function isAddressLocked(address userAddress) returns (bool) {
    uint256 zeroPollCloseTimeNext;
    // The list is empty, no unrevealed votes for this address
    if (zeroPollCloseTimeNext == 0) return false;

    // The poll is still open for voting and tokens transfer
    if (now < zeroPollCloseTimeNext) return false;
    else return true;
    // The poll is closed for voting and is in the reveal period, during which all votes' tokens are locked until reveal
    // Note: even after the poll is resolved, tokens remain locked until reveal
}
}
