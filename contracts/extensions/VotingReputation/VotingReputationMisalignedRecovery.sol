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

pragma solidity 0.7.3;
pragma experimental ABIEncoderV2;

import "./../../colonyNetwork/IColonyNetwork.sol";
import "./../../colony/ColonyRoles.sol";
import "./../../common/BasicMetaTransaction.sol";
import "./../../common/ERC20Extended.sol";
import "./../../patriciaTree/PatriciaTreeProofs.sol";
import "./../../tokenLocking/ITokenLocking.sol";
import "./../ColonyExtension.sol";
import "./../../../lib/dappsys/math.sol";
import "./VotingReputationDataTypes.sol";

contract VotingReputationMisalignedRecovery is PatriciaTreeProofs, DSMath, DSAuth, VotingReputationDataTypes {

  // THIS FILE IS DELIBERATELY WRONG. IF YOU'RE EDITING THIS FILE, AND YOU'VE NOT BEEN EXPLICITLY
  // TOLD TO DO SO, LEAVE NOW. THERE BE DRAGONS HERE.

  // Constants
  uint256 constant UINT128_MAX = 2**128 - 1;

  uint256 constant NAY = 0;
  uint256 constant YAY = 1;

  address resolver; // Align storage with EtherRouter

  IColony colony;
  bool deprecated;

  ExtensionState state;

  IColonyNetwork colonyNetwork;
  ITokenLocking tokenLocking;
  address token;

  // All `Fraction` variables are stored as WADs i.e. fixed-point numbers with 18 digits after the radix. So
  // 1 WAD = 10**18, which is interpreted as 1.

  uint256 totalStakeFraction; // Fraction of the domain's reputation needed to stake on each side in order to go to a motion.
  // This can be set to a maximum of 0.5.
  uint256 voterRewardFraction; // Fraction of staked tokens paid out to voters as rewards. This will be paid from the staked
  // tokens of the losing side. This can be set to a maximum of 0.5.

  uint256 userMinStakeFraction; // Minimum stake as fraction of required stake. 1 means a single user will be required to
  // provide the whole stake on each side, which may not be possible depending on totalStakeFraction and the distribution of
  // reputation in a domain.
  uint256 maxVoteFraction; // Fraction of total domain reputation that needs to commit votes before closing to further votes.
  // Setting this to anything other than 1 will mean it is likely not all those eligible to vote will be able to do so.

  // All `Period` variables are second-denominated

  uint256 stakePeriod; // Length of time for staking
  uint256 submitPeriod; // Length of time for submitting votes
  uint256 revealPeriod; // Length of time for revealing votes
  uint256 escalationPeriod; // Length of time for escalating after a vote

  // Here we deliberately recreate the misalignment in the storage slots, so solidity can correctly
  // find the incorrect data in the mappings.
  mapping(address => uint256) metatransactionNonces;

  uint256 motionCount;
  mapping (uint256 => Motion) motions;
  mapping (uint256 => mapping (address => mapping (uint256 => uint256))) stakes;
  mapping (uint256 => mapping (address => bytes32)) voteSecrets;

  mapping (bytes32 => uint256) expenditurePastVotes; // expenditure slot signature => voting power
  mapping (bytes32 => uint256) expenditureMotionCounts; // expenditure struct signature => count

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
