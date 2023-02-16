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

pragma solidity 0.8.18;
pragma experimental ABIEncoderV2;

import "./../../colonyNetwork/IColonyNetwork.sol";
import "./../../colony/IColony.sol";
import "./../../tokenLocking/ITokenLocking.sol";
import "./../../../lib/dappsys/math.sol";
import "./../../../lib/dappsys/auth.sol";
import "./VotingReputationDataTypes.sol";

contract VotingReputationMisalignedRecovery is DSMath, DSAuth, VotingReputationDataTypes {

  // THIS FILE IS DELIBERATELY WRONG. IF YOU'RE EDITING THIS FILE, AND YOU'VE NOT BEEN EXPLICITLY
  // TOLD TO DO SO, LEAVE NOW. THERE BE DRAGONS HERE.

  // Constants
  uint256 constant UINT128_MAX = 2**128 - 1;

  uint256 constant NAY = 0;
  uint256 constant YAY = 1;

  address resolver; // Align storage with EtherRouter

  IColony colony;
  bool DO_NOT_USE_deprecated;

  ExtensionState DO_NOT_USE_state;

  IColonyNetwork colonyNetwork;
  ITokenLocking tokenLocking;
  address token;
  uint256 totalStakeFraction;
  uint256 DO_NOT_USE_voterRewardFraction;
  uint256 DO_NOT_USE_userMinStakeFraction;
  uint256 DO_NOT_USE_maxVoteFraction;
  uint256 DO_NOT_USE_stakePeriod;
  uint256 DO_NOT_USE_submitPeriod;
  uint256 DO_NOT_USE_revealPeriod;
  uint256 DO_NOT_USE_escalationPeriod;

  // Here we deliberately recreate the misalignment in the storage slots, so solidity can correctly
  // find the incorrect data in the mappings.
  mapping(address => uint256) DO_NOT_USE_metatransactionNonces;

  uint256 DO_NOT_USE_motionCount;
  mapping (uint256 => Motion) motions;
  mapping (uint256 => mapping (address => mapping (uint256 => uint256))) stakes;
  mapping (uint256 => mapping (address => bytes32)) DO_NOT_USE_voteSecrets;

  mapping (bytes32 => uint256) DO_NOT_USE_expenditurePastVotes;
  mapping (bytes32 => uint256) DO_NOT_USE_expenditureMotionCounts;

  // Public functions (interface)

  /// @notice Claim the staker's reward
  /// @param _motionId The id of the motion
  /// @param _permissionDomainId The domain where the extension has the arbitration permission
  /// @param _childSkillIndex For the domain in which the motion is occurring
  /// @param _staker The staker whose reward is being claimed
  /// @param _vote The side being supported (0 = NAY, 1 = YAY)
  function claimMisalignedReward(
    uint256 _motionId,
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _staker,
    uint256 _vote
  )
    public
  {
    Motion storage motion = motions[_motionId];
    // Motions might have been in any point in their lifecycle, so we lose our restirction
    // on only being able to call this function on finalized/failed motions. These motions
    // created while misaligned no longer exist, and cannot proceed through their lifecycle.
    // require(
    //   getMotionState(_motionId) == MotionState.Finalized ||
    //   getMotionState(_motionId) == MotionState.Failed,
    //   "voting-rep-motion-not-claimable"
    // );

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

  /// @notice Get the staker reward
  /// @param _motionId The id of the motion
  /// @param _staker The staker's address
  /// @param _vote The vote (0 = NAY, 1 = YAY)
  /// @return The staker reward and the reputation penalty (if any)
  function getStakerReward(uint256 _motionId, address _staker, uint256 _vote) internal view returns (uint256, uint256) {
    Motion storage motion = motions[_motionId];

    uint256 totalSideStake = add(motion.stakes[_vote], motion.pastVoterComp[_vote]);
    if (totalSideStake == 0) { return (0, 0); }

    uint256 stakeFraction = wdiv(stakes[_motionId][_staker][_vote], totalSideStake);

    uint256 realStake = wmul(stakeFraction, motion.stakes[_vote]);

    uint256 stakerReward;
    uint256 repPenalty;

    // If finalized and went to a vote, use vote to determine reward or penalty
    if (motion.finalized && add(motion.votes[NAY], motion.votes[YAY]) > 0) {

      uint256 loserStake;
      uint256 winnerStake;
      if (motion.votes[YAY] > motion.votes[NAY]){
        loserStake = motion.stakes[NAY];
        winnerStake = motion.stakes[YAY];
      } else {
        loserStake = motion.stakes[YAY];
        winnerStake = motion.stakes[NAY];
      }

      loserStake = sub(loserStake, motion.paidVoterComp);
      uint256 totalVotes = add(motion.votes[NAY], motion.votes[YAY]);
      uint256 winFraction = wdiv(motion.votes[_vote], totalVotes);
      uint256 winShare = wmul(winFraction, 2 * WAD); // On a scale of 0-2 WAD

      if (winShare > WAD || (winShare == WAD && _vote == NAY)) {
        // 50% gets 0% of loser's stake, 100% gets 100% of loser's stake, linear in between
        stakerReward = wmul(stakeFraction, add(winnerStake, wmul(loserStake, winShare - WAD)));
      } else {
        stakerReward = wmul(stakeFraction, wmul(loserStake, winShare));
        repPenalty = sub(realStake, stakerReward);
      }

    // Else if finalized, rewards based on stakes alone
    } else if (motion.finalized) {
      assert(motion.paidVoterComp == 0);
      uint256 requiredStake = getRequiredStake(_motionId);

      // Your side fully staked, receive 10% (proportional) of loser's stake
      if (
        motion.stakes[_vote] == requiredStake &&
        motion.stakes[flip(_vote)] < requiredStake
      ) {

        uint256 loserStake = motion.stakes[flip(_vote)];
        uint256 totalPenalty = wmul(loserStake, WAD / 10);
        stakerReward = wmul(stakeFraction, add(requiredStake, totalPenalty));

      // Opponent's side fully staked, pay 10% penalty
      } else if (
        motion.stakes[_vote] < requiredStake &&
        motion.stakes[flip(_vote)] == requiredStake
      ) {

        uint256 loserStake = motion.stakes[_vote];
        uint256 totalPenalty = wmul(loserStake, WAD / 10);
        stakerReward = wmul(stakeFraction, sub(loserStake, totalPenalty));
        repPenalty = sub(realStake, stakerReward);

      // Neither side fully staked (or no votes were revealed), no reward or penalty
      } else {

        stakerReward = realStake;

      }
    } else {
      // Motion was never finalized. We just return stakes, exactly as if neither
      // side fully staked or no votes were revealed.
      stakerReward = realStake;
    }

    return (stakerReward, repPenalty);
  }

  function getRequiredStake(uint256 _motionId) internal view returns (uint256) {
    return wmul(motions[_motionId].skillRep, totalStakeFraction);
  }

  function flip(uint256 _vote) internal pure returns (uint256) {
    return sub(1, _vote);
  }
}
