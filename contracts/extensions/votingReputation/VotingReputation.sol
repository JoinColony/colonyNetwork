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

pragma solidity 0.8.21;
pragma experimental ABIEncoderV2;

import "./../../colonyNetwork/IColonyNetwork.sol";
import "./../../colony/ColonyRoles.sol";
import "./../../common/ERC20Extended.sol";
import "./../../tokenLocking/ITokenLocking.sol";
import "./VotingReputationStorage.sol";

contract VotingReputation is VotingReputationStorage {

  // Public

  function initialise(
    uint256 _totalStakeFraction,
    uint256 _voterRewardFraction,
    uint256 _userMinStakeFraction,
    uint256 _maxVoteFraction,
    uint256 _stakePeriod,
    uint256 _submitPeriod,
    uint256 _revealPeriod,
    uint256 _escalationPeriod
  )
    public
    onlyRoot
  {
    require(state == ExtensionState.Deployed, "voting-rep-already-initialised");

    require(_totalStakeFraction <= WAD / 2, "voting-rep-greater-than-half-wad");
    require(_voterRewardFraction <= WAD / 2, "voting-rep-greater-than-half-wad");

    require(_userMinStakeFraction <= WAD, "voting-rep-greater-than-wad");
    require(_maxVoteFraction <= WAD, "voting-rep-greater-than-wad");

    require(_stakePeriod <= 365 days, "voting-rep-period-too-long");
    require(_submitPeriod <= 365 days, "voting-rep-period-too-long");
    require(_revealPeriod <= 365 days, "voting-rep-period-too-long");
    require(_escalationPeriod <= 365 days, "voting-rep-period-too-long");

    state = ExtensionState.Active;

    totalStakeFraction = _totalStakeFraction;
    voterRewardFraction = _voterRewardFraction;

    userMinStakeFraction = _userMinStakeFraction;
    maxVoteFraction = _maxVoteFraction;

    stakePeriod = _stakePeriod;
    submitPeriod = _submitPeriod;
    revealPeriod = _revealPeriod;
    escalationPeriod = _escalationPeriod;

    emit ExtensionInitialised();
  }

 function createMotion(
    uint256 _domainId,
    uint256 _childSkillIndex,
    address _altTarget,
    bytes memory _action,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
    notDeprecated
  {
    require(state == ExtensionState.Active, "voting-rep-not-active");
    require(_altTarget != address(colony), "voting-rep-alt-target-cannot-be-base-colony");

    address target = getTarget(_altTarget);
    uint256 domainSkillId = colony.getDomain(_domainId).skillId;
    ActionSummary memory actionSummary = getActionSummary(_action, target);

    require(actionSummary.sig != OLD_MOVE_FUNDS, "voting-rep-disallowed-function");
    require(
      actionSummary.domainSkillId != type(uint256).max &&
      actionSummary.expenditureId != type(uint256).max,
      "voting-rep-invalid-multicall"
    );

    if (actionSummary.sig == NO_ACTION) {
      // For the special no-op action, we hold the vote the provided domain
      require(_childSkillIndex == UINT256_MAX, "voting-rep-invalid-domain-id");
      actionSummary.domainSkillId = domainSkillId;
    } else {
      // Otherwise, we validate the vote domain against the action
      if (domainSkillId == actionSummary.domainSkillId) {
        require(_childSkillIndex == UINT256_MAX, "voting-rep-invalid-domain-id");
      } else {
        uint256 childSkillId = colonyNetwork.getChildSkillId(domainSkillId, _childSkillIndex);
        require(childSkillId == actionSummary.domainSkillId, "voting-rep-invalid-domain-id");
      }
    }

    motionCount += 1;
    Motion storage motion = motions[motionCount];
    motion.events[STAKE_END] = uint64(block.timestamp + stakePeriod);

    motion.rootHash = colonyNetwork.getReputationRootHash();
    motion.domainId = _domainId;
    motion.skillId = domainSkillId;

    motion.skillRep = checkReputation(motion.rootHash, domainSkillId, address(0x0), _key, _value, _branchMask, _siblings);
    require(motion.skillRep > 0, "voting-rep-no-reputation-in-domain");
    motion.altTarget = _altTarget;
    motion.action = _action;
    motion.sig = actionSummary.sig;

    if (isExpenditureSig(actionSummary.sig)) {
      bytes32 structHash = getExpenditureStructHash(getExpenditureAction(motion.action));
      require(expenditureMotionCounts_DEPRECATED[structHash] == 0, "voting-rep-motion-locked");
    }

    emit MotionCreated(motionCount, msgSender(), _domainId);
  }

  function submitVote(
    uint256 _motionId,
    bytes32 _voteSecret,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    Motion storage motion = motions[_motionId];
    require(getMotionState(_motionId) == MotionState.Submit, "voting-rep-motion-not-open");
    require(_voteSecret != bytes32(0), "voting-rep-invalid-secret");

    uint256 userRep = checkReputation(motion.rootHash, motion.skillId, msgSender(), _key, _value, _branchMask, _siblings);

    // Count reputation if first submission
    if (voteSecrets[_motionId][msgSender()] == bytes32(0)) {
      motion.repSubmitted += userRep;
    }

    voteSecrets[_motionId][msgSender()] = _voteSecret;

    emit MotionVoteSubmitted(_motionId, msgSender());

    if (motion.repSubmitted >= wmul(motion.skillRep, maxVoteFraction)) {
      motion.events[SUBMIT_END] = uint64(block.timestamp);
      motion.events[REVEAL_END] = uint64(block.timestamp + revealPeriod);

      emit MotionEventSet(_motionId, SUBMIT_END);
    }
  }

  function revealVote(
    uint256 _motionId,
    bytes32 _salt,
    uint256 _vote,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    Motion storage motion = motions[_motionId];
    require(getMotionState(_motionId) == MotionState.Reveal, "voting-rep-motion-not-reveal");
    require(_vote <= 1, "voting-rep-bad-vote");

    uint256 userRep = checkReputation(motion.rootHash, motion.skillId, msgSender(), _key, _value, _branchMask, _siblings);
    motion.votes[_vote] += userRep;

    bytes32 voteSecret = voteSecrets[_motionId][msgSender()];
    require(voteSecret == keccak256(abi.encodePacked(_salt, _vote)), "voting-rep-secret-no-match");
    delete voteSecrets[_motionId][msgSender()];

    uint256 voterReward = getVoterReward(_motionId, userRep);
    motion.paidVoterComp += voterReward;

    emit MotionVoteRevealed(_motionId, msgSender(), _vote);

    // See if reputation revealed matches reputation submitted
    if ((motion.votes[NAY] + motion.votes[YAY]) == motion.repSubmitted) {
      motion.events[REVEAL_END] = uint64(block.timestamp);

      emit MotionEventSet(_motionId, REVEAL_END);
    }

    tokenLocking.transfer(token, voterReward, msgSender(), true);
  }

  function escalateMotion(
    uint256 _motionId,
    uint256 _newDomainId,
    uint256 _childSkillIndex,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    Motion storage motion = motions[_motionId];
    require(getMotionState(_motionId) == MotionState.Closed, "voting-rep-motion-not-closed");

    uint256 newDomainSkillId = colony.getDomain(_newDomainId).skillId;
    uint256 childSkillId = colonyNetwork.getChildSkillId(newDomainSkillId, _childSkillIndex);
    require(childSkillId == motion.skillId, "voting-rep-invalid-domain-proof");

    uint256 domainId = motion.domainId;
    motion.domainId = _newDomainId;
    motion.skillId = newDomainSkillId;
    motion.skillRep = checkReputation(motion.rootHash, motion.skillId, address(0x0), _key, _value, _branchMask, _siblings);

    uint256 loser = (motion.votes[NAY] < motion.votes[YAY]) ? NAY : YAY;
    motion.stakes[loser] -= motion.paidVoterComp;
    motion.pastVoterComp[loser] += motion.paidVoterComp;
    delete motion.paidVoterComp;

    uint256 requiredStake = getRequiredStake(_motionId);

    if (motion.stakes[NAY] < requiredStake || motion.stakes[YAY] < requiredStake) {
      motion.events[STAKE_END] = uint64(block.timestamp + stakePeriod);
    } else {
      motion.events[STAKE_END] = uint64(block.timestamp);
      motion.events[SUBMIT_END] = motion.events[STAKE_END] + uint64(submitPeriod);
      motion.events[REVEAL_END] = motion.events[SUBMIT_END] + uint64(revealPeriod);
    }

    motion.escalated = true;

    emit MotionEscalated(_motionId, msgSender(), domainId, _newDomainId);

    if (motion.events[STAKE_END] <= uint64(block.timestamp)) {
      emit MotionEventSet(_motionId, STAKE_END);
    }
  }

  function finalizeMotion(uint256 _motionId) public {
    Motion storage motion = motions[_motionId];
    require(getMotionState(_motionId) == MotionState.Finalizable, "voting-rep-motion-not-finalizable");

    assert(
      motion.stakes[YAY] == getRequiredStake(_motionId) ||
      (motion.votes[NAY] + motion.votes[YAY]) > 0
    );

    motion.finalized = true;

    bool canExecute = (
      motion.stakes[NAY] < motion.stakes[YAY] ||
      motion.votes[NAY] < motion.votes[YAY]
    );

    if (motion.sig == bytes4(0)) { // Backwards compatibility for versions 9 and below
      bytes memory action = getExpenditureAction(motion.action);
      if (isExpenditureSig(getSig(action)) && getTarget(motion.altTarget) == address(colony)) {
        uint256 expenditureId = unlockExpenditure(_motionId);
        uint256 votePower = (motion.votes[NAY] + motion.votes[YAY]) > 0 ?
          motion.votes[YAY] : motion.stakes[YAY];

        bytes32 actionHash;
        assembly {
          mstore(add(action, 0xe4), 0x0)
          actionHash := keccak256(add(action, 0x64), sub(mload(action), 0x44))
        }

        if (expenditurePastVotes_DEPRECATED[actionHash] < votePower) {
          expenditurePastVotes_DEPRECATED[actionHash] = votePower;
        } else if (motion.domainId > 1) {
          canExecute = false;
        }
      }
    } else { // New functionality for versions 10 and above
      if (isExpenditureSig(motion.sig) && getTarget(motion.altTarget) == address(colony)) {
        uint256 expenditureId = unlockExpenditure(_motionId);
        uint256 votePower = (motion.votes[NAY] + motion.votes[YAY]) > 0 ?
          motion.votes[YAY] : motion.stakes[YAY];

        if (expenditurePastVotes[expenditureId] < votePower) {
          expenditurePastVotes[expenditureId] = votePower;
        } else if (motion.domainId > 1) {
          canExecute = false;
        }
      }
    }

    bool executed;

    if (canExecute) {
      executed = executeCall(_motionId, motion.action);
      require(executed || failingExecutionAllowed(_motionId), "voting-execution-failed-not-one-week");
    }

    emit MotionFinalized(_motionId, motion.action, executed);
  }

  function failingExecutionAllowed(uint256 _motionId) public view returns (bool _allowed) {
    Motion storage motion = motions[_motionId];
    uint256 requiredStake = getRequiredStake(_motionId);

    // Failing execution is allowed if we didn't fully stake, and it's been a week since staking ended
    if (motion.stakes[YAY] < requiredStake || motion.stakes[NAY] < requiredStake) {
      return block.timestamp >= motion.events[STAKE_END] + 7 days;
    } else {
      // It was fully staked, and went to a vote.
      // Failing execution is also allowed if it's been a week since reveal ended
      return block.timestamp >= motion.events[REVEAL_END] + 7 days;
    }
  }

  // Public view functions

  function getTotalStakeFraction() public view returns (uint256 _fraction) {
    return totalStakeFraction;
  }

  function getVoterRewardFraction() public view returns (uint256 _fraction) {
    return voterRewardFraction;
  }

  function getUserMinStakeFraction() public view returns (uint256 _fraction) {
    return userMinStakeFraction;
  }

  function getMaxVoteFraction() public view returns (uint256 _fraction) {
    return maxVoteFraction;
  }

  function getStakePeriod() public view returns (uint256 _period) {
    return stakePeriod;
  }

  function getSubmitPeriod() public view returns (uint256 _period) {
    return submitPeriod;
  }

  function getRevealPeriod() public view returns (uint256 _period) {
    return revealPeriod;
  }

  function getEscalationPeriod() public view returns (uint256 _period) {
    return escalationPeriod;
  }

  function getMotionCount() public view returns (uint256 _count) {
    return motionCount;
  }

  function getMotion(uint256 _motionId) public view returns (Motion memory _motion) {
    _motion = motions[_motionId];
  }

  function getStake(uint256 _motionId, address _staker, uint256 _vote) public view returns (uint256 _stake) {
    return stakes[_motionId][_staker][_vote];
  }

  function getExpenditureMotionCount(bytes32 _structHash) public view returns (uint256 _count) {
    return expenditureMotionCounts_DEPRECATED[_structHash];
  }

  function getExpenditureMotionLock(uint256 _expenditureId) public view returns (uint256 _motionId) {
    return expenditureMotionLocks[_expenditureId];
  }

  function getExpenditurePastVote(uint256 _expenditureId) public view returns (uint256 _vote) {
    return expenditurePastVotes[_expenditureId];
  }

  function getVoterReward(uint256 _motionId, uint256 _voterRep) public view returns (uint256 _reward) {
    Motion storage motion = motions[_motionId];
    uint256 fractionUserReputation = wdiv(_voterRep, motion.repSubmitted);
    uint256 totalStake = motion.stakes[YAY] + motion.stakes[NAY];
    return wmul(wmul(fractionUserReputation, totalStake), voterRewardFraction);
  }

  function getVoterRewardRange(uint256 _motionId, uint256 _voterRep, address _voterAddress) public view returns (uint256 _rewardMin, uint256 _rewardMax) {
    Motion storage motion = motions[_motionId];
    // The minimum reward is when everyone has voted, with a total weight of motion.skillRep
    uint256 minFractionUserReputation = wdiv(_voterRep, motion.skillRep);

    // The maximum reward is when this user is the only other person who votes (if they haven't already),
    // aside from those who have already done so
    uint256 voteTotal = motion.repSubmitted;
    // Has the user already voted?
    if (voteSecrets[_motionId][_voterAddress] == bytes32(0)) {
      // They have not, so add their rep
      voteTotal += _voterRep;
    }
    uint256 maxFractionUserReputation = wdiv(_voterRep, voteTotal);

    uint256 totalStake = motion.stakes[YAY] + motion.stakes[NAY];
    return (
      wmul(wmul(minFractionUserReputation, totalStake), voterRewardFraction),
      wmul(wmul(maxFractionUserReputation, totalStake), voterRewardFraction)
    );
  }

  // Internal

function getActionSummary(bytes memory action, address target) public view returns (ActionSummary memory) {
    bytes[] memory actions;

    if (getSig(action) == MULTICALL) {
      actions = abi.decode(extractCalldata(action), (bytes[]));
    } else {
      actions = new bytes[](1); actions[0] = action;
    }

    ActionSummary memory summary;
    bytes4 sig;
    uint256 expenditureId;
    uint256 domainSkillId;

    for (uint256 i; i < actions.length; i++) {
      sig = getSig(actions[i]);

      if (sig == NO_ACTION || sig == OLD_MOVE_FUNDS) {
        // If any of the actions are NO_ACTION or OLD_MOVE_FUNDS, the entire multicall is such and we break
        summary.sig = sig;
        break;
      } else if (isExpenditureSig(sig)) {
        // If it is an expenditure action, we record the expenditure and domain ids,
        //  and ensure they are consistent throughout the multicall.
        //  If not, we return UINT256_MAX which represents an invalid multicall
        summary.sig = sig;
        domainSkillId = getActionDomainSkillId(actions[i]);
        if (summary.domainSkillId > 0 && summary.domainSkillId != domainSkillId) {
          summary.domainSkillId = type(uint256).max; // Invalid multicall, caller should error
          break;
        } else {
          summary.domainSkillId = domainSkillId;
        }
        expenditureId = getExpenditureId(actions[i]);
        if (summary.expenditureId > 0 && summary.expenditureId != expenditureId) {
          summary.expenditureId = type(uint256).max; // Invalid multicall, caller should error
          break;
        } else {
          summary.expenditureId = expenditureId;
        }
      } else {
        // Otherwise we record the domain id and ensure it is consistent throughout the multicall
        // If no expenditure signatures have been seen, we record the latest signature
        if (ColonyRoles(target).getCapabilityRoles(sig) | ROOT_ROLES == ROOT_ROLES) {
          domainSkillId = colony.getDomain(1).skillId;
        } else {
          domainSkillId = getActionDomainSkillId(actions[i]);
        }
        if (summary.domainSkillId > 0 && summary.domainSkillId != domainSkillId) {
          summary.domainSkillId = type(uint256).max; // Invalid multicall, caller should errorl
          break;
        } else {
          summary.domainSkillId = domainSkillId;
        }
        if (!isExpenditureSig(summary.sig)) {
          summary.sig = sig;
        }
      }
    }

    return summary;
  }

  function getActionDomainSkillId(bytes memory _action) internal view returns (uint256) {
    uint256 permissionDomainId;
    uint256 childSkillIndex;

    assembly {
      permissionDomainId := mload(add(_action, 0x24))
      childSkillIndex := mload(add(_action, 0x44))
    }

    uint256 permissionSkillId = colony.getDomain(permissionDomainId).skillId;
    return colonyNetwork.getChildSkillId(permissionSkillId, childSkillIndex);
  }

  function unlockExpenditure(uint256 _motionId) internal returns (uint256) {
    Motion storage motion = motions[_motionId];
    bytes memory action = getExpenditureAction(motion.action);
    uint256 expenditureId = getExpenditureId(action);

    if (motion.sig == bytes4(0)) { // Backwards compatibility for versions 9 and below
      bytes32 structHash = getExpenditureStructHash(action);
      expenditureMotionCounts_DEPRECATED[structHash]--;

      // Release the claimDelay if this is the last active motion
      if (expenditureMotionCounts_DEPRECATED[structHash] == 0) {
      bytes memory claimDelayAction = createExpenditureAction(action, GLOBAL_CLAIM_DELAY_OFFSET, 0);
        // No require this time, since we don't want stakes to be permanently locked
        executeCall(_motionId, claimDelayAction);
      }
    } else { // New functionality for versions 10 and above
      assert(expenditureMotionLocks[expenditureId] == _motionId);
      delete expenditureMotionLocks[expenditureId];

      ColonyDataTypes.Expenditure memory expenditure = colony.getExpenditure(expenditureId);
      uint256 sinceFinalized = (expenditure.status == ColonyDataTypes.ExpenditureStatus.Finalized) ?
        (block.timestamp - expenditure.finalizedTimestamp) :
        0;

      bytes memory claimDelayAction = createExpenditureAction(action, GLOBAL_CLAIM_DELAY_OFFSET, expenditure.globalClaimDelay - LOCK_DELAY + sinceFinalized);
      // No require this time, since we don't want stakes to be permanently locked
      executeCall(_motionId, claimDelayAction);
    }

    return expenditureId;
  }

  function getExpenditureStructHash(bytes memory _action) internal view returns (bytes32 structHash) {
    bytes4 sig = getSig(_action);
    uint256 expenditureId;
    uint256 storageSlot;
    uint256 expenditureSlot; // This value is only used if storageSlot == 26

    assembly {
      expenditureId := mload(add(_action, 0x64))
      storageSlot := mload(add(_action, 0x84))
    }

    if (sig == SET_EXPENDITURE_STATE && storageSlot == 25) {
      structHash = keccak256(abi.encodePacked(expenditureId));
    } else {
      uint256 expenditureSlotLoc = (sig == SET_EXPENDITURE_STATE) ? 0x184 : 0x84;
      assembly {
        expenditureSlot := mload(add(_action, expenditureSlotLoc))
      }
      structHash = keccak256(abi.encodePacked(expenditureId, expenditureSlot));
    }
  }
}
