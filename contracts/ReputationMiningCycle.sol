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

import "../lib/dappsys/math.sol";
import "./IColonyNetwork.sol";
import "./PatriciaTree/PatriciaTreeProofs.sol";
import "./ITokenLocking.sol";
import "./ReputationMiningCycleStorage.sol";


contract ReputationMiningCycle is ReputationMiningCycleStorage, PatriciaTreeProofs, DSMath {
  /// @notice Minimum reputation mining stake in CLNY
  uint256 constant MIN_STAKE = 2000 * WAD;

  /// @notice Size of mining window in seconds
  uint256 constant MINING_WINDOW_SIZE = 60 * 60 * 24; // 24 hours

  /// @notice A modifier that checks that the supplied `roundNumber` is the final round
  /// @param roundNumber The `roundNumber` to check if it is the final round
  modifier finalDisputeRoundCompleted(uint256 roundNumber) {
    require(nUniqueSubmittedHashes - nInvalidatedHashes == 1, "colony-reputation-mining-final-round-not-complete");
    require(disputeRounds[roundNumber].length == 1, "colony-reputation-mining-not-final-round"); //i.e. this is the final round
    // Note that even if we are passed the penultimate round, which had a length of two, and had one eliminated,
    // and therefore 'delete' called in `invalidateHash`, the array still has a length of '2' - it's just that one
    // element is zeroed. If this functionality of 'delete' is ever changed, this will have to change too.
    _;
  }

  /// @notice A modifier that checks if the proposed entry is eligible. The more CLNY a user stakes, the more
  /// potential entries they have in a reputation mining cycle. This is effectively restricting the nonce range
  /// that is allowable from a given user when searching for a submission that will pass `withinTarget`. A user
  /// is allowed to use multiple entries in a single cycle, but each entry can only be used once per cycle, and
  /// if there are multiple entries they must all be for the same proposed Reputation State Root Hash with the
  /// same number of nodes.
  /// @param newHash The hash being submitted
  /// @param nNodes The number of nodes in the reputation tree that `newHash` is the root hash of
  /// @param jrh The justification root hash for the application of the log being processed.
  /// @param entryIndex The number of the entry the submitter hash asked us to consider.
  modifier entryQualifies(bytes32 newHash, uint256 nNodes, bytes32 jrh, uint256 entryIndex) {
    uint256 lockBalance = ITokenLocking(tokenLockingAddress).getUserLock(clnyTokenAddress, msg.sender).balance;
    require(entryIndex <= lockBalance / MIN_STAKE, "colony-reputation-mining-stake-minimum-not-met-for-index");
    require(entryIndex > 0, "colony-reputation-mining-zero-entry-index-passed");

    uint256 lockTimestamp = ITokenLocking(tokenLockingAddress).getUserLock(clnyTokenAddress, msg.sender).timestamp;
    require(reputationMiningWindowOpenTimestamp >= lockTimestamp, "colony-reputation-mining-stake-too-recent");

    // If this user has submitted before during this round...
    if (reputationHashSubmissions[msg.sender].proposedNewRootHash != bytes32(0)) {
      // ...require that they are submitting the same hash ...
      require(newHash == reputationHashSubmissions[msg.sender].proposedNewRootHash, "colony-reputation-mining-submitting-different-hash");
      // ...require that they are submitting the same number of nodes for that hash ...
      require(nNodes == reputationHashSubmissions[msg.sender].nNodes, "colony-reputation-mining-submitting-different-nnodes");
      // ...require that they are submitting the same jrh for that hash ...
      require(jrh == reputationHashSubmissions[msg.sender].jrh, "colony-reputation-mining-submitting-different-jrh");
       // ... but not this exact entry
      require(submittedEntries[msg.sender][entryIndex] == false, "colony-reputation-mining-submitting-same-entry-index");
    }
    _;
  }

  uint256 constant UINT256_MAX = 2**256 - 1;
  uint256 constant X = UINT256_MAX / MINING_WINDOW_SIZE;

  /// @notice A modifier that checks if the proposed entry is within the current allowable submission window
  /// @dev A submission will only be accepted from a reputation miner if `keccak256(address, N, hash) < target`
  /// At the beginning of the submission window, the target is set to 0 and slowly increases to 2^256 - 1.
  modifier withinTarget(bytes32 newHash, uint256 entryIndex) {
    // Check the ticket is a winning one.
    // All entries are acceptable if the 24 hour-long window is closed, so skip this check if that's the case
    if (!submissionWindowClosed()) {
      uint256 target = (now - reputationMiningWindowOpenTimestamp) * X;
      require(uint256(getEntryHash(msg.sender, entryIndex, newHash)) < target, "colony-reputation-mining-cycle-submission-not-within-target");
    }
    _;
  }

  modifier submissionPossible() {
    // A submission is possible if this has become the active cycle (i.e. window opened) and...
    require(reputationMiningWindowOpenTimestamp > 0, "colony-reputation-mining-cycle-not-open");
    // the window has not closed or no-one has submitted
    require(!submissionWindowClosed() || nUniqueSubmittedHashes == 0, "colony-reputation-mining-cycle-submissions-closed");
    _;
  }

  /// @notice Initialise this reputation mining cycle.
  /// @dev This will only be called once, by ColonyNetwork, in the same transaction that deploys this contract
  function initialise(address _tokenLockingAddress, address _clnyTokenAddress) public {
    // Prevent this being called multiple times
    require(colonyNetworkAddress == address(0x0), "colony-reputation-mining-cycle-already-initialised");
    colonyNetworkAddress = msg.sender;
    tokenLockingAddress = _tokenLockingAddress;
    clnyTokenAddress = _clnyTokenAddress;
  }

  function getMinStake() public pure returns (uint256) {
    return MIN_STAKE;
  }

  function getMiningWindowDuration() public pure returns (uint256) {
    return MINING_WINDOW_SIZE;
  }

  function getEntryHash(address submitter, uint256 entryIndex, bytes32 newHash) public pure returns (bytes32) {
    return keccak256(abi.encodePacked(submitter, entryIndex, newHash));
  }

  /// @notice Get the number of hashes that have been submitted this mining cycle
  function getNUniqueSubmittedHashes() public view returns (uint256) {
    return nUniqueSubmittedHashes;
  }

  function getNSubmissionsForHash(bytes32 hash, uint256 nNodes, bytes32 jrh) public view returns (uint256) {
    return submittedHashes[hash][nNodes][jrh].length;
  }

  /// @notice Get the number of hashes that have been invalidated this mining cycle
  function getNInvalidatedHashes() public view returns (uint256) {
    return nInvalidatedHashes;
  }

  function getSubmissionUser(bytes32 hash, uint256 nNodes, bytes32 jrh, uint256 index) public view returns (address) {
    require(submittedHashes[hash][nNodes][jrh].length > index, "colony-reputation-mining-submission-index-out-of-range");
    return submittedHashes[hash][nNodes][jrh][index];
  }

  function resetWindow() public {
    require(msg.sender == colonyNetworkAddress, "colony-reputation-mining-sender-not-network");
    reputationMiningWindowOpenTimestamp = now;
  }

  function challengeRoundComplete(uint256 round) public view returns (bool) {
    if (!submissionWindowClosed()) {
      return false;
    }
    for (uint i = firstIncompleteRound; i <= round; i += 1) {
      if (nHashesCompletedChallengeRound[i] != disputeRounds[i].length) {
        return false;
      }
    }
    return true;
  }

  function submitRootHash(bytes32 newHash, uint256 nNodes, bytes32 jrh, uint256 entryIndex) public
  submissionPossible()
  entryQualifies(newHash, nNodes, jrh, entryIndex)
  withinTarget(newHash, entryIndex)
  {
    // Limit the total number of miners allowed to submit a specific hash to 12
    require(submittedHashes[newHash][nNodes][jrh].length < 12, "colony-reputation-mining-max-number-miners-reached");

    // If this is a new hash, increment nUniqueSubmittedHashes as such.
    if (submittedHashes[newHash][nNodes][jrh].length == 0) {
      nUniqueSubmittedHashes += 1;
      // And add it to the first disputeRound
      // NB if no other hash is submitted, no dispute resolution will be required.
      disputeRounds[0].push(DisputedEntry({
        firstSubmitter: msg.sender,
        lastResponseTimestamp: 0,
        challengeStepCompleted: 0,
        lowerBound: 0,
        upperBound: 0,
        intermediateReputationHash: 0x0,
        intermediateReputationNNodes: 0,
        targetHashDuringSearch: jrh,
        hash1: 0x00,
        hash2: 0x00
      }));
      // If we've got a pair of submissions to face off, may as well start now.
      if (nUniqueSubmittedHashes % 2 == 0) {
        disputeRounds[0][nUniqueSubmittedHashes-1].lastResponseTimestamp = now;
        disputeRounds[0][nUniqueSubmittedHashes-2].lastResponseTimestamp = now;
        /* disputeRounds[0][nUniqueSubmittedHashes-1].upperBound = disputeRounds[0][nUniqueSubmittedHashes-1].jrhNNodes; */
        /* disputeRounds[0][nUniqueSubmittedHashes-2].upperBound = disputeRounds[0][nUniqueSubmittedHashes-2].jrhNNodes; */
      }
    }

    if (reputationHashSubmissions[msg.sender].proposedNewRootHash == bytes32(0)) {
      reputationHashSubmissions[msg.sender] = Submission({
        proposedNewRootHash: newHash,
        nNodes: nNodes,
        jrh: jrh,
        jrhNNodes: 0
      });
    }

    // And add the miner to the array list of submissions here
    submittedHashes[newHash][nNodes][jrh].push(msg.sender);
    // Note that they submitted it.
    submittedEntries[msg.sender][entryIndex] = true;

    emit ReputationRootHashSubmitted(msg.sender, newHash, nNodes, jrh, entryIndex);
  }

  function confirmNewHash(uint256 roundNumber) public
  finalDisputeRoundCompleted(roundNumber)
  {
    require(submissionWindowClosed(), "colony-reputation-mining-submission-window-still-open");

    DisputedEntry storage winningDisputeEntry = disputeRounds[roundNumber][0];
    Submission storage submission = reputationHashSubmissions[winningDisputeEntry.firstSubmitter];
    IColonyNetwork(colonyNetworkAddress).setReputationRootHash(
      submission.proposedNewRootHash,
      submission.nNodes,
      submittedHashes[submission.proposedNewRootHash][submission.nNodes][submission.jrh],
      0 * WAD // TODO: Make this a function of reputation state
    );
    selfdestruct(colonyNetworkAddress);
  }

  function invalidateHash(uint256 round, uint256 idx) public {
    // What we do depends on our opponent, so work out which index it was at in disputeRounds[round]
    uint256 opponentIdx = (idx % 2 == 1 ? idx-1 : idx + 1);
    uint256 nInNextRound;

    // We require either
    // 1. That we actually had an opponent - can't invalidate the last hash.
    // 2. This cycle had an odd number of submissions, which was larger than 1, and we're giving the last entry a bye to the next round.
    if (disputeRounds[round].length % 2 == 1 && disputeRounds[round].length == idx) {
      // This is option two above - note that because arrays are zero-indexed, if idx==length, then
      // this is the slot after the last entry, and so our opponentIdx will be the last entry
      // We just move the opponent on, and nothing else happens.

      // In all cases, if the window is still open, the submission could still get an opponent
      require(submissionWindowClosed(), "colony-reputation-mining-submission-window-still-open");
      // If we are past the first round, check that all previous rounds are complete (i.e we won't get an opponent)
      if (round > 0) {
        require(challengeRoundComplete(round - 1), "colony-reputation-mining-previous-dispute-round-not-complete");
      }
      // All previous rounds are complete, so update variable to allow loop to short-circuit in future
      // Note that this round is not necessarily complete - there could still be ongoing disputes in this round
      firstIncompleteRound = round;

      // Prevent us invalidating the final hash
      require(disputeRounds[round].length > 1, "colony-reputation-mining-cannot-invalidate-final-hash");
      // Move opponent on to next round
      disputeRounds[round+1].push(disputeRounds[round][opponentIdx]);
      delete disputeRounds[round][opponentIdx];

      // Note the fact that this round has had another challenge complete
      nHashesCompletedChallengeRound[round] += 1;
      // Check if the hash we just moved to the next round is the second of a pairing that should now face off.
      nInNextRound = disputeRounds[round+1].length;

      if (nInNextRound % 2 == 0) {
        startPairingInRound(round+1);
      }
    } else {
      require(disputeRounds[round].length > opponentIdx, "colony-reputation-mining-dispute-id-not-in-range");
      // If we are invalidating hash for idx then opponentIdx hash has to exist, so it is passed onto the next round
      Submission storage opponentSubmission = reputationHashSubmissions[disputeRounds[round][opponentIdx].firstSubmitter];
      require(opponentSubmission.proposedNewRootHash != "", "colony-reputation-mining-proposed-hash-empty");

      Submission storage submission = reputationHashSubmissions[disputeRounds[round][idx].firstSubmitter];
      require(submission.proposedNewRootHash != "", "colony-reputation-mining-hash-already-progressed");

      // Require that this is not better than its opponent.
      require(disputeRounds[round][opponentIdx].challengeStepCompleted >= disputeRounds[round][idx].challengeStepCompleted, "colony-reputation-mining-less-challenge-rounds-completed");

      // Require that it has failed a challenge (i.e. failed to respond in time)
      require(now - disputeRounds[round][idx].lastResponseTimestamp >= 600, "colony-reputation-mining-not-timed-out"); // Timeout is ten minutes here.

      // Work out whether we are invalidating just the supplied idx or its opponent too.
      bool eliminateOpponent = false;
      if (disputeRounds[round][opponentIdx].challengeStepCompleted == disputeRounds[round][idx].challengeStepCompleted) {
        eliminateOpponent = true;
      }

      if (!eliminateOpponent) {
        // If here, then the opponent completed one more challenge round than the submission being invalidated or
        // proved a later UID was in the tree, so we don't know if they're valid or not yet. Move them on to the next round.
        disputeRounds[round+1].push(disputeRounds[round][opponentIdx]);
        delete disputeRounds[round][opponentIdx];
        // TODO Delete the hash(es) being invalidated?
        nInvalidatedHashes += 1;
        // Check if the hash we just moved to the next round is the second of a pairing that should now face off.
        nInNextRound = disputeRounds[round+1].length;
        if (nInNextRound % 2 == 0) {
          startPairingInRound(round+1);
        }
      } else {
        // Our opponent completed the same number of challenge rounds, and both have now timed out.
        nInvalidatedHashes += 2;
        // Punish the people who proposed our opponent
        ITokenLocking(tokenLockingAddress).punishStakers(
          submittedHashes[opponentSubmission.proposedNewRootHash][opponentSubmission.nNodes][opponentSubmission.jrh],
          msg.sender,
          MIN_STAKE
        );
        emit HashInvalidated(opponentSubmission.proposedNewRootHash, opponentSubmission.nNodes, opponentSubmission.jrh);

      }

      // Note that two hashes have completed this challenge round (either one accepted for now and one rejected, or two rejected)
      nHashesCompletedChallengeRound[round] += 2;

      // Punish the people who proposed the hash that was rejected
      ITokenLocking(tokenLockingAddress).punishStakers(
        submittedHashes[submission.proposedNewRootHash][submission.nNodes][submission.jrh],
        msg.sender,
        MIN_STAKE
      );
      emit HashInvalidated(submission.proposedNewRootHash, submission.nNodes, submission.jrh);
    }
    //TODO: Can we do some deleting to make calling this as cheap as possible for people?
  }

  function respondToBinarySearchForChallenge(
    uint256 round,
    uint256 idx,
    bytes memory jhIntermediateValue,
    bytes32[] memory siblings
  ) public
  {
    require(idx < disputeRounds[round].length, "colony-reputation-mining-index-beyond-round-length");
    require(disputeRounds[round][idx].lowerBound != disputeRounds[round][idx].upperBound, "colony-reputation-mining-challenge-not-active");

    uint256 targetNode = disputeRounds[round][idx].lowerBound;
    bytes32 targetHashDuringSearch = disputeRounds[round][idx].targetHashDuringSearch;
    bytes32 impliedRoot;
    bytes32[2] memory lastSiblings;

    Submission storage submission = reputationHashSubmissions[disputeRounds[round][idx].firstSubmitter];
    // Check proof is the right length
    uint256 expectedLength = expectedProofLength(submission.jrhNNodes, disputeRounds[round][idx].lowerBound) -
      (disputeRounds[round][idx].challengeStepCompleted - 1); // We expect shorter proofs the more chanllenge rounds we've done so far
    require(expectedLength == siblings.length, "colony-reputation-mining-invalid-binary-search-proof-length");
    // Because branchmasks are used from the end, we can just get the whole branchmask. We will run out of siblings before we run out of
    // branchmask, if everything is working right.
    uint256 branchMask = expectedBranchMask(submission.jrhNNodes, disputeRounds[round][idx].lowerBound);

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
    require(submission.jrhNNodes != 0, "colony-reputation-jrh-hash-not-verified");
    require(disputeRounds[round][idx].lowerBound == disputeRounds[round][idx].upperBound, "colony-reputation-binary-search-incomplete");
    require(
      2**(disputeRounds[round][idx].challengeStepCompleted - 2) <= submission.jrhNNodes,
      "colony-reputation-binary-search-result-already-confirmed"
    );

    uint256 targetNode = disputeRounds[round][idx].lowerBound;
    uint256 branchMask = expectedBranchMask(submission.jrhNNodes, disputeRounds[round][idx].lowerBound);
    bytes32 impliedRoot = getImpliedRootNoHashKey(bytes32(targetNode), jhIntermediateValue, branchMask, siblings);
    require(impliedRoot == submission.jrh, "colony-reputation-mining-invalid-binary-search-confirmation");
    bytes32 intermediateReputationHash;
    uint256 intermediateReputationNNodes;
    assembly {
      intermediateReputationHash := mload(add(jhIntermediateValue, 0x20))
      intermediateReputationNNodes := mload(add(jhIntermediateValue, 0x40))
    }
    disputeRounds[round][idx].intermediateReputationHash = intermediateReputationHash;
    disputeRounds[round][idx].intermediateReputationNNodes = intermediateReputationNNodes;
    while (2**(disputeRounds[round][idx].challengeStepCompleted - 2) <= submission.jrhNNodes) {
      disputeRounds[round][idx].challengeStepCompleted += 1;
    }

    emit BinarySearchConfirmed(submission.proposedNewRootHash, submission.nNodes, submission.jrh, disputeRounds[round][idx].lowerBound);
  }

  function confirmJustificationRootHash(
    uint256 round,
    uint256 index,
    bytes32[] memory siblings1,
    bytes32[] memory siblings2
  ) public
  {
    require(index < disputeRounds[round].length, "colony-reputation-mining-index-beyond-round-length");
    Submission storage submission = reputationHashSubmissions[disputeRounds[round][index].firstSubmitter];
    // Require we've not submitted already.
    require(submission.jrhNNodes == 0, "colony-reputation-jrh-hash-already-verified");

    // Calculate how many updates we're expecting in the justification tree
    uint256 reputationRootHashNNodes = IColonyNetwork(colonyNetworkAddress).getReputationRootHashNNodes();
    uint256 nLogEntries = reputationUpdateLog.length;

    submission.jrhNNodes = reputationUpdateLog[nLogEntries-1].nUpdates +
      reputationUpdateLog[nLogEntries-1].nPreviousUpdates + reputationRootHashNNodes + 1; // This is the number of nodes we expect in the justification tree

    uint256 expectedLength = expectedProofLength(submission.jrhNNodes, 0);
    require(expectedLength == siblings1.length, "colony-reputation-mining-invalid-jrh-proof-1-length");

    expectedLength = expectedProofLength(submission.jrhNNodes, submission.jrhNNodes - 1);
    require(expectedLength == siblings2.length, "colony-reputation-mining-invalid-jrh-proof-2-length");

    // Get the branch mask for the two proofs we asked for a plausible justification tree would have
    uint256 branchMask1 = expectedBranchMask(submission.jrhNNodes, 0);
    uint256 branchMask2 = expectedBranchMask(submission.jrhNNodes, submission.jrhNNodes-1);
    // Check the proofs for the JRH
    checkJRHProof1(submission.jrh, branchMask1, siblings1, reputationRootHashNNodes);
    checkJRHProof2(
      round,
      index,
      branchMask2,
      siblings2
    );

    // Record that they've responded
    disputeRounds[round][index].lastResponseTimestamp = now;
    disputeRounds[round][index].challengeStepCompleted += 1;

    // Set bounds for first binary search if it's going to be needed
    disputeRounds[round][index].upperBound = submission.jrhNNodes - 1;

    emit JustificationRootHashConfirmed(submission.proposedNewRootHash, submission.nNodes, submission.jrh);
  }

  function appendReputationUpdateLog(
    address _user,
    int256 _amount,
    uint256 _skillId,
    address _colonyAddress,
    uint128 _nParents,
    uint128 _nChildren
  ) public
  {
    require(colonyNetworkAddress == msg.sender, "colony-reputation-mining-sender-not-network");
    uint reputationUpdateLogLength = reputationUpdateLog.length;
    uint128 nPreviousUpdates = 0;
    if (reputationUpdateLogLength > 0) {
      nPreviousUpdates = reputationUpdateLog[reputationUpdateLogLength-1].nPreviousUpdates + reputationUpdateLog[reputationUpdateLogLength-1].nUpdates;
    }
    uint128 nUpdates = (_nParents + 1) * 2;
    if (_amount < 0) {
      nUpdates += 2 * _nChildren;
    }

    int256 amount = _amount;
    // Cap reputation amount to max int128
    if (_amount > MAX_INT128) {
      amount = MAX_INT128;
    } else if (_amount < MIN_INT128) {
      amount = MIN_INT128;
    }

    reputationUpdateLog.push(ReputationLogEntry(
      _user,
      amount, // Potentially adjusted amount to int128 scoe
      _skillId,
      _colonyAddress,
      nUpdates,
      nPreviousUpdates));
  }

  function getReputationUpdateLogLength() public view returns (uint256) {
    return reputationUpdateLog.length;
  }

  function getReputationUpdateLogEntry(uint256 _id) public view returns (ReputationLogEntry memory) {
    require(_id < reputationUpdateLog.length, "colony-reputation-index-beyond-reputation-log-length");
    return reputationUpdateLog[_id];
  }

  function getReputationHashSubmission(address _user) public view returns (Submission memory) {
    return reputationHashSubmissions[_user];
  }

  function minerSubmittedEntryIndex(address _miner, uint256 _index) public view returns (bool result) {
    return submittedEntries[_miner][_index];
  }

  function getDisputeRound(uint256 _round) public view returns (DisputedEntry[] memory) {
    return disputeRounds[_round];
  }

  function rewardStakersWithReputation(
    address[] memory stakers,
    uint256[] memory weights,
    address metaColonyAddress,
    uint256 reward,
    uint256 miningSkillId
  ) public
  {
    require(msg.sender == colonyNetworkAddress, "colony-reputation-mining-sender-not-network");
    require(reputationUpdateLog.length == 0, "colony-reputation-mining-log-length-non-zero");
    require(stakers.length == weights.length, "colony-reputation-mining-staker-weight-mismatch");
    for (uint128 i = 0; i < stakers.length; i++) {
      // We *know* we're the first entries in this reputation update log, so we don't need all the bookkeeping in
      // the AppendReputationUpdateLog function

      int256 amount = int256(reward);
      // Cap reputation amount to int128
      if (amount > MAX_INT128) {
        amount = MAX_INT128;
      }

      reputationUpdateLog.push(ReputationLogEntry(
        stakers[i],
        int256(wmul(reward, weights[i])),
        miningSkillId, //This should be the special 'mining' skill.
        metaColonyAddress, // They earn this reputation in the meta colony.
        4, // Updates the user's skill, and the colony's skill, both globally and for the special 'mining' skill
        i*4 //We're zero indexed, so this is the number of updates that came before in the reputation log.
      ));
    }
  }

  /// @notice Get the timestamp that the current reputation mining window opened
  function getReputationMiningWindowOpenTimestamp() public view returns (uint256) {
    return reputationMiningWindowOpenTimestamp;
  }

  /////////////////////////
  // Internal functions
  /////////////////////////

  function submissionWindowClosed() internal view returns (bool) {
    return now - reputationMiningWindowOpenTimestamp >= MINING_WINDOW_SIZE;
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
    uint256 intermediateReputationNNodes;
    assembly {
      intermediateReputationHash := mload(add(jhIntermediateValue, 0x20))
      intermediateReputationNNodes := mload(add(jhIntermediateValue, 0x40))
    }
    disputeRounds[round][idx].intermediateReputationHash = intermediateReputationHash;
    disputeRounds[round][idx].intermediateReputationNNodes = intermediateReputationNNodes;

    disputeRounds[round][idx].hash1 = lastSiblings[0];
    disputeRounds[round][idx].hash2 = lastSiblings[1];

    uint256 opponentIdx = (idx % 2 == 1 ? idx-1 : idx + 1);
    if (disputeRounds[round][opponentIdx].challengeStepCompleted == disputeRounds[round][idx].challengeStepCompleted ) {
      // Our opponent answered this challenge already.
      // Compare our intermediateReputationHash to theirs to establish how to move the bounds.
      processBinaryChallengeSearchStep(round, idx);
    }
  }

  function processBinaryChallengeSearchStep(uint256 round, uint256 idx) internal {
    uint256 opponentIdx = (idx % 2 == 1 ? idx-1 : idx + 1);
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
      if (2**(disputeRounds[round][idx].challengeStepCompleted-1) < submission.jrhNNodes) {
        disputeRounds[round][idx].challengeStepCompleted += 1;
        disputeRounds[round][opponentIdx].challengeStepCompleted += 1;
      }
    }

    // Our opponent responded to this step of the challenge before we did, so we should
    // reset their 'last response' time to now, as they aren't able to respond
    // to the next challenge before they know what it is!
    disputeRounds[round][opponentIdx].lastResponseTimestamp = now;
  }

  function checkJRHProof1(bytes32 jrh, uint256 branchMask1, bytes32[] memory siblings1, uint256 reputationRootHashNNodes) internal view {
    // Proof 1 needs to prove that they started with the current reputation root hash
    bytes32 reputationRootHash = IColonyNetwork(colonyNetworkAddress).getReputationRootHash();
    bytes memory jhLeafValue = new bytes(64);
    assembly {
      mstore(add(jhLeafValue, 0x20), reputationRootHash)
      mstore(add(jhLeafValue, 0x40), reputationRootHashNNodes)
    }
    bytes32 impliedRoot = getImpliedRootNoHashKey(bytes32(0), jhLeafValue, branchMask1, siblings1);
    require(jrh==impliedRoot, "colony-reputation-mining-invalid-jrh-proof-1");
  }

  function checkJRHProof2(
    uint256 round,
    uint256 index,
    uint256 branchMask2,
    bytes32[] memory siblings2
  ) internal
  {
    // Proof 2 needs to prove that they finished with the reputation root hash they submitted, and the
    // key is the number of updates implied by the contents of the reputation update log
    // plus the number of nodes in the last accepted update, each of which will have decayed once.
    // The total number of updates we expect is the nPreviousUpdates in the last entry of the log plus the number
    // of updates that log entry implies by itself, plus the number of decays (the number of nodes in current state)

    Submission storage submission = reputationHashSubmissions[disputeRounds[round][index].firstSubmitter];
    bytes32 submittedHash = submission.proposedNewRootHash;
    uint256 submittedHashNNodes = submission.nNodes;
    bytes memory jhLeafValue = new bytes(64);
    assembly {
      mstore(add(jhLeafValue, 0x20), submittedHash)
      mstore(add(jhLeafValue, 0x40), submittedHashNNodes)
    }
    bytes32 impliedRoot = getImpliedRootNoHashKey(bytes32(submission.jrhNNodes-1), jhLeafValue, branchMask2, siblings2);
    require(submission.jrh == impliedRoot, "colony-reputation-mining-invalid-jrh-proof-2");
  }

  function startMemberOfPair(uint256 roundNumber, uint256 index) internal {
    Submission storage submission = reputationHashSubmissions[disputeRounds[roundNumber][index].firstSubmitter];
    disputeRounds[roundNumber][index].lastResponseTimestamp = now;
    disputeRounds[roundNumber][index].upperBound = submission.jrhNNodes - 1;
    disputeRounds[roundNumber][index].lowerBound = 0;
    disputeRounds[roundNumber][index].targetHashDuringSearch = submission.jrh;
    if (submission.jrhNNodes != 0) {
      // If this submission has confirmed their JRH, we give ourselves credit for it in the next round - it's possible
      // that a submission got a bye without confirming a JRH, which will not have this starting '1'.
      disputeRounds[roundNumber][index].challengeStepCompleted = 1;
    } else {
      disputeRounds[roundNumber][index].challengeStepCompleted = 0;
    }
  }

  function startPairingInRound(uint256 roundNumber) internal {
    uint256 nInRound = disputeRounds[roundNumber].length;
    startMemberOfPair(roundNumber, nInRound-1);
    startMemberOfPair(roundNumber, nInRound-2);
  }

  function nextPowerOfTwoInclusive(uint256 v) private pure returns (uint) { // solium-disable-line security/no-assign-params
    // Returns the next power of two, or v if v is already a power of two.
    // Doesn't work for zero.
    v = sub(v, 1);
    v |= v >> 1;
    v |= v >> 2;
    v |= v >> 4;
    v |= v >> 8;
    v |= v >> 16;
    v |= v >> 32;
    v |= v >> 64;
    v |= v >> 128;
    v = add(v, 1);
    return v;
  }

  function expectedProofLength(uint256 nNodes, uint256 node) private pure returns (uint256) { // solium-disable-line security/no-assign-params
    nNodes -= 1;
    uint256 nextPowerOfTwo = nextPowerOfTwoInclusive(nNodes + 1);
    uint256 layers = 0;
    while (nNodes != 0 && (node+1 > nextPowerOfTwo / 2)) {
      nNodes -= nextPowerOfTwo/2;
      node -= nextPowerOfTwo/2;
      layers += 1;
      nextPowerOfTwo = nextPowerOfTwoInclusive(nNodes + 1);
    }
    while (nextPowerOfTwo > 1) {
      layers += 1;
      nextPowerOfTwo >>= 1;
    }
    return layers;
  }

  function expectedBranchMask(uint256 nNodes, uint256 node) public pure returns (uint256) {
    // Gets the expected branchmask for a patricia tree which has nNodes, with keys from 0 to nNodes -1
    // i.e. the tree is 'full' - there are no missing nodes
    uint256 mask = sub(nNodes, 1); // Every branchmask in a full tree has at least these 1s set
    uint256 xored = mask ^ node; // Where do mask and node differ?
    // Set every bit in the mask from the first bit where they differ to 1
    uint256 remainderMask = sub(nextPowerOfTwoInclusive(add(xored, 1)), 1);
    return mask | remainderMask;
  }
}
