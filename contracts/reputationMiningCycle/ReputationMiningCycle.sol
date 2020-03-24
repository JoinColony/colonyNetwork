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

import "./../../lib/dappsys/math.sol";
import "./../colonyNetwork/IColonyNetwork.sol";
import "./../patriciaTree/PatriciaTreeProofs.sol";
import "./../tokenLocking/ITokenLocking.sol";
import "./ReputationMiningCycleCommon.sol";


contract ReputationMiningCycle is ReputationMiningCycleCommon {
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
  /// same number of leaves.
  /// @param newHash The hash being submitted
  /// @param nLeaves The number of leaves in the reputation tree that `newHash` is the root hash of
  /// @param jrh The justification root hash for the application of the log being processed.
  /// @param entryIndex The number of the entry the submitter hash asked us to consider.
  modifier entryQualifies(bytes32 newHash, uint256 nLeaves, bytes32 jrh, uint256 entryIndex) {
    uint256 lockBalance = ITokenLocking(tokenLockingAddress).getObligation(msg.sender, clnyTokenAddress, colonyNetworkAddress);
    require(entryIndex <= lockBalance / MIN_STAKE, "colony-reputation-mining-stake-minimum-not-met-for-index");
    require(entryIndex > 0, "colony-reputation-mining-zero-entry-index-passed");

    uint256 stakeTimestamp = IColonyNetwork(colonyNetworkAddress).getMiningStake(msg.sender).timestamp;
    require(reputationMiningWindowOpenTimestamp >= stakeTimestamp, "colony-reputation-mining-stake-too-recent");

    // If this user has submitted before during this round...
    if (reputationHashSubmissions[msg.sender].proposedNewRootHash != bytes32(0)) {
      // ...require that they are submitting the same hash ...
      require(newHash == reputationHashSubmissions[msg.sender].proposedNewRootHash, "colony-reputation-mining-submitting-different-hash");
      // ...require that they are submitting the same number of leaves for that hash ...
      require(nLeaves == reputationHashSubmissions[msg.sender].nLeaves, "colony-reputation-mining-submitting-different-nleaves");
      // ...require that they are submitting the same jrh for that hash ...
      require(jrh == reputationHashSubmissions[msg.sender].jrh, "colony-reputation-mining-submitting-different-jrh");
       // ... but not this exact entry
      require(submittedEntries[msg.sender][entryIndex] == false, "colony-reputation-mining-submitting-same-entry-index");
    }
    _;
  }

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

  function getNSubmissionsForHash(bytes32 hash, uint256 nLeaves, bytes32 jrh) public view returns (uint256) {
    return submittedHashes[hash][nLeaves][jrh].length;
  }

  /// @notice Get the number of hashes that have been invalidated this mining cycle
  function getNInvalidatedHashes() public view returns (uint256) {
    return nInvalidatedHashes;
  }

  function getSubmissionUser(bytes32 hash, uint256 nLeaves, bytes32 jrh, uint256 index) public view returns (address) {
    require(submittedHashes[hash][nLeaves][jrh].length > index, "colony-reputation-mining-submission-index-out-of-range");
    return submittedHashes[hash][nLeaves][jrh][index];
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

  function submitRootHash(bytes32 newHash, uint256 nLeaves, bytes32 jrh, uint256 entryIndex) public
  submissionPossible()
  entryQualifies(newHash, nLeaves, jrh, entryIndex)
  withinTarget(newHash, entryIndex)
  {
    // Limit the total number of miners allowed to submit a specific hash to 12
    require(submittedHashes[newHash][nLeaves][jrh].length < 12, "colony-reputation-mining-max-number-miners-reached");

    // If this is a new hash, increment nUniqueSubmittedHashes as such.
    if (submittedHashes[newHash][nLeaves][jrh].length == 0) {
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
        intermediateReputationNLeaves: 0,
        targetHashDuringSearch: jrh,
        hash1: 0x00,
        hash2: 0x00
      }));
      // If we've got a pair of submissions to face off, set them ready to start when the window closes.
      if (nUniqueSubmittedHashes % 2 == 0) {
        disputeRounds[0][nUniqueSubmittedHashes-1].lastResponseTimestamp = reputationMiningWindowOpenTimestamp + MINING_WINDOW_SIZE;
        disputeRounds[0][nUniqueSubmittedHashes-2].lastResponseTimestamp = reputationMiningWindowOpenTimestamp + MINING_WINDOW_SIZE;
        /* disputeRounds[0][nUniqueSubmittedHashes-1].upperBound = disputeRounds[0][nUniqueSubmittedHashes-1].jrhNLeaves; */
        /* disputeRounds[0][nUniqueSubmittedHashes-2].upperBound = disputeRounds[0][nUniqueSubmittedHashes-2].jrhNLeaves; */
      }
    }

    if (reputationHashSubmissions[msg.sender].proposedNewRootHash == bytes32(0)) {
      reputationHashSubmissions[msg.sender] = Submission({
        proposedNewRootHash: newHash,
        nLeaves: nLeaves,
        jrh: jrh,
        jrhNLeaves: 0
      });
    }

    // And add the miner to the array list of submissions here
    submittedHashes[newHash][nLeaves][jrh].push(msg.sender);
    // Note that they submitted it.
    submittedEntries[msg.sender][entryIndex] = true;

    emit ReputationRootHashSubmitted(msg.sender, newHash, nLeaves, jrh, entryIndex);
  }

  function confirmNewHash(uint256 roundNumber) public
  finalDisputeRoundCompleted(roundNumber)
  {
    // No rewardResponders here - the submitters of the hash are incentivised to make this call, as it
    // is the one that gives them the reward for staking in the first place. This means we don't have to
    // take it in to account when calculating the reward for responders, which in turn means that the
    // calculation can be done from a purely pairwise dispute perspective.
    require(submissionWindowClosed(), "colony-reputation-mining-submission-window-still-open");

    require(responsePossible(disputeStages.CONFIRM_NEW_HASH, disputeRounds[roundNumber][0].lastResponseTimestamp), "colony-reputation-mining-user-ineligible-to-respond");

    // Burn tokens that have been slashed, but will not be awarded to others as rewards.
    IColonyNetwork(colonyNetworkAddress).burnUnneededRewards(sub(stakeLost, rewardsPaidOut));

    DisputedEntry storage winningDisputeEntry = disputeRounds[roundNumber][0];
    Submission storage submission = reputationHashSubmissions[winningDisputeEntry.firstSubmitter];
    IColonyNetwork(colonyNetworkAddress).setReputationRootHash(
      submission.proposedNewRootHash,
      submission.nLeaves,
      submittedHashes[submission.proposedNewRootHash][submission.nLeaves][submission.jrh]
    );
    selfdestruct(colonyNetworkAddress);
  }

  function invalidateHash(uint256 round, uint256 idx) public
  {
    // What we do depends on our opponent, so work out which index it was at in disputeRounds[round]
    uint256 opponentIdx = getOpponentIdx(idx);
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
      require(add(disputeRounds[round][idx].lastResponseTimestamp, 600) <= now, "colony-reputation-mining-not-timed-out"); // Timeout is ten minutes here.

      // The submission can be invalidated - now check the person invalidating is allowed to
      require(responsePossible(disputeStages.INVALIDATE_HASH, disputeRounds[round][idx].lastResponseTimestamp), "colony-reputation-mining-user-ineligible-to-respond");

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
        IColonyNetwork(colonyNetworkAddress).punishStakers(
          submittedHashes[opponentSubmission.proposedNewRootHash][opponentSubmission.nLeaves][opponentSubmission.jrh],
          MIN_STAKE
        );
        stakeLost += submittedHashes[opponentSubmission.proposedNewRootHash][opponentSubmission.nLeaves][opponentSubmission.jrh].length * MIN_STAKE;

        emit HashInvalidated(opponentSubmission.proposedNewRootHash, opponentSubmission.nLeaves, opponentSubmission.jrh);
      }

      // Note that two hashes have completed this challenge round (either one accepted for now and one rejected, or two rejected)
      nHashesCompletedChallengeRound[round] += 2;

      // Punish the people who proposed the hash that was rejected
      IColonyNetwork(colonyNetworkAddress).punishStakers(
        submittedHashes[submission.proposedNewRootHash][submission.nLeaves][submission.jrh],
        MIN_STAKE
      );
      stakeLost += submittedHashes[submission.proposedNewRootHash][submission.nLeaves][submission.jrh].length * MIN_STAKE;

      emit HashInvalidated(submission.proposedNewRootHash, submission.nLeaves, submission.jrh);
    }
    rewardResponder(msg.sender);
    //TODO: Can we do some deleting to make calling this as cheap as possible for people?
  }

  function confirmJustificationRootHash(
    uint256 round,
    uint256 index,
    bytes32[] memory siblings1,
    bytes32[] memory siblings2
  ) public
  {
    require(submissionWindowClosed(), "colony-reputation-mining-cycle-submissions-not-closed");
    require(index < disputeRounds[round].length, "colony-reputation-mining-index-beyond-round-length");
    require(responsePossible(disputeStages.CONFIRM_JRH, disputeRounds[round][index].lastResponseTimestamp), "colony-reputation-mining-user-ineligible-to-respond");

    Submission storage submission = reputationHashSubmissions[disputeRounds[round][index].firstSubmitter];
    // Require we've not confirmed the JRH already.
    require(submission.jrhNLeaves == 0, "colony-reputation-jrh-hash-already-verified");

    // Calculate how many updates we're expecting in the justification tree
    uint256 reputationRootHashNLeaves = IColonyNetwork(colonyNetworkAddress).getReputationRootHashNLeaves();
    uint256 nLogEntries = reputationUpdateLog.length;

    submission.jrhNLeaves = reputationUpdateLog[nLogEntries-1].nUpdates +
      reputationUpdateLog[nLogEntries-1].nPreviousUpdates + reputationRootHashNLeaves + 1; // This is the number of leaves we expect in the justification tree

    uint256 expectedLength = expectedProofLength(submission.jrhNLeaves, 0);
    require(expectedLength == siblings1.length, "colony-reputation-mining-invalid-jrh-proof-1-length");

    expectedLength = expectedProofLength(submission.jrhNLeaves, submission.jrhNLeaves - 1);
    require(expectedLength == siblings2.length, "colony-reputation-mining-invalid-jrh-proof-2-length");

    // Get the branch mask for the two proofs we asked for a plausible justification tree would have
    uint256 branchMask1 = expectedBranchMask(submission.jrhNLeaves, 0);
    uint256 branchMask2 = expectedBranchMask(submission.jrhNLeaves, submission.jrhNLeaves-1);
    // Check the proofs for the JRH
    checkJRHProof1(submission.jrh, branchMask1, siblings1, reputationRootHashNLeaves);
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
    disputeRounds[round][index].upperBound = submission.jrhNLeaves - 1;

    rewardResponder(msg.sender);

    emit JustificationRootHashConfirmed(submission.proposedNewRootHash, submission.nLeaves, submission.jrh);
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

  function getDisputeRewardSize() public returns (uint256) {
    return disputeRewardSize();
  }

  function expectedBranchMask(uint256 nLeaves, uint256 leaf) public pure returns (uint256) {
    // Gets the expected branchmask for a patricia tree which has nLeaves, with keys from 0 to nLeaves -1
    // i.e. the tree is 'full' - there are no missing leaves
    uint256 mask = sub(nLeaves, 1); // Every branchmask in a full tree has at least these 1s set
    uint256 xored = mask ^ leaf; // Where do mask and leaf differ?
    // Set every bit in the mask from the first bit where they differ to 1
    uint256 remainderMask = sub(nextPowerOfTwoInclusive(add(xored, 1)), 1);
    return mask | remainderMask;
  }

  function userInvolvedInMiningCycle(address _user) public view returns (bool) {
    return reputationHashSubmissions[_user].proposedNewRootHash != 0x00 || respondedToChallenge[_user];
  }

  function getResponsePossible(disputeStages stage, uint256 since) external view returns (bool) {
    return responsePossible(stage, since);
  }

  /////////////////////////
  // Internal functions
  /////////////////////////

  function checkJRHProof1(bytes32 jrh, uint256 branchMask1, bytes32[] memory siblings1, uint256 reputationRootHashNLeaves) internal view {
    // Proof 1 needs to prove that they started with the current reputation root hash
    bytes32 reputationRootHash = IColonyNetwork(colonyNetworkAddress).getReputationRootHash();
    bytes memory jhLeafValue = new bytes(64);
    assembly {
      mstore(add(jhLeafValue, 0x20), reputationRootHash)
      mstore(add(jhLeafValue, 0x40), reputationRootHashNLeaves)
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
    // plus the number of leaves in the last accepted update, each of which will have decayed once.
    // The total number of updates we expect is the nPreviousUpdates in the last entry of the log plus the number
    // of updates that log entry implies by itself, plus the number of decays (the number of leaves in current state)

    Submission storage submission = reputationHashSubmissions[disputeRounds[round][index].firstSubmitter];
    bytes32 submittedHash = submission.proposedNewRootHash;
    uint256 submittedHashNLeaves = submission.nLeaves;
    bytes memory jhLeafValue = new bytes(64);
    assembly {
      mstore(add(jhLeafValue, 0x20), submittedHash)
      mstore(add(jhLeafValue, 0x40), submittedHashNLeaves)
    }
    bytes32 impliedRoot = getImpliedRootNoHashKey(bytes32(submission.jrhNLeaves-1), jhLeafValue, branchMask2, siblings2);
    require(submission.jrh == impliedRoot, "colony-reputation-mining-invalid-jrh-proof-2");
  }

  function startMemberOfPair(uint256 roundNumber, uint256 index) internal {
    Submission storage submission = reputationHashSubmissions[disputeRounds[roundNumber][index].firstSubmitter];
    disputeRounds[roundNumber][index].lastResponseTimestamp = now;
    disputeRounds[roundNumber][index].upperBound = submission.jrhNLeaves - 1;
    disputeRounds[roundNumber][index].lowerBound = 0;
    disputeRounds[roundNumber][index].targetHashDuringSearch = submission.jrh;
    if (submission.jrhNLeaves != 0) {
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

  function userInvolvedInMiningCycle(address _user) public view returns (bool) {
    if (
      reputationHashSubmissions[_user].proposedNewRootHash != 0x00 ||
      respondedToChallenge[_user] == true
    ) {
      return true;
    }
    return false;
  }

  function getOpponentIdx(uint256 _idx) private pure returns (uint256) {
    return _idx % 2 == 1 ? _idx - 1 : _idx + 1;
  }
}
