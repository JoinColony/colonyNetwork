pragma solidity ^0.4.0;

import "EternalStorage.sol";


library VotingLibrary {

  // Poll status flows one way from '0' (created but not opened) -> '1' (open for voting) -> '2' (resolved)
  modifier ensurePollStatus(address _storageContract, uint256 pollId, uint256 pollStatus){
    var currentStatus = EternalStorage(_storageContract).getUIntValue(keccak256("Poll", pollId, "status"));
    if (pollStatus != currentStatus) { throw; }
    _;
  }

  // Manages records for colony polls and votes stored in the format:

  // keccak256("PollCount") => total number of polls
  // keccak256("Poll", pollId, "description") => string/ipfsHash?
  // keccak256("Poll", pollId, "OptionsCount") => uint256
  // keccak256("Poll", pollId, "option", idx) => string
  // keccak256("Poll", pollId, "option", idx, "count") => uint256
  // keccak256("Poll", pollId, "startTime") => pollStartTime;
  // keccak256("Poll", pollId, "closeTime") => pollCloseTime;
  // keccak256("Poll", pollId, "status") => uint256 open=1/resolved=2

  // Doubly linked list holding polls closeTime
  // keccak256("Voting", userAddress, pollCloseTime, "prevTimestamp") => uint256 prevTimestam
  // keccak256("Voting", userAddress, pollCloseTime, "nextTimestamp") => uint256 nextTimestamp

  // Doubly linked list holding vote secrets
  // keccak256("Voting", userAddress, pollCloseTime, "secrets", pollId, "secret") => bytes32 secret
  // keccak256("Voting", userAddress, pollCloseTime, "secrets", pollId, "prevPollId") => uint pollId
  // keccak256("Voting", userAddress, pollCloseTime, "secrets", pollId, "nextPollId") => uint pollId

  /// @notice Creates a new Poll
  /// @param description The poll description or question to vote on
  function createPoll(address _storageContract, string description)
  returns (bool)
  {
    // Infer the next pollId form incrementing the current Poll count
    uint256 pollCount = EternalStorage(_storageContract).getUIntValue(keccak256("PollCount"));
    uint256 pollId = pollCount + 1;

    EternalStorage(_storageContract).setStringValue(keccak256("Poll", pollId, "description"), description);
    EternalStorage(_storageContract).setUIntValue(keccak256("PollCount"), pollCount + 1);
    return true;
  }

  /// @notice For a poll with id 'pollId', adds a new voting option
  /// Note: Once poll has status of 'open', no options can be added to it
  /// @param pollOptionDescription The option description, e.g. "Yes" vote
  function addPollOption(address _storageContract, uint256 pollId, string pollOptionDescription)
  ensurePollStatus(_storageContract, pollId, 0)
  returns (bool)
  {
    var pollOptionCount = EternalStorage(_storageContract).getUIntValue(keccak256("Poll", pollId, "OptionsCount"));
    if (pollOptionCount >= 4) { return false; } //TODO: Pick a non-random number
    EternalStorage(_storageContract).setStringValue(keccak256("Poll", pollId, "option", pollOptionCount + 1), pollOptionDescription);
    EternalStorage(_storageContract).setUIntValue(keccak256("Poll", pollId, "OptionsCount"), pollOptionCount + 1);
    return true;
  }

  /// @notice Opens the poll for voting with immediate effect, for the given duration
  /// @param pollDuration hours from now (effectively the opening time), the poll remains open for voting
  function openPoll(address _storageContract, uint256 pollId, uint256 pollDuration)
  ensurePollStatus(_storageContract, pollId, 0)
  returns (bool)
  {
    // Ensure there are at least 2 vote options, before poll can open
    var pollOptionCount = EternalStorage(_storageContract).getUIntValue(keccak256("Poll", pollId, "OptionsCount"));
    if (pollOptionCount < 2) { return false; }

    EternalStorage(_storageContract).setUIntValue(keccak256("Poll", pollId, "startTime"), now);
    EternalStorage(_storageContract).setUIntValue(keccak256("Poll", pollId, "closeTime"), now + pollDuration * 1 hours);
    EternalStorage(_storageContract).setUIntValue(keccak256("Poll", pollId, "status"), 1);
    return true;
  }

  /// @notice Resolves the poll voting results
  /// Note: Any votes which haven't been resolved will not count in the final poll results resolved here
  function resolvePoll(address _storageContract, uint256 pollId)
  ensurePollStatus(_storageContract, pollId, 1)
  returns (bool)
  {
    var startTime = EternalStorage(_storageContract).getUIntValue(keccak256("Poll", pollId, "startTime"));
    var endTime = EternalStorage(_storageContract).getUIntValue(keccak256("Poll", pollId, "closeTime"));
    var resolutionTime = endTime + (endTime - startTime); //TODO: Think about this time period.

    if (now < resolutionTime) { return false; }

    EternalStorage(_storageContract).setUIntValue(keccak256("Poll", pollId, "status"), uint256(2));
    return true;
  }

  /// @notice Submits a vote to a poll which is open
  // We expect the user to give us the correct position of their voting secret in the two linked lists
  function submitVote(
    address _storageContract,
    uint256 pollId,
    bytes32 secret,
    uint256 prevTimestamp,
    uint256 prevPollId)
    ensurePollStatus(_storageContract, pollId, 1)
  returns (bool)
  {
    // Check the poll is not yet closed/locked for voting
    uint256 pollCloseTime = EternalStorage(_storageContract).getUIntValue(keccak256("Poll", pollId, "closeTime"));
    if(pollCloseTime < now) { return false; }

    return addVoteSecret(_storageContract, msg.sender, pollCloseTime, pollId, secret, prevTimestamp, prevPollId);
  }

  function revealVote(
    address _storageContract,
    uint256 pollId,
    uint256 idx,
    bytes32 salt,
    uint256 voteWeight)
  returns (bool)
  {
    uint256 pollCloseTime = EternalStorage(_storageContract).getUIntValue(keccak256("Poll", pollId, "closeTime"));
    // The poll should be locked before we can reveal our vote
    if(pollCloseTime > now) { return false; }

    //Compare the secret they supplied with what they're claiming
    //Suggestion: salt should be keccak256 of the result of eth_sign being called, supplied with something like {"colonyId":colonyId,"pollId":pollId}
    // In truth, it can be anything the user wants, so long as they remember it.
    var claimedRevealCorrespondingSecret = generateVoteSecret(salt, idx);
    var storedSecret = EternalStorage(_storageContract).getBytes32Value(keccak256("Voting", msg.sender, pollCloseTime, "secrets", pollId, "secret"));
    if (claimedRevealCorrespondingSecret != storedSecret ) { return false; }

    //Then they're revealing a vote that matched the secret they submitted.
    removeVoteSecret(_storageContract, msg.sender, pollCloseTime, pollId);
    // Only count this vote if the poll isn't resolved and still open
    var currentStatus = EternalStorage(_storageContract).getUIntValue(keccak256("Poll", pollId, "status"));
    if (currentStatus == 1) {
      var voteCount = EternalStorage(_storageContract).getUIntValue(keccak256("Poll", pollId, "option", idx, "count"));
      // Check if the vote count overflows
      if (voteCount + voteWeight < voteCount) { return false; }
      // Increment total vote count if needed
      if (voteWeight > 0) {
        EternalStorage(_storageContract).setUIntValue(keccak256("Poll", pollId, "option", idx, "count"), voteCount + voteWeight);
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

  function generateVoteSecret(bytes32 salt, uint256 optionId)
  returns (bytes32)
  {
    return keccak256(salt, optionId);
  }

  /// @notice Checks if an address is 'locked' due to any present unresolved votes
  function isAddressLocked(address _storageContract, address userAddress)
  constant returns (bool)
  {
    var zeroPollCloseTimeNext = EternalStorage(_storageContract).getUIntValue(keccak256("Voting", userAddress, uint256(0), "nextTimestamp"));
    // The list is empty, no unrevealed votes for this address
    if (zeroPollCloseTimeNext == 0) {
      return false;
    }

    // The poll is still open for voting and tokens transfer
    if (now < zeroPollCloseTimeNext) {
      return false;
    } else {
      // The poll is closed for voting and is in the reveal period, during which all votes' tokens are locked until reveal
      // Note: even after the poll is resolved, tokens remain locked until reveal
      return true;
    }
  }
}
