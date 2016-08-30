import "EternalStorage.sol";


library VotingLibrary {
  event outputEvent(uint key);

  // Manages records for colony polls and votes stored in the format:

  // sha3("Poll", pollId, "lockTime") => pollLockTime;
  // sha3("Poll", pollId, "description") => string/ipfsHash?
  // sha3("Poll", pollId, "option", idx) => string

  // sha3("Poll", pollId, "option", idx, "resolution") => bytes
  //address.call(0)(eternalStorage.getBytes32Value(sha3("Poll", pollId, "option", idx, "resolution")))

  // sha3("Voting", userAddress, pollLockTime, "prevTimestamp") => uint256 prevTimestam
  // sha3("Voting", userAddress, pollLockTime, "nextTimestamp") => uint256 nextTimestamp

  // sha3("Voting", userAddress, pollLockTime, "secrets", pollId, "secret") => bytes32 secret
  // sha3("Voting", userAddress, pollLockTime, "secrets", pollId, "prevPollId") => uint pollId
  // sha3("Voting", userAddress, pollLockTime, "secrets", pollId, "nextPollId") => uint pollId

  // pollDuration = hours from now that poll remains open
  //todo: how to get back a poll? can't quite rely on pollCount
  function createPoll(address _storageContract, uint256 pollDuration, string description){
    // Infer the next pollId form incrementing the current Poll count
    uint256 pollCount = EternalStorage(_storageContract).getUIntValue(sha3("PollCount"));
    uint256 pollId = pollCount + 1;

    EternalStorage(_storageContract).setUIntValue(sha3("Poll", pollId, "lockTime"), now + pollDuration * 1 hours);
    EternalStorage(_storageContract).setStringValue(sha3("Poll", pollId, "description"), description);
    //todo: do we maintain vote options as strings or can we allow users to vote on option ids?
    EternalStorage(_storageContract).setStringValue(sha3("Poll", pollId, "option", uint256(1)), "Yes");
    EternalStorage(_storageContract).setStringValue(sha3("Poll", pollId, "option", uint256(2)), "No");

    EternalStorage(_storageContract).setUIntValue(sha3("PollCount"), pollCount + 1);
  }

  function resolvePoll(){}

  function submitVote(
    address _storageContract,
    uint256 pollId,
    bytes32 secret,
    uint256 prevTimestamp,
    uint256 prevPollId){

        uint256 pollLockTime = EternalStorage(_storageContract).getUIntValue(sha3("Poll", pollId, "lockTime"));
        if(pollLockTime < now) {throw;}

        setLock(_storageContract, msg.sender, pollLockTime, pollId, secret, prevTimestamp, prevPollId);
  }

  function revealVote(){}

  //todo: remove explicit passing of the userAddress and use msg.sender instead
  function setLock(
    address _storageContract,
    address userAddress,
    uint256 pollLockTime,
    uint256 pollId,
    bytes32 secret,
    uint256 prevTimestamp,
    uint256 prevPollId) private returns (bool) {

      // IMPORTANT: If you directly pass a zero into sha3 function the output is incorrect. We have to declare a zero-value uint and pass this in instead.
      uint256 zeroUint = 0;

      //IMPORTANT TO REMEMBER: User should only supply pollId, not timestamp.
      //Doesn't need to be done in this function - calling function should look up and enforce.

      // Validate user wants to insert new records at the correct position in the doubly linked lists
      if (prevTimestamp > pollLockTime) { outputEvent(1); return false; }
      if (prevPollId > pollId) { outputEvent(2); return false; }

      //Check that prevTimestamp is either 0 (and we're inserting at the start of the list) or exists in the list.
      if (prevTimestamp != 0){
        var firstUnrevealedPollIdAtPrevTimestamp = EternalStorage(_storageContract).getUIntValue(sha3("Voting", userAddress, prevTimestamp, "secrets", zeroUint, "nextPollId"));
        if (firstUnrevealedPollIdAtPrevTimestamp == 0) { outputEvent(3); return false; }
      }
      //Same for prevPollId
      if (prevPollId != 0){
        var secretAtPrevPollId = EternalStorage(_storageContract).getBytes32Value(sha3("Voting", userAddress, pollLockTime, "secrets", prevPollId, "secret"));
        if (secretAtPrevPollId == "") { outputEvent(4); return false; }
      }

      var pollLockTimeDoesNotExist = (EternalStorage(_storageContract).getUIntValue(sha3("Voting", userAddress, pollLockTime, "secrets", zeroUint, "prevPollId")) == 0);
      if(pollLockTimeDoesNotExist) {
        outputEvent(11);
        // Inserting a new pollLockTime, so we need to check list would still be ordered
        var claimedNextTimestamp = EternalStorage(_storageContract).getUIntValue(sha3("Voting", userAddress, prevTimestamp, "nextTimestamp"));
        //TODO: Sanity check with Alex: do we need the '=' check if we are inserting a new pollLocktime. claimedNextTimestamp = pollLockTime essentially means that the pollLocktime already exists in the list, right?
        if ( claimedNextTimestamp != 0 && claimedNextTimestamp <= pollLockTime ) { outputEvent(5); return false; }

        //If x is 0, we're inserting at the end of the existing list
        // Otherwise, throw if the list wouldn't be ordered after insertion.
        //Insert into the linked lists
        EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, prevTimestamp, "nextTimestamp"), pollLockTime);
        EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollLockTime, "prevTimestamp"), prevTimestamp);
        EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollLockTime, "nextTimestamp"), claimedNextTimestamp);
        EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, claimedNextTimestamp, "prevTimestamp"), pollLockTime);
        outputEvent(12);
      }
      else{
        //TODO: Sanity check with Alex: We should do this check after we know we have an axisting pollLockTime and list of secrets to insert in, otherwise we are inserting at 0
        // Check we're inserting in the correct place in the secrets linked list
        var claimedNextPollId = EternalStorage(_storageContract).getUIntValue(sha3("Voting", userAddress, pollLockTime, "secrets", prevPollId, "nextPollId"));
        if ( claimedNextPollId != 0 && claimedNextPollId <= pollId) { outputEvent(6); return false; }
        outputEvent(13);
      }

      outputEvent(14);
      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollLockTime, "secrets", prevPollId, "nextPollId"), pollId);
      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollLockTime, "secrets", pollId, "prevPollId"), prevPollId);
      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollLockTime, "secrets", pollId, "nextPollId"), claimedNextPollId);
      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollLockTime, "secrets", claimedNextPollId, "prevPollId"), pollId);
      outputEvent(15);
      //Enter secret
      EternalStorage(_storageContract).setBytes32Value(sha3("Voting", userAddress, pollLockTime, "secrets", pollId, "secret"), secret);
      outputEvent(16);
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
