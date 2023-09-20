// SPDX-License-Identifier: GPL-3.0-or-later
/*
  This file is part of The Colony Network.

  The Colony Network is free software: you can redistribute it and/or modify
  it under the terms of the GNU General external License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  The Colony Network is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General external License for more details.

  You should have received a copy of the GNU General external License
  along with The Colony Network. If not, see <http://www.gnu.org/licenses/>.
*/

pragma solidity 0.8.21;
pragma experimental ABIEncoderV2;

import { IBasicMetaTransaction } from "./../../common/IBasicMetaTransaction.sol";
import { IColonyExtension } from "./../IColonyExtension.sol";
import { VotingReputationDataTypes } from "./VotingReputationDataTypes.sol";

interface IVotingReputation is IColonyExtension, VotingReputationDataTypes {
  /// @notice Initialise the extension
  /// @param _totalStakeFraction The fraction of the domain's reputation we need to stake
  /// @param _voterRewardFraction The fraction of the total stake paid out to voters as rewards
  /// @param _userMinStakeFraction The minimum per-user stake as fraction of total stake
  /// @param _maxVoteFraction The fraction of the domain's reputation which must submit for quick-end
  /// @param _stakePeriod The length of the staking period in seconds
  /// @param _submitPeriod The length of the submit period in seconds
  /// @param _revealPeriod The length of the reveal period in seconds
  /// @param _escalationPeriod The length of the escalation period in seconds
  function initialise(
    uint256 _totalStakeFraction,
    uint256 _voterRewardFraction,
    uint256 _userMinStakeFraction,
    uint256 _maxVoteFraction,
    uint256 _stakePeriod,
    uint256 _submitPeriod,
    uint256 _revealPeriod,
    uint256 _escalationPeriod
  ) external;

  // external functions (interface)

  /// @notice Create a motion
  /// @param _domainId The domain where we vote on the motion
  /// @param _childSkillIndex The childSkillIndex pointing to the domain of the action
  /// @param _altTarget The contract to which we send the action (0x0 for the colony)
  /// @param _action A bytes array encoding a function call
  /// @param _key Reputation tree key for the root domain
  /// @param _value Reputation tree value for the root domain
  /// @param _branchMask The branchmask of the proof
  /// @param _siblings The siblings of the proof
  function createMotion(
    uint256 _domainId,
    uint256 _childSkillIndex,
    address _altTarget,
    bytes memory _action,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  ) external;

  /// @notice Stake on a motion
  /// @param _motionId The id of the motion
  /// @param _permissionDomainId The domain where the extension has the arbitration permission
  /// @param _childSkillIndex For the domain in which the motion is occurring
  /// @param _vote The side being supported (0 = NAY, 1 = YAY)
  /// @param _amount The amount of tokens being staked
  /// @param _key Reputation tree key for the staker/domain
  /// @param _value Reputation tree value for the staker/domain
  /// @param _branchMask The branchmask of the proof
  /// @param _siblings The siblings of the proof
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
  ) external;

  /// @notice Submit a vote secret for a motion
  /// @param _motionId The id of the motion
  /// @param _voteSecret The hashed vote secret
  /// @param _key Reputation tree key for the staker/domain
  /// @param _value Reputation tree value for the staker/domain
  /// @param _branchMask The branchmask of the proof
  /// @param _siblings The siblings of the proof
  function submitVote(
    uint256 _motionId,
    bytes32 _voteSecret,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  ) external;

  /// @notice Reveal a vote secret for a motion
  /// @param _motionId The id of the motion
  /// @param _salt The salt used to hash the vote
  /// @param _vote The side being supported (0 = NAY, 1 = YAY)
  /// @param _key Reputation tree key for the staker/domain
  /// @param _value Reputation tree value for the staker/domain
  /// @param _branchMask The branchmask of the proof
  /// @param _siblings The siblings of the proof
  function revealVote(
    uint256 _motionId,
    bytes32 _salt,
    uint256 _vote,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  ) external;

  /// @notice Escalate a motion to a higher domain
  /// @param _motionId The id of the motion
  /// @param _newDomainId The desired domain of escalation
  /// @param _childSkillIndex For the current domain, relative to the escalated domain
  /// @param _key Reputation tree key for the new domain
  /// @param _value Reputation tree value for the new domain
  /// @param _branchMask The branchmask of the proof
  /// @param _siblings The siblings of the proof
  function escalateMotion(
    uint256 _motionId,
    uint256 _newDomainId,
    uint256 _childSkillIndex,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  ) external;

  /// @notice Finalized a motion, executing its action if appropriate
  /// @param _motionId The id of the motion to finalize
  function finalizeMotion(uint256 _motionId) external;

  /// @notice Return whether a motion, assuming it's in the finalizable state,
  /// is allowed to finalize without the call executing successfully.
  /// @param _motionId The id of the motion
  /// @dev We are only expecting this to be called from finalize motion in the contracts.
  /// It is marked as external only so that the frontend can use it.
  /// @return _allowed If motion is allowed to finalize without successful action
  function failingExecutionAllowed(
    uint256 _motionId
  ) external view returns (bool _allowed);

  /// @notice Claim the staker's reward
  /// @param _motionId The id of the motion
  /// @param _permissionDomainId The domain where the extension has the arbitration permission
  /// @param _childSkillIndex For the domain in which the motion is occurring
  /// @param _staker The staker whose reward is being claimed
  /// @param _vote The side being supported (0 = NAY, 1 = YAY)
  function claimReward(
    uint256 _motionId,
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _staker,
    uint256 _vote
  ) external;

  // external view functions

  /// @notice Get the total stake fraction
  /// @return _fraction The total stake fraction
  function getTotalStakeFraction() external view returns (uint256 _fraction);

  /// @notice Get the voter reward fraction
  /// @return _fraction The voter reward fraction
  function getVoterRewardFraction() external view returns (uint256 _fraction);

  /// @notice Get the user min stake fraction
  /// @return _fraction The user min stake fraction
  function getUserMinStakeFraction() external view returns (uint256 _fraction);

  /// @notice Get the max vote fraction
  /// @return _fraction The max vote fraction
  function getMaxVoteFraction() external view returns (uint256 _fraction);

  /// @notice Get the stake period
  /// @return _period The stake period
  function getStakePeriod() external view returns (uint256 _period);

  /// @notice Get the submit period
  /// @return _period The submit period
  function getSubmitPeriod() external view returns (uint256 _period);

  /// @notice Get the reveal period
  /// @return _period The reveal period
  function getRevealPeriod() external view returns (uint256 _period);

  /// @notice Get the escalation period
  /// @return _period The escalation period
  function getEscalationPeriod() external view returns (uint256 _period);

  /// @notice Get the total motion count
  /// @return _count The total motion count
  function getMotionCount() external view returns (uint256 _count);

  /// @notice Get the data for a single motion
  /// @param _motionId The id of the motion
  /// @return _motion The motion struct
  function getMotion(
    uint256 _motionId
  ) external view returns (Motion memory _motion);

  /// @notice Get a user's stake on a motion
  /// @param _motionId The id of the motion
  /// @param _staker The staker address
  /// @param _vote The side being supported (0 = NAY, 1 = YAY)
  /// @return _stake The user's stake
  function getStake(
    uint256 _motionId,
    address _staker,
    uint256 _vote
  ) external view returns (uint256 _stake);

  /// @notice DEPRECATED Get the count of active motions for an expenditure slot
  /// @param _structHash Hash of an expenditure id and slot
  /// @return _count Number of motions
  function getExpenditureMotionCount(
    bytes32 _structHash
  ) external view returns (uint256 _count);

  /// @notice Get the motion which holds the lock on an expenditure
  /// @param _expenditureId The expenditureId
  /// @return _motionId The motion holding the lock
  function getExpenditureMotionLock(
    uint256 _expenditureId
  ) external view returns (uint256 _motionId);

  /// @notice Get the largest past vote on an expenditure
  /// @dev The previous version of this function which took an actionHash has been deprecated
  /// @param _expenditureId The expenditureId
  /// @return _vote The largest past vote on this variable
  function getExpenditurePastVote(
    uint256 _expenditureId
  ) external view returns (uint256 _vote);

  /// @notice DEPRECATED Get the largest past vote on an expenditure
  /// @dev This is deprecated, and allows visibility on to this variable for any v9 motions that are still
  /// ongoing.
  /// @param _slotSignature The slot signature
  /// @return _vote The largest past vote on this variable
  function getExpenditurePastVotes_DEPRECATED(
    bytes32 _slotSignature
  ) external view returns (uint256 _vote);

  /// @notice Get the current state of the motion
  /// @param _motionId The id of the motion
  /// @return _motionState The current motion state
  function getMotionState(
    uint256 _motionId
  ) external view returns (MotionState _motionState);

  /// @notice Get the voter reward
  /// @dev This function will only return an accurate value if in the reveal state. Otherwise, use getVoterRewardRange
  /// @param _motionId The id of the motion
  /// @param _voterRep The reputation the voter has in the domain
  /// @return _reward The voter reward
  function getVoterReward(
    uint256 _motionId,
    uint256 _voterRep
  ) external view returns (uint256 _reward);

  /// @notice Get the range of potential rewards for a voter on a specific motion, intended to be
  /// used when the motion is in the reveal state.
  /// Once a motion is in the reveal state and the reward is known, getVoterReward should be used.
  /// @param _motionId The id of the motion
  /// @param _voterRep The reputation the voter has in the domain
  /// @param _voterAddress The address the user will be voting as
  /// @return _rewardMin The voter reward range lower bound
  /// @return _rewardMax The voter reward range upper bound
  function getVoterRewardRange(
    uint256 _motionId,
    uint256 _voterRep,
    address _voterAddress
  ) external view returns (uint256 _rewardMin, uint256 _rewardMax);

  /// @notice Return a summary of the multicall action
  /// @param _action The id of the motion
  /// @param _altTarget The address of the altTarget, or 0x0 if none exists
  /// @return _summary A summary of the multicall
  function getActionSummary(
    bytes memory _action,
    address _altTarget
  ) external view returns (ActionSummary memory _summary);

  /// @notice Get the staker reward
  /// @param _motionId The id of the motion
  /// @param _staker The staker's address
  /// @param _vote The vote (0 = NAY, 1 = YAY)
  /// @return _reward The staker reward (if any)
  /// @return _penalty The reputation penalty (if any)
  function getStakerReward(
    uint256 _motionId,
    address _staker,
    uint256 _vote
  ) external view returns (uint256 _reward, uint256 _penalty);

  /// @notice Claim the staker's reward from a motion that was created with v4 of the extension, and is
  /// now missing and cannot be interacted with via the normal claim function.
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
  ) external;
}
