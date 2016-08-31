import "EternalStorage.sol";


library VotingLibrary {
  event outputEvent(uint key);
  //todo: implement permissions
  // Manages records for colony polls and votes stored in the format:

  // sha3("Poll", pollId, "closeTime") => pollCloseTime;
  // sha3("Poll", pollId, "description") => string/ipfsHash?
  // sha3("Poll", pollId, "OptionsCount") => uint256
  // sha3("Poll", pollId, "option", idx, nextId) => string
  // sha3("Poll", pollId, "option", idx, "count") => uint256
  // sha3("Poll", pollId, "status") => uint8 open=1/resolved=2

  // sha3("Poll", pollId, "option", idx, "resolution") => bytes
  // address.call(0)(eternalStorage.getBytes32Value(sha3("Poll", pollId, "option", idx, "resolution")))

  // sha3("Voting", userAddress, pollCloseTime, "prevTimestamp") => uint256 prevTimestam
  // sha3("Voting", userAddress, pollCloseTime, "nextTimestamp") => uint256 nextTimestamp

  // sha3("Voting", userAddress, pollCloseTime, "secrets", pollId, "secret") => bytes32 secret
  // sha3("Voting", userAddress, pollCloseTime, "secrets", pollId, "prevPollId") => uint pollId
  // sha3("Voting", userAddress, pollCloseTime, "secrets", pollId, "nextPollId") => uint pollId

  // pollDuration = hours from now that poll remains open
  //todo: how to get back a poll? can't quite rely on pollCount
  function createPoll(address _storageContract, uint256 pollDuration, string description){
    // Infer the next pollId form incrementing the current Poll count
    uint256 pollCount = EternalStorage(_storageContract).getUIntValue(sha3("PollCount"));
    uint256 pollId = pollCount + 1;

    EternalStorage(_storageContract).setUIntValue(sha3("Poll", pollId, "startTime"), now);
    EternalStorage(_storageContract).setUIntValue(sha3("Poll", pollId, "closeTime"), now + pollDuration * 1 hours);
    EternalStorage(_storageContract).setStringValue(sha3("Poll", pollId, "description"), description);

    EternalStorage(_storageContract).setUIntValue(sha3("PollCount"), pollCount + 1);
  }

  function addPollOption(address _storageContract, uint256 pollId, string pollOptionDescription){

    var pollOptionCount = EternalStorage(_storageContract).getUIntValue(sha3("Poll", pollId, "OptionsCount"));
    if (pollOptionCount>4) { throw; } //TODO: Pick a non-random number
    EternalStorage(_storageContract).setStringValue(sha3("Poll", pollId, "option", pollOptionCount + 1), pollOptionDescription);
    EternalStorage(_storageContract).setUIntValue(sha3("Poll", pollId, "OptionsCount"), pollOptionCount + 1);
  }

  function openPoll(address _storageContract, uint256 pollId){
    EternalStorage(_storageContract).setUIntValue(sha3("Poll", pollId, "status"), uint8(1));
  }


  function resolvePoll(address _storageContract, uint256 pollId){

    var startTime = EternalStorage(_storageContract).getUIntValue(sha3("Poll", pollId, "startTime"));
    var endTime = EternalStorage(_storageContract).getUIntValue(sha3("Poll", pollId, "closeTime"));
    var resolutionTime = endTime + (endTime - startTime); //TODO: Think about this time period.

    if (now < resolutionTime) { throw; }

    EternalStorage(_storageContract).setUIntValue(sha3("Poll", pollId, "status"), uint8(2));
  }

  function submitVote(
    address _storageContract,
    uint256 pollId,
    bytes32 secret,
    uint256 prevTimestamp,
    uint256 prevPollId){

        //todo: check if the poll is open
        uint256 pollCloseTime = EternalStorage(_storageContract).getUIntValue(sha3("Poll", pollId, "closeTime"));
        if(pollCloseTime < now) {throw;}

        addVoteSecret(_storageContract, msg.sender, pollCloseTime, pollId, secret, prevTimestamp, prevPollId);
  }

  function revealVote(
    address _storageContract,
    uint256 pollId,
    uint256 idx,
    uint256 voteWeight){
      //TODO: This should only be able to be called by the contract using this library

      uint256 pollCloseTime = EternalStorage(_storageContract).getUIntValue(sha3("Poll", pollId, "closeTime"));
      if (pollCloseTime == 0) { throw; }
      // The poll should be locked before we can reveal our vote
      if(pollCloseTime > now) { throw; }

      //TODO: Do we do the validation of the secret, or does the contract using us do that?
      removeVoteSecret(_storageContract, msg.sender, pollCloseTime, pollId);

      // Increment total vote count // todo: only add to total votes if the poll is *not* resolved
      var voteCount = EternalStorage(_storageContract).getUIntValue(sha3("Poll", pollId, "option", idx, "count"));
      EternalStorage(_storageContract).setUIntValue(sha3("Poll", pollId, "option", idx, "count"), voteCount * voteWeight);
  }

  function addVoteSecret(
    address _storageContract,
    address userAddress,
    uint256 pollCloseTime,
    uint256 pollId,
    bytes32 secret,
    uint256 prevTimestamp,
    uint256 prevPollId) private returns (bool) {

      // IMPORTANT: If you directly pass a zero into sha3 function the output is incorrect. We have to declare a zero-value uint and pass this in instead.
      uint256 zeroUint = 0;

      //IMPORTANT TO REMEMBER: User should only supply pollId, not timestamp.
      //Doesn't need to be done in this function - calling function should look up and enforce.

      // Validate user wants to insert new records at the correct position in the doubly linked lists
      if (prevTimestamp > pollCloseTime) { outputEvent(1); return false; }
      if (prevPollId > pollId) { outputEvent(2); return false; }

      //Check that prevTimestamp is either 0 (and we're inserting at the start of the list) or exists in the list.
      if (prevTimestamp != 0){
        var firstUnrevealedPollIdAtPrevTimestamp = EternalStorage(_storageContract).getUIntValue(sha3("Voting", userAddress, prevTimestamp, "secrets", zeroUint, "nextPollId"));
        if (firstUnrevealedPollIdAtPrevTimestamp == 0) { outputEvent(3); return false; }
      }
      //Same for prevPollId
      if (prevPollId != 0){
        var secretAtPrevPollId = EternalStorage(_storageContract).getBytes32Value(sha3("Voting", userAddress, pollCloseTime, "secrets", prevPollId, "secret"));
        if (secretAtPrevPollId == "") { outputEvent(4); return false; }
      }

      var pollCloseTimeDoesNotExist = (EternalStorage(_storageContract).getUIntValue(sha3("Voting", userAddress, pollCloseTime, "secrets", zeroUint, "prevPollId")) == 0);
      if(pollCloseTimeDoesNotExist) {
        outputEvent(11);
        // Inserting a new pollCloseTime, so we need to check list would still be ordered
        var claimedNextTimestamp = EternalStorage(_storageContract).getUIntValue(sha3("Voting", userAddress, prevTimestamp, "nextTimestamp"));
        if ( claimedNextTimestamp != 0 && claimedNextTimestamp < pollCloseTime ) { outputEvent(5); return false; }

        //If claimedNextTimestamp is 0, we're inserting at the end of the existing list
        // Otherwise, throw if the list wouldn't be ordered after insertion.
        //Insert into the linked lists
        EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, prevTimestamp, "nextTimestamp"), pollCloseTime);
        EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollCloseTime, "prevTimestamp"), prevTimestamp);
        EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollCloseTime, "nextTimestamp"), claimedNextTimestamp);
        EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, claimedNextTimestamp, "prevTimestamp"), pollCloseTime);
        outputEvent(12);
      }
      else{
        // Check we're inserting in the correct place in the secrets linked list
        // claimedNextPollId = pollId prevents double voting
        var claimedNextPollId = EternalStorage(_storageContract).getUIntValue(sha3("Voting", userAddress, pollCloseTime, "secrets", prevPollId, "nextPollId"));
        if ( claimedNextPollId != 0 && claimedNextPollId <= pollId) { outputEvent(6); return false; }
        outputEvent(13);
      }

      outputEvent(14);
      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollCloseTime, "secrets", prevPollId, "nextPollId"), pollId);
      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollCloseTime, "secrets", pollId, "prevPollId"), prevPollId);
      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollCloseTime, "secrets", pollId, "nextPollId"), claimedNextPollId);
      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollCloseTime, "secrets", claimedNextPollId, "prevPollId"), pollId);
      outputEvent(15);
      //Enter secret
      EternalStorage(_storageContract).setBytes32Value(sha3("Voting", userAddress, pollCloseTime, "secrets", pollId, "secret"), secret);
      outputEvent(16);
      return true;
  }

  function removeVoteSecret(
    address _storageContract,
    address userAddress,
    uint256 pollCloseTime,
    uint256 pollId) private returns(bool) {

      var prevPollId = EternalStorage(_storageContract).getUIntValue(sha3("Voting", userAddress, pollCloseTime, "secrets", pollId, "prevPollId"));
      var nextPollId = EternalStorage(_storageContract).getUIntValue(sha3("Voting", userAddress, pollCloseTime, "secrets", pollId, "nextPollId"));

      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollCloseTime, "secrets", prevPollId, "nextPollId"), nextPollId);
      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollCloseTime, "secrets", pollId, "prevPollId"), 0);
      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollCloseTime, "secrets", pollId, "nextPollId"), 0);
      EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollCloseTime, "secrets", nextPollId, "prevPollId"), prevPollId);

      //Clear secret
      //TODO: check default value for bytes32 in JS
      EternalStorage(_storageContract).setBytes32Value(sha3("Voting", userAddress, pollCloseTime, "secrets", pollId, "secret"), "");

      if (prevPollId == 0 && nextPollId == 0) {
        var prevTimestamp = EternalStorage(_storageContract).getUIntValue(sha3("Voting", userAddress, pollCloseTime, "prevTimestamp"));
        var nextTimestamp = EternalStorage(_storageContract).getUIntValue(sha3("Voting", userAddress, pollCloseTime, "nextTimestamp"));

        EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, prevTimestamp, "nextTimestamp"), nextTimestamp);
        EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollCloseTime, "prevTimestamp"), 0);
        EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, pollCloseTime, "nextTimestamp"), 0);
        EternalStorage(_storageContract).setUIntValue(sha3("Voting", userAddress, nextTimestamp, "prevTimestamp"), prevTimestamp);
      }

      return true;
  }

  function generateVoteSecret(bytes){

  }
}
