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

import "./VotingReputationStorage.sol";

contract VotingReputationStaking is VotingReputationStorage {

  // Public

  function stakeMotion(
    uint256 _motionId,
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _vote,
    uint256 _amount,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    Motion storage motion = motions[_motionId];

    require(_vote <= 1, "voting-rep-bad-vote");
    require(getMotionState(_motionId) == MotionState.Staking, "voting-rep-motion-not-staking");

    uint256 requiredStake = getRequiredStake(_motionId);
    uint256 amount = min(_amount, requiredStake - motion.stakes[_vote]);
    require(amount > 0, "voting-rep-bad-amount");

    uint256 stakerTotalAmount = stakes[_motionId][msgSender()][_vote] + amount;

    // For v9 expenditure motions, only allow counterstaking unless escalated
    if (
      _motionId <= motionCountV10 &&
      isExpenditureSig(getActionSummary(motion.action, motion.altTarget).sig)
    ) {
      require(
        motion.stakes[YAY] == requiredStake ||
        motion.stakes[NAY] == requiredStake ||
        motion.escalated,
        "voting-rep-invalid-stake"
      );
    }

    require(
      stakerTotalAmount <= checkReputation(motion.rootHash, motion.skillId, msgSender(), _key, _value, _branchMask, _siblings),
      "voting-rep-insufficient-rep"
    );
    require(
      stakerTotalAmount >= wmul(requiredStake, userMinStakeFraction) ||
      (motion.stakes[_vote] + amount) == requiredStake, // To prevent a residual stake from being un-stakable
      "voting-rep-insufficient-stake"
    );

    // Update the stake
    motion.stakes[_vote] += amount;
    stakes[_motionId][msgSender()][_vote] = stakerTotalAmount;

    emit MotionStaked(_motionId, msgSender(), _vote, amount);

    // Increment counter & extend claim delay if staking for an expenditure state change
    // Note: if the expenditure is already locked, this is a no-op and motion is automatically finalized
    bool finalized;
    if (
      _vote == YAY &&
      !motion.escalated &&
      motion.stakes[YAY] == requiredStake &&
      motion.altTarget == address(0x0) &&
      isExpenditureSig(motion.sig)
    ) {
      finalized = lockExpenditure(_motionId);
    }

    if (!finalized) {
      // Move to vote submission once both sides are fully staked
      if (motion.stakes[NAY] == requiredStake && motion.stakes[YAY] == requiredStake) {
        motion.events[STAKE_END] = uint64(block.timestamp);
        motion.events[SUBMIT_END] = motion.events[STAKE_END] + uint64(submitPeriod);
        motion.events[REVEAL_END] = motion.events[SUBMIT_END] + uint64(revealPeriod);

        emit MotionEventSet(_motionId, STAKE_END);

      // Move to second staking window once one side is fully staked
      } else if (
        (_vote == NAY && motion.stakes[NAY] == requiredStake) ||
        (_vote == YAY && motion.stakes[YAY] == requiredStake)
      ) {
        motion.events[STAKE_END] = uint64(block.timestamp + stakePeriod);

        // New stake supersedes prior votes
        delete motion.votes;
        delete motion.repSubmitted;

        emit MotionEventSet(_motionId, STAKE_END);
      }
    }

    // Do the external bookkeeping
    tokenLocking.deposit(token, 0, true); // Faux deposit to clear any locks
    colony.obligateStake(msgSender(), motion.domainId, amount);
    colony.transferStake(_permissionDomainId, _childSkillIndex, address(this), msgSender(), motion.domainId, amount, address(this));
  }

  function claimReward(
    uint256 _motionId,
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _staker,
    uint256 _vote
  )
    public
  {
    Motion storage motion = motions[_motionId];
    require(
      getMotionState(_motionId) == MotionState.Finalized ||
      getMotionState(_motionId) == MotionState.Failed,
      "voting-rep-motion-not-claimable"
    );

    (uint256 stakerReward, uint256 repPenalty) = getStakerReward(_motionId, _staker, _vote);

    require(stakes[_motionId][_staker][_vote] > 0, "voting-rep-nothing-to-claim");
    delete stakes[_motionId][_staker][_vote];

    tokenLocking.transfer(token, stakerReward, _staker, true);

    if (repPenalty > 0) {
      colony.emitDomainReputationPenalty(
        _permissionDomainId,
        _childSkillIndex,
        motion.domainId,
        _staker,
        -int256(repPenalty)
      );
    }

    emit MotionRewardClaimed(_motionId, _staker, _vote, stakerReward);
  }

  function getStakerReward(uint256 _motionId, address _staker, uint256 _vote) public view returns (uint256 _reward, uint256 _penalty) {
    Motion storage motion = motions[_motionId];

    uint256 totalSideStake = motion.stakes[_vote] + motion.pastVoterComp[_vote];
    if (totalSideStake == 0) { return (0, 0); }

    uint256 stakeFraction = wdiv(stakes[_motionId][_staker][_vote], totalSideStake);

    uint256 realStake = wmul(stakeFraction, motion.stakes[_vote]);

    uint256 stakerReward;
    uint256 repPenalty;

    // Went to a vote, use vote to determine reward or penalty
    if ((motion.votes[NAY] + motion.votes[YAY]) > 0) {

      uint256 loserStake;
      uint256 winnerStake;
      if (motion.votes[YAY] > motion.votes[NAY]){
        loserStake = motion.stakes[NAY];
        winnerStake = motion.stakes[YAY];
      } else {
        loserStake = motion.stakes[YAY];
        winnerStake = motion.stakes[NAY];
      }

      loserStake -= motion.paidVoterComp;
      uint256 totalVotes = motion.votes[NAY] + motion.votes[YAY];
      uint256 winFraction = wdiv(motion.votes[_vote], totalVotes);
      uint256 winShare = wmul(winFraction, 2 * WAD); // On a scale of 0-2 WAD

      if (winShare > WAD || (winShare == WAD && _vote == NAY)) {
        // 50% gets 0% of loser's stake, 100% gets 100% of loser's stake, linear in between
        stakerReward = wmul(stakeFraction, (winnerStake + wmul(loserStake, winShare - WAD)));
      } else {
        stakerReward = wmul(stakeFraction, wmul(loserStake, winShare));
        repPenalty = realStake - stakerReward;
      }

    // Determine rewards based on stakes alone
    } else {
      assert(motion.paidVoterComp == 0);
      uint256 requiredStake = getRequiredStake(_motionId);

      // Your side fully staked, receive 10% (proportional) of loser's stake
      if (
        motion.stakes[_vote] == requiredStake &&
        motion.stakes[flip(_vote)] < requiredStake
      ) {

        uint256 loserStake = motion.stakes[flip(_vote)];
        uint256 totalPenalty = wmul(loserStake, WAD / 10);
        stakerReward = wmul(stakeFraction, (requiredStake + totalPenalty));

      // Opponent's side fully staked, pay 10% penalty
      } else if (
        motion.stakes[_vote] < requiredStake &&
        motion.stakes[flip(_vote)] == requiredStake
      ) {

        uint256 loserStake = motion.stakes[_vote];
        uint256 totalPenalty = wmul(loserStake, WAD / 10);
        stakerReward = wmul(stakeFraction, loserStake - totalPenalty);
        repPenalty = realStake - stakerReward;

      // Neither side fully staked (or no votes were revealed), no reward or penalty
      } else {

        stakerReward = realStake;

      }
    }

    return (stakerReward, repPenalty);
  }

  // Internal

  function lockExpenditure(uint256 _motionId) internal returns (bool finalized) {
    Motion storage motion = motions[_motionId];
    bytes memory action = getExpenditureAction(motion.action);
    uint256 expenditureId = getExpenditureId(action);

    // If the expenditure is already locked, this motion is a no-op
    if (expenditureMotionLocks[expenditureId] == 0) {
      expenditureMotionLocks[expenditureId] = _motionId;
      uint256 currentClaimDelay = colony.getExpenditure(expenditureId).globalClaimDelay;
      bytes memory claimDelayAction = createGlobalClaimDelayAction(action, currentClaimDelay + LOCK_DELAY);
      require(executeCall(_motionId, claimDelayAction), "voting-rep-expenditure-lock-failed");
    } else {
      finalized = true;
      motion.finalized = true;
      motion.events[STAKE_END] = uint64(block.timestamp);

      emit MotionEventSet(_motionId, STAKE_END);
      emit MotionFinalized(_motionId, motion.action, false);
    }
  }
}
