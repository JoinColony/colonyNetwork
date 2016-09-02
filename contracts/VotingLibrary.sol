import "EternalStorage.sol";


library VotingLibrary {
  event outputEvent(uint key);

  // Poll status flows one way from '0' (created but not opened) -> '1' (open for voting) -> '2' (resolved)
  modifier ensurePollStatus(address _storageContract, uint256 pollId, uint8 pollStatus){
    var currentStatus = EternalStorage(_storageContract).getUIntValue(sha3("Poll", pollId, "status"));
    if (pollStatus != currentStatus) { throw; }
    _
  }

  //todo: implement permissions
  // Manages records for colony polls and votes stored in the format:

  // sha3("PollCount") => total number of polls
  // sha3("Poll", pollId, "description") => string/ipfsHash?
  // sha3("Poll", pollId, "OptionsCount") => uint256
  // sha3("Poll", pollId, "option", idx, nextId) => string
  // sha3("Poll", pollId, "option", idx, "count") => uint256
  // sha3("Poll", pollId, "closeTime") => pollCloseTime;
  // sha3("Poll", pollId, "status") => uint8 open=1/resolved=2

  // Doubly linked list holding polls closeTime
  // sha3("Voting", userAddress, pollCloseTime, "prevTimestamp") => uint256 prevTimestam
  // sha3("Voting", userAddress, pollCloseTime, "nextTimestamp") => uint256 nextTimestamp

  // Doubly linked list holding vote secrets
  // sha3("Voting", userAddress, pollCloseTime, "secrets", pollId, "secret") => bytes32 secret
  // sha3("Voting", userAddress, pollCloseTime, "secrets", pollId, "prevPollId") => uint pollId
  // sha3("Voting", userAddress, pollCloseTime, "secrets", pollId, "nextPollId") => uint pollId

  /// @notice Creates a new Poll
  /// @param description The poll description or question to vote on
  function createPoll(address _storageContract, string description)
  returns (bool) {
    // Infer the next pollId form incrementing the current Poll count
    uint256 pollCount = EternalStorage(_storageContract).getUIntValue(sha3("PollCount"));
    uint256 pollId = pollCount + 1;

    EternalStorage(_storageContract).setStringValue(sha3("Poll", pollId, "description"), description);
    EternalStorage(_storageContract).setUIntValue(sha3("PollCount"), pollCount + 1);
    return true;
  }

  /// @notice For a poll with id 'pollId', adds a new voting option
  /// Note: Once poll has status of 'open', no options can be added to it
  /// @param pollOptionDescription The option description, e.g. "Yes" vote
  function addPollOption(address _storageContract, uint256 pollId, string pollOptionDescription)
  ensurePollStatus(_storageContract, pollId, 0)
  returns (bool)
  {
    var pollOptionCount = EternalStorage(_storageContract).getUIntValue(sha3("Poll", pollId, "OptionsCount"));
    if (pollOptionCount >= 4) { return false; } //TODO: Pick a non-random number
    EternalStorage(_storageContract).setStringValue(sha3("Poll", pollId, "option", pollOptionCount + 1), pollOptionDescription);
    EternalStorage(_storageContract).setUIntValue(sha3("Poll", pollId, "OptionsCount"), pollOptionCount + 1);
    return true;
  }

  /// @notice Opens the poll for voting with immediate effect, for the given duration
  /// @param pollDuration hours from now (effectively the opening time), the poll remains open for voting
  function openPoll(address _storageContract, uint256 pollId, uint256 pollDuration)
  ensurePollStatus(_storageContract, pollId, 0)
  returns (bool)
  {
    // Ensure there are at least 2 vote options, before poll can open
    var pollOptionCount = EternalStorage(_storageContract).getUIntValue(sha3("Poll", pollId, "OptionsCount"));
    if (pollOptionCount < 2) { return false; }

    EternalStorage(_storageContract).setUIntValue(sha3("Poll", pollId, "startTime"), now);
    EternalStorage(_storageContract).setUIntValue(sha3("Poll", pollId, "closeTime"), now + pollDuration * 1 hours);

    EternalStorage(_storageContract).setUIntValue(sha3("Poll", pollId, "status"), 1);
    return true;
  }

  /// @notice Resolves the poll voting results
  /// Note: Any votes which haven't been resolved will not count in the final poll results resolved here
  function resolvePoll(address _storageContract, uint256 pollId)
  ensurePollStatus(_storageContract, pollId, 1)
  returns (bool)
  {
    var startTime = EternalStorage(_storageContract).getUIntValue(sha3("Poll", pollId, "startTime"));
    var endTime = EternalStorage(_storageContract).getUIntValue(sha3("Poll", pollId, "closeTime"));
    var resolutionTime = endTime + (endTime - startTime); //TODO: Think about this time period.

    if (now < resolutionTime) { return false; }

    EternalStorage(_storageContract).setUIntValue(sha3("Poll", pollId, "status"), uint8(2));
    return true;
  }

  function submitVote(
    address _storageContract,
    uint256 pollId,
    bytes32 secret,
    uint256 prevTimestamp,
    uint256 prevPollId)
    ensurePollStatus(_storageContract, pollId, 1)
    returns (bool){

        // Check the poll is not yet closed/locked for voting
        uint256 pollCloseTime = EternalStorage(_storageContract).getUIntValue(sha3("Poll", pollId, "closeTime"));
        if(pollCloseTime < now) { return false; }

        addVoteSecret(_storageContract, msg.sender, pollCloseTime, pollId, secret, prevTimestamp, prevPollId);
        return true;
  }

  function revealVote(
    address _storageContract,
    uint256 pollId,
    uint256 idx,
    uint256 voteWeight)
    returns (bool){

      uint256 pollCloseTime = EternalStorage(_storageContract).getUIntValue(sha3("Poll", pollId, "closeTime"));
      // The poll should be locked before we can reveal our vote
      if(pollCloseTime > now) { return false; }

      //TODO: Do we do the validation of the secret, or does the contract using us do that?
      removeVoteSecret(_storageContract, msg.sender, pollCloseTime, pollId);

      // Only count this vote if the poll isn't resolved and still open
      var currentStatus = EternalStorage(_storageContract).getUIntValue(sha3("Poll", pollId, "status"));
      if (currentStatus == 1){
        // Increment total vote count
        var voteCount = EternalStorage(_storageContract).getUIntValue(sha3("Poll", pollId, "option", idx, "count"));
        EternalStorage(_storageContract).setUIntValue(sha3("Poll", pollId, "option", idx, "count"), voteCount * voteWeight);
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
