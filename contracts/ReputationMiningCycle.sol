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
    require(nSubmittedHashes - nInvalidatedHashes == 1, "colony-reputation-mining-final-round-not-completed");
    require(disputeRounds[roundNumber].length == 1, "colony-reputation-mining-final-round-not-completed"); //i.e. this is the final round
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
  /// @param entryIndex The number of the entry the submitter hash asked us to consider.
  modifier entryQualifies(bytes32 newHash, uint256 nNodes, uint256 entryIndex) {
    uint256 balance;
    (, balance,) = ITokenLocking(tokenLockingAddress).getUserLock(clnyTokenAddress, msg.sender);
    require(entryIndex <= balance / MIN_STAKE, "colony-reputation-mining-stake-minimum-not-met-for-index");
    require(entryIndex > 0, "colony-reputation-mining-zero-entry-index-passed");

    // If this user has submitted before during this round...
    if (reputationHashSubmissions[msg.sender].proposedNewRootHash != 0x0) {
      // ...require that they are submitting the same hash ...
      require(newHash == reputationHashSubmissions[msg.sender].proposedNewRootHash, "colony-reputation-mining-submitting-different-hash");
      // ...require that they are submitting the same number of nodes for that hash ...
      require(nNodes == reputationHashSubmissions[msg.sender].nNodes, "colony-reputation-mining-submitting-different-nnodes");
      // ... but not this exact entry
      require(submittedEntries[newHash][msg.sender][entryIndex] == false, "colony-reputation-mining-submitting-same-entry-index");
    }
    _;
  }

  uint256 constant UINT256_MAX = 2**256 - 1;
  uint256 constant X = UINT256_MAX / MINING_WINDOW_SIZE;

  /// @notice A modifier that checks if the proposed entry is within the current allowable submission window
  /// @dev A submission will only be accepted from a reputation miner if `keccak256(address, N, hash) < target`
  /// At the beginning of the submission window, the target is set to 0 and slowly increases to 2^256 - 1 after an hour
  modifier withinTarget(bytes32 newHash, uint256 entryIndex) {
    // Check the ticket is a winning one.
    // All entries are acceptable if the hour-long window is closed, so skip this check if that's the case
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
    require(!submissionWindowClosed() || nSubmittedHashes == 0, "colony-reputation-mining-cycle-submissions-closed");
    _;
  }

  /// @notice Initialise this reputation mining cycle.
  /// @dev This will only be called once, by ColonyNetwork, in the same transaction that deploys this contract
  function initialise(address _tokenLockingAddress, address _clnyTokenAddress) public {
    // Prevent this being called multiple times
    require(colonyNetworkAddress == 0, "colony-reputation-mining-cycle-already-initialised");
    colonyNetworkAddress = msg.sender;
    tokenLockingAddress = _tokenLockingAddress;
    clnyTokenAddress = _clnyTokenAddress;
  }

  function getEntryHash(address submitter, uint256 entryIndex, bytes32 newHash) public pure returns (bytes32) {
    return keccak256(abi.encodePacked(submitter, entryIndex, newHash));
  }

  /// @notice Get the number of hashes that have been submitted this mining cycle
  function getNSubmittedHashes() public view returns (uint256) {
    return nSubmittedHashes;
  }

  /// @notice Get the number of hashes that have been invalidated this mining cycle
  function getNInvalidatedHashes() public view returns (uint256) {
    return nInvalidatedHashes;
  }

  /// @notice Get the address that made a particular submission
  /// @param hash The hash that was submitted
  /// @param nNodes The number of nodes that was submitted
  /// @param index The index of the submission - should be 0-11, as up to twelve submissions can be made.
  function getSubmittedHashes(bytes32 hash, uint256 nNodes, uint256 index) public view returns (address) {
    return submittedHashes[hash][nNodes][index];
  }

  function resetWindow() public {
    require(msg.sender == colonyNetworkAddress, "colony-reputation-mining-sender-not-network");
    reputationMiningWindowOpenTimestamp = now;
  }

  function submitRootHash(bytes32 newHash, uint256 nNodes, uint256 entryIndex) public
  submissionPossible()
  entryQualifies(newHash, nNodes, entryIndex)
  withinTarget(newHash, entryIndex)
  {
    // Limit the total number of miners allowed to submit a specific hash to 12
    require(submittedHashes[newHash][nNodes].length < 12, "colony-reputation-mining-max-number-miners-reached");

    // If this is a new hash, increment nSubmittedHashes as such.
    if (submittedHashes[newHash][nNodes].length == 0) {
      nSubmittedHashes += 1;
      // And add it to the first disputeRound
      // NB if no other hash is submitted, no dispute resolution will be required.
      disputeRounds[0].push(Submission({
        proposedNewRootHash: newHash,
        jrh: 0x0,
        nNodes: nNodes,
        lastResponseTimestamp: 0,
        challengeStepCompleted: 0,
        lowerBound: 0,
        upperBound: 0,
        jrhNnodes: 0,
        intermediateReputationHash: 0x0,
        intermediateReputationNNodes: 0,
        provedPreviousReputationUID: 0
      }));
      // If we've got a pair of submissions to face off, may as well start now.
      if (nSubmittedHashes % 2 == 0) {
        disputeRounds[0][nSubmittedHashes-1].lastResponseTimestamp = now;
        disputeRounds[0][nSubmittedHashes-2].lastResponseTimestamp = now;
        /* disputeRounds[0][nSubmittedHashes-1].upperBound = disputeRounds[0][nSubmittedHashes-1].jrhNnodes; */
        /* disputeRounds[0][nSubmittedHashes-2].upperBound = disputeRounds[0][nSubmittedHashes-2].jrhNnodes; */
      }
    }

    reputationHashSubmissions[msg.sender] = Submission({
      proposedNewRootHash: newHash,
      jrh: 0x0,
      nNodes: nNodes,
      lastResponseTimestamp: 0,
      challengeStepCompleted: 0,
      lowerBound: 0,
      upperBound: 0,
      jrhNnodes: 0,
      intermediateReputationHash: 0x0,
      intermediateReputationNNodes: 0,
      provedPreviousReputationUID: 0
    });
    // And add the miner to the array list of submissions here
    submittedHashes[newHash][nNodes].push(msg.sender);
    // Note that they submitted it.
    submittedEntries[newHash][msg.sender][entryIndex] = true;
  }

  function confirmNewHash(uint256 roundNumber) public
  finalDisputeRoundCompleted(roundNumber)
  {
    require(submissionWindowClosed(), "colony-reputation-mining-submission-window-still-open");

    Submission storage submission = disputeRounds[roundNumber][0];
    IColonyNetwork(colonyNetworkAddress).setReputationRootHash(
      submission.proposedNewRootHash,
      submission.nNodes,
      submittedHashes[submission.proposedNewRootHash][submission.nNodes]
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

      // Ensure that the previous round is complete, and this entry wouldn't possibly get an opponent later on.
      require(nHashesCompletedChallengeRound[round-1] == disputeRounds[round-1].length, "colony-reputation-mining-previous-dispute-round-not-complete");

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
      require(disputeRounds[round][opponentIdx].proposedNewRootHash != "", "colony-reputation-mining-proposed-hash-empty");
      require(disputeRounds[round][idx].proposedNewRootHash != "", "colony-reputation-mining-hash-already-progressed");

      // Require that this is not better than its opponent.
      require(disputeRounds[round][opponentIdx].challengeStepCompleted >= disputeRounds[round][idx].challengeStepCompleted, "colony-reputation-mining-less-challenge-rounds-completed");
      require(disputeRounds[round][opponentIdx].provedPreviousReputationUID >= disputeRounds[round][idx].provedPreviousReputationUID, "colony-reputation-mining-less-reputation-uids-proven");

      // Require that it has failed a challenge (i.e. failed to respond in time)
      require(now - disputeRounds[round][idx].lastResponseTimestamp >= 600, "colony-reputation-mining-failed-to-respond-in-time"); //'In time' is ten minutes here.

      // Work out whether we are invalidating just the supplied idx or its opponent too.
      bool eliminateOpponent = false;
      if (disputeRounds[round][opponentIdx].challengeStepCompleted == disputeRounds[round][idx].challengeStepCompleted &&
      disputeRounds[round][opponentIdx].provedPreviousReputationUID == disputeRounds[round][idx].provedPreviousReputationUID) {
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
          submittedHashes[disputeRounds[round][opponentIdx].proposedNewRootHash][disputeRounds[round][opponentIdx].nNodes],
          msg.sender,
          MIN_STAKE
        );
      }

      // Note that two hashes have completed this challenge round (either one accepted for now and one rejected, or two rejected)
      nHashesCompletedChallengeRound[round] += 2;

      // Punish the people who proposed the hash that was rejected
      ITokenLocking(tokenLockingAddress).punishStakers(
        submittedHashes[disputeRounds[round][idx].proposedNewRootHash][disputeRounds[round][idx].nNodes],
        msg.sender,
        MIN_STAKE
      );
    }
    //TODO: Can we do some deleting to make calling this as cheap as possible for people?
  }

  function respondToBinarySearchForChallenge(
    uint256 round,
    uint256 idx,
    bytes jhIntermediateValue,
    uint256 branchMask,
    bytes32[] siblings
  ) public
  {
    require(disputeRounds[round][idx].lowerBound != disputeRounds[round][idx].upperBound, "colony-reputation-mining-challenge-not-active");

    uint256 targetNode = add(
      disputeRounds[round][idx].lowerBound,
      sub(disputeRounds[round][idx].upperBound, disputeRounds[round][idx].lowerBound) / 2
    );
    bytes32 jrh = disputeRounds[round][idx].jrh;

    bytes memory targetNodeBytes = new bytes(32);
    assembly {
      mstore(add(targetNodeBytes, 0x20), targetNode)
    }

    bytes32 impliedRoot = getImpliedRoot(targetNodeBytes, jhIntermediateValue, branchMask, siblings);
    require(impliedRoot==jrh, "colony-reputation-mining-invalid-binary-search-response");
    // If require hasn't thrown, proof is correct.
    // Process the consequences
    processBinaryChallengeSearchResponse(round, idx, jhIntermediateValue, targetNode);
  }

  function confirmBinarySearchResult(
    uint256 round,
    uint256 idx,
    bytes jhIntermediateValue,
    uint256 branchMask,
    bytes32[] siblings
  ) public
  {
    require(disputeRounds[round][idx].lowerBound == disputeRounds[round][idx].upperBound, "colony-reputation-binary-search-incomplete");
    require(
      2**(disputeRounds[round][idx].challengeStepCompleted - 2) <= disputeRounds[round][idx].jrhNnodes,
      "colony-reputation-binary-search-result-already-confirmed"
    );

    uint256 targetNode = disputeRounds[round][idx].lowerBound;
    bytes32 jrh = disputeRounds[round][idx].jrh;

    bytes memory targetNodeBytes = new bytes(32);
    assembly {
      mstore(add(targetNodeBytes, 0x20), targetNode)
    }

    bytes32 impliedRoot = getImpliedRoot(targetNodeBytes, jhIntermediateValue, branchMask, siblings);
    require(impliedRoot==jrh, "colony-reputation-mining-invalid-binary-search-confirmation");
    bytes32 intermediateReputationHash;
    uint256 intermediateReputationNNodes;
    assembly {
      intermediateReputationHash := mload(add(jhIntermediateValue, 0x20))
      intermediateReputationNNodes := mload(add(jhIntermediateValue, 0x40))
    }
    disputeRounds[round][idx].intermediateReputationHash = intermediateReputationHash;
    disputeRounds[round][idx].intermediateReputationNNodes = intermediateReputationNNodes;
    while (2**(disputeRounds[round][idx].challengeStepCompleted - 2) <= disputeRounds[round][idx].jrhNnodes) {
      disputeRounds[round][idx].challengeStepCompleted += 1;
    }

  }

  function submitJustificationRootHash(
    uint256 round,
    uint256 index,
    bytes32 jrh,
    uint256 branchMask1,
    bytes32[] siblings1,
    uint256 branchMask2,
    bytes32[] siblings2
  ) public
  {
    // Require we've not submitted already.
    require(disputeRounds[round][index].jrh == 0x0, "colony-reputation-mining-hash-already-submitted");

    // Get reputation root hash NNodes, which we need in both of the following checkJRHProofs
    uint256 reputationRootHashNNodes = IColonyNetwork(colonyNetworkAddress).getReputationRootHashNNodes();

    // Check the proofs for the JRH
    checkJRHProof1(jrh, branchMask1, siblings1, reputationRootHashNNodes);
    checkJRHProof2(
      round,
      index,
      jrh,
      branchMask2,
      siblings2,
      reputationRootHashNNodes
    );

    // Store their JRH
    disputeRounds[round][index].jrh = jrh;
    disputeRounds[round][index].lastResponseTimestamp = now;
    disputeRounds[round][index].challengeStepCompleted += 1;

    // Set bounds for first binary search if it's going to be needed
    disputeRounds[round][index].upperBound = disputeRounds[round][index].jrhNnodes - 1;
  }

  function appendReputationUpdateLog(
    address _user,
    int _amount,
    uint256 _skillId,
    address _colonyAddress,
    uint256 _nParents,
    uint256 _nChildren
  ) public
  {
    require(colonyNetworkAddress == msg.sender, "colony-reputation-mining-sender-not-network");
    uint reputationUpdateLogLength = reputationUpdateLog.length;
    uint nPreviousUpdates = 0;
    if (reputationUpdateLogLength > 0) {
      nPreviousUpdates = reputationUpdateLog[reputationUpdateLogLength-1].nPreviousUpdates + reputationUpdateLog[reputationUpdateLogLength-1].nUpdates;
    }
    uint nUpdates = (_nParents + 1) * 2;
    if (_amount < 0) {
      //TODO: Never true currently. _amount needs to be an int.
      nUpdates += 2 * _nChildren;
    }
    reputationUpdateLog.push(ReputationLogEntry(
      _user,
      _amount,
      _skillId,
      _colonyAddress,
      nUpdates,
      nPreviousUpdates));
  }

  function getReputationUpdateLogLength() public view returns (uint) {
    return reputationUpdateLog.length;
  }

  function getReputationUpdateLogEntry(uint256 _id) public view returns (address, int256, uint256, address, uint256, uint256) {
    ReputationLogEntry storage x = reputationUpdateLog[_id];
    return (x.user, x.amount, x.skillId, x.colony, x.nUpdates, x.nPreviousUpdates);
  }

  function getReputationHashSubmissions(address _user) public view returns (
    bytes32 proposedNewRootHash,
    uint256 nNodes,
    uint256 lastResponseTimestamp,
    uint256 challengeStepCompleted,
    bytes32 jrh,
    bytes32 intermediateReputationHash,
    uint256 intermediateReputationNNodes,
    uint256 jrhNnodes,
    uint256 lowerBound,
    uint256 upperBound,
    uint256 providedPreviousReputationUID
  )
  {
    Submission memory submission = reputationHashSubmissions[_user];
    return (
      submission.proposedNewRootHash,
      submission.nNodes,
      submission.lastResponseTimestamp,
      submission.challengeStepCompleted,
      submission.jrh,
      submission.intermediateReputationHash,
      submission.intermediateReputationNNodes,
      submission.jrhNnodes,
      submission.lowerBound,
      submission.upperBound,
      submission.provedPreviousReputationUID
    );
  }

  function getDisputeRounds(uint256 _round, uint256 _index) public view returns (
    bytes32 proposedNewRootHash,
    uint256 nNodes,
    uint256 lastResponseTimestamp,
    uint256 challengeStepCompleted,
    bytes32 jrh,
    bytes32 intermediateReputationHash,
    uint256 intermediateReputationNNodes,
    uint256 jrhNnodes,
    uint256 lowerBound,
    uint256 upperBound,
    uint256 providedPreviousReputationUID
  )
  {
    Submission memory submission = disputeRounds[_round][_index];
    return (
      submission.proposedNewRootHash,
      submission.nNodes,
      submission.lastResponseTimestamp,
      submission.challengeStepCompleted,
      submission.jrh,
      submission.intermediateReputationHash,
      submission.intermediateReputationNNodes,
      submission.jrhNnodes,
      submission.lowerBound,
      submission.upperBound,
      submission.provedPreviousReputationUID
    );
  }

  function rewardStakersWithReputation(address[] stakers, address commonColonyAddress, uint256 reward, uint256 miningSkillId) public {
    require(msg.sender == colonyNetworkAddress, "colony-reputation-mining-sender-not-network");
    require(reputationUpdateLog.length == 0, "colony-reputation-mining-log-length-non-zero");
    for (uint256 i = 0; i < stakers.length; i++) {
      // We *know* we're the first entries in this reputation update log, so we don't need all the bookkeeping in
      // the AppendReputationUpdateLog function
      reputationUpdateLog.push(ReputationLogEntry(
        stakers[i],
        int256(reward),
        miningSkillId, //This should be the special 'mining' skill.
        commonColonyAddress, // They earn this reputation in the common colony.
        4, // Updates the user's skill, and the colony's skill, both globally and for the special 'mining' skill
        i*4 //We're zero indexed, so this is the number of updates that came before in the reputation log.
      ));
    }
  }

  /// @notice Get the timestamp that the current reputation mining window opened
  function getReputationMiningWindowOpenTimestamp() public returns (uint256) {
    return reputationMiningWindowOpenTimestamp;
  }

  /////////////////////////
  // Internal functions
  /////////////////////////

  function submissionWindowClosed() internal view returns(bool) {
    return now - reputationMiningWindowOpenTimestamp >= MINING_WINDOW_SIZE;
  }

  function processBinaryChallengeSearchResponse(uint256 round, uint256 idx, bytes jhIntermediateValue, uint256 targetNode) internal {
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

    uint256 opponentIdx = (idx % 2 == 1 ? idx-1 : idx + 1);
    if (disputeRounds[round][opponentIdx].challengeStepCompleted == disputeRounds[round][idx].challengeStepCompleted ) {
      // Our opponent answered this challenge already.
      // Compare our intermediateReputationHash to theirs to establish how to move the bounds.
      processBinaryChallengeSearchStep(round, idx, targetNode);
    }
  }

  function processBinaryChallengeSearchStep(uint256 round, uint256 idx, uint256 targetNode) internal {
    uint256 opponentIdx = (idx % 2 == 1 ? idx-1 : idx + 1);
    if (
      disputeRounds[round][opponentIdx].intermediateReputationHash == disputeRounds[round][idx].intermediateReputationHash &&
      disputeRounds[round][opponentIdx].intermediateReputationNNodes == disputeRounds[round][idx].intermediateReputationNNodes
      )
    {
      disputeRounds[round][idx].lowerBound = targetNode + 1;
      disputeRounds[round][opponentIdx].lowerBound = targetNode + 1;
    } else {
      // NB no '-1' to mirror the '+1' above in the other bound, because
      // we're looking for the first index where these two submissions differ
      // in their calculations - they disagreed for this index, so this might
      // be the first index they disagree about
      disputeRounds[round][idx].upperBound = targetNode;
      disputeRounds[round][opponentIdx].upperBound = targetNode;
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
    if (disputeRounds[round][idx].lowerBound == disputeRounds[round][idx].upperBound) {
      if (2**(disputeRounds[round][idx].challengeStepCompleted-1) < disputeRounds[round][idx].jrhNnodes) {
        disputeRounds[round][idx].challengeStepCompleted += 1;
        disputeRounds[round][opponentIdx].challengeStepCompleted += 1;
      }
    }

    // Our opponent responded to this step of the challenge before we did, so we should
    // reset their 'last response' time to now, as they aren't able to respond
    // to the next challenge before they know what it is!
    disputeRounds[round][opponentIdx].lastResponseTimestamp = now;
  }

  function checkJRHProof1(bytes32 jrh, uint256 branchMask1, bytes32[] siblings1, uint256 reputationRootHashNNodes) internal view {
    // Proof 1 needs to prove that they started with the current reputation root hash
    bytes32 reputationRootHash = IColonyNetwork(colonyNetworkAddress).getReputationRootHash();
    bytes memory jhLeafValue = new bytes(64);
    bytes memory zero = new bytes(32);
    assembly {
      mstore(add(jhLeafValue, 0x20), reputationRootHash)
      mstore(add(jhLeafValue, 0x40), reputationRootHashNNodes)
    }
    bytes32 impliedRoot = getImpliedRoot(zero, jhLeafValue, branchMask1, siblings1);
    require(jrh==impliedRoot, "colony-reputation-mining-invalid-jrh-proof-1");
  }

  function checkJRHProof2(
    uint256 round,
    uint256 index,
    bytes32 jrh,
    uint256 branchMask2,
    bytes32[] siblings2,
    uint256 reputationRootHashNNodes
  ) internal
  {
    // Proof 2 needs to prove that they finished with the reputation root hash they submitted, and the
    // key is the number of updates implied by the contents of the reputation update log (implemented)
    // plus the number of nodes in the last accepted update, each of which will have decayed once (not implemented)
    uint256 nLogEntries = reputationUpdateLog.length;
    // The total number of updates we expect is the nPreviousUpdates in the last entry of the log plus the number
    // of updates that log entry implies by itself, plus the number of decays (the number of nodes in current state)

    uint256 nUpdates = reputationUpdateLog[nLogEntries-1].nUpdates +
      reputationUpdateLog[nLogEntries-1].nPreviousUpdates + reputationRootHashNNodes;
    bytes memory nUpdatesBytes = new bytes(32);
    disputeRounds[round][index].jrhNnodes = nUpdates + 1;
    bytes32 submittedHash = disputeRounds[round][index].proposedNewRootHash;
    uint256 submittedHashNNodes = disputeRounds[round][index].nNodes;
    bytes memory jhLeafValue = new bytes(64);
    assembly {
      mstore(add(jhLeafValue, 0x20), submittedHash)
      mstore(add(jhLeafValue, 0x40), submittedHashNNodes)
      mstore(add(nUpdatesBytes, 0x20), nUpdates)
    }
    bytes32 impliedRoot = getImpliedRoot(nUpdatesBytes, jhLeafValue, branchMask2, siblings2);
    require(jrh==impliedRoot, "colony-reputation-mining-invalid-jrh-proof-2");

  }

  function startMemberOfPair(uint256 roundNumber, uint256 index) internal {
    disputeRounds[roundNumber][index].lastResponseTimestamp = now;
    disputeRounds[roundNumber][index].upperBound = disputeRounds[roundNumber][index].jrhNnodes - 1;
    disputeRounds[roundNumber][index].lowerBound = 0;
    disputeRounds[roundNumber][index].provedPreviousReputationUID = 0;
    if (disputeRounds[roundNumber][index].jrh != 0x0) {
      // If this submission has a JRH, we give ourselves credit for it in the next round - it's possible
      // that a submission got a bye without submitting a JRH, which will not have this starting '1'.
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

}
