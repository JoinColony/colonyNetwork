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


// TODO (post CCv1, possibly never): Can we handle all possible disputes regarding the very first hash that should be set?
// Currently, at the very least, we can't handle a dispute if the very first entry is disputed.
// A possible workaround would be to 'kick off' reputation mining with a known dummy state...
// Given the approach we a taking for launch, we are able to guarantee that we are the only reputation miner for 100+ of the first cycles, even if we decided to lengthen a cycle length. As a result, maybe we just don't care about this special case?
contract ReputationMiningCycleRespond is ReputationMiningCycleStorage, PatriciaTreeProofs, DSMath {

  event ProveUIDSuccess(uint256 previousNewReputationUID, uint256 _disagreeStateReputationUID, bool existingUID);
  event ProveValueSuccess(int256 _agreeStateReputationValue, int256 _disagreeStateReputationValue, int256 _originReputationValue);

  /// @notice A modifier that checks if the challenge corresponding to the hash in the passed `round` and `id` is open
  /// @param round The round number of the hash under consideration
  /// @param idx The index in the round of the hash under consideration
  modifier challengeOpen(uint256 round, uint256 idx) {
    // Check the binary search has finished, but not necessarily confirmed
    require(disputeRounds[round][idx].lowerBound == disputeRounds[round][idx].upperBound, "colony-reputation-mining-challenge-closed");
    // Check the binary search result has been confirmed
    require(
      2**(disputeRounds[round][idx].challengeStepCompleted-2)>disputeRounds[round][idx].jrhNnodes,
      "colony-reputation-mining-binary-search-result-not-confirmed"
    );
    // Check that we have not already responded to the challenge
    require(
      2**(disputeRounds[round][idx].challengeStepCompleted-3)<=disputeRounds[round][idx].jrhNnodes,
      "colony-reputation-mining-challenge-already-responded"
    );
    _;
  }

  uint constant U_ROUND = 0;
  uint constant U_IDX = 1;
  uint constant U_REPUTATION_BRANCH_MASK = 2;
  uint constant U_AGREE_STATE_NNODES = 3;
  uint constant U_AGREE_STATE_BRANCH_MASK = 4;
  uint constant U_DISAGREE_STATE_NNODES = 5;
  uint constant U_DISAGREE_STATE_BRANCH_MASK = 6;
  uint constant U_PREVIOUS_NEW_REPUTATION_BRANCH_MASK = 7;
  uint constant U_LOG_ENTRY_NUMBER = 8;
  uint constant U_DECAY_TRANSITION = 9;
  uint constant U_ORIGIN_SKILL_REPUTATION_BRANCH_MASK = 10;

  uint constant U_AGREE_STATE_REPUTATION_VALUE = 11;
  uint constant U_AGREE_STATE_REPUTATION_UID = 12;
  uint constant U_DISAGREE_STATE_REPUTATION_VALUE = 13;
  uint constant U_DISAGREE_STATE_REPUTATION_UID= 14;
  uint constant U_PREVIOUS_NEW_REPUTATION_VALUE = 15;
  uint constant U_PREVIOUS_NEW_REPUTATION_UID = 16;
  uint constant U_ORIGIN_REPUTATION_VALUE = 17;
  uint constant U_ORIGIN_REPUTATION_UID = 18;

  uint constant DECAY_NUMERATOR =    992327946262944; // 24-hr mining cycles
  uint constant DECAY_DENOMINATOR = 1000000000000000;

  function respondToChallenge(
    uint256[19] u, //An array of 19 UINT Params, ordered as given above.
    bytes _reputationKey,
    bytes32[] reputationSiblings,
    bytes32[] agreeStateSiblings,
    bytes32[] disagreeStateSiblings,
    bytes previousNewReputationKey,
    bytes32[] previousNewReputationSiblings,
    bytes originReputationKey,
    bytes32[] originReputationSiblings
  ) public
    challengeOpen(u[U_ROUND], u[U_IDX])
  {
    u[U_DECAY_TRANSITION] = 0;
    // TODO: More checks that this is an appropriate time to respondToChallenge (maybe in modifier);
    /* bytes32 jrh = disputeRounds[round][idx].jrh; */
    // The contract knows
    // 1. the jrh for this submission
    // 2. The first index where this submission and its opponent differ.
    // Need to prove
    // 1. The reputation that is updated that we disagree on's value, before the first index
    //    where we differ, and in the first index where we differ.
    // 2. That no other changes are made to the reputation state. The proof for those
    //    two reputations in (1) is therefore required to be the same.
    // 3. That our 'after' value is correct. This is done by doing the calculation on-chain, perhaps
    //    after looking up the corresponding entry in the reputation update log (the alternative is
    //    that it's a decay calculation - not yet implemented.)

    // Check the supplied key is appropriate.
    checkKey(u, _reputationKey);

    // Prove the reputation's starting value is in some state, and that state is in the appropriate index in our JRH
    proveBeforeReputationValue(u, _reputationKey, reputationSiblings, agreeStateSiblings);

    // Prove the reputation's final value is in a particular state, and that state is in our JRH in the appropriate index (corresponding to the first disagreement between these miners)
    // By using the same branchMask and siblings, we know that no other changes to the reputation state tree have been slipped in.
    proveAfterReputationValue(u, _reputationKey, reputationSiblings, disagreeStateSiblings);

    // Perform the reputation calculation ourselves.
    performReputationCalculation(
      u,
      agreeStateSiblings,
      originReputationKey,
      originReputationSiblings);

    // If necessary, check the supplied previousNewRepuation is, in fact, in the same reputation state as the 'agree' state.
    // i.e. the reputation they supplied is in the 'agree' state.
    checkPreviousReputationInState(
      u,
      agreeStateSiblings,
      previousNewReputationKey,
      previousNewReputationSiblings);

    // Save the index for tiebreak scenarios later.
    saveProvedReputation(u);

    confirmChallengeCompleted(u);

    // Safety net?
    /* if (disputeRounds[round][idx].challengeStepCompleted==disputeRounds[round][opponentIdx].challengeStepCompleted){
      // Freeze the reputation mining system.
    } */
  }

  /////////////////////////
  // Internal functions
  /////////////////////////

  function confirmChallengeCompleted(uint256[19] u) internal {
    // If everthing checked out, note that we've responded to the challenge.
    disputeRounds[u[U_ROUND]][u[U_IDX]].challengeStepCompleted += 1;
    disputeRounds[u[U_ROUND]][u[U_IDX]].lastResponseTimestamp = now;
  }

  function checkKey(uint256[19] u, bytes memory _reputationKey) internal view {
    // If the state transition we're checking is less than the number of nodes in the currently accepted state, it's a decay transition
    // Otherwise, look up the corresponding entry in the reputation log.
    uint256 updateNumber = disputeRounds[u[U_ROUND]][u[U_IDX]].lowerBound - 1;
    if (updateNumber < IColonyNetwork(colonyNetworkAddress).getReputationRootHashNNodes()) {
      checkKeyDecay(u, updateNumber);
      u[U_DECAY_TRANSITION] = 1;
    } else {
      checkKeyLogEntry(u[U_ROUND], u[U_IDX], u[U_LOG_ENTRY_NUMBER], _reputationKey);
    }
  }

  function checkKeyDecay(uint256[19] u, uint256 _updateNumber) internal pure {
    // We check that the reputation UID is right for the decay transition being disputed.
    // The key is then implicitly checked when they prove that the key+value they supplied is in the
    // right intermediate state in their justification tree.
    require(u[U_AGREE_STATE_REPUTATION_UID]-1 == _updateNumber, "colony-reputation-mining-uid-not-decay");
  }

  function checkKeyLogEntry(uint256 round, uint256 idx, uint256 logEntryNumber, bytes memory _reputationKey) internal view {
    uint256 updateNumber = disputeRounds[round][idx].lowerBound - 1 - IColonyNetwork(colonyNetworkAddress).getReputationRootHashNNodes();

    ReputationLogEntry storage logEntry = reputationUpdateLog[logEntryNumber];

    // Check that the supplied log entry corresponds to this update number
    require(updateNumber >= logEntry.nPreviousUpdates, "colony-reputation-mining-update-number-part-of-previous-log-entry-updates");
    require(
      updateNumber < logEntry.nUpdates + logEntry.nPreviousUpdates,
      "colony-reputation-mining-update-number-part-of-following-log-entry-updates");
    uint expectedSkillId;
    address expectedAddress;
    (expectedSkillId, expectedAddress) = getExpectedSkillIdAndAddress(logEntry, updateNumber);

    bytes memory reputationKey = new bytes(20+32+20);
    reputationKey = _reputationKey;
    address colonyAddress;
    address userAddress;
    uint256 skillId;
    assembly {
        colonyAddress := mload(add(reputationKey,20)) // 20, not 32, because we're copying in to a slot that will be interpreted as an address.
                                              // which will truncate the leftmost 12 bytes
        skillId := mload(add(reputationKey, 52))
        userAddress := mload(add(reputationKey,72))   // 72, not 84, for the same reason as above. Is this being too clever? I don't think there are
                                              // any unintended side effects here, but I'm not quite confortable enough with EVM's stack to be sure.
                                              // Not sure what the alternative would be anyway.
    }
    require(expectedAddress == userAddress, "colony-reputation-mining-user-address-mismatch");
    require(logEntry.colony == colonyAddress, "colony-reputation-mining-colony-address-mismatch");
    require(expectedSkillId == skillId, "colony-reputation-mining-skill-id-mismatch");
  }

  function getExpectedSkillIdAndAddress(ReputationLogEntry storage logEntry, uint256 updateNumber) internal view
  returns (uint256 expectedSkillId, address expectedAddress)
  {
    // Work out the expected userAddress and skillId for this updateNumber in this logEntry.
    if ((updateNumber - logEntry.nPreviousUpdates + 1) <= logEntry.nUpdates / 2 ) {
      // Then we're updating a colony-wide total, so we expect an address of 0x0
      expectedAddress = 0x0;
    } else {
      // We're updating a user-specific total
      expectedAddress = logEntry.user;
    }

    // Expected skill Id
    // We update skills in the order children, then parents, then the skill listed in the log itself.
    // If the amount in the log is positive, then no children are being updated.
    uint nParents;
    (nParents, , ) = IColonyNetwork(colonyNetworkAddress).getSkill(logEntry.skillId);
    uint nChildUpdates;
    if (logEntry.amount < 0) {
      nChildUpdates = logEntry.nUpdates/2 - 1 - nParents;
      // NB This is not necessarily the same as nChildren. However, this is the number of child updates
      // that this entry in the log was expecting at the time it was created.
    }

    uint256 relativeUpdateNumber = (updateNumber - logEntry.nPreviousUpdates) % (logEntry.nUpdates/2);
    if (relativeUpdateNumber < nChildUpdates) {
      expectedSkillId = IColonyNetwork(colonyNetworkAddress).getChildSkillId(logEntry.skillId, relativeUpdateNumber);
    } else if (relativeUpdateNumber < (nChildUpdates+nParents)) {
      expectedSkillId = IColonyNetwork(colonyNetworkAddress).getParentSkillId(logEntry.skillId, relativeUpdateNumber - nChildUpdates);
    } else {
      expectedSkillId = logEntry.skillId;
    }
  }

  function proveBeforeReputationValue(
    uint256[19] u,
    bytes _reputationKey,
    bytes32[] reputationSiblings,
    bytes32[] agreeStateSiblings
  ) internal
  {
    bytes32 jrh = disputeRounds[u[U_ROUND]][u[U_IDX]].jrh;
    // We binary searched to the first disagreement, so the last agreement is the one before.
    uint256 lastAgreeIdx = disputeRounds[u[U_ROUND]][u[U_IDX]].lowerBound - 1;

    bytes memory agreeStateReputationValue = concatenateToBytes64(u[U_AGREE_STATE_REPUTATION_VALUE], u[U_AGREE_STATE_REPUTATION_UID]);

    bytes32 reputationRootHash = getImpliedRoot(_reputationKey, agreeStateReputationValue, u[U_REPUTATION_BRANCH_MASK], reputationSiblings);
    bytes memory jhLeafValue = concatenateToBytes64(uint256(reputationRootHash), u[U_AGREE_STATE_NNODES]);
    bytes memory lastAgreeIdxBytes = new bytes(32);

    assembly {
      mstore(add(lastAgreeIdxBytes, 0x20), lastAgreeIdx)
    }
    // Prove that state is in our JRH, in the index corresponding to the last state that the two submissions agree on.
    bytes32 impliedRoot = getImpliedRoot(lastAgreeIdxBytes, jhLeafValue, u[U_AGREE_STATE_BRANCH_MASK], agreeStateSiblings);

    if (u[U_AGREE_STATE_REPUTATION_VALUE] == 0 && impliedRoot != jrh) {
      // This implies they are claiming that this is a new hash.
      return;
    }
    require(impliedRoot == jrh, "colony-reputation-mining-invalid-before-reputation-proof");
    // They've actually verified whatever they claimed. We increment their challengeStepCompleted by one to indicate this.
    // In the event that our opponent lied about this reputation not existing yet in the tree, they will both complete
    // a call to respondToChallenge, but we will have a higher challengeStepCompleted value, and so they will be the ones
    // eliminated.
    disputeRounds[u[U_ROUND]][u[U_IDX]].challengeStepCompleted += 1;
    // I think this trick can be used exactly once, and only because this is the last function to be called in the challege,
    // and I'm choosing to use it here. I *think* this is okay, because the only situation
    // where we don't prove anything with merkle proofs in this whole dance is here.
  }

  function proveAfterReputationValue(
    uint256[19] u,
    bytes _reputationKey,
    bytes32[] reputationSiblings,
    bytes32[] disagreeStateSiblings
  ) internal view
  {
    bytes32 jrh = disputeRounds[u[U_ROUND]][u[U_IDX]].jrh;
    uint256 firstDisagreeIdx = disputeRounds[u[U_ROUND]][u[U_IDX]].lowerBound;

    bytes memory disagreeStateReputationValue = concatenateToBytes64(u[U_DISAGREE_STATE_REPUTATION_VALUE], u[U_DISAGREE_STATE_REPUTATION_UID]);

    bytes32 reputationRootHash = getImpliedRoot(_reputationKey, disagreeStateReputationValue, u[U_REPUTATION_BRANCH_MASK], reputationSiblings);
    // Prove that state is in our JRH, in the index corresponding to the last state that the two submissions agree on.
    bytes memory jhLeafValue = concatenateToBytes64(uint256(reputationRootHash), u[U_DISAGREE_STATE_NNODES]);
    bytes memory firstDisagreeIdxBytes = new bytes(32);

    assembly {
      mstore(add(firstDisagreeIdxBytes, 0x20), firstDisagreeIdx)
    }

    bytes32 impliedRoot = getImpliedRoot(firstDisagreeIdxBytes, jhLeafValue, u[U_DISAGREE_STATE_BRANCH_MASK], disagreeStateSiblings);
    require(jrh==impliedRoot, "colony-reputation-mining-invalid-after-reputation-proof");
  }

  function performReputationCalculation(
    uint256[19] u,
    bytes32[] agreeStateSiblings,
    bytes originReputationKey,
    bytes32[] originReputationSiblings
  ) internal
  {

    require(u[U_AGREE_STATE_REPUTATION_VALUE] <= uint(MAX_INT128), "colony-reputation-mining-agreed-state-value-exceeds-max");
    require(u[U_DISAGREE_STATE_REPUTATION_VALUE] <= uint(MAX_INT128), "colony-reputation-mining-disagree-state-value-exceeds-max");

    proveUID(
      u,
      u[U_AGREE_STATE_REPUTATION_UID],
      u[U_DISAGREE_STATE_REPUTATION_UID]);

    proveValue(
      u,
      int256(u[U_AGREE_STATE_REPUTATION_VALUE]),
      agreeStateSiblings,
      int256(u[U_DISAGREE_STATE_REPUTATION_VALUE]),
      originReputationKey,
      originReputationSiblings);
  }

  function proveUID(
    uint256[19] u,
    uint256 _agreeStateReputationUID,
    uint256 _disagreeStateReputationUID
  ) internal
  {
    if (_agreeStateReputationUID != 0) {
      // i.e. if this was an existing reputation, then require that the ID hasn't changed.
      require(_agreeStateReputationUID == _disagreeStateReputationUID, "colony-reputation-mining-uid-changed-for-existing-reputation");
      emit ProveUIDSuccess(_agreeStateReputationUID, _disagreeStateReputationUID, true);
    } else {
      uint256 previousNewReputationUID = u[U_PREVIOUS_NEW_REPUTATION_UID];
      require(previousNewReputationUID + 1 == _disagreeStateReputationUID, "colony-reputation-mining-new-uid-incorrect");

      emit ProveUIDSuccess(previousNewReputationUID, _disagreeStateReputationUID, false);
    }
  }

  function proveValue(
    uint256[19] u,
    int256 _agreeStateReputationValue,
    bytes32[] _agreeStateSiblings,
    int256 _disagreeStateReputationValue,
    bytes _originReputationKey,
    bytes32[] _originReputationSiblings
  ) internal
  {
    ReputationLogEntry storage logEntry = reputationUpdateLog[u[U_LOG_ENTRY_NUMBER]];

    require(u[U_ORIGIN_REPUTATION_VALUE] <= uint(MAX_INT128), "colony-reputation-mining-origin-value-exceeds-max");
    int256 originReputationValue = int256(u[U_ORIGIN_REPUTATION_VALUE]);

    // We don't care about underflows for the purposes of comparison, but for the calculation we deem 'correct'.
    // i.e. a reputation can't be negative.
    if (u[U_DECAY_TRANSITION] == 1) {
      require(_disagreeStateReputationValue == (_agreeStateReputationValue*DECAY_NUMERATOR)/DECAY_DENOMINATOR, "colony-reputation-mining-decay-incorrect");
    } else {
      if (logEntry.amount >= 0) {
        // Don't allow reputation to overflow
        if (_agreeStateReputationValue + logEntry.amount >= MAX_INT128) {
          require(_disagreeStateReputationValue == MAX_INT128, "colony-reputation-mining-reputation-not-max-int128");
        } else {
          require(_agreeStateReputationValue + logEntry.amount == _disagreeStateReputationValue, "colony-reputation-mining-increased-reputation-value-incorrect");
        }
      } else {
        // We are working with a negative amount, which needs to be treated differently for child updates and everything else
        // Child reputations do not lose the whole of logEntry.amount, but the same fraction logEntry amount is
        // of the user's reputation in skill given by logEntry.skillId, i.e. the "origin skill"

        uint relativeUpdateNumber = getRelativeUpdateNumber(u, logEntry);
        uint nParents;
        (nParents, , ) = IColonyNetwork(colonyNetworkAddress).getSkill(logEntry.skillId);
        uint nChildUpdates = logEntry.nUpdates/2 - 1 - nParents;

        // Check if we are working with a child reputation update
        if (relativeUpdateNumber < nChildUpdates ||
            ((relativeUpdateNumber >= logEntry.nUpdates/2) && relativeUpdateNumber < (logEntry.nUpdates/2+nChildUpdates))) {
          // Don't allow origin reputation to become negative
          if (originReputationValue + logEntry.amount < 0) {
            require(_disagreeStateReputationValue == 0, "colony-reputation-mining-reputation-value-non-zero");
          } else if (originReputationValue == 0) {
            require(_agreeStateReputationValue == _disagreeStateReputationValue, "colony-reputation-mining-reputation-values-changed");
          } else {
            int256 childAmount = logEntry.amount * _agreeStateReputationValue / originReputationValue;
            require(_agreeStateReputationValue + childAmount == _disagreeStateReputationValue, "colony-reputation-mining-child-reputation-value-incorrect");
          }

          // If origin skill reputation exists, check it
          if (u[U_ORIGIN_REPUTATION_UID] != 0) {

            bytes memory originReputationValueBytes = concatenateToBytes64(u[U_ORIGIN_REPUTATION_VALUE], u[U_ORIGIN_REPUTATION_UID]);

            checkOriginReputationInState(
              u,
              _agreeStateSiblings,
              _originReputationKey,
              originReputationValueBytes,
              _originReputationSiblings);
          }
        } else {
          // Don't allow reputation to become negative
          if (_agreeStateReputationValue + logEntry.amount < 0) {
            require(_disagreeStateReputationValue == 0, "colony-reputation-mining-reputation-value-non-zero");
          } else {
            require(_agreeStateReputationValue + logEntry.amount == _disagreeStateReputationValue, "colony-reputation-mining-decreased-reputation-value-incorrect");
          }
        }
      }
    }

    emit ProveValueSuccess(_agreeStateReputationValue, _disagreeStateReputationValue, originReputationValue);
  }

  function getRelativeUpdateNumber(uint256[19] u, ReputationLogEntry logEntry) internal view returns (uint256) {
    uint256 nNodes = IColonyNetwork(colonyNetworkAddress).getReputationRootHashNNodes();
    uint256 updateNumber = disputeRounds[u[U_ROUND]][u[U_IDX]].lowerBound - 1 - nNodes;
    uint256 relativeUpdateNumber = (updateNumber - logEntry.nPreviousUpdates) % (logEntry.nUpdates/2);
    return relativeUpdateNumber;
  }

  function checkPreviousReputationInState(
    uint256[19] u,
    bytes32[] agreeStateSiblings,
    bytes previousNewReputationKey,
    bytes32[] previousNewReputationSiblings
    ) internal view
  {
    // We binary searched to the first disagreement, so the last agreement is the one before
    uint256 lastAgreeIdx = disputeRounds[u[U_ROUND]][u[U_IDX]].lowerBound - 1;

    bytes memory previousNewReputationValue = concatenateToBytes64(u[U_PREVIOUS_NEW_REPUTATION_VALUE], u[U_PREVIOUS_NEW_REPUTATION_UID]);

    bytes32 reputationRootHash = getImpliedRoot(
      previousNewReputationKey,
      previousNewReputationValue,
      u[U_PREVIOUS_NEW_REPUTATION_BRANCH_MASK],
      previousNewReputationSiblings
    );
    bytes memory jhLeafValue = concatenateToBytes64(uint256(reputationRootHash), u[U_AGREE_STATE_NNODES]);
    bytes memory lastAgreeIdxBytes = new bytes(32);
    assembly {
      mstore(add(lastAgreeIdxBytes, 0x20), lastAgreeIdx)
    }
    // Prove that state is in our JRH, in the index corresponding to the last state that the two submissions agree on
    bytes32 impliedRoot = getImpliedRoot(lastAgreeIdxBytes, jhLeafValue, u[U_AGREE_STATE_BRANCH_MASK], agreeStateSiblings);
    require(impliedRoot == disputeRounds[u[U_ROUND]][u[U_IDX]].jrh, "colony-reputation-mining-last-state-disagreement");
  }

  function checkOriginReputationInState(
    uint256[19] u,
    bytes32[] agreeStateSiblings,
    bytes originReputationKey,
    bytes originReputationValueBytes,
    bytes32[] originReputationStateSiblings
    ) internal view
  {
    // We binary searched to the first disagreement, so the last agreement is the one before
    uint256 lastAgreeIdx = disputeRounds[u[U_ROUND]][u[U_IDX]].lowerBound - 1;

    bytes32 reputationRootHash = getImpliedRoot(
      originReputationKey,
      originReputationValueBytes,
      u[U_ORIGIN_SKILL_REPUTATION_BRANCH_MASK],
      originReputationStateSiblings
    );
    bytes memory jhLeafValue = concatenateToBytes64(uint256(reputationRootHash), u[U_AGREE_STATE_NNODES]);
    bytes memory lastAgreeIdxBytes = new bytes(32);
    assembly {
      mstore(add(lastAgreeIdxBytes, 0x20), lastAgreeIdx)
    }
    // Prove that state is in our JRH, in the index corresponding to the last state that the two submissions agree on
    bytes32 impliedRoot = getImpliedRoot(lastAgreeIdxBytes, jhLeafValue, u[U_AGREE_STATE_BRANCH_MASK], agreeStateSiblings);
    require(impliedRoot == disputeRounds[u[U_ROUND]][u[U_IDX]].jrh, "colony-reputation-mining-origin-skill-state-disagreement");
  }

  function saveProvedReputation(uint256[19] u) internal {
    uint256 previousReputationUID = u[U_PREVIOUS_NEW_REPUTATION_UID];
    // Require that it is at least plausible
    uint256 delta = disputeRounds[u[U_ROUND]][u[U_IDX]].intermediateReputationNNodes - previousReputationUID;
    // Could be zero if this is an update to an existing reputation, or it could be 1 if we have just added a new
    // reputation. Anything else is inconsistent.
    // We don't care about over/underflowing, and don't want to use `sub` so that this require message is returned.
    require(delta == 0 || delta == 1, "colony-reputation-mining-proved-uid-inconsistent");
    // Save the index for tiebreak scenarios later.
    disputeRounds[u[U_ROUND]][u[U_IDX]].provedPreviousReputationUID = previousReputationUID;
  }

  function concatenateToBytes64(uint256 a, uint256 b) internal pure returns (bytes) {
    bytes memory retValue = new bytes(64);
    assembly {
      // Seems as if you access an external variable by name, you get the value, straight up...?
      mstore(add(retValue, 0x20), a)
      mstore(add(retValue, 0x40), b)
    }
    return retValue;
  }
}
