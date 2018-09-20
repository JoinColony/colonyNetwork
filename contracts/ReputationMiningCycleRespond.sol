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

pragma solidity >=0.4.23;
pragma experimental "ABIEncoderV2";

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
  event ProveValueSuccess(uint256 _agreeStateReputationValue, uint256 _disagreeStateReputationValue, uint256 _originReputationValue);

  /// @notice A modifier that checks if the challenge corresponding to the hash in the passed `round` and `id` is open
  /// @param round The round number of the hash under consideration
  /// @param idx The index in the round of the hash under consideration
  modifier challengeOpen(uint256 round, uint256 idx) {
    // Check the binary search has finished, but not necessarily confirmed
    require(disputeRounds[round][idx].lowerBound == disputeRounds[round][idx].upperBound, "colony-reputation-binary-search-incomplete");
    // Check the binary search result has been confirmed
    require(
      2**(disputeRounds[round][idx].challengeStepCompleted-2)>disputeRounds[round][idx].jrhNNodes,
      "colony-reputation-mining-binary-search-result-not-confirmed"
    );
    // Check that we have not already responded to the challenge
    require(
      2**(disputeRounds[round][idx].challengeStepCompleted-3)<=disputeRounds[round][idx].jrhNNodes,
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

  uint constant DECAY_NUMERATOR =    992327946262944; // 24-hr mining cycles
  uint constant DECAY_DENOMINATOR = 1000000000000000;

  function respondToChallenge(
    uint256[11] memory u, //An array of 11 UINT Params, ordered as given above.
    bytes memory _reputationKey,
    bytes32[] memory reputationSiblings,
    bytes memory agreeStateReputationValue,
    bytes32[] memory agreeStateSiblings,
    bytes memory disagreeStateReputationValue,
    bytes32[] memory disagreeStateSiblings,
    bytes memory previousNewReputationKey,
    bytes memory previousNewReputationValue,
    bytes32[] memory previousNewReputationSiblings
    bytes memory originReputationKey,
    bytes memory originReputationValue,
    bytes32[] memory originReputationSiblings
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
    checkKey(u, _reputationKey, agreeStateReputationValue);

    // Prove the reputation's starting value is in some state, and that state is in the appropriate index in our JRH
    proveBeforeReputationValue(u, _reputationKey, reputationSiblings, agreeStateReputationValue, agreeStateSiblings);

    // Prove the reputation's final value is in a particular state, and that state is in our JRH in the appropriate index (corresponding to the first disagreement between these miners)
    // By using the same branchMask and siblings, we know that no other changes to the reputation state tree have been slipped in.
    proveAfterReputationValue(u, _reputationKey, reputationSiblings, disagreeStateReputationValue, disagreeStateSiblings);

    // Perform the reputation calculation ourselves.
    performReputationCalculation(
      u,
      agreeStateReputationValue,
      disagreeStateReputationValue,
      agreeStateSiblings,
      previousNewReputationKey,
      previousNewReputationValue,
      previousNewReputationSiblings,
      originReputationKey,
      originReputationValue,
      originReputationSiblings);

    confirmChallengeCompleted(u);

    // Safety net?
    /* if (disputeRounds[round][idx].challengeStepCompleted==disputeRounds[round][opponentIdx].challengeStepCompleted){
      // Freeze the reputation mining system.
    } */
  }

  /////////////////////////
  // Internal functions
  /////////////////////////

  function confirmChallengeCompleted(uint256[11] u) internal {
    // If everthing checked out, note that we've responded to the challenge.
    disputeRounds[u[U_ROUND]][u[U_IDX]].challengeStepCompleted += 1;
    disputeRounds[u[U_ROUND]][u[U_IDX]].lastResponseTimestamp = now;
  }

  function checkKey(uint256[11] memory u, bytes memory _reputationKey, bytes memory _reputationValue) internal view {
    // If the state transition we're checking is less than the number of nodes in the currently accepted state, it's a decay transition
    // Otherwise, look up the corresponding entry in the reputation log.
    uint256 updateNumber = disputeRounds[u[U_ROUND]][u[U_IDX]].lowerBound - 1;
    if (updateNumber < IColonyNetwork(colonyNetworkAddress).getReputationRootHashNNodes()) {
      checkKeyDecay(updateNumber, _reputationValue);
      u[U_DECAY_TRANSITION] = 1;
    } else {
      checkKeyLogEntry(u[U_ROUND], u[U_IDX], u[U_LOG_ENTRY_NUMBER], _reputationKey);
    }
  }

  function checkKeyDecay(uint256 _updateNumber, bytes memory _reputationValue) internal pure {
    uint256 uid;
    bytes memory reputationValue = new bytes(64);
    reputationValue = _reputationValue;
    assembly {
      // NB first 32 bytes contain the length of the bytes object, so we are still correctly loading the second 32 bytes of the
      // reputationValue, which contains the UID
      uid := mload(add(reputationValue,64))
    }
    // We check that the reputation UID is right for the decay transition being disputed.
    // The key is then implicitly checked when they prove that the key+value they supplied is in the
    // right intermediate state in their justification tree.
    require(uid-1 == _updateNumber, "colony-reputation-mining-uid-not-decay");
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
      // Then we're updating a colony-wide total, so we expect an address of address(0x0)
      expectedAddress = address(0x0);
    } else {
      // We're updating a user-specific total
      expectedAddress = logEntry.user;
    }

    // Expected skill Id
    // We update skills in the order children, then parents, then the skill listed in the log itself.
    // If the amount in the log is positive, then no children are being updated.
    uint nParents = IColonyNetwork(colonyNetworkAddress).getSkillNParents(logEntry.skillId);
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
    uint256[11] memory u,
    bytes memory _reputationKey,
    bytes32[] memory reputationSiblings,
    bytes memory agreeStateReputationValue,
    bytes32[] memory agreeStateSiblings
  ) internal
  {
    bytes32 jrh = disputeRounds[u[U_ROUND]][u[U_IDX]].jrh;
    // We binary searched to the first disagreement, so the last agreement is the one before.
    uint256 lastAgreeIdx = disputeRounds[u[U_ROUND]][u[U_IDX]].lowerBound - 1;
    uint256 reputationValue;
    assembly {
        reputationValue := mload(add(agreeStateReputationValue, 32))
    }

    bytes32 reputationRootHash = getImpliedRootHashKey(
      _reputationKey,
      agreeStateReputationValue,
      u[U_REPUTATION_BRANCH_MASK],
      reputationSiblings
    );

    bytes memory jhLeafValue = new bytes(64);
    assembly {
      mstore(add(jhLeafValue, 0x20), reputationRootHash)
      let x := mload(add(u, mul(32,3))) // 3 = U_AGREE_STATE_NNODES. Constants not supported by inline solidity
      mstore(add(jhLeafValue, 0x40), x)
    }
    // Prove that state is in our JRH, in the index corresponding to the last state that the two submissions agree on.
    bytes32 impliedRoot = getImpliedRootNoHashKey(bytes32(lastAgreeIdx), jhLeafValue, u[U_AGREE_STATE_BRANCH_MASK], agreeStateSiblings);

    if (reputationValue == 0 && impliedRoot != jrh) {
      // This implies they are claiming that this is a new hash.
      // Check they have incremented nNodes by one 
      require(u[U_DISAGREE_STATE_NNODES] - u[U_AGREE_STATE_NNODES] == 1, "colony-reputation-mining-nnodes-changed-by-not-1");
      return;
    }
    require(impliedRoot == jrh, "colony-reputation-mining-invalid-before-reputation-proof");
    // Check that they have not changed nNodes from the agree state 
    require(u[U_DISAGREE_STATE_NNODES] == u[U_AGREE_STATE_NNODES], "colony-reputation-mining-nnodes-changed");
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
    uint256[11] memory u,
    bytes memory _reputationKey,
    bytes32[] memory reputationSiblings,
    bytes memory disagreeStateReputationValue,
    bytes32[] memory disagreeStateSiblings
  ) internal view
  {
    bytes32 jrh = disputeRounds[u[U_ROUND]][u[U_IDX]].jrh;
    uint256 firstDisagreeIdx = disputeRounds[u[U_ROUND]][u[U_IDX]].lowerBound;
    bytes32 reputationRootHash = getImpliedRootHashKey(
      _reputationKey,
      disagreeStateReputationValue,
      u[U_REPUTATION_BRANCH_MASK],
      reputationSiblings
    );
    // Prove that state is in our JRH, in the index corresponding to the last state that the two submissions agree on.
    bytes memory jhLeafValue = new bytes(64);

    assembly {
      mstore(add(jhLeafValue, 0x20), reputationRootHash)
      let x := mload(add(u, mul(32,5))) // 5 = U_DISAGREE_STATE_NNODES. Constants not supported by inline solidity.
      mstore(add(jhLeafValue, 0x40), x)
    }

    bytes32 impliedRoot = getImpliedRootNoHashKey(
      bytes32(firstDisagreeIdx),
      jhLeafValue,
      u[U_DISAGREE_STATE_BRANCH_MASK],
      disagreeStateSiblings
    );
    require(jrh==impliedRoot, "colony-reputation-mining-invalid-after-reputation-proof");
  }

  function performReputationCalculation(
    uint256[11] memory u,
    bytes memory agreeStateReputationValueBytes,
    bytes memory disagreeStateReputationValueBytes,
    bytes32[] memory agreeStateSiblings,
    bytes memory previousNewReputationKey,
    bytes memory previousNewReputationValueBytes,
    bytes32[] memory previousNewReputationSiblings,
    bytes memory originReputationKey,
    bytes memory originReputationValueBytes,
    bytes32[] memory originReputationSiblings
  ) internal view
  {
    uint256 agreeStateReputationValue;
    uint256 disagreeStateReputationValue;
    uint256 agreeStateReputationUID;
    uint256 disagreeStateReputationUID;
    uint256 originReputationValue;

    assembly {
        agreeStateReputationValue := mload(add(agreeStateReputationValueBytes, 32))
        disagreeStateReputationValue := mload(add(disagreeStateReputationValueBytes, 32))
        agreeStateReputationUID := mload(add(agreeStateReputationValueBytes, 64))
        disagreeStateReputationUID := mload(add(disagreeStateReputationValueBytes, 64))
        originReputationValue := mload(add(originReputationValueBytes, 32))
    }

    proveUID(
      u,
      agreeStateReputationUID,
      disagreeStateReputationUID,
      agreeStateSiblings,
      previousNewReputationKey,
      previousNewReputationValueBytes,
      previousNewReputationSiblings);

    proveValue(u, agreeStateReputationValue, disagreeStateReputationValue, originReputationValue);
  }

  function proveUID(
    uint256[11] u,
    uint256 _agreeStateReputationUID,
    uint256 _disagreeStateReputationUID,
    bytes32[] _agreeStateSiblings,
    bytes _previousNewReputationKey,
    bytes _previousNewReputationValue,
    bytes32[] _previousNewReputationSiblings
  ) internal
  {
    if (_agreeStateReputationUID != 0) {
      // i.e. if this was an existing reputation, then require that the ID hasn't changed.
      require(_agreeStateReputationUID == _disagreeStateReputationUID, "colony-reputation-mining-uid-changed-for-existing-reputation");
      emit ProveUIDSuccess(_agreeStateReputationUID, _disagreeStateReputationUID, true);
    } else {
      uint256 previousNewReputationUID;
      assembly {
        previousNewReputationUID := mload(add(_previousNewReputationValue, 64))
      }
      require(previousNewReputationUID + 1 == _disagreeStateReputationUID, "colony-reputation-mining-new-uid-incorrect");

      // If necessary, check the supplied previousNewRepuation is, in fact, in the same reputation state as the 'agree' state.
      // i.e. the reputation they supplied is in the 'agree' state.
      checkPreviousReputationInState(
        u,
        _agreeStateSiblings,
        _previousNewReputationKey,
        _previousNewReputationValue,
        _previousNewReputationSiblings);

      // Save the index for tiebreak scenarios later.
      saveProvedReputation(u, _previousNewReputationValue);

      emit ProveUIDSuccess(previousNewReputationUID, _disagreeStateReputationUID, false);
    }
  }

  function proveValue(
    uint256[11] u,
    uint256 _agreeStateReputationValue,
    uint256 _disagreeStateReputationValue,
    uint256 _originReputationValue
  ) internal 
  {
    ReputationLogEntry storage logEntry = reputationUpdateLog[u[U_LOG_ENTRY_NUMBER]];

    // We don't care about underflows for the purposes of comparison, but for the calculation we deem 'correct'.
    // i.e. a reputation can't be negative.
    if (u[U_DECAY_TRANSITION] == 1) {
      // Very large reputation decays are calculated the 'other way around' to avoid overflows.
      if (agreeStateReputationValue > uint256(2**256 - 1)/uint256(10**15)) {
        require(_disagreeStateReputationValue == (_agreeStateReputationValue/DECAY_DENOMINATOR)*DECAY_NUMERATOR, "colony-reputation-mining-decay-incorrect");
      } else {
        require(_disagreeStateReputationValue == (_agreeStateReputationValue*DECAY_NUMERATOR)/DECAY_DENOMINATOR, "colony-reputation-mining-decay-incorrect");
      }
    } else {
      int amount = logEntry.amount;
      if (amount >= 0) {
        // Don't allow reputation to overflow
        if (uint(amount) + _agreeStateReputationValue < _agreeStateReputationValue) {
          require(_disagreeStateReputationValue == 2**256 - 1, "colony-reputation-mining-reputation-not-max-uint");
        } else {
          // TODO: Is this safe? I think so, because even if there's over/underflows, they should still be the same number.
          // Can't we convert `amount` to uint instead of these explicit converstions to (int)? For sufficiently large uints this converstion would produce the wrong results?
          require(int(_agreeStateReputationValue)+amount == int(_disagreeStateReputationValue), "colony-reputation-mining-invalid-newest-reputation-proof");
        }
      } else {
        // Don't allow reputation to underflow
        if (uint(amount * -1) > _agreeStateReputationValue) {
          require(_disagreeStateReputationValue == 0, "colony-reputation-mining-reputation-value-non-zero");
        } else {
          uint nParents;
          (nParents, , ) = IColonyNetwork(colonyNetworkAddress).getSkill(logEntry.skillId);
          uint nChildUpdates = logEntry.nUpdates/2 - 1 - nParents;
          // Child reputations do not lose the whole of logEntry.amount, but the same fraction logEntry amount is 
          // of the user's reputation in skill given by logEntry.skillId, i.e. the "origin skill
          uint relativeUpdateNumber = getRelativeUpdateNumber(u, logEntry);
          if (relativeUpdateNumber < nChildUpdates ||
            ((relativeUpdateNumber >= logEntry.nUpdates/2) && relativeUpdateNumber < (logEntry.nUpdates/2+nChildUpdates))) {
            // We are working with a child update! Check adjusted amount instead of this impossible calculation
            // int childAmount = amount * _agreeStateReputationValue / _originSkillReputationValue
            require((_agreeStateReputationValue - _disagreeStateReputationValue) == ((uint(amount * -1) * _agreeStateReputationValue) / _originReputationValue), "colony-reputation-mining-invalid-newest-reputation-proof");
          } else {
            // TODO: Is this safe? I think so, because even if there's over/underflows, they should still be the same number.
            require(int(_agreeStateReputationValue)+amount == int(_disagreeStateReputationValue), "colony-reputation-mining-invalid-newest-reputation-proof");
          }
        }
      }
    }

    emit ProveValueSuccess(_agreeStateReputationValue, _disagreeStateReputationValue, _originReputationValue);
  }

  function getRelativeUpdateNumber(uint256[11] u, ReputationLogEntry logEntry) internal view returns (uint256) {
    uint256 nNodes = IColonyNetwork(colonyNetworkAddress).getReputationRootHashNNodes();
    uint256 updateNumber = disputeRounds[u[U_ROUND]][u[U_IDX]].lowerBound - 1 - nNodes;
    uint256 relativeUpdateNumber = (updateNumber - logEntry.nPreviousUpdates) % (logEntry.nUpdates/2);
    return relativeUpdateNumber;
  }

  function checkPreviousReputationInState(
    uint256[11] memory u,
    bytes32[] memory agreeStateSiblings,
    bytes memory previousNewReputationKey,
    bytes memory previousNewReputationValue,
    bytes32[] memory previousNewReputationSiblings
    ) internal view
  {
    // We binary searched to the first disagreement, so the last agreement is the one before
    uint256 lastAgreeIdx = disputeRounds[u[U_ROUND]][u[U_IDX]].lowerBound - 1;

    bytes32 reputationRootHash = getImpliedRootHashKey(
      previousNewReputationKey,
      previousNewReputationValue,
      u[U_PREVIOUS_NEW_REPUTATION_BRANCH_MASK],
      previousNewReputationSiblings
    );
    bytes memory jhLeafValue = new bytes(64);
    assembly {
      mstore(add(jhLeafValue, 0x20), reputationRootHash)
      let x := mload(add(u, mul(32,3))) // 3 = U_AGREE_STATE_NNODES. Constants not supported by inline assembly
      mstore(add(jhLeafValue, 0x40), x)
    }
    // Prove that state is in our JRH, in the index corresponding to the last state that the two submissions agree on
    bytes32 impliedRoot = getImpliedRootNoHashKey(bytes32(lastAgreeIdx), jhLeafValue, u[U_AGREE_STATE_BRANCH_MASK], agreeStateSiblings);
    require(impliedRoot == disputeRounds[u[U_ROUND]][u[U_IDX]].jrh, "colony-reputation-mining-last-state-disagreement");
  }

  function saveProvedReputation(uint256[11] memory u, bytes memory previousNewReputationValue) internal {
    uint256 previousReputationUID;
    assembly {
      previousReputationUID := mload(add(previousNewReputationValue,0x40))
    }
    // Require that it is at least plausible
    uint256 delta = disputeRounds[u[U_ROUND]][u[U_IDX]].intermediateReputationNNodes - previousReputationUID;
    // Could be zero if this is an update to an existing reputation, or it could be 1 if we have just added a new
    // reputation. Anything else is inconsistent.
    // We don't care about over/underflowing, and don't want to use `sub` so that this require message is returned.
    require(delta == 0 || delta == 1, "colony-reputation-mining-proved-uid-inconsistent");
    // Save the index for tiebreak scenarios later.
    disputeRounds[u[U_ROUND]][u[U_IDX]].provedPreviousReputationUID = previousReputationUID;
  }
}
