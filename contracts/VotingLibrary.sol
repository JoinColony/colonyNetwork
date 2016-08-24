import "EternalStorage.sol";


library VotingLibrary {
  // Manages records for colony polls and votes stored in the format:
  // sha3("Voting", "FirstLock", userAddress) => int timeStamp

  // sha3("Voting", userAddress, pollLockTime, "secrets", pollId, "secret") => bytes32 secret
  // sha3("Voting", userAddress, pollLockTime, "secrets", pollId, "prevPollId") => uint pollId
  // sha3("Voting", userAddress, pollLockTime, "secrets", pollId, "nextPollId") => uint pollId

  // sha3("Voting", userAddress, pollLockTime, "unrevealedVotesCount") => uint256 unrevealedVotesCount
  // sha3("Voting", userAddress, pollLockTime, "firstUnrevealedVote") => uint256 pollId
  // sha3("Voting", userAddress, pollLockTime, "prevTimestamp") => uint256 pollLockTime
  // sha3("Voting", userAddress, pollLockTime, "nextTimestamp") => uint256 pollLockTime

  function setLock(
    address _storageContract,
    address userAddress,
    uint256 pollTimeStamp,
    uint256 pollId,
    bytes32 secret,
    uint256 prevTimestamp,
    uint256 prevPollId) {

      // Validate user wants to insert new records at the correct position in the doubly linked lists
      if (prevTimestamp > pollTimeStamp) { throw; }
      if (prevPollId > pollId) { throw; }

      var userFirstLock = EternalStorage(_storageContract).getUIntValue(sha3("Voting", "FirstLock", userAddress));
      var unrevealedVotesCountAtTimestamp = EternalStorage(_storageContract).getUIntValue(sha3("Voting", userAddress, pollLockTime, "unrevealedVotesCount"));

      if(unrevealedVotesCountAtTimestamp > 0) {
        // Adding to existing pollLockTime

      }
      else {
        // Inserting a new pollLockTime, so we need to check list would still be ordered
        var claimedNextTimestamp = EternalStorage(_storageContract).getUIntValue( sha3("Voting", userAddress, prevTimestamp, "nextTimestamp"));
        if ( claimedNextTimestamp != 0 && claimedNextTimestamp <= pollTimeStamp ) { throw; }
        // If x is 0, we're inserting at the end of the existing list
        // Otherwise, throw if the list wouldn't be ordered after insertion.

        EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, prevTimestamp, "nextTimestamp"), pollLockTime);
        EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollLockTime, "prevTimestamp"), prevTimestamp);
        EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollLockTime, "nextTimestamp"), claimedNextTimestamp);
        EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, claimedNextTimestamp, "prevTimestamp"), pollLockTime);

        if (prevTimestamp ==0) {
          EternalStorage(_storageContract).setUIntValue(sha3("Voting", "FirstLock", userAddress), pollLockTime);
        }
      };

      // Check we're inserting in the correct place in the secrets linked list
      var claimedNextPollId = EternalStorage(_storageContract).getUIntValue(sha3("Voting", userAddress, pollLockTime, "secrets", prevPollId, "nextPollId"));
      if ( claimedNextPollId != 0 && claimedNextPollId <= pollId) { throw; }

      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollLockTime, "secrets", prevPollId, "nextPollId"), pollId);
      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollLockTime, "secrets", pollId, "prevPollId"), prevPollId);
      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollLockTime, "secrets", pollId, "nextPollId"), claimedNextPollId);
      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollLockTime, "secrets", claimedNextPollId, "prevPollId"), pollId);

      EternalStorage(_storageContract).setBytes32Value(sha3("Lock", userAddress, pollTimeStamp, "secrets", pollId, "secret"), secret);
  }
}
