import "EternalStorage.sol";


library VotingLibrary {
  // Manages records for colony polls and votes stored in the format:

  // sha3("Voting", userAddress, pollLockTime, "secrets", pollId, "secret") => bytes32 secret
  // sha3("Voting", userAddress, pollLockTime, "secrets", pollId, "prevPollId") => uint pollId
  // sha3("Voting", userAddress, pollLockTime, "secrets", pollId, "nextPollId") => uint pollId

  // sha3("Voting", userAddress, pollLockTime, "prevTimestamp") => uint256 pollLockTime
  // sha3("Voting", userAddress, pollLockTime, "nextTimestamp") => uint256 pollLockTime

  //todo: remove explicip passing of the userAddress and use msg.sender instead
  //todo: remove throws and return boolean instead
  function setLock(
    address _storageContract,
    address userAddress,
    uint256 pollLockTime,
    uint256 pollId,
    bytes32 secret,
    uint256 prevTimestamp,
    uint256 prevPollId) returns (bool) {

      //IMPORTANT TO REMEMBER: User should only supply pollId, not timestamp.
      //Doesn't need to be done in this function - calling function should look up and enforce.

      // Validate user wants to insert new records at the correct position in the doubly linked lists
      if (prevTimestamp > pollLockTime) { return false; }
      if (prevPollId > pollId) { return false; }

      //Check that prevTimestamp is either 0 (and we're inserting at the start of the list) or exists in the list.
      if (prevTimestamp != 0){
        var firstUnrevealedPollIdAtPreviousTimestamp = EternalStorage(_storageContract).getUIntValue(sha3("Voting", userAddress, prevTimestamp, "secrets",0,"nextPollId"));
        if (firstUnrevealedPollIdAtPreviousTimestamp == 0) { return false; }
      }
      //Same for prevPollId
      if (prevPollId != 0){
        var secretAtPrevPollId = EternalStorage(_storageContract).getBytes32Value(sha3("Voting", userAddress, pollLockTime, "secrets", prevPollId, "secret"));
        if (secretAtPrevPollId == "") { return false; }
      }

      var pollLockTimeAlreadyExists = (EternalStorage(_storageContract).getUIntValue(sha3("Voting", userAddress, pollLockTime, "secrets",0,"nextPollId"))==0);

      // Check we're inserting in the correct place in the secrets linked list
      var claimedNextPollId = EternalStorage(_storageContract).getUIntValue(sha3("Voting", userAddress, pollLockTime, "secrets", prevPollId, "nextPollId"));
      if ( claimedNextPollId != 0 && claimedNextPollId <= pollId) { return false; }

      if(!pollLockTimeAlreadyExists) {
        // Inserting a new pollLockTime, so we need to check list would still be ordered
        var claimedNextTimestamp = EternalStorage(_storageContract).getUIntValue( sha3("Voting", userAddress, prevTimestamp, "nextTimestamp"));
        if ( claimedNextTimestamp != 0 && claimedNextTimestamp <= pollLockTime ) { return false; }
        // If x is 0, we're inserting at the end of the existing list
        // Otherwise, throw if the list wouldn't be ordered after insertion.

        //Insert into the linked lists
        EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, prevTimestamp, "nextTimestamp"), pollLockTime);
        EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollLockTime, "prevTimestamp"), prevTimestamp);
        EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollLockTime, "nextTimestamp"), claimedNextTimestamp);
        EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, claimedNextTimestamp, "prevTimestamp"), pollLockTime);
      }

      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollLockTime, "secrets", prevPollId, "nextPollId"), pollId);
      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollLockTime, "secrets", pollId, "prevPollId"), prevPollId);
      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollLockTime, "secrets", pollId, "nextPollId"), claimedNextPollId);
      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollLockTime, "secrets", claimedNextPollId, "prevPollId"), pollId);

      //Enter secret
      EternalStorage(_storageContract).setBytes32Value(sha3("Voting", userAddress, pollLockTime, "secrets", pollId, "secret"), secret);
      return true;
  }

}
   // function removeLock(
   //  address userAddress,
   //  uint256 pollTimeStamp,
   //  uint256 pollId){
   //  //Again, remember user should not be supplying both the id and the timestamp of the poll.
   //  //TODO: Do we do the validation of the secret, or does the contract using us do that?

   //  var prevPollId = EternalStorage(_storageContract).getUIntValue(sha3("Voting", userAddress, pollTimeStamp, "secrets", pollId, "prevPollId"));
   //  var nextPollId = EternalStorage(_storageContract).getUIntValue(sha3("Voting", userAddress, pollTimeStamp, "secrets", pollId, "nextPollId"));

   //  if (prevPollId!=0){
   //      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollTimeStamp, "secrets", prevPollId, "nextPollId"), nextPollId);
   //  }
   //  EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollTimeStamp, "secrets", pollId, "prevPollId"), 0);

   //  if (nextPollId!=0){
   //      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollTimeStamp, "secrets", nextPollId, "prevPollId"), prevPollId);
   //  }
   //  EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollTimeStamp, "secrets", pollId, "nextPollId"), 0);

   //  //Remove secret
   //  EternalStorage(_storageContract).setBytes32Value(sha3("Voting", userAddress, pollTimeStamp, "secrets", pollId, "secret"), 0x0);


   //  //decrement nunrevealedvotes
   //  var unrevealedVotesCountAtTimestamp = EternalStorage(_storageContract).getUIntValue(sha3("Voting", userAddress, pollTimeStamp, "unrevealedVotesCount"));
   //  EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollTimeStamp, "unrevealedVotesCount"), unrevealedVotesCountAtTimestamp-1);

   //  if (unrevealedVotesCountAtTimestamp-1==0){//Could be if prevPollId==0 and nextPollId==0
   //    //i.e. we just deleted the last unrevealed vote at this timeStamp
   //    //So we need to remove this timestamp from the timestamp list.
   //    //This looks a lot like the code above.
   //    var prevTimestamp = EternalStorage(_storageContract).getUIntValue( sha3("Voting", userAddress, pollTimeStamp, "prevTimestamp"));
   //    var nextTimestamp = EternalStorage(_storageContract).getUIntValue( sha3("Voting", userAddress, pollTimeStamp, "nextTimestamp"));

   //    if (prevTimestamp!=0){
   //    //Update the previous item
   //      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, prevTimestamp, "nextTimestamp"), nextTimestamp);
   //    }else{
   //      //we just deleted the first item, so we need to update the pointer to the first entry in the list
   //      //This might be setting it zero if we've remove the last thing they've voted on in the list, and that's okay.
   //      //That just represents the user has no locks.
   //      EternalStorage(_storageContract).setUIntValue(sha3("Voting", "FirstLock", userAddress), nextTimestamp);
   //    }
   //    EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollTimeStamp, "prevTimestamp"), 0);

   //    if (nextTimestamp!=0){
   //      //Update the next item
   //      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, nextTimestamp, "prevTimestamp"), prevTimestamp);
   //    }
   //    EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollTimeStamp, "nextTimestamp"), 0);
   //  }
//  }
